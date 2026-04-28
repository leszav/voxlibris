import type { StudioSessionPhase } from "@/lib/studio-session-phase";
import {
  StudioEndConfirmDialog,
  StudioSummaryDialog,
} from "@/components/studio/StudioSessionDialogs";

export interface StudioSessionOverlaysProps {
  phase: StudioSessionPhase;
  sessionId?: string | null;
  elapsedTime: number;
  listenerCount: number;
  onCancelEnd: () => void;
  onConfirmEnd: () => void;
  onCloseSummary: () => void;
}

export function StudioSessionOverlays({
  phase,
  sessionId,
  elapsedTime,
  listenerCount,
  onCancelEnd,
  onConfirmEnd,
  onCloseSummary,
}: Readonly<StudioSessionOverlaysProps>) {
  return (
    <>
      <StudioEndConfirmDialog
        open={phase === "ending"}
        onCancel={onCancelEnd}
        onConfirm={onConfirmEnd}
      />

      <StudioSummaryDialog
        open={phase === "summary"}
        sessionId={sessionId}
        elapsedTime={elapsedTime}
        listenerCount={listenerCount}
        onClose={onCloseSummary}
      />
    </>
  );
}
