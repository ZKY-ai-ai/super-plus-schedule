import { timeToMinutes } from "../date";
import { resolveBuilding, type DayGap, type GapPreferences } from "../gaps";
import { assessGap } from "./upstream/assess-gap";
import type {
  GapAssessment,
  GapPreferences as UpstreamGapPreferences,
} from "./upstream/types";
import type { Gap, Meeting, TransitionRoute, UserPreferences } from "./shims";

function meeting(
  id: string,
  courseCode: string,
  location: string,
  startTime: number,
  aliases: Record<string, string>,
): Meeting {
  const building = resolveBuilding(location, aliases);
  return {
    id,
    courseCode,
    startTime,
    endTime: startTime,
    buildingCode: building || null,
    room: location || null,
    locationUnknown: !location.trim(),
  };
}

function routeOf(gap: DayGap): TransitionRoute {
  const sameBuilding = gap.fromLocation.trim() && gap.toLocation.trim() && gap.walkMinutes === 0;
  if (sameBuilding) {
    return {
      status: "same-room",
      accuracy: "同楼栋",
      result: { estimatedSeconds: 0, totalDistanceMeters: 0, outdoorDistanceMeters: 0 },
      approximateSeconds: null,
      warnings: [],
    };
  }
  return {
    status: "approximate",
    accuracy: gap.walkKnown ? "楼栋估算" : "保守估算",
    result: null,
    approximateSeconds: gap.walkMinutes * 60,
    warnings: gap.walkKnown ? [] : ["楼栋未确认，按保守时间估算。"],
  };
}

function upstreamPreferences(preferences: GapPreferences): UpstreamGapPreferences {
  return {
    setupMinutes: 0,
    packUpMinutes: 0,
    lunchWindowStart: timeToMinutes(preferences.lunchStart),
    lunchWindowEnd: timeToMinutes(preferences.lunchEnd),
    mealDurationMinutes: preferences.lunchMinutes,
    willingToLeaveCampus: false,
    oneWayHomeCommuteMinutes: null,
    minimumHomeStayMinutes: 30,
    homeTurnaroundMinutes: 5,
    riskTolerance: preferences.accessMode ? "low" : "medium",
  };
}

/** 把课序的 DayGap 交给 Gapwise 的评估器打分，步行分钟沿用课序现有估算。 */
export function assessDayGap(gap: DayGap, preferences: GapPreferences): GapAssessment {
  const aliases = preferences.aliases;
  const previous = meeting(
    gap.from.id,
    gap.from.course.name,
    gap.fromLocation,
    gap.start,
    aliases,
  );
  const next = meeting(gap.to.id, gap.to.course.name, gap.toLocation, gap.end, aliases);
  const upstreamGap: Gap = {
    id: gap.id,
    startTime: gap.start,
    endTime: gap.end,
    durationMinutes: gap.minutes,
    previous,
    next,
  };
  const routePreferences: UserPreferences = {
    transitionBufferMinutes: preferences.bufferMinutes,
    mode: preferences.accessMode ? "step-free" : "fastest",
    avoidStairs: preferences.accessMode,
    preferIndoor: preferences.accessMode,
  };
  return assessGap({
    gap: upstreamGap,
    route: routeOf(gap),
    routePreferences,
    gapPreferences: upstreamPreferences(preferences),
  });
}

export type { GapAction, GapAssessment, GapRecommendation } from "./upstream/types";