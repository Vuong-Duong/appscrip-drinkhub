/* =========================
 * Shift.js - Ca làm việc & Đối chiếu tiền mặt (Firestore)
 * GET_SHIFTS, CREATE_SHIFT, UPDATE_SHIFT, CLOSE_SHIFT, ADD_CASH_ADJUSTMENT, GET_SHIFT_RECONCILIATION
 * ========================= */

/**
 * Lấy danh sách ca (Bảo mật: Nhân viên không xem được các con số dự kiến/chênh lệch)
 */
const getShifts = (filters = {}) => {
  try {
    const docs = firestoreQuery_("shifts");
    if (!Array.isArray(docs) || docs.length === 0) return [];

    const normalized = docs
      .map((doc) => {
        if (!doc || !doc.id) return null;
        return {
          id: trimSafe_(doc.id),
          staffName: trimSafe_(doc.staffName),
          startTime: trimSafe_(doc.startTime),
          endTime: trimSafe_(doc.endTime),
          actualOpeningCash: toNumber_(doc.actualOpeningCash ?? doc.openingCash),
          actualClosingCash: toNumber_(doc.actualClosingCash ?? doc.cashAmount),
          status: trimSafe_(doc.status),
          createdAt: trimSafe_(doc.createdAt),
          closedAt: trimSafe_(doc.closedAt),
        };
      })
      .filter((s) => s !== null);

    const sortedShifts = normalized.sort(
      (a, b) => new Date(b.startTime || b.createdAt || 0).getTime() - new Date(a.startTime || a.createdAt || 0).getTime(),
    );

    if (filters.status) {
      return sortedShifts.filter((s) => s.status === filters.status);
    }

    return sortedShifts;
  } catch (err) {
    logAction_("ERROR", "GET_SHIFTS", "system", { error: err.message });
    throw new Error("SHIFT_FETCH_FAILED");
  }
};

/**
 * Tạo ca mới - Nhân viên mở ca nhập tiền thực tế đầu ca
 */
const createShift = (payload = {}) => {
  if (!payload.staffName) throw new Error("STAFF_NAME_REQUIRED: Vui lòng nhập tên nhân viên");

  try {
    const shiftId = generateId_("shift");
    const now = new Date().toISOString();
    const openingCashVal = toNumber_(payload.actualOpeningCash ?? payload.openingCash ?? 0);

    const shiftData = {
      id: shiftId,
      staffName: trimSafe_(payload.staffName),
      startTime: trimSafe_(payload.startTime || now),
      endTime: "",
      actualOpeningCash: openingCashVal,
      actualClosingCash: 0,
      status: "open",
      createdAt: now,
      closedAt: "",
    };

    firestoreSet_("shifts", shiftId, shiftData);

    logAction_("CREATE_SHIFT", shiftId, payload.staffName, {
      actualOpeningCash: openingCashVal,
    });

    return shiftData;
  } catch (err) {
    logAction_("ERROR", "CREATE_SHIFT", "system", { error: err.message });
    throw new Error("SHIFT_CREATE_FAILED: " + err.message);
  }
};

/**
 * Đóng ca - Nhân viên đếm két nhập tiền thực tế cuối ca
 * Phản hồi KHÔNG chứa expectedCash hay difference
 */
const closeShift = (shiftId, payload = {}) => {
  if (!shiftId) throw new Error("SHIFT_ID_REQUIRED");

  try {
    const existing = firestoreGet_("shifts", shiftId);
    if (!existing) throw new Error("SHIFT_NOT_FOUND");
    if (existing.status === "closed") throw new Error("SHIFT_ALREADY_CLOSED: Ca này đã đóng trước đó");

    const now = new Date().toISOString();
    const actualClosingVal = toNumber_(payload.actualClosingCash ?? payload.cashAmount ?? 0);

    const updates = {
      endTime: trimSafe_(payload.endTime || now),
      actualClosingCash: actualClosingVal,
      status: "closed",
      closedAt: now,
      updatedAt: now,
    };

    const updated = firestoreUpdate_("shifts", shiftId, updates);

    logAction_("CLOSE_SHIFT", shiftId, existing.staffName, {
      actualClosingCash: actualClosingVal,
    });

    return {
      id: shiftId,
      staffName: trimSafe_(updated.staffName || existing.staffName),
      startTime: trimSafe_(updated.startTime || existing.startTime),
      endTime: updated.endTime,
      actualOpeningCash: toNumber_(updated.actualOpeningCash ?? existing.actualOpeningCash),
      actualClosingCash: actualClosingVal,
      status: "closed",
      closedAt: now,
    };
  } catch (err) {
    logAction_("ERROR", "CLOSE_SHIFT", "system", { error: err.message });
    throw new Error("SHIFT_CLOSE_FAILED: " + err.message);
  }
};

/**
 * RÚT / NẠP KÉT TIỀN MẶT - CHỈ ADMIN MỚI ĐƯỢC THỰC HIỆN (BẢO MẬT API LEVEL)
 */
