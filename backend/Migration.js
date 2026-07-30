/* =========================
 * Migration.js - Script chuyển dữ liệu từ Google Sheets sang Firestore
 * Có thể chạy trực tiếp từ GAS Editor: runMigrationFromSheetsToFirestore()
 * hoặc gọi qua API endpoint (Chỉ Admin)
 * ========================= */

/**
 * Hàm chính thực thi Migration dữ liệu từ Sheets -> Firestore
 */
function runMigrationFromSheetsToFirestore() {
  const log = [];
  const appendLog = (msg) => {
    console.log(msg);
    log.push(msg);
  };

  appendLog("==========================================");
  appendLog("🚀 BẮT ĐẦU MIGRATION DỮ LIỆU SHEETS ➔ FIRESTORE");
  appendLog("==========================================");

  try {
    // 1. MIGRATE STORE INFO
    appendLog("\n[1/9] Chuyển đổi Thông tin quán (STORE_INFO)...");
    try {
      const infoRows = getSheetData_(SHEET_NAME.STORE_INFO, false);
      const storeConfig = {};
      for (let i = 1; i < infoRows.length; i++) {
        const key = trimSafe_(infoRows[i][SHEET_SCHEMA.STORE_INFO.KEY]);
        if (!key) continue;
        storeConfig[key] = trimSafe_(infoRows[i][SHEET_SCHEMA.STORE_INFO.VALUE]);
      }
      storeConfig.updatedAt = toIsoString_(new Date());
      firestoreSet_("store_info", "config", storeConfig);
      appendLog(`  ✓ Đã lưu store_info/config (${Object.keys(storeConfig).length - 1} khóa)`);
    } catch (e) {
      appendLog(`  ⚠️ Lỗi STORE_INFO: ${e.message}`);
    }

    // 2. MIGRATE ACCOUNTS
    appendLog("\n[2/9] Chuyển đổi Tài khoản (ACCOUNT)...");
    try {
      const accRows = getSheetData_(SHEET_NAME.ACCOUNT, false);
      let accCount = 0;
      for (let i = 1; i < accRows.length; i++) {
        const id = trimSafe_(accRows[i][SHEET_SCHEMA.ACCOUNT.ID]);
        if (!id) continue;
        const accData = {
          id: id,
          username: trimSafe_(accRows[i][SHEET_SCHEMA.ACCOUNT.USERNAME]),
          password: trimSafe_(accRows[i][SHEET_SCHEMA.ACCOUNT.PASSWORD]),
          role: trimSafe_(accRows[i][SHEET_SCHEMA.ACCOUNT.ROLE]) || "staff",
          createdAt: trimSafe_(accRows[i][SHEET_SCHEMA.ACCOUNT.CREATED_AT]) || toIsoString_(new Date()),
          lastLogin: trimSafe_(accRows[i][SHEET_SCHEMA.ACCOUNT.LAST_LOGIN]),
        };
        firestoreSet_("accounts", id, accData);
        accCount++;
      }
      appendLog(`  ✓ Đã chuyển đổi ${accCount} Tài khoản`);
    } catch (e) {
      appendLog(`  ⚠️ Lỗi ACCOUNT: ${e.message}`);
    }

    // 3. MIGRATE PRODUCTS
    appendLog("\n[3/9] Chuyển đổi Hàng hoá (PRODUCT)...");
    try {
      const prodRows = getSheetData_(SHEET_NAME.PRODUCT, false);
      let prodCount = 0;
      for (let i = 1; i < prodRows.length; i++) {
        const id = trimSafe_(prodRows[i][SHEET_SCHEMA.PRODUCT.ID]);
        if (!id) continue;
        const saleP = toNumberSafe_(prodRows[i][SHEET_SCHEMA.PRODUCT.SALE_PRICE], 0);
        const costP = toNumberSafe_(prodRows[i][SHEET_SCHEMA.PRODUCT.COST_PRICE], 0);
        const prodData = {
          id: id,
          name: trimSafe_(prodRows[i][SHEET_SCHEMA.PRODUCT.NAME]),
          category: trimSafe_(prodRows[i][SHEET_SCHEMA.PRODUCT.CATEGORY]) || "Khác",
          price: saleP,
          salePrice: saleP,
          cost: costP,
          costPrice: costP,
          stock: toNumberSafe_(prodRows[i][SHEET_SCHEMA.PRODUCT.STOCK], 0),
          status: trimSafe_(prodRows[i][SHEET_SCHEMA.PRODUCT.STATUS]) || "ACTIVE",
          image: trimSafe_(prodRows[i][SHEET_SCHEMA.PRODUCT.IMAGE]),
        };
        firestoreSet_("products", id, prodData);
        prodCount++;
      }
      appendLog(`  ✓ Đã chuyển đổi ${prodCount} Sản phẩm`);
    } catch (e) {
      appendLog(`  ⚠️ Lỗi PRODUCT: ${e.message}`);
    }

    // 4. MIGRATE TABLES
    appendLog("\n[4/9] Chuyển đổi Bàn (TABLE)...");
    try {
      const tableRows = getSheetData_(SHEET_NAME.TABLE, false);
      let tableCount = 0;
      for (let i = 1; i < tableRows.length; i++) {
        const id = trimSafe_(tableRows[i][SHEET_SCHEMA.TABLE.ID]);
        if (!id) continue;
        const tableData = {
          id: id,
          name: trimSafe_(tableRows[i][SHEET_SCHEMA.TABLE.NAME]),
          status: trimSafe_(tableRows[i][SHEET_SCHEMA.TABLE.STATUS]).toLowerCase() || "available",
          currentOrderId: trimSafe_(tableRows[i][SHEET_SCHEMA.TABLE.CURRENT_ORDER_ID]),
        };
        firestoreSet_("tables", id, tableData);
        tableCount++;
      }
      appendLog(`  ✓ Đã chuyển đổi ${tableCount} Bàn`);
    } catch (e) {
      appendLog(`  ⚠️ Lỗi TABLE: ${e.message}`);
    }

    // 5. MIGRATE COUPONS / DISCOUNTS
    appendLog("\n[5/9] Chuyển đổi Khuyến mãi (COUPON)...");
    try {
      const couponRows = getSheetData_(SHEET_NAME.COUPON, false);
      let couponCount = 0;
      for (let i = 1; i < couponRows.length; i++) {
        const id = trimSafe_(couponRows[i][SHEET_SCHEMA.COUPON.ID]);
        if (!id) continue;
        const couponData = {
          id: id,
          code: trimSafe_(couponRows[i][SHEET_SCHEMA.COUPON.CODE]).toUpperCase(),
          type: trimSafe_(couponRows[i][SHEET_SCHEMA.COUPON.TYPE]).toLowerCase() || "fixed",
          value: toNumberSafe_(couponRows[i][SHEET_SCHEMA.COUPON.VALUE], 0),
          minOrderValue: toNumberSafe_(couponRows[i][SHEET_SCHEMA.COUPON.MIN_ORDER_VALUE], 0),
          maxDiscount: toNumberSafe_(couponRows[i][SHEET_SCHEMA.COUPON.MAX_DISCOUNT], 0),
          status: trimSafe_(couponRows[i][SHEET_SCHEMA.COUPON.STATUS]) || "ACTIVE",
          expiresAt: trimSafe_(couponRows[i][SHEET_SCHEMA.COUPON.EXPIRES_AT]),
        };
        firestoreSet_("discounts", id, couponData);
        couponCount++;
      }
      appendLog(`  ✓ Đã chuyển đổi ${couponCount} Mã Khuyến mãi`);
    } catch (e) {
      appendLog(`  ⚠️ Lỗi COUPON: ${e.message}`);
    }

    // 6. MIGRATE ORDERS & ORDER_DETAILS (Embedded)
    appendLog("\n[6/9] Chuyển đổi Đơn hàng & Chi tiết món (ORDER + ORDER_DETAIL)...");
    try {
      // Group order details by orderId
      const detailRows = getSheetData_(SHEET_NAME.ORDER_DETAIL, false);
      const detailsMap = {};
      for (let i = 1; i < detailRows.length; i++) {
        const orderId = trimSafe_(detailRows[i][SHEET_SCHEMA.ORDER_DETAIL.ORDER_ID]);
        if (!orderId) continue;
        if (!detailsMap[orderId]) detailsMap[orderId] = [];

        detailsMap[orderId].push({
          id: trimSafe_(detailRows[i][SHEET_SCHEMA.ORDER_DETAIL.ID]),
          productId: trimSafe_(detailRows[i][SHEET_SCHEMA.ORDER_DETAIL.PRODUCT_ID]),
          productName: trimSafe_(detailRows[i][SHEET_SCHEMA.ORDER_DETAIL.PRODUCT_NAME]),
          quantity: toNumberSafe_(detailRows[i][SHEET_SCHEMA.ORDER_DETAIL.QUANTITY], 1),
          unitPrice: toNumberSafe_(detailRows[i][SHEET_SCHEMA.ORDER_DETAIL.UNIT_PRICE], 0),
          subtotal: toNumberSafe_(detailRows[i][SHEET_SCHEMA.ORDER_DETAIL.SUBTOTAL], 0),
        });
      }

      const orderRows = getSheetData_(SHEET_NAME.ORDER, false);
      let orderCount = 0;
      for (let i = 1; i < orderRows.length; i++) {
        const id = trimSafe_(orderRows[i][SHEET_SCHEMA.ORDER.ID]);
        if (!id) continue;

        const embeddedItems = detailsMap[id] || [];

        const orderData = {
          id: id,
          tableId: trimSafe_(orderRows[i][SHEET_SCHEMA.ORDER.TABLE_ID]),
          customerName: trimSafe_(orderRows[i][SHEET_SCHEMA.ORDER.CUSTOMER_NAME]) || "Khách lẻ",
          status: trimSafe_(orderRows[i][SHEET_SCHEMA.ORDER.STATUS]) || "CLOSED",
          subtotal: toNumberSafe_(orderRows[i][SHEET_SCHEMA.ORDER.SUBTOTAL], 0),
          discount: toNumberSafe_(orderRows[i][SHEET_SCHEMA.ORDER.DISCOUNT], 0),
          grandTotal: toNumberSafe_(orderRows[i][SHEET_SCHEMA.ORDER.GRAND_TOTAL], 0),
          paymentStatus: trimSafe_(orderRows[i][SHEET_SCHEMA.ORDER.PAYMENT_STATUS]) || "PAID",
          createdBy: trimSafe_(orderRows[i][SHEET_SCHEMA.ORDER.CREATED_BY]) || "staff",
          createdAt: trimSafe_(orderRows[i][SHEET_SCHEMA.ORDER.CREATED_AT]) || toIsoString_(new Date()),
          paymentMethod: trimSafe_(orderRows[i][SHEET_SCHEMA.ORDER.PAYMENT_METHOD]) || "cash",
          items: embeddedItems,
        };

        firestoreSet_("orders", id, orderData);
        orderCount++;
      }
      appendLog(`  ✓ Đã chuyển đổi ${orderCount} Đơn hàng (kèm ${Object.keys(detailsMap).length} chi tiết món)`);
    } catch (e) {
      appendLog(`  ⚠️ Lỗi ORDER: ${e.message}`);
    }

    // 7. MIGRATE ORDER SNAPSHOTS
    appendLog("\n[7/9] Chuyển đổi Snapshot Đơn Hàng (ORDER_SNAPSHOT)...");
    try {
      const snapRows = getSheetData_(SHEET_NAME.ORDER_SNAPSHOT, false);
      let snapCount = 0;
      for (let i = 1; i < snapRows.length; i++) {
        const orderId = trimSafe_(snapRows[i][SHEET_SCHEMA.ORDER_SNAPSHOT.ORDER_ID]);
        if (!orderId) continue;

        const snapData = {
          orderId: orderId,
          snapshotData: trimSafe_(snapRows[i][SHEET_SCHEMA.ORDER_SNAPSHOT.SNAPSHOT_DATA]),
          version: trimSafe_(snapRows[i][SHEET_SCHEMA.ORDER_SNAPSHOT.VERSION]) || "v1",
          frozenAt: trimSafe_(snapRows[i][SHEET_SCHEMA.ORDER_SNAPSHOT.FROZEN_AT]),
          frozen: true,
        };

        firestoreSet_("order_snapshots", orderId, snapData);
        snapCount++;
      }
      appendLog(`  ✓ Đã chuyển đổi ${snapCount} Snapshot Đơn hàng`);
    } catch (e) {
      appendLog(`  ⚠️ Lỗi ORDER_SNAPSHOT: ${e.message}`);
    }

    // 8. MIGRATE PAYMENTS
    appendLog("\n[8/9] Chuyển đổi Lịch sử Thanh toán (PAYMENT)...");
    try {
      const payRows = getSheetData_(SHEET_NAME.PAYMENT, false);
      let payCount = 0;
      for (let i = 1; i < payRows.length; i++) {
        const id = trimSafe_(payRows[i][SHEET_SCHEMA.PAYMENT.ID]);
        if (!id) continue;

        const payData = {
          id: id,
          orderId: trimSafe_(payRows[i][SHEET_SCHEMA.PAYMENT.ORDER_ID]),
          provider: trimSafe_(payRows[i][SHEET_SCHEMA.PAYMENT.PROVIDER]) || "manual",
          amount: toNumberSafe_(payRows[i][SHEET_SCHEMA.PAYMENT.AMOUNT], 0),
          status: trimSafe_(payRows[i][SHEET_SCHEMA.PAYMENT.STATUS]) || "PAID",
          transactionId: trimSafe_(payRows[i][SHEET_SCHEMA.PAYMENT.TRANSACTION_ID]),
          paidAt: trimSafe_(payRows[i][SHEET_SCHEMA.PAYMENT.PAID_AT]),
          recordedBy: trimSafe_(payRows[i][SHEET_SCHEMA.PAYMENT.RECORDED_BY]),
          fingerprint: trimSafe_(payRows[i][SHEET_SCHEMA.PAYMENT.FINGERPRINT]),
          createdAt: trimSafe_(payRows[i][SHEET_SCHEMA.PAYMENT.PAID_AT]) || toIsoString_(new Date()),
        };

        firestoreSet_("payments", id, payData);
        payCount++;
      }
      appendLog(`  ✓ Đã chuyển đổi ${payCount} Giao dịch Thanh toán`);
    } catch (e) {
      appendLog(`  ⚠️ Lỗi PAYMENT: ${e.message}`);
    }

    // 9. MIGRATE SHIFTS
    appendLog("\n[9/9] Chuyển đổi Ca làm việc (SHIFT)...");
    try {
      const shiftRows = getSheetData_(SHEET_NAME.SHIFT, false);
      let shiftCount = 0;
      for (let i = 1; i < shiftRows.length; i++) {
        const id = trimSafe_(shiftRows[i][SHEET_SCHEMA.SHIFT.ID]);
        if (!id) continue;

        const shiftData = {
          id: id,
          staffName: trimSafe_(shiftRows[i][SHEET_SCHEMA.SHIFT.STAFF_NAME]),
          startTime: trimSafe_(shiftRows[i][SHEET_SCHEMA.SHIFT.START_TIME]),
          endTime: trimSafe_(shiftRows[i][SHEET_SCHEMA.SHIFT.END_TIME]),
          actualOpeningCash: toNumberSafe_(shiftRows[i][SHEET_SCHEMA.SHIFT.OPENING_CASH], 0),
          actualClosingCash: toNumberSafe_(shiftRows[i][SHEET_SCHEMA.SHIFT.CASH_IN_REGISTER] ?? shiftRows[i][SHEET_SCHEMA.SHIFT.CASH_AMOUNT], 0),
          status: trimSafe_(shiftRows[i][SHEET_SCHEMA.SHIFT.STATUS]) || "closed",
          createdAt: trimSafe_(shiftRows[i][SHEET_SCHEMA.SHIFT.CREATED_AT]),
          closedAt: trimSafe_(shiftRows[i][SHEET_SCHEMA.SHIFT.CLOSED_AT]),
        };

        firestoreSet_("shifts", id, shiftData);
        shiftCount++;
      }
      appendLog(`  ✓ Đã chuyển đổi ${shiftCount} Ca làm việc`);
    } catch (e) {
      appendLog(`  ⚠️ Lỗi SHIFT: ${e.message}`);
    }

    appendLog("\n==========================================");
    appendLog("🎉 MIGRATION HOÀN TẤT THÀNH CÔNG!");
    appendLog("==========================================");

    return {
      success: true,
      log: log,
    };
  } catch (err) {
    appendLog(`❌ LỖI NGHIÊM TRỌNG MIGRATION: ${err.message}`);
    return {
      success: false,
      error: err.message,
      log: log,
    };
  }
}
