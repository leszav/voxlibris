// client/src/hooks/use-microphone-check.ts

import { useCallback, useEffect, useRef, useState } from 'react';

export interface MicrophoneCheckResult {
  isGood: boolean;
  noiseLevel: number;
  volumeLevel: number;
  message: string;
  status: 'good' | 'acceptable' | 'needs-adjustment';
}

interface RunFullTestResult {
  result: MicrophoneCheckResult;
  audioBlob: Blob;
}

const TEST_DURATION_MS = 10_000;
const MIN_GAIN = 1;
const MAX_GAIN = 3;
const MIN_DBFS = -65;
const MAX_DBFS = -6;
const DB_EPSILON = 1e-7;

function clamp(value: number, min: number = 0, max: number = 100): number {
  return Math.max(min, Math.min(max, value));
}

function average(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(sorted.length * p)));
  return sorted[index] ?? 0;
}

function mapDbToPercent(db: number): number {
  return clamp(((db - MIN_DBFS) / (MAX_DBFS - MIN_DBFS)) * 100);
}

function mapMicError(error: unknown): string {
  if (!(error instanceof Error)) {
    return 'Неизвестная ошибка при работе с микрофоном';
  }

  if (error.name === 'NotAllowedError' || error.name === 'PermissionDeniedError') {
    return 'Доступ к микрофону запрещен. Разрешите доступ в настройках браузера.';
  }
  if (error.name === 'NotFoundError' || error.name === 'DevicesNotFoundError') {
    return 'Микрофон не найден. Подключите устройство и попробуйте снова.';
  }
  if (error.name === 'NotReadableError' || error.name === 'TrackStartError') {
    return 'Микрофон занят другим приложением. Закройте лишние приложения и повторите.';
  }
  if (error.name === 'OverconstrainedError') {
    return 'Текущие настройки микрофона не поддерживаются устройством.';
  }

  return error.message || 'Не удалось получить доступ к микрофону';
}

