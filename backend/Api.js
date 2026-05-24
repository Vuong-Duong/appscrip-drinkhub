/* =========================
 * Api.gs - Optimized Handler Dispatch Pattern
 * ========================= */

// Helper functions are defined in Core.js
// ACTION-SPECIFIC HELPER FUNCTIONS
const normalizeOrderPayloadForApi_ = (payload = {}) => {
  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => {
        const safeItem = item || {};
        const quantity = toNumberSafe_(safeItem.quantity, 1);
        const unitPrice = toNumberSafe_(
          safeItem.unitPrice ?? safeItem.price,
          0,
        );
        return {
          ...safeItem,
          productId: trimSafe_(safeItem.productId ?? safeItem.id),
          productName: trimSafe_(safeItem.productName ?? safeItem.name),
          quantity,
          unitPrice,
          subtotal: toNumberSafe_(safeItem.subtotal, quantity * unitPrice),
        };
      })
    : payload.items;

  const subtotal =
    payload.subtotal !== undefined && payload.subtotal !== null
      ? toNumberSafe_(payload.subtotal)
      : Array.isArray(items)
        ? items.reduce((sum, item) => sum + toNumberSafe_(item.subtotal), 0)
        : 0;
  const discount = toNumberSafe_(payload.discount, 0);

  return {
    ...payload,
    items,
    subtotal,
    discount,
    grandTotal:
      payload.grandTotal !== undefined && payload.grandTotal !== null
        ? toNumberSafe_(payload.grandTotal)
        : subtotal - discount,
  };
};

const normalizePaymentPayloadForApi_ = (payload = {}) => {
  const data = payload.data || payload;
  const provider = trimSafe_(payload.provider || data.provider).toLowerCase();
  return {
    provider,
    data: {
      ...data,
      provider,
    },
  };
};

const mapTableForApi_ = (table) => ({
  ...table,
  status: trimSafe_(table.status).toLowerCase(),
});

// =========================
// MIDDLEWARE HELPERS
// =========================
const withTiming_ = (actionName, handler) => {
  return (payload) => {
    const start = Date.now();
    try {
      const result = handler(payload);
      const duration = Date.now() - start;
      // Only log slow handlers
      if (duration > SLOW_REQUEST_THRESHOLD_MS) {
        console.log(`[${actionName}] took ${duration}ms (SLOW)`);
      }
      return result;
    } catch (err) {
      const duration = Date.now() - start;
      console.error(`[${actionName}] failed in ${duration}ms: ${err.message}`);
      throw err;
    }
  };
};
const simpleHandler_ = (fn) => () => ok_(fn());

/**
 * Distinguish between business errors and programming errors
 * Business errors have format: "ERROR_CODE: optional details"
 * Examples: "ORDER_NOT_FOUND: order 123", "ROLE_REQUIRED", "INVALID_PAYLOAD: ..."
 */
const isBusinessError_ = (err) => {
  const msg = err.message || "";
  // Match pattern: starts with uppercase letters/underscores, followed by colon
  return /^[A-Z_]+(:.*)?$/.test(msg);
};

/**
 * Wrapper to convert business errors to fail_() responses
 * Programming errors (bugs) are rethrown for global error handling
 * Error message format: "ERROR_CODE: optional details"
 */
const withTryCatch_ = (handler) => {
  return (payload) => {
    try {
      return handler(payload);
    } catch (err) {
      // Business error: expected from business logic
      if (isBusinessError_(err)) {
        const errorMsg = err.message || "UNKNOWN_ERROR";
        const [errorCode, ...details] = errorMsg.split(": ");
        return fail_(errorCode, details.join(": ") || null);
      }

      // Programming error: unexpected bug, log and rethrow
      console.error(
        `[PROGRAMMING ERROR] Unhandled exception in handler:`,
        err.message,
        err.stack,
      );
      logSystemError_({
        type: "PROGRAMMING_ERROR",
        error: err.message,
        stack: err.stack,
        timestamp: toIsoString_(new Date()),
      });

      // Rethrow as INTERNAL_ERROR so doPost's global catch handles it
      throw new Error("INTERNAL_ERROR: Programming error detected");
    }
  };
};

// =========================
// ACTION HANDLERS
// =========================

const handleCreateOrder_ = withTryCatch_((payload) => {
  const normalizedPayload = normalizeOrderPayloadForApi_(payload);
  validate_(validateOrderPayload, normalizedPayload, "INVALID_PAYLOAD");
  return ok_(createOrder(normalizedPayload));
});

const handlePayment_ = withTryCatch_((payload) => {
  const paymentPayload = normalizePaymentPayloadForApi_(payload);
  validate_(validatePaymentPayload, paymentPayload.data, "INVALID_PAYMENT");
  return ok_(
    processIncomingPayment(paymentPayload.provider, paymentPayload.data),
  );
});

const handleGetDelta_ = (payload) => {
  return ok_(getDeltaSince(toNumberSafe_(payload.version, 0)));
};

const handleGetTables_ = () => ok_(getAllTables().map(mapTableForApi_));

const handleGetProducts_ = () => ok_(getProducts());

const handleGetOrders_ = (payload) => ok_(getOrders(payload || {}));

const handleCreateProduct_ = withTryCatch_((payload) => {
  requireRole_(payload.userRole, ["admin"]);
  return ok_(createProduct(payload));
});

const handleUpdateProduct_ = withTryCatch_((payload) => {
  requireRole_(payload.userRole, ["admin"]);
  const missing = requireFields_(payload, ["productId"]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));
  return ok_(
    updateProduct(payload.productId, {
      ...(payload.data || payload),
      userRole: payload.userRole,
    }),
  );
});

const handleDeleteProduct_ = withTryCatch_((payload) => {
  requireRole_(payload.userRole, ["admin"]);
  const missing = requireFields_(payload, ["productId"]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));
  return ok_(deleteProduct(payload.productId, payload));
});

const handleGetDiscounts_ = () => ok_(getCoupons(false));

const handleCreateDiscount_ = withTryCatch_((payload) => {
  requireRole_(payload.userRole, ["admin"]);
  return ok_(createCoupon(payload));
});

const handleUpdateDiscount_ = withTryCatch_((payload) => {
  requireRole_(payload.userRole, ["admin"]);
  const missing = requireFields_(payload, ["discountId"]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));
  return ok_(
    updateCoupon(payload.discountId, {
      ...(payload.data || payload),
      userRole: payload.userRole,
    }),
  );
});

const handleDeleteDiscount_ = withTryCatch_((payload) => {
  requireRole_(payload.userRole, ["admin"]);
  const missing = requireFields_(payload, ["discountId"]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));
  return ok_(deleteCoupon(payload.discountId, payload));
});

const handleLogin_ = withTryCatch_((payload) => {
  const missing = requireFields_(payload, [
    "username",
    "password",
    "fingerprint",
  ]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));
  return ok_(
    authenticate(
      payload.username,
      payload.password,
      payload.requiredRole,
      payload.fingerprint,
    ),
  );
});

const handleVerifyAuth_ = withTryCatch_((payload) => {
  const missing = requireFields_(payload, ["token", "fingerprint"]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));
  return ok_(
    verifyAuthToken(payload.token, payload.requiredRole, payload.fingerprint),
  );
});

const handleLogout_ = withTryCatch_((payload) => {
  const missing = requireFields_(payload, ["token"]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));
  return ok_({ loggedOut: logout(payload.token) });
});

const handleGetStoreInfo_ = () => ok_(getAllStoreInfo());

const handleUpdateStoreInfo_ = withTryCatch_((payload) => {
  requireRole_(payload.userRole, ["admin"]);
  const missing = requireFields_(payload, ["key", "value"]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));
  return ok_(updateStoreInfo(payload.key, payload.value));
});

const handleGetAccounts_ = withTryCatch_((payload) => {
  return ok_(getAllAccounts(payload.userRole));
});

const handleGetAccount_ = withTryCatch_((payload) => {
  const missing = requireFields_(payload, ["accountId"]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));

  const account = getAccount(payload.accountId);
  if (!account) throw new Error("ACCOUNT_NOT_FOUND");

  return ok_(account);
});

const handleCreateAccount_ = withTryCatch_((payload) => {
  const missing = requireFields_(payload, ["username", "password"]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));
  return ok_(
    createAccount(
      payload.userRole,
      payload.username,
      payload.password,
      payload.role,
    ),
  );
});

