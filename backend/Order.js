/* =========================
 * Order.gs - Order + Immutable Snapshot - Firestore
 * ========================= */

const createOrder = (payload) => {
  return withTransaction_("reduce_stock", () => {
    const orderId = generateId_("ord");

    // === VALIDATE STOCK TRƯỚC KHI TẠO ORDER ===
    validateStockBeforeOrder_(payload.items || []);

    const orderData = {
      id: orderId,
      tableId: payload.tableId,
      customerName: payload.customerName || "Khách lẻ",
      status: "OPEN",
      items: payload.items || [],
      subtotal: payload.subtotal,
      discount: payload.discount || 0,
      grandTotal: payload.grandTotal,
      paymentStatus: "PENDING",
      paymentMethod: payload.paymentMethod === "transfer" ? "transfer" : "cash",
      createdBy: payload.createdBy || "staff",
      createdAt: toIsoString_(new Date()),
      updatedAt: toIsoString_(new Date()),
      version: APP_CONFIG.SNAPSHOT_VERSION,
    };

    // 1. Lưu Order chính vào collection 'orders'
    firestoreSet_("orders", orderId, orderData);

    // 2. Lưu Snapshot (Immutable) vào collection 'order_snapshots'
    firestoreSet_("order_snapshots", orderId, {
      orderId: orderData.id,
      snapshotData: JSON.stringify(orderData),
      version: orderData.version,
      createdAt: orderData.createdAt,
      frozen: false,
    });

    // === REDUCE STOCK SAU KHI ORDER CREATED ===
    reduceProductStock_(payload.items || []);

    // === OCCUPY TABLE ===
    if (payload.tableId) {
      occupyTable(payload.tableId, orderId);
    }

    logAction_("CREATE_ORDER", orderData.id, orderData.createdBy, {
      grandTotal: orderData.grandTotal,
      itemCount: orderData.items.length,
    });
    pushDeltaSafe_("ORDER", "CREATE", orderData);

    return orderData;
  });
};

// Freeze khi thanh toán thành công
// Refactored to throw errors, return raw snapshot
const freezeOrderSnapshot = (orderId, paymentInfo) => {
  const snapshotDoc = firestoreGet_("order_snapshots", orderId);
  if (!snapshotDoc) {
    throw new Error("ORDER_NOT_FOUND");
  }

  let snapshot = parseJsonSafe_(snapshotDoc.snapshotData);
  if (!snapshot) {
    throw new Error("INVALID_SNAPSHOT");
  }

  // ✓ Check if already frozen
  if (snapshot.frozen === true || snapshotDoc.frozen === true) {
    throw new Error("ORDER_ALREADY_FROZEN");
  }

  const nowStr = toIsoString_(new Date());
  snapshot.paymentStatus = "PAID";
  snapshot.paymentInfo = paymentInfo;
  snapshot.frozenAt = nowStr;
  snapshot.frozen = true;

  // Update snapshot doc in Firestore
  firestoreUpdate_("order_snapshots", orderId, {
    snapshotData: JSON.stringify(snapshot),
    frozen: true,
    frozenAt: nowStr,
  });

  // Update main order in Firestore
  updateOrderStatus(orderId, "CLOSED", "PAID");

  // Release bàn nếu có
  if (snapshot.tableId) {
    releaseTable(snapshot.tableId, orderId);
  }

  logAction_("FREEZE_ORDER", orderId, "system", paymentInfo);
  pushDeltaSafe_("ORDER", "FREEZE", snapshot);
  return snapshot;
};

const updateOrderStatus = (orderId, status, paymentStatus = null) => {
  const orderDoc = firestoreGet_("orders", orderId);
  if (!orderDoc) {
    return false;
  }

  const updates = {
    status: status,
    updatedAt: toIsoString_(new Date()),
  };

  if (paymentStatus) {
    updates.paymentStatus = paymentStatus;
  }

  firestoreUpdate_("orders", orderId, updates);

  pushDeltaSafe_("ORDER", "STATUS_UPDATE", {
    orderId,
    status,
    paymentStatus: paymentStatus || trimSafe_(orderDoc.paymentStatus),
  });
  return true;
};

const mapOrderDoc_ = (doc) => ({
  id: trimSafe_(doc.id),
  tableId: trimSafe_(doc.tableId),
  customerName: trimSafe_(doc.customerName),
  status: trimSafe_(doc.status),
  subtotal: toNumberSafe_(doc.subtotal),
  discount: toNumberSafe_(doc.discount),
  grandTotal: toNumberSafe_(doc.grandTotal),
  paymentStatus: trimSafe_(doc.paymentStatus),
  createdBy: trimSafe_(doc.createdBy),
  createdAt: trimSafe_(doc.createdAt),
  paymentMethod: trimSafe_(doc.paymentMethod) || "cash",
  items: Array.isArray(doc.items) ? doc.items : [],
});

/**
 * Thêm món vào order đang mở (PAY_LATER flow)
 * - Validate order OPEN + PENDING
 * - Append items mới vào order.items
 * - Cập nhật subtotal, grandTotal trên ORDER doc
 * - Cập nhật snapshot
 * - Giảm stock
 */
const addItemsToOrder = (orderId, newItems, discount) => {
  return withTransaction_("reduce_stock", () => {
    const orderDoc = firestoreGet_("orders", orderId);
    if (!orderDoc) {
      throw new Error("ORDER_NOT_FOUND");
    }

    const status = trimSafe_(orderDoc.status);
    const paymentStatus = trimSafe_(orderDoc.paymentStatus);

    if (status !== "OPEN") {
      throw new Error("ORDER_NOT_OPEN");
    }
    if (paymentStatus === "PAID") {
      throw new Error("ORDER_ALREADY_PAID");
    }

    // Validate stock
    validateStockBeforeOrder_(newItems);

    const existingItems = Array.isArray(orderDoc.items) ? orderDoc.items : [];
    const updatedItems = [...existingItems, ...newItems];

    // Recalculate totals from ALL items
    let newSubtotal = 0;
    updatedItems.forEach((item) => {
      newSubtotal += toNumberSafe_(item.subtotal || item.unitPrice * item.quantity);
    });

    const safeDiscount =
      discount !== undefined && discount !== null
        ? toNumberSafe_(discount)
        : toNumberSafe_(orderDoc.discount);
    const newGrandTotal = newSubtotal - safeDiscount;

    // Update ORDER doc
    firestoreUpdate_("orders", orderId, {
      items: updatedItems,
      subtotal: newSubtotal,
      discount: safeDiscount,
      grandTotal: newGrandTotal,
      updatedAt: toIsoString_(new Date()),
    });

    // Update snapshot
    const snapshotDoc = firestoreGet_("order_snapshots", orderId);
    if (snapshotDoc) {
      let snapshot = parseJsonSafe_(snapshotDoc.snapshotData);
      if (snapshot) {
        snapshot.items = updatedItems;
        snapshot.subtotal = newSubtotal;
        snapshot.discount = safeDiscount;
        snapshot.grandTotal = newGrandTotal;

        firestoreUpdate_("order_snapshots", orderId, {
          snapshotData: JSON.stringify(snapshot),
        });
      }
    }

    // Reduce stock
    reduceProductStock_(newItems);

    logAction_("ADD_ITEMS", orderId, "staff", {
      newItemCount: newItems.length,
      newSubtotal,
      newGrandTotal,
    });
    pushDeltaSafe_("ORDER", "ADD_ITEMS", {
      orderId,
      newSubtotal,
      newGrandTotal,
    });

    const updatedOrder = {
      ...mapOrderDoc_(orderDoc),
      items: updatedItems,
      subtotal: newSubtotal,
      discount: safeDiscount,
      grandTotal: newGrandTotal,
      updatedAt: toIsoString_(new Date()),
    };

    return updatedOrder;
  });
};

/**
 * Lấy order đang mở theo ticketId (tableId)
 * Dùng khi click bàn OCCUPIED để xem order hiện tại
 */
const getOrderByTicketId = (ticketId) => {
  const docs = firestoreQuery_("orders", {
    filters: [
      { field: "tableId", op: "EQUAL", value: ticketId },
      { field: "status", op: "EQUAL", value: "OPEN" },
    ],
    limit: 1,
  });

  if (!Array.isArray(docs) || docs.length === 0) {
    return null;
  }

  return mapOrderDoc_(docs[0]);
};

const getOrders = (filters = {}) => {
  const limit = Math.max(1, Math.min(toNumberSafe_(filters.limit, 100), 500));
  const tableId = trimSafe_(filters.tableId);
  const status = trimSafe_(filters.status);
  const paymentStatus = trimSafe_(filters.paymentStatus);

  const firestoreFilters = [];
  if (tableId) firestoreFilters.push({ field: "tableId", op: "EQUAL", value: tableId });
  if (status) firestoreFilters.push({ field: "status", op: "EQUAL", value: status });
  if (paymentStatus) firestoreFilters.push({ field: "paymentStatus", op: "EQUAL", value: paymentStatus });

  const docs = firestoreQuery_("orders", {
    filters: firestoreFilters,
    limit: limit,
  });

  const orders = (Array.isArray(docs) ? docs : []).map(mapOrderDoc_);

  return orders
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    )
    .slice(0, limit);
};

/**
 * XÓA ORDER - CHỈ OWNER / ADMIN MỚI ĐƯỢC PHÉP THỰC HIỆN
 * @param {string} orderId
 * @param {string} userRole
 */
const deleteOrder = (orderId, userRole) => {
  if (!userRole || userRole.toLowerCase() !== "admin") {
    throw new Error("PERMISSION_DENIED: Chỉ Chủ quán / Admin mới có quyền xóa đơn hàng");
  }

  if (!orderId) throw new Error("ORDER_ID_REQUIRED");

  const existing = firestoreGet_("orders", orderId);
  if (!existing) {
    return { success: true, deletedId: orderId, note: "ORDER_NOT_FOUND" };
  }

  // 1. Delete main order document from 'orders' collection
  firestoreDelete_("orders", orderId);

  // 2. Delete snapshot document if exists
  try {
    firestoreDelete_("order_snapshots", orderId);
  } catch (e) {
    // ignore if missing
  }

  // 3. Delete payment record if exists
  try {
    firestoreDelete_("payments", orderId);
  } catch (e) {
    // ignore if missing
  }

  // 4. Release table if assigned
  if (existing.tableId) {
    try {
      releaseTable(existing.tableId, orderId);
    } catch (e) {
      // ignore table release error
    }
  }

  logAction_("DELETE_ORDER", orderId, "admin", {
    deletedOrder: existing,
  });

  pushDeltaSafe_("ORDER", "DELETE", { orderId });

  return { success: true, deletedId: orderId };
};

