import type { ScheduleData } from "../types";
import { normalizeSchedule } from "./storage";

export const WEBDAV_CONFIG_KEY = "kexu:webdav:v1";
export const WEBDAV_DEFAULT_DIR = "课序备份";
export const WEBDAV_TIMEOUT_MS = 20000;
export const WEBDAV_CREDENTIAL_NOTICE =
  "WebDAV 账号与密码只保存在这台设备的本地存储里，仅用于直接连接你填写的网盘；课序没有服务器，也不会上传凭据。公用设备请谨慎保存。";

const BACKUP_NAME_RE = /^kexu-backup-\d{8}-\d{6}(?:-\d{3})?\.json$/;
const PROPFIND_BODY =
  '<?xml version="1.0" encoding="utf-8"?>' +
  '<d:propfind xmlns:d="DAV:"><d:prop>' +
  "<d:resourcetype/><d:getlastmodified/><d:getcontentlength/>" +
  "</d:prop></d:propfind>";

export type WebDavErrorCode =
  | "config"
  | "auth"
  | "forbidden"
  | "not-found"
  | "conflict"
  | "network"
  | "cors"
  | "timeout"
  | "server"
  | "parse";

export class WebDavError extends Error {
  readonly code: WebDavErrorCode;
  readonly status?: number;
  readonly hint?: string;

  constructor(
    code: WebDavErrorCode,
    message: string,
    options: { status?: number; hint?: string } = {},
  ) {
    super(message);
    this.name = "WebDavError";
    this.code = code;
    this.status = options.status;
    this.hint = options.hint;
  }
}

export interface WebDavConfig {
  url: string;
  username: string;
  password: string;
  remoteDir: string;
  autoBackup: boolean;
  autoBackupMinutes: number;
  retainCount: number;
}

export const DEFAULT_WEBDAV_CONFIG: WebDavConfig = {
  url: "",
  username: "",
  password: "",
  remoteDir: WEBDAV_DEFAULT_DIR,
  autoBackup: false,
  autoBackupMinutes: 30,
  retainCount: 10,
};

export interface RemoteEntry {
  href: string;
  name: string;
  isCollection: boolean;
  size: number | null;
  lastModified: string | null;
}

export interface RemoteBackup extends RemoteEntry {
  created: Date | null;
}

export interface UploadBackupResult {
  name: string;
  url: string;
  bytes: number;
}

export interface WebDavBackupPayload {
  app: "kexu";
  version: 2;
  exportedAt: string;
  data: ScheduleData;
}

interface WebDavResponse {
  status: number;
  text: string;
  headers: Record<string, string>;
}

interface RequestOptions {
  method: string;
  url: string;
  body?: string;
  headers?: Record<string, string>;
  timeoutMs?: number;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampInt(value: unknown, min: number, max: number, fallback: number): number {
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function configError(message: string): WebDavError {
  return new WebDavError("config", message);
}

function browserStorage(): Storage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

export function normalizeWebDavConfig(raw: unknown): WebDavConfig {
  const object = isRecord(raw) ? raw : {};
  const url = typeof object.url === "string" ? object.url.trim().slice(0, 500) : "";
  const username = typeof object.username === "string" ? object.username.trim().slice(0, 200) : "";
  const password = typeof object.password === "string" ? object.password.slice(0, 500) : "";
  let remoteDir = WEBDAV_DEFAULT_DIR;
  if (typeof object.remoteDir === "string") {
    try {
      remoteDir = normalizeRemoteDir(object.remoteDir);
    } catch {
      remoteDir = "";
    }
  }
  return {
    url,
    username,
    password,
    remoteDir,
    autoBackup: object.autoBackup === true,
    autoBackupMinutes: clampInt(object.autoBackupMinutes, 5, 240, DEFAULT_WEBDAV_CONFIG.autoBackupMinutes),
    retainCount: clampInt(object.retainCount, 1, 50, DEFAULT_WEBDAV_CONFIG.retainCount),
  };
}

export function loadWebDavConfig(storage: Storage | null = browserStorage()): WebDavConfig {
  if (!storage) return { ...DEFAULT_WEBDAV_CONFIG };
  try {
    const raw = storage.getItem(WEBDAV_CONFIG_KEY);
    if (!raw) return { ...DEFAULT_WEBDAV_CONFIG };
    return normalizeWebDavConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WEBDAV_CONFIG };
  }
}

/** Returns false when the device has no usable local storage or it is full. */
export function saveWebDavConfig(
  config: WebDavConfig,
  storage: Storage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(WEBDAV_CONFIG_KEY, JSON.stringify(normalizeWebDavConfig(config)));
    return true;
  } catch {
    return false;
  }
}

