/* =========================
 * Shift.js - Ca làm việc
 * GET_SHIFTS, CREATE_SHIFT, UPDATE_SHIFT, CLOSE_SHIFT
 * ========================= */

const getShifts = (filters = {}) => {
  try {
    const shifts = getSheetData_(SHEET_NAME.SHIFT);
    if (!Array.isArray(shifts) || shifts.length === 0) return [];

    const normalized = shifts
      .map((row) => {
        if (!Array.isArray(row) || !row[SHEET_SCHEMA.SHIFT.ID]) return null;
        return {
          id: trimSafe_(row[SHEET_SCHEMA.SHIFT.ID]),
          staffName: trimSafe_(row[SHEET_SCHEMA.SHIFT.STAFF_NAME]),
          startTime: trimSafe_(row[SHEET_SCHEMA.SHIFT.START_TIME]),
          endTime: trimSafe_(row[SHEET_SCHEMA.SHIFT.END_TIME]),
          openingCash: toNumber_(row[SHEET_SCHEMA.SHIFT.OPENING_CASH]),
          totalRevenue: toNumber_(row[SHEET_SCHEMA.SHIFT.TOTAL_REVENUE]),
          totalPaid: toNumber_(row[SHEET_SCHEMA.SHIFT.TOTAL_PAID]),
          cashInRegister: toNumber_(row[SHEET_SCHEMA.SHIFT.CASH_IN_REGISTER]),
          status: trimSafe_(row[SHEET_SCHEMA.SHIFT.STATUS]),
          createdAt: trimSafe_(row[SHEET_SCHEMA.SHIFT.CREATED_AT]),
          closedAt: trimSafe_(row[SHEET_SCHEMA.SHIFT.CLOSED_AT]),
        };
      })
      .filter((s) => s !== null);

    // Filter by status if provided
    if (filters.status) {
      return normalized.filter((s) => s.status === filters.status);
    }

    return normalized;
  } catch (err) {
    logAction_("ERROR", "GET_SHIFTS", "system", { error: err.message });
    throw new Error("SHIFT_FETCH_FAILED");
  }
};

const createShift = (payload = {}) => {
  if (!payload.staffName) throw new Error("STAFF_NAME_REQUIRED");

  try {
    const shiftId = generateId_("shift");
    const now = new Date().toISOString();

    const row = [
      shiftId,
      trimSafe_(payload.staffName),
      trimSafe_(payload.startTime || now),
      "",
      toNumber_(payload.openingCash || 0),
      0,
      0,
      0,
      "open",
      now,
      "",
    ];

    appendRowsBatch_(SHEET_NAME.SHIFT, [row]);
    invalidateSheetCache_(SHEET_NAME.SHIFT);

    return {
      id: shiftId,
      staffName: payload.staffName,
      startTime: payload.startTime || now,
      endTime: "",
      openingCash: toNumber_(payload.openingCash || 0),
      totalRevenue: 0,
      totalPaid: 0,
      cashInRegister: 0,
      status: "open",
      createdAt: now,
      closedAt: "",
    };
  } catch (err) {
    logAction_("ERROR", "CREATE_SHIFT", "system", { error: err.message });
    throw new Error("SHIFT_CREATE_FAILED");
  }
};

const closeShift = (shiftId, payload = {}) => {
  if (!shiftId) throw new Error("SHIFT_ID_REQUIRED");

  try {
    const shifts = getSheetData_(SHEET_NAME.SHIFT, false);
    if (!Array.isArray(shifts)) throw new Error("SHEET_DATA_INVALID");

    const rowIndex = shifts.findIndex(
      (row) =>
        Array.isArray(row) && trimSafe_(row[SHEET_SCHEMA.SHIFT.ID]) === shiftId,
    );

    if (rowIndex === -1) throw new Error("SHIFT_NOT_FOUND");

    const row = [...shifts[rowIndex]];
    const now = new Date().toISOString();

    row[SHEET_SCHEMA.SHIFT.END_TIME] = trimSafe_(
      payload.endTime || now,
    );
    row[SHEET_SCHEMA.SHIFT.TOTAL_REVENUE] = toNumber_(
      payload.totalRevenue || 0,
    );
    row[SHEET_SCHEMA.SHIFT.TOTAL_PAID] = toNumber_(payload.totalPaid || 0);
    row[SHEET_SCHEMA.SHIFT.CASH_IN_REGISTER] = toNumber_(
      payload.cashInRegister || 0,
    );
    row[SHEET_SCHEMA.SHIFT.STATUS] = "closed";
    row[SHEET_SCHEMA.SHIFT.CLOSED_AT] = now;

    batchWriteRows_(SHEET_NAME.SHIFT, rowIndex + 1, 1, [row]);
    invalidateSheetCache_(SHEET_NAME.SHIFT);

    return {
      id: shiftId,
      staffName: trimSafe_(row[SHEET_SCHEMA.SHIFT.STAFF_NAME]),
      startTime: trimSafe_(row[SHEET_SCHEMA.SHIFT.START_TIME]),
      endTime: row[SHEET_SCHEMA.SHIFT.END_TIME],
      openingCash: toNumber_(row[SHEET_SCHEMA.SHIFT.OPENING_CASH]),
      totalRevenue: toNumber_(row[SHEET_SCHEMA.SHIFT.TOTAL_REVENUE]),
      totalPaid: toNumber_(row[SHEET_SCHEMA.SHIFT.TOTAL_PAID]),
      cashInRegister: toNumber_(row[SHEET_SCHEMA.SHIFT.CASH_IN_REGISTER]),
      status: "closed",
      createdAt: trimSafe_(row[SHEET_SCHEMA.SHIFT.CREATED_AT]),
      closedAt: now,
    };
  } catch (err) {
    logAction_("ERROR", "CLOSE_SHIFT", "system", { error: err.message });
    throw new Error("SHIFT_CLOSE_FAILED");
  }
};

const toNumber_ = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : 0;
};
