import path from 'node:path';

const DEFAULT_STUDIO_RECORDINGS_DIR = path.resolve(process.cwd(), 'uploads', 'recordings');

export function getStudioRecordingsDir(): string {
  return process.env.STUDIO_RECORDINGS_DIR || DEFAULT_STUDIO_RECORDINGS_DIR;
}

export function createStudioRecordingFilePath(sessionId: string, recordedAt = new Date()): {
  fileName: string;
  filePath: string;
} {
  const _timestamp = recordedAt.toISOString().replaceAll(':', '-').replaceAll('.', '-');
  const fileName = `${sessionId}.mp3`;
  return {
    fileName,
    filePath: path.join(getStudioRecordingsDir(), fileName),
  };
}
