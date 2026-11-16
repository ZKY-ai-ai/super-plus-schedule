import type { PeriodProfile, Timetable } from "../types";
import { dateKey, getDateForSlot } from "./date";
import { periodsForDate } from "./periods";
import { buildSessions } from "./schedule";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export const GOOGLE_AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
export const GOOGLE_REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";
export const GOOGLE_CALENDAR_API = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar";
export const GOOGLE_CALENDAR_NAME = "课序课表";
export const GOOGLE_AUTH_STORAGE_KEY = "kexu:google-calendar:v1";
export const GOOGLE_CLIENT_ID_STORAGE_KEY = "kexu:google-calendar:client-id:v1";
export const GOOGLE_PENDING_STORAGE_KEY = "kexu:google-calendar:pending:v1";
export const DEFAULT_TIME_ZONE = "Asia/Shanghai";

const AUTH_TIMEOUT_MS = 240_000;
const CLIENT_ID_RE = /^[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/;
const ALLOWED_GOOGLE_ORIGINS = [
  "https://accounts.google.com",
  "https://oauth2.googleapis.com",
  "https://www.googleapis.com",
];

export class GoogleCalendarError extends Error {
  readonly code: string;
  readonly status?: number;
  readonly reason?: string;

  constructor(
    message: string,
    options: { code?: string; status?: number; reason?: string } = {},
  ) {
    super(message);
    this.name = "GoogleCalendarError";
    this.code = options.code ?? "google-calendar-error";
    this.status = options.status;
    this.reason = options.reason;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getWebCrypto(): Crypto {
  const cryptoApi = typeof globalThis === "undefined" ? undefined : globalThis.crypto;
  if (!cryptoApi || !cryptoApi.subtle || typeof cryptoApi.getRandomValues !== "function") {
    throw new GoogleCalendarError(
      "当前环境不支持 Web Crypto，无法完成 Google 授权。请使用较新的浏览器或系统 WebView。",
      { code: "crypto-unavailable" },
    );
  }
  return cryptoApi;
}

export function base64UrlEncode(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function randomUrlSafe(byteLength = 32): string {
  const bytes = new Uint8Array(byteLength);
  getWebCrypto().getRandomValues(bytes);
  return base64UrlEncode(bytes);
}

export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await getWebCrypto().subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  return base64UrlEncode(new Uint8Array(digest));
}

export interface PkcePair {
  verifier: string;
  challenge: string;
  method: "S256";
}

export async function createPkcePair(): Promise<PkcePair> {
  const verifier = randomUrlSafe(32);
  return { verifier, challenge: await pkceChallenge(verifier), method: "S256" };
}

export function normalizeClientId(value: string): string {
  const clientId = value.trim();
  if (!clientId) {
    throw new GoogleCalendarError("请先填写 Google OAuth Client ID。", {
      code: "missing-client-id",
    });
  }
  if (!CLIENT_ID_RE.test(clientId)) {
    throw new GoogleCalendarError(
      "Client ID 格式不正确，应以 .apps.googleusercontent.com 结尾。请从 Google Cloud Console 的 OAuth 客户端页面复制。",
      { code: "invalid-client-id" },
    );
  }
  return clientId;
}

function normalizeRedirectUri(value: string): string {
  const redirectUri = value.trim();
  if (!redirectUri) {
    throw new GoogleCalendarError("缺少 OAuth 重定向 URI。", { code: "missing-redirect-uri" });
  }
  let parsed: URL;
  try {
    parsed = new URL(redirectUri);
  } catch {
    throw new GoogleCalendarError("OAuth 重定向 URI 不是有效的网址。", {
      code: "invalid-redirect-uri",
    });
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new GoogleCalendarError("OAuth 重定向 URI 必须使用 http 或 https。", {
      code: "invalid-redirect-uri",
    });
  }
  if (parsed.hash) {
    throw new GoogleCalendarError("OAuth 重定向 URI 不能包含 # 片段。", {
      code: "invalid-redirect-uri",
    });
  }
  return parsed.toString();
}

export function defaultRedirectUri(): string {
  if (typeof document === "undefined") {
    throw new GoogleCalendarError("当前环境没有页面地址，无法生成 OAuth 重定向 URI。", {
      code: "no-document",
    });
  }
  return new URL("oauth-callback.html", document.baseURI).toString();
}

export interface AuthUrlInput {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  state: string;
  scope?: string;
  loginHint?: string;
}

export function buildAuthUrl(input: AuthUrlInput): string {
  const clientId = normalizeClientId(input.clientId);
  const redirectUri = normalizeRedirectUri(input.redirectUri);
  if (!input.codeChallenge.trim()) {
    throw new GoogleCalendarError("缺少 PKCE code_challenge。", { code: "missing-pkce" });
  }
  if (!input.state.trim()) {
    throw new GoogleCalendarError("缺少 OAuth state。", { code: "missing-state" });
  }

  const url = new URL(GOOGLE_AUTH_ENDPOINT);
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", input.scope?.trim() || GOOGLE_CALENDAR_SCOPE);
  url.searchParams.set("code_challenge", input.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", input.state);
  url.searchParams.set("access_type", "offline");
  // Without an explicit consent prompt Google may omit refresh_token on reconnect.
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("include_granted_scopes", "true");
  const loginHint = input.loginHint?.trim();
  if (loginHint) url.searchParams.set("login_hint", loginHint);
  return url.toString();
}

export interface GoogleTokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  scope: string;
  tokenType: string;
}

export interface GoogleCalendarAuth extends GoogleTokenResponse {
  clientId: string;
  calendarId: string | null;
  calendarSummary: string | null;
  connectedAt: string;
}

function readLocalStorage(): Storage | null {
  try {
    if (typeof localStorage === "undefined") return null;
    return localStorage;
  } catch {
    return null;
  }
}

function readSessionStorage(): Storage | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

function parseStoredAuth(raw: string): GoogleCalendarAuth | null {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!isRecord(value)) return null;
  const stringFields = [
    "clientId",
    "accessToken",
    "refreshToken",
    "scope",
    "tokenType",
    "connectedAt",
  ] as const;
  if (stringFields.some((field) => typeof value[field] !== "string")) return null;
  if (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt)) return null;
  return {
    clientId: value.clientId as string,
    accessToken: value.accessToken as string,
    refreshToken: value.refreshToken as string,
    scope: value.scope as string,
    tokenType: value.tokenType as string,
    connectedAt: value.connectedAt as string,
    expiresAt: value.expiresAt,
    calendarId: typeof value.calendarId === "string" && value.calendarId ? value.calendarId : null,
    calendarSummary:
      typeof value.calendarSummary === "string" && value.calendarSummary
        ? value.calendarSummary
        : null,
  };
}

export function loadGoogleAuth(): GoogleCalendarAuth | null {
  const storage = readLocalStorage();
  if (!storage) return null;
  try {
    const raw = storage.getItem(GOOGLE_AUTH_STORAGE_KEY);
    return raw ? parseStoredAuth(raw) : null;
  } catch {
    return null;
  }
}

export function saveGoogleAuth(auth: GoogleCalendarAuth): boolean {
  const storage = readLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(GOOGLE_AUTH_STORAGE_KEY, JSON.stringify(auth));
    return true;
  } catch {
    return false;
  }
}

