export type StudioSessionPhase = "prep" | "live" | "paused" | "ending" | "summary";

interface ResolveStudioSessionPhaseParams {
  state: "prep" | "live" | "paused";
  showEndConfirm: boolean;
  showSummary: boolean;
}

export function resolveStudioSessionPhase({
  state,
  showEndConfirm,
  showSummary,
}: Readonly<ResolveStudioSessionPhaseParams>): StudioSessionPhase {
  if (showSummary) {
    return "summary";
  }

  if (showEndConfirm) {
    return "ending";
  }

  return state;
}
