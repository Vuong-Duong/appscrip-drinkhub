/* =========================
 * src/api/apiClient.js
 * Optimized Google Apps Script API Client
 * ========================= */

/**
 * AVAILABLE BACKEND ACTIONS:
 * - CREATE_ORDER
 * - PAYMENT
 * - GET_DELTA
 * - GET_TABLES
 * - GET_PRODUCTS
 * - GET_ORDERS
 * - CREATE_PRODUCT
 * - UPDATE_PRODUCT
 * - DELETE_PRODUCT
 * - GET_DISCOUNTS
 * - CREATE_DISCOUNT
 * - UPDATE_DISCOUNT
 * - DELETE_DISCOUNT
 * - GET_STORE_INFO
 * - UPDATE_STORE_INFO
 * - LOGIN
 * - VERIFY_AUTH
 * - LOGOUT
 * - GET_ACCOUNTS
 * - GET_ACCOUNT
 * - CREATE_ACCOUNT
 * - UPDATE_ACCOUNT
 * - DELETE_ACCOUNT
 */

/* =========================
 * CONFIG
 * ========================= */

/**
 * Giao tiếp API:
 * - HTML chạy TRONG Apps Script → google.script.run → gasApiBridge() (KHÔNG fetch Web App URL)
 * - npm run dev (localhost) → fetch qua Vite proxy /api/gas
 */
const isGasHtmlHost_ = () =>
  typeof google !== "undefined" && Boolean(google.script?.run);

const resolveDevFetchUrl_ = () => {
  const directUrl = import.meta.env.VITE_GAS_API_URL || "";
  const useProxy =
    import.meta.env.DEV && import.meta.env.VITE_GAS_USE_PROXY !== "false";

  if (useProxy && directUrl.includes("script.google.com")) {
    return "/api/gas";
  }

  return directUrl;
};

const getApiTransport_ = () => {
  if (isGasHtmlHost_()) return "gas-run";
  if (import.meta.env.DEV) return "fetch-dev";
  return "unsupported";
};

export const API_CONFIG = {
  /** Chỉ dùng khi dev (fetch). Trên GAS = null — không gọi Web App URL */
  BASE_URL: import.meta.env.DEV ? resolveDevFetchUrl_() : null,

  API_KEY: import.meta.env.VITE_GAS_API_KEY || "",

  TIMEOUT: 15000,

  SLOW_REQUEST_MS: 1000,

  CACHE_PREFIX: "drinkhub:",

  TRANSPORT: getApiTransport_(),
};

if (import.meta.env.DEV && !API_CONFIG.BASE_URL) {
  throw new Error("Missing VITE_GAS_API_URL environment variable");
}

if (!API_CONFIG.API_KEY) {
  throw new Error("Missing VITE_GAS_API_KEY environment variable");
}

/* =========================
 * API ERROR
 * ========================= */

export class ApiError extends Error {
  constructor(code, details = null) {
    super(code);

    this.name = "ApiError";

    this.code = code;

    this.details = details;
  }
}

/* =========================
 * LOGGER
 * ========================= */

const isDev = import.meta.env.DEV;

const logger = {
  log(...args) {
    if (isDev) {
      console.log(...args);
    }
  },

  /** Luôn ghi log (kể cả khi chạy trên Web App GAS — production build) */
  always(...args) {
    console.log("[DrinkHub API]", ...args);
  },

  error(...args) {
    console.error("[DrinkHub API]", ...args);
  },
};

/** Đợi google.script.run (GAS inject sau khi tải HTML) */
function waitForGoogleScript_(maxMs = 8000) {
  if (google?.script?.run) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      if (google?.script?.run) {
        resolve();
        return;
      }
      if (Date.now() - started >= maxMs) {
        reject(
          new ApiError(
            "GAS_NOT_READY",
            "google.script.run chưa sẵn sàng. Mở app bằng URL Web App /exec hoặc /dev, không mở file HTML trực tiếp.",
          ),
        );
        return;
      }
      setTimeout(tick, 80);
    };
    tick();
  });
}

/* =========================
 * CORE REQUEST
 * ========================= */

function buildRequestBody_(action, payload) {
  return JSON.stringify({
    key: API_CONFIG.API_KEY,
    action,
    payload,
  });
}

