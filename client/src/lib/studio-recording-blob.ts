export function createStudioRecordingBlob(chunks: Blob[], mimeType: string): Blob {
  return new Blob(chunks, { type: mimeType });
}
