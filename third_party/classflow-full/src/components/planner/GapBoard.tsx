import { useMemo, useState } from "react";
import {
  Accessibility,
  ArrowRight,
  Building2,
  Clock3,
  Coffee,
  DoorOpen,
  Footprints,
  MapPin,
  Plus,
  Route,
  Settings2,
  Sparkles,
  Trash2,
  Utensils,
} from "lucide-react";
import type { Course, Period, Session } from "../../types";
import { toneColor } from "../../types";
import {
  DEFAULT_GAP_PREFERENCES,
  assessLunch,
  buildDayTimeline,
  checkRoundTrip,
  findDayGaps,
  knownBuildings,
  latestDeparture,
  saveGapPreferences,
  walkKey,
  type GapPreferences,
} from "../../lib/gaps";
import {
  createRoom,
  loadRooms,
  periodAt,
  roomAvailability,
  roomBuildings,
  saveRooms,
  type CampusRoom,
} from "../../lib/campus";
import {
  formatDuration,
  formatLongDate,
  minutesToTime,
  timeToMinutes,
  WEEKDAYS,
} from "../../lib/date";

interface PlannerPageProps {
  now: Date;
  week: number;
  dates: Date[];
  periods: Period[];
  sessions: Session[];
  onSelectCourse: (course: Course) => void;
  onAddCourse: () => void;
  preferences: GapPreferences;
  onChangePreferences: (preferences: GapPreferences) => void;
}

function dayLabel(day: number, date: Date | undefined): string {
  return `${WEEKDAYS[day - 1]?.label ?? ""}${date ? ` · ${date.getMonth() + 1}/${date.getDate()}` : ""}`;
}

export function GapBoard({
  now,
  week,
  dates,
  periods,
  sessions,
  onSelectCourse,
  onAddCourse,
  preferences,
  onChangePreferences,
}: PlannerPageProps) {
  const todayNumber = ((now.getDay() + 6) % 7) + 1;
  const availableDays = useMemo(() => {
    const days = new Set<number>();
    for (let day = 1; day <= 7; day += 1) {
      if (dates[day - 1]) days.add(day);
    }
    return [...days];
  }, [dates]);
  const [selectedDay, setSelectedDay] = useState<number>(todayNumber);
  const [destination, setDestination] = useState("图书馆");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const [rooms, setRooms] = useState<CampusRoom[]>(() => loadRooms());
  const [roomBuilding, setRoomBuilding] = useState("全部");
  const [roomPeriod, setRoomPeriod] = useState(() => periodAt(periods, nowMinutes));
  const [roomFormOpen, setRoomFormOpen] = useState(false);
  const [roomDraft, setRoomDraft] = useState({ name: "", building: "", seats: "40", note: "" });
  const [routeOpen, setRouteOpen] = useState(false);
  const [routeDraft, setRouteDraft] = useState({ from: "", to: "", minutes: "6" });
  const [aliasDraft, setAliasDraft] = useState({ alias: "", building: "" });

  const daySessions = useMemo(
    () =>
      sessions
        .filter((session) => session.day === selectedDay)
        .sort((a, b) => a.start - b.start || a.end - b.end),
    [sessions, selectedDay],
  );
  const gaps = useMemo(
    () => findDayGaps(daySessions, periods, preferences),
    [daySessions, periods, preferences],
  );
  const lunch = useMemo(
    () => assessLunch(daySessions, periods, preferences),
    [daySessions, periods, preferences],
  );
  const timeline = useMemo(
    () => buildDayTimeline(daySessions, periods, preferences),
    [daySessions, periods, preferences],
  );
  const freeMinutes = timeline
    .filter((entry) => entry.kind !== "class")
    .reduce((total, entry) => total + entry.minutes, 0);
  const usableMinutes = gaps.reduce((total, gap) => total + gap.usableMinutes, 0);
  const nextSession =
    selectedDay === todayNumber
      ? daySessions.find(
          (session) =>
            timeToMinutes(periods[session.start - 1]?.start ?? "00:00") > nowMinutes,
        )
      : daySessions[0];

  const availability = useMemo(
    () =>
      roomAvailability(
        rooms,
        sessions,
        periods,
        selectedDay,
        Math.min(Math.max(1, roomPeriod), Math.max(1, periods.length)),
        roomBuilding === "全部" ? undefined : roomBuilding,
      ),
    [rooms, sessions, periods, selectedDay, roomPeriod, roomBuilding],
  );
  const buildings = useMemo(
    () => [...new Set([...roomBuildings(rooms), ...knownBuildings().map((item) => item.name)])],
    [rooms],
  );

  const patchPreferences = (patch: Partial<GapPreferences>) => {
    const next = { ...preferences, ...patch };
    onChangePreferences(next);
    saveGapPreferences(next);
  };

  const updateRooms = (next: CampusRoom[]) => {
    setRooms(next);
    saveRooms(next);
  };

  const addRoom = () => {
    const room = createRoom({
      name: roomDraft.name.trim() || "101",
      building: roomDraft.building.trim() || buildings[0] || "教一",
      seats: Number(roomDraft.seats) || 40,
      note: roomDraft.note,
    });
    updateRooms([...rooms, room]);
    setRoomDraft({ name: "", building: "", seats: "40", note: "" });
    setRoomFormOpen(false);
  };

  const removeRoom = (id: string) => {
    updateRooms(rooms.filter((room) => room.id !== id));
  };

  const addWalkEdge = () => {
    const from = routeDraft.from.trim();
    const to = routeDraft.to.trim();
    if (!from || !to || from === to) return;
    const minutes = Math.min(60, Math.max(1, Math.round(Number(routeDraft.minutes) || 6)));
    patchPreferences({
      customWalks: { ...preferences.customWalks, [walkKey(from, to)]: minutes },
    });
    setRouteDraft({ from: "", to: "", minutes: "6" });
  };

  const removeWalkEdge = (key: string) => {
    const next = { ...preferences.customWalks };
    delete next[key];
    patchPreferences({ customWalks: next });
  };

  const addAlias = () => {
    const alias = aliasDraft.alias.trim();
    const building = aliasDraft.building.trim();
    if (!alias || !building) return;
    patchPreferences({ aliases: { ...preferences.aliases, [alias]: building } });
    setAliasDraft({ alias: "", building: "" });
  };

  const removeAlias = (alias: string) => {
    const next = { ...preferences.aliases };
    delete next[alias];
    patchPreferences({ aliases: next });
  };

  return (
    <div className="planner-gaps">
      <section className="planner-hero">
        <div>
          <p className="eyebrow">GAPS & NAVIGATION</p>
          <h1>课间空档</h1>
          <p className="planner-sub">
            第 {week} 周 · {formatLongDate(dates[selectedDay - 1] ?? now)} ·{" "}
            {WEEKDAYS[selectedDay - 1]?.label}
          </p>
        </div>
        <div className="day-picker" role="group" aria-label="选择星期">
          {availableDays.map((day) => (
            <button
              key={day}
              className={day === selectedDay ? "is-active" : ""}
              type="button"
              onClick={() => setSelectedDay(day)}
              aria-pressed={day === selectedDay}
            >
              <span>{WEEKDAYS[day - 1]?.short}</span>
              <small>{dates[day - 1] ? dates[day - 1].getDate() : ""}</small>
            </button>
          ))}
        </div>
      </section>

      <div className="planner-stat-row">
        <div className="planner-stat">
          <span className="planner-stat-icon">
            <Clock3 size={17} />
          </span>
          <div>
            <strong>{daySessions.length}</strong>
            <span>节课</span>
          </div>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-icon">
            <Footprints size={17} />
          </span>
          <div>
            <strong>{gaps.length}</strong>
            <span>段课间</span>
          </div>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-icon">
            <Sparkles size={17} />
          </span>
          <div>
            <strong>{formatDuration(usableMinutes)}</strong>
            <span>可自由支配</span>
          </div>
        </div>
        <div className="planner-stat">
          <span className="planner-stat-icon">
            <Utensils size={17} />
          </span>
          <div>
            <strong>
              {lunch.status === "available"
                ? formatDuration(lunch.best?.minutes ?? 0)
                : lunch.status === "short"
                  ? "偏紧"
                  : lunch.status === "none"
                    ? "没有"
                    : "已关闭"}
            </strong>
            <span>午饭空档</span>
          </div>
        </div>
      </div>

      <div className="planner-columns">
        <div className="planner-main-col">
          <section className="planner-card">
            <div className="planner-card-head">
              <div>
                <p className="eyebrow">BETWEEN CLASSES</p>
                <h2>今天的空档</h2>
              </div>
              <span className="planner-count">{gaps.length} 段</span>
            </div>

            {daySessions.length === 0 ? (
              <div className="planner-empty">
                <Coffee size={20} />
                <div>
                  <strong>这一天没有课</strong>
                  <span>整段时间都可以自己安排。</span>
                </div>
                <button className="secondary-button" type="button" onClick={onAddCourse}>
                  加一节课
                </button>
              </div>
            ) : gaps.length === 0 ? (
              <div className="planner-empty">
                <Footprints size={20} />
                <div>
                  <strong>{daySessions.length <= 1 ? "没有课间空档" : "课程首尾相接"}</strong>
                  <span>
                    {daySessions.length <= 1
                      ? "这一天只有一节课，不用赶场。"
                      : "没有完整空档，课间记得起身活动一下。"}
                  </span>
                </div>
              </div>
            ) : (
              <div className="gap-list">
                {gaps.map((gap) => {
                  const leave = latestDeparture(gap.to, periods, gap.fromLocation, preferences);
                  const roundTrip = checkRoundTrip(
                    gap.usableMinutes,
                    gap.fromLocation,
                    destination,
                    preferences,
                  );
                  return (
                    <article className={`gap-card ${gap.isLunch ? "is-lunch" : ""}`} key={gap.id}>
                      <div className="gap-card-time">
                        <strong>{minutesToTime(gap.start)}</strong>
                        <span>—</span>
                        <strong>{minutesToTime(gap.end)}</strong>
                        <em>{formatDuration(gap.minutes)}</em>
                      </div>
                      <div className="gap-card-body">
                        <div className="gap-card-title">
                          <span className="gap-dot" style={{ background: toneColor(gap.from.course.tone) }} />
                          <strong>{gap.from.course.name}</strong>
                          <ArrowRight size={13} />
                          <span className="gap-next">{gap.to.course.name}</span>
                          {gap.isLunch ? <span className="gap-badge">午饭</span> : null}
                        </div>
                        <div className="gap-meta-row">
                          <span>
                            <Footprints size={12} />
                            步行 {gap.walkMinutes} 分钟{gap.walkKnown ? "" : "（估算）"}
                          </span>
                          {preferences.accessMode ? (
                            <span className="gap-access">
                              <Accessibility size={12} />
                              无障碍 +{preferences.accessibleExtra} 分钟
                            </span>
                          ) : null}
                          <span>缓冲 {gap.bufferMinutes} 分钟</span>
                          <span className="gap-usable">可用 {gap.usableMinutes} 分钟</span>
                          <span>
                            <MapPin size={12} />
                            {gap.toLocation || "下一间教室待定"}
                          </span>
                        </div>
                        <p className="gap-leave">
                          最晚 <strong>{leave.leaveByLabel}</strong> 从
                          {gap.fromLocation ? `「${gap.fromLocation}」` : "当前位置"}出发去下一节。
                        </p>
                        {gap.usableMinutes >= 5 ? (
                          <div className="gap-suggestions">
                            {gap.suggestions.slice(0, 2).map((suggestion) => (
                              <span key={suggestion.id} title={suggestion.detail}>
                                {suggestion.label}
                              </span>
                            ))}
                          </div>
                        ) : null}
                        <div className={`gap-roundtrip ${roundTrip.feasible ? "is-ok" : "is-tight"}`}>
                          <MapPin size={12} />
                          去「{destination}」：{roundTrip.reason}
                        </div>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>

          <section className="planner-card">
            <div className="planner-card-head">
              <div>
                <p className="eyebrow">DAY REPLAY</p>
                <h2>全天时间轴</h2>
              </div>
              <span className="planner-count">
                空闲 {formatDuration(freeMinutes)}
              </span>
            </div>
            <div className="gap-timeline" aria-label="全天时间轴">
              {timeline.map((entry) => {
                const width = Math.max(4, (entry.minutes / Math.max(1, timeline.reduce((max, item) => Math.max(max, item.minutes), 0))) * 100);
                return (
                  <div className={`timeline-row is-${entry.kind}`} key={entry.id}>
                    <span className="timeline-time">{minutesToTime(entry.start)}</span>
                    <div className="timeline-track">
                      <span className="timeline-fill" style={{ width: `${Math.min(100, width)}%` }}>
                        <strong>{entry.label}</strong>
                      </span>
                    </div>
                    <span className="timeline-meta">
                      {formatDuration(entry.minutes)}
                      <small>{entry.detail}</small>
                    </span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="planner-card room-card">
            <div className="planner-card-head">
              <div>
                <p className="eyebrow">EMPTY ROOMS</p>
                <h2>空教室</h2>
              </div>
              <DoorOpen size={17} />
            </div>
            <div className="room-controls">
              <select
                value={roomBuilding}
                onChange={(event) => setRoomBuilding(event.target.value)}
                aria-label="选择楼栋"
              >
                <option value="全部">全部楼栋</option>
                {roomBuildings(rooms).map((building) => (
                  <option key={building} value={building}>
                    {building}
                  </option>
                ))}
              </select>
              <select
                value={roomPeriod}
                onChange={(event) => setRoomPeriod(Number(event.target.value))}
                aria-label="选择节次"
              >
                {periods.map((period, index) => (
                  <option key={index} value={index + 1}>
                    第 {index + 1} 节 · {period.start}
                  </option>
                ))}
              </select>
              <button
                className="small-button"
                type="button"
                onClick={() => setRoomFormOpen((open) => !open)}
              >
                <Plus size={13} />
                录入教室
              </button>
            </div>

            <div className="room-summary">
              <div>
                <strong>
                  {availability.freeRooms}/{availability.totalRooms}
                </strong>
                <span>空教室</span>
              </div>
              <div>
                <strong>{availability.freeSeats}</strong>
                <span>空座</span>
              </div>
              <div>
                <strong>{Math.round(availability.emptyRate * 100)}%</strong>
                <span>空座率</span>
              </div>
              <p>按当前周课表推算，未录入地点的课程不会占用教室。</p>
            </div>

            {roomFormOpen ? (
              <div className="room-form">
                <input
                  value={roomDraft.building}
                  onChange={(event) => setRoomDraft((draft) => ({ ...draft, building: event.target.value }))}
                  placeholder="楼栋，如 教一"
                  maxLength={20}
                  aria-label="教室楼栋"
                  list="gap-buildings"
                />
                <input
                  value={roomDraft.name}
                  onChange={(event) => setRoomDraft((draft) => ({ ...draft, name: event.target.value }))}
                  placeholder="教室号，如 101"
                  maxLength={20}
                  aria-label="教室号"
                />
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={roomDraft.seats}
                  onChange={(event) => setRoomDraft((draft) => ({ ...draft, seats: event.target.value }))}
                  aria-label="座位数"
                />
                <button className="primary-button" type="button" onClick={addRoom}>
                  添加
                </button>
              </div>
            ) : null}

            {availability.rooms.length === 0 ? (
              <p className="planner-empty-text">这个楼栋还没有录入教室，先添加几间常用的。</p>
            ) : (
              <ul className="room-list">
                {availability.rooms.map((state) => (
                  <li className={state.free ? "is-free" : "is-used"} key={state.room.id}>
                    <span className="room-state">{state.free ? "空闲" : "占用"}</span>
                    <div className="room-copy">
                      <strong>
                        {state.room.building} {state.room.name}
                        {state.room.note ? <em>{state.room.note}</em> : null}
                      </strong>
                      <span>{state.room.seats} 座 · 第 {roomPeriod} 节</span>
                    </div>
                    <span className="room-occupant">
                      {state.free
                        ? "可自习"
                        : state.occupiedBy.map((session) => session.course.name).join("、")}
                    </span>
                    <button
                      className="room-delete"
                      type="button"
                      onClick={() => removeRoom(state.room.id)}
                      aria-label={`删除教室 ${state.room.building} ${state.room.name}`}
                    >
                      <Trash2 size={12} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <aside className="planner-side-col">
          <section className={`planner-card lunch-card is-${lunch.status}`}>
            <div className="planner-card-head">
              <div>
                <p className="eyebrow">LUNCH WINDOW</p>
                <h2>午饭空档</h2>
              </div>
              <Utensils size={17} />
            </div>
            <p className="lunch-message">{lunch.message}</p>
            {lunch.windows.length > 0 ? (
              <div className="lunch-windows">
                {lunch.windows.slice(0, 3).map((window) => (
                  <div className="lunch-window" key={`${window.start}-${window.end}`}>
                    <span>
                      {minutesToTime(window.start)} – {minutesToTime(window.end)}
                    </span>
                    <strong>{window.minutes} 分钟</strong>
                    <em>{window.source === "gap" ? "课间" : "课外"}</em>
                  </div>
                ))}
              </div>
            ) : null}
            <label className="lunch-want">
              <span>至少需要</span>
              <input
                type="number"
                min={10}
                max={180}
                step={5}
                value={preferences.lunchMinutes}
                onChange={(event) =>
                  patchPreferences({ lunchMinutes: Math.max(10, Number(event.target.value) || 40) })
                }
              />
              <span>分钟</span>
            </label>
          </section>

          <section className="planner-card next-leave-card">
            <div className="planner-card-head">
              <div>
                <p className="eyebrow">LEAVE BY</p>
                <h2>下一节</h2>
              </div>
              <Clock3 size={17} />
            </div>
            {nextSession ? (
              (() => {
                const leave = latestDeparture(
                  nextSession,
                  periods,
                  daySessions.find((session) => session.id !== nextSession.id && session.end <= nextSession.start)?.course.location ?? "",
                  preferences,
                  now.getHours() * 60 + now.getMinutes(),
                );
                return (
                  <>
                    <strong className="next-leave-course">{nextSession.course.name}</strong>
                    <p className="next-leave-location">
                      <MapPin size={12} />
                      {nextSession.course.location || "地点待定"}
                    </p>
                    <div className="next-leave-time">
                      <span>最晚出发</span>
                      <strong>{leave.leaveByLabel}</strong>
                    </div>
                    <p className="next-leave-note">
                      预留步行 {leave.walkMinutes} 分钟 + 缓冲 {leave.bufferMinutes} 分钟
                      {selectedDay === todayNumber && leave.minutesLeft >= 0
                        ? `，还有 ${leave.minutesLeft} 分钟。`
                        : "。"}
                    </p>
                  </>
                );
              })()
            ) : (
              <p className="planner-empty-text">这一天没有后续课程。</p>
            )}
          </section>

          <section className="planner-card gap-settings">
            <button
              className="gap-settings-toggle"
              type="button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-expanded={settingsOpen}
            >
              <span>
                <Settings2 size={15} />
                空档参数
              </span>
              <small>{settingsOpen ? "收起" : "展开"}</small>
            </button>
            {settingsOpen ? (
              <div className="gap-settings-body">
                <label>
                  <span>收拾缓冲</span>
                  <input
                    type="number"
                    min={0}
                    max={30}
                    value={preferences.bufferMinutes}
                    onChange={(event) =>
                      patchPreferences({ bufferMinutes: Math.max(0, Number(event.target.value) || 0) })
                    }
                  />
                  <em>分钟</em>
                </label>
                <label>
                  <span>步行速度</span>
                  <input
                    type="number"
                    min={30}
                    max={150}
                    step={5}
                    value={preferences.walkSpeed}
                    onChange={(event) =>
                      patchPreferences({ walkSpeed: Math.max(30, Number(event.target.value) || 75) })
                    }
                  />
                  <em>米/分</em>
                </label>
                <label>
                  <span>最远目的地</span>
                  <input
                    value={destination}
                    maxLength={20}
                    onChange={(event) => setDestination(event.target.value)}
                  />
                </label>
                <label className="gap-settings-toggle-row">
                  <span>考虑午饭空档</span>
                  <input
                    type="checkbox"
                    checked={preferences.lunchEnabled}
                    onChange={(event) => patchPreferences({ lunchEnabled: event.target.checked })}
                  />
                </label>
                <div className="gap-settings-row">
                  <label>
                    <span>午饭开始</span>
                    <input
                      type="time"
                      value={preferences.lunchStart}
                      onChange={(event) => patchPreferences({ lunchStart: event.target.value })}
                    />
                  </label>
                  <label>
                    <span>午饭结束</span>
                    <input
                      type="time"
                      value={preferences.lunchEnd}
                      onChange={(event) => patchPreferences({ lunchEnd: event.target.value })}
                    />
                  </label>
                </div>
                <p className="gap-settings-note">
                  内置 {knownBuildings().length} 个楼栋坐标，未知楼栋默认 6 分钟。
                  {preferences.walkSpeed === DEFAULT_GAP_PREFERENCES.walkSpeed ? "" : " 步行速度已自定义。"}
                  {Object.keys(preferences.customWalks).length > 0
                    ? ` 已录入 ${Object.keys(preferences.customWalks).length} 条自定义路线。`
                    : ""}
                  {Object.keys(preferences.aliases).length > 0
                    ? ` 已配置 ${Object.keys(preferences.aliases).length} 个楼栋别名。`
                    : ""}
                  {preferences.accessMode ? " 无障碍路线已开启。" : ""}
                </p>
              </div>
            ) : null}
          </section>

          <section className={`planner-card route-card ${preferences.accessMode ? "is-access" : ""}`}>
            <div className="planner-card-head">
              <div>
                <p className="eyebrow">CAMPUS ROUTES</p>
                <h2>路网与无障碍</h2>
              </div>
              {preferences.accessMode ? <Accessibility size={17} /> : <Route size={17} />}
            </div>
            <datalist id="gap-buildings">
              {buildings.map((building) => (
                <option key={building} value={building} />
              ))}
            </datalist>
            <label className="route-toggle">
              <span>
                <Accessibility size={14} />
                无障碍路线
              </span>
              <input
                type="checkbox"
                checked={preferences.accessMode}
                onChange={(event) => patchPreferences({ accessMode: event.target.checked })}
              />
            </label>
            <p className="route-note">
              开启后每段跨楼步行额外增加时间，优先电梯、缓坡与无障碍出入口；同一楼栋内不增加。
            </p>
            <label className="route-extra">
              <span>额外预留</span>
              <input
                type="number"
                min={0}
                max={30}
                value={preferences.accessibleExtra}
                onChange={(event) =>
                  patchPreferences({ accessibleExtra: Math.max(0, Number(event.target.value) || 0) })
                }
              />
              <em>分钟</em>
            </label>
            <button
              className="route-expand"
              type="button"
              onClick={() => setRouteOpen((open) => !open)}
              aria-expanded={routeOpen}
            >
              <Building2 size={13} />
              {routeOpen ? "收起路网设置" : "编辑自定义路网"}
              <small>
                {Object.keys(preferences.customWalks).length} 条路线 ·{" "}
                {Object.keys(preferences.aliases).length} 个别名
              </small>
            </button>
            {routeOpen ? (
              <div className="route-body">
                <div className="route-form">
                  <input
                    value={routeDraft.from}
                    onChange={(event) => setRouteDraft((draft) => ({ ...draft, from: event.target.value }))}
                    placeholder="从"
                    maxLength={20}
                    aria-label="路线起点楼栋"
                    list="gap-buildings"
                  />
                  <span>→</span>
                  <input
                    value={routeDraft.to}
                    onChange={(event) => setRouteDraft((draft) => ({ ...draft, to: event.target.value }))}
                    placeholder="到"
                    maxLength={20}
                    aria-label="路线终点楼栋"
                    list="gap-buildings"
                  />
                  <input
                    type="number"
                    min={1}
                    max={60}
                    value={routeDraft.minutes}
                    onChange={(event) => setRouteDraft((draft) => ({ ...draft, minutes: event.target.value }))}
                    aria-label="步行分钟"
                  />
                  <button className="small-button" type="button" onClick={addWalkEdge} aria-label="添加路线">
                    <Plus size={12} />
                  </button>
                </div>
                <div className="route-chips">
                  {Object.entries(preferences.customWalks).length === 0 ? (
                    <span className="route-empty">还没有自定义路线，内置楼栋按坐标估算。</span>
                  ) : (
                    Object.entries(preferences.customWalks).map(([key, minutes]) => (
                      <span className="route-chip" key={key}>
                        {key.split("|").join(" ↔ ")} · {minutes} 分钟
                        <button type="button" onClick={() => removeWalkEdge(key)} aria-label={`删除路线 ${key}`}>
                          ×
                        </button>
                      </span>
                    ))
                  )}
                </div>
                <div className="route-form route-alias-form">
                  <input
                    value={aliasDraft.alias}
                    onChange={(event) => setAliasDraft((draft) => ({ ...draft, alias: event.target.value }))}
                    placeholder="别名，如 一教"
                    maxLength={20}
                    aria-label="楼栋别名"
                  />
                  <span>→</span>
                  <input
                    value={aliasDraft.building}
                    onChange={(event) => setAliasDraft((draft) => ({ ...draft, building: event.target.value }))}
                    placeholder="标准楼栋"
                    maxLength={20}
                    aria-label="标准楼栋名"
                    list="gap-buildings"
                  />
                  <button className="small-button" type="button" onClick={addAlias} aria-label="添加楼栋别名">
                    <Plus size={12} />
                  </button>
                </div>
                <div className="route-chips">
                  {Object.entries(preferences.aliases).map(([alias, building]) => (
                    <span className="route-chip is-alias" key={alias}>
                      「{alias}」→ {building}
                      <button type="button" onClick={() => removeAlias(alias)} aria-label={`删除别名 ${alias}`}>
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        </aside>
      </div>

      <section className="planner-card">
        <div className="planner-card-head">
          <div>
            <p className="eyebrow">COURSE BY COURSE</p>
            <h2>{dayLabel(selectedDay, dates[selectedDay - 1])}的课</h2>
          </div>
          <span className="planner-count">{daySessions.length} 节</span>
        </div>
        {daySessions.length === 0 ? (
          <p className="planner-empty-text">没有课程。可以在「周课表」里把这天空出来，或者放松一下。</p>
        ) : (
          <div className="planner-session-list">
            {daySessions.map((session) => (
              <button
                key={session.id}
                type="button"
                onClick={() => onSelectCourse(session.course)}
                className="planner-session-row"
              >
                <span className="planner-session-time">
                  {periods[session.start - 1]?.start}
                  <small>{periods[session.end - 1]?.end}</small>
                </span>
                <span className="gap-dot" style={{ background: toneColor(session.course.tone) }} />
                <span className="planner-session-copy">
                  <strong>{session.course.name}</strong>
                  <small>
                    {session.course.location || "地点待定"}
                    {session.course.teacher ? ` · ${session.course.teacher}` : ""}
                  </small>
                </span>
                <span className="planner-session-period">
                  第 {session.start}
                  {session.end !== session.start ? `–${session.end}` : ""} 节
                </span>
              </button>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
