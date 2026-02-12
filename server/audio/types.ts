// server/audio/types.ts

export interface AudioSession {
  id: string;              // sessionId = `club-${clubId}-read-${readerId}`
  clubId: string;
  readerId: string;
  bookId: string;
  listeners: Set<string>;  // Set<socketId>
  startedAt: Date;
  isActive: boolean;
}

export interface AudioChunk {
  sessionId: string;
  data: Buffer;            // Audio binary data
  timestamp: number;       // Для синхронизации
  sequence: number;        // Порядковый номер chunk
}

export interface AudioSessionConfig {
  bitrate: number;         // 32, 64, 128, 256 kbps
  sampleRate: number;      // 44100, 48000 Hz
  channels: number;        // 1 (mono) или 2 (stereo)
}

export interface AudioSessionStats {
  sessionId: string;
  listenerCount: number;
  bytesTransferred: number;
  duration: number;        // в секундах
  lastChunkTimestamp: number;
}
