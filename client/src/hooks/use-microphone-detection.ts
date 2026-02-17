// client/src/hooks/use-microphone-detection.ts

import { useEffect, useRef, useState } from 'react';

export type MicrophonePermissionStatus = 'granted' | 'denied' | 'prompt' | 'unknown';

export interface MicrophoneStatus {
  isAvailable: boolean;
  isLoading: boolean;
  error: string | null;
  permissionStatus: MicrophonePermissionStatus;
}

export function useMicrophoneDetection() {
  const [status, setStatus] = useState<MicrophoneStatus>({
    isAvailable: false,
    isLoading: true,
    error: null,
    permissionStatus: 'unknown'
  });
  const detectRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const detectMicrophone = async () => {
    try {
      setStatus(prev => ({ ...prev, isLoading: true, error: null }));

      // Проверяем, поддерживает ли браузер getUserMedia
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Ваш браузер не поддерживает доступ к микрофону');
      }

      // Проверяем разрешения
      let permissionStatus: MicrophonePermissionStatus = 'unknown';
      
      if (navigator.permissions) {
        try {
          const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
          permissionStatus = permission.state;
          if (import.meta.env.DEV) {
            console.warn('[MicDetection] Permission status:', permissionStatus);
          }
        } catch (err) {
          if (import.meta.env.DEV) {
            console.warn('[MicDetection] Cannot check permissions:', err);
          }
        }
      }

      // Если разрешение уже запрещено, не пытаемся получить доступ
      if (permissionStatus === 'denied') {
        setStatus({
          isAvailable: false,
          isLoading: false,
          error: 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.',
          permissionStatus
        });
        return;
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

      } catch (micError) {
        if (stream) {
          stream.getTracks().forEach(track => track.stop());
        }

        const error = micError as Error;
        let errorMessage = 'Не удалось получить доступ к микрофону';
        let newPermissionStatus: MicrophonePermissionStatus = permissionStatus;

        if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
          errorMessage = 'Доступ к микрофону запрещен. Разрешите доступ и обновите страницу.';
          newPermissionStatus = 'denied';
        } else if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
          errorMessage = 'Микрофон не найден. Подключите микрофон и обновите страницу.';
        } else if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
          errorMessage = 'Микрофон используется другим приложением. Закройте другие приложения.';
        } else if (error.name === 'OverconstrainedError') {
          errorMessage = 'Настройки микрофона не поддерживаются вашим устройством.';
        }

        setStatus({
          isAvailable: false,
          isLoading: false,
          error: errorMessage,
          permissionStatus: newPermissionStatus
        });

        if (import.meta.env.DEV) {
          console.error('[MicDetection] Microphone access failed:', error);
        }
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
    }
  };

  const retryDetection = () => {
    detectMicrophone();
  };

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
      detectRetryTimeoutRef.current = setTimeout(detectMicrophone, 1000); // Небольшая задержка
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