export function clearGoogleAuth(): void {
  const storage = readLocalStorage();
  if (!storage) return;
  try {
    storage.removeItem(GOOGLE_AUTH_STORAGE_KEY);
  } catch {
    // Ignore storage failures on sign-out.
  }
}

export function loadGoogleClientId(): string {
  const storage = readLocalStorage();
  if (!storage) return "";
  try {
    return storage.getItem(GOOGLE_CLIENT_ID_STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

export function saveGoogleClientId(clientId: string): boolean {
  const storage = readLocalStorage();
  if (!storage) return false;
  try {
    storage.setItem(GOOGLE_CLIENT_ID_STORAGE_KEY, clientId.trim());
    return true;
  } catch {
    return false;
  }
}

export interface GoogleAuthRequest {
  clientId: string;
  redirectUri: string;
  state: string;
  codeVerifier: string;
  codeChallenge: string;
  createdAt: number;
}

let pendingAuthMemory: GoogleAuthRequest | null = null;

export function savePendingAuth(request: GoogleAuthRequest): void {
  pendingAuthMemory = request;
  const storage = readSessionStorage();
  if (!storage) return;
  try {
    storage.setItem(GOOGLE_PENDING_STORAGE_KEY, JSON.stringify(request));
  } catch {
    // The in-memory copy is enough for the popup flow.
  }
}

export function loadPendingAuth(): GoogleAuthRequest | null {
  const storage = readSessionStorage();
  if (storage) {
    try {
      const raw = storage.getItem(GOOGLE_PENDING_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as unknown;
        if (isRecord(parsed)) {
          const request: GoogleAuthRequest = {
            clientId: typeof parsed.clientId === "string" ? parsed.clientId : "",
            redirectUri: typeof parsed.redirectUri === "string" ? parsed.redirectUri : "",
            state: typeof parsed.state === "string" ? parsed.state : "",
            codeVerifier: typeof parsed.codeVerifier === "string" ? parsed.codeVerifier : "",
            codeChallenge: typeof parsed.codeChallenge === "string" ? parsed.codeChallenge : "",
            createdAt: typeof parsed.createdAt === "number" ? parsed.createdAt : 0,
          };
          const fresh = Date.now() - request.createdAt < 10 * 60_000;
          if (
            fresh &&
            request.clientId &&
            request.redirectUri &&
            request.state &&
            request.codeVerifier
          ) {
            return request;
          }
        }
      }
    } catch {
      // Fall through to the in-memory copy.
    }
  }
  return pendingAuthMemory;
}

export function clearPendingAuth(): void {
  pendingAuthMemory = null;
  const storage = readSessionStorage();
  if (!storage) return;
  try {
    storage.removeItem(GOOGLE_PENDING_STORAGE_KEY);
  } catch {
    // Ignore cleanup failures.
  }
}

export interface AuthCallback {
  code: string | null;
  state: string | null;
  error: string | null;
  errorDescription: string | null;
}

export function parseAuthCallback(input: string): AuthCallback {
  let url: URL;
  try {
    url = new URL(input, "https://classflow.invalid/");
  } catch {
    return { code: null, state: null, error: "invalid_callback", errorDescription: null };
  }
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.replace(/^#/, ""));
  const read = (name: string) => query.get(name) ?? hash.get(name);
  return {
    code: read("code"),
    state: read("state"),
    error: read("error"),
    errorDescription: read("error_description"),
  };
}

export function parsePopupAuthMessage(data: unknown): AuthCallback | null {
  if (!isRecord(data) || data.source !== "kexu-google-oauth") return null;
  return {
    code: typeof data.code === "string" ? data.code : null,
    state: typeof data.state === "string" ? data.state : null,
    error: typeof data.error === "string" ? data.error : null,
    errorDescription: typeof data.errorDescription === "string" ? data.errorDescription : null,
  };
}

function isAllowedGoogleUrl(url: string): boolean {
  return ALLOWED_GOOGLE_ORIGINS.some((origin) => url.startsWith(`${origin}/`));
}

async function request(
  fetchImpl: FetchLike,
  url: string,
  init?: RequestInit,
): Promise<Response> {
  if (!isAllowedGoogleUrl(url)) {
    throw new GoogleCalendarError("已阻止向非 Google 域发送授权或日历请求。", {
      code: "blocked-domain",
    });
  }
  try {
    return await fetchImpl(url, init);
  } catch {
    throw new GoogleCalendarError("无法连接 Google 服务，请检查网络或代理设置后重试。", {
      code: "network",
    });
  }
}

async function readJson(response: Response): Promise<unknown> {
  const raw = await response.text();
  if (!raw.trim()) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

export function parseOAuthError(status: number, payload: unknown): GoogleCalendarError {
  if (isRecord(payload) && typeof payload.error === "string") {
    const reason = payload.error;
    const description =
      typeof payload.error_description === "string" ? payload.error_description.trim() : "";
    if (reason === "invalid_grant") {
      return new GoogleCalendarError("Google 授权已失效或被撤销，请断开后重新连接。", {
        status,
        reason,
      });
    }
    if (reason === "invalid_client") {
      return new GoogleCalendarError(
        "Client ID 无效，或它与当前应用的来源不匹配。请检查 Google Cloud Console 的 OAuth 客户端配置。",
        { status, reason },
      );
    }
    return new GoogleCalendarError(description || `Google 授权失败（${reason}）。`, {
      status,
      reason,
    });
  }
  return new GoogleCalendarError(`Google 授权接口返回 HTTP ${status}。`, { status });
}

export function parseGoogleApiError(status: number, payload: unknown): GoogleCalendarError {
  if (isRecord(payload) && isRecord(payload.error)) {
    const error = payload.error;
    const message = typeof error.message === "string" ? error.message.trim() : "";
    const first = Array.isArray(error.errors) && isRecord(error.errors[0]) ? error.errors[0] : null;
    const reason = first && typeof first.reason === "string" ? first.reason : undefined;
    const detail = first && typeof first.message === "string" ? first.message.trim() : "";
    const parts = [...new Set([message, detail].filter(Boolean))];
    const base = parts.length > 0 ? parts.join("：") : `Google 接口返回 HTTP ${status}。`;
    const text =
      reason === "rateLimitExceeded" ? `${base}（请求过于频繁，请稍后再试）` : base;
    return new GoogleCalendarError(text, { status, reason });
  }
  return new GoogleCalendarError(`Google 接口返回 HTTP ${status}。`, { status });
}

function parseTokenPayload(payload: unknown, previousRefreshToken = ""): GoogleTokenResponse {
  if (!isRecord(payload) || typeof payload.access_token !== "string" || !payload.access_token) {
    throw new GoogleCalendarError("Google 授权接口没有返回访问令牌。", {
      code: "missing-token",
    });
  }
  const expiresIn = Number(payload.expires_in);
  const refreshToken =
    typeof payload.refresh_token === "string" && payload.refresh_token
      ? payload.refresh_token
      : previousRefreshToken;
  return {
    accessToken: payload.access_token,
    refreshToken,
    expiresAt: Date.now() + (Number.isFinite(expiresIn) && expiresIn > 0 ? expiresIn : 3600) * 1000,
    scope:
      typeof payload.scope === "string" && payload.scope ? payload.scope : GOOGLE_CALENDAR_SCOPE,
    tokenType:
      typeof payload.token_type === "string" && payload.token_type
        ? payload.token_type
        : "Bearer",
  };
}

const defaultFetch: FetchLike = (input, init) => globalThis.fetch(input, init);

export interface ExchangeTokenInput {
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  fetchImpl?: FetchLike;
}

export async function exchangeCodeForToken(
  input: ExchangeTokenInput,
): Promise<GoogleTokenResponse> {
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: input.code,
    client_id: normalizeClientId(input.clientId),
    redirect_uri: normalizeRedirectUri(input.redirectUri),
    code_verifier: input.codeVerifier,
  });
  const response = await request(input.fetchImpl ?? defaultFetch, GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const payload = await readJson(response);
  if (!response.ok) throw parseOAuthError(response.status, payload);
  const token = parseTokenPayload(payload);
  if (!token.refreshToken) {
    throw new GoogleCalendarError(
      "Google 没有返回 refresh_token。请到 Google 账号的「第三方应用」中移除课序授权后重新连接。",
      { code: "missing-refresh-token" },
    );
  }
  return token;
}

export async function refreshAccessToken(
  auth: GoogleCalendarAuth,
  fetchImpl: FetchLike = defaultFetch,
): Promise<GoogleCalendarAuth> {
  if (!auth.refreshToken) {
    throw new GoogleCalendarError("Google 授权已失效，请断开后重新连接。", {
      code: "missing-refresh-token",
    });
  }
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: normalizeClientId(auth.clientId),
    refresh_token: auth.refreshToken,
  });
  const response = await request(fetchImpl, GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const payload = await readJson(response);
  if (!response.ok) throw parseOAuthError(response.status, payload);
  const token = parseTokenPayload(payload, auth.refreshToken);
  return { ...auth, ...token };
}

export async function ensureAccessToken(
  auth: GoogleCalendarAuth,
  fetchImpl: FetchLike = defaultFetch,
): Promise<GoogleCalendarAuth> {
  if (auth.accessToken && auth.expiresAt - Date.now() > 60_000) return auth;
  return refreshAccessToken(auth, fetchImpl);
}

interface ApiResponse {
  auth: GoogleCalendarAuth;
  data: unknown;
}

async function apiRequest(
  auth: GoogleCalendarAuth,
  path: string,
  init: { method?: string; body?: unknown } = {},
  fetchImpl: FetchLike = defaultFetch,
): Promise<ApiResponse> {
  if (!path.startsWith("/") || path.startsWith("//")) {
    throw new GoogleCalendarError("拒绝向 Google 日历 API 之外的地址发送请求。", {
      code: "blocked-domain",
    });
  }
  let current = await ensureAccessToken(auth, fetchImpl);
  const send = (token: string) =>
    request(fetchImpl, `${GOOGLE_CALENDAR_API}${path}`, {
      method: init.method ?? "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
    });

  let response = await send(current.accessToken);
  if (response.status === 401) {
    current = await refreshAccessToken(current, fetchImpl);
    saveGoogleAuth(current);
    response = await send(current.accessToken);
  }
  const payload = await readJson(response);
  if (!response.ok) throw parseGoogleApiError(response.status, payload);
  return { auth: current, data: payload };
}

export interface CalendarTarget {
  auth: GoogleCalendarAuth;
  calendarId: string;
  calendarSummary: string;
  created: boolean;
}

export function normalizeTimeZone(value?: string): string {
  const candidate = value?.trim() || DEFAULT_TIME_ZONE;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: candidate });
  } catch {
    throw new GoogleCalendarError(`无效的时区：${candidate}`, { code: "invalid-time-zone" });
  }
  return candidate;
}

