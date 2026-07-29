/* =========================
 * Coupon.gs - Quản lý mã khuyến mãi - Firestore
 * ========================= */

function mapCouponDoc_(doc) {
  return {
    id: trimSafe_(doc.id),
    code: trimSafe_(doc.code),
    type: trimSafe_(doc.type).toLowerCase(),
    value: toNumberSafe_(doc.value),
    minOrderValue: toNumberSafe_(doc.minOrderValue),
    maxDiscount: toNumberSafe_(doc.maxDiscount),
    status: trimSafe_(doc.status).toUpperCase(),
    expiresAt: trimSafe_(doc.expiresAt),
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
  const docs = firestoreQuery_("discounts");
  const coupons = [];

  for (let i = 0; i < docs.length; i++) {
    const coupon = mapCouponDoc_(docs[i]);
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

    const couponId = generateId_("coupon");
    const now = toIsoString_(new Date());

    const couponData = {
      id: couponId,
      code: data.code,
      type: data.type,
      value: data.value,
      minOrderValue: data.minOrderValue,
      maxDiscount: data.maxDiscount,
      status: data.status,
      expiresAt: data.expiresAt,
      createdAt: now,
      updatedAt: now,
    };

    firestoreSet_("discounts", couponId, couponData);

    const coupon = mapCouponDoc_(couponData);
    logAction_("CREATE_COUPON", coupon.id, (payload || {}).userRole || "system", coupon);
    pushDeltaSafe_("COUPON", "CREATE", coupon);
    return coupon;
  });
}

function updateCoupon(couponId, payload) {
  return withPaymentLock_("coupon_" + couponId, function () {
    const existing = firestoreGet_("discounts", couponId);
    if (!existing) throw new Error("COUPON_NOT_FOUND");

    const data = payload || {};
    const updates = {};

    if (data.code !== undefined) updates.code = trimSafe_(data.code).toUpperCase();
    if (data.type !== undefined) updates.type = trimSafe_(data.type).toLowerCase();
    if (data.value !== undefined) updates.value = toNumberSafe_(data.value);
    if (data.minOrderValue !== undefined) updates.minOrderValue = toNumberSafe_(data.minOrderValue);
    if (data.maxDiscount !== undefined) updates.maxDiscount = toNumberSafe_(data.maxDiscount);
    if (data.status !== undefined) updates.status = trimSafe_(data.status).toUpperCase();
    if (data.expiresAt !== undefined) updates.expiresAt = trimSafe_(data.expiresAt);
    updates.updatedAt = toIsoString_(new Date());

    const updated = firestoreUpdate_("discounts", couponId, updates);

    const coupon = mapCouponDoc_(updated);
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