const addCashAdjustment = (userRole, payload = {}) => {
  if (!userRole || userRole.toLowerCase() !== "admin") {
    throw new Error("PERMISSION_DENIED: Chỉ Chủ quán / Admin mới có quyền Rút/Nạp két tiền");
  }

  const shiftId = trimSafe_(payload.shiftId);
  const amount = toNumber_(payload.amount);
  const reason = trimSafe_(payload.reason);
  if (!shiftId) throw new Error("MISSING_FIELDS: shiftId required");
  if (amount === 0) throw new Error("INVALID_AMOUNT: Số tiền điều chỉnh phải khác 0");
  if (!reason) throw new Error("MISSING_FIELDS: Lý do rút/nạp két tiền là bắt buộc");

  const existingShift = firestoreGet_("shifts", shiftId);
  if (!existingShift) throw new Error("SHIFT_NOT_FOUND");

  const adjId = generateId_("adj");
  const now = new Date().toISOString();

  const adjData = {
    id: adjId,
    shiftId: shiftId,
    amount: amount,
    reason: reason,
    createdBy: trimSafe_(payload.createdBy || "Admin"),
    createdAt: now,
  };

  firestoreSet_("cash_adjustments", adjId, adjData);

  logAction_("CASH_ADJUSTMENT", shiftId, "admin", {
    amount,
    reason,
  });

  return adjData;
};

/**
 * MÀN HÌNH ĐỐI CHIẾU TIỀN MẶT THEO CA - CHỈ OWNER / ADMIN MỚI ĐƯỢC GỌI (BẢO MẬT API LEVEL)
 */
const getShiftReconciliation = (userRole, filters = {}) => {
  if (!userRole || userRole.toLowerCase() !== "admin") {
    throw new Error("PERMISSION_DENIED: Chỉ Chủ quán / Admin mới có quyền xem dữ liệu đối chiếu két");
  }

  try {
    const shifts = firestoreQuery_("shifts") || [];
    const allOrders = firestoreQuery_("orders") || [];
    const allAdjustments = firestoreQuery_("cash_adjustments") || [];

    const range = filters.range || "today";
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

    const staffFilter = trimSafe_(filters.staffName);
    const statusFilter = trimSafe_(filters.reconciliationStatus); // "THIEU" | "KHOP" | "DU"

    const reconciliationList = [];

    shifts.forEach((shift) => {
      if (!shift || !shift.id) return;

      const shiftStart = new Date(shift.startTime);
      const shiftEnd = shift.endTime ? new Date(shift.endTime) : new Date();

      if (dateRange.start && dateRange.end) {
        if (shiftStart.getTime() < dateRange.start.getTime() || shiftStart.getTime() > dateRange.end.getTime()) {
          return;
        }
      }

      if (staffFilter && trimSafe_(shift.staffName) !== staffFilter) {
        return;
      }

      let totalCashOrders = 0;
      let totalTransferOrders = 0;

      allOrders.forEach((ord) => {
        if (!ord || !ord.createdAt) return;
        const ordTime = new Date(ord.createdAt).getTime();

        if (ordTime >= shiftStart.getTime() && ordTime <= shiftEnd.getTime()) {
          const grandTotal = toNumber_(ord.grandTotal);
          const pMethod = trimSafe_(ord.paymentMethod).toLowerCase();
          if (pMethod === "transfer") {
            totalTransferOrders += grandTotal;
          } else {
            totalCashOrders += grandTotal;
          }
        }
      });

      let cashAdjustments = 0;
      const shiftAdjList = [];
      allAdjustments.forEach((adj) => {
        if (adj && adj.shiftId === shift.id) {
          const amt = toNumber_(adj.amount);
          cashAdjustments += amt;
          shiftAdjList.push({
            id: trimSafe_(adj.id),
            amount: amt,
            reason: trimSafe_(adj.reason),
            createdAt: trimSafe_(adj.createdAt),
          });
        }
      });

      const actualOpeningCash = toNumber_(shift.actualOpeningCash ?? shift.openingCash);
      const actualClosingCash = toNumber_(shift.actualClosingCash ?? shift.cashAmount);

      // Expected Cash = Opening + Order CASH + Cash Adjustments (Admin rút/nạp két)
      const expectedCash = actualOpeningCash + totalCashOrders + cashAdjustments;
      const difference = actualClosingCash - expectedCash;

      let reconStatus = "OPEN";
      if (shift.status === "closed") {
        if (difference < 0) reconStatus = "THIEU";
        else if (difference === 0) reconStatus = "KHOP";
        else reconStatus = "DU";
      }

      if (statusFilter && statusFilter !== "ALL" && reconStatus !== statusFilter) {
        return;
      }

      reconciliationList.push({
        id: trimSafe_(shift.id),
        staffName: trimSafe_(shift.staffName),
        startTime: trimSafe_(shift.startTime),
        endTime: trimSafe_(shift.endTime),
        status: trimSafe_(shift.status),
        actualOpeningCash,
        totalCashOrders,
        totalTransferOrders,
        cashAdjustments,
        adjustmentsList: shiftAdjList,
        expectedCash,
        actualClosingCash,
        difference,
        reconciliationStatus: reconStatus,
      });
    });

    return reconciliationList.sort(
      (a, b) => new Date(b.startTime).getTime() - new Date(a.startTime).getTime(),
    );
  } catch (err) {
    logAction_("ERROR", "GET_SHIFT_RECONCILIATION", "admin", { error: err.message });
    throw err;
  }
};

const toNumber_ = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
