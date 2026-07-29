/* =========================
 * Payment.gs - Firestore
 * Multi Provider Support
 * KHÔNG phá architecture cũ
 * KHÔNG đổi interface function
 * ========================= */

/* =========================
 * PAYMENT PROVIDERS
 * ========================= */

const PAYMENT_PROVIDERS = {
  MANUAL: "manual",
};

const VALID_PAYMENT_PROVIDERS = [PAYMENT_PROVIDERS.MANUAL];

/* =========================
 * NORMALIZE PAYMENT
 * ========================= */

const normalizePaymentPayload_ = (provider, rawPayload) => {
  const payload = rawPayload || {};
  const normalized = {
    provider:
      trimSafe_(
        provider || payload.provider || PAYMENT_PROVIDERS.MANUAL,
      ).toLowerCase() || PAYMENT_PROVIDERS.MANUAL,

    orderId: trimSafe_(payload.orderId || payload.order_id || payload.id),

    transactionId: trimSafe_(
      payload.transactionId || payload.transId || payload.reference || "",
    ),

    amount: toNumberSafe_(payload.amount),

    description: trimSafe_(
      payload.description || payload.comment || payload.note || "",
    ),

    paidAt: payload.paidAt || payload.time || toIsoString_(new Date()),

    rawPayload: payload,

    traceId: generateId_("trace"),
  };

  normalized.fingerprint = createPaymentFingerprint_(normalized);

  return normalized;
};

const createPaymentFingerprint_ = (payment) => {
  return calculateChecksum_({
    orderId: payment.orderId,
    transactionId: payment.transactionId,
    amount: payment.amount,
    provider: payment.provider,
  });
};

const buildVietQrQuickLink_ = (orderId, amount, storeInfo = {}) => {
  const safeOrderId = trimSafe_(orderId || "");
  const safeAmount = Math.max(0, Math.round(toNumberSafe_(amount, 0)));
  const bankId = trimSafe_(storeInfo.BANK_ID || storeInfo.bankId || "MB");
  const accountNo = trimSafe_(
    storeInfo.BANK_ACCOUNT || storeInfo.bankAccount || "1234567890",
  );
  const accountName = trimSafe_(
    storeInfo.BANK_OWNER || storeInfo.bankOwner || "QUYNH ANH",
  );
  const template = trimSafe_(
    storeInfo.BANK_QR_TEMPLATE || storeInfo.qrTemplate || "compact2",
  );

  const description = safeOrderId
    ? String(safeOrderId).toUpperCase().startsWith("DH")
      ? String(safeOrderId).toUpperCase()
      : `DH${String(safeOrderId).toUpperCase()}`
    : "PAYMENT";

  const query = `amount=${safeAmount}&addInfo=${encodeURIComponent(description)}&accountName=${encodeURIComponent(accountName)}`;

  return `https://img.vietqr.io/image/${bankId}-${accountNo}-${template}.png?${query}`;
};

/* =========================
 * DUPLICATE CHECK
 * ========================= */

const PAYMENT_CACHE_TTL = 21600;

const putPaymentCache_ = (fingerprint, transactionId) => {
  const cache = CacheService.getScriptCache();

  if (fingerprint) {
    cache.put("pay_fp_" + fingerprint, "1", PAYMENT_CACHE_TTL);
  }

  if (transactionId) {
    cache.put("pay_tx_" + transactionId, "1", PAYMENT_CACHE_TTL);
  }
};

const isDuplicatePayment_ = (fingerprint, transactionId) => {
  if (!fingerprint && !transactionId) {
    return false;
  }

  const cache = CacheService.getScriptCache();

  if (fingerprint && cache.get("pay_fp_" + fingerprint)) {
    return true;
  }

  if (transactionId && cache.get("pay_tx_" + transactionId)) {
    return true;
  }

  const docs = firestoreQuery_("payments");

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const storedFingerprint = trimSafe_(doc.fingerprint);
    const storedTransId = trimSafe_(doc.transactionId);

    if (
      (fingerprint && storedFingerprint === fingerprint) ||
      (transactionId && storedTransId === transactionId)
    ) {
      putPaymentCache_(fingerprint, transactionId);
      return true;
    }
  }

  return false;
};

/* =========================
 * ORDER DETECTION
 * ========================= */

