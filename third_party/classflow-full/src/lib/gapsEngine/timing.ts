// Ported from Gapwise (https://github.com/GapwiseHQ/gapwise), MIT.
// Source: src/lib/gaps.ts — timing helpers only; campus graph handling removed.
import type { Gap } from "./shims";

export const USABLE_BUFFER_MINUTES = 15;

export type GapTiming = {
  totalMinutes: number;
  travelSeconds: number | null;
  bufferMinutes: number;
  usableMinutes: number;
  leaveByMinutes: number;
  arrivalMinutes: number | null;
  fallback: boolean;
};

export function calculateLeaveBy(
  nextStartMinutes: number,
  routeSeconds: number,
  bufferMinutes: number,
): number {
  return Math.max(0, nextStartMinutes - Math.ceil(routeSeconds / 60) - bufferMinutes);
}

export function calculateGapTiming(
  gap: Pick<Gap, "durationMinutes" | "endTime">,
  route: { estimatedSeconds: number } | null,
  transitionBufferMinutes: number,
): GapTiming {
  if (!route) {
    return {
      totalMinutes: gap.durationMinutes,
      travelSeconds: null,
      bufferMinutes: USABLE_BUFFER_MINUTES,
      usableMinutes: Math.max(0, gap.durationMinutes - USABLE_BUFFER_MINUTES),
      leaveByMinutes: Math.max(0, gap.endTime - USABLE_BUFFER_MINUTES),
      arrivalMinutes: null,
      fallback: true,
    };
  }
  const travelMinutes = Math.ceil(route.estimatedSeconds / 60);
  const leaveByMinutes = calculateLeaveBy(
    gap.endTime,
    route.estimatedSeconds,
    transitionBufferMinutes,
  );
  return {
    totalMinutes: gap.durationMinutes,
    travelSeconds: route.estimatedSeconds,
    bufferMinutes: transitionBufferMinutes,
    usableMinutes: Math.max(0, gap.durationMinutes - travelMinutes - transitionBufferMinutes),
    leaveByMinutes,
    arrivalMinutes: leaveByMinutes + travelMinutes,
    fallback: false,
  };
}