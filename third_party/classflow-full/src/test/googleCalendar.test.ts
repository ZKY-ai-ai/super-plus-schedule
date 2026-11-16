import { describe, expect, it } from "vitest";
import type { Timetable } from "../types";
import {
  DEFAULT_TIME_ZONE,
  GOOGLE_CALENDAR_NAME,
  GoogleCalendarError,
  buildAuthUrl,
  buildTimetableEvents,
  normalizeClientId,
  normalizeTimeZone,
  parseAuthCallback,
  parseGoogleApiError,
  parseOAuthError,
  parsePopupAuthMessage,
  pkceChallenge,
  syncTimetableToGoogle,
  type FetchLike,
  type GoogleCalendarAuth,
} from "../lib/googleCalendar";

const NOW = "2026-09-01T00:00:00.000Z";

function makeTimetable(): Timetable {
  return {
    id: "timetable-1",
    name: "2026 秋课表",
    semester: {
      name: "2026 秋",
      startDate: "2026-09-07",
      totalWeeks: 4,
      showWeekends: true,
      weekStartsOn: 1,
      periods: [
        { index: 1, start: "08:00", end: "08:45" },
        { index: 2, start: "08:55", end: "09:40" },
        { index: 3, start: "10:00", end: "10:45" },
      ],
    },
    periodProfileId: null,
    periodRules: [],
    courses: [
      {
        id: "course-math",
        name: "高等数学",
        teacher: "张老师",
        location: "教101",
        tone: "clay",
        note: "带计算器",
        slots: [
          {
            id: "slot-math",
            day: 1,
            start: 1,
            end: 2,
            weekStart: 1,
            weekEnd: 4,
            pattern: "odd",
          },
        ],
        createdAt: NOW,
        updatedAt: NOW,
      },
      {
        id: "course-english",
        name: "大学英语",
        teacher: "李老师",
        location: "外语楼302",
        tone: "sky",
        note: "",
        slots: [
          {
            id: "slot-english",
            day: 3,
            start: 3,
            end: 3,
            weekStart: 1,
            weekEnd: 2,
            pattern: "all",
          },
        ],
        createdAt: NOW,
        updatedAt: NOW,
      },
    ],
    events: [],
    overrides: [],
    calendarOverrides: [],
    wallpaper: { preset: "paper", dataUrl: "", dim: 0 },
    createdAt: NOW,
    updatedAt: NOW,
  };
}

function makeAuth(): GoogleCalendarAuth {
  return {
    clientId: "123-abc.apps.googleusercontent.com",
    accessToken: "access-token-123",
    refreshToken: "refresh-token-456",
    expiresAt: Date.now() + 3_600_000,
    scope: "https://www.googleapis.com/auth/calendar",
    tokenType: "Bearer",
    calendarId: "calendar-1",
    calendarSummary: GOOGLE_CALENDAR_NAME,
    connectedAt: NOW,
  };
}

interface RecordedCall {
  url: string;
  init?: RequestInit;
}

describe("Google Calendar PKCE and authorization", () => {
  it("matches the RFC 7636 S256 test vector", async () => {
    const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
    await expect(pkceChallenge(verifier)).resolves.toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
  });

  it("builds an authorization URL with PKCE, offline access and state", () => {
    const url = new URL(
      buildAuthUrl({
        clientId: "123-abc.apps.googleusercontent.com",
        redirectUri: "https://app.example.com/oauth-callback.html",
        codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
        state: "state-abc",
      }),
    );

    expect(url.origin).toBe("https://accounts.google.com");
    expect(url.pathname).toBe("/o/oauth2/v2/auth");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("client_id")).toBe("123-abc.apps.googleusercontent.com");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://app.example.com/oauth-callback.html",
    );
    expect(url.searchParams.get("scope")).toBe("https://www.googleapis.com/auth/calendar");
    expect(url.searchParams.get("code_challenge")).toBe(
      "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    );
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("state-abc");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    expect(url.searchParams.has("client_secret")).toBe(false);
  });

  it("rejects malformed client IDs instead of pretending to authorize", () => {
    expect(() => normalizeClientId("   ")).toThrow(GoogleCalendarError);
    expect(() => normalizeClientId("not-a-google-client")).toThrow(
      /apps\.googleusercontent\.com/,
    );
    expect(normalizeClientId(" 123-abc.apps.googleusercontent.com ")).toBe(
      "123-abc.apps.googleusercontent.com",
    );
  });

  it("parses callback URLs and popup messages", () => {
    expect(
      parseAuthCallback(
        "https://app.example.com/oauth-callback.html?code=abc&state=xyz",
      ),
    ).toEqual({ code: "abc", state: "xyz", error: null, errorDescription: null });

    expect(
      parseAuthCallback("?error=access_denied&error_description=User%20denied"),
    ).toMatchObject({ code: null, error: "access_denied", errorDescription: "User denied" });

    expect(
      parsePopupAuthMessage({
        source: "kexu-google-oauth",
        code: "code-1",
        state: "state-1",
        error: null,
        errorDescription: null,
      }),
    ).toMatchObject({ code: "code-1", state: "state-1" });
    expect(parsePopupAuthMessage({ source: "other", code: "code-1" })).toBeNull();
  });
});

describe("Google Calendar event mapping", () => {
  it("maps a course slot to an event with title, location, description and times", () => {
    const events = buildTimetableEvents(makeTimetable());
    expect(events).toHaveLength(4);

    expect(events[0]).toMatchObject({
      summary: "高等数学",
      location: "教101",
      start: { dateTime: "2026-09-07T08:00:00", timeZone: DEFAULT_TIME_ZONE },
      end: { dateTime: "2026-09-07T09:40:00", timeZone: DEFAULT_TIME_ZONE },
    });
    expect(events[0].description).toContain("教师：张老师");
    expect(events[0].description).toContain("第 1 周 · 第 1–2 节");
    expect(events[0].description).toContain("带计算器");
    expect(events[0].iCalUID).toBe("course-math:slot-math:1@classflow");
    expect(events[0].id).toMatch(/^[0-9a-v]{5,1024}$/);
  });

  it("expands odd/even weeks across the semester", () => {
    const events = buildTimetableEvents(makeTimetable());
    const math = events.filter((event) => event.summary === "高等数学");
    const english = events.filter((event) => event.summary === "大学英语");

    expect(math.map((event) => event.start.dateTime)).toEqual([
      "2026-09-07T08:00:00",
      "2026-09-21T08:00:00",
    ]);
    expect(english.map((event) => event.start.dateTime)).toEqual([
      "2026-09-09T10:00:00",
      "2026-09-16T10:00:00",
    ]);
  });

  it("honors cancelled session overrides", () => {
    const timetable = makeTimetable();
    timetable.overrides = [
      {
        id: "override-1",
        action: "cancel",
        courseId: "course-math",
        slotId: "slot-math",
        week: 1,
        createdAt: NOW,
      },
    ];
    const math = buildTimetableEvents(timetable).filter(
      (event) => event.summary === "高等数学",
    );
    expect(math).toHaveLength(1);
    expect(math[0].start.dateTime).toBe("2026-09-21T08:00:00");
  });

  it("writes the requested time zone on every event and rejects invalid zones", () => {
    const events = buildTimetableEvents(makeTimetable(), { timeZone: "America/New_York" });
    expect(
      events.every(
        (event) =>
          event.start.timeZone === "America/New_York" &&
          event.end.timeZone === "America/New_York",
      ),
    ).toBe(true);

    expect(normalizeTimeZone("")).toBe(DEFAULT_TIME_ZONE);
    expect(() => normalizeTimeZone("Mars/Olympus")).toThrow(GoogleCalendarError);
  });
});

describe("Google error response parsing", () => {
  it("turns invalid_grant into an actionable re-auth message", () => {
    const error = parseOAuthError(400, {
      error: "invalid_grant",
      error_description: "Bad Request",
    });
    expect(error).toBeInstanceOf(GoogleCalendarError);
    expect(error.reason).toBe("invalid_grant");
    expect(error.message).toContain("授权已失效");
  });

  it("keeps the Google API status, reason and message", () => {
    const error = parseGoogleApiError(403, {
      error: {
        code: 403,
        message: "Rate Limit Exceeded",
        errors: [{ reason: "rateLimitExceeded", message: "Rate Limit Exceeded" }],
      },
    });
    expect(error.status).toBe(403);
    expect(error.reason).toBe("rateLimitExceeded");
    expect(error.message).toContain("请求过于频繁");
  });

  it("falls back to an HTTP status message for unknown payloads", () => {
    expect(parseGoogleApiError(500, null).message).toContain("HTTP 500");
    expect(parseOAuthError(502, "gateway").message).toContain("HTTP 502");
  });
});

describe("Google Calendar batch sync", () => {
  it("reports successes, 409 skips and per-event failures without leaking tokens", async () => {
    const calls: RecordedCall[] = [];
    let insertIndex = 0;
    const fetchImpl: FetchLike = async (url, init) => {
      calls.push({ url, init });
      insertIndex += 1;
      if (insertIndex === 2) return new Response("", { status: 409 });
      if (insertIndex === 3) {
        return new Response(
          JSON.stringify({
            error: {
              code: 400,
              message: "Bad Request",
              errors: [{ reason: "invalid", message: "Start time is invalid." }],
            },
          }),
          { status: 400, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response(JSON.stringify({ id: `event-${insertIndex}` }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    };

    const progress: Array<[number, number]> = [];
    const result = await syncTimetableToGoogle(makeTimetable(), {
      auth: makeAuth(),
      fetchImpl,
      onProgress: (done, total) => progress.push([done, total]),
    });

    expect(result).toMatchObject({
      calendarId: "calendar-1",
      calendarName: GOOGLE_CALENDAR_NAME,
      total: 4,
      succeeded: 2,
      skipped: 1,
      failed: 1,
    });
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].summary).toBe("大学英语");
    expect(result.failures[0].reason).toContain("Start time is invalid");
    expect(progress.at(-1)).toEqual([4, 4]);

    expect(calls).toHaveLength(4);
    for (const call of calls) {
      expect(call.url.startsWith("https://www.googleapis.com/calendar/v3/calendars/")).toBe(
        true,
      );
      const headers = new Headers(call.init?.headers);
      expect(headers.get("Authorization")).toBe("Bearer access-token-123");
      expect(call.url.includes("access-token-123")).toBe(false);
      expect(call.url.includes("refresh-token-456")).toBe(false);
    }

    const body = JSON.parse(String(calls[0].init?.body)) as {
      id: string;
      start: { dateTime: string; timeZone: string };
      end: { dateTime: string; timeZone: string };
    };
    expect(body.id).toMatch(/^[0-9a-v]{5,1024}$/);
    expect(body.start).toEqual({ dateTime: "2026-09-07T08:00:00", timeZone: DEFAULT_TIME_ZONE });
    expect(body.end).toEqual({ dateTime: "2026-09-07T09:40:00", timeZone: DEFAULT_TIME_ZONE });
  });

  it("refuses to sync without a stored authorization", async () => {
    await expect(
      syncTimetableToGoogle(makeTimetable(), {
        fetchImpl: async () => new Response("", { status: 200 }),
      }),
    ).rejects.toThrow(/尚未连接 Google 日历/);
  });

  it("surfaces network failures instead of counting them as successes", async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError("Failed to fetch");
    };
    await expect(
      syncTimetableToGoogle(makeTimetable(), { auth: makeAuth(), fetchImpl }),
    ).rejects.toThrow(/无法连接 Google 服务/);
  });
});