/* =========================
 * Payment.gs - SAFE PATCH VERSION
 * Multi Provider Support
 * KHÔNG phá architecture cũ
 * KHÔNG đổi interface function
 * ========================= */

/* =========================
 * PAYMENT PROVIDERS
 * ========================= */

const PAYMENT_PROVIDERS = {
  MOMO: "momo",
  ZALOPAY: "zalopay",

  VCB: "vcb",
  MB: "mb",
  TCB: "tcb",
  BIDV: "bidv",
  VPBANK: "vpbank",
  ACB: "acb",
  TPBANK: "tpbank",
  AGRIBANK: "agribank",

  GENERIC_BANK: "bank",

  CASH: "cash",
};

const VALID_PAYMENT_PROVIDERS = [
  PAYMENT_PROVIDERS.MOMO,
  PAYMENT_PROVIDERS.ZALOPAY,

  PAYMENT_PROVIDERS.VCB,
  PAYMENT_PROVIDERS.MB,
  PAYMENT_PROVIDERS.TCB,
  PAYMENT_PROVIDERS.BIDV,
  PAYMENT_PROVIDERS.VPBANK,
  PAYMENT_PROVIDERS.ACB,
  PAYMENT_PROVIDERS.TPBANK,
  PAYMENT_PROVIDERS.AGRIBANK,

  PAYMENT_PROVIDERS.GENERIC_BANK,

  PAYMENT_PROVIDERS.CASH,
];

/* =========================
 * NORMALIZE PAYMENT
 * ========================= */

const normalizePaymentPayload_ = (provider, rawPayload) => {
  const normalized = {
    provider: provider || PAYMENT_PROVIDERS.MOMO,

    transactionId: trimSafe_(
      rawPayload.transId || rawPayload.transactionId || rawPayload.orderId,
    ),

    amount: toNumberSafe_(rawPayload.amount),

    description: trimSafe_(
      rawPayload.comment || rawPayload.description || rawPayload.orderInfo,
    ),

    paidAt: rawPayload.time || rawPayload.paidAt || toIsoString_(new Date()),

    rawPayload: rawPayload,

    traceId: generateId_("trace"),
  };

  normalized.fingerprint = createPaymentFingerprint_(normalized);

  return normalized;
};

const createPaymentFingerprint_ = (payment) => {
  return calculateChecksum_({
    transactionId: payment.transactionId,

    amount: payment.amount,

    provider: payment.provider,
  });
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

  const rows = getSheetData_(SHEET_NAME.PAYMENT, false);

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];

    const storedFingerprint = trimSafe_(row[SHEET_SCHEMA.PAYMENT.FINGERPRINT]);

    const storedTransId = trimSafe_(row[SHEET_SCHEMA.PAYMENT.TRANSACTION_ID]);

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
  return withPaymentLock_(`pay_${provider}`, () => {
    if (!provider || !VALID_PAYMENT_PROVIDERS.includes(provider)) {
      throw new Error("INVALID_PROVIDER");
    }

    const normalized = normalizePaymentPayload_(provider, rawPayload);

    /* =========================
     * MOMO SIGNATURE VERIFY
     * ========================= */

    if (provider === PAYMENT_PROVIDERS.MOMO && rawPayload.signature) {
      if (!verifyMoMoSignature_(rawPayload, rawPayload.signature)) {
        logSystemError_({
          type: "SIGNATURE_MISMATCH",

          transactionId: normalized.transactionId,

          provider: provider,
        });

        throw new Error("INVALID_SIGNATURE");
      }
    }

    /* =========================
     * DUPLICATE CHECK
     * ========================= */

    if (isDuplicatePayment_(normalized.fingerprint, normalized.transactionId)) {
      logPayment_(
        rawPayload.orderId || "unknown",

        {
          status: "DUPLICATE",

          transactionId: normalized.transactionId,
        },

        "system",
      );

      return {
        orderId: rawPayload.orderId,

        isDuplicate: true,

        transactionId: normalized.transactionId,
      };
    }

    /* =========================
     * DETECT ORDER
     * ========================= */

    const orderId =
      trimSafe_(rawPayload.orderId) || detectOrderFromPayment_(normalized);

    if (!orderId) {
      logSystemError_({
        type: "ORDER_NOT_FOUND",

        transactionId: normalized.transactionId,

        fingerprint: normalized.fingerprint,
      });

      throw new Error("ORDER_NOT_FOUND");
    }

    /* =========================
     * FIND ORDER
     * ========================= */

    const orderRow = findRowById_(SHEET_NAME.ORDER, orderId);

    if (!orderRow) {
      throw new Error("ORDER_NOT_FOUND");
    }

    /* =========================
     * VERIFY AMOUNT
     * ========================= */

    const orderGrandTotal = toNumberSafe_(
      orderRow.values[SHEET_SCHEMA.ORDER.GRAND_TOTAL],
    );

    const paymentAmount = toNumberSafe_(normalized.amount);

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

    /* =========================
     * PAYMENT RESULT
     * ========================= */

    const paymentResult = {
      provider: normalized.provider,

      transactionId: normalized.transactionId,

      amount: normalized.amount,

      fingerprint: normalized.fingerprint,

      verifiedAt: toIsoString_(new Date()),

      traceId: normalized.traceId,
    };

    /* =========================
     * FREEZE SNAPSHOT
     * ========================= */

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

    /* =========================
     * SAVE PAYMENT
     * ========================= */

    savePaymentHistory(paymentResult, orderId);

    putPaymentCache_(paymentResult.fingerprint, paymentResult.transactionId);

    logPayment_(orderId, paymentResult, "system");

    return {
      orderId,

      snapshot: frozenSnapshot,

      payment: paymentResult,
    };
  });
};

