import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Slider } from '@/components/ui/slider';
import { Mic, CheckCircle, AlertTriangle, XCircle, Play, Square, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import {
  useMicrophoneCheck,
  type MicrophoneCheckResult,
} from '@/hooks/use-microphone-check';

interface MicrophoneCheckModalProps {
  onComplete: () => void;
  onSkip: () => void;
}

interface LevelMetricsProps {
  noiseLevel: number;
  volumeLevel: number;
}

function getHeaderToneClass(result: MicrophoneCheckResult | null): string {
  if (!result) return 'bg-amber-500/10 text-amber-500';
  if (result.status === 'good') return 'bg-emerald-500/10 text-emerald-500';
  if (result.status === 'acceptable') return 'bg-amber-500/10 text-amber-500';
  return 'bg-red-500/10 text-red-500';
}

function StatusIcon({ result, isInitializing }: Readonly<{ result: MicrophoneCheckResult | null; isInitializing: boolean }>) {
  if (isInitializing) {
    return <Loader2 className="w-8 h-8 animate-spin" />;
  }

  if (!result) {
    return <Mic className="w-8 h-8" />;
  }

  if (result.status === 'good') {
    return <CheckCircle className="w-8 h-8" />;
  }

  if (result.status === 'acceptable') {
    return <AlertTriangle className="w-8 h-8" />;
  }

  return <XCircle className="w-8 h-8" />;
}

function getNoiseLevelClass(noiseLevel: number): string {
  if (noiseLevel < 20) return 'bg-emerald-500';
  if (noiseLevel < 40) return 'bg-amber-500';
  return 'bg-red-500';
}

function getVolumeLevelClass(volumeLevel: number): string {
  if (volumeLevel >= 20 && volumeLevel <= 75) return 'bg-emerald-500';
  if (volumeLevel < 90) return 'bg-amber-500';
  return 'bg-red-500';
}

function getMetricWidth(level: number): number {
  if (level <= 0) return 0;
  return Math.max(6, Math.min(100, level));
}

function LevelMetrics({ noiseLevel, volumeLevel }: Readonly<LevelMetricsProps>) {
  const noiseWidth = getMetricWidth(noiseLevel);
  const volumeWidth = getMetricWidth(volumeLevel);

  return (
    <div className="space-y-3 mb-6">
      <div className="flex justify-between items-center p-3 bg-black/20 rounded-lg">
        <span className="text-sm text-stone-400">Уровень шума</span>
        <div className="flex items-center gap-2">
          <div className="w-28 h-2 bg-stone-700 rounded-full overflow-hidden">
            <div
              className={cn('h-full transition-[width] duration-150', getNoiseLevelClass(noiseLevel))}
              style={{ width: `${noiseWidth}%` }}
            />
          </div>
          <span className="text-sm font-medium text-white w-12 text-right">{Math.round(noiseLevel)}%</span>
        </div>
      </div>

      <div className="flex justify-between items-center p-3 bg-black/20 rounded-lg">
        <span className="text-sm text-stone-400">Громкость</span>
        <div className="flex items-center gap-2">
          <div className="w-28 h-2 bg-stone-700 rounded-full overflow-hidden">
            <div
              className={cn('h-full transition-[width] duration-150', getVolumeLevelClass(volumeLevel))}
              style={{ width: `${volumeWidth}%` }}
            />
          </div>
          <span className="text-sm font-medium text-white w-12 text-right">{Math.round(volumeLevel)}%</span>
        </div>
      </div>
    </div>
  );
}

export function MicrophoneCheckModal({ onComplete, onSkip }: Readonly<MicrophoneCheckModalProps>) {
  const [recordedAudio, setRecordedAudio] = useState<Blob | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(10);

  const {
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
    stopPlayback,
    stopTest,
    setGainLevel,
    testDurationMs,
  } = useMicrophoneCheck();

  const testDurationSeconds = Math.max(1, Math.round(testDurationMs / 1000));

  useEffect(() => {
    setSecondsLeft(testDurationSeconds);
  }, [testDurationSeconds]);

  useEffect(() => {
    initializeMicrophone().catch(() => {
      // Ошибка уже в состоянии хука
    });
  }, [initializeMicrophone]);

  useEffect(() => {
    if (!isRecording) {
      setSecondsLeft(testDurationSeconds);
      return;
    }

    setSecondsLeft(testDurationSeconds);
    const intervalId = globalThis.setInterval(() => {
      setSecondsLeft((prev) => Math.max(0, prev - 1));
    }, 1000);

    return () => globalThis.clearInterval(intervalId);
  }, [isRecording, testDurationSeconds]);

  useEffect(() => stopTest, [stopTest]);

  const handleStartTest = async () => {
    try {
      setRecordedAudio(null);
      const { audioBlob } = await runFullTest(testDurationMs);
      setRecordedAudio(audioBlob);
    } catch (err) {
      console.error('[MicCheck] Test failed:', err);
    }
  };

  const handleRetryInitialize = async () => {
    try {
      await initializeMicrophone();
    } catch (err) {
      console.error('[MicCheck] Initialization retry failed:', err);
    }
  };

  const handlePlayRecording = () => {
    if (!recordedAudio) return;
    if (isPlaying) {
      stopPlayback();
      return;
    }
    playRecording(recordedAudio).catch((err) => {
      console.error('[MicCheck] Failed to play recording:', err);
    });
  };

  const handleConfirm = () => {
    stopPlayback();
    stopTest();
    onComplete();
  };

  const activeNoiseLevel = result?.noiseLevel ?? liveNoiseLevel;
  const activeVolumeLevel = result?.volumeLevel ?? liveVolumeLevel;

  const subtitle = useMemo(() => {
    if (isInitializing) {
      return 'Инициализируем микрофон...';
    }

    if (!isInitialized && error) {
      return error;
    }

    if (result) {
      return result.message;
    }

    return 'Нажмите «Проверить микрофон», чтобы записать 10 секунд и оценить качество звука.';
  }, [error, isInitialized, isInitializing, result]);

  const showInitRetry = !isInitializing && !isInitialized;
  const showTestActions = isInitialized && !result;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#252525] p-8 rounded-2xl border border-white/10 shadow-2xl max-w-lg w-full">
        <div className="text-center mb-6">
          <div className={cn('w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4', getHeaderToneClass(result))}>
            <StatusIcon result={result} isInitializing={isInitializing} />
          </div>

          <h2 className="text-2xl font-serif font-bold text-white mb-2">Проверка микрофона</h2>
          <p className="text-stone-400 whitespace-pre-line">{subtitle}</p>
        </div>

        {(isInitialized || result) && (
          <>
            <LevelMetrics noiseLevel={activeNoiseLevel} volumeLevel={activeVolumeLevel} />

            <div className="space-y-4 mb-6 p-4 rounded-lg bg-black/20 border border-white/5">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-stone-300">Усиление микрофона</span>
                  <span className="text-amber-400">{Math.round(gainLevel * 100)}%</span>
                </div>
                <Slider
                  value={[gainLevel]}
                  onValueChange={(value) => setGainLevel(value[0] ?? gainLevel)}
                  min={1}
                  max={3}
                  step={0.1}
                  className="[&>.relative>.absolute]:bg-amber-600"
                />
              </div>
            </div>
          </>
        )}

        {recordedAudio && result && (
          <div className="mb-6 p-3 bg-black/20 rounded-lg">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-stone-400">Тестовая запись (10 сек)</span>
              <Button
                variant="outline"
                size="sm"
                onClick={handlePlayRecording}
                className="border-stone-600 text-stone-300 hover:bg-stone-800"
              >
                {isPlaying ? <Square className="w-4 h-4 mr-1" /> : <Play className="w-4 h-4 mr-1" />}
                {isPlaying ? 'Остановить' : 'Прослушать запись'}
              </Button>
            </div>
          </div>
        )}

        {showInitRetry && (
          <div className="space-y-3">
            <Button onClick={handleRetryInitialize} disabled={isInitializing} className="w-full bg-amber-600 hover:bg-amber-700">
              Повторить инициализацию
            </Button>
            <Button variant="ghost" onClick={onSkip} className="w-full text-stone-400 hover:text-stone-200">
              Пропустить проверку
            </Button>
          </div>
        )}

        {showTestActions && (
          <div className="space-y-3">
            <Button onClick={handleStartTest} disabled={isRecording || isInitializing} className="w-full bg-amber-600 hover:bg-amber-700">
              {isRecording ? `Идет запись... ${secondsLeft} сек` : 'Проверить микрофон (10 сек)'}
            </Button>            <Button variant="ghost" onClick={onSkip} className="w-full text-stone-400 hover:text-stone-200">
              Пропустить проверку
            </Button>
            <p className="text-xs text-stone-500 text-center">
              При записи говорите обычным голосом. Если звук тихий, увеличьте усиление и повторите тест.
            </p>
          </div>
        )}

        {result && (
          <div className="space-y-3">
            <Button
              variant="outline"
              onClick={handleStartTest}
              disabled={isRecording || isInitializing}
              className="w-full border-stone-600 text-stone-300 hover:bg-stone-800"
            >
              Проверить снова
            </Button>

            <Button
              onClick={handleConfirm}
              className={cn(
                'w-full',
                result.status === 'needs-adjustment' ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-600 hover:bg-emerald-700'
              )}
            >
              {result.status === 'needs-adjustment' ? 'Продолжить несмотря на рекомендацию' : 'Продолжить'}
            </Button>

            <p className="text-xs text-stone-500 text-center">
              Если автооценка ошиблась, продолжайте эфир вручную.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