const handleUpdateAccount_ = withTryCatch_((payload) => {
  const missing = requireFields_(payload, ["accountId"]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));
  return ok_(updateAccount(payload.userRole, payload.accountId, payload.data));
});

const handleDeleteAccount_ = withTryCatch_((payload) => {
  const missing = requireFields_(payload, ["accountId"]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));
  return ok_(deleteAccount(payload.userRole, payload.accountId));
});

const handlePaymentAndroid_ = withTryCatch_((payload) => {
  const missing = requireFields_(payload, ["message"]);
  if (missing) throw new Error("MISSING_FIELDS: " + missing.join(", "));

  return ok_(
    processPaymentFromNotification({
      provider: payload.provider || "",
      title: payload.title || "Payment Notification",
      message: payload.message,
      timestamp: payload.timestamp || toIsoString_(new Date()),
    }),
  );
});

// =========================
// ACTION HANDLERS REGISTRY
// =========================
const ACTION_HANDLERS = Object.freeze({
  CREATE_ORDER: handleCreateOrder_,
  PAYMENT: handlePayment_,
  PAYMENT_ANDROID: handlePaymentAndroid_,
  GET_DELTA: handleGetDelta_,
  GET_TABLES: handleGetTables_,
  GET_PRODUCTS: handleGetProducts_,
  GET_ORDERS: handleGetOrders_,
  CREATE_PRODUCT: handleCreateProduct_,
  UPDATE_PRODUCT: handleUpdateProduct_,
  DELETE_PRODUCT: handleDeleteProduct_,
  GET_DISCOUNTS: handleGetDiscounts_,
  CREATE_DISCOUNT: handleCreateDiscount_,
  UPDATE_DISCOUNT: handleUpdateDiscount_,
  DELETE_DISCOUNT: handleDeleteDiscount_,
  LOGIN: handleLogin_,
  VERIFY_AUTH: handleVerifyAuth_,
  LOGOUT: handleLogout_,
  GET_STORE_INFO: handleGetStoreInfo_,
  UPDATE_STORE_INFO: handleUpdateStoreInfo_,
  GET_ACCOUNTS: handleGetAccounts_,
  GET_ACCOUNT: handleGetAccount_,
  CREATE_ACCOUNT: handleCreateAccount_,
  UPDATE_ACCOUNT: handleUpdateAccount_,
  DELETE_ACCOUNT: handleDeleteAccount_,
});

// =========================
// MAIN ENDPOINT
// =========================
const SLOW_REQUEST_THRESHOLD_MS = 100; // Log if slower than this

/** Tên file HTML trong project GAS (File > New > HTML, đặt tên "index") */
const WEB_APP_HTML_FILE = "index";

