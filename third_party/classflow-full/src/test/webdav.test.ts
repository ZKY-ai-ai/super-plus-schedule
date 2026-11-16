import { describe, expect, it } from "vitest";
import { createBlankSchedule } from "../lib/factory";
import {
  buildAuthHeaders,
  buildBackupFilename,
  buildBackupPayload,
  encodeBasicAuth,
  isBackupFileName,
  joinWebDavUrl,
  loadWebDavConfig,
  normalizeWebDavConfig,
  normalizeWebDavUrl,
  parseBackupDate,
  parseBackupText,
  parsePropfindXml,
  parseRemoteBackupsXml,
  saveWebDavConfig,
  WebDavError,
} from "../lib/webdav";
import { createMemoryStorage } from "./helpers";

const PROPFIND_OK = `<?xml version="1.0" encoding="utf-8"?>
<d:multistatus xmlns:d="DAV:">
  <d:response>
    <d:href>/dav/%E8%AF%BE%E5%BA%8F%E5%A4%87%E4%BB%BD/</d:href>
    <d:propstat>
      <d:prop><d:resourcetype><d:collection/></d:resourcetype></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/%E8%AF%BE%E5%BA%8F%E5%A4%87%E4%BB%BD/kexu-backup-20261116-153045-123.json</d:href>
    <d:propstat>
      <d:prop>
        <d:resourcetype/>
        <d:getcontentlength>2048</d:getcontentlength>
        <d:getlastmodified>Mon, 16 Nov 2026 07:30:45 GMT</d:getlastmodified>
      </d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/%E8%AF%BE%E5%BA%8F%E5%A4%87%E4%BB%BD/readme.txt</d:href>
    <d:propstat>
      <d:prop><d:resourcetype/><d:getcontentlength>12</d:getcontentlength></d:prop>
      <d:status>HTTP/1.1 200 OK</d:status>
    </d:propstat>
  </d:response>
</d:multistatus>`;

function expectWebDavError(run: () => unknown, code: WebDavError["code"]): void {
  try {
    run();
  } catch (error) {
    expect(error).toBeInstanceOf(WebDavError);
    expect((error as WebDavError).code).toBe(code);
    return;
  }
  throw new Error("预期抛出 WebDavError，但函数正常返回。");
}

describe("WebDAV 地址规范化", () => {
  it("补全、去尾斜杠并编码中文路径", () => {
    expect(normalizeWebDavUrl("  https://dav.example.com/remote.php/dav/files/张三/  ")).toBe(
      "https://dav.example.com/remote.php/dav/files/%E5%BC%A0%E4%B8%89",
    );
    expect(normalizeWebDavUrl("https://dav.example.com/")).toBe("https://dav.example.com");
    expect(normalizeWebDavUrl("http://127.0.0.1:5232/dav/?token=1#top")).toBe(
      "http://127.0.0.1:5232/dav",
    );
  });

  it("拒绝空地址、非 HTTP 协议和写进地址的凭据", () => {
    expectWebDavError(() => normalizeWebDavUrl("   "), "config");
    expectWebDavError(() => normalizeWebDavUrl("ftp://dav.example.com"), "config");
    expectWebDavError(() => normalizeWebDavUrl("dav.example.com/dav"), "config");
    expectWebDavError(() => normalizeWebDavUrl("https://me:secret@dav.example.com/dav"), "config");
  });

  it("拼接远程目录时逐段编码并阻止路径穿越", () => {
    expect(
      joinWebDavUrl(
        "https://dav.example.com/dav",
        "课序 备份/2026",
        "kexu-backup-20261116-153045-123.json",
      ),
    ).toBe(
      "https://dav.example.com/dav/%E8%AF%BE%E5%BA%8F%20%E5%A4%87%E4%BB%BD/2026/kexu-backup-20261116-153045-123.json",
    );
    expect(joinWebDavUrl("https://dav.example.com/dav", "/课序备份/")).toBe(
      "https://dav.example.com/dav/%E8%AF%BE%E5%BA%8F%E5%A4%87%E4%BB%BD",
    );
    expectWebDavError(() => joinWebDavUrl("https://dav.example.com", "../etc"), "config");
    expectWebDavError(() => joinWebDavUrl("https://dav.example.com", "备份", "../x.json"), "config");
  });
});

describe("WebDAV 认证头", () => {
  it("中文用户名与密码按 UTF-8 编码后再做 Base64", () => {
    const expected = `Basic ${Buffer.from("张三:密码123", "utf8").toString("base64")}`;
    expect(encodeBasicAuth("张三", "密码123")).toBe(expected);
    expect(buildAuthHeaders("张三", "密码123")).toEqual({ Authorization: expected });
  });

  it("未填写账号密码时不额外发送 Authorization", () => {
    expect(buildAuthHeaders("", "")).toEqual({});
  });
});

describe("备份文件名", () => {
  it("包含本地时间戳与毫秒，便于按名称排序", () => {
    const date = new Date(2026, 10, 16, 15, 30, 45, 123);
    const name = buildBackupFilename(date);
    expect(name).toBe("kexu-backup-20261116-153045-123.json");
    expect(isBackupFileName(name)).toBe(true);
    const parsed = parseBackupDate(name);
    expect(parsed?.getFullYear()).toBe(2026);
    expect(parsed?.getMonth()).toBe(10);
    expect(parsed?.getDate()).toBe(16);
    expect(parsed?.getHours()).toBe(15);
    expect(parsed?.getMinutes()).toBe(30);
    expect(parsed?.getMilliseconds()).toBe(123);
  });

  it("拒绝非备份文件名与不存在的日期", () => {
    expect(isBackupFileName("课序备份.json")).toBe(false);
    expect(isBackupFileName("kexu-backup-20261116-153045-123.json/../x")).toBe(false);
    expect(parseBackupDate("kexu-backup-20261340-153045-123.json")).toBeNull();
  });
});

describe("PROPFIND 解析", () => {
  it("解析集合、大小、修改时间并从 href 解码中文名", () => {
    const entries = parsePropfindXml(PROPFIND_OK);
    expect(entries).toHaveLength(3);
    expect(entries[0].isCollection).toBe(true);
    expect(entries[0].name).toBe("课序备份");
    expect(entries[1].name).toBe("kexu-backup-20261116-153045-123.json");
    expect(entries[1].size).toBe(2048);
    expect(entries[1].isCollection).toBe(false);
    expect(entries[1].lastModified).toBe("Mon, 16 Nov 2026 07:30:45 GMT");
  });

  it("只保留备份 JSON，并按文件名倒序排列", () => {
    const xml = PROPFIND_OK.replace(
      "<d:response>\n    <d:href>/dav/%E8%AF%BE%E5%BA%8F%E5%A4%87%E4%BB%BD/readme.txt</d:href>",
      `<d:response>
    <d:href>/dav/%E8%AF%BE%E5%BA%8F%E5%A4%87%E4%BB%BD/kexu-backup-20261117-090000-000.json</d:href>
    <d:propstat><d:prop><d:resourcetype/><d:getcontentlength>10</d:getcontentlength></d:prop></d:propstat>
  </d:response>
  <d:response>
    <d:href>/dav/%E8%AF%BE%E5%BA%8F%E5%A4%87%E4%BB%BD/readme.txt</d:href>`,
    );
    const backups = parseRemoteBackupsXml(xml);
    expect(backups.map((item) => item.name)).toEqual([
      "kexu-backup-20261117-090000-000.json",
      "kexu-backup-20261116-153045-123.json",
    ]);
    expect(backups.every((item) => item.created instanceof Date)).toBe(true);
  });

  it("兼容无命名空间前缀的 multistatus", () => {
    const xml = `<multistatus><response><href>/dav/kexu-backup-20261116-153045-123.json</href><propstat><prop><resourcetype/><getcontentlength>5</getcontentlength></prop></propstat></response></multistatus>`;
    const backups = parseRemoteBackupsXml(xml);
    expect(backups).toHaveLength(1);
    expect(backups[0].size).toBe(5);
  });

  it("空响应、登录页、缺少 response/href 都明确报解析错误", () => {
    expectWebDavError(() => parsePropfindXml(""), "parse");
    expectWebDavError(() => parsePropfindXml("<html><body>请先登录</body></html>"), "parse");
    expectWebDavError(() => parsePropfindXml('<d:multistatus xmlns:d="DAV:"></d:multistatus>'), "parse");
    expectWebDavError(
      () =>
        parsePropfindXml(
          '<d:multistatus xmlns:d="DAV:"><d:response><d:propstat><d:prop><d:resourcetype/></d:prop></d:propstat></d:response></d:multistatus>',
        ),
      "parse",
    );
  });

  it("多状态里没有备份文件时返回空列表而不是报错", () => {
    const xml =
      '<d:multistatus xmlns:d="DAV:"><d:response><d:href>/dav/readme.txt</d:href><d:propstat><d:prop><d:resourcetype/></d:prop></d:propstat></d:response></d:multistatus>';
    expect(parseRemoteBackupsXml(xml)).toEqual([]);
  });
});

describe("备份内容校验", () => {
  const now = new Date("2026-11-16T08:30:00.000Z");

  it("上传信封可被 normalizeSchedule 还原", () => {
    const data = createBlankSchedule(new Date(2026, 8, 1));
    const payload = buildBackupPayload(data, now);
    expect(payload.app).toBe("kexu");
    expect(payload.version).toBe(2);
    expect(payload.exportedAt).toBe("2026-11-16T08:30:00.000Z");

    const restored = parseBackupText(JSON.stringify(payload));
    expect(restored.timetables).toHaveLength(data.timetables.length);
    expect(restored.activeTimetableId).toBe(data.activeTimetableId);
  });

  it("拒绝空文件、损坏 JSON 和无法识别的课表", () => {
    expectWebDavError(() => parseBackupText("  "), "parse");
    expectWebDavError(() => parseBackupText("{not json"), "parse");
    expectWebDavError(() => parseBackupText('{"hello":"world"}'), "parse");
  });
});

describe("本机配置", () => {
  it("只写入本地存储，并裁剪越界设置", () => {
    const storage = createMemoryStorage();
    const saved = saveWebDavConfig(
      {
        url: " https://dav.example.com/dav ",
        username: "张三",
        password: "密码",
        remoteDir: "课序备份/自动",
        autoBackup: true,
        autoBackupMinutes: 999,
        retainCount: 0,
      },
      storage,
    );
    expect(saved).toBe(true);
    const loaded = loadWebDavConfig(storage);
    expect(loaded.url).toBe("https://dav.example.com/dav");
    expect(loaded.username).toBe("张三");
    expect(loaded.autoBackupMinutes).toBe(240);
    expect(loaded.retainCount).toBe(1);
    expect(storage.getItem("kexu:webdav:v1")).toContain("密码");
  });

  it("损坏的配置回落到默认值，非法目录不保留", () => {
    expect(loadWebDavConfig(createMemoryStorage())).toEqual({
      url: "",
      username: "",
      password: "",
      remoteDir: "课序备份",
      autoBackup: false,
      autoBackupMinutes: 30,
      retainCount: 10,
    });
    expect(normalizeWebDavConfig({ remoteDir: "../../etc", autoBackup: "yes" })).toMatchObject({
      remoteDir: "",
      autoBackup: false,
    });
    expect(loadWebDavConfig(null)).toMatchObject({ url: "", remoteDir: "课序备份" });
  });
});
