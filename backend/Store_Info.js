/* =========================
 * Store_Info.js - Quản lý thông tin quán - Firestore
 * ========================= */

/**
 * Lấy tất cả thông tin quán dưới dạng object
 * { STORE_NAME: "...", ADDRESS: "...", ... }
 */
const getStoreInfo = (useCache = true) => {
  const storeDoc = firestoreGet_("store_info", "config");
  if (!storeDoc) return {};
  const result = { ...storeDoc };
  delete result.id;
  return result;
};

const getStoreInfo_ = (useCache = true) => {
  return getStoreInfo(useCache);
};

/**
 * Lấy tất cả thông tin quán dưới dạng array
 * [{ key: "STORE_NAME", value: "..." }, ...]
 */
const getAllStoreInfo = () => {
  const storeMap = getStoreInfo(false);
  const storeInfoArray = [];

  Object.keys(storeMap).forEach((key) => {
    if (key && key !== "updatedAt") {
      storeInfoArray.push({
        key: key,
        value: String(storeMap[key] || ""),
      });
    }
  });

  return storeInfoArray;
};

const updateStoreInfo = (key, value) => {
  if (!key) {
    throw new Error("key is required");
  }

  return withPaymentLock_(`storeinfo_${key}`, () => {
    const safeValue = trimSafe_(value);

    const updates = {};
    updates[key] = safeValue;
    updates.updatedAt = toIsoString_(new Date());

    firestoreUpdate_("store_info", "config", updates);

    logAction_("UPDATE_STORE_INFO", `STORE_${key}`, "system", {
      key: key,
      newValue: safeValue,
    });

    const updatedStoreInfo = {
      key: key,
      value: safeValue,
    };
    pushDeltaSafe_("STORE_INFO", "UPDATE", updatedStoreInfo);
    return updatedStoreInfo;
  });
};
