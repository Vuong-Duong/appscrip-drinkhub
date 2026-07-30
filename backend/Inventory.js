/* =========================
 * Inventory.js - Quản lý Kho nguyên liệu (Firestore)
 * Độc lập hoàn toàn với Product / Order
 * ========================= */

/**
 * Lấy danh sách nguyên liệu
 */
function getIngredients() {
  const docs = firestoreQuery_("ingredients");
  if (!Array.isArray(docs) || docs.length === 0) {
    return [];
  }

  return docs
    .filter((doc) => doc && doc.id)
    .map((doc) => ({
      id: trimSafe_(doc.id),
      name: trimSafe_(doc.name),
      unit: trimSafe_(doc.unit),
      quantity: toNumberSafe_(doc.quantity, 0),
      note: trimSafe_(doc.note),
      createdAt: trimSafe_(doc.createdAt),
      updatedAt: trimSafe_(doc.updatedAt),
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "vi"));
}

/**
 * Tạo nguyên liệu mới
 * @param {Object} payload { name, unit, quantity, note }
 */
function createIngredient(payload = {}) {
  const name = trimSafe_(payload.name);
  const unit = trimSafe_(payload.unit);
  if (!name) throw new Error("MISSING_FIELDS: name required");
  if (!unit) throw new Error("MISSING_FIELDS: unit required");

  return withStockLock_("ingredient_create", () => {
    // Check duplicate name
    const existingList = getIngredients();
    const duplicate = existingList.find(
      (item) => item.name.toLowerCase() === name.toLowerCase(),
    );
    if (duplicate) {
      throw new Error("INGREDIENT_EXISTS: Nguyên liệu này đã tồn tại");
    }

    const ingredientId = generateId_("ing");
    const initialQty = Math.max(0, toNumberSafe_(payload.quantity, 0));
    const now = toIsoString_(new Date());

    const ingredientData = {
      id: ingredientId,
      name: name,
      unit: unit,
      quantity: initialQty,
      note: trimSafe_(payload.note),
      createdAt: now,
      updatedAt: now,
    };

    firestoreSet_("ingredients", ingredientId, ingredientData);

    // Ghi history ban đầu nếu có số lượng > 0
    if (initialQty > 0) {
      const historyId = generateId_("invhist");
      firestoreSet_("inventoryHistory", historyId, {
        id: historyId,
        ingredientId: ingredientId,
        ingredientName: name,
        unit: unit,
        type: "IMPORT",
        quantity: initialQty,
        beforeQuantity: 0,
        afterQuantity: initialQty,
        createdAt: now,
      });
    }

    logAction_("CREATE_INGREDIENT", ingredientId, "system", ingredientData);
    return ingredientData;
  });
}

/**
 * Nhập thêm nguyên liệu (IMPORT)
 * Support 1 item hoặc array items: [{ ingredientId, quantity }, ...]
 * Formula: newQuantity = currentQuantity + inputQuantity
 */
function addInventory(payload) {
  const items = Array.isArray(payload) ? payload : [payload];
  if (items.length === 0) {
    throw new Error("INVALID_PAYLOAD: items empty");
  }

  return withTransaction_("add_inventory", () => {
    const writes = [];
    const now = toIsoString_(new Date());
    const results = [];

    items.forEach((item) => {
      const ingId = trimSafe_(item.ingredientId || item.id);
      const inputQty = toNumberSafe_(item.quantity, 0);

      if (!ingId) throw new Error("MISSING_FIELDS: ingredientId required");
      if (inputQty <= 0) throw new Error("INVALID_QUANTITY: số lượng nhập phải > 0");

      const existing = firestoreGet_("ingredients", ingId);
      if (!existing) throw new Error(`INGREDIENT_NOT_FOUND: ${ingId}`);

      const currentQty = toNumberSafe_(existing.quantity, 0);
      const newQty = Math.round((currentQty + inputQty) * 1000) / 1000;

      // Update ingredient quantity
      writes.push({
        type: "update",
        collection: "ingredients",
        id: ingId,
        data: {
          name: trimSafe_(existing.name),
          unit: trimSafe_(existing.unit),
          note: trimSafe_(existing.note),
          quantity: newQty,
          updatedAt: now,
        },
      });

      // Insert inventory history doc
      const historyId = generateId_("invhist");
      writes.push({
        type: "set",
        collection: "inventoryHistory",
        id: historyId,
        data: {
          id: historyId,
          ingredientId: ingId,
          ingredientName: trimSafe_(existing.name),
          unit: trimSafe_(existing.unit),
          type: "IMPORT",
          quantity: inputQty,
          beforeQuantity: currentQty,
          afterQuantity: newQty,
          createdAt: now,
        },
      });

      results.push({
        ingredientId: ingId,
        beforeQuantity: currentQty,
        inputQuantity: inputQty,
        afterQuantity: newQty,
      });
    });

    if (writes.length > 0) {
      firestoreBatchWrite_(writes);
    }

    logAction_("ADD_INVENTORY", "multiple", "system", { itemCount: items.length });
    return results;
  });
}

/**
 * Kiểm kê điều chỉnh kho (STOCKTAKE / ADJUSTMENT)
 * Formula: quantity = actualQuantity
 * History quantity difference = actualQuantity - currentQuantity
 */
function stocktakeInventory(payload) {
  const items = Array.isArray(payload) ? payload : [payload];
  if (items.length === 0) {
    throw new Error("INVALID_PAYLOAD: items empty");
  }

  return withTransaction_("stocktake_inventory", () => {
    const writes = [];
    const now = toIsoString_(new Date());
    const results = [];

    items.forEach((item) => {
      const ingId = trimSafe_(item.ingredientId || item.id);
      const actualQty = toNumberSafe_(item.actualQuantity ?? item.quantity, 0);

      if (!ingId) throw new Error("MISSING_FIELDS: ingredientId required");
      if (actualQty < 0) throw new Error("INVALID_QUANTITY: số lượng thực tế không được âm");

      const existing = firestoreGet_("ingredients", ingId);
      if (!existing) throw new Error(`INGREDIENT_NOT_FOUND: ${ingId}`);

      const currentQty = toNumberSafe_(existing.quantity, 0);
      const diffQty = Math.round((actualQty - currentQty) * 1000) / 1000;
      const type = item.type || "STOCKTAKE";

      // Update ingredient quantity
      writes.push({
        type: "update",
        collection: "ingredients",
        id: ingId,
        data: {
          name: trimSafe_(existing.name),
          unit: trimSafe_(existing.unit),
          note: trimSafe_(existing.note),
          quantity: actualQty,
          updatedAt: now,
        },
      });

      // Insert inventory history doc
      const historyId = generateId_("invhist");
      writes.push({
        type: "set",
        collection: "inventoryHistory",
        id: historyId,
        data: {
          id: historyId,
          ingredientId: ingId,
          ingredientName: trimSafe_(existing.name),
          unit: trimSafe_(existing.unit),
          type: type,
          quantity: diffQty,
          beforeQuantity: currentQty,
          afterQuantity: actualQty,
          createdAt: now,
        },
      });

      results.push({
        ingredientId: ingId,
        beforeQuantity: currentQty,
        diffQuantity: diffQty,
        afterQuantity: actualQty,
      });
    });

    if (writes.length > 0) {
      firestoreBatchWrite_(writes);
    }

    logAction_("STOCKTAKE_INVENTORY", "multiple", "system", { itemCount: items.length });
    return results;
  });
}

/**
 * Lấy lịch sử biến động kho
 * Filters: { ingredientId, range, customStart, customEnd }
 */
function getInventoryHistory(filters = {}) {
  const docs = firestoreQuery_("inventoryHistory") || [];
  if (!Array.isArray(docs) || docs.length === 0) return [];

  const ingredientId = trimSafe_(filters.ingredientId);
  const range = filters.range || "all";

  let dateRange = { start: null, end: null };
  if (range === "custom" && filters.customStart && filters.customEnd) {
    const startParts = filters.customStart.split("-").map(Number);
    const endParts = filters.customEnd.split("-").map(Number);
    const start = new Date(Date.UTC(startParts[0], startParts[1] - 1, startParts[2]) - 7 * 60 * 60 * 1000);
    const end = new Date(Date.UTC(endParts[0], endParts[1] - 1, endParts[2]) - 7 * 60 * 60 * 1000 + 24 * 60 * 60 * 1000 - 1);
    dateRange = { start, end };
  } else if (range !== "all") {
    dateRange = getDateRangeFromPredefined_(range);
  }

  return docs
    .filter((doc) => {
      if (!doc || !doc.id) return false;
      if (ingredientId && doc.ingredientId !== ingredientId) return false;
      if (dateRange.start && dateRange.end) {
        return isDateInRange_(doc.createdAt, dateRange.start, dateRange.end);
      }
      return true;
    })
    .map((doc) => ({
      id: trimSafe_(doc.id),
      ingredientId: trimSafe_(doc.ingredientId),
      ingredientName: trimSafe_(doc.ingredientName),
      unit: trimSafe_(doc.unit),
      type: trimSafe_(doc.type || "IMPORT"),
      quantity: toNumberSafe_(doc.quantity, 0),
      beforeQuantity: toNumberSafe_(doc.beforeQuantity, 0),
      afterQuantity: toNumberSafe_(doc.afterQuantity, 0),
      createdAt: trimSafe_(doc.createdAt),
    }))
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
