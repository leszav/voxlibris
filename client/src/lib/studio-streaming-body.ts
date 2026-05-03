export interface CreateStudioStreamingBodyResult {
  body: ReadableStream<Uint8Array>;
}

export function createStudioStreamingBody(
  onControllerChange: (controller: ReadableStreamDefaultController<Uint8Array> | null) => void,
): CreateStudioStreamingBodyResult {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      onControllerChange(controller);
    },
    cancel() {
      onControllerChange(null);
    },
  });

  return { body };
}
