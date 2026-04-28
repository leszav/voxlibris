import { MicrophoneCheckModal } from "@/components/studio/microphone-check-modal";
import { StudioRuntimeMicrophoneWarning } from "@/components/studio/StudioRuntimeMicrophoneWarning";
import { resolveStudioMicCheckModalOpen } from "@/lib/studio-prep-view";

interface StudioStageOverlaysProps {
  state: 'prep' | 'live' | 'paused';
  showMicCheck: boolean;
  microphoneAvailable: boolean;
  microphoneLoading: boolean;
  microphoneError: string | null;
  runtimeMicrophoneWarning: string | null;
  onMicCheckComplete: () => void;
  onMicCheckSkip: () => void;
  onRetryDetection: () => void;
  onOpenMicCheck: () => void;
}

export function StudioStageOverlays({
  state,
  showMicCheck,
  microphoneAvailable,
  microphoneLoading,
  microphoneError,
  runtimeMicrophoneWarning,
  onMicCheckComplete,
  onMicCheckSkip,
  onRetryDetection,
  onOpenMicCheck,
}: Readonly<StudioStageOverlaysProps>) {
  const micCheckModalOpen = resolveStudioMicCheckModalOpen({
    state,
    showMicCheck,
    microphoneAvailable,
    microphoneLoading,
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

      <StudioRuntimeMicrophoneWarning
        state={state}
        runtimeMicrophoneWarning={runtimeMicrophoneWarning}
        microphoneAvailable={microphoneAvailable}
        onRetryDetection={onRetryDetection}
        onOpenMicCheck={onOpenMicCheck}
      />
    </>
  );
}
