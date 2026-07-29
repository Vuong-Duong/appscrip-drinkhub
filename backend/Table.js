/* =========================
 * Table.gs - Quản lý Bàn & Nhân viên - Firestore
 * ========================= */

/**
 * Release bàn sau khi thanh toán thành công
 * Refactored to throw errors, return raw table data
 * ✓ Verify orderId matches before releasing
 */
const releaseTable = (tableId, orderId = null) => {
  // ✓ Use lock to prevent concurrent updates
  return withStockLock_(`table_${tableId}`, () => {
    const doc = firestoreGet_("tables", tableId);
    if (!doc) {
      throw new Error("TABLE_NOT_FOUND");
    }

    const currentOrderId = trimSafe_(doc.currentOrderId);
    const status = trimSafe_(doc.status);

    // ✓ Check if already available
    if (status === "AVAILABLE" || status === "available") {
      logAction_("RELEASE_TABLE_ALREADY_AVAILABLE", tableId, "system", {
        table: trimSafe_(doc.name),
      });
      // Already released, return table info
      const availableTable = {
        id: tableId,
        name: trimSafe_(doc.name),
        status: "AVAILABLE",
      };
      pushDeltaSafe_("TABLE", "RELEASE", availableTable);
      return availableTable;
    }

    // ✓ Verify orderId matches
    if (orderId && currentOrderId !== orderId) {
      throw new Error("ORDER_MISMATCH");
    }

    firestoreUpdate_("tables", tableId, {
      status: "AVAILABLE",
      currentOrderId: "",
      updatedAt: toIsoString_(new Date()),
    });

    logAction_("RELEASE_TABLE", tableId, "system", {
      table: trimSafe_(doc.name),
      previousOrderId: currentOrderId,
    });

    const releasedTable = {
      id: tableId,
      name: trimSafe_(doc.name),
      status: "AVAILABLE",
    };
    pushDeltaSafe_("TABLE", "RELEASE", releasedTable);
    return releasedTable;
  });
};

/**
 * Occupy bàn khi tạo order
 * ✓ Nếu bàn đã occupied cùng orderId → bỏ qua (idempotent)
 * ✓ Nếu bàn đã occupied khác orderId → cập nhật orderId mới (race condition / retry)
 * ✓ Use lock to prevent concurrent occupy
 */
const occupyTable = (tableId, orderId) => {
  // ✓ Use lock to prevent concurrent updates
  return withStockLock_(`table_${tableId}`, () => {
    const doc = firestoreGet_("tables", tableId);
    if (!doc) {
      throw new Error("TABLE_NOT_FOUND");
    }

    const status = trimSafe_(doc.status);
    const currentOrderId = trimSafe_(doc.currentOrderId);

    // Nếu bàn đã occupied cùng orderId → không cần ghi lại (idempotent)
    if ((status === "OCCUPIED" || status === "occupied") && currentOrderId === orderId) {
      return {
        id: tableId,
        name: trimSafe_(doc.name),
        status: "OCCUPIED",
        currentOrderId: orderId,
      };
    }

    firestoreUpdate_("tables", tableId, {
      status: "OCCUPIED",
      currentOrderId: orderId,
      updatedAt: toIsoString_(new Date()),
    });

    logAction_("OCCUPY_TABLE", tableId, "system", {
      orderId: orderId,
      table: trimSafe_(doc.name),
      previousOrderId: currentOrderId || null,
    });

    const occupiedTable = {
      id: tableId,
      name: trimSafe_(doc.name),
      status: "OCCUPIED",
      currentOrderId: orderId,
    };
    pushDeltaSafe_("TABLE", "OCCUPY", occupiedTable);
    return occupiedTable;
  });
};

/**
 * Get danh sách bàn - với filter tùy chọn
 * ✓ Consolidated getAvailableTables và getAllTables
 */
const getAllTables = (filterStatus = null) => {
  const docs = firestoreQuery_("tables");
  const tables = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    if (!doc.id) continue;
    const status = trimSafe_(doc.status);
    const currentOrderId = trimSafe_(doc.currentOrderId);

    // Apply filter if specified
    if (filterStatus && status !== filterStatus && status.toUpperCase() !== filterStatus.toUpperCase()) continue;

    tables.push({
      id: trimSafe_(doc.id),
      name: trimSafe_(doc.name),
      status: status,
      currentOrderId: currentOrderId,
    });
  }

  return tables;
};

/**
 * Get danh sách bàn trống (convenience function)
 */
const getAvailableTables = () => {
  return getAllTables("AVAILABLE");
};

/**
 * Tạo bàn mới
 * @param {Object} payload - { name: string, createdBy?: string }
 */
const createTable = (payload) => {
  const name = trimSafe_(payload.name || "");
  if (!name) throw new Error("MISSING_FIELDS: name");

  const tableId = generateId_("tbl");
  const now = toIsoString_(new Date());

  const newTableData = {
    id: tableId,
    name: name,
    status: "AVAILABLE",
    currentOrderId: "",
    createdAt: now,
    updatedAt: now,
  };

  firestoreSet_("tables", tableId, newTableData);

  const newTable = { id: tableId, name, status: "AVAILABLE", currentOrderId: "" };
  logAction_("CREATE_TABLE", tableId, payload.createdBy || "staff", { name });
  pushDeltaSafe_("TABLE", "CREATE", newTable);
  return newTable;
};
