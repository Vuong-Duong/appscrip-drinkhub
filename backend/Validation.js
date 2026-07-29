/* =========================
 * Validation.gs - Kiểm tra & xác minh logic - Firestore
 * ========================= */

/**
 * Validate order data trước khi tạo
 */
const validateOrderPayload = (payload) => {
  const errors = [];

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    errors.push("items must be non-empty array");
    return { valid: false, errors };
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

  const expectedGrandTotal =
    toNumberSafe_(payload.subtotal) - toNumberSafe_(payload.discount || 0);
  if (Math.abs(expectedGrandTotal - toNumberSafe_(payload.grandTotal)) > 0.01) {
    errors.push(
      `grandTotal mismatch: expected ${expectedGrandTotal}, got ${payload.grandTotal}`,
    );
  }

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
  const safePayload = payload || {};

  if (!safePayload.orderId) {
    errors.push("orderId is required");
  }

  if (toNumberSafe_(safePayload.amount) <= 0) {
    errors.push("amount must be > 0");
  }

  if (safePayload.orderId && safePayload.amount) {
    try {
      const orderDoc = firestoreGet_("orders", safePayload.orderId);
      if (orderDoc) {
        const orderGrandTotal = toNumberSafe_(orderDoc.grandTotal);
        const paymentAmount = toNumberSafe_(safePayload.amount);
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
 * Check data consistency on Firestore
 */
const validateDataConsistency = () => {
  const issues = [];

  const orders = firestoreQuery_("orders") || [];
  const snapshots = firestoreQuery_("order_snapshots") || [];
  const snapshotIds = new Set(snapshots.map((s) => s.id || s.orderId));

  for (let i = 0; i < orders.length; i++) {
    const orderId = orders[i].id;
    const status = trimSafe_(orders[i].status);

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

    if (status === "CLOSED" && !snapshotIds.has(orderId)) {
      issues.push({
        type: "CLOSED_ORDER_NO_SNAPSHOT",
        orderId,
        severity: "CRITICAL",
      });
    }
  }

  const payments = firestoreQuery_("payments") || [];
  const orderIds = new Set(orders.map((o) => o.id));

  for (let i = 0; i < payments.length; i++) {
    const payOrderId = trimSafe_(payments[i].orderId);
    if (!orderIds.has(payOrderId)) {
      issues.push({
        type: "ORPHAN_PAYMENT",
        paymentId: payments[i].id,
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
 */
const testDataFlow = () => {
  const log = [];

  try {
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

    log.push("TEST 2: Payment validation");
    const mockValidPayment = {
      orderId: "ord_mock_001",
      amount: 90000,
      provider: "momo",
    };
    const paymentValidation = validatePaymentPayload(mockValidPayment);
    log.push(
      paymentValidation.valid
        ? "✓ PASS (validation passed)"
        : `✗ FAIL: ${paymentValidation.errors.join(", ")}`,
    );

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

    log.push("TEST 5: Data consistency check (on real Firestore data)");
    const consistency = validateDataConsistency();
    log.push(
      consistency.consistent
        ? "✓ PASS: No inconsistencies found"
        : `⚠ WARNING: ${consistency.issues.length} issues found`,
    );

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