function serveWebAppHtml_() {
  return HtmlService.createHtmlOutputFromFile(WEB_APP_HTML_FILE)
    .setTitle("DrinkHub - Staff")
    .addMetaTag("viewport", "width=device-width, initial-scale=1")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

function doGet(e) {
  const requestId = generateId_("req");
  const startTime = Date.now();
  try {
    const action = trimSafe_(e?.parameter?.action || "");

    // Mở Web App (GET không có action) => phục vụ SPA, không kiểm tra API key
    if (!action) {
      return serveWebAppHtml_();
    }

    // Allow public health check without API key
    if (action === "health" || action === "status") {
      return jsonResponse_(
        ok_({
          status: "OK",
          timestamp: toIsoString_(new Date()),
          version: APP_CONFIG.API_VERSION || "1.0",
          expectedKeyLength: APP_CONFIG.API_KEY.length,
        }),
      );
    }

    // GET API: ?action=GET_TABLES&key=...
    let apiKey = trimSafe_(e.parameter?.key || e.parameter?.api_key || "");

    console.log(
      `[${requestId}] API Key check: provided=${apiKey ? "yes" : "no"}, expected=${APP_CONFIG.API_KEY ? "yes" : "no"}`,
    );

    if (!apiKey || apiKey !== APP_CONFIG.API_KEY) {
      console.error(
        `[${requestId}] Unauthorized GET request. Key mismatch or missing.`,
      );
      return jsonResponse_(
        fail_(
          "UNAUTHORIZED",
          apiKey ? "Invalid API key" : "API key is required",
        ),
      );
    }

    const handler = ACTION_HANDLERS[action];
    if (!handler) {
      console.error(`[${requestId}] Invalid action: ${action}`);
      return jsonResponse_(fail_("INVALID_ACTION"));
    }

    const result = handler(e.parameter || {});

    // Log slow requests
    const duration = Date.now() - startTime;
    if (duration > SLOW_REQUEST_THRESHOLD_MS) {
      console.log(`[${requestId}] ${action} took ${duration}ms (SLOW)`);
    }

    return jsonResponse_(result);
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(
      `[${requestId}] Unhandled error in doGet:`,
      err.message,
      `(${duration}ms)`,
    );
    return jsonResponse_(handleError(err));
  }
}

function doPost(e) {
  const requestId = generateId_("req");
  const startTime = Date.now();
  try {
    // DEBUG: Log raw request
    console.log(`[${requestId}] doPost raw e.postData:`, e.postData);
    console.log(
      `[${requestId}] doPost raw contents length:`,
      e.postData?.contents?.length || 0,
    );

    const body = parseJsonSafe_(e.postData?.contents || "", {});

    // DEBUG: Log parsed body
    console.log(`[${requestId}] doPost parsed body:`, JSON.stringify(body));
    console.log(`[${requestId}] doPost body.key:`, body.key);

    // Accept API key from body or query parameter, with trim to remove whitespace
    let apiKey = trimSafe_(
      body.key ||
        body.api_key ||
        e.parameter?.key ||
        e.parameter?.api_key ||
        "",
    );

    console.log(
      `[${requestId}] doPost apiKey after trim:`,
      apiKey ? "SET" : "EMPTY",
    );
    console.log(
      `[${requestId}] doPost APP_CONFIG.API_KEY:`,
      APP_CONFIG.API_KEY,
    );

    if (!apiKey || apiKey !== APP_CONFIG.API_KEY) {
      console.error(`[${requestId}] Unauthorized POST request`);
      const debugInfo = {
        message: apiKey ? "Invalid API key" : "API key is required",
        providedLength: apiKey?.length || 0,
        expectedLength: APP_CONFIG.API_KEY?.length || 0,
        bodyHasKey: !!body.key,
        bodyHasAction: !!body.action,
        requestId,
      };
      console.error(`[${requestId}] Debug info:`, debugInfo);
      return jsonResponse_(fail_("UNAUTHORIZED", JSON.stringify(debugInfo)));
    }

    const action = trimSafe_(body.action);
    if (!action) {
      console.error(`[${requestId}] Missing action`);
      return jsonResponse_(fail_("action is required"));
    }

    const handler = ACTION_HANDLERS[action];
    if (!handler) {
      console.error(`[${requestId}] Invalid action: ${action}`);
      return jsonResponse_(fail_("INVALID_ACTION"));
    }

    const result = handler(body.payload || {});

    // Log slow requests only
    const duration = Date.now() - startTime;
    if (duration > SLOW_REQUEST_THRESHOLD_MS) {
      console.log(`[${requestId}] ${action} took ${duration}ms (SLOW)`);
    }

    return jsonResponse_(result);
  } catch (err) {
    const duration = Date.now() - startTime;
    console.error(
      `[${requestId}] Unhandled error in doPost:`,
      err.message,
      `(${duration}ms)`,
    );
    return jsonResponse_(handleError(err));
  }
}

/**
 * Gọi API từ HTML nhúng trong cùng project GAS (google.script.run).
 * Tránh lỗi fetch cross-origin / redirect POST → GET → trả HTML.
 */
function gasApiBridge(jsonBody) {
  const body =
    typeof jsonBody === "string" ? jsonBody : JSON.stringify(jsonBody || {});
  const output = doPost({
    postData: {
      contents: body,
      type: "text/plain",
      length: body.length,
    },
    parameter: {},
  });
  return output.getContent();
}

function jsonResponse_(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(
    ContentService.MimeType.JSON,
  );
}

function handleError(err) {
  logSystemError_({
    error: err.message,
    stack: err.stack,
    timestamp: toIsoString_(new Date()),
  });
  return {
    success: false,
    error: "Internal Server Error",
    message: err.message,
  };
}
