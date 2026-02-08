import { types } from 'mediasoup';

/**
 * Конфигурация mediasoup worker
 */
export const mediasoupWorkerSettings: types.WorkerSettings = {
  logLevel: 'warn',
  logTags: [
    'info',
    'ice',
    'dtls',
    'rtp',
    'srtp',
    'rtcp',
    'rtx',
    'bwe',
  ],
  rtcMinPort: 10000,
  rtcMaxPort: 20000,
};

/**
 * Конфигурация mediasoup router
 */
export const mediasoupRouterOptions = {
  mediaCodecs: [
    {
      kind: 'audio' as const,
      mimeType: 'audio/opus',
      clockRate: 48000,
      channels: 2,
      preferredPayloadType: 111,
    },
    {
      kind: 'audio' as const,
      mimeType: 'audio/PCMU',
      clockRate: 8000,
      preferredPayloadType: 0,
    },
    {
      kind: 'audio' as const,
      mimeType: 'audio/PCMA',
      clockRate: 8000,
      preferredPayloadType: 8,
    },
  ],
};

/**
 * Настройки WebRTC для аудио стриминга
 */
export const webRTCSettings = {
  // Количество работников для обработки медиа-потоков
  workerCount: 1,

  // Таймауты
  peerTimeout: 30000, // 30 секунд
  transportTimeout: 60000, // 60 секунд

  // Настройки для аудио
  audio: {
    preferredCodec: 'audio/opus',
    clockRate: 48000,
    channels: 2, // Стерео для лучшего качества
    opus: {
      ptime: 20,
      maxptime: 120,
      minptime: 3,
      maxaveragebitrate: 128000, // 128 kbps
    },
  },

  // Настройки ICE
  ice: {
    listenIps: [
      { ip: '0.0.0.0', announcedIp: undefined },
    ],
    enableUdp: true,
    enableTcp: true,
    preferUdp: true,
    preferTcp: false,
  },

  // Настройки DTLS
  dtls: {
    role: 'auto',
    fingerprints: [
      {
        algorithm: 'sha-256',
        value: '',
      },
    ],
  },
};

/**
 * Настройки для записи аудио
 */
export const recordingSettings = {
  enabled: true,
  format: 'webm',
  audioCodec: 'opus',
  sampleRate: 48000,
  channels: 2,
  bitrate: 128000,
};
