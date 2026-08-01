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
    usageLimit: doc.usageLimit !== undefined && doc.usageLimit !== null && doc.usageLimit !== "" ? toNumberSafe_(doc.usageLimit) : null,
    usedCount: toNumberSafe_(doc.usedCount || 0),
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

  const usageLimit = data.usageLimit !== undefined && data.usageLimit !== null && data.usageLimit !== "" ? toNumberSafe_(data.usageLimit) : null;
  const expiresAt = trimSafe_(data.expiresAt);
  if (!expiresAt) {
    throw new Error("MISSING_FIELDS: expiresAt (Ngày hết hạn không được để trống)");
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const expDate = new Date(expiresAt);
  if (isNaN(expDate.getTime()) || expDate < today) {
    throw new Error("INVALID_EXPIRES_AT: Ngày hết hạn không được là ngày trong quá khứ");
  }

  return {
    code,
    type,
    value: toNumberSafe_(data.value),
    minOrderValue: toNumberSafe_(data.minOrderValue),
    maxDiscount: toNumberSafe_(data.maxDiscount),
    usageLimit: usageLimit,
    usedCount: toNumberSafe_(data.usedCount || 0),
    status: trimSafe_(data.status || "ACTIVE").toUpperCase(),
    expiresAt: expiresAt,
  };
}

function getCoupons(activeOnly) {
  const docs = firestoreQuery_("discounts");
  const coupons = [];

  for (let i = 0; i < docs.length; i++) {
    const coupon = mapCouponDoc_(docs[i]);
    if (!coupon.id) continue;
    if (coupon.status === "DELETED") continue;
    if (activeOnly) {
      if (coupon.status !== "ACTIVE") continue;
      if (coupon.usageLimit !== null && coupon.usageLimit > 0 && coupon.usedCount >= coupon.usageLimit) continue;
    }
    coupons.push(coupon);
  }

  return coupons.sort(function (a, b) {
    var timeA = new Date(a.createdAt || a.updatedAt || 0).getTime();
    var timeB = new Date(b.createdAt || b.updatedAt || 0).getTime();
    if (timeA && timeB && timeA !== timeB) return timeB - timeA;
    return String(b.id || "").localeCompare(String(a.id || ""));
  });
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
      usageLimit: data.usageLimit,
      usedCount: data.usedCount || 0,
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
    if (data.usageLimit !== undefined) {
      updates.usageLimit = data.usageLimit !== null && data.usageLimit !== "" ? toNumberSafe_(data.usageLimit) : null;
    }
    if (data.usedCount !== undefined) updates.usedCount = toNumberSafe_(data.usedCount);
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

function recordCouponUse_(discountId) {
  if (!discountId) return;
  try {
    const existing = firestoreGet_("discounts", discountId);
    if (existing) {
      const newUsedCount = toNumberSafe_(existing.usedCount || 0) + 1;
      const updates = { usedCount: newUsedCount, updatedAt: toIsoString_(new Date()) };
      const limit = existing.usageLimit !== undefined && existing.usageLimit !== null && existing.usageLimit !== "" ? toNumberSafe_(existing.usageLimit) : null;
      if (limit !== null && limit > 0 && newUsedCount >= limit) {
        updates.status = "EXPIRED";
      }
      firestoreUpdate_("discounts", discountId, updates);
    }
  } catch (e) {
    console.warn("recordCouponUse_ error:", e);
  }
}

function deleteCoupon(couponId, payload) {
  return updateCoupon(couponId, {
    ...(payload || {}),
    status: "DELETED",
  });
}
