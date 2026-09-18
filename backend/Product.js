/* =========================
 * Product.gs - Firestore
 * ========================= */

function getProducts(activeOnly = false) {
  var docs = firestoreQuery_("products");
  if (!Array.isArray(docs) || docs.length === 0) {
    return [];
  }

  return docs
    .filter(function (doc) {
      if (!doc.id) return false;
      var status = trimSafe_(doc.status);
      if (status === "DELETED") return false;
      if (activeOnly && status === "INACTIVE") return false;
      return true;
    })
    .map(mapProductDoc_)
    .sort(function (a, b) {
      var timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
      var timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
      if (timeA && timeB && timeA !== timeB) return timeB - timeA;
      return String(b.id || "").localeCompare(String(a.id || ""));
    });
}

function mapProductDoc_(doc) {
  const d = doc || {};
  const priceVal = d.price ?? d.salePrice ?? d.sale_price ?? d.PRICE ?? d.SALE_PRICE;
  const costVal = d.cost ?? d.costPrice ?? d.cost_price ?? d.COST ?? d.COST_PRICE;

  const safePrice = toNumberSafe_(priceVal, 0);
  const safeCost = toNumberSafe_(costVal, 0);

  return {
    id: trimSafe_(d.id),
    name: trimSafe_(d.name),
    price: safePrice,
    salePrice: safePrice,
    cost: safeCost,
    costPrice: safeCost,
    stock: toNumberSafe_(d.stock, 0),
    category: trimSafe_(d.category),
    status: trimSafe_(d.status),
    image: trimSafe_(d.image),
  };
}

function normalizeProductPayload_(payload) {
  const data = payload || {};
  const name = trimSafe_(data.name);
  if (!name) throw new Error("MISSING_FIELDS: name");

  const priceVal = data.price ?? data.salePrice ?? data.sale_price;
  const costVal = data.cost ?? data.costPrice ?? data.cost_price;

  const safePrice = toNumberSafe_(priceVal, 0);
  const safeCost = toNumberSafe_(costVal, 0);

  return {
    name,
    category: trimSafe_(data.category),
    price: safePrice,
    salePrice: safePrice,
    cost: safeCost,
    costPrice: safeCost,
    stock: toNumberSafe_(data.stock, 0),
    status: trimSafe_(data.status || "ACTIVE").toUpperCase(),
    image: trimSafe_(data.image),
  };
}

function createProduct(payload) {
  return withStockLock_("product_create", function () {
    const data = normalizeProductPayload_(payload);
    const productId = generateId_("prod");
    const now = toIsoString_(new Date());

    const productData = {
      id: productId,
      name: data.name,
      category: data.category,
      price: data.price,
      salePrice: data.salePrice,
      cost: data.cost,
      costPrice: data.costPrice,
      stock: data.stock,
      status: data.status,
      image: data.image,
      createdAt: now,
      updatedAt: now,
    };

    firestoreSet_("products", productId, productData);

    const product = mapProductDoc_(productData);
    logAction_("CREATE_PRODUCT", product.id, (payload || {}).userRole || "system", product);
    pushDeltaSafe_("PRODUCT", "CREATE", product);
    return product;
  });
}

function updateProduct(productId, payload) {
  return withStockLock_("product_" + productId, function () {
    const existing = firestoreGet_("products", productId);
    if (!existing) throw new Error("PRODUCT_NOT_FOUND");

    const data = payload || {};
    const updates = {};

    if (data.name !== undefined) updates.name = trimSafe_(data.name);
    if (data.category !== undefined) updates.category = trimSafe_(data.category);
    if (data.price !== undefined || data.salePrice !== undefined) {
      const pVal = toNumberSafe_(data.price ?? data.salePrice, 0);
      updates.price = pVal;
      updates.salePrice = pVal;
    }
    if (data.cost !== undefined || data.costPrice !== undefined) {
      const cVal = toNumberSafe_(data.cost ?? data.costPrice, 0);
      updates.cost = cVal;
      updates.costPrice = cVal;
    }
    if (data.stock !== undefined) updates.stock = toNumberSafe_(data.stock, 0);
    if (data.status !== undefined) updates.status = trimSafe_(data.status).toUpperCase();
    if (data.image !== undefined) updates.image = trimSafe_(data.image);
    updates.updatedAt = toIsoString_(new Date());

    const updated = firestoreUpdate_("products", productId, updates);
    const product = mapProductDoc_(updated);
    logAction_("UPDATE_PRODUCT", product.id, data.userRole || "system", product);
    pushDeltaSafe_("PRODUCT", "UPDATE", product);
    return product;
  });
}

function deleteProduct(productId, payload) {
  return updateProduct(productId, {
    ...(payload || {}),
    status: "DELETED",
  });
}

function createProductSnapshot_(product, qty) {
  return {
    productId: product.id,
    productName: product.name,
    unitPrice: product.price,
    quantity: qty,
    subtotal: product.price * qty,
    snapshotAt: toIsoString_(new Date()),
  };
}

// Inventory Journal & Adjust
function createInventoryJournal_(payload) {
  var journalId = generateId_("inv");
  firestoreSet_("inventory_journals", journalId, {
    id: journalId,
    productId: payload.productId,
    type: payload.type,
    quantity: payload.quantity,
    prevStock: payload.beforeStock,
    nextStock: payload.afterStock,
    orderId: payload.orderId || "",
    timestamp: toIsoString_(new Date()),
  });
}

function adjustInventory_(payload) {
  return withStockLock_(payload.productId, function () {
    var existing = firestoreGet_("products", payload.productId);
    if (!existing) throw new Error("Product not found");

    var beforeStock = toNumberSafe_(existing.stock);
    var afterStock = beforeStock + toNumberSafe_(payload.delta);

    if (afterStock < 0) throw new Error("Negative stock");

    firestoreUpdate_("products", payload.productId, {
      stock: afterStock,
      updatedAt: toIsoString_(new Date()),
    });

    createInventoryJournal_({
      productId: payload.productId,
      type: payload.type,
      quantity: payload.delta,
      beforeStock: beforeStock,
      afterStock: afterStock,
      orderId: payload.orderId,
    });

    pushDeltaSafe_("PRODUCT", "INVENTORY_ADJUST", {
      productId: payload.productId,
      beforeStock: beforeStock,
      afterStock: afterStock,
      delta: payload.delta,
      type: payload.type,
    });

    return afterStock;
  });
}
