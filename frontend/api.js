import { currentLang, t } from "./i18n.js";

const CFG = window.KINORA_CONFIG || {};
export const API_BASE = String(CFG.API_BASE_URL || "").replace(/\/+$/, "");
export const BOT_USERNAME = CFG.BOT_USERNAME || "KinoraTV_bot";

const TOKEN_KEY = "kinora_token";
let meCache = null;
let publicConfigCache = null;

export class ApiError extends Error {
  constructor(message, status = 0, payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.payload = payload;
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || "";
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  meCache = null;
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
  meCache = null;
  window.dispatchEvent(new CustomEvent("kinora:auth-cleared"));
}

export function apiUrl(path) {
  if (!path) return API_BASE;
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path.startsWith("/") ? "" : "/"}${path}`;
}

export function mediaUrl(path) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  if (path.startsWith("/uploads/")) return apiUrl(path);
  return path;
}

function errorMessage(payload, status) {
  if (payload?.errors?.length) {
    return payload.errors.map((item) => `${item.field || t("generic_error_field")}: ${item.message}`).join("\n");
  }
  if (typeof payload?.detail === "string") return payload.detail;
  if (Array.isArray(payload?.detail)) return payload.detail.map((item) => item.msg || item.message).join("\n");
  if (status === 401) return t("auth_failed");
  return t("error_generic");
}

export async function request(path, { method = "GET", body, auth = false, form = false } = {}) {
  if (!API_BASE) {
    throw new ApiError(t("config_missing"), 0);
  }
  const headers = {};
  if (auth) {
    const token = getToken();
    if (!token) throw new ApiError(t("favorite_requires_auth"), 401);
    headers.Authorization = `Bearer ${token}`;
  }
  let payload = body;
  if (body !== undefined && !form) {
    headers["Content-Type"] = "application/json";
    payload = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(apiUrl(path), { method, headers, body: payload });
  } catch {
    throw new ApiError(t("api_offline"), 0);
  }
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    if (response.status === 401 && auth) clearToken();
    throw new ApiError(errorMessage(data, response.status), response.status, data);
  }
  return data;
}

export async function getPublicConfig(force = false) {
  if (publicConfigCache && !force) return publicConfigCache;
  publicConfigCache = await request("/api/config");
  return publicConfigCache;
}

export function telegram() {
  return window.Telegram?.WebApp || null;
}

export function isInTelegram() {
  return Boolean(telegram()?.initData);
}

export function initTelegramWebApp() {
  const app = telegram();
  if (!app) return;
  try {
    app.ready();
    app.expand();
    app.setHeaderColor?.("#0b0b0f");
    app.setBackgroundColor?.("#0b0b0f");
    app.disableVerticalSwipes?.();
  } catch {
    /* Older Telegram clients may not support every method. */
  }
}

export function botLink() {
  return `https://t.me/${BOT_USERNAME}`;
}

export function openBot() {
  const app = telegram();
  if (app?.openTelegramLink) {
    app.openTelegramLink(botLink());
  } else {
    window.open(botLink(), "_blank", "noopener");
  }
}

export async function telegramLogin(initData, language = currentLang) {
  if (!initData) throw new ApiError(t("auth_inside_tg"), 400);
  const response = await request("/api/auth/telegram", {
    method: "POST",
    body: { init_data: initData, language },
  });
  setToken(response.token);
  meCache = response.user;
  return response.user;
}

export async function ensureSession() {
  const app = telegram();
  const tgUser = app?.initDataUnsafe?.user;
  const token = getToken();

  if (token) {
    try {
      const me = await getMe(true);
      if (tgUser?.id && Number(me.telegram_id) !== Number(tgUser.id)) {
        clearToken();
      } else {
        return me;
      }
    } catch (error) {
      if (error.status !== 401) throw error;
      clearToken();
    }
  }

  if (app?.initData) {
    try {
      return await telegramLogin(app.initData);
    } catch (error) {
      if (error.status === 401) clearToken();
      throw error;
    }
  }
  return null;
}

export async function getMe(force = false) {
  if (!getToken()) return null;
  if (meCache && !force) return meCache;
  meCache = await request("/api/me", { auth: true });
  return meCache;
}

export async function devLogin(telegramId, firstName) {
  const response = await request("/api/auth/dev", {
    method: "POST",
    body: {
      telegram_id: Number(telegramId),
      first_name: firstName || "Dev User",
      language: currentLang,
    },
  });
  setToken(response.token);
  meCache = response.user;
  return response.user;
}

export function logout() {
  clearToken();
  meCache = null;
}

export async function updateLanguage(language) {
  if (getToken()) {
    try {
      await request("/api/me/language", { method: "PATCH", auth: true, body: { language } });
      if (meCache) meCache.language = language;
    } catch {
      /* Language still switches locally if the session expired. */
    }
  }
}

export async function fetchHome() {
  return request("/api/home");
}

export async function fetchCatalog(params = {}) {
  const query = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") query.set(key, value);
  });
  return request(`/api/catalog?${query.toString()}`);
}

export async function fetchContent(identifier) {
  return request(`/api/catalog/${encodeURIComponent(identifier)}`);
}

export async function fetchAdminContent(id) {
  return request(`/api/admin/content/${id}`, { auth: true });
}

export async function trackView(contentId) {
  try {
    await request(`/api/catalog/${contentId}/view`, { method: "POST", auth: Boolean(getToken()) });
  } catch {
    /* View tracking is best-effort. */
  }
}

export async function fetchAds(placement, limit = 3) {
  const query = new URLSearchParams({ placement, limit: String(limit) });
  try {
    return await request(`/api/ads?${query.toString()}`);
  } catch {
    return [];
  }
}

const impressionKeys = new Set();

export function trackAdImpression(ad) {
  if (!ad?.id) return;
  const key = `kinora_ad_imp_${ad.id}`;
  if (impressionKeys.has(key) || sessionStorage.getItem(key)) return;
  impressionKeys.add(key);
  sessionStorage.setItem(key, "1");
  request(ad.impression_url, { method: "POST" }).catch(() => {});
}

export async function fetchFavorites() {
  return request("/api/me/favorites", { auth: true });
}

export async function fetchFavoriteIds() {
  const data = await request("/api/me/favorites/ids", { auth: true });
  return new Set(data.ids || []);
}

export async function addFavorite(contentId) {
  return request(`/api/me/favorites/${contentId}`, { method: "POST", auth: true });
}

export async function removeFavorite(contentId) {
  return request(`/api/me/favorites/${contentId}`, { method: "DELETE", auth: true });
}

export async function fetchSubscription() {
  return request("/api/me/subscription", { auth: true });
}

export async function fetchPublicVip() {
  return request("/api/vip/plans");
}

export async function startCheckout(planId) {
  return request(`/api/vip/checkout/${planId}`, { method: "POST", auth: true });
}

export { t };
