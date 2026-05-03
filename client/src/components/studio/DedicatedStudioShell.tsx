import type { ReactNode } from "react";
import { LiveShell } from "@/components/studio/LiveShell";
import { LiveTopBar, type NetworkQuality } from "@/components/studio/LiveTopBar";
import { ControlBar } from "@/components/studio/ControlBar";
import { StudioSessionOverlays } from "@/components/studio/StudioSessionOverlays";
import { StudioPrepSurface } from "@/components/studio/StudioPrepSurface";
import type { StudioSessionPhase } from "@/lib/studio-session-phase";

interface DedicatedStudioShellProps {
  state: "prep" | "live" | "paused";
  sessionId?: string | null;
  bookTitle: string;
  chapterTitle: string;
  networkQuality: NetworkQuality;
  showTextSettings: boolean;
  textSettingsPanel: ReactNode;
  stage: ReactNode;
  micMuted: boolean;
  onMicToggle: () => void;
  elapsedTime: number;
  listenerCount: number;
  micLevel: number;
  micBars: ReadonlyArray<number>;
  onPause: () => void;
  onResume: () => void;
  onRequestEnd: () => void;
  onConfirmEnd: () => void;
  onCancelEnd: () => void;
  phase: StudioSessionPhase;
  onCloseSummary: () => void;
  onTextSettings: () => void;
  prepModalOpen: boolean;
  prepStatusText: string;
  startButtonLabel: string;
  startDisabled: boolean;
  onStart: () => void;
  onOpenMicCheck: () => void;
  onRetryDetection: () => void;
  microphoneAvailable: boolean;
  microphoneLoading: boolean;
  onClosePrepModal: () => void;
  streamStartError: string | null;
}

export function DedicatedStudioShell({
  state,
  sessionId,
  bookTitle,
  chapterTitle,
  networkQuality,
  showTextSettings,
  textSettingsPanel,
  stage,
  micMuted,
  onMicToggle,
  elapsedTime,
  listenerCount,
  micLevel,
  micBars,
  onPause,
  onResume,
  onRequestEnd,
  onConfirmEnd,
  onCancelEnd,
  phase,
  onCloseSummary,
  onTextSettings,
  prepModalOpen,
  prepStatusText,
  startButtonLabel,
  startDisabled,
  onStart,
  onOpenMicCheck,
  onRetryDetection,
  microphoneAvailable,
  microphoneLoading,
  onClosePrepModal,
  streamStartError,
}: Readonly<DedicatedStudioShellProps>) {
  return (
    <div className="relative">
      {showTextSettings ? textSettingsPanel : null}
      <LiveShell
        topBar={
          <LiveTopBar
            bookTitle={bookTitle}
            chapterTitle={chapterTitle}
            isLive={state === "live"}
            isRecording={false}
            recordingTime={0}
            networkQuality={networkQuality}
            onBookmark={() => {}}
            onTextSettings={onTextSettings}
          />
        }
        stage={stage}
        controlBar={
          <ControlBar
            state={state}
            isOnline={state !== "prep" || networkQuality === "good" || networkQuality === "fair"}
            micMuted={micMuted}
            onMicToggle={onMicToggle}
            elapsedTime={elapsedTime}
            listenerCount={listenerCount}
            micLevel={micLevel}
            micBars={micBars}
            onPause={onPause}
            onResume={onResume}
            onEnd={onRequestEnd}
            onOpenChat={() => {}}
            onSettings={onTextSettings}
          />
        }
      />

      <StudioPrepSurface
        variant="modal"
        open={state === "prep" && prepModalOpen}
        statusText={prepStatusText}
        startButtonLabel={startButtonLabel}
        startDisabled={startDisabled}
        streamStartError={streamStartError}
        microphoneAvailable={microphoneAvailable}
        microphoneLoading={microphoneLoading}
        onStart={onStart}
        onOpenMicCheck={onOpenMicCheck}
        onRetryDetection={onRetryDetection}
        onClose={onClosePrepModal}
      />

      <StudioSessionOverlays
        phase={phase}
        sessionId={sessionId}
        elapsedTime={elapsedTime}
        listenerCount={listenerCount}
        onCancelEnd={onCancelEnd}
        onConfirmEnd={onConfirmEnd}
        onCloseSummary={onCloseSummary}
      />
    </div>
  );
}