/* =========================
 * SAVE PAYMENT HISTORY
 * ========================= */

const savePaymentHistory = (paymentResult, orderId) => {
  appendRowsBatch_(SHEET_NAME.PAYMENT, [
    [
      generateId_("pay"),

      orderId,

      paymentResult.provider,

      paymentResult.amount,

      "PAID",

      paymentResult.transactionId,

      paymentResult.verifiedAt,

      "Tự động",

      paymentResult.fingerprint,
    ],
  ]);
};

/* =========================
 * MOMO WEBHOOK
 * ========================= */

const processMoMoWebhook = (payload) => {
  return processIncomingPayment(PAYMENT_PROVIDERS.MOMO, payload);
};

/* =========================
 * MOMO SIGNATURE VERIFY
 * ========================= */

const verifyMoMoSignature_ = (webhookData, momoSignature) => {
  try {
    const dataString = JSON.stringify(webhookData);

    const computed = Utilities.computeDigest(
      Utilities.DigestAlgorithm.SHA_256,

      dataString + APP_CONFIG.MOMO_SECRET_KEY,

      Utilities.Charset.UTF_8,
    );

    const computedSignature = computed
      .map((byte) =>
        ("0" + (byte < 0 ? byte + 256 : byte).toString(16)).slice(-2),
      )
      .join("");

    return computedSignature === momoSignature;
  } catch (e) {
    logSystemError_({
      type: "SIGNATURE_VERIFY_ERROR",

      error: e.message,
    });

    return false;
  }
};

/* =========================
 * NOTIFICATION PATTERNS
 * ========================= */

const NOTIFICATION_PATTERNS = {
  MOMO: {
    provider: PAYMENT_PROVIDERS.MOMO,

    amountRegex: /\+?\s*([\d\.,]+)\s*(VND|đ|vnđ)?/i,

    orderIdRegex: /(DH\d+)/i,

    transIdRegex: /(TK|GD|TRANS)[\s:]*([a-z0-9]+)/i,
  },

  ZALOPAY: {
    provider: PAYMENT_PROVIDERS.ZALOPAY,

    amountRegex: /\+?\s*([\d\.,]+)\s*(VND|đ|vnđ)?/i,

    orderIdRegex: /(DH\d+)/i,

    transIdRegex: /(ZPY|GD)[\s:]*([a-z0-9]+)/i,
  },

  VCB: {
    provider: PAYMENT_PROVIDERS.VCB,

    amountRegex: /\+?\s*([\d\.,]+)\s*(VND|đ|vnđ)?/i,

    orderIdRegex: /(DH\d+)/i,

    transIdRegex: /(GD|REF)[\s:]*([a-z0-9]+)/i,
  },

  MB: {
    provider: PAYMENT_PROVIDERS.MB,

    amountRegex: /\+?\s*([\d\.,]+)\s*(VND|đ|vnđ)?/i,

    orderIdRegex: /(DH\d+)/i,

    transIdRegex: /(GD|REF|FT)[\s:]*([a-z0-9]+)/i,
  },

  TCB: {
    provider: PAYMENT_PROVIDERS.TCB,

    amountRegex: /\+?\s*([\d\.,]+)\s*(VND|đ|vnđ)?/i,

    orderIdRegex: /(DH\d+)/i,

    transIdRegex: /(GD|FT|REF)[\s:]*([a-z0-9]+)/i,
  },

  BIDV: {
    provider: PAYMENT_PROVIDERS.BIDV,

    amountRegex: /\+?\s*([\d\.,]+)\s*(VND|đ|vnđ)?/i,

    orderIdRegex: /(DH\d+)/i,

    transIdRegex: /(GD|REF)[\s:]*([a-z0-9]+)/i,
  },

  VPBANK: {
    provider: PAYMENT_PROVIDERS.VPBANK,

    amountRegex: /\+?\s*([\d\.,]+)\s*(VND|đ|vnđ)?/i,

    orderIdRegex: /(DH\d+)/i,

    transIdRegex: /(GD|REF)[\s:]*([a-z0-9]+)/i,
  },

  ACB: {
    provider: PAYMENT_PROVIDERS.ACB,

    amountRegex: /\+?\s*([\d\.,]+)\s*(VND|đ|vnđ)?/i,

    orderIdRegex: /(DH\d+)/i,

    transIdRegex: /(GD|REF)[\s:]*([a-z0-9]+)/i,
  },

  TPBANK: {
    provider: PAYMENT_PROVIDERS.TPBANK,

    amountRegex: /\+?\s*([\d\.,]+)\s*(VND|đ|vnđ)?/i,

    orderIdRegex: /(DH\d+)/i,

    transIdRegex: /(GD|REF)[\s:]*([a-z0-9]+)/i,
  },

  AGRIBANK: {
    provider: PAYMENT_PROVIDERS.AGRIBANK,

    amountRegex: /\+?\s*([\d\.,]+)\s*(VND|đ|vnđ)?/i,

    orderIdRegex: /(DH\d+)/i,

    transIdRegex: /(GD|REF)[\s:]*([a-z0-9]+)/i,
  },

  BANK: {
    provider: PAYMENT_PROVIDERS.GENERIC_BANK,

    amountRegex: /\+?\s*([\d\.,]+)\s*(VND|đ|vnđ)?/i,

    orderIdRegex: /(DH\d+)/i,

    transIdRegex: /(GD|REF|FT)[\s:]*([a-z0-9]+)/i,
  },
};

