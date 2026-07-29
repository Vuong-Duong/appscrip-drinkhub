/* =========================
 * System.gs - Firestore
 * ========================= */

function now_() {
  return new Date();
}

// =========================
// LOGGING HELPERS
// =========================

function logPayment_(orderId, paymentInfo, account) {
  writeLog_("PAYMENT", "ORDER_" + orderId, account || "system", paymentInfo);
}

function logSystemError_(errorInfo) {
  writeLog_("ERROR", "SYSTEM", "system", errorInfo);
}

function logAudit_(action, target, account, details) {
  writeLog_(action, target, account, details);
}

// =========================
// QUEUE & JOB MANAGEMENT
// =========================
function enqueueJob_(type, payload) {
  const jobId = generateId_("job");
  firestoreSet_("system_queue", jobId, {
    id: jobId,
    type: type,
    payload: JSON.stringify(payload),
    status: "PENDING",
    error: "",
    createdAt: toIsoString_(new Date()),
  });
}

/**
 * Process pending jobs (chạy theo schedule)
 */
function processQueue_() {
  const docs = firestoreQuery_("system_queue", {
    filters: [{ field: "status", op: "EQUAL", value: "PENDING" }],
    limit: 50,
  });

  let processed = 0;
  const writes = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const jobType = trimSafe_(doc.type);

    try {
      switch (jobType) {
        case "ARCHIVE_ORDER":
          archiveClosedOrders_();
          break;
        case "REPAIR_STATE":
          repairOrderState_();
          break;
        default:
          logSystemError_({ type: "UNKNOWN_JOB", jobType });
          throw new Error("UNKNOWN_JOB: " + jobType);
      }

      writes.push({
        type: "update",
        collection: "system_queue",
        id: doc.id,
        data: {
          status: "COMPLETED",
          completedAt: toIsoString_(new Date()),
        },
      });
      processed++;
    } catch (err) {
      writes.push({
        type: "update",
        collection: "system_queue",
        id: doc.id,
        data: {
          status: "FAILED",
          error: err.message,
          failedAt: toIsoString_(new Date()),
        },
      });
      logSystemError_({ type: "JOB_FAILED", jobType, error: err.message });
    }
  }

  if (writes.length > 0) {
    firestoreBatchWrite_(writes);
  }

  return { processed, total: docs.length };
}

// =========================
// ARCHIVE & MAINTENANCE
// =========================
function archiveClosedOrders_() {
  // Lấy các order đã close > 7 ngày
  const docs = firestoreQuery_("orders", {
    filters: [{ field: "status", op: "EQUAL", value: "CLOSED" }],
    limit: 100,
  });

  const cutoffTime = new Date();
  cutoffTime.setDate(cutoffTime.getDate() - 7);
  const cutoffIso = toIsoString_(cutoffTime);

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const createdAt = trimSafe_(doc.createdAt);

    if (createdAt < cutoffIso) {
      logAction_("ARCHIVE_ORDER", doc.id, "system", { createdAt });
    }
  }
}

function repairOrderState_() {
  const orders = firestoreQuery_("orders", { limit: 100 });
  const snapshots = firestoreQuery_("order_snapshots", { limit: 100 });

  const snapshotIds = new Set(snapshots.map((s) => s.id));

  for (let i = 0; i < orders.length; i++) {
    const orderId = orders[i].id;
    if (!snapshotIds.has(orderId)) {
      logSystemError_({
        type: "MISSING_SNAPSHOT",
        orderId,
      });
    }
  }
}

// =========================
// GMAIL PAYMENT FALLBACK JOB
// =========================
function gmailPaymentFallbackJob() {
  try {
    checkGmailForPaymentFallback_();
    logAction_("GMAIL_FALLBACK_JOB", "SYSTEM", "system", {
      status: "completed",
      timestamp: toIsoString_(new Date()),
    });
  } catch (err) {
    logSystemError_({
      type: "GMAIL_FALLBACK_JOB_ERROR",
      error: err.message,
      stack: err.stack,
    });
  }
}

function checkGmailForPaymentFallback_() {
  return {
    processed: 0,
    skipped: true,
    reason: "GMAIL_FALLBACK_NOT_CONFIGURED",
  };
}

// =========================
// WARMUP & MAINTENANCE
// =========================
const warmupCache_ = () => {
  firestoreQuery_("products", { limit: 10 });
  firestoreQuery_("tables", { limit: 10 });
};

function hourlyMaintenance_() {
  warmupCache_();
  processQueue_();
  logAction_("MAINTENANCE", "SYSTEM", "system", {
    timestamp: toIsoString_(new Date()),
  });
}