export async function findOrCreateCalendar(
  auth: GoogleCalendarAuth,
  options: { timeZone?: string; fetchImpl?: FetchLike } = {},
): Promise<CalendarTarget> {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const timeZone = normalizeTimeZone(options.timeZone);
  const listed = await apiRequest(
    auth,
    "/users/me/calendarList?minAccessRole=owner&maxResults=250",
    {},
    fetchImpl,
  );
  const items =
    isRecord(listed.data) && Array.isArray(listed.data.items) ? listed.data.items : [];
  const match = items
    .filter(isRecord)
    .find((item) => item.summary === GOOGLE_CALENDAR_NAME && typeof item.id === "string");

  if (match && typeof match.id === "string") {
    const next = {
      ...listed.auth,
      calendarId: match.id,
      calendarSummary: GOOGLE_CALENDAR_NAME,
    };
    saveGoogleAuth(next);
    return {
      auth: next,
      calendarId: match.id,
      calendarSummary: GOOGLE_CALENDAR_NAME,
      created: false,
    };
  }

  const created = await apiRequest(
    listed.auth,
    "/calendars",
    {
      method: "POST",
      body: {
        summary: GOOGLE_CALENDAR_NAME,
        timeZone,
        description: "由课序创建并同步课表，请勿手动修改。",
      },
    },
    fetchImpl,
  );
  if (!isRecord(created.data) || typeof created.data.id !== "string" || !created.data.id) {
    throw new GoogleCalendarError("Google 没有返回新建日历的 ID。", {
      code: "calendar-create-failed",
    });
  }
  const next = {
    ...created.auth,
    calendarId: created.data.id,
    calendarSummary: GOOGLE_CALENDAR_NAME,
  };
  saveGoogleAuth(next);
  return {
    auth: next,
    calendarId: created.data.id,
    calendarSummary: GOOGLE_CALENDAR_NAME,
    created: true,
  };
}

