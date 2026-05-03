export const STUDIO_AUDIO_CONSTRAINTS: MediaTrackConstraints = {
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
  sampleRate: 48000,
  channelCount: 1,
};

export function getStudioAudioMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];

  for (const type of candidates) {
    if (MediaRecorder.isTypeSupported(type)) {
      return type;
    }
  }

  return '';
}

export async function requestStudioMicrophoneStream(): Promise<MediaStream> {
  return navigator.mediaDevices.getUserMedia({
    audio: STUDIO_AUDIO_CONSTRAINTS,
    video: false,
  });
}

export function getStudioMicrophoneErrorMessage(error: unknown): string {
  if (error instanceof Error && error.name === 'NotAllowedError') {
    return 'Доступ к микрофону запрещён. Разрешите его в настройках браузера.';
  }

  if (error instanceof Error) {
    return `Ошибка доступа к микрофону: ${error.message}`;
  }

  return 'Ошибка доступа к микрофону: Неизвестная ошибка доступа к устройству.';
}
