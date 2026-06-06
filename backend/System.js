/* =========================
 * System.gs
 * ========================= */

function now_() {
  return new Date();
}

// =========================
// LOGGING HELPERS
// =========================
// logAction_ được khai báo ở Core.js, không cần lặp lại

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
  appendRowsBatch_(APP_CONFIG.QUEUE_SHEET, [
    [
      generateId_("job"),
      type,
      JSON.stringify(payload),
      "PENDING",
      "",
      toIsoString_(new Date()),
    ],
  ]);
}

/**
 * Process pending jobs (chạy theo schedule)
 */
function processQueue_() {
  const rows = getSheetData_(APP_CONFIG.QUEUE_SHEET, false);
  let processed = 0;
  const updatedRows = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const status = trimSafe_(row[3]);

    if (status !== "PENDING") continue;

    const jobType = trimSafe_(row[1]);
    const payload = parseJsonSafe_(row[2]);

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
      row[3] = "COMPLETED";
      processed++;
    } catch (err) {
      row[3] = "FAILED";
      row[4] = err.message; // Add error message
      logSystemError_({ type: "JOB_FAILED", jobType, error: err.message });
    }

    updatedRows.push({
      rowIndex: i + 1,
      values: row,
    });
  }

  // ✓ Write back updated rows
  if (updatedRows.length > 0) {
    for (let i = 0; i < updatedRows.length; i++) {
      batchWriteRows_(APP_CONFIG.QUEUE_SHEET, updatedRows[i].rowIndex, 1, [
        updatedRows[i].values,
      ]);
    }
    invalidateSheetCache_(APP_CONFIG.QUEUE_SHEET);
  }

  return { processed, total: updatedRows.length };
}

// =========================
// ARCHIVE & MAINTENANCE
// =========================
function archiveClosedOrders_() {
  // Lấy các order đã close > 7 ngày
  const rows = getSheetData_(SHEET_NAME.ORDER, false);
  const cutoffTime = new Date();
  cutoffTime.setDate(cutoffTime.getDate() - 7);
  const cutoffIso = toIsoString_(cutoffTime);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const status = trimSafe_(row[SHEET_SCHEMA.ORDER.STATUS]);
    const createdAt = trimSafe_(row[SHEET_SCHEMA.ORDER.CREATED_AT]);

    if (status === "CLOSED" && createdAt < cutoffIso) {
      // Could archive to separate sheet or delete
      logAction_("ARCHIVE_ORDER", row[0], "system", { createdAt });
    }
  }
}

function repairOrderState_() {
  // Kiểm tra inconsistency trong data
  const orderRows = getSheetData_(SHEET_NAME.ORDER, false);
  const snapshotRows = getSheetData_(SHEET_NAME.ORDER_SNAPSHOT, false);

  const snapshotIds = new Set();
  for (let i = 1; i < snapshotRows.length; i++) {
    snapshotIds.add(trimSafe_(snapshotRows[i][0]));
  }

  for (let i = 1; i < orderRows.length; i++) {
    const orderId = trimSafe_(orderRows[i][0]);
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
/**
 * Chạy mỗi 5 phút - Check Gmail nếu Android notification miss
 * Setup: Apps Script → Trigger → Time-driven → Minutes timer → Every 5 minutes
 */
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
  getSheetData_(SHEET_NAME.PRODUCT);
  getSheetData_(SHEET_NAME.TABLE);
  getSheetData_(SHEET_NAME.ACCOUNT);
};

/**
 * Trigger hàng giờ (Schedule via Google Apps Script trigger)
 */
function hourlyMaintenance_() {
  warmupCache_();
  processQueue_();
  logAction_("MAINTENANCE", "SYSTEM", "system", {
    timestamp: toIsoString_(new Date()),
  });
}
