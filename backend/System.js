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

// =========================
// SYSTEM PURGE & RESET (EXCLUDING PROTECTED COLLECTIONS)
// =========================

/**
 * Xóa toàn bộ document/data của các collection ngoại trừ 5 collection bảo vệ:
 * 1. accounts
 * 2. products
 * 3. store_info
 * 4. tables
 * 5. shifts
 * 
 * Toàn bộ document & subcollection của 5 collection trên được giữ nguyên 100%.
 *
 * @param {string} userRole - Quyền tài khoản (Chỉ Admin)
 * @returns {Object} { success, deletedCollections, failedCollections, totalDeletedDocuments }
 */
function purgeAllowedFirestoreCollections(userRole) {
  const role = String(userRole || "").toLowerCase().trim();
  if (role !== "admin") {
    throw new Error("PERMISSION_DENIED: Chỉ Admin mới có quyền thực hiện thao tác xóa dữ liệu hệ thống");
  }

  // 5 collection tuyệt đối KHÔNG ĐƯỢC XÓA
  const PROTECTED_COLLECTIONS = [
    "accounts",
    "products",
    "store_info",
    "tables",
    "shifts",
  ];

  // 1. Lấy danh sách collection động từ Firestore + mảng mặc định
  let fetchedCollections = [];
  try {
    fetchedCollections = firestoreListCollectionIds_();
  } catch (e) {
    console.warn("Failed to dynamically fetch collection list:", e);
  }

  const defaultDataCollections = [
    "orders",
    "order_snapshots",
    "payments",
    "discounts",
    "system_queue",
    "logs",
    "inventory_logs",
    "ingredients",
    "categories",
  ];

  const combinedCollections = Array.from(
    new Set([...fetchedCollections, ...defaultDataCollections])
  );

  // 2. Lọc bỏ các collection được bảo vệ
  const targetCollections = combinedCollections.filter((colName) => {
    const normalized = String(colName || "").toLowerCase().trim();
    return !PROTECTED_COLLECTIONS.includes(normalized);
  });

  const deletedCollections = [];
  const failedCollections = [];
  let totalDeletedDocuments = 0;

  // 3. Xử lý xóa siêu tốc từng collection
  for (let c = 0; c < targetCollections.length; c++) {
    const colName = targetCollections[c];
    try {
      // Lấy danh sách document (nếu lớn hơn 500 thì chia trang xử lý)
      const docs = firestoreQuery_(colName, { limit: 500 });
      if (!Array.isArray(docs) || docs.length === 0) {
        deletedCollections.push(colName);
        continue;
      }

      const deleteOperations = [];
      for (let i = 0; i < docs.length; i++) {
        const doc = docs[i];
        if (doc && doc.id) {
          deleteOperations.push({
            type: "delete",
            collection: colName,
            id: doc.id,
          });
        }
      }

      if (deleteOperations.length > 0) {
        const deletedCount = firestoreChunkedBatchDelete_(deleteOperations);
        totalDeletedDocuments += deletedCount;
      }
      
      deletedCollections.push(colName);

    } catch (err) {
      console.error(`Error purging collection ${colName}:`, err);
      failedCollections.push({
        collection: colName,
        error: err.message || String(err),
      });
      logSystemError_({
        type: "PURGE_COLLECTION_FAILED",
        collection: colName,
        error: err.message,
      });
    }
  }

  const result = {
    success: failedCollections.length === 0,
    deletedCollections: deletedCollections,
    failedCollections: failedCollections,
    totalDeletedDocuments: totalDeletedDocuments,
  };

  logAction_("PURGE_ALLOWED_COLLECTIONS", "SYSTEM", userRole || "admin", result);
  return result;
}

/**
 * Hàm Helper dành riêng cho Dev chạy trực tiếp từ Google Apps Script Editor
 */
function runPurgeDataDev() {
  console.log("=== BẮT ĐẦU CHẠY THAO TÁC XÓA DỮ LIỆU TỐI ƯU SIÊU TỐC ===");
  const result = purgeAllowedFirestoreCollections("admin");
  console.log("=== KẾT QUẢ THỰC THI ===");
  console.log(JSON.stringify(result, null, 2));
  return result;
}
