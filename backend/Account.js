/* =========================
 * Account.js - Quản lý tài khoản
 * ========================= */

// =========================
// PERMISSION CONSTANTS
// =========================
const ROLE = {
  ADMIN: "admin",
  STAFF: "staff",
  CASHIER: "cashier",
};

const ADMIN_ONLY_ROLES = [ROLE.ADMIN];
const STAFF_ALLOWED_ROLES = [ROLE.ADMIN, ROLE.CASHIER]; // staff cannot manage accounts

/**
 * Kiểm tra quyền người dùng - refactored to throw errors
 * @param {string} userRole - role của người dùng
 * @param {string[]} allowedRoles - danh sách role được phép
 * @throws {Error} if permission denied
 */
const checkPermission = (userRole, allowedRoles = ADMIN_ONLY_ROLES) => {
  if (!userRole) {
    throw new Error("ROLE_REQUIRED");
  }

  if (!allowedRoles.includes(userRole)) {
    throw new Error("PERMISSION_DENIED");
  }
};

/**
 * Lấy tất cả tài khoản (không return password) - ADMIN only
 * Refactored to throw errors, return raw accounts array
 */
const getAllAccounts = (userRole) => {
  checkPermission(userRole, ADMIN_ONLY_ROLES);

  const rows = getSheetData_(SHEET_NAME.ACCOUNT);
  const accounts = [];

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const status = trimSafe_(row[SHEET_SCHEMA.ACCOUNT.ROLE]);

    if (status === "DELETED") continue;

    accounts.push({
      id: trimSafe_(row[SHEET_SCHEMA.ACCOUNT.ID]),
      username: trimSafe_(row[SHEET_SCHEMA.ACCOUNT.USERNAME]),
      role: trimSafe_(row[SHEET_SCHEMA.ACCOUNT.ROLE]),
      createdAt: trimSafe_(row[SHEET_SCHEMA.ACCOUNT.CREATED_AT]),
      lastLogin: trimSafe_(row[SHEET_SCHEMA.ACCOUNT.LAST_LOGIN]),
    });
  }

  return accounts;
};

/**
 * Lấy thông tin 1 tài khoản (không return password)
 */
const getAccount = (accountId) => {
  const row = findRowById_(SHEET_NAME.ACCOUNT, accountId);
  if (!row) {
    return null;
  }

  const values = row.values;
  return {
    id: trimSafe_(values[SHEET_SCHEMA.ACCOUNT.ID]),
    username: trimSafe_(values[SHEET_SCHEMA.ACCOUNT.USERNAME]),
    role: trimSafe_(values[SHEET_SCHEMA.ACCOUNT.ROLE]),
    createdAt: trimSafe_(values[SHEET_SCHEMA.ACCOUNT.CREATED_AT]),
    lastLogin: trimSafe_(values[SHEET_SCHEMA.ACCOUNT.LAST_LOGIN]),
  };
};

/**
 * Tạo tài khoản mới - ADMIN only
 * Refactored to throw errors, return raw account data
 */
const createAccount = (userRole, username, password, role = "staff") => {
  checkPermission(userRole, ADMIN_ONLY_ROLES);

  if (!username || !password) {
    throw new Error("MISSING_FIELDS: username and password required");
  }

  if (!["admin", "staff", "cashier"].includes(role)) {
    throw new Error("INVALID_ROLE");
  }

  return withPaymentLock_("account_create", () => {
    // Kiểm tra trùng username
    const rows = getSheetData_(SHEET_NAME.ACCOUNT, false);
    for (let i = 1; i < rows.length; i++) {
      if (
        trimSafe_(rows[i][SHEET_SCHEMA.ACCOUNT.USERNAME]) === username &&
        trimSafe_(rows[i][SHEET_SCHEMA.ACCOUNT.ROLE]) !== "DELETED"
      ) {
        throw new Error("USERNAME_ALREADY_EXISTS");
      }
    }

    const accountId = generateId_("acc");
    const now = toIsoString_(new Date());

    appendRowsBatch_(SHEET_NAME.ACCOUNT, [
      [accountId, username, password, role, now, ""],
    ]);

    logAction_("CREATE_ACCOUNT", `ACCOUNT_${accountId}`, "system", {
      username: username,
      role: role,
    });

    const createdAccount = {
      id: accountId,
      username: username,
      role: role,
      createdAt: now,
    };
    pushDeltaSafe_("ACCOUNT", "CREATE", createdAccount);
    return createdAccount;
  });
};

/**
 * Cập nhật tài khoản - ADMIN only
 * Refactored to throw errors, return raw updated account data
 */