export interface GoogleCalendarEventInput {
  id: string;
  iCalUID: string;
  summary: string;
  location: string;
  description: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
}

export interface BuildEventsOptions {
  timeZone?: string;
  periodProfiles?: PeriodProfile[];
}

export function formatGoogleDateTime(date: Date, time: string): string {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(time.trim());
  if (!match) {
    throw new GoogleCalendarError(`作息时间格式无效：${time}`, { code: "invalid-period-time" });
  }
  return `${dateKey(date)}T${match[1]}:${match[2]}:00`;
}

// Google event IDs accept only lowercase a-v and digits; hex encoding keeps the
// course/slot/week key valid and deterministic so re-syncs hit HTTP 409 instead
// of creating duplicates.
function googleEventId(key: string): string {
  let hex = "";
  for (const byte of new TextEncoder().encode(key)) {
    hex += byte.toString(16).padStart(2, "0");
  }
  return `cf${hex}`.slice(0, 1024);
}

export function buildTimetableEvents(
  timetable: Timetable,
  options: BuildEventsOptions = {},
): GoogleCalendarEventInput[] {
  const timeZone = normalizeTimeZone(options.timeZone);
  const { semester, courses } = timetable;
  const weekStartsOn = semester.weekStartsOn ?? 1;
  const rawWeeks = Number(semester.totalWeeks);
  const totalWeeks = Number.isFinite(rawWeeks)
    ? Math.min(100, Math.max(1, Math.round(rawWeeks)))
    : 0;

  const events: GoogleCalendarEventInput[] = [];
  for (let week = 1; week <= totalWeeks; week += 1) {
    const sessions = buildSessions(courses, week, timetable.overrides ?? []);
    for (const session of sessions) {
      if (session.start < 1 || session.end < session.start) continue;
      if (session.day < 1 || session.day > 7) continue;
      const date = getDateForSlot(semester.startDate, week, session.day, weekStartsOn);
      const periods = periodsForDate(timetable, options.periodProfiles ?? [], date);
      const startPeriod = periods[session.start - 1];
      const endPeriod = periods[session.end - 1];
      if (!startPeriod || !endPeriod) continue;

      const periodLabel =
        session.end !== session.start
          ? `第 ${session.start}–${session.end} 节`
          : `第 ${session.start} 节`;
      const description = [
        session.course.teacher ? `教师：${session.course.teacher}` : "",
        `第 ${week} 周 · ${periodLabel}`,
        session.course.note,
      ]
        .filter(Boolean)
        .join("\n");

      events.push({
        id: googleEventId(session.id),
        iCalUID: `${session.id}@classflow`,
        summary: session.course.name || "未命名课程",
        location: session.course.location ?? "",
        description,
        start: { dateTime: formatGoogleDateTime(date, startPeriod.start), timeZone },
        end: { dateTime: formatGoogleDateTime(date, endPeriod.end), timeZone },
      });
    }
  }
  return events;
}

