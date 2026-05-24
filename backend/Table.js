/* =========================
 * Table.gs - Quản lý Bàn & Nhân viên
 * ========================= */

/**
 * Release bàn sau khi thanh toán thành công
 * Refactored to throw errors, return raw table data
 * ✓ Verify orderId matches before releasing
 */
const releaseTable = (tableId, orderId = null) => {
  // ✓ Use lock to prevent concurrent updates
  return withStockLock_(`table_${tableId}`, () => {
    const tableRow = findRowById_(SHEET_NAME.TABLE, tableId);
    if (!tableRow) {
      throw new Error("TABLE_NOT_FOUND");
    }

    const row = tableRow.values;
    const currentOrderId = trimSafe_(row[SHEET_SCHEMA.TABLE.CURRENT_ORDER_ID]);
    const status = trimSafe_(row[SHEET_SCHEMA.TABLE.STATUS]);

    // ✓ Check if already available
    if (status === "AVAILABLE") {
      logAction_("RELEASE_TABLE_ALREADY_AVAILABLE", tableId, "system", {
        table: row[SHEET_SCHEMA.TABLE.NAME],
      });
      // Already released, return table info
      const availableTable = {
        id: tableId,
        name: trimSafe_(row[SHEET_SCHEMA.TABLE.NAME]),
        status: "AVAILABLE",
      };
      pushDeltaSafe_("TABLE", "RELEASE", availableTable);
      return availableTable;
    }

    // ✓ Verify orderId matches
    if (orderId && currentOrderId !== orderId) {
      throw new Error("ORDER_MISMATCH");
    }

    row[SHEET_SCHEMA.TABLE.STATUS] = "AVAILABLE"; // Trả bàn
    row[SHEET_SCHEMA.TABLE.CURRENT_ORDER_ID] = ""; // Xóa order hiện tại

    batchWriteRows_(SHEET_NAME.TABLE, tableRow.rowIndex, 1, [row]);

    logAction_("RELEASE_TABLE", tableId, "system", {
      table: row[SHEET_SCHEMA.TABLE.NAME],
      previousOrderId: currentOrderId,
    });

    const releasedTable = {
      id: tableId,
      name: trimSafe_(row[SHEET_SCHEMA.TABLE.NAME]),
      status: "AVAILABLE",
    };
    pushDeltaSafe_("TABLE", "RELEASE", releasedTable);
    return releasedTable;
  });
};

/**
 * Occupy bàn khi tạo order
 * Refactored to throw errors, return raw table data
 * ✓ Check if already occupied
 * ✓ Use lock to prevent concurrent occupy
 */
const occupyTable = (tableId, orderId) => {
  // ✓ Use lock to prevent concurrent updates
  return withStockLock_(`table_${tableId}`, () => {
    const tableRow = findRowById_(SHEET_NAME.TABLE, tableId);
    if (!tableRow) {
      throw new Error("TABLE_NOT_FOUND");
    }

    const row = tableRow.values;
    const status = trimSafe_(row[SHEET_SCHEMA.TABLE.STATUS]);
    const currentOrderId = trimSafe_(row[SHEET_SCHEMA.TABLE.CURRENT_ORDER_ID]);

    // ✓ Check if already occupied
    if (status === "OCCUPIED") {
      throw new Error("TABLE_ALREADY_OCCUPIED");
    }

    row[SHEET_SCHEMA.TABLE.STATUS] = "OCCUPIED"; // Đang sử dụng
    row[SHEET_SCHEMA.TABLE.CURRENT_ORDER_ID] = orderId;

    batchWriteRows_(SHEET_NAME.TABLE, tableRow.rowIndex, 1, [row]);

    logAction_("OCCUPY_TABLE", tableId, "system", {
      orderId: orderId,
      table: row[SHEET_SCHEMA.TABLE.NAME],
    });

    const occupiedTable = {
      id: tableId,
      name: trimSafe_(row[SHEET_SCHEMA.TABLE.NAME]),
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
  const rows = getSheetData_(SHEET_NAME.TABLE);
  const tables = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const status = trimSafe_(row[SHEET_SCHEMA.TABLE.STATUS]);
    const currentOrderId = trimSafe_(row[SHEET_SCHEMA.TABLE.CURRENT_ORDER_ID]);

    // Apply filter if specified
    if (filterStatus && status !== filterStatus) continue;

    tables.push({
      id: trimSafe_(row[SHEET_SCHEMA.TABLE.ID]),
      name: trimSafe_(row[SHEET_SCHEMA.TABLE.NAME]),
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
