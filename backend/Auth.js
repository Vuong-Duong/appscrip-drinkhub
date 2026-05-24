/* =========================
 * Auth.gs - Xac thuc tai khoan
 * ========================= */

const AUTH_SESSION_TTL_SEC = 21600; // 6 hours
const AUTH_SESSION_PREFIX = "auth_session_";
const AUTH_VALID_ROLES = ["admin", "staff", "cashier"];

const normalizeAuthRole_ = (role) => trimSafe_(role).toLowerCase();
const normalizeAuthFingerprint_ = (fingerprint) => trimSafe_(fingerprint);

const normalizeRequiredRoles_ = (requiredRole = null) => {
  if (!requiredRole) return [];

  const roles = Array.isArray(requiredRole) ? requiredRole : [requiredRole];
  return roles.map(normalizeAuthRole_).filter(Boolean);
};

const sanitizeAuthUser_ = (user) => ({
  id: trimSafe_(user && user.id),
  username: trimSafe_(user && user.username),
  role: normalizeAuthRole_(user && user.role),
});

const isValidAuthUser_ = (user) => {
  return (
    !!user &&
    !!trimSafe_(user.id) &&
    !!trimSafe_(user.username) &&
    AUTH_VALID_ROLES.includes(normalizeAuthRole_(user.role))
  );
};

const isRoleAllowed_ = (role, requiredRole = null) => {
  const normalizedRole = normalizeAuthRole_(role);
  if (!AUTH_VALID_ROLES.includes(normalizedRole)) return false;

  const requiredRoles = normalizeRequiredRoles_(requiredRole);
  if (!requiredRoles.length) return true;

  return requiredRoles.includes(normalizedRole);
};

const refreshAuthSession_ = (token, session) => {
  const now = Date.now();
  const refreshedSession = {
    ...session,
    expiresAt: toIsoString_(new Date(now + AUTH_SESSION_TTL_SEC * 1000)),
  };

  CacheService.getScriptCache().put(
    AUTH_SESSION_PREFIX + token,
    JSON.stringify(refreshedSession),
    AUTH_SESSION_TTL_SEC,
  );

  return refreshedSession;
};

const createAuthSession_ = (user, fingerprint) => {
  const safeUser = sanitizeAuthUser_(user);
  const safeFingerprint = normalizeAuthFingerprint_(fingerprint);

  if (!isValidAuthUser_(safeUser)) {
    throw new Error("INVALID_AUTH_USER");
  }

  if (!safeFingerprint) {
    throw new Error("DEVICE_FINGERPRINT_REQUIRED");
  }

  const now = Date.now();
  const expiresAt = now + AUTH_SESSION_TTL_SEC * 1000;
  const tokenSeed = {
    id: safeUser.id,
    username: safeUser.username,
    role: safeUser.role,
    fingerprint: safeFingerprint,
    createdAt: now,
    nonce: generateId_("auth_nonce"),
  };
  const token =
    generateId_("auth") + "_" + calculateChecksum_(tokenSeed).slice(0, 16);

  CacheService.getScriptCache().put(
    AUTH_SESSION_PREFIX + token,
    JSON.stringify({
      user: safeUser,
      fingerprint: safeFingerprint,
      createdAt: toIsoString_(new Date(now)),
      expiresAt: toIsoString_(new Date(expiresAt)),
    }),
    AUTH_SESSION_TTL_SEC,
  );

  return {
    token,
    expiresAt: toIsoString_(new Date(expiresAt)),
  };
};

const authenticate = (
  username,
  password,
  requiredRole = null,
  fingerprint = "",
) => {
  const user = login(trimSafe_(username), trimSafe_(password));

  if (!isValidAuthUser_(user)) {
    throw new Error("INVALID_CREDENTIALS");
  }

  if (!isRoleAllowed_(user.role, requiredRole)) {
    throw new Error("PERMISSION_DENIED");
  }

  const session = createAuthSession_(user, fingerprint);

  return {
    ...sanitizeAuthUser_(user),
    token: session.token,
    expiresAt: session.expiresAt,
  };
};

const verifyAuthToken = (
  authToken,
  requiredRole = null,
  fingerprint = "",
) => {
  const token = trimSafe_(authToken);
  const safeFingerprint = normalizeAuthFingerprint_(fingerprint);

  if (!token) {
    throw new Error("AUTH_TOKEN_REQUIRED");
  }

  if (!safeFingerprint) {
    throw new Error("DEVICE_FINGERPRINT_REQUIRED");
  }

  const cached = CacheService.getScriptCache().get(AUTH_SESSION_PREFIX + token);
  const session = parseJsonSafe_(cached, null);
  if (!session || !session.user) {
    throw new Error("AUTH_SESSION_EXPIRED");
  }

  const user = sanitizeAuthUser_(session.user);
  if (!isValidAuthUser_(user)) {
    throw new Error("INVALID_AUTH_SESSION");
  }

  if (normalizeAuthFingerprint_(session.fingerprint) !== safeFingerprint) {
    CacheService.getScriptCache().remove(AUTH_SESSION_PREFIX + token);
    throw new Error("INVALID_DEVICE");
  }

  const latestAccount = getAccount(user.id);
  if (!latestAccount || normalizeAuthRole_(latestAccount.role) !== user.role) {
    CacheService.getScriptCache().remove(AUTH_SESSION_PREFIX + token);
    throw new Error("AUTH_SESSION_INVALIDATED");
  }

  if (!isRoleAllowed_(user.role, requiredRole)) {
    throw new Error("PERMISSION_DENIED");
  }

  const refreshedSession = refreshAuthSession_(token, session);

  return {
    ...user,
    token,
    expiresAt: trimSafe_(refreshedSession.expiresAt),
  };
};

const checkAuth = (authContext = null, requiredRole = null) => {
  try {
    if (!authContext) return false;

    if (typeof authContext === "string") {
      return false;
    }

    if (authContext.token) {
      verifyAuthToken(
        authContext.token,
        requiredRole,
        authContext.fingerprint,
      );
      return true;
    }

    return false;
  } catch (e) {
    return false;
  }
};

const requireAuth = (authContext, requiredRole = null) => {
  if (!checkAuth(authContext, requiredRole)) {
    throw new Error("AUTH_REQUIRED");
  }

  if (authContext && authContext.token) {
    return verifyAuthToken(
      authContext.token,
      requiredRole,
      authContext.fingerprint,
    );
  }

  throw new Error("AUTH_REQUIRED");
};

const getCurrentUser = (authToken, fingerprint = "") => {
  if (!authToken) return null;
  return verifyAuthToken(authToken, null, fingerprint);
};

const logout = (authToken) => {
  const token = trimSafe_(authToken);
  if (!token) return false;

  CacheService.getScriptCache().remove(AUTH_SESSION_PREFIX + token);
  return true;
};