const detectOrderFromPayment_ = (normalized) => {
  if (normalized.rawPayload && normalized.rawPayload.orderId) {
    return trimSafe_(normalized.rawPayload.orderId);
  }

  const text = (normalized.description || "").toLowerCase();

  const dhMatch = text.match(/dh\d+/i);

  if (dhMatch) {
    return dhMatch[0].toUpperCase();
  }

  const genericMatch = text.match(/order[_\- ]?([a-z0-9]+)/i);

  if (genericMatch) {
    return genericMatch[1];
  }

  return null;
};

/* =========================
 * MAIN PAYMENT PROCESSOR
 * ========================= */

const processIncomingPayment = (provider, rawPayload) => {
  return withPaymentLock_(`pay_${provider || PAYMENT_PROVIDERS.MANUAL}`, () => {
    const normalized = normalizePaymentPayload_(provider, rawPayload);

    if (!VALID_PAYMENT_PROVIDERS.includes(normalized.provider)) {
      normalized.provider = PAYMENT_PROVIDERS.MANUAL;
    }

    if (isDuplicatePayment_(normalized.fingerprint, normalized.transactionId)) {
      logPayment_(
        normalized.orderId || "unknown",
        {
          status: "DUPLICATE",
          transactionId: normalized.transactionId,
        },
        "system",
      );

      return {
        orderId: normalized.orderId,
        isDuplicate: true,
        transactionId: normalized.transactionId,
      };
    }

    const orderId = normalized.orderId || detectOrderFromPayment_(normalized);

    if (!orderId) {
      logSystemError_({
        type: "ORDER_NOT_FOUND",
        transactionId: normalized.transactionId,
        fingerprint: normalized.fingerprint,
      });

      throw new Error("ORDER_NOT_FOUND");
    }

    const orderDoc = firestoreGet_("orders", orderId);

    if (!orderDoc) {
      throw new Error("ORDER_NOT_FOUND");
    }

    const orderGrandTotal = toNumberSafe_(orderDoc.grandTotal);
    const paymentAmount = toNumberSafe_(normalized.amount);
    const actualAmount = orderGrandTotal > 0 ? orderGrandTotal : paymentAmount;

    if (Math.abs(orderGrandTotal - paymentAmount) > 0.01) {
      logSystemError_({
        type: "AMOUNT_MISMATCH",
        orderId,
        expected: orderGrandTotal,
        received: paymentAmount,
      });

      throw new Error(
        `AMOUNT_MISMATCH: expected ${orderGrandTotal}, got ${paymentAmount}`,
      );
    }

    const storeInfo = getStoreInfo_(true);
    const quickLink = buildVietQrQuickLink_(orderId, actualAmount, storeInfo);

    const paymentResult = {
      provider: normalized.provider,
      transactionId: normalized.transactionId,
      amount: actualAmount,
      fingerprint: normalized.fingerprint,
      verifiedAt: toIsoString_(new Date()),
      traceId: normalized.traceId,
      quickLink,
      qrUrl: quickLink,
    };

    let frozenSnapshot;

    try {
      frozenSnapshot = freezeOrderSnapshot(orderId, paymentResult);
    } catch (err) {
      logSystemError_({
        type: "FREEZE_FAILED",
        orderId,
        error: err.message,
      });

      throw err;
    }

    savePaymentHistory(paymentResult, orderId);

    putPaymentCache_(paymentResult.fingerprint, paymentResult.transactionId);

    logPayment_(orderId, paymentResult, "system");

    return {
      orderId,
      snapshot: frozenSnapshot,
      payment: paymentResult,
      quickLink,
      qrUrl: quickLink,
    };
  });
};

/* =========================
 * SAVE PAYMENT HISTORY
 * ========================= */

const savePaymentHistory = (paymentResult, orderId) => {
  const payId = generateId_("pay");
  firestoreSet_("payments", payId, {
    id: payId,
    orderId: orderId,
    provider: paymentResult.provider,
    amount: paymentResult.amount,
    status: "PAID",
    transactionId: paymentResult.transactionId,
    paidAt: paymentResult.verifiedAt,
    recordedBy: "Tự động",
    fingerprint: paymentResult.fingerprint,
    createdAt: toIsoString_(new Date()),
  });
};

const processManualPaymentConfirmation = (payload) => {
  return processIncomingPayment(PAYMENT_PROVIDERS.MANUAL, payload);
};
