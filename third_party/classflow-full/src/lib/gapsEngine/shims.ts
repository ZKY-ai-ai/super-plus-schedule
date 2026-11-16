// Minimal adapters for the Gapwise gap assessment engine. Gapwise models
// campus routing as a graph; 课序 only has building-to-building estimates, so
// the route object below carries the same fields with an approximate status.

export type RouteAccuracy = string;

export interface RouteResult {
  estimatedSeconds: number;
  totalDistanceMeters: number;
  outdoorDistanceMeters: number;
}

export type TransitionRoute = {
  status: "routed" | "approximate" | "same-room" | "unavailable";
  accuracy: RouteAccuracy;
  result: RouteResult | null;
  approximateSeconds: number | null;
  warnings: string[];
  message?: string;
};

export type LocationType = "physical" | "tba" | "online" | "unknown";

export interface Meeting {
  id: string;
  courseCode: string;
  startTime: number;
  endTime: number;
  buildingCode: string | null;
  room: string | null;
  locationUnknown: boolean;
  locationType?: LocationType;
}

export interface Gap {
  id: string;
  startTime: number;
  endTime: number;
  durationMinutes: number;
  previous: Meeting;
  next: Meeting;
}

export interface UserPreferences {
  transitionBufferMinutes: number;
  mode: "fastest" | "step-free" | "prefer-indoor";
  avoidStairs?: boolean;
  preferIndoor?: boolean;
}