/* =========================
 * Core.gs - shared config, schema, utilities, and helpers
 * ========================= */

const getScriptProperty_ = (key, fallback = "") => {
  try {
    if (typeof PropertiesService === "undefined") return fallback;
    const value = PropertiesService.getScriptProperties().getProperty(key);
    return value === null || value === undefined ? fallback : value;
  } catch (err) {
    return fallback;
  }
};

const APP_CONFIG = Object.freeze({
  API_VERSION: "1.0",
  API_KEY: getScriptProperty_("API_KEY", ""),
  MOMO_SECRET_KEY: getScriptProperty_("MOMO_SECRET_KEY", ""),
  MOMO_PARTNER_CODE: getScriptProperty_("MOMO_PARTNER_CODE", ""),
  SPREADSHEET_ID: getScriptProperty_("SPREADSHEET_ID", ""),
  CACHE_TTL_SEC: 300,
  SNAPSHOT_VERSION: "v1",
  DELTA_LIMIT: 500,
  QUEUE_SHEET: "Queue",
  INVENTORY_JOURNAL_SHEET: "Kho Lịch Sử",
  LOCK_WAIT_MS: 30000,
});

const SHEET_NAME = Object.freeze({
  ACCOUNT: "Tài khoản",
  PRODUCT: "Hàng hoá",
  INVENTORY: "Kho hàng",
  ORDER: "Đơn hàng",
  ORDER_DETAIL: "Chi tiết đơn hàng",
  ORDER_SNAPSHOT: "Snapshot Đơn Hàng",
  TABLE: "Bàn",
  PAYMENT: "Thanh toán",
  LOG: "Log",
  STORE_INFO: "Thông tin quán",
  COUPON: "Khuyến mãi",
  SHIFT: "Ca",
});

const SHEET_SCHEMA = Object.freeze({
  ACCOUNT: Object.freeze({
    ID: 0,
    USERNAME: 1,
    PASSWORD: 2,
    ROLE: 3,
    CREATED_AT: 4,
    LAST_LOGIN: 5,
  }),
  PRODUCT: Object.freeze({
    ID: 0,
    NAME: 1,
    CATEGORY: 2,
    SALE_PRICE: 3,
    COST_PRICE: 4,
    STOCK: 5,
    STATUS: 6,
    IMAGE: 7,
  }),
  INVENTORY: Object.freeze({
    ID: 0,
    PRODUCT_ID: 1,
    SUPPLIER: 2,
    QUANTITY: 3,
    CREATED_BY: 4,
    CREATED_AT: 5,
  }),
  ORDER: Object.freeze({
    ID: 0,
    TABLE_ID: 1,
    CUSTOMER_NAME: 2,
    STATUS: 3,
    SUBTOTAL: 4,
    DISCOUNT: 5,
    GRAND_TOTAL: 6,
    PAYMENT_STATUS: 7,
    CREATED_BY: 8,
    CREATED_AT: 9,
  }),
  ORDER_DETAIL: Object.freeze({
    ID: 0,
    ORDER_ID: 1,
    PRODUCT_ID: 2,
    PRODUCT_NAME: 3,
    QUANTITY: 4,
    UNIT_PRICE: 5,
    SUBTOTAL: 6,
  }),
  ORDER_SNAPSHOT: Object.freeze({
    ORDER_ID: 0,
    SNAPSHOT_DATA: 1,
    VERSION: 2,
    FROZEN_AT: 3,
  }),
  TABLE: Object.freeze({
    ID: 0,
    NAME: 1,
    STATUS: 2,
    CURRENT_ORDER_ID: 3,
  }),
  PAYMENT: Object.freeze({
    ID: 0,
    ORDER_ID: 1,
    PROVIDER: 2,
    AMOUNT: 3,
    STATUS: 4,
    TRANSACTION_ID: 5,
    PAID_AT: 6,
    RECORDED_BY: 7,
    FINGERPRINT: 8,
  }),
  LOG: Object.freeze({
    ID: 0,
    ACTION: 1,
    TARGET: 2,
    ACCOUNT: 3,
    DETAILS: 4,
    TIMESTAMP: 5,
  }),
  STORE_INFO: Object.freeze({
    KEY: 0,
    VALUE: 1,
  }),
  COUPON: Object.freeze({
    ID: 0,
    CODE: 1,
    TYPE: 2,
    VALUE: 3,
    MIN_ORDER_VALUE: 4,
    MAX_DISCOUNT: 5,
    STATUS: 6,
    EXPIRES_AT: 7,
  }),
  SHIFT: Object.freeze({
    ID: 0,
    STAFF_NAME: 1,
    START_TIME: 2,
    END_TIME: 3,
    OPENING_CASH: 4,
    TOTAL_REVENUE: 5,
    TOTAL_PAID: 6,
    CASH_IN_REGISTER: 7,
    STATUS: 8,
    CREATED_AT: 9,
    CLOSED_AT: 10,
  }),
});

let _sheetDataCache_ = {};

const trimSafe_ = (value) => {
  if (value === null || value === undefined) return "";
  return String(value).trim();
};

const toIsoString_ = (value) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime())
    ? new Date().toISOString()
    : date.toISOString();
};

const toNumberSafe_ = (value, fallback = 0) => {
  if (value === null || value === undefined || value === "") return fallback;
  const number =
    typeof value === "number" ? value : Number(String(value).replace(/,/g, ""));
  return Number.isFinite(number) ? number : fallback;
};

const generateId_ = (prefix = "id") => {
  const safePrefix = trimSafe_(prefix) || "id";
  let unique = "";

  if (typeof Utilities !== "undefined" && Utilities.getUuid) {
    unique = Utilities.getUuid().replace(/-/g, "").slice(0, 12);
  } else {
    unique = Math.random().toString(36).slice(2, 14);
  }

  return `${safePrefix}_${Date.now()}_${unique}`;
};

const deepClone_ = (obj) => {
  if (obj === null || obj === undefined) return obj;
  return JSON.parse(JSON.stringify(obj));
};

const parseJsonSafe_ = (value, fallback = {}) => {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value !== "string") return value;

  try {
    return JSON.parse(value);
  } catch (err) {
    return fallback;
  }
};

const getSpreadsheet_ = () => {
  if (typeof SpreadsheetApp === "undefined") {
    throw new Error("SPREADSHEET_SERVICE_UNAVAILABLE");
  }

  if (APP_CONFIG.SPREADSHEET_ID) {
    return SpreadsheetApp.openById(APP_CONFIG.SPREADSHEET_ID);
  }

  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) throw new Error("SPREADSHEET_NOT_FOUND");
  return spreadsheet;
};

const ensureSetupIfAvailable_ = () => {
  if (typeof ensureSpreadsheetSetup_ === "function") {
    ensureSpreadsheetSetup_();
  }
};

const getSheet_ = (sheetName) => {
  const name = trimSafe_(sheetName);
  if (!name) throw new Error("SHEET_NAME_REQUIRED");

  ensureSetupIfAvailable_();
  const spreadsheet = getSpreadsheet_();
  const sheet = spreadsheet.getSheetByName(name);
  if (!sheet) throw new Error("SHEET_NOT_FOUND: " + name);
  return sheet;
};

const getSheetData_ = (sheetName, useCache = true) => {
  const name = trimSafe_(sheetName);
  if (useCache && _sheetDataCache_[name]) {
    return deepClone_(_sheetDataCache_[name]);
  }

  const sheet = getSheet_(name);
  const lastRow = sheet.getLastRow();
  const lastColumn = sheet.getLastColumn();
  const data =
    lastRow && lastColumn
      ? sheet.getRange(1, 1, lastRow, lastColumn).getValues()
      : [];

  if (useCache) _sheetDataCache_[name] = deepClone_(data);
  return data;
};

const invalidateSheetCache_ = (sheetName) => {
  const name = trimSafe_(sheetName);
  if (name) {
    delete _sheetDataCache_[name];
    return;
  }

  _sheetDataCache_ = {};
};

const normalizeRowsForWrite_ = (rows) => {
  const normalizedRows = Array.isArray(rows) ? rows : [];
  const width = normalizedRows.reduce(
    (max, row) => Math.max(max, Array.isArray(row) ? row.length : 0),
    0,
  );

  return normalizedRows.map((row) => {
    const safeRow = Array.isArray(row) ? row.slice() : [];
    while (safeRow.length < width) safeRow.push("");
    return safeRow;
  });
};

const appendRowsBatch_ = (sheetName, rows) => {
  const values = normalizeRowsForWrite_(rows);
  if (!values.length || !values[0].length) return { appended: 0 };

  const sheet = getSheet_(sheetName);
  const startRow = sheet.getLastRow() + 1;
  sheet
    .getRange(startRow, 1, values.length, values[0].length)
    .setValues(values);
  invalidateSheetCache_(sheetName);
  return { appended: values.length, startRow };
};

const batchWriteRows_ = (sheetName, startRow, numRows, rows) => {
  const values = normalizeRowsForWrite_(rows);
  if (!values.length || !values[0].length) return { written: 0 };

  const sheet = getSheet_(sheetName);
  const rowCount = numRows || values.length;
  sheet.getRange(startRow, 1, rowCount, values[0].length).setValues(values);
  invalidateSheetCache_(sheetName);
  return { written: rowCount, startRow };
};

const findRowById_ = (sheetName, id, idColumnIndex = 0) => {
  const targetId = trimSafe_(id);
  if (!targetId) return null;

  const rows = getSheetData_(sheetName, false);
  for (let i = 1; i < rows.length; i++) {
    if (trimSafe_(rows[i][idColumnIndex]) === targetId) {
      return {
        rowIndex: i + 1,
        values: rows[i],
      };
    }
  }

  return null;
};

let IS_SCRIPT_LOCKED_ = false;

const withLock_ = (lockName, callback) => {
  if (typeof callback !== "function") throw new Error("LOCK_CALLBACK_REQUIRED");

  if (IS_SCRIPT_LOCKED_) {
    return callback();
  }

  if (typeof LockService === "undefined") {
    return callback();
  }

  const lock = LockService.getScriptLock();
  lock.waitLock(APP_CONFIG.LOCK_WAIT_MS);
  IS_SCRIPT_LOCKED_ = true;
  try {
    return callback();
  } finally {
    IS_SCRIPT_LOCKED_ = false;
    lock.releaseLock();
  }
};

const withPaymentLock_ = (lockId, callback) =>
  withLock_("payment:" + lockId, callback);

const withTransaction_ = (transactionId, callback) =>
  withLock_("transaction:" + transactionId, callback);

const withStockLock_ = (productId, callback) =>
  withLock_("stock:" + productId, callback);

const getStoreInfo_ = (useCache = true) => {
  const rows = getSheetData_(SHEET_NAME.STORE_INFO, useCache);
  const info = {};

  for (let i = 1; i < rows.length; i++) {
    const key = trimSafe_(rows[i][SHEET_SCHEMA.STORE_INFO.KEY]);
    if (!key) continue;
    info[key] = trimSafe_(rows[i][SHEET_SCHEMA.STORE_INFO.VALUE]);
  }

  return info;
};

const writeLog_ = (action, target, account, details) => {
  const row = [
    generateId_("log"),
    trimSafe_(action),
    trimSafe_(target),
    trimSafe_(account || "system"),
    typeof details === "string" ? details : JSON.stringify(details || {}),
    toIsoString_(new Date()),
  ];

  appendRowsBatch_(SHEET_NAME.LOG, [row]);
  return { id: row[SHEET_SCHEMA.LOG.ID] };
};

const logAction_ = (action, target, account, details) => {
  try {
    return writeLog_(action, target, account, details);
  } catch (err) {
    console.error("logAction_ failed:", err.message);
    return null;
  }
};

// =========================
// API RESPONSE / VALIDATION HELPERS
// =========================
const ok_ = (data) => ({
  success: true,
  data: data ?? null,
});

const fail_ = (error, details) => ({
  success: false,
  error,
  details: details ?? null,
});

const requireFields_ = (payload, fields) => {
  const safePayload = payload || {};
  const missing = fields.filter(
    (field) => safePayload[field] === undefined || safePayload[field] === null,
  );
  return missing.length ? missing : null;
};

const requireRole_ = (role, allowed) => {
  if (!role) throw new Error("ROLE_REQUIRED");
  checkPermission(role, allowed);
};

const validate_ = (validator, payload, errorCode) => {
  const validation = validator(payload);
  if (!validation.valid) {
    throw new Error(errorCode + ": " + validation.errors.join(", "));
  }
};

// =========================
// PERSISTENT CACHE FIRST - ENHANCEMENTS
// =========================

/**
 * Backend Row Index Map Cache
 * Maps id → row number for quick lookup without full sheet scan
 */
let _rowIndexMapCache_ = {};

const buildRowIndexMap_ = (sheetName, idColumnIndex = 0) => {
  const cacheKey = `${sheetName}_indexMap`;
  const rows = getSheetData_(sheetName, true);
  const map = {};

  for (let i = 1; i < rows.length; i++) {
    const id = trimSafe_(rows[i][idColumnIndex]);
    if (id) {
      map[id] = i + 1; // Sheet rows are 1-indexed
    }
  }

  _rowIndexMapCache_[cacheKey] = map;
  return map;
};

const getRowIndexMap_ = (sheetName, idColumnIndex = 0) => {
  const cacheKey = `${sheetName}_indexMap`;
  if (_rowIndexMapCache_[cacheKey]) {
    return _rowIndexMapCache_[cacheKey];
  }
  return buildRowIndexMap_(sheetName, idColumnIndex);
};

const invalidateRowIndexMap_ = (sheetName) => {
  const cacheKey = `${sheetName}_indexMap`;
  delete _rowIndexMapCache_[cacheKey];
};

/**
 * Soft Delete Helper
 * Check if row is deleted (STATUS = "DELETED")
 */
const isRowDeleted_ = (row, statusColumnIndex) => {
  if (statusColumnIndex === undefined) return false;
  const status = trimSafe_(row[statusColumnIndex]);
  return status === "DELETED";
};

/**
 * Retry Safe Wrapper with exponential backoff
 * @param {Function} callback
 * @param {number} maxRetries - Default 3
 * @param {number} baseDelayMs - Default 100
 * @returns {*} Result from callback
 */
function withRetry_(callback, maxRetries, baseDelayMs) {
  maxRetries = maxRetries === undefined ? 3 : maxRetries;
  baseDelayMs = baseDelayMs === undefined ? 100 : baseDelayMs;
  if (typeof callback !== "function") throw new Error("CALLBACK_REQUIRED");

  var lastError;
  for (var attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return callback();
    } catch (err) {
      lastError = err;
      var isLastAttempt = attempt === maxRetries - 1;

      if (isLastAttempt) break;

      // Exponential backoff: 100ms, 200ms, 400ms
      var delayMs = baseDelayMs * Math.pow(2, attempt);
      Utilities.sleep(delayMs);
    }
  }

  throw new Error(
    "RETRY_EXHAUSTED (" + maxRetries + " attempts): " + lastError.message
  );
}

/**
 * Schema Validator for batch data
 * Validates required fields before write
 */
const validateBatchData_ = (
  records,
  requiredFields = [],
  maxRecords = 1000,
) => {
  const errors = [];

  if (!Array.isArray(records)) {
    throw new Error("BATCH_NOT_ARRAY");
  }

  if (records.length === 0) {
    throw new Error("BATCH_EMPTY");
  }

  if (records.length > maxRecords) {
    throw new Error(
      `BATCH_TOO_LARGE: max ${maxRecords}, got ${records.length}`,
    );
  }

  records.forEach((record, idx) => {
    if (!record || typeof record !== "object") {
      errors.push(`Record ${idx}: not an object`);
      return;
    }

    requiredFields.forEach((field) => {
      const value = record[field];
      if (value === null || value === undefined || value === "") {
        errors.push(`Record ${idx}: missing ${field}`);
      }
    });
  });

  if (errors.length > 0) {
    throw new Error("VALIDATION_FAILED: " + errors.join("; "));
  }

  return true;
};

/**
 * Backend Cache Layer - for caching all entities data
 * Used for first install getAllDataForCache()
 */
const backendCacheStore_ = () => {
  const props = PropertiesService.getScriptProperties();
  return {
    set: (key, value, ttlSeconds = 3600) => {
      const data = {
        value,
        expiredAt: Date.now() + ttlSeconds * 1000,
      };
      props.setProperty(key, JSON.stringify(data));
    },
    get: (key) => {
      const raw = props.getProperty(key);
      if (!raw) return null;

      try {
        const data = JSON.parse(raw);
        if (data.expiredAt && Date.now() > data.expiredAt) {
          props.deleteProperty(key);
          return null;
        }
        return data.value;
      } catch (e) {
        return null;
      }
    },
    del: (key) => {
      props.deleteProperty(key);
    },
    clear: () => {
      props.deleteAllProperties();
    },
  };
};