function parseGasResponse_(rawText) {
  const trimmed = (rawText || "").trim();

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      return JSON.parse(trimmed);
    } catch (err) {
      throw new ApiError("INVALID_JSON", err.message);
    }
  }

  if (
    trimmed.includes("accounts.google.com") ||
    /Sign in|Đăng nhập/i.test(trimmed)
  ) {
    throw new ApiError(
      "GAS_ACCESS_DENIED",
      'Web App yêu cầu đăng nhập Google. Deploy với "Who has access" = Anyone.',
    );
  }

  if (/<!DOCTYPE|<html/i.test(trimmed)) {
    throw new ApiError(
      "GAS_HTML_RESPONSE",
      "Nhận HTML thay vì JSON — không fetch Web App URL khi chạy trong GAS; dùng google.script.run (gasApiBridge).",
    );
  }

  throw new ApiError(
    "INVALID_RESPONSE",
    `Phản hồi không phải JSON: ${trimmed.slice(0, 160)}`,
  );
}

function unwrapApiResult_(result) {
  if (!result?.success) {
    throw new ApiError(result?.error || "REQUEST_FAILED", result?.details);
  }
  return result.data;
}

function requestViaGasBridge_(action, payload) {
  const bridgePromise = waitForGoogleScript_().then(
    () =>
      new Promise((resolve, reject) => {
        try {
          google.script.run
            .withSuccessHandler((rawText) => {
              try {
                resolve(unwrapApiResult_(parseGasResponse_(rawText)));
              } catch (err) {
                reject(err);
              }
            })
            .withFailureHandler((err) => {
              const msg =
                err?.message ||
                (typeof err === "string" ? err : JSON.stringify(err));
              reject(new ApiError("GAS_BRIDGE_ERROR", msg));
            })
            .gasApiBridge(buildRequestBody_(action, payload));
        } catch (syncErr) {
          reject(
            new ApiError(
              "GAS_BRIDGE_ERROR",
              syncErr?.message || String(syncErr),
            ),
          );
        }
      }),
  );

  const timeoutPromise = new Promise((_, reject) => {
    setTimeout(
      () => reject(new ApiError("REQUEST_TIMEOUT")),
      API_CONFIG.TIMEOUT,
    );
  });

  return Promise.race([bridgePromise, timeoutPromise]);
}

async function requestViaFetch_(action, payload, options = {}) {
  const start = Date.now();
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), API_CONFIG.TIMEOUT);

  try {
    const response = await fetch(API_CONFIG.BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: buildRequestBody_(action, payload),
      signal: options.signal || controller.signal,
      redirect: "follow",
    });

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        throw new ApiError(
          "GAS_ACCESS_DENIED",
          'Google chặn request (401). Deploy Web app: "Who has access" = Anyone, cập nhật VITE_GAS_API_URL.',
        );
      }
      throw new ApiError(
        "HTTP_ERROR",
        `HTTP ${response.status} ${response.statusText}`,
      );
    }

    const data = unwrapApiResult_(parseGasResponse_(await response.text()));
    const duration = Date.now() - start;

    if (duration > API_CONFIG.SLOW_REQUEST_MS) {
      logger.log(`[SLOW API] ${action} took ${duration}ms`);
    }

    return data;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new ApiError("REQUEST_TIMEOUT");
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function request(action, payload = {}, options = {}) {
  const transport = getApiTransport_();
  logger.always(`${action} via ${transport}`);

  try {
    if (transport === "gas-run") {
      return await requestViaGasBridge_(action, payload);
    }

    if (transport === "fetch-dev") {
      return await requestViaFetch_(action, payload, options);
    }

    throw new ApiError(
      "UNSUPPORTED_HOST",
      "Chạy app trong Web App Apps Script (google.script.run) hoặc dev: npm run dev. Không mở dist/index.html trực tiếp và không fetch URL /exec khi nhúng GAS.",
    );
  } catch (err) {
    const apiErr =
      err instanceof ApiError
        ? err
        : new ApiError("NETWORK_ERROR", err?.message || String(err));

    logger.error(`${action} failed`, {
      transport,
      code: apiErr.code,
      details: apiErr.details,
    });
    throw apiErr;
  }
}

// DEBUG HELPER
export async function debugApi(action, payload = {}) {
  const start = Date.now();

  console.log("[DEBUG API] transport:", getApiTransport_(), {
    action,
    apiKey: API_CONFIG.API_KEY ? "(set)" : "(empty)",
  });

  try {
    const data = await request(action, payload);
    const result = { success: true, data };
    console.log("[DEBUG API] OK:", { duration: Date.now() - start });
    return result;
  } catch (err) {
    console.error("[DEBUG API] Error:", err);
    return {
      success: false,
      error: err.code || "DEBUG_ERROR",
      details: err.details || err.message,
    };
  }
}

/* =========================
 * RETRY WRAPPER
 * ========================= */

export async function retryRequest(fn, retries = 3, delay = 1000) {
  let lastError;

  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;

      if (i < retries - 1) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError;
}

/* =========================
 * REQUEST QUEUE
 * GAS-friendly sequential queue
 * ========================= */

const queue = [];

let isProcessing = false;

export function enqueueApi(action, payload) {
  return new Promise((resolve, reject) => {
    queue.push({
      action,
      payload,
      resolve,
      reject,
    });

    setTimeout(processQueue, 0);
  });
}

async function processQueue() {
  if (isProcessing) return;

  isProcessing = true;

  while (queue.length > 0) {
    const item = queue.shift();

    try {
      const result = await request(item.action, item.payload);

      item.resolve(result);
    } catch (err) {
      item.reject(err);
    }
  }

  isProcessing = false;
}

/* =========================
 * LOCAL CACHE
 * ========================= */

export const cache = {
  key(key) {
    return `${API_CONFIG.CACHE_PREFIX}${key}`;
  },

  set(key, value) {
    localStorage.setItem(this.key(key), JSON.stringify(value));
  },

  get(key) {
    const raw = localStorage.getItem(this.key(key));

    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw);
    } catch {
      return null;
    }
  },

  remove(key) {
    localStorage.removeItem(this.key(key));
  },

  clear() {
    Object.keys(localStorage)
      .filter((key) => key.startsWith(API_CONFIG.CACHE_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  },
};

const LOCAL_DB_KEY = {
  PRODUCTS: "drinkhub:local_products",
  DISCOUNTS: "drinkhub:local_discounts",
};

function readLocalArray(key) {
  try {
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeLocalArray(key, value) {
  localStorage.setItem(key, JSON.stringify(Array.isArray(value) ? value : []));
}

function makeLocalId(prefix) {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeProductForLocal(payload = {}) {
  return {
    id: payload.id || makeLocalId("prod_local"),
    name: String(payload.name || "").trim(),
    category: String(payload.category || "").trim(),
    price: toFiniteNumber(payload.price),
    cost: toFiniteNumber(payload.cost),
    stock: toFiniteNumber(payload.stock),
    status: String(payload.status || "ACTIVE").trim().toUpperCase(),
    image: String(payload.image || "").trim(),
  };
}

function normalizeDiscountForLocal(payload = {}) {
  return {
    id: payload.id || makeLocalId("discount_local"),
    code: String(payload.code || "").trim().toUpperCase(),
    type: String(payload.type || "fixed").trim().toLowerCase(),
    value: toFiniteNumber(payload.value),
    minOrderValue: toFiniteNumber(payload.minOrderValue),
    maxDiscount: toFiniteNumber(payload.maxDiscount),
    status: String(payload.status || "ACTIVE").trim().toUpperCase(),
    expiresAt: String(payload.expiresAt || "").trim(),
  };
}

function seedLocalProducts(products) {
  const current = readLocalArray(LOCAL_DB_KEY.PRODUCTS);
  if (!current.length && Array.isArray(products)) {
    writeLocalArray(LOCAL_DB_KEY.PRODUCTS, products);
  }
}

function normalizeOrderPayload(payload = {}) {
  const items = Array.isArray(payload.items)
    ? payload.items.map((item) => {
        const safeItem = item || {};
        const quantity = toFiniteNumber(safeItem.quantity, 1);
        const unitPrice = toFiniteNumber(
          safeItem.unitPrice ?? safeItem.price,
          0,
        );
        return {
          ...safeItem,
          productId: String(safeItem.productId ?? safeItem.id ?? "").trim(),
          productName: String(
            safeItem.productName ?? safeItem.name ?? "",
          ).trim(),
          quantity,
          unitPrice,
          subtotal: toFiniteNumber(safeItem.subtotal, quantity * unitPrice),
        };
      })
    : payload.items;

  const subtotal = toFiniteNumber(
    payload.subtotal,
    Array.isArray(items)
      ? items.reduce((sum, item) => sum + toFiniteNumber(item.subtotal), 0)
      : 0,
  );
  const discount = toFiniteNumber(payload.discount);

  return {
    ...payload,
    items,
    subtotal,
    discount,
    grandTotal: toFiniteNumber(payload.grandTotal, subtotal - discount),
  };
}

function toFiniteNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeTable(table) {
  return {
    ...table,
    status: String(table.status || "").toLowerCase(),
  };
}

/* =========================
 * ORDER API
 * ========================= */

export const orderApi = {
  createOrder(payload) {
    return request("CREATE_ORDER", normalizeOrderPayload(payload));
  },

  getOrders(filters = {}) {
    return request("GET_ORDERS", filters);
  },

  getDelta(version) {
    return request("GET_DELTA", {
      version,
    });
  },
};

/* =========================
 * PRODUCT API
 * ========================= */

export const productApi = {
  async getProducts() {
    try {
      const products = await request("GET_PRODUCTS");
      seedLocalProducts(products);
      return products;
    } catch (err) {
      const products = readLocalArray(LOCAL_DB_KEY.PRODUCTS);
      if (products.length) return products.filter((item) => item.status !== "DELETED");
      throw err;
    }
  },

  async createProduct(payload) {
    try {
      return await request("CREATE_PRODUCT", payload);
    } catch {
      const products = readLocalArray(LOCAL_DB_KEY.PRODUCTS);
      const product = normalizeProductForLocal(payload);
      writeLocalArray(LOCAL_DB_KEY.PRODUCTS, [...products, product]);
      return product;
    }
  },

  async updateProduct(productId, payload) {
    try {
      return await request("UPDATE_PRODUCT", {
        productId,
        data: payload,
        userRole: payload.userRole,
      });
    } catch {
      const products = readLocalArray(LOCAL_DB_KEY.PRODUCTS);
      const product = normalizeProductForLocal({ ...payload, id: productId });
      const exists = products.some((item) => item.id === productId);
      const updated = exists
        ? products.map((item) =>
            item.id === productId
              ? normalizeProductForLocal({ ...item, ...payload, id: productId })
              : item,
          )
        : [...products, product];
      writeLocalArray(LOCAL_DB_KEY.PRODUCTS, updated);
      return updated.find((item) => item.id === productId) || product;
    }
  },

  async deleteProduct(productId, userRole) {
    try {
      return await request("DELETE_PRODUCT", {
        productId,
        userRole,
      });
    } catch {
      const products = readLocalArray(LOCAL_DB_KEY.PRODUCTS);
      const updated = products.map((item) =>
        item.id === productId ? { ...item, status: "DELETED" } : item,
      );
      writeLocalArray(LOCAL_DB_KEY.PRODUCTS, updated);
      return updated.find((item) => item.id === productId) || null;
    }
  },
};

/* =========================
 * DISCOUNT API
 * ========================= */

export const discountApi = {
  async getDiscounts() {
    try {
      const discounts = await request("GET_DISCOUNTS");
      writeLocalArray(LOCAL_DB_KEY.DISCOUNTS, discounts);
      return discounts;
    } catch {
      return readLocalArray(LOCAL_DB_KEY.DISCOUNTS).filter(
        (item) => item.status !== "DELETED",
      );
    }
  },

  async createDiscount(payload) {
    try {
      return await request("CREATE_DISCOUNT", payload);
    } catch {
      const discounts = readLocalArray(LOCAL_DB_KEY.DISCOUNTS);
      const discount = normalizeDiscountForLocal(payload);
      writeLocalArray(LOCAL_DB_KEY.DISCOUNTS, [...discounts, discount]);
      return discount;
    }
  },

  async updateDiscount(discountId, payload) {
    try {
      return await request("UPDATE_DISCOUNT", {
        discountId,
        data: payload,
        userRole: payload.userRole,
      });
    } catch {
      const discounts = readLocalArray(LOCAL_DB_KEY.DISCOUNTS);
      const discount = normalizeDiscountForLocal({ ...payload, id: discountId });
      const exists = discounts.some((item) => item.id === discountId);
      const updated = exists
        ? discounts.map((item) =>
            item.id === discountId
              ? normalizeDiscountForLocal({ ...item, ...payload, id: discountId })
              : item,
          )
        : [...discounts, discount];
      writeLocalArray(LOCAL_DB_KEY.DISCOUNTS, updated);
      return updated.find((item) => item.id === discountId) || discount;
    }
  },

  async deleteDiscount(discountId, userRole) {
    try {
      return await request("DELETE_DISCOUNT", {
        discountId,
        userRole,
      });
    } catch {
      const discounts = readLocalArray(LOCAL_DB_KEY.DISCOUNTS);
      const updated = discounts.map((item) =>
        item.id === discountId ? { ...item, status: "DELETED" } : item,
      );
      writeLocalArray(LOCAL_DB_KEY.DISCOUNTS, updated);
      return updated.find((item) => item.id === discountId) || null;
    }
  },
};

/* =========================
 * TABLE API
 * ========================= */

export const tableApi = {
  async getTables() {
    const tables = await request("GET_TABLES");
    return Array.isArray(tables) ? tables.map(normalizeTable) : tables;
  },
};

/* =========================
 * STORE API
 * ========================= */

export const storeApi = {
  async getStoreInfo() {
    const storeInfo = await request("GET_STORE_INFO");
    if (!Array.isArray(storeInfo)) {
      return storeInfo || {};
    }

    return storeInfo.reduce((acc, item) => {
      if (item?.key) {
        acc[item.key] = item.value ?? "";
      }
      return acc;
    }, {});
  },

  updateStoreInfo(userRole, key, value) {
    return request("UPDATE_STORE_INFO", {
      userRole,
      key,
      value,
    });
  },
};

/* =========================
 * PAYMENT API
 * ========================= */

export const paymentApi = {
  processPayment(data) {
    return request("PAYMENT", data);
  },
};

/* =========================
 * AUTH API
 * ========================= */

function getAuthDeviceId() {
  const cacheKey = "auth_device_id";
  const cached = cache.get(cacheKey);

  if (cached) {
    return cached;
  }

  const deviceId =
    globalThis.crypto?.randomUUID?.() ||
    `device_${Date.now()}_${Math.random().toString(36).slice(2)}`;

  cache.set(cacheKey, deviceId);
  return deviceId;
}

export const authApi = {
  login(
    username,
    password,
    requiredRole = null,
    fingerprint = getAuthDeviceId(),
  ) {
    return request("LOGIN", {
      username,
      password,
      requiredRole,
      fingerprint,
    });
  },

  verify(token, requiredRole = null, fingerprint = getAuthDeviceId()) {
    return request("VERIFY_AUTH", {
      token,
      requiredRole,
      fingerprint,
    });
  },

  logout(token) {
    return request("LOGOUT", {
      token,
    });
  },
};

/* =========================
 * ACCOUNT API
 * ========================= */

export const accountApi = {
  getAllAccounts(userRole) {
    return request("GET_ACCOUNTS", {
      userRole,
    });
  },

  getAccount(accountId) {
    return request("GET_ACCOUNT", {
      accountId,
    });
  },

  createAccount(userRole, username, password, role = "staff") {
    return request("CREATE_ACCOUNT", {
      userRole,
      username,
      password,
      role,
    });
  },

  updateAccount(userRole, accountId, data) {
    return request("UPDATE_ACCOUNT", {
      userRole,
      accountId,
      data,
    });
  },

  deleteAccount(userRole, accountId) {
    return request("DELETE_ACCOUNT", {
      userRole,
      accountId,
    });
  },
};

/* =========================
 * SHIFT API
 * ========================= */

export const shiftApi = {
  getShifts(filters = {}) {
    return request("GET_SHIFTS", filters);
  },

  createShift(payload) {
    return request("CREATE_SHIFT", payload);
  },

  closeShift(shiftId, payload) {
    return request("CLOSE_SHIFT", {
      shiftId,
      ...payload,
    });
  },
};

/* =========================
 * REPORT API
 * ========================= */

export const reportApi = {
  getReport(filters = {}) {
    return request("GET_REPORT", filters);
  },
};

/* =========================
 * POLLING SYSTEM
 * ========================= */

let pollingInterval = null;

export function startDeltaPolling(getVersion, callback, interval = 5000) {
  stopDeltaPolling();

  pollingInterval = setInterval(
    async () => {
      try {
        const version = getVersion();

        const delta = await orderApi.getDelta(version);

        if (delta) {
          callback(delta);
        }
      } catch (err) {
        logger.error("[POLLING ERROR]", err);
      }
    },

    interval,
  );
}

export function stopDeltaPolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval);

    pollingInterval = null;
  }
}
