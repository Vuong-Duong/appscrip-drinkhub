/**
 * Backend.gs - Persistent Cache First Integration - Firestore
 *
 * Exposes:
 * - getAllDataForCache() - Return all entities (first install)
 * - batchCRUDWithSync() - Batch CRUD operations with transaction
 *
 * Uses FirestoreClient utilities:
 * - firestoreQuery_, firestoreSet_, firestoreUpdate_, firestoreBatchWrite_
 */

const FIRESTORE_COLLECTIONS_FOR_CACHE = {
  products: "products",
  orders: "orders",
  tables: "tables",
  discounts: "discounts",
  payments: "payments",
  shifts: "shifts",
};

/**
 * getAllDataForCache() - Fetch all data for first install from Firestore
 * Called once when app opens for first time
 *
 * @returns {Object} All entities: {products: [...], orders: [...], ...}
 */
function getAllDataForCache() {
  try {
    const startTime = new Date();
    console.log("[getAllDataForCache] Started (Firestore)");

    return withRetry_(
      () => {
        const allData = {
          products: getProducts(false),
          orders: getOrders({ limit: 100 }),
          tables: getAllTables(),
          discounts: getCoupons(false),
          payments: firestoreQuery_("payments") || [],
          shifts: getShifts(),
          orderDetails: [], // Order items embedded inside orders
        };

        // Add settings manually from store_info
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
 * batchCRUDWithSync() - Handle batch CRUD operations in Firestore
 * Atomic transaction with rollback capability
 *
 * @param {Object} syncData - {creates: [], updates: [], deletes: []}
 * @returns {Object} {success, stats, errors}
 */
function batchCRUDWithSync(syncData) {
  try {
    const startTime = new Date();
    console.log("[batchCRUDWithSync] Started with:", syncData);

    return withRetry_(
      () => {
        if (!syncData || typeof syncData !== "object") {
          throw new Error("INVALID_SYNC_DATA");
        }

        const stats = {
          created: 0,
          updated: 0,
          deleted: 0,
          errors: [],
        };

        const writes = [];

        // Process creates
        if (Array.isArray(syncData.creates) && syncData.creates.length > 0) {
          syncData.creates.forEach((op, idx) => {
            try {
              const collection = FIRESTORE_COLLECTIONS_FOR_CACHE[op.entity] || op.entity;
              if (!op.data || !op.data.id) throw new Error("MISSING_DATA_ID");

              writes.push({
                type: "set",
                collection: collection,
                id: op.data.id,
                data: {
                  ...op.data,
                  createdAt: toIsoString_(new Date()),
                  updatedAt: toIsoString_(new Date()),
                },
              });
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
              const collection = FIRESTORE_COLLECTIONS_FOR_CACHE[op.entity] || op.entity;
              if (!op.data || !op.data.id) throw new Error("MISSING_DATA_ID");

              writes.push({
                type: "update",
                collection: collection,
                id: op.data.id,
                data: {
                  ...op.data,
                  updatedAt: toIsoString_(new Date()),
                },
              });
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

        // Process deletes (soft delete where applicable)
        if (Array.isArray(syncData.deletes) && syncData.deletes.length > 0) {
          syncData.deletes.forEach((op, idx) => {
            try {
              const collection = FIRESTORE_COLLECTIONS_FOR_CACHE[op.entity] || op.entity;
              if (!op.id) throw new Error("MISSING_DELETE_ID");

              if (["products", "discounts"].includes(op.entity)) {
                writes.push({
                  type: "update",
                  collection: collection,
                  id: op.id,
                  data: {
                    status: "DELETED",
                    updatedAt: toIsoString_(new Date()),
                  },
                });
              } else {
                writes.push({
                  type: "delete",
                  collection: collection,
                  id: op.id,
                });
              }
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

        // Execute batch write to Firestore
        if (writes.length > 0) {
          firestoreBatchWrite_(writes);
        }

        const elapsed = new Date() - startTime;
        const success = stats.errors.length === 0;

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
      },
      3,
      100,
    );
  } catch (error) {
    console.error("[batchCRUDWithSync] Failed:", error.message);
    throw new Error("BATCH_CRUD_FAILED: " + error.message);
  }
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

function getAllData() {
  return getAllDataForCache();
}

function batchCRUD(syncData) {
  return batchCRUDWithSync(syncData);
}