const updateAccount = (userRole, accountId, data = {}) => {
  checkPermission(userRole, ADMIN_ONLY_ROLES);

  if (!accountId) {
    throw new Error("MISSING_FIELDS: accountId required");
  }

  return withPaymentLock_(`account_${accountId}`, () => {
    const row = findRowById_(SHEET_NAME.ACCOUNT, accountId);
    if (!row) {
      throw new Error("ACCOUNT_NOT_FOUND");
    }

    const values = row.values;
    const oldRole = trimSafe_(values[SHEET_SCHEMA.ACCOUNT.ROLE]);

    if (oldRole === "DELETED") {
      throw new Error("ACCOUNT_DELETED");
    }

    // Update fields nếu có
    if (data.password) {
      values[SHEET_SCHEMA.ACCOUNT.PASSWORD] = trimSafe_(data.password);
    }

    if (data.role) {
      if (!["admin", "staff", "cashier"].includes(data.role)) {
        throw new Error("INVALID_ROLE");
      }
      values[SHEET_SCHEMA.ACCOUNT.ROLE] = data.role;
    }

    if (data.username) {
      const rows = getSheetData_(SHEET_NAME.ACCOUNT, false);
      for (let i = 1; i < rows.length; i++) {
        const existingUsername = trimSafe_(
          rows[i][SHEET_SCHEMA.ACCOUNT.USERNAME],
        );
        const existingId = trimSafe_(rows[i][SHEET_SCHEMA.ACCOUNT.ID]);

        if (
          existingUsername === data.username &&
          existingId !== accountId &&
          trimSafe_(rows[i][SHEET_SCHEMA.ACCOUNT.ROLE]) !== "DELETED"
        ) {
          throw new Error("USERNAME_ALREADY_EXISTS");
        }
      }
      values[SHEET_SCHEMA.ACCOUNT.USERNAME] = trimSafe_(data.username);
    }

    batchWriteRows_(SHEET_NAME.ACCOUNT, row.rowIndex, 1, [values]);

    logAction_("UPDATE_ACCOUNT", `ACCOUNT_${accountId}`, "system", {
      changes: data,
    });

    invalidateSheetCache_(SHEET_NAME.ACCOUNT);

    const updatedAccount = {
      id: accountId,
      username: trimSafe_(values[SHEET_SCHEMA.ACCOUNT.USERNAME]),
      role: trimSafe_(values[SHEET_SCHEMA.ACCOUNT.ROLE]),
    };
    pushDeltaSafe_("ACCOUNT", "UPDATE", updatedAccount);
    return updatedAccount;
  });
};

/**
 * Xóa tài khoản (soft delete - đặt role = "DELETED") - ADMIN only
 * Refactored to throw errors, return raw account data
 */
const deleteAccount = (userRole, accountId) => {
  checkPermission(userRole, ADMIN_ONLY_ROLES);

  if (!accountId) {
    throw new Error("MISSING_FIELDS: accountId required");
  }

  return withPaymentLock_(`account_${accountId}`, () => {
    const row = findRowById_(SHEET_NAME.ACCOUNT, accountId);
    if (!row) {
      throw new Error("ACCOUNT_NOT_FOUND");
    }

    const values = row.values;
    const role = trimSafe_(values[SHEET_SCHEMA.ACCOUNT.ROLE]);

    if (role === "DELETED") {
      throw new Error("ACCOUNT_ALREADY_DELETED");
    }

    values[SHEET_SCHEMA.ACCOUNT.ROLE] = "DELETED";
    batchWriteRows_(SHEET_NAME.ACCOUNT, row.rowIndex, 1, [values]);

    logAction_("DELETE_ACCOUNT", `ACCOUNT_${accountId}`, "system", {
      username: trimSafe_(values[SHEET_SCHEMA.ACCOUNT.USERNAME]),
    });

    invalidateSheetCache_(SHEET_NAME.ACCOUNT);
    const deletedAccount = {
      id: accountId,
      username: trimSafe_(values[SHEET_SCHEMA.ACCOUNT.USERNAME]),
    };
    pushDeltaSafe_("ACCOUNT", "DELETE", deletedAccount);
    return deletedAccount;
  });
};

/**
 * Cập nhật LAST_LOGIN
 * Refactored to throw errors, return accountId
 */
const updateLastLogin = (accountId) => {
  if (!accountId) {
    throw new Error("MISSING_FIELDS: accountId required");
  }

  return withPaymentLock_(`account_login_${accountId}`, () => {
    const row = findRowById_(SHEET_NAME.ACCOUNT, accountId);
    if (!row) {
      throw new Error("ACCOUNT_NOT_FOUND");
    }

    const values = row.values;
    values[SHEET_SCHEMA.ACCOUNT.LAST_LOGIN] = toIsoString_(new Date());

    batchWriteRows_(SHEET_NAME.ACCOUNT, row.rowIndex, 1, [values]);
    invalidateSheetCache_(SHEET_NAME.ACCOUNT);

    return accountId;
  });
};

/**
 * Login - kiểm tra username/password và cập nhật LAST_LOGIN
 * Refactored to throw errors, return raw user data
 */
const login = (username, password) => {
  if (!username || !password) {
    throw new Error("MISSING_FIELDS: username and password required");
  }

  const rows = getSheetData_(SHEET_NAME.ACCOUNT);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const rowUsername = trimSafe_(row[SHEET_SCHEMA.ACCOUNT.USERNAME]);
    const rowPassword = trimSafe_(row[SHEET_SCHEMA.ACCOUNT.PASSWORD]);
    const rowRole = trimSafe_(row[SHEET_SCHEMA.ACCOUNT.ROLE]);
    const rowId = trimSafe_(row[SHEET_SCHEMA.ACCOUNT.ID]);

    // Skip deleted accounts
    if (rowRole === "DELETED") continue;

    if (rowUsername === username && rowPassword === password) {
      // Update LAST_LOGIN
      updateLastLogin(rowId);

      logAction_("LOGIN", `ACCOUNT_${rowId}`, username, {
        username: username,
        role: rowRole,
      });

      return {
        id: rowId,
        username: username,
        role: rowRole,
      };
    }
  }

  logAction_("LOGIN_FAILED", "ACCOUNT", "system", {
    username: username,
    reason: "Invalid credentials",
  });

  throw new Error("INVALID_CREDENTIALS");
};
