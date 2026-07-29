/* =========================
 * Product.gs - Firestore
 * ========================= */

function getProducts(activeOnly = true) {
  var docs = firestoreQuery_("products");
  if (!Array.isArray(docs) || docs.length === 0) {
    return [];
  }

  return docs
    .filter(function (doc) {
      if (!doc.id) return false;
      if (!activeOnly) return true;
      var status = trimSafe_(doc.status);
      return status !== "INACTIVE" && status !== "DELETED";
    })
    .map(mapProductDoc_);
}

function mapProductDoc_(doc) {
  return {
    id: trimSafe_(doc.id),
    name: trimSafe_(doc.name),
    price: toNumberSafe_(doc.price),
    cost: toNumberSafe_(doc.cost),
    stock: toNumberSafe_(doc.stock),
    category: trimSafe_(doc.category),
    status: trimSafe_(doc.status),
    image: trimSafe_(doc.image),
  };
}

function normalizeProductPayload_(payload) {
  const data = payload || {};
  const name = trimSafe_(data.name);
  if (!name) throw new Error("MISSING_FIELDS: name");

  return {
    name,
    category: trimSafe_(data.category),
    price: toNumberSafe_(data.price),
    cost: toNumberSafe_(data.cost),
    stock: toNumberSafe_(data.stock),
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
      cost: data.cost,
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
    if (data.price !== undefined) updates.price = toNumberSafe_(data.price);
    if (data.cost !== undefined) updates.cost = toNumberSafe_(data.cost);
    if (data.stock !== undefined) updates.stock = toNumberSafe_(data.stock);
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

function validateStockBeforeOrder_(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error("INVALID_ITEMS: items must be non-empty array");
  }

  // Aggregate quantities by productId
  const qtyMap = {};
  items.forEach(function (item) {
    const pId = trimSafe_(item.productId);
    if (!pId) return;
    qtyMap[pId] = (qtyMap[pId] || 0) + toNumberSafe_(item.quantity);
  });

  var products = getProducts(false); // Get all products
  var map = {};
  products.forEach(function (p) {
    map[p.id] = p;
  });

  Object.keys(qtyMap).forEach(function (productId) {
    var product = map[productId];
    if (!product) {
      throw new Error("PRODUCT_NOT_FOUND: " + productId);
    }
    const totalQty = qtyMap[productId];
    if (totalQty <= 0) {
      throw new Error("INVALID_QUANTITY: " + product.name);
    }
    if (product.stock < totalQty) {
      throw new Error(
        "INSUFFICIENT_STOCK: " +
          product.name +
          ": available " +
          product.stock +
          ", requested " +
          totalQty,
      );
    }
  });
}

function reduceProductStock_(items) {
  return withTransaction_("reduce_stock", function () {
    if (!Array.isArray(items) || items.length === 0) {
      return 0;
    }

    var allProducts = getProducts(false);
    var productMap = {};
    allProducts.forEach(function (p) {
      productMap[p.id] = p;
    });

    var reduced = 0;
    var journalWrites = [];
    var now = toIsoString_(new Date());

    items.forEach(function (item) {
      var productId = trimSafe_(item.productId);
      var product = productMap[productId];
      if (!product) return;

      var currentStock = toNumberSafe_(product.stock);
      var reduceQty = toNumberSafe_(item.quantity);
      var newStock = currentStock - reduceQty;

      // ✓ Prevent negative stock
      if (newStock < 0) {
        throw new Error(
          "INSUFFICIENT_STOCK: " +
            product.name +
            ": available " +
            currentStock +
            ", requested " +
            reduceQty,
        );
      }

      // Update product stock in Firestore
      firestoreUpdate_("products", productId, {
        stock: newStock,
        updatedAt: now,
      });

      // Collect journal entry
      var journalId = generateId_("inv");
      journalWrites.push({
        type: "set",
        collection: "inventory_journals",
        id: journalId,
        data: {
          id: journalId,
          productId: productId,
          type: "REDUCE_BY_ORDER",
          quantity: reduceQty,
          prevStock: currentStock,
          nextStock: newStock,
          orderId: "",
          timestamp: now,
        },
      });

      reduced++;
    });

    // ✓ Batch write all journal entries at once
    if (journalWrites.length > 0) {
      firestoreBatchWrite_(journalWrites);
    }

    pushDeltaSafe_("PRODUCT", "STOCK_REDUCE", { items: items, reduced: reduced });
    return reduced;
  });
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
