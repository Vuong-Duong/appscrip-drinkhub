/* =========================
 * Product.gs
 * ========================= */

function getProducts(activeOnly = true) {
  var rows = getSheetData_(SHEET_NAME.PRODUCT);
  if (rows.length <= 1) {
    return [];
  }
  return rows
    .slice(1)
    .filter(function (row) {
      if (!activeOnly) return true;
      const status = trimSafe_(row[SHEET_SCHEMA.PRODUCT.STATUS]);
      return status !== "INACTIVE" && status !== "DELETED";
    })
    .map(mapProductRow_);
}

function mapProductRow_(row) {
  return {
    id: trimSafe_(row[SHEET_SCHEMA.PRODUCT.ID]),
    name: trimSafe_(row[SHEET_SCHEMA.PRODUCT.NAME]),
    price: toNumberSafe_(row[SHEET_SCHEMA.PRODUCT.SALE_PRICE]),
    cost: toNumberSafe_(row[SHEET_SCHEMA.PRODUCT.COST_PRICE]),
    stock: toNumberSafe_(row[SHEET_SCHEMA.PRODUCT.STOCK]),
    category: trimSafe_(row[SHEET_SCHEMA.PRODUCT.CATEGORY]),
    status: trimSafe_(row[SHEET_SCHEMA.PRODUCT.STATUS]),
    image: trimSafe_(row[SHEET_SCHEMA.PRODUCT.IMAGE]),
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
    const row = [
      generateId_("prod"),
      data.name,
      data.category,
      data.price,
      data.cost,
      data.stock,
      data.status,
      data.image,
    ];

    appendRowsBatch_(SHEET_NAME.PRODUCT, [row]);
    const product = mapProductRow_(row);
    logAction_("CREATE_PRODUCT", product.id, (payload || {}).userRole || "system", product);
    pushDeltaSafe_("PRODUCT", "CREATE", product);
    return product;
  });
}

function updateProduct(productId, payload) {
  return withStockLock_("product_" + productId, function () {
    const found = findRowById_(SHEET_NAME.PRODUCT, productId);
    if (!found) throw new Error("PRODUCT_NOT_FOUND");

    const row = found.values;
    const data = payload || {};

    if (data.name !== undefined) row[SHEET_SCHEMA.PRODUCT.NAME] = trimSafe_(data.name);
    if (data.category !== undefined) row[SHEET_SCHEMA.PRODUCT.CATEGORY] = trimSafe_(data.category);
    if (data.price !== undefined) row[SHEET_SCHEMA.PRODUCT.SALE_PRICE] = toNumberSafe_(data.price);
    if (data.cost !== undefined) row[SHEET_SCHEMA.PRODUCT.COST_PRICE] = toNumberSafe_(data.cost);
    if (data.stock !== undefined) row[SHEET_SCHEMA.PRODUCT.STOCK] = toNumberSafe_(data.stock);
    if (data.status !== undefined) row[SHEET_SCHEMA.PRODUCT.STATUS] = trimSafe_(data.status).toUpperCase();
    if (data.image !== undefined) row[SHEET_SCHEMA.PRODUCT.IMAGE] = trimSafe_(data.image);

    batchWriteRows_(SHEET_NAME.PRODUCT, found.rowIndex, 1, [row]);
    const product = mapProductRow_(row);
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

  var products = getProducts(false); // Get all products
  var map = {};
  products.forEach(function (p) {
    map[p.id] = p;
  });

  items.forEach(function (item) {
    var product = map[item.productId];
    if (!product) {
      throw new Error("PRODUCT_NOT_FOUND: " + item.productId);
    }
    const qty = toNumberSafe_(item.quantity);
    if (qty <= 0) {
      throw new Error("INVALID_QUANTITY: " + product.name);
    }
    if (product.stock < qty) {
      throw new Error(
        "INSUFFICIENT_STOCK: " +
          product.name +
          ": available " +
          product.stock +
          ", requested " +
          qty,
      );
    }
  });
}

function reduceProductStock_(items) {
  return withTransaction_("reduce_stock", function () {
    if (!Array.isArray(items) || items.length === 0) {
      return 0;
    }

    var rows = getSheetData_(SHEET_NAME.PRODUCT, false);
    var updatedRows = rows.slice();
    var reduced = 0;

    for (var i = 1; i < updatedRows.length; i++) {
      var row = updatedRows[i];
      var productId = trimSafe_(row[SHEET_SCHEMA.PRODUCT.ID]);

      items.forEach(function (item) {
        if (trimSafe_(item.productId) === productId) {
          var currentStock = toNumberSafe_(row[SHEET_SCHEMA.PRODUCT.STOCK]);
          var reduceQty = toNumberSafe_(item.quantity);
          var newStock = currentStock - reduceQty;

          // ✓ Prevent negative stock
          if (newStock < 0) {
            throw new Error("INSUFFICIENT_STOCK: " + productId);
          }

          row[SHEET_SCHEMA.PRODUCT.STOCK] = newStock;

          // Log inventory change
          createInventoryJournal_({
            productId: productId,
            type: "REDUCE_BY_ORDER",
            quantity: reduceQty,
            beforeStock: currentStock,
            afterStock: newStock,
          });

          reduced++;
        }
      });
    }

    // ✓ Atomic write - only write if no error
    batchWriteRows_(SHEET_NAME.PRODUCT, 1, updatedRows.length, updatedRows);
    pushDeltaSafe_("PRODUCT", "STOCK_REDUCE", { items, reduced });
    return reduced;
  });
}

// Inventory Journal & Adjust
function createInventoryJournal_(payload) {
  appendRowsBatch_(APP_CONFIG.INVENTORY_JOURNAL_SHEET, [
    [
      generateId_("inv"),
      payload.productId,
      payload.type,
      payload.quantity,
      payload.beforeStock,
      payload.afterStock,
      payload.orderId || "",
      toIsoString_(new Date()),
    ],
  ]);
}

function adjustInventory_(payload) {
  return withStockLock_(payload.productId, function () {
    var found = findRowById_(SHEET_NAME.PRODUCT, payload.productId);
    if (!found) throw new Error("Product not found");

    var row = found.values;
    var beforeStock = toNumberSafe_(row[SHEET_SCHEMA.PRODUCT.STOCK]);
    var afterStock = beforeStock + toNumberSafe_(payload.delta);

    if (afterStock < 0) throw new Error("Negative stock");

    row[SHEET_SCHEMA.PRODUCT.STOCK] = afterStock;

    batchWriteRows_(SHEET_NAME.PRODUCT, found.rowIndex, 1, [row]);

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
      beforeStock,
      afterStock,
      delta: payload.delta,
      type: payload.type,
    });

    return afterStock;
  });
}
