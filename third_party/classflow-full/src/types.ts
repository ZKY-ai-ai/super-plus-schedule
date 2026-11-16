export const COURSE_TONES = [
  { id: "clay", label: "陶土", hex: "#c5634b" },
  { id: "marigold", label: "麦黄", hex: "#c49334" },
  { id: "olive", label: "橄榄", hex: "#718a4b" },
  { id: "teal", label: "青绿", hex: "#3c847b" },
  { id: "sky", label: "远山", hex: "#557aa8" },
  { id: "plum", label: "梅紫", hex: "#8b6386" },
  { id: "rose", label: "胭脂", hex: "#b26478" },
  { id: "slate", label: "石板", hex: "#66767c" },
] as const;

export type ToneId = (typeof COURSE_TONES)[number]["id"];

export function toneColor(tone: ToneId): string {
  return COURSE_TONES.find((item) => item.id === tone)?.hex ?? COURSE_TONES[0].hex;
}

export type WeekPattern = "all" | "odd" | "even";

export interface Period {
  index: number;
  start: string;
  end: string;
}

export interface CourseSlot {
  id: string;
  day: number;
  start: number;
  end: number;
  weekStart: number;
  weekEnd: number;
  pattern: WeekPattern;
  /** Explicit week numbers. When present, these take precedence over range + pattern. */
  weeks?: number[];
}

export type SessionOverrideAction = "cancel" | "move" | "hide";

/** A change that applies to one occurrence instead of the whole course rule. */
export interface SessionOverride {
  id: string;
  action: SessionOverrideAction;
  courseId: string;
  /** Empty for "hide" overrides, which cover every slot of the course. */
  slotId: string;
  /** The original teaching week the override applies to (hide: from-week). */
  week: number;
  toDay?: number;
  toStart?: number;
  toEnd?: number;
  createdAt: string;
}

export interface Course {
  id: string;
  name: string;
  /** Short display name used when the alias switch is on. */
  alias?: string;
  teacher: string;
  location: string;
  tone: ToneId;
  note: string;
  slots: CourseSlot[];
  createdAt: string;
  updatedAt: string;
}

export interface Semester {
  name: string;
  startDate: string;
  totalWeeks: number;
  showWeekends: boolean;
  weekStartsOn: number;
  periods: Period[];
}

export interface PeriodProfile {
  id: string;
  name: string;
  periods: Period[];
}

export interface PeriodRule {
  id: string;
  /** Annual month-day (MM-DD) from which this profile applies. */
  from: string;
  profileId: string;
}

export type WallpaperPreset = "paper" | "sage" | "dawn" | "dusk" | "whale-night";

export interface Wallpaper {
  preset: WallpaperPreset | "custom";
  dataUrl: string;
  dim: number;
}

export interface ScheduleEvent {
  id: string;
  title: string;
  date: string;
  allDay: boolean;
  start: string;
  end: string;
  note: string;
  tone: ToneId;
  createdAt: string;
  updatedAt: string;
}

export type CalendarOverrideKind = "holiday" | "workday";

/** A single day that overrides the built-in holiday calendar for this timetable. */
export interface CalendarOverride {
  id: string;
  date: string;
  kind: CalendarOverrideKind;
  name: string;
  /** Workday only: borrow the timetable of this ISO weekday (1 = Monday). */
  borrowFrom?: number;
}

export interface Timetable {
  id: string;
  name: string;
  semester: Semester;
  periodProfileId: string | null;
  periodRules: PeriodRule[];
  courses: Course[];
  events: ScheduleEvent[];
  overrides: SessionOverride[];
  calendarOverrides: CalendarOverride[];
  wallpaper: Wallpaper;
  createdAt: string;
  updatedAt: string;
}

export interface TimetableCreateInput {
  name: string;
  semesterName: string;
  startDate: string;
  totalWeeks: number;
  showWeekends: boolean;
  weekStartsOn: number;
  periodProfileId: string;
  templateId?: string;
}

export interface ScheduleData {
  version: 2;
  activeTimetableId: string;
  timetables: Timetable[];
  periodProfiles: PeriodProfile[];
  updatedAt: string;
}

export interface Session {
  id: string;
  course: Course;
  slot: CourseSlot;
  day: number;
  start: number;
  end: number;
}

export interface LaidOutSession extends Session {
  column: number;
  columns: number;
}

export type Theme = "light" | "dark" | "whale";
export type ViewMode = "week" | "day";
export type TimetableLayout = "grid" | "list";
export type AppPage =
  | "timetable"
  | "agenda"
  | "courses"
  | "plan"
  | "notes"
  | "ai"
  | "profile";

export interface Preferences {
  theme: Theme;
  view: ViewMode;
  autoHolidays: boolean;
  layout: TimetableLayout;
  showAliases: boolean;
}

export interface NextSession {
  session: Session;
  date: Date;
  state: "ongoing" | "upcoming";
}

export interface WeekStats {
  courseCount: number;
  sessionCount: number;
  minutes: number;
  busiestDay: number | null;
  busiestCount: number;
}

export interface ImportResult {
  ok: boolean;
  message: string;
}

/** A parsed import waiting for the user to confirm or resume later. */
export interface ImportDraft {
  id: string;
  fileName: string;
  createdAt: string;
  data: ScheduleData;
  message: string;
}

/** A user-saved course set that can be applied to any timetable. */
export interface CourseTemplate {
  id: string;
  name: string;
  createdAt: string;
  courses: Course[];
  totalWeeks: number;
}