export interface SyncFailure {
  summary: string;
  start: string;
  reason: string;
}

export interface SyncResult {
  calendarId: string;
  calendarName: string;
  total: number;
  succeeded: number;
  skipped: number;
  failed: number;
  failures: SyncFailure[];
}

export interface SyncOptions {
  timeZone?: string;
  periodProfiles?: PeriodProfile[];
  fetchImpl?: FetchLike;
  onProgress?: (done: number, total: number) => void;
  /** Test seam: use this auth instead of the one in localStorage. */
  auth?: GoogleCalendarAuth;
}

export async function syncTimetableToGoogle(
  timetable: Timetable,
  options: SyncOptions = {},
): Promise<SyncResult> {
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const timeZone = normalizeTimeZone(options.timeZone);
  const stored = options.auth ?? loadGoogleAuth();
  if (!stored || !stored.accessToken || !stored.refreshToken) {
    throw new GoogleCalendarError(
      "尚未连接 Google 日历。请先填写 Client ID 并完成授权。",
      { code: "not-connected" },
    );
  }

  const events = buildTimetableEvents(timetable, {
    timeZone,
    periodProfiles: options.periodProfiles,
  });

  let current = stored;
  let calendarId = current.calendarId;
  let calendarName = current.calendarSummary ?? GOOGLE_CALENDAR_NAME;
  if (!calendarId) {
    const target = await findOrCreateCalendar(current, { timeZone, fetchImpl });
    current = target.auth;
    calendarId = target.calendarId;
    calendarName = target.calendarSummary;
  }

  const result: SyncResult = {
    calendarId,
    calendarName,
    total: events.length,
    succeeded: 0,
    skipped: 0,
    failed: 0,
    failures: [],
  };

  let done = 0;
  options.onProgress?.(0, events.length);
  for (const event of events) {
    const path = `/calendars/${encodeURIComponent(calendarId)}/events?sendUpdates=none`;
    try {
      const response = await apiRequest(current, path, { method: "POST", body: event }, fetchImpl);
      current = response.auth;
      result.succeeded += 1;
    } catch (error) {
      if (!(error instanceof GoogleCalendarError)) throw error;
      if (error.code === "network") throw error;
      if (error.status === 401) {
        throw new GoogleCalendarError("Google 授权已失效，请断开连接后重新授权。", {
          status: 401,
          reason: error.reason,
        });
      }
      if (error.status === 403 || error.status === 429) throw error;
      if (error.status === 409) {
        result.skipped += 1;
      } else {
        result.failed += 1;
        result.failures.push({
          summary: event.summary,
          start: event.start.dateTime,
          reason: error.message,
        });
      }
    }
    done += 1;
    options.onProgress?.(done, events.length);
  }

  saveGoogleAuth(current);
  return result;
}