export function clearWebDavConfig(storage: Storage | null = browserStorage()): void {
  try {
    storage?.removeItem(WEBDAV_CONFIG_KEY);
  } catch {
    // Storage can be unavailable in private mode; there is nothing to clear then.
  }
}

export function normalizeWebDavUrl(input: string): string {
  const value = input.trim();
  if (!value) {
    throw configError("请填写 WebDAV 地址，例如 https://dav.example.com/remote.php/dav/files/你的用户名/");
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw configError("WebDAV 地址格式不正确，需要以 http:// 或 https:// 开头。");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw configError("WebDAV 地址只支持 http:// 或 https://。");
  }
  if (parsed.username || parsed.password) {
    throw configError("请不要把用户名和密码写进地址，改用下方账号与密码输入框。");
  }
  parsed.hash = "";
  parsed.search = "";
  parsed.pathname = parsed.pathname.replace(/\/+$/, "") || "/";
  return parsed.pathname === "/" ? parsed.origin : `${parsed.origin}${parsed.pathname}`;
}

export function normalizeRemoteDir(input: string): string {
  const segments = input
    .trim()
    .replace(/\\/g, "/")
    .split("/")
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length > 16) {
    throw configError("远程目录层级太深，请精简到 16 层以内。");
  }
  return segments
    .map((segment) => {
      if (segment === "." || segment === "..") {
        throw configError("远程目录不能包含 . 或 .. 路径。");
      }
      if (segment.length > 120) {
        throw configError("远程目录的某一段超过 120 个字符，请缩短。");
      }
      if (/[\u0000-\u001f\u007f]/.test(segment)) {
        throw configError("远程目录包含不可见控制字符，请重新填写。");
      }
      return segment;
    })
    .join("/");
}

export function joinWebDavUrl(baseInput: string, remoteDir: string, fileName?: string): string {
  const base = normalizeWebDavUrl(baseInput);
  const dir = normalizeRemoteDir(remoteDir);
  const parts = dir ? dir.split("/") : [];
  if (fileName !== undefined) {
    const name = fileName.trim();
    if (!name || name.includes("/") || name.includes("\\") || name === "." || name === "..") {
      throw configError("远程文件名不合法。");
    }
    parts.push(name);
  }
  if (parts.length === 0) return base;
  return `${base}/${parts.map((part) => encodeURIComponent(part)).join("/")}`;
}

export function encodeBasicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return `Basic ${btoa(binary)}`;
}

export function buildAuthHeaders(
  username: string,
  password: string,
): Record<string, string> {
  if (!username && !password) return {};
  return { Authorization: encodeBasicAuth(username, password) };
}

function pad(value: number, length = 2): string {
  return String(value).padStart(length, "0");
}

