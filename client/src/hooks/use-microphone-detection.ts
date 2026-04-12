// client/src/hooks/use-microphone-detection.ts

import { useEffect, useRef, useState } from 'react';

export type MicrophonePermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

export interface MicrophoneStatus {
  isAvailable: boolean;
  isLoading: boolean;
  error: string | null;
  permissionStatus: MicrophonePermissionStatus;
}

function mapMicrophoneAccessError(error: Error, permissionStatus: MicrophonePermissionStatus): {
  message: string;
  permissionStatus: MicrophonePermissionStatus;
} {
  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    return {
      message: 'Доступ к микрофону запрещен. Разрешите доступ и обновите страницу.',
      permissionStatus: 'denied',
    };
  }
  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return {
      message: 'Микрофон не найден. Подключите микрофон и обновите страницу.',
      permissionStatus,
    };
  }
  if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    return {
      message: 'Микрофон используется другим приложением. Закройте другие приложения.',
      permissionStatus,
    };
  }
  if (error.name === 'OverconstrainedError') {
    return {
      message: 'Настройки микрофона не поддерживаются вашим устройством.',
      permissionStatus,
    };
  }

  return {
    message: 'Не удалось получить доступ к микрофону',
    permissionStatus,
  };
}

async function readMicrophonePermissionStatus(): Promise<MicrophonePermissionStatus> {
  if (!navigator.permissions) {
    return 'unknown';
  }

  try {
    const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (import.meta.env.DEV) {
      console.warn('[MicDetection] Permission status:', permission.state);
    }
    return permission.state;
  } catch (err) {
    if (import.meta.env.DEV) {
      console.warn('[MicDetection] Cannot check permissions:', err);
    }
    return 'unknown';
  }
}

export function useMicrophoneDetection() {
  const [status, setStatus] = useState<MicrophoneStatus>({
    isAvailable: false,
    isLoading: true,
    error: null,
    permissionStatus: 'unknown'
  });
  const detectRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detectMicrophone = async (): Promise<boolean> => {
    try {
      setStatus(prev => ({ ...prev, isLoading: true, error: null }));

      // Проверяем, поддерживает ли браузер getUserMedia
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Ваш браузер не поддерживает доступ к микрофону');
      }

      // Проверяем разрешения
      const permissionStatus = await readMicrophonePermissionStatus();

      // Если разрешение уже запрещено, не пытаемся получить доступ
      if (permissionStatus === 'denied') {
        setStatus({
          isAvailable: false,
          isLoading: false,
          error: 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.',
          permissionStatus
        });
        return false;
      }

      // Пытаемся получить список устройств
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      
      if (audioInputs.length === 0) {
        throw new Error('Микрофон не найден. Подключите микрофон и обновите страницу.');
      }

      if (import.meta.env.DEV) {
        console.warn('[MicDetection] Found audio inputs:', audioInputs.length);
      }

      // Пытаемся получить доступ к микрофону (но сразу останавливаем)
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ 
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        // Сразу останавливаем stream
        stream.getTracks().forEach(track => track.stop());

        setStatus({
          isAvailable: true,
          isLoading: false,
          error: null,
          permissionStatus: 'granted'
        });

        if (import.meta.env.DEV) {
          console.warn('[MicDetection] Microphone is available');
        }

        return true;

      } catch (micError) {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }

        const error = micError as Error;
        const mappedError = mapMicrophoneAccessError(error, permissionStatus);

        setStatus({
          isAvailable: false,
          isLoading: false,
          error: mappedError.message,
          permissionStatus: mappedError.permissionStatus,
        });

        if (import.meta.env.DEV) {
          console.error('[MicDetection] Microphone access failed:', error);
        }

        return false;
      }

    } catch (err) {
      const error = err as Error;
      setStatus({
        isAvailable: false,
        isLoading: false,
        error: error.message,
        permissionStatus: 'unknown'
      });

      if (import.meta.env.DEV) {
        console.error('[MicDetection] Detection failed:', error);
      }

      return false;
    }
  };

  const retryDetection = async () => detectMicrophone();

  // Автоматическое детектирование при монтировании
  useEffect(() => {
    detectMicrophone();

    // Слушаем изменения устройств
    const handleDeviceChange = () => {
      if (import.meta.env.DEV) {
        console.warn('[MicDetection] Device change detected, retrying...');
      }
      if (detectRetryTimeoutRef.current) {
        clearTimeout(detectRetryTimeoutRef.current);
      }
      detectRetryTimeoutRef.current = setTimeout(() => {
        void detectMicrophone();
      }, 1000); // Небольшая задержка
    };

    const mediaDevices = navigator.mediaDevices;
    if (mediaDevices?.addEventListener) {
      mediaDevices.addEventListener('devicechange', handleDeviceChange);
      
      return () => {
        mediaDevices.removeEventListener('devicechange', handleDeviceChange);
        if (detectRetryTimeoutRef.current) {
          clearTimeout(detectRetryTimeoutRef.current);
        }
      };
    }

    return () => {
      if (detectRetryTimeoutRef.current) {
        clearTimeout(detectRetryTimeoutRef.current);
      }
    };
  }, []);

  return {
    ...status,
    retryDetection
  };
}