export interface PopupAuthOptions {
  redirectUri?: string;
  fetchImpl?: FetchLike;
  timeoutMs?: number;
}

function waitForAuthCallback(popup: Window, timeoutMs: number): Promise<AuthCallback> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (callback: AuthCallback) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedPoll);
      window.clearTimeout(timer);
      try {
        popup.close();
      } catch {
        // The popup may already be closed by the callback page.
      }
      resolve(callback);
    };
    const fail = (error: GoogleCalendarError) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("message", onMessage);
      window.clearInterval(closedPoll);
      window.clearTimeout(timer);
      try {
        popup.close();
      } catch {
        // The popup may already be closed.
      }
      reject(error);
    };
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const callback = parsePopupAuthMessage(event.data);
      if (callback) finish(callback);
    };
    window.addEventListener("message", onMessage);
    const closedPoll = window.setInterval(() => {
      if (popup.closed) {
        fail(
          new GoogleCalendarError("授权窗口已关闭，Google 授权未完成。", {
            code: "popup-closed",
          }),
        );
      }
    }, 500);
    const timer = window.setTimeout(() => {
      fail(
        new GoogleCalendarError("等待 Google 授权超时，请重新连接。", {
          code: "auth-timeout",
        }),
      );
    }, timeoutMs);
  });
}

