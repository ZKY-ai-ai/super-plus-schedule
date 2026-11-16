// Ported from Gapwise (https://github.com/GapwiseHQ/gapwise), MIT.
// Source: src/lib/timetable-types.ts — location and duration helpers only.
import type { LocationType, Meeting } from "./shims";

export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0 分钟";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} 分钟`;
  if (m === 0) return `${h} 小时`;
  return `${h} 小时 ${m} 分钟`;
}

export function meetingLocationType(meeting: Meeting): LocationType {
  if (meeting.locationType) return meeting.locationType;
  if (!meeting.locationUnknown && (meeting.buildingCode || meeting.room)) {
    return "physical";
  }
  return "unknown";
}