/* =========================
 * Order.gs - Order + Immutable Snapshot
 * ========================= */

const createOrder = (payload) => {
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
    createdBy: payload.createdBy || "staff",
    createdAt: toIsoString_(new Date()),
    version: APP_CONFIG.SNAPSHOT_VERSION,
  };

  // 1. Lưu Order chính
  appendRowsBatch_(SHEET_NAME.ORDER, [
    [
      orderData.id,
      orderData.tableId,
      orderData.customerName,
      orderData.status,
      orderData.subtotal,
      orderData.discount,
      orderData.grandTotal,
      orderData.paymentStatus,
      orderData.createdBy,
      orderData.createdAt,
    ],
  ]);

  // 2. Lưu ORDER_DETAIL cho từng sản phẩm
  const orderDetails = orderData.items.map((item) => [
    generateId_("detail"),
    orderData.id,
    item.productId,
    item.productName || "",
    item.quantity,
    item.unitPrice || 0,
    item.subtotal || 0,
  ]);

  if (orderDetails.length > 0) {
    appendRowsBatch_(SHEET_NAME.ORDER_DETAIL, orderDetails);
  }

  // 3. Lưu Snapshot (Immutable)
  appendRowsBatch_(SHEET_NAME.ORDER_SNAPSHOT, [
    [
      orderData.id,
      JSON.stringify(orderData),
      orderData.version,
      orderData.createdAt,
    ],
  ]);

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
};

// Freeze khi thanh toán thành công
// Refactored to throw errors, return raw snapshot
const freezeOrderSnapshot = (orderId, paymentInfo) => {
  // ✓ Use findRowById_ instead of manual loop
  const snapshotRow = findRowById_(SHEET_NAME.ORDER_SNAPSHOT, orderId);
  if (!snapshotRow) {
    throw new Error("ORDER_NOT_FOUND");
  }

  let snapshot = parseJsonSafe_(
    snapshotRow.values[SHEET_SCHEMA.ORDER_SNAPSHOT.SNAPSHOT_DATA],
  );
  if (!snapshot) {
    throw new Error("INVALID_SNAPSHOT");
  }

  // ✓ Check if already frozen
  if (snapshot.frozen === true) {
    throw new Error("ORDER_ALREADY_FROZEN");
  }

  snapshot.paymentStatus = "PAID";
  snapshot.paymentInfo = paymentInfo;
  snapshot.frozenAt = toIsoString_(new Date());
  snapshot.frozen = true;

  // Update snapshot row
  const sheet = getSheet_(SHEET_NAME.ORDER_SNAPSHOT);
  sheet
    .getRange(
      snapshotRow.rowIndex,
      SHEET_SCHEMA.ORDER_SNAPSHOT.SNAPSHOT_DATA + 1,
    )
    .setValue(JSON.stringify(snapshot));

  // Update main order
  updateOrderStatus(orderId, "CLOSED", "PAID");

  // Release bàn nếu có
  if (snapshot.tableId) {
    releaseTable(snapshot.tableId, orderId);
  }

  // ✓ Invalidate cache once (from batchWriteRows_)
  invalidateSheetCache_(SHEET_NAME.ORDER_SNAPSHOT);

  logAction_("FREEZE_ORDER", orderId, "system", paymentInfo);
  pushDeltaSafe_("ORDER", "FREEZE", snapshot);
  return snapshot;
};

const updateOrderStatus = (orderId, status, paymentStatus = null) => {
  const orderRow = findRowById_(SHEET_NAME.ORDER, orderId);
  if (!orderRow) {
    return false;
  }

  const row = orderRow.values;
  row[SHEET_SCHEMA.ORDER.STATUS] = status;
  if (paymentStatus) {
    row[SHEET_SCHEMA.ORDER.PAYMENT_STATUS] = paymentStatus;
  }

  batchWriteRows_(SHEET_NAME.ORDER, orderRow.rowIndex, 1, [row]);
  invalidateSheetCache_(SHEET_NAME.ORDER);
  pushDeltaSafe_("ORDER", "STATUS_UPDATE", {
    orderId,
    status,
    paymentStatus:
      paymentStatus || trimSafe_(row[SHEET_SCHEMA.ORDER.PAYMENT_STATUS]),
  });
  return true;
};

const mapOrderRow_ = (row) => ({
  id: trimSafe_(row[SHEET_SCHEMA.ORDER.ID]),
  tableId: trimSafe_(row[SHEET_SCHEMA.ORDER.TABLE_ID]),
  customerName: trimSafe_(row[SHEET_SCHEMA.ORDER.CUSTOMER_NAME]),
  status: trimSafe_(row[SHEET_SCHEMA.ORDER.STATUS]),
  subtotal: toNumberSafe_(row[SHEET_SCHEMA.ORDER.SUBTOTAL]),
  discount: toNumberSafe_(row[SHEET_SCHEMA.ORDER.DISCOUNT]),
  grandTotal: toNumberSafe_(row[SHEET_SCHEMA.ORDER.GRAND_TOTAL]),
  paymentStatus: trimSafe_(row[SHEET_SCHEMA.ORDER.PAYMENT_STATUS]),
  createdBy: trimSafe_(row[SHEET_SCHEMA.ORDER.CREATED_BY]),
  createdAt: trimSafe_(row[SHEET_SCHEMA.ORDER.CREATED_AT]),
});

const mapOrderDetailRow_ = (row) => ({
  id: trimSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.ID]),
  orderId: trimSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.ORDER_ID]),
  productId: trimSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.PRODUCT_ID]),
  productName: trimSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.PRODUCT_NAME]),
  quantity: toNumberSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.QUANTITY]),
  unitPrice: toNumberSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.UNIT_PRICE]),
  subtotal: toNumberSafe_(row[SHEET_SCHEMA.ORDER_DETAIL.SUBTOTAL]),
});

const getOrders = (filters = {}) => {
  const limit = Math.max(1, Math.min(toNumberSafe_(filters.limit, 100), 500));
  const tableId = trimSafe_(filters.tableId);
  const status = trimSafe_(filters.status);
  const paymentStatus = trimSafe_(filters.paymentStatus);

  const detailRows = getSheetData_(SHEET_NAME.ORDER_DETAIL);
  const detailsByOrderId = {};

  for (let i = 1; i < detailRows.length; i++) {
    const detail = mapOrderDetailRow_(detailRows[i]);
    if (!detail.orderId) continue;
    if (!detailsByOrderId[detail.orderId]) {
      detailsByOrderId[detail.orderId] = [];
    }
    detailsByOrderId[detail.orderId].push(detail);
  }

  const orderRows = getSheetData_(SHEET_NAME.ORDER);
  const orders = [];

  for (let i = 1; i < orderRows.length; i++) {
    const order = mapOrderRow_(orderRows[i]);
    if (!order.id) continue;
    if (tableId && order.tableId !== tableId) continue;
    if (status && order.status !== status) continue;
    if (paymentStatus && order.paymentStatus !== paymentStatus) continue;

    orders.push({
      ...order,
      items: detailsByOrderId[order.id] || [],
    });
  }

  return orders
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    .slice(0, limit);
};