export async function authorizeWithPopup(
  rawClientId: string,
  options: PopupAuthOptions = {},
): Promise<GoogleCalendarAuth> {
  if (typeof window === "undefined") {
    throw new GoogleCalendarError("当前环境不支持弹窗授权，请在浏览器或 App 内操作。", {
      code: "no-window",
    });
  }
  const clientId = normalizeClientId(rawClientId);
  const redirectUri = normalizeRedirectUri(options.redirectUri ?? defaultRedirectUri());
  const pkce = await createPkcePair();
  const state = randomUrlSafe(16);
  const pending: GoogleAuthRequest = {
    clientId,
    redirectUri,
    state,
    codeVerifier: pkce.verifier,
    codeChallenge: pkce.challenge,
    createdAt: Date.now(),
  };
  savePendingAuth(pending);

  const authUrl = buildAuthUrl({
    clientId,
    redirectUri,
    codeChallenge: pkce.challenge,
    state,
  });
  const popup = window.open(authUrl, "kexu-google-oauth", "popup=yes,width=520,height=680");
  if (!popup) {
    clearPendingAuth();
    throw new GoogleCalendarError("浏览器拦截了授权弹窗，请允许弹窗后重试。", {
      code: "popup-blocked",
    });
  }

  const callback = await waitForAuthCallback(popup, options.timeoutMs ?? AUTH_TIMEOUT_MS);
  if (callback.error) {
    clearPendingAuth();
    throw new GoogleCalendarError(
      callback.errorDescription || `Google 授权失败：${callback.error}`,
      { reason: callback.error },
    );
  }
  if (callback.state !== state) {
    clearPendingAuth();
    throw new GoogleCalendarError("授权回调的 state 与本次请求不匹配，已拒绝授权。", {
      code: "state-mismatch",
    });
  }
  if (!callback.code) {
    clearPendingAuth();
    throw new GoogleCalendarError("Google 没有返回授权码。", { code: "missing-code" });
  }

  const token = await exchangeCodeForToken({
    clientId,
    code: callback.code,
    codeVerifier: pkce.verifier,
    redirectUri,
    fetchImpl: options.fetchImpl,
  }).catch((error: unknown) => {
    clearPendingAuth();
    throw error;
  });
  const auth: GoogleCalendarAuth = {
    clientId,
    ...token,
    calendarId: null,
    calendarSummary: null,
    connectedAt: new Date().toISOString(),
  };
  if (!saveGoogleAuth(auth)) {
    clearPendingAuth();
    throw new GoogleCalendarError(
      "浏览器禁止本地存储，无法保存 Google 授权令牌。请允许本站使用 localStorage 后重试。",
      { code: "storage-unavailable" },
    );
  }
  saveGoogleClientId(clientId);
  clearPendingAuth();
  return auth;
}