/* =========================
 * AUTO DETECT PROVIDER
 * ========================= */

const detectNotificationProvider_ = (title, message) => {
  const text = `${title} ${message}`.toLowerCase();

  if (text.includes("momo")) {
    return PAYMENT_PROVIDERS.MOMO;
  }

  if (text.includes("zalopay")) {
    return PAYMENT_PROVIDERS.ZALOPAY;
  }

  if (text.includes("vietcombank") || text.includes("vcb")) {
    return PAYMENT_PROVIDERS.VCB;
  }

  if (text.includes("mbbank") || text.includes("mb bank")) {
    return PAYMENT_PROVIDERS.MB;
  }

  if (text.includes("techcombank") || text.includes("tcb")) {
    return PAYMENT_PROVIDERS.TCB;
  }

  if (text.includes("bidv")) {
    return PAYMENT_PROVIDERS.BIDV;
  }

  if (text.includes("vpbank")) {
    return PAYMENT_PROVIDERS.VPBANK;
  }

  if (text.includes("acb")) {
    return PAYMENT_PROVIDERS.ACB;
  }

  if (text.includes("tpbank")) {
    return PAYMENT_PROVIDERS.TPBANK;
  }

  if (text.includes("agribank")) {
    return PAYMENT_PROVIDERS.AGRIBANK;
  }

  return PAYMENT_PROVIDERS.GENERIC_BANK;
};

/* =========================
 * PARSE NOTIFICATION
 * ========================= */

const parseNotificationData_ = (notificationPayload) => {
  const provider = trimSafe_(notificationPayload.provider).toLowerCase().trim();

  const message = trimSafe_(notificationPayload.message);

  const title = trimSafe_(notificationPayload.title);

  if (!NOTIFICATION_PATTERNS[provider.toUpperCase()]) {
    throw new Error(`UNKNOWN_PROVIDER: ${provider}`);
  }

  const pattern = NOTIFICATION_PATTERNS[provider.toUpperCase()];

  const amountMatch = message.match(pattern.amountRegex);

  if (!amountMatch) {
    throw new Error("AMOUNT_NOT_FOUND_IN_NOTIFICATION");
  }

  const amountStr = amountMatch[1].replace(/,/g, "").replace(/\./g, "");

  const amount = toNumberSafe_(amountStr);

  const orderIdMatch = message.match(pattern.orderIdRegex);

  const orderId = orderIdMatch ? orderIdMatch[1] : null;

  const transIdMatch = message.match(pattern.transIdRegex);

  const transactionId = transIdMatch
    ? transIdMatch[2] || transIdMatch[1]
    : generateId_("txn");

  return {
    provider,

    orderId,

    amount,

    transactionId,

    title,

    message,

    receivedAt: toIsoString_(new Date()),

    rawPayload: notificationPayload,
  };
};

/* =========================
 * PROCESS PAYMENT FROM
 * NOTIFICATION
 * ========================= */

const processPaymentFromNotification = (notificationPayload) => {
  if (!notificationPayload) {
    throw new Error("EMPTY_NOTIFICATION_PAYLOAD");
  }

  const title = trimSafe_(notificationPayload.title);

  const message = trimSafe_(notificationPayload.message);

  if (!message) {
    throw new Error("EMPTY_NOTIFICATION_MESSAGE");
  }

  if (!notificationPayload.provider) {
    notificationPayload.provider = detectNotificationProvider_(title, message);
  }

  const parsed = parseNotificationData_(notificationPayload);

  if (!parsed.orderId) {
    logSystemError_({
      type: "ORDER_ID_NOT_FOUND",

      provider: parsed.provider,

      title: parsed.title,

      message: parsed.message,
    });

    throw new Error("ORDER_ID_NOT_FOUND");
  }

  return processIncomingPayment(parsed.provider, {
    orderId: parsed.orderId,

    transactionId: parsed.transactionId,

    amount: parsed.amount,

    description: parsed.message,

    paidAt: parsed.receivedAt,

    rawNotification: notificationPayload,
  });
};
