/* =========================
 * Validation.gs - Kiểm tra & xác minh logic
 * ========================= */

/**
 * Validate order data trước khi tạo
 */
const validateOrderPayload = (payload) => {
  const errors = [];

  // ✓ FIX: tableId can be empty string OR undefined (for walk-in), not required
  if (payload.tableId === null || payload.tableId === undefined) {
    // tableId can be empty string for walk-in customers
    // errors.push("tableId is required");
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    errors.push("items must be non-empty array");
    return { valid: false, errors }; // Early return
  }

  if (
    !payload.items.every(
      (item) => item.productId && toNumberSafe_(item.quantity) > 0,
    )
  ) {
    errors.push("all items must have productId and quantity > 0");
  }

  if (toNumberSafe_(payload.grandTotal) <= 0) {
    errors.push("grandTotal must be > 0");
  }

  if (toNumberSafe_(payload.subtotal) <= 0) {
    errors.push("subtotal must be > 0");
  }

  // Check: discount + grand_total logic
  const expectedGrandTotal =
    toNumberSafe_(payload.subtotal) - toNumberSafe_(payload.discount || 0);
  if (Math.abs(expectedGrandTotal - toNumberSafe_(payload.grandTotal)) > 0.01) {
    errors.push(
      `grandTotal mismatch: expected ${expectedGrandTotal}, got ${payload.grandTotal}`,
    );
  }

  // Validate each item schema
  payload.items.forEach((item, idx) => {
    if (!item.productId || !item.productName) {
      errors.push(`Item ${idx}: productId and productName required`);
    }
    const qty = toNumberSafe_(item.quantity);
    const price = toNumberSafe_(item.unitPrice);
    if (qty <= 0) {
      errors.push(`Item ${idx}: quantity must be > 0`);
    }
    if (price < 0) {
      errors.push(`Item ${idx}: unitPrice cannot be negative`);
    }
    const expectedSubtotal = qty * price;
    const itemSubtotal = toNumberSafe_(item.subtotal);
    if (Math.abs(expectedSubtotal - itemSubtotal) > 0.01) {
      errors.push(
        `Item ${idx}: subtotal mismatch: expected ${expectedSubtotal}, got ${itemSubtotal}`,
      );
    }
  });

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Validate payment payload
 */
const validatePaymentPayload = (payload) => {
  const errors = [];

  if (!payload.orderId) {
    errors.push("orderId is required");
  }

  if (toNumberSafe_(payload.amount) <= 0) {
    errors.push("amount must be > 0");
  }

  if (
    !payload.provider ||
    !VALID_PAYMENT_PROVIDERS.includes(trimSafe_(payload.provider).toLowerCase())
  ) {
    errors.push("invalid provider");
  }

  // ✓ NEW: Verify amount vs order
  if (payload.orderId && payload.amount) {
    try {
      const orderRow = findRowById_(SHEET_NAME.ORDER, payload.orderId);
      if (orderRow) {
        const orderGrandTotal = toNumberSafe_(
          orderRow.values[SHEET_SCHEMA.ORDER.GRAND_TOTAL],
        );
        const paymentAmount = toNumberSafe_(payload.amount);
        if (Math.abs(orderGrandTotal - paymentAmount) > 0.01) {
          errors.push(
            `amount mismatch: order expects ${orderGrandTotal}, payment is ${paymentAmount}`,
          );
        }
      }
    } catch (e) {
      errors.push(`Error validating order amount: ${e.message}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

/**
 * Check data consistency
 * ✓ Check OPEN orders WITHOUT snapshot (orphaned)
 * ✓ Check CLOSED orders WITH snapshot (should have payment)
 * ✓ Check ORDER_DETAIL -> ORDER foreign key
 * ✓ Check PAYMENT -> ORDER foreign key
 */
const validateDataConsistency = () => {
  const issues = [];

  // Check: ORDER -> ORDER_SNAPSHOT
  const orders = getSheetData_(SHEET_NAME.ORDER, false);
  const snapshots = getSheetData_(SHEET_NAME.ORDER_SNAPSHOT, false);
  const snapshotIds = new Set();

  for (let i = 1; i < snapshots.length; i++) {
    snapshotIds.add(trimSafe_(snapshots[i][0]));
  }

  for (let i = 1; i < orders.length; i++) {
    const orderId = trimSafe_(orders[i][0]);
    const status = trimSafe_(orders[i][SHEET_SCHEMA.ORDER.STATUS]);

    // ✓ Check OPEN orders without snapshot (orphaned)
    if (
      (status === "OPEN" || status === "PENDING") &&
      !snapshotIds.has(orderId)
    ) {
      issues.push({
        type: "OPEN_ORDER_NO_SNAPSHOT",
        orderId,
        status,
        severity: "HIGH",
      });
    }

    // ✓ Check CLOSED orders WITHOUT snapshot (data corruption)
    if (status === "CLOSED" && !snapshotIds.has(orderId)) {
      issues.push({
        type: "CLOSED_ORDER_NO_SNAPSHOT",
        orderId,
        severity: "CRITICAL",
      });
    }
  }

  // Check: ORDER_DETAIL -> ORDER
  const details = getSheetData_(SHEET_NAME.ORDER_DETAIL, false);
  const orderIds = new Set();

  for (let i = 1; i < orders.length; i++) {
    orderIds.add(trimSafe_(orders[i][0]));
  }

  for (let i = 1; i < details.length; i++) {
    const detailOrderId = trimSafe_(
      details[i][SHEET_SCHEMA.ORDER_DETAIL.ORDER_ID],
    );
    if (!orderIds.has(detailOrderId)) {
      issues.push({
        type: "ORPHAN_DETAIL",
        detailId: details[i][SHEET_SCHEMA.ORDER_DETAIL.ID],
        orderId: detailOrderId,
        severity: "MEDIUM",
      });
    }
  }

  // Check: PAYMENT -> ORDER
  const payments = getSheetData_(SHEET_NAME.PAYMENT, false);

  for (let i = 1; i < payments.length; i++) {
    const payOrderId = trimSafe_(payments[i][SHEET_SCHEMA.PAYMENT.ORDER_ID]);
    if (!orderIds.has(payOrderId)) {
      issues.push({
        type: "ORPHAN_PAYMENT",
        paymentId: payments[i][SHEET_SCHEMA.PAYMENT.ID],
        orderId: payOrderId,
        severity: "HIGH",
      });
    }
  }

  return {
    consistent: issues.length === 0,
    issues,
  };
};

/**
 * Test data flow - use MOCK data, not production data
 * Tests: order validation → payment validation → consistency check
 */
const testDataFlow = () => {
  const log = [];

  try {
    // ✓ Test 1: Order validation with MOCK data
    log.push("TEST 1: Order validation");
    const mockValidOrder = {
      tableId: "table_mock_001",
      items: [
        {
          productId: "prod_mock_001",
          productName: "Cà phê đen",
          quantity: 2,
          unitPrice: 25000,
          subtotal: 50000,
        },
        {
          productId: "prod_mock_002",
          productName: "Trà sữa",
          quantity: 1,
          unitPrice: 45000,
          subtotal: 45000,
        },
      ],
      subtotal: 95000,
      discount: 5000,
      grandTotal: 90000,
      createdBy: "staff_test",
    };
    const validation = validateOrderPayload(mockValidOrder);
    log.push(
      validation.valid ? "✓ PASS" : `✗ FAIL: ${validation.errors.join(", ")}`,
    );

    // ✓ Test 2: Payment validation with MOCK data
    log.push("TEST 2: Payment validation");
    const mockValidPayment = {
      orderId: "ord_mock_001",
      amount: 90000,
      provider: "momo",
    };
    const paymentValidation = validatePaymentPayload(mockValidPayment);
    log.push(
      paymentValidation.valid
        ? "✓ PASS (validation passed, may fail on order lookup in real scenario)"
        : `✗ FAIL: ${paymentValidation.errors.join(", ")}`,
    );

    // ✓ Test 3: Invalid order (empty items)
    log.push("TEST 3: Invalid order (empty items)");
    const mockInvalidOrder = {
      tableId: "table_mock_001",
      items: [],
      subtotal: 0,
      discount: 0,
      grandTotal: 0,
    };
    const invalidValidation = validateOrderPayload(mockInvalidOrder);
    log.push(
      !invalidValidation.valid
        ? `✓ PASS (correctly rejected): ${invalidValidation.errors.join(", ")}`
        : "✗ FAIL: should have rejected empty items",
    );

    // ✓ Test 4: Invalid payment (negative amount)
    log.push("TEST 4: Invalid payment (negative amount)");
    const mockInvalidPayment = {
      orderId: "ord_mock_001",
      amount: -10000,
      provider: "momo",
    };
    const invalidPaymentValidation = validatePaymentPayload(mockInvalidPayment);
    log.push(
      !invalidPaymentValidation.valid
        ? `✓ PASS (correctly rejected): ${invalidPaymentValidation.errors.join(", ")}`
        : "✗ FAIL: should have rejected negative amount",
    );

    // ✓ Test 5: Data consistency (from actual production data)
    log.push("TEST 5: Data consistency check (on real data)");
    const consistency = validateDataConsistency();
    log.push(
      consistency.consistent
        ? "✓ PASS: No inconsistencies found"
        : `⚠ WARNING: ${consistency.issues.length} issues found`,
    );

    if (!consistency.consistent) {
      log.push("Consistency Issues Found:");
      consistency.issues.forEach((issue) => {
        log.push(
          `  - [${issue.severity}] ${issue.type}: ${JSON.stringify(issue)}`,
        );
      });
    }

    return {
      success: true,
      tests: log,
      timestamp: new Date().toISOString(),
    };
  } catch (e) {
    log.push(`ERROR: ${e.message}`);
    return {
      success: false,
      tests: log,
      error: e.message,
    };
  }
};

/**
 * Validate notification payload từ Android app
 */
const validateNotificationPayload = (payload) => {
  const errors = [];

  const notificationProviders = [
    "momo",
    "zalopay",
    "vcb",
    "mb",
    "tcb",
    "bidv",
    "vpbank",
    "acb",
    "tpbank",
    "agribank",
    "bank",
  ];

  if (
    payload.provider &&
    !notificationProviders.includes(trimSafe_(payload.provider).toLowerCase())
  ) {
    errors.push("invalid notification provider");
  }

  if (!payload.message || payload.message.length < 5) {
    errors.push("message is required and must be at least 5 characters");
  }

  const hasAmount = /[\d,]+/.test(payload.message);
  if (!hasAmount) {
    errors.push("message must contain amount (digits with optional commas)");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};