export interface ConnectOptions extends PopupAuthOptions {
  timeZone?: string;
}

export interface GoogleCalendarConnection {
  auth: GoogleCalendarAuth;
  calendarId: string;
  calendarSummary: string;
  createdCalendar: boolean;
}

export async function connectGoogleCalendar(
  clientId: string,
  options: ConnectOptions = {},
): Promise<GoogleCalendarConnection> {
  const auth = await authorizeWithPopup(clientId, options);
  const target = await findOrCreateCalendar(auth, {
    timeZone: options.timeZone,
    fetchImpl: options.fetchImpl,
  });
  return {
    auth: target.auth,
    calendarId: target.calendarId,
    calendarSummary: target.calendarSummary,
    createdCalendar: target.created,
  };
}

export async function revokeGoogleAccess(
  auth: GoogleCalendarAuth,
  fetchImpl: FetchLike = defaultFetch,
): Promise<void> {
  const token = auth.refreshToken || auth.accessToken;
  let failure: GoogleCalendarError | null = null;
  try {
    if (token) {
      const response = await request(
        fetchImpl,
        `${GOOGLE_REVOKE_ENDPOINT}?token=${encodeURIComponent(token)}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
        },
      );
      if (!response.ok && response.status !== 400) {
        const payload = await readJson(response);
        const parsed = parseOAuthError(response.status, payload);
        failure = new GoogleCalendarError(
          `本机授权已清除，但向 Google 撤销令牌失败：${parsed.message}`,
          { status: response.status, reason: parsed.reason },
        );
      }
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : "未知错误";
    failure = new GoogleCalendarError(`本机授权已清除，但向 Google 撤销令牌失败：${detail}`, {
      status: error instanceof GoogleCalendarError ? error.status : undefined,
    });
  } finally {
    clearGoogleAuth();
    clearPendingAuth();
  }
  if (failure) throw failure;
}