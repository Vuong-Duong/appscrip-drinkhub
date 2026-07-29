/* =========================
 * Account.js - Quản lý tài khoản - Firestore
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

  const docs = firestoreQuery_("accounts");
  const accounts = [];

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const role = trimSafe_(doc.role);

    if (role === "DELETED") continue;

    accounts.push({
      id: trimSafe_(doc.id),
      username: trimSafe_(doc.username),
      role: role,
      createdAt: trimSafe_(doc.createdAt),
      lastLogin: trimSafe_(doc.lastLogin),
    });
  }

  return accounts;
};

/**
 * Lấy thông tin 1 tài khoản (không return password)
 */
const getAccount = (accountId) => {
  const doc = firestoreGet_("accounts", accountId);
  if (!doc) {
    return null;
  }

  return {
    id: trimSafe_(doc.id),
    username: trimSafe_(doc.username),
    role: trimSafe_(doc.role),
    createdAt: trimSafe_(doc.createdAt),
    lastLogin: trimSafe_(doc.lastLogin),
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
    const allDocs = firestoreQuery_("accounts");
    for (let i = 0; i < allDocs.length; i++) {
      if (
        trimSafe_(allDocs[i].username) === username &&
        trimSafe_(allDocs[i].role) !== "DELETED"
      ) {
        throw new Error("USERNAME_ALREADY_EXISTS");
      }
    }

    const accountId = generateId_("acc");
    const now = toIsoString_(new Date());

    firestoreSet_("accounts", accountId, {
      id: accountId,
      username: username,
      password: password,
      role: role,
      createdAt: now,
      lastLogin: "",
    });

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
    const doc = firestoreGet_("accounts", accountId);
    if (!doc) {
      throw new Error("ACCOUNT_NOT_FOUND");
    }

    const oldRole = trimSafe_(doc.role);

    if (oldRole === "DELETED") {
      throw new Error("ACCOUNT_DELETED");
    }

    const updates = {};

    // Update fields nếu có
    if (data.password) {
      updates.password = trimSafe_(data.password);
    }

    if (data.role) {
      if (!["admin", "staff", "cashier"].includes(data.role)) {
        throw new Error("INVALID_ROLE");
      }
      updates.role = data.role;
    }

    if (data.username) {
      const allDocs = firestoreQuery_("accounts");
      for (let i = 0; i < allDocs.length; i++) {
        const existingUsername = trimSafe_(allDocs[i].username);
        const existingId = trimSafe_(allDocs[i].id);

        if (
          existingUsername === data.username &&
          existingId !== accountId &&
          trimSafe_(allDocs[i].role) !== "DELETED"
        ) {
          throw new Error("USERNAME_ALREADY_EXISTS");
        }
      }
      updates.username = trimSafe_(data.username);
    }

    updates.updatedAt = toIsoString_(new Date());

    const updated = firestoreUpdate_("accounts", accountId, updates);

    logAction_("UPDATE_ACCOUNT", `ACCOUNT_${accountId}`, "system", {
      changes: data,
    });

    const updatedAccount = {
      id: accountId,
      username: trimSafe_(updated.username),
      role: trimSafe_(updated.role),
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
    const doc = firestoreGet_("accounts", accountId);
    if (!doc) {
      throw new Error("ACCOUNT_NOT_FOUND");
    }

    const role = trimSafe_(doc.role);

    if (role === "DELETED") {
      throw new Error("ACCOUNT_ALREADY_DELETED");
    }

    firestoreUpdate_("accounts", accountId, {
      role: "DELETED",
      updatedAt: toIsoString_(new Date()),
    });

    logAction_("DELETE_ACCOUNT", `ACCOUNT_${accountId}`, "system", {
      username: trimSafe_(doc.username),
    });

    const deletedAccount = {
      id: accountId,
      username: trimSafe_(doc.username),
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
    const doc = firestoreGet_("accounts", accountId);
    if (!doc) {
      throw new Error("ACCOUNT_NOT_FOUND");
    }

    firestoreUpdate_("accounts", accountId, {
      lastLogin: toIsoString_(new Date()),
    });

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

  const docs = firestoreQuery_("accounts");
  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i];
    const rowUsername = trimSafe_(doc.username);
    const rowPassword = trimSafe_(doc.password);
    const rowRole = trimSafe_(doc.role);
    const rowId = trimSafe_(doc.id);

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
