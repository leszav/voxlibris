import type { ReactNode } from "react";
import type { NetworkQuality } from "@/components/studio/LiveTopBar";
import { ControlBar } from "@/components/studio/ControlBar";
import { MicrophoneCheckModal } from "@/components/studio/microphone-check-modal";
import { StudioSessionOverlays } from "@/components/studio/StudioSessionOverlays";
import { StudioRuntimeMicrophoneWarning } from "@/components/studio/StudioRuntimeMicrophoneWarning";
import { StudioPrepSurface } from "@/components/studio/StudioPrepSurface";
import {
  resolveEmbeddedStudioPrepBarOpen,
  resolveStudioMicCheckModalOpen,
} from "@/lib/studio-prep-view";
import type { StudioSessionPhase } from "@/lib/studio-session-phase";

interface EmbeddedClubStudioShellProps {
  isOpen: boolean;
  state: "prep" | "live" | "paused";
  sessionId?: string | null;
  bookTitle: string;
  chapterTitle: string;
  networkQuality: NetworkQuality;
  elapsedTime: number;
  listenerCount: number;
  micMuted: boolean;
  micLevel: number;
  micBars: ReadonlyArray<number>;
  sessionConnected: boolean;
  streamStartError: string | null;
  micCheckPassed: boolean;
  showMicCheck: boolean;
  microphoneAvailable: boolean;
  microphoneLoading: boolean;
  microphoneError: string | null;
  runtimeMicrophoneWarning: string | null;
  prepStatusText: string;
  compactStartButtonLabel: string;
  startDisabled: boolean;
  onBookmark: () => void;
  onTextSettings: () => void;
  onMicToggle: () => void;
  onPause: () => void;
  onResume: () => void;
  onRequestEnd: () => void;
  onConfirmEnd: () => void;
  onCancelEnd: () => void;
  phase: StudioSessionPhase;
  onCloseSummary: () => void;
  onMicCheckComplete: () => void;
  onMicCheckSkip: () => void;
  onRetryDetection: () => void;
  onStartBroadcast: () => void;
  onOpenMicCheck: () => void;
  onCloseStudio: () => void;
  children: ReactNode;
}

export function EmbeddedClubStudioShell({
  isOpen,
  state,
  sessionId,
  bookTitle: _bookTitle,
  chapterTitle: _chapterTitle,
  networkQuality: _networkQuality,
  elapsedTime,
  listenerCount,
  micMuted,
  micLevel,
  micBars,
  sessionConnected,
  streamStartError,
  micCheckPassed,
  showMicCheck,
  microphoneAvailable,
  microphoneLoading,
  microphoneError,
  runtimeMicrophoneWarning,
  prepStatusText,
  compactStartButtonLabel,
  startDisabled,
  onBookmark,
  onTextSettings,
  onMicToggle,
  onPause,
  onResume,
  onRequestEnd,
  onConfirmEnd,
  onCancelEnd,
  phase,
  onCloseSummary,
  onMicCheckComplete,
  onMicCheckSkip,
  onRetryDetection,
  onStartBroadcast,
  onOpenMicCheck,
  onCloseStudio,
  children,
}: Readonly<EmbeddedClubStudioShellProps>) {
  const prepBarOpen = resolveEmbeddedStudioPrepBarOpen({
    isOpen,
    state,
  });
  const micCheckModalOpen = isOpen && resolveStudioMicCheckModalOpen({
    state,
    showMicCheck,
    micCheckPassed,
    microphoneAvailable,
    microphoneLoading,
    requireMicCheckPending: true,
  });

  return (
    <>
      {micCheckModalOpen && (
        <MicrophoneCheckModal
          microphoneAvailable={microphoneAvailable}
          microphoneLoading={microphoneLoading}
          microphoneError={microphoneError}
          onComplete={onMicCheckComplete}
          onSkip={onMicCheckSkip}
        />
      )}

      {isOpen && (
        <StudioRuntimeMicrophoneWarning
          state={state}
          runtimeMicrophoneWarning={runtimeMicrophoneWarning}
          microphoneAvailable={microphoneAvailable}
          onRetryDetection={onRetryDetection}
          onOpenMicCheck={onOpenMicCheck}
          floating={false}
        />
      )}

      <div className="flex min-h-0 flex-1 flex-col">
        {prepBarOpen && (
          <StudioPrepSurface
            variant="bar"
            statusText={prepStatusText}
            startButtonLabel={compactStartButtonLabel}
            startDisabled={startDisabled}
            streamStartError={streamStartError}
            microphoneAvailable={microphoneAvailable}
            microphoneLoading={microphoneLoading}
            onStart={onStartBroadcast}
            onOpenMicCheck={onOpenMicCheck}
            onRetryDetection={onRetryDetection}
            onClose={onCloseStudio}
          />
        )}

        {children}

        {isOpen && state !== 'prep' && (
          <div className="shrink-0 border-t border-border bg-background/95 px-3 py-2 backdrop-blur-sm pb-[calc(env(safe-area-inset-bottom,0px)+0.5rem)]">
            <ControlBar
              floating={false}
              state={state}
              isOnline={sessionConnected}
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
              onBookmark={onBookmark}
              onSettings={onTextSettings}
            />
          </div>
        )}
      </div>

      <StudioSessionOverlays
        phase={phase}
        sessionId={sessionId}
        elapsedTime={elapsedTime}
        listenerCount={listenerCount}
        onCancelEnd={onCancelEnd}
        onConfirmEnd={onConfirmEnd}
        onCloseSummary={onCloseSummary}
      />
    </>
  );
}
