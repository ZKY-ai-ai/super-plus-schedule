import type { Period, Session } from "../types";
import { timeToMinutes } from "./date";

/** 本地教室表：没有教务实时数据时，由用户维护楼栋、教室与座位数。 */
export interface CampusRoom {
  id: string;
  /** 教室简称，例如「101」「A203」。 */
  name: string;
  building: string;
  seats: number;
  note: string;
}

export const ROOMS_KEY = "kexu:planner:rooms:v1";

export const DEFAULT_ROOMS: CampusRoom[] = [
  { id: "room-jy1-101", name: "101", building: "教一", seats: 60, note: "多媒体" },
  { id: "room-jy1-201", name: "201", building: "教一", seats: 120, note: "阶梯教室" },
  { id: "room-jy2-101", name: "101", building: "教二", seats: 80, note: "" },
  { id: "room-jy2-305", name: "305", building: "教二", seats: 40, note: "小班研讨" },
  { id: "room-jy3-102", name: "102", building: "教三", seats: 90, note: "" },
  { id: "room-lib-201", name: "201", building: "图书馆", seats: 30, note: "自习室" },
];

function text(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function normalizeRoom(raw: unknown): CampusRoom | null {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return null;
  const object = raw as Record<string, unknown>;
  const name = text(object.name, 20);
  const building = text(object.building, 20);
  if (!name || !building) return null;
  const seatsRaw = typeof object.seats === "number" ? object.seats : Number(object.seats);
  const seats = Number.isFinite(seatsRaw) ? Math.min(999, Math.max(1, Math.round(seatsRaw))) : 40;
  const id = text(object.id, 60) || `room-${building}-${name}`.toLowerCase();
  return { id, name, building, seats, note: text(object.note, 40) };
}

export function normalizeRooms(raw: unknown): CampusRoom[] {
  if (!Array.isArray(raw)) return DEFAULT_ROOMS.map((room) => ({ ...room }));
  const seen = new Set<string>();
  const rooms: CampusRoom[] = [];
  for (const item of raw) {
    const room = normalizeRoom(item);
    if (!room || seen.has(room.id)) continue;
    seen.add(room.id);
    rooms.push(room);
    if (rooms.length >= 200) break;
  }
  return rooms;
}

export function loadRooms(): CampusRoom[] {
  try {
    const raw = localStorage.getItem(ROOMS_KEY);
    if (!raw) return DEFAULT_ROOMS.map((room) => ({ ...room }));
    return normalizeRooms(JSON.parse(raw));
  } catch {
    return DEFAULT_ROOMS.map((room) => ({ ...room }));
  }
}

export function saveRooms(rooms: CampusRoom[]): boolean {
  try {
    localStorage.setItem(ROOMS_KEY, JSON.stringify(rooms));
    return true;
  } catch {
    return false;
  }
}

export function createRoom(input: {
  name: string;
  building: string;
  seats: number;
  note?: string;
}): CampusRoom {
  const name = text(input.name, 20) || "未命名";
  const building = text(input.building, 20) || "未填楼栋";
  return {
    id: `room-${building}-${name}-${Date.now().toString(36)}`.toLowerCase(),
    name,
    building,
    seats: Math.min(999, Math.max(1, Math.round(input.seats) || 40)),
    note: text(input.note, 40),
  };
}

/** 从地点文本中提取楼栋（与空档引擎的规则保持一致）。 */
export function buildingOf(location: string): string {
  if (!location) return "";
  return (
    location
      .replace(/[（(][^）)]*[）)]/g, " ")
      .replace(/[0-9０-９]/g, " ")
      .replace(/[A-Za-z]\s*$/g, " ")
      .replace(/[·,，、/\\-]+/g, " ")
      .trim()
      .split(/\s+/)[0] ?? ""
  );
}

function compact(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

/** 判断课程地点是否指向这间教室，例如「教一 101」「教一101」。 */
export function locationMatchesRoom(location: string, room: CampusRoom): boolean {
  const place = compact(location);
  if (!place) return false;
  if (place.includes(compact(room.name)) && place.includes(compact(room.building))) return true;
  const full = compact(`${room.building}${room.name}`);
  return place.includes(full);
}

export interface RoomState {
  room: CampusRoom;
  /** 与目标节次重叠且占用该教室的课程。 */
  occupiedBy: Session[];
  free: boolean;
  freeSeats: number;
}

export interface RoomAvailability {
  day: number;
  period: number;
  rooms: RoomState[];
  totalRooms: number;
  freeRooms: number;
  totalSeats: number;
  freeSeats: number;
  /** 空座率：空闲教室座位数 / 全部座位数。 */
  emptyRate: number;
}

/**
 * 阶段 3 · F090：按楼栋与节次计算空教室、座位数与空座率。
 * 占用信息来自当前周课表；没有课表记录的教室默认空闲。
 */
export function roomAvailability(
  rooms: CampusRoom[],
  sessions: Session[],
  periods: Period[],
  day: number,
  period: number,
  building?: string,
): RoomAvailability {
  const target = periods[period - 1];
  const pool = building ? rooms.filter((room) => room.building === building) : rooms;
  const states: RoomState[] = pool.map((room) => {
    const occupiedBy = sessions.filter(
      (session) =>
        session.day === day &&
        session.start <= period &&
        session.end >= period &&
        (!target ||
          (timeToMinutes(periods[session.start - 1]?.start ?? "00:00") <
            timeToMinutes(target.end) &&
            timeToMinutes(periods[session.end - 1]?.end ?? "00:00") >
              timeToMinutes(target.start))) &&
        locationMatchesRoom(session.course.location, room),
    );
    const free = occupiedBy.length === 0;
    return { room, occupiedBy, free, freeSeats: free ? room.seats : 0 };
  });
  const totalSeats = states.reduce((total, state) => total + state.room.seats, 0);
  const freeSeats = states.reduce((total, state) => total + state.freeSeats, 0);
  return {
    day,
    period,
    rooms: [...states].sort((a, b) => Number(b.free) - Number(a.free) || b.room.seats - a.room.seats),
    totalRooms: states.length,
    freeRooms: states.filter((state) => state.free).length,
    totalSeats,
    freeSeats,
    emptyRate: totalSeats > 0 ? freeSeats / totalSeats : 0,
  };
}

export function roomBuildings(rooms: CampusRoom[]): string[] {
  return [...new Set(rooms.map((room) => room.building))];
}

/** 某个时间点（分钟）是否落在指定节次内，用于把「现在」映射到节次。 */
export function periodAt(periods: Period[], minutes: number): number {
  const hit = periods.findIndex(
    (period) => timeToMinutes(period.start) <= minutes && timeToMinutes(period.end) > minutes,
  );
  return hit >= 0 ? hit + 1 : 1;
}
