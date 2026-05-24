/* =========================
 * Coupon.gs - Quản lý mã khuyến mãi
 * ========================= */

function mapCouponRow_(row) {
  return {
    id: trimSafe_(row[SHEET_SCHEMA.COUPON.ID]),
    code: trimSafe_(row[SHEET_SCHEMA.COUPON.CODE]),
    type: trimSafe_(row[SHEET_SCHEMA.COUPON.TYPE]).toLowerCase(),
    value: toNumberSafe_(row[SHEET_SCHEMA.COUPON.VALUE]),
    minOrderValue: toNumberSafe_(row[SHEET_SCHEMA.COUPON.MIN_ORDER_VALUE]),
    maxDiscount: toNumberSafe_(row[SHEET_SCHEMA.COUPON.MAX_DISCOUNT]),
    status: trimSafe_(row[SHEET_SCHEMA.COUPON.STATUS]).toUpperCase(),
    expiresAt: trimSafe_(row[SHEET_SCHEMA.COUPON.EXPIRES_AT]),
  };
}

function normalizeCouponPayload_(payload) {
  const data = payload || {};
  const code = trimSafe_(data.code).toUpperCase();
  if (!code) throw new Error("MISSING_FIELDS: code");

  const type = trimSafe_(data.type || "fixed").toLowerCase();
  if (type !== "fixed" && type !== "percent") {
    throw new Error("INVALID_COUPON_TYPE");
  }

  return {
    code,
    type,
    value: toNumberSafe_(data.value),
    minOrderValue: toNumberSafe_(data.minOrderValue),
    maxDiscount: toNumberSafe_(data.maxDiscount),
    status: trimSafe_(data.status || "ACTIVE").toUpperCase(),
    expiresAt: trimSafe_(data.expiresAt),
  };
}

function getCoupons(activeOnly) {
  const rows = getSheetData_(SHEET_NAME.COUPON);
  const coupons = [];

  for (let i = 1; i < rows.length; i++) {
    const coupon = mapCouponRow_(rows[i]);
    if (!coupon.id) continue;
    if (coupon.status === "DELETED") continue;
    if (activeOnly && coupon.status !== "ACTIVE") continue;
    coupons.push(coupon);
  }

  return coupons;
}

function createCoupon(payload) {
  return withPaymentLock_("coupon_create", function () {
    const data = normalizeCouponPayload_(payload);
    const existing = getCoupons(false).find((coupon) => coupon.code === data.code);
    if (existing) throw new Error("COUPON_CODE_EXISTS");

    const row = [
      generateId_("coupon"),
      data.code,
      data.type,
      data.value,
      data.minOrderValue,
      data.maxDiscount,
      data.status,
      data.expiresAt,
    ];

    appendRowsBatch_(SHEET_NAME.COUPON, [row]);
    const coupon = mapCouponRow_(row);
    logAction_("CREATE_COUPON", coupon.id, (payload || {}).userRole || "system", coupon);
    pushDeltaSafe_("COUPON", "CREATE", coupon);
    return coupon;
  });
}

function updateCoupon(couponId, payload) {
  return withPaymentLock_("coupon_" + couponId, function () {
    const found = findRowById_(SHEET_NAME.COUPON, couponId);
    if (!found) throw new Error("COUPON_NOT_FOUND");

    const row = found.values;
    const data = payload || {};

    if (data.code !== undefined) row[SHEET_SCHEMA.COUPON.CODE] = trimSafe_(data.code).toUpperCase();
    if (data.type !== undefined) row[SHEET_SCHEMA.COUPON.TYPE] = trimSafe_(data.type).toLowerCase();
    if (data.value !== undefined) row[SHEET_SCHEMA.COUPON.VALUE] = toNumberSafe_(data.value);
    if (data.minOrderValue !== undefined) row[SHEET_SCHEMA.COUPON.MIN_ORDER_VALUE] = toNumberSafe_(data.minOrderValue);
    if (data.maxDiscount !== undefined) row[SHEET_SCHEMA.COUPON.MAX_DISCOUNT] = toNumberSafe_(data.maxDiscount);
    if (data.status !== undefined) row[SHEET_SCHEMA.COUPON.STATUS] = trimSafe_(data.status).toUpperCase();
    if (data.expiresAt !== undefined) row[SHEET_SCHEMA.COUPON.EXPIRES_AT] = trimSafe_(data.expiresAt);

    batchWriteRows_(SHEET_NAME.COUPON, found.rowIndex, 1, [row]);
    const coupon = mapCouponRow_(row);
    logAction_("UPDATE_COUPON", coupon.id, data.userRole || "system", coupon);
    pushDeltaSafe_("COUPON", "UPDATE", coupon);
    return coupon;
  });
}

function deleteCoupon(couponId, payload) {
  return updateCoupon(couponId, {
    ...(payload || {}),
    status: "DELETED",
  });
}
