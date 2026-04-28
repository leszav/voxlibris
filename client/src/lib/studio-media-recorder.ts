export interface CreateStudioStreamRecorderOptions {
  stream: MediaStream;
  mimeType: string;
  onChunk: (chunk: Blob) => void;
  onError: () => void;
}

export interface CreateStudioLocalRecorderOptions {
  stream: MediaStream;
  mimeType: string;
  onChunk: (chunk: Blob) => void;
  onStop: () => void;
}

export function createStudioStreamRecorder({
  stream,
  mimeType,
  onChunk,
  onError,
}: CreateStudioStreamRecorderOptions): MediaRecorder {
  const recorder = new MediaRecorder(stream, {
    mimeType,
    audioBitsPerSecond: 64_000,
  });

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      onChunk(event.data);
    }
  };

  recorder.onerror = onError;
  return recorder;
}

export function createStudioLocalRecorder({
  stream,
  mimeType,
  onChunk,
  onStop,
}: CreateStudioLocalRecorderOptions): MediaRecorder {
  const recorder = new MediaRecorder(stream, { mimeType });

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) {
      onChunk(event.data);
    }
  };

  recorder.onstop = onStop;
  return recorder;
}
