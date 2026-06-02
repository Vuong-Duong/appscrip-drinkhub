/**
 * Backend.gs - Persistent Cache First Integration
 *
 * Exposes:
 * - getAllDataForCache() - Return all entities (first install)
 * - batchCRUDWithSync() - Batch CRUD operations with transaction
 *
 * Features:
 * - Bulk write optimization (appendRowsBatch_)
 * - Soft delete support (STATUS = "DELETED")
 * - Schema validation
 * - Row index map cache (quick id→row lookup)
 * - Retry safe operations
 * - Batch transaction with locks
 *
 * Uses Core.js utilities:
 * - getSheetData_, appendRowsBatch_, batchWriteRows_
 * - findRowById_, withTransaction_
 * - validateBatchData_, withRetry_
 * - getRowIndexMap_, invalidateRowIndexMap_
 * - backendCacheStore_
 */

// Schema for each entity - required fields validation
const CACHE_FIRST_SCHEMA = {
  products: {
    required: ["id", "name"],
    idColumn: SHEET_SCHEMA.PRODUCT.ID,
    statusColumn: SHEET_SCHEMA.PRODUCT.STATUS,
  },
  orders: {
    required: ["id"],
    idColumn: SHEET_SCHEMA.ORDER.ID,
    statusColumn: SHEET_SCHEMA.ORDER.STATUS,
  },
  tables: {
    required: ["id", "name"],
    idColumn: SHEET_SCHEMA.TABLE.ID,
    statusColumn: SHEET_SCHEMA.TABLE.STATUS,
  },
  discounts: {
    required: ["id"],
    idColumn: SHEET_SCHEMA.COUPON.ID,
    statusColumn: SHEET_SCHEMA.COUPON.STATUS,
  },
  payments: {
    required: ["id"],
    idColumn: SHEET_SCHEMA.PAYMENT.ID,
    statusColumn: -1, // No status column
  },
  shifts: {
    required: ["id"],
    idColumn: SHEET_SCHEMA.SHIFT.ID,
    statusColumn: SHEET_SCHEMA.SHIFT.STATUS,
  },
  orderDetails: {
    required: ["id", "orderId"],
    idColumn: SHEET_SCHEMA.ORDER_DETAIL.ID,
    statusColumn: -1,
  },
};

const SHEET_NAMES_FOR_CACHE = {
  products: SHEET_NAME.PRODUCT,
  orders: SHEET_NAME.ORDER,
  tables: SHEET_NAME.TABLE,
  discounts: SHEET_NAME.COUPON,
  payments: SHEET_NAME.PAYMENT,
  shifts: SHEET_NAME.SHIFT,
  orderDetails: SHEET_NAME.ORDER_DETAIL,
};

/**
 * Vietnamese header → English field name mapping
 * Must match headers defined in Setup.js SHEET_SETUP_DEFINITIONS_
 * and SHEET_SCHEMA column order in Core.js
 */
const VN_TO_EN_HEADER_MAP_ = {
  products: {
    "Mã sản phẩm": "id",
    "Tên sản phẩm": "name",
    "Danh mục": "category",
    "Giá bán": "price",
    "Giá vốn": "cost",
    "Tồn kho": "stock",
    "Trạng thái": "status",
    "Hình ảnh": "image",
  },
  orders: {
    "Mã đơn": "id",
    "Mã bàn": "tableId",
    "Tên khách": "customerName",
    "Trạng thái": "status",
    "Tạm tính": "subtotal",
    "Giảm giá": "discount",
    "Tổng cộng": "grandTotal",
    "Trạng thái thanh toán": "paymentStatus",
    "Người tạo": "createdBy",
    "Ngày tạo": "createdAt",
  },
  tables: {
    "Mã bàn": "id",
    "Tên bàn": "name",
    "Trạng thái": "status",
    "Đơn hiện tại": "currentOrderId",
  },
  discounts: {
    Mã: "id",
    Code: "code",
    "Loại giảm giá": "type",
    "Giá trị giảm": "value",
    "Đơn tối thiểu": "minOrderValue",
    "Giảm tối đa": "maxDiscount",
    "Trạng thái": "status",
    "Ngày hết hạn": "expiresAt",
  },
  payments: {
    "Mã thanh toán": "id",
    "Mã đơn": "orderId",
    "Phương thức": "provider",
    "Số tiền": "amount",
    "Trạng thái": "status",
    "Mã giao dịch": "transactionId",
    "Thời gian thanh toán": "paidAt",
    "Người ghi nhận": "recordedBy",
    Fingerprint: "fingerprint",
  },
  shifts: {
    "Mã ca": "id",
    "Tên nhân viên": "staffName",
    "Thời gian bắt đầu": "startTime",
    "Thời gian kết thúc": "endTime",
    "Tiền mặt mở ca": "openingCash",
    "Tổng doanh thu": "totalRevenue",
    "Tổng thanh toán": "totalPaid",
    "Tiền mặt trong két": "cashInRegister",
    "Trạng thái": "status",
    "Ngày tạo": "createdAt",
    "Ngày đóng": "closedAt",
  },
  orderDetails: {
    "Mã dòng": "id",
    "Mã đơn": "orderId",
    "Mã sản phẩm": "productId",
    "Tên sản phẩm": "productName",
    "Số lượng": "quantity",
    "Đơn giá": "unitPrice",
    "Thành tiền": "subtotal",
  },
};

/**
 * getAllDataForCache() - Fetch all data for first install
 * Called once when app opens for first time
 * Uses bulk read optimization, returns all entities
 *
 * @returns {Object} All entities: {products: [...], orders: [...], ...}
 */
function getAllDataForCache() {
  try {
    const startTime = new Date();
    console.log("[getAllDataForCache] Started");

    return withRetry_(
      () => {
        const allData = {};

        // Bulk read each entity directly from Sheets
        Object.keys(SHEET_NAMES_FOR_CACHE).forEach((entity) => {
          try {
            const sheetName = SHEET_NAMES_FOR_CACHE[entity];
            const schema = CACHE_FIRST_SCHEMA[entity];
            const rawData = getSheetData_(sheetName, true);

            allData[entity] = rawDataToObjects_(
              rawData,
              schema,
              sheetName,
              entity,
            );
          } catch (e) {
            console.error(
              `[getAllDataForCache] Error reading ${entity}:`,
              e.message,
            );
            allData[entity] = [];
          }
        });

        // Add settings manually from STORE_INFO
        try {
          const storeInfoArray = getAllStoreInfo();
          const settingsObj = {};
          storeInfoArray.forEach((item) => {
            if (item.key) {
              settingsObj[item.key] = item.value;
            }
          });
          allData.settings = settingsObj;
        } catch (e) {
          console.error(
            "[getAllDataForCache] Error reading settings:",
            e.message,
          );
          allData.settings = {};
        }

        const elapsed = new Date() - startTime;
        console.log(`[getAllDataForCache] Completed in ${elapsed}ms`);

        return allData;
      },
      3,
      100,
    );
  } catch (error) {
    console.error("[getAllDataForCache] Failed:", error.message);
    throw new Error("GET_DATA_FAILED: " + error.message);
  }
}

/**
 * batchCRUDWithSync() - Handle batch CRUD operations
 * Atomic transaction with rollback capability
 *
 * @param {Object} syncData - {creates: [], updates: [], deletes: []}
 *   - creates: [{entity: 'products', data: {...}}]
 *   - updates: [{entity: 'products', data: {id, ...fields}}]
 *   - deletes: [{entity: 'products', id: 'xxx'}]
 * @returns {Object} {success, stats, errors}
 */
function batchCRUDWithSync(syncData) {
  try {
    const startTime = new Date();
    console.log("[batchCRUDWithSync] Started with:", syncData);

    return withRetry_(
      () => {
        // Validate input
        if (!syncData || typeof syncData !== "object") {
          throw new Error("INVALID_SYNC_DATA");
        }

        const stats = {
          created: 0,
          updated: 0,
          deleted: 0,
          errors: [],
        };

        // Run in transaction with lock
        return withTransaction_("batch_crud_sync", () => {
          // Process creates
          if (Array.isArray(syncData.creates) && syncData.creates.length > 0) {
            syncData.creates.forEach((op, idx) => {
              try {
                createRowForSync_(op.entity, op.data, stats);
                stats.created++;
              } catch (e) {
                stats.errors.push({
                  type: "create",
                  entity: op.entity,
                  index: idx,
                  message: e.message,
                });
              }
            });
          }

          // Process updates
          if (Array.isArray(syncData.updates) && syncData.updates.length > 0) {
            syncData.updates.forEach((op, idx) => {
              try {
                updateRowForSync_(op.entity, op.data, stats);
                stats.updated++;
              } catch (e) {
                stats.errors.push({
                  type: "update",
                  entity: op.entity,
                  index: idx,
                  message: e.message,
                });
              }
            });
          }

          // Process deletes (soft delete)
          if (Array.isArray(syncData.deletes) && syncData.deletes.length > 0) {
            syncData.deletes.forEach((op, idx) => {
              try {
                softDeleteRowForSync_(op.entity, op.id, stats);
                stats.deleted++;
              } catch (e) {
                stats.errors.push({
                  type: "delete",
                  entity: op.entity,
                  index: idx,
                  message: e.message,
                });
              }
            });
          }

          // Invalidate caches after successful operations
          Object.values(SHEET_NAMES_FOR_CACHE).forEach((sheetName) => {
            invalidateSheetCache_(sheetName);
            const entityName = Object.keys(SHEET_NAMES_FOR_CACHE).find(
              (k) => SHEET_NAMES_FOR_CACHE[k] === sheetName,
            );
            if (entityName) invalidateRowIndexMap_(sheetName);
          });

          // Invalidate backend cache
          const cache = backendCacheStore_();
          cache.del("ALL_DATA_CACHE");

          const elapsed = new Date() - startTime;
          const success = stats.errors.length === 0;

          // Log operation
          if (success) {
            logAction_(
              "BATCH_CRUD_SYNC",
              "multiple",
              "system",
              JSON.stringify(stats),
            );
          }

          return {
            success,
            stats,
            errors: stats.errors,
            elapsed,
          };
        });
      },
      3,
      100,
    );
  } catch (error) {
    console.error("[batchCRUDWithSync] Failed:", error.message);
    throw new Error("BATCH_CRUD_FAILED: " + error.message);
  }
}

// ============ HELPER FUNCTIONS ============

/**
 * Convert raw sheet data to objects
 * Skips deleted records (STATUS = "DELETED")
 */
function rawDataToObjects_(rawData, schema, sheetName, entity) {
  if (!Array.isArray(rawData) || rawData.length <= 1) return [];

  const headers = rawData[0];
  const fieldMap = VN_TO_EN_HEADER_MAP_[entity] || {};
  const objects = [];

  for (let i = 1; i < rawData.length; i++) {
    const row = rawData[i];
    const obj = {};

    // Convert row to object, mapping Vietnamese headers to English field names
    headers.forEach((header, j) => {
      if (header !== undefined && header !== null && j < row.length) {
        const cleanHeader = String(header).trim();
        const fieldName = fieldMap[cleanHeader] || cleanHeader;
        obj[fieldName] = row[j];
      }
    });

    // Skip deleted records
    if (schema.statusColumn >= 0 && isRowDeleted_(row, schema.statusColumn)) {
      continue;
    }

    if (obj.id) {
      objects.push(obj);
    }
  }

  console.log(`[rawDataToObjects_] ${entity}: ${objects.length} records`);
  return objects;
}

/**
 * Create new row in sheet
 */
function createRowForSync_(entity, data, stats) {
  const sheetName = SHEET_NAMES_FOR_CACHE[entity];
  if (!sheetName) throw new Error(`UNKNOWN_ENTITY: ${entity}`);

  const schema = CACHE_FIRST_SCHEMA[entity];
  if (!schema) throw new Error(`NO_SCHEMA: ${entity}`);

  // Validate required fields
  validateBatchData_([data], schema.required, 1);

  const sheet = getSheet_(sheetName);
  const headerRow = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  // Prepare row values matching headers
  const fieldMap = VN_TO_EN_HEADER_MAP_[entity] || {};
  const values = [];
  headerRow.forEach((header) => {
    const cleanHeader = String(header || "").trim();
    const enKey = fieldMap[cleanHeader];
    if (enKey !== undefined && data[enKey] !== undefined) {
      values.push(data[enKey]);
    } else {
      values.push(data[cleanHeader] !== undefined ? data[cleanHeader] : "");
    }
  });

  // Append row (bulk write)
  appendRowsBatch_(sheetName, [values]);
  console.log(`[createRowForSync_] Created ${entity} id: ${data.id}`);
}

/**
 * Update existing row in sheet
 * Uses row index map for quick lookup
 */
function updateRowForSync_(entity, data, stats) {
  const sheetName = SHEET_NAMES_FOR_CACHE[entity];
  if (!sheetName) throw new Error(`UNKNOWN_ENTITY: ${entity}`);

  const schema = CACHE_FIRST_SCHEMA[entity];
  if (!schema) throw new Error(`NO_SCHEMA: ${entity}`);

  if (!data.id) throw new Error("DATA_MISSING_ID");

  // Quick lookup using row index map
  const map = getRowIndexMap_(sheetName, schema.idColumn);
  const rowNum = map[data.id];

  if (!rowNum) throw new Error(`ROW_NOT_FOUND: id=${data.id}`);

  const sheet = getSheet_(sheetName);
  const headerRow = sheet
    .getRange(1, 1, 1, sheet.getLastColumn())
    .getValues()[0];

  // Update only provided fields
  const fieldMap = VN_TO_EN_HEADER_MAP_[entity] || {};
  headerRow.forEach((header, colIdx) => {
    const cleanHeader = String(header || "").trim();
    const enKey = fieldMap[cleanHeader];
    const val =
      enKey !== undefined && data[enKey] !== undefined
        ? data[enKey]
        : data[cleanHeader];
    if (val !== undefined && val !== null) {
      sheet.getRange(rowNum, colIdx + 1).setValue(val);
    }
  });

  console.log(`[updateRowForSync_] Updated ${entity} id: ${data.id}`);
}

/**
 * Soft delete row (set STATUS = "DELETED")
 * Uses row index map for quick lookup
 */
function softDeleteRowForSync_(entity, id, stats) {
  const sheetName = SHEET_NAMES_FOR_CACHE[entity];
  if (!sheetName) throw new Error(`UNKNOWN_ENTITY: ${entity}`);

  const schema = CACHE_FIRST_SCHEMA[entity];
  if (!schema) throw new Error(`NO_SCHEMA: ${entity}`);

  if (schema.statusColumn < 0) {
    // No status column, do hard delete
    hardDeleteRowForSync_(entity, id, stats);
    return;
  }

  const map = getRowIndexMap_(sheetName, schema.idColumn);
  const rowNum = map[id];

  if (!rowNum) throw new Error(`ROW_NOT_FOUND: id=${id}`);

  const sheet = getSheet_(sheetName);
  sheet.getRange(rowNum, schema.statusColumn + 1).setValue("DELETED");

  console.log(`[softDeleteRowForSync_] Soft deleted ${entity} id: ${id}`);
}

/**
 * Hard delete row (actually remove from sheet)
 * For entities without status column
 */
function hardDeleteRowForSync_(entity, id, stats) {
  const sheetName = SHEET_NAMES_FOR_CACHE[entity];
  const schema = CACHE_FIRST_SCHEMA[entity];

  const map = getRowIndexMap_(sheetName, schema.idColumn);
  const rowNum = map[id];

  if (!rowNum) throw new Error(`ROW_NOT_FOUND: id=${id}`);

  const sheet = getSheet_(sheetName);
  sheet.deleteRow(rowNum);

  console.log(`[hardDeleteRowForSync_] Hard deleted ${entity} id: ${id}`);
}

// ============ IMAGE UPLOAD TO GOOGLE DRIVE ============

/**
 * uploadImage() - Upload image to Google Drive
 * Called from frontend after user selects file
 *
 * @param {string} base64 - Base64 encoded image data
 * @param {string} fileName - Original filename
 * @returns {Object} {success, url, fileId}
 */
function uploadImage(base64, fileName) {
  try {
    console.log(`[uploadImage] Starting upload: ${fileName}`);

    // Get or create Google Drive folder for images
    const folderId = getOrCreateImageFolder_();
    const folder = DriveApp.getFolderById(folderId);

    // Decode base64 to blob
    const mimeType = inferMimeType_(fileName);
    const decodedData = Utilities.base64Decode(base64);
    const blob = Utilities.newBlob(decodedData, mimeType, fileName);

    // Create file in Google Drive
    const file = folder.createFile(blob);

    // Set sharing to ANYONE with VIEW permission (public link)
    file.setSharing(DriveApp.Access.ANYONE, DriveApp.Permission.VIEW);

    const fileId = file.getId();
    const url = `https://lh3.googleusercontent.com/d/${fileId}`;

    console.log(`[uploadImage] Success: ${fileName} -> ${fileId}`);
    logAction_("UPLOAD_IMAGE", fileId, "system", {
      fileName,
      mimeType,
      size: decodedData.length,
    });

    return {
      success: true,
      url,
      fileId,
    };
  } catch (error) {
    console.error("[uploadImage] Failed:", error.message);
    logAction_("UPLOAD_IMAGE_ERROR", "unknown", "system", error.message);
    throw new Error("UPLOAD_FAILED: " + error.message);
  }
}

/**
 * Get or create folder for product images in Google Drive
 * Folder name: "DrinkHub_Images"
 * @returns {string} Folder ID
 */
function getOrCreateImageFolder_() {
  try {
    const folderName = "DrinkHub_Images";
    const folders = DriveApp.getFoldersByName(folderName);

    if (folders.hasNext()) {
      return folders.next().getId();
    }

    // Create folder if doesn't exist
    const newFolder = DriveApp.createFolder(folderName);
    console.log(
      `[getOrCreateImageFolder_] Created new folder: ${newFolder.getId()}`,
    );
    return newFolder.getId();
  } catch (error) {
    console.error("[getOrCreateImageFolder_] Error:", error.message);
    throw new Error("FOLDER_ACCESS_FAILED: " + error.message);
  }
}

/**
 * Infer MIME type from filename
 * @param {string} fileName
 * @returns {string} MIME type
 */
function inferMimeType_(fileName) {
  const ext = (fileName || "").toLowerCase().split(".").pop() || "jpg";
  const mimeTypes = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    gif: "image/gif",
    webp: "image/webp",
  };
  return mimeTypes[ext] || "image/jpeg";
}

// ============ DEBUG / TEST FUNCTIONS ============

function debug_getCacheFirstData() {
  const data = getAllDataForCache();
  console.log(JSON.stringify(data, null, 2));
  return data;
}

function debug_testBatchCRUD() {
  const syncData = {
    creates: [
      {
        entity: "products",
        data: {
          id: "debug_prod_1",
          name: "Debug Product",
          category: "Test",
          price: 99999,
        },
      },
    ],
    updates: [],
    deletes: [],
  };

  const result = batchCRUDWithSync(syncData);
  console.log("Batch CRUD result:", JSON.stringify(result, null, 2));
  return result;
}

// ============ BACKWARD COMPATIBILITY WRAPPERS ============
// Legacy function names for existing frontend code

/**
 * @deprecated Use getAllDataForCache() instead
 * Wrapper for backward compatibility
 */
function getAllData() {
  console.log("[getAllData] Called (legacy), delegating to getAllDataForCache");
  return getAllDataForCache();
}

/**
 * @deprecated Use batchCRUDWithSync() instead
 * Wrapper for backward compatibility
 */
function batchCRUD(syncData) {
  console.log("[batchCRUD] Called (legacy), delegating to batchCRUDWithSync");
  return batchCRUDWithSync(syncData);
}

/**
 * Hàm kiểm tra và kích hoạt hộp thoại cấp quyền ghi Google Drive
 * Hãy chạy hàm này một lần trong Apps Script Editor để kích hoạt popup cấp quyền ghi Drive.
 */
function testDrivePermission() {
  // Thực hiện lệnh tạo file nháp để buộc kích hoạt quyền ghi (https://www.googleapis.com/auth/drive)
  const tempFile = DriveApp.createFile("temp_permission_check.txt", "Quyền ghi Drive hoạt động tốt!");
  Logger.log("Tạo file nháp kiểm tra quyền thành công, id: " + tempFile.getId());
  tempFile.setTrashed(true);
  Logger.log("Xoá file nháp thành công. Quyền truy cập ghi Google Drive hoạt động tốt!");
}