export function buildBackupFilename(date: Date = new Date()): string {
  const stamp =
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}` +
    `-${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}` +
    `-${pad(date.getMilliseconds(), 3)}`;
  return `kexu-backup-${stamp}.json`;
}

export function isBackupFileName(name: string): boolean {
  return BACKUP_NAME_RE.test(name);
}

export function parseBackupDate(name: string): Date | null {
  const match = /^kexu-backup-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})(?:-(\d{3}))?\.json$/.exec(
    name,
  );
  if (!match) return null;
  const [year, month, day, hour, minute, second, millisecond] = match
    .slice(1)
    .map((part) => (part ? Number(part) : 0));
  const date = new Date(year, month - 1, day, hour, minute, second, millisecond);
  if (
    Number.isNaN(date.getTime()) ||
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second ||
    date.getMilliseconds() !== millisecond
  ) {
    return null;
  }
  return date;
}

export function assertBackupFileName(name: string): void {
  if (!isBackupFileName(name)) {
    throw configError("这不是课序生成的 WebDAV 备份文件名，已停止操作。");
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&#x([0-9a-f]+);/gi, (_, hex: string) => {
      try {
        return String.fromCodePoint(Number.parseInt(hex, 16));
      } catch {
        return "";
      }
    })
    .replace(/&#(\d+);/g, (_, decimal: string) => {
      try {
        return String.fromCodePoint(Number(decimal));
      } catch {
        return "";
      }
    })
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const XML_PREFIX = "(?:[A-Za-z_][\\w.-]*:)?";

function xmlText(block: string, tag: string): string | null {
  const match = new RegExp(
    `<${XML_PREFIX}${tag}\\b[^>]*>([\\s\\S]*?)<\\/${XML_PREFIX}${tag}\\s*>`,
    "i",
  ).exec(block);
  return match ? decodeXmlEntities(match[1]).trim() : null;
}

function hrefBaseName(href: string): string {
  let path = href;
  if (/^https?:/i.test(href)) {
    try {
      path = new URL(href).pathname;
    } catch {
      return "";
    }
  }
  const pathname = path.split(/[?#]/)[0].replace(/\/+$/, "");
  const raw = pathname.split("/").pop() ?? "";
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * Dependency-free parser for a WebDAV multistatus response, so it works in the
 * native WebView and in Node tests without DOMParser.
 */
export function parsePropfindXml(xml: string): RemoteEntry[] {
  if (typeof xml !== "string" || !xml.trim()) {
    throw new WebDavError("parse", "WebDAV 返回了空响应，无法读取目录。");
  }
  if (!new RegExp(`<${XML_PREFIX}multistatus\\b`, "i").test(xml)) {
    throw new WebDavError(
      "parse",
      "服务器没有返回 WebDAV 目录数据（multistatus）。请确认地址指向 WebDAV 根路径，而不是网盘网页首页或登录页。",
    );
  }
  const blocks = [
    ...xml.matchAll(
      new RegExp(`<${XML_PREFIX}response\\b[^>]*>([\\s\\S]*?)<\\/${XML_PREFIX}response\\s*>`, "gi"),
    ),
  ];
  if (blocks.length === 0) {
    throw new WebDavError("parse", "WebDAV 目录列表为空或格式不完整（缺少 response 节点）。");
  }
  const entries: RemoteEntry[] = [];
  let hrefCount = 0;
  for (const block of blocks) {
    const href = xmlText(block[1], "href");
    if (!href) continue;
    hrefCount += 1;
    const name = hrefBaseName(href);
    const isCollection =
      new RegExp(`<${XML_PREFIX}collection\\b`, "i").test(block[1]) || /\/$/.test(href);
    const sizeText = xmlText(block[1], "getcontentlength");
    const size = sizeText === null ? null : Number(sizeText);
    entries.push({
      href,
      name,
      isCollection,
      size: size !== null && Number.isFinite(size) && size >= 0 ? size : null,
      lastModified: xmlText(block[1], "getlastmodified") || null,
    });
  }
  if (hrefCount === 0) {
    throw new WebDavError("parse", "WebDAV 目录数据里缺少 href，无法定位备份文件。");
  }
  return entries;
}

export function parseRemoteBackupsXml(xml: string): RemoteBackup[] {
  return parsePropfindXml(xml)
    .filter((entry) => !entry.isCollection && isBackupFileName(entry.name))
    .map((entry) => ({ ...entry, created: parseBackupDate(entry.name) }))
    .sort((left, right) => right.name.localeCompare(left.name));
}

function extractServerMessage(body: string): string {
  const trimmed = body.replace(/^\uFEFF/, "").trim();
  if (!trimmed) return "";
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      if (isRecord(parsed)) {
        const message = [parsed.message, parsed.error, parsed.error_description].find(
          (value): value is string => typeof value === "string" && value.trim().length > 0,
        );
        if (message) return message.trim().slice(0, 160);
      }
    } catch {
      // Fall through to a plain-text preview.
    }
  }
  const xmlMessage = xmlText(trimmed, "message");
  const plain = (xmlMessage ?? trimmed.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
  return plain.slice(0, 160);
}

function throwForStatus(status: number, body: string, action: string): never {
  const detail = extractServerMessage(body);
  const suffix = detail ? ` 服务器提示：${detail}` : "";
  if (status === 401) {
    throw new WebDavError("auth", `WebDAV 认证失败（HTTP 401）。请检查用户名和密码；不少网盘需要单独生成「应用密码」。${suffix}`, { status });
  }
  if (status === 403) {
    throw new WebDavError("forbidden", `没有权限访问这个 WebDAV 路径（HTTP 403）。请检查账号权限或远程目录。${suffix}`, { status });
  }
  if (status === 404) {
    throw new WebDavError("not-found", `${action}失败：远程路径不存在（HTTP 404）。请检查 WebDAV 地址与远程目录。${suffix}`, { status });
  }
  if (status === 405) {
    throw new WebDavError("server", `${action}失败：服务器不支持这个 WebDAV 操作（HTTP 405）。请确认该地址是 WebDAV 服务，而不是普通网页。${suffix}`, { status });
  }
  if (status === 409) {
    throw new WebDavError("conflict", `${action}失败：远程目录的上级路径不存在（HTTP 409），或同名资源冲突。${suffix}`, { status });
  }
  if (status === 423) {
    throw new WebDavError("conflict", `${action}失败：远程文件被锁定（HTTP 423）。请稍后再试。${suffix}`, { status });
  }
  if (status === 429) {
    throw new WebDavError("server", `${action}失败：请求过于频繁（HTTP 429），请稍后再试。${suffix}`, { status });
  }
  if (status >= 500) {
    throw new WebDavError("server", `${action}失败：WebDAV 服务器错误（HTTP ${status}）。${suffix}`, { status });
  }
  throw new WebDavError("server", `${action}失败：服务器返回 HTTP ${status}。${suffix}`, { status });
}

async function requestWebDav(
  config: WebDavConfig,
  options: RequestOptions,
): Promise<WebDavResponse> {
  normalizeWebDavUrl(config.url);
  const timeoutMs = options.timeoutMs ?? WEBDAV_TIMEOUT_MS;
  const headers: Record<string, string> = {
    Accept: "application/xml, application/json, text/plain, */*",
    ...buildAuthHeaders(config.username, config.password),
    ...options.headers,
  };

  let native = false;
  try {
    const { Capacitor } = await import("@capacitor/core");
    native = Capacitor.isNativePlatform();
  } catch {
    native = false;
  }

  if (native) {
    try {
      const { CapacitorHttp } = await import("@capacitor/core");
      const response = await CapacitorHttp.request({
        url: options.url,
        method: options.method,
        headers,
        data: options.body,
        connectTimeout: timeoutMs,
        readTimeout: timeoutMs,
        responseType: "text",
      });
      return {
        status: response.status,
        text:
          typeof response.data === "string"
            ? response.data
            : response.data === undefined || response.data === null
              ? ""
              : JSON.stringify(response.data),
        headers: response.headers ?? {},
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (/timeout|timed out/i.test(message)) {
        throw new WebDavError("timeout", `连接 WebDAV 超时（${Math.round(timeoutMs / 1000)} 秒）。请检查网络或服务器地址。`);
      }
      throw new WebDavError("network", `无法连接 WebDAV：${message || "网络请求失败"}。请检查网络、地址与证书。`);
    }
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(options.url, {
      method: options.method,
      headers,
      body: options.body,
      signal: controller.signal,
      redirect: "follow",
      credentials: "omit",
    });
    const text = await response.text();
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    return { status: response.status, text, headers: responseHeaders };
  } catch (error) {
    if (controller.signal.aborted) {
      throw new WebDavError("timeout", `连接 WebDAV 超时（${Math.round(timeoutMs / 1000)} 秒）。请检查网络或服务器地址。`);
    }
    if (error instanceof TypeError) {
      throw new WebDavError(
        "cors",
        "浏览器无法访问这个 WebDAV 地址。",
        {
          hint:
            "常见原因：地址写错、服务器不可达，或网盘没有允许跨域（CORS）。网页版需要服务器允许 PROPFIND / MKCOL / PUT / GET / DELETE 的跨域请求，并允许 Authorization 请求头；Android App 使用系统网络请求，不受 CORS 限制。",
        },
      );
    }
    throw new WebDavError(
      "network",
      `WebDAV 请求失败：${error instanceof Error ? error.message : "网络错误"}。`,
    );
  } finally {
    clearTimeout(timer);
  }
}

function withTrailingSlash(url: string): string {
  return url.endsWith("/") ? url : `${url}/`;
}

export function buildBackupPayload(
  data: ScheduleData,
  now: Date = new Date(),
): WebDavBackupPayload {
  return {
    app: "kexu",
    version: 2,
    exportedAt: now.toISOString(),
    data,
  };
}

export function parseBackupText(text: string): ScheduleData {
  if (!text.trim()) {
    throw new WebDavError("parse", "远程备份是空文件，无法恢复。");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new WebDavError("parse", "远程备份不是有效的 JSON 文件，可能已经损坏。");
  }
  const schedule = normalizeSchedule(parsed);
  if (!schedule) {
    throw new WebDavError("parse", "远程备份不是课序能识别的课表格式，未做任何修改。");
  }
  return schedule;
}

export async function testWebDavConnection(
  config: WebDavConfig,
  timeoutMs = WEBDAV_TIMEOUT_MS,
): Promise<void> {
  const url = withTrailingSlash(normalizeWebDavUrl(config.url));
  const response = await requestWebDav(config, {
    method: "PROPFIND",
    url,
    body: PROPFIND_BODY,
    headers: { Depth: "0", "Content-Type": "application/xml; charset=utf-8" },
    timeoutMs,
  });
  if (response.status !== 200 && response.status !== 207) {
    throwForStatus(response.status, response.text, "测试连接");
  }
  try {
    parsePropfindXml(response.text);
  } catch {
    throw new WebDavError(
      "parse",
      "地址可以访问，但返回的不是 WebDAV 目录数据。请确认填写的是 WebDAV 根路径（例如 /remote.php/dav/files/用户名/），而不是网盘网页首页。",
    );
  }
}

export async function ensureRemoteDir(
  config: WebDavConfig,
  timeoutMs = WEBDAV_TIMEOUT_MS,
): Promise<void> {
  const dir = normalizeRemoteDir(config.remoteDir);
  if (!dir) return;
  let current = "";
  for (const segment of dir.split("/")) {
    current = current ? `${current}/${segment}` : segment;
    const response = await requestWebDav(config, {
      method: "MKCOL",
      url: joinWebDavUrl(config.url, current),
      timeoutMs,
    });
    if ([200, 201, 204, 405].includes(response.status)) continue;
    throwForStatus(response.status, response.text, "创建远程目录");
  }
}

export function remoteBackupUrl(config: WebDavConfig, fileName: string): string {
  assertBackupFileName(fileName);
  return joinWebDavUrl(config.url, config.remoteDir, fileName);
}

export async function uploadScheduleBackup(
  config: WebDavConfig,
  data: ScheduleData,
  options: { now?: Date; timeoutMs?: number } = {},
): Promise<UploadBackupResult> {
  const now = options.now ?? new Date();
  const name = buildBackupFilename(now);
  await ensureRemoteDir(config, options.timeoutMs);
  const body = JSON.stringify(buildBackupPayload(data, now), null, 2);
  const url = remoteBackupUrl(config, name);
  const response = await requestWebDav(config, {
    method: "PUT",
    url,
    body,
    headers: { "Content-Type": "application/json; charset=utf-8" },
    timeoutMs: options.timeoutMs,
  });
  if (![200, 201, 204].includes(response.status)) {
    throwForStatus(response.status, response.text, "上传备份");
  }
  return { name, url, bytes: new TextEncoder().encode(body).length };
}

export async function listRemoteBackups(
  config: WebDavConfig,
  timeoutMs = WEBDAV_TIMEOUT_MS,
): Promise<RemoteBackup[]> {
  const dirUrl = withTrailingSlash(joinWebDavUrl(config.url, config.remoteDir));
  const response = await requestWebDav(config, {
    method: "PROPFIND",
    url: dirUrl,
    body: PROPFIND_BODY,
    headers: { Depth: "1", "Content-Type": "application/xml; charset=utf-8" },
    timeoutMs,
  });
  if (response.status === 404) return [];
  if (response.status !== 200 && response.status !== 207) {
    throwForStatus(response.status, response.text, "读取远程备份");
  }
  return parseRemoteBackupsXml(response.text);
}

export async function downloadBackupText(
  config: WebDavConfig,
  name: string,
  timeoutMs = WEBDAV_TIMEOUT_MS,
): Promise<string> {
  const response = await requestWebDav(config, {
    method: "GET",
    url: remoteBackupUrl(config, name),
    timeoutMs,
  });
  if (response.status !== 200) {
    throwForStatus(response.status, response.text, "下载备份");
  }
  return response.text;
}

export async function downloadBackup(
  config: WebDavConfig,
  name: string,
  timeoutMs = WEBDAV_TIMEOUT_MS,
): Promise<ScheduleData> {
  return parseBackupText(await downloadBackupText(config, name, timeoutMs));
}

export async function deleteBackup(
  config: WebDavConfig,
  name: string,
  timeoutMs = WEBDAV_TIMEOUT_MS,
): Promise<void> {
  const response = await requestWebDav(config, {
    method: "DELETE",
    url: remoteBackupUrl(config, name),
    timeoutMs,
  });
  if (![200, 202, 204].includes(response.status)) {
    throwForStatus(response.status, response.text, "删除备份");
  }
}

export async function cleanupOldBackups(
  config: WebDavConfig,
  keepCount = config.retainCount,
  timeoutMs = WEBDAV_TIMEOUT_MS,
): Promise<{ deleted: string[]; kept: number }> {
  const keep = clampInt(keepCount, 1, 50, DEFAULT_WEBDAV_CONFIG.retainCount);
  const backups = await listRemoteBackups(config, timeoutMs);
  const stale = backups.slice(keep);
  const deleted: string[] = [];
  for (const backup of stale) {
    try {
      await deleteBackup(config, backup.name, timeoutMs);
      deleted.push(backup.name);
    } catch (error) {
      const reason = webDavErrorMessage(error);
      throw new WebDavError(
        "server",
        `已删除 ${deleted.length} 份旧备份，但删除「${backup.name}」失败：${reason}`,
      );
    }
  }
  return { deleted, kept: Math.min(backups.length, keep) };
}

export function webDavErrorMessage(error: unknown): string {
  if (error instanceof WebDavError) {
    return error.hint ? `${error.message} ${error.hint}` : error.message;
  }
  if (error instanceof Error) return error.message;
  return "未知错误，请稍后再试。";
}

export interface WebDavAutoBackupOptions {
  getConfig: () => WebDavConfig;
  getData: () => ScheduleData;
  onBackup: (result: UploadBackupResult) => void;
  onError: (error: unknown) => void;
}

/**
 * App-wide timer for "back up while the app is open". The callback reads the
 * latest config on every tick, so toggling auto backup or changing the interval
 * does not require restarting it. Returns a stop function.
 */
export function startWebDavAutoBackup(options: WebDavAutoBackupOptions): () => void {
  let lastRun = Date.now();
  let running = false;
  const timer = setInterval(() => {
    if (running) return;
    let config: WebDavConfig;
    try {
      config = options.getConfig();
    } catch {
      return;
    }
    if (!config.autoBackup || !config.url.trim()) {
      lastRun = Date.now();
      return;
    }
    const minutes = clampInt(config.autoBackupMinutes, 5, 240, DEFAULT_WEBDAV_CONFIG.autoBackupMinutes);
    if (Date.now() - lastRun < minutes * 60_000) return;
    if (typeof document !== "undefined" && document.visibilityState === "hidden") return;
    lastRun = Date.now();
    running = true;
    void uploadScheduleBackup(config, options.getData())
      .then(options.onBackup)
      .catch(options.onError)
      .finally(() => {
        running = false;
      });
  }, 30_000);
  return () => clearInterval(timer);
}
