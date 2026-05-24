/* =========================
 * Store_Info.js - Quản lý thông tin quán
 * ========================= */

/**
 * Lấy tất cả thông tin quán dưới dạng object
 * { STORE_NAME: "...", ADDRESS: "...", ... }
 */
const getStoreInfo = (useCache = true) => {
  return getStoreInfo_(useCache);
};

/**
 * Lấy tất cả thông tin quán dưới dạng array
 * [{ key: "STORE_NAME", value: "..." }, ...]
 */
const getAllStoreInfo = () => {
  const rows = getSheetData_(SHEET_NAME.STORE_INFO);
  const storeInfoArray = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const key = trimSafe_(row[SHEET_SCHEMA.STORE_INFO.KEY]);
    const value = trimSafe_(row[SHEET_SCHEMA.STORE_INFO.VALUE]);

    if (key) {
      storeInfoArray.push({
        key: key,
        value: value,
      });
    }
  }

  return storeInfoArray;
};

const updateStoreInfo = (key, value) => {
  if (!key) {
    throw new Error("key is required");
  }

  return withPaymentLock_(`storeinfo_${key}`, () => {
    const rows = getSheetData_(SHEET_NAME.STORE_INFO, false);
    let found = false;

    // Tìm row với key tương ứng
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      const rowKey = trimSafe_(row[SHEET_SCHEMA.STORE_INFO.KEY]);

      if (rowKey === key) {
        row[SHEET_SCHEMA.STORE_INFO.VALUE] = trimSafe_(value);
        batchWriteRows_(SHEET_NAME.STORE_INFO, i + 1, 1, [row]);

        logAction_("UPDATE_STORE_INFO", `STORE_${key}`, "system", {
          key: key,
          newValue: trimSafe_(value),
        });

        found = true;
        break;
      }
    }

    if (!found) {
      throw new Error(`STORE_INFO_KEY_NOT_FOUND: ${key}`);
    }

    invalidateSheetCache_(SHEET_NAME.STORE_INFO);

    const updatedStoreInfo = {
      key: key,
      value: trimSafe_(value),
    };
    pushDeltaSafe_("STORE_INFO", "UPDATE", updatedStoreInfo);
    return updatedStoreInfo;
  });
};