export function useMicrophoneCheck() {
  const [isInitializing, setIsInitializing] = useState(false);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [result, setResult] = useState<MicrophoneCheckResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [liveNoiseLevel, setLiveNoiseLevel] = useState(0);
  const [liveVolumeLevel, setLiveVolumeLevel] = useState(0);
  const [gainLevel, setGainLevel] = useState(1.2);
  const gainLevelRef = useRef(gainLevel);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const processedStreamRef = useRef<MediaStream | null>(null);

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodeRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const destinationRef = useRef<MediaStreamAudioDestinationNode | null>(null);

  const analyserRef = useRef<AnalyserNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  const recentVolumeSamplesRef = useRef<number[]>([]);
  const recordingVolumeSamplesRef = useRef<number[]>([]);
  const recordingNoiseSamplesRef = useRef<number[]>([]);
  const isRecordingRef = useRef(false);

  const applyGainLevel = useCallback((value: number) => {
    const normalized = clamp(value, MIN_GAIN, MAX_GAIN);
    if (gainNodeRef.current) {
      gainNodeRef.current.gain.value = normalized;
    }
  }, []);

  const updateGainLevel = useCallback((value: number) => {
    const normalized = clamp(value, MIN_GAIN, MAX_GAIN);
    gainLevelRef.current = normalized;
    setGainLevel(normalized);
    applyGainLevel(normalized);
  }, [applyGainLevel]);

  const cleanupMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    sourceNodeRef.current?.disconnect();
    gainNodeRef.current?.disconnect();
    analyserRef.current?.disconnect();
    destinationRef.current?.disconnect();

    sourceNodeRef.current = null;
    gainNodeRef.current = null;
    analyserRef.current = null;
    destinationRef.current = null;

    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    processedStreamRef.current = null;
    dataArrayRef.current = null;
    recentVolumeSamplesRef.current = [];
    recordingVolumeSamplesRef.current = [];
    recordingNoiseSamplesRef.current = [];
    setLiveNoiseLevel(0);
    setLiveVolumeLevel(0);
  }, []);

  const startLevelMonitoring = useCallback(() => {
    const analyser = analyserRef.current;
    const dataArray = dataArrayRef.current;

    if (!analyser || !dataArray) {
      return;
    }

    const updateLevels = () => {
      if (!analyserRef.current || !dataArrayRef.current) return;

      analyser.getByteTimeDomainData(dataArray);

      let squaresSum = 0;
      let peak = 0;
      for (const value of dataArray) {
        const centered = (value - 128) / 128;
        squaresSum += centered * centered;
        const absValue = Math.abs(centered);
        if (absValue > peak) {
          peak = absValue;
        }
      }

      const rms = Math.sqrt(squaresSum / dataArray.length);
      const rmsDb = 20 * Math.log10(Math.max(rms, DB_EPSILON));
      const peakDb = 20 * Math.log10(Math.max(peak, DB_EPSILON));
      const rmsLevel = mapDbToPercent(rmsDb);
      const peakLevel = mapDbToPercent(peakDb);
      const volumeLevel = clamp((rmsLevel * 0.72) + (peakLevel * 0.28));

      const recent = recentVolumeSamplesRef.current;
      recent.push(volumeLevel);
      if (recent.length > 180) {
        recent.splice(0, recent.length - 180);
      }

      const noiseBaseline = percentile(recent, 0.18);
      const noiseLevel = clamp(noiseBaseline * 0.9);

      setLiveVolumeLevel(volumeLevel);
      setLiveNoiseLevel(noiseLevel);

      if (isRecordingRef.current) {
        recordingVolumeSamplesRef.current.push(volumeLevel);
        recordingNoiseSamplesRef.current.push(noiseLevel);
      }

      animationFrameRef.current = requestAnimationFrame(updateLevels);
    };

    updateLevels();
  }, []);

  const initializeMicrophone = useCallback(async () => {
    setIsInitializing(true);
    setError(null);
    setResult(null);

    try {
      cleanupMonitoring();

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Ваш браузер не поддерживает доступ к микрофону');
      }

      if (!window.MediaRecorder) {
        throw new Error('Браузер не поддерживает запись аудио');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const [track] = stream.getAudioTracks();
      if (track?.applyConstraints) {
        await track.applyConstraints({
          autoGainControl: true,
          echoCancellation: true,
          noiseSuppression: true,
        }).catch(() => {
          // Не все браузеры поддерживают runtime-constraints
        });
      }

      streamRef.current = stream;

      const audioContext = new AudioContext();
      if (audioContext.state === 'suspended') {
        await audioContext.resume();
      }
      audioContextRef.current = audioContext;

      const source = audioContext.createMediaStreamSource(stream);
      const gainNode = audioContext.createGain();
      const analyser = audioContext.createAnalyser();
      const destination = audioContext.createMediaStreamDestination();

      analyser.fftSize = 2048;
      analyser.smoothingTimeConstant = 0.85;

      source.connect(gainNode);
      gainNode.connect(analyser);
      gainNode.connect(destination);

      sourceNodeRef.current = source;
      gainNodeRef.current = gainNode;
      analyserRef.current = analyser;
      destinationRef.current = destination;

      processedStreamRef.current = destination.stream;
      dataArrayRef.current = new Uint8Array(new ArrayBuffer(analyser.fftSize));

      applyGainLevel(gainLevelRef.current);

      setIsInitialized(true);
      startLevelMonitoring();

      console.log('[MicCheck] Microphone initialized');
    } catch (err) {
      const message = mapMicError(err);
      setError(message);
      setIsInitialized(false);
      throw err;
    } finally {
      setIsInitializing(false);
    }
  }, [applyGainLevel, cleanupMonitoring, startLevelMonitoring]);

  const analyzeCurrentRecording = useCallback((): MicrophoneCheckResult => {
    const volumeSamples = recordingVolumeSamplesRef.current;
    const noiseSamples = recordingNoiseSamplesRef.current;

    const volumeLevel = clamp(average(volumeSamples));
    const noiseLevel = clamp(average(noiseSamples));

    let status: MicrophoneCheckResult['status'];
    let message: string;

    if (noiseLevel > 42) {
      status = 'needs-adjustment';
      message = 'Слышно много фонового шума. Такой уровень может быть некомфортным для слушателей.';
    } else if (volumeLevel < 14) {
      status = 'needs-adjustment';
      message = 'Голос записался тихо. Увеличьте усиление микрофона или говорите ближе к устройству.';
    } else if (volumeLevel > 92) {
      status = 'needs-adjustment';
      message = 'Запись слишком громкая и может перегружаться. Уменьшите усиление или отодвиньтесь от микрофона.';
    } else if (volumeLevel >= 22 && volumeLevel <= 75 && noiseLevel < 22) {
      status = 'good';
      message = 'Звук хороший, можно начинать эфир.';
    } else {
      status = 'acceptable';
      message = 'Качество звука приемлемое. При желании можно улучшить настройки.';
    }

    return {
      isGood: status !== 'needs-adjustment',
      noiseLevel,
      volumeLevel,
      message,
      status,
    };
  }, []);

  const recordTestFragment = useCallback(async (durationMs: number): Promise<Blob> => {
    const recordingStream = processedStreamRef.current ?? streamRef.current;
    if (!recordingStream) {
      throw new Error('Microphone not initialized');
    }

    setIsRecording(true);
    isRecordingRef.current = true;
    audioChunksRef.current = [];
    recordingVolumeSamplesRef.current = [];
    recordingNoiseSamplesRef.current = [];

    const mediaRecorder = new MediaRecorder(recordingStream);
    mediaRecorderRef.current = mediaRecorder;

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        audioChunksRef.current.push(event.data);
      }
    };

    return await new Promise<Blob>((resolve, reject) => {
      mediaRecorder.onstop = () => {
        resolve(new Blob(audioChunksRef.current, { type: 'audio/webm' }));
      };

      mediaRecorder.onerror = () => {
        reject(new Error('Ошибка записи аудио'));
      };

      mediaRecorder.start();
      setTimeout(() => {
        if (mediaRecorder.state === 'recording') {
          mediaRecorder.stop();
        }
      }, durationMs);
    }).finally(() => {
      setIsRecording(false);
      isRecordingRef.current = false;
      mediaRecorderRef.current = null;
    });
  }, []);

  const runFullTest = useCallback(async (durationMs: number = TEST_DURATION_MS): Promise<RunFullTestResult> => {
    try {
      setError(null);
      setResult(null);

      if (!isInitialized) {
        await initializeMicrophone();
      }

      const audioBlob = await recordTestFragment(durationMs);
      const analysisResult = analyzeCurrentRecording();
      setResult(analysisResult);

      console.log('[MicCheck] Test completed:', analysisResult);

      return { result: analysisResult, audioBlob };
    } catch (err) {
      setError(mapMicError(err));
      throw err;
    }
  }, [analyzeCurrentRecording, initializeMicrophone, isInitialized, recordTestFragment]);

  const playRecording = useCallback(async (audioBlob: Blob) => {
    setIsPlaying(true);

    const audioUrl = URL.createObjectURL(audioBlob);
    const audio = new Audio(audioUrl);

    const cleanupAudio = () => {
      setIsPlaying(false);
      URL.revokeObjectURL(audioUrl);
    };

    audio.onended = cleanupAudio;
    audio.onerror = () => {
      cleanupAudio();
      setError('Не удалось воспроизвести тестовую запись');
    };

    try {
      await audio.play();
    } catch (err) {
      cleanupAudio();
      const message = err instanceof Error ? err.message : 'Неизвестная ошибка';
      setError(`Не удалось воспроизвести тестовую запись: ${message}`);
    }
  }, []);

  const stopTest = useCallback(() => {
    if (mediaRecorderRef.current?.state === 'recording') {
      mediaRecorderRef.current.stop();
    }

    isRecordingRef.current = false;
    cleanupMonitoring();
    setIsInitializing(false);
    setIsInitialized(false);
    setIsRecording(false);
    setIsPlaying(false);
  }, [cleanupMonitoring]);

  useEffect(() => stopTest, [stopTest]);

  return {
    isInitializing,
    isInitialized,
    isRecording,
    isPlaying,
    result,
    error,
    liveNoiseLevel,
    liveVolumeLevel,
    gainLevel,
    initializeMicrophone,
    runFullTest,
    playRecording,
    stopTest,
    setGainLevel: updateGainLevel,
    testDurationMs: TEST_DURATION_MS,
  };
}
