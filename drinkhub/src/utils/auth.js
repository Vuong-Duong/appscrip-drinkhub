import { cache } from "../api/Api";

export const AUTH_USER_KEY = "authUser";
export const AUTH_TOKEN_KEY = "authToken";

export function getStoredAuthToken() {
  return localStorage.getItem(AUTH_TOKEN_KEY) || "";
}

export function getStoredAuthUser() {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function setStoredAuthSession(user) {
  const currentUser = getStoredAuthUser();
  const authUser = {
    id: user.id,
    username: user.username,
    role: user.role,
    token: user.token,
    expiresAt: user.expiresAt,
    fingerprint: cache.get("auth_device_id"),
    loginTime: user.loginTime || currentUser?.loginTime || new Date().toISOString(),
  };

  localStorage.setItem(AUTH_TOKEN_KEY, user.token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(authUser));
  return authUser;
}

export function clearStoredAuthSession() {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}
