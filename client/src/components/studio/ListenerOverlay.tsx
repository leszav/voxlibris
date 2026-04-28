import { useEffect, useRef, useState } from "react";
import { Play, LogOut, Volume2, VolumeX, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useIcecastPlayer } from "@/hooks/use-icecast-player";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { LiveReader } from "@/hooks/use-live-readers";
import type { PlayerStatus } from "@/hooks/use-icecast-player";

function PlayPauseIcon({ isLoading, isPlaying }: Readonly<{ isLoading: boolean; isPlaying: boolean }>) {
  if (isLoading) {
    return <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />;
  }
  if (isPlaying) {
    return (
      <span className="flex gap-0.5">
        <span className="w-1 h-4 bg-current rounded-sm" />
        <span className="w-1 h-4 bg-current rounded-sm" />
      </span>
    );
  }
  return <Play className="w-4 h-4 fill-current ml-px" />;
}

function getListenerStatusMeta(status: PlayerStatus, isMuted: boolean): {
  badgeText: string;
  badgeClassName: string;
  description: string;
  actionLabel: string;
  actionDisabled: boolean;
} {
  switch (status) {
    case "loading":
      return {
        badgeText: "Подключение",
        badgeClassName: "text-amber-600",
        description: "Подключаемся к эфиру и буферизуем поток.",
        actionLabel: "Подключаемся...",
        actionDisabled: true,
      };
    case "playing":
      return {
        badgeText: isMuted ? "Играет без звука" : "В эфире",
        badgeClassName: "text-emerald-600",
        description: isMuted ? "Эфир идёт, но звук у вас выключен." : "Вы слушаете прямой эфир без перебоев.",
        actionLabel: "Слушаете",
        actionDisabled: true,
      };
    case "stalled":
      return {
        badgeText: "Пауза сигнала",
        badgeClassName: "text-amber-600",
        description: "Поток временно задержался. Подождите немного или переподключитесь.",
        actionLabel: "Переподключить",
        actionDisabled: false,
      };
    case "error":
      return {
        badgeText: "Ошибка потока",
        badgeClassName: "text-destructive",
        description: "Не удалось стабильно воспроизвести эфир. Попробуйте подключиться заново.",
        actionLabel: "Подключиться снова",
        actionDisabled: false,
      };
    case "ended":
      return {
        badgeText: "Эфир завершён",
        badgeClassName: "text-muted-foreground",
        description: "Прямой эфир уже завершился.",
        actionLabel: "Эфир завершён",
        actionDisabled: true,
      };
    case "paused":
      return {
        badgeText: "Эфир на паузе",
        badgeClassName: "text-amber-600",
        description: "Чтец поставил эфир на паузу. Воспроизведение продолжится после возобновления эфира.",
        actionLabel: "На паузе",
        actionDisabled: true,
      };
    case "idle":
    default:
      return {
        badgeText: "Готов к подключению",
        badgeClassName: "text-muted-foreground",
        description: "Можно подключиться к прямому эфиру и слушать чтение в реальном времени.",
        actionLabel: "Слушать",
        actionDisabled: false,
      };
  }
}

interface ListenerOverlayProps {
  reader: LiveReader;
  /** URL обложки книги */
  coverUrl?: string | null;
  bookTitle: string;
  bookAuthor?: string;
  isPaused?: boolean;
  onStop: () => void;
  /** Вызывается когда поток внезапно оборвался */
  onStreamEnded?: () => void;
}

/**
 * Оверлей для пользователя, слушающего чтеца в прямом эфире.
 *
 * Layout: fixed снизу + blur-фон на контент ридера (через CSS-класс на родителе).
 * Содержит: обложка/аудио-плеер, имя чтеца, кнопки управления.
 */
export function ListenerOverlay({
  reader,
  coverUrl,
  bookTitle,
  bookAuthor,
  isPaused = false,
  onStop,
  onStreamEnded,
}: Readonly<ListenerOverlayProps>) {
  const [volume, setVolume] = useState(0.9);
  const [selectedRating, setSelectedRating] = useState(0);
  const [isSubmittingRating, setIsSubmittingRating] = useState(false);
  const [hasSubmittedRating, setHasSubmittedRating] = useState(false);
  const { toast } = useToast();
  const streamEndedHandledRef = useRef(false);

  const { status, error, play, stop, setVolume: setPlayerVolume, toggleMute, isMuted } = useIcecastPlayer({
    streamUrl: isPaused ? null : reader.streamUrl,
    autoPlay: true,
    initialVolume: volume,
  });

  const onStopRef = useRef(onStop);
  useEffect(() => { onStopRef.current = onStop; }, [onStop]);

  useEffect(() => {
    setSelectedRating(0);
    setIsSubmittingRating(false);
    setHasSubmittedRating(false);
    streamEndedHandledRef.current = false;
  }, [reader.sessionId]);

  useEffect(() => {
    if (status !== "ended" || streamEndedHandledRef.current) {
      return;
    }

    streamEndedHandledRef.current = true;
    const timer = globalThis.setTimeout(() => {
      onStreamEnded?.();
    }, 1200);

    return () => {
      globalThis.clearTimeout(timer);
    };
  }, [onStreamEnded, status]);

  const handleStop = () => {
    stop();
    onStopRef.current();
  };

  const handleSubmitRating = async () => {
    if (selectedRating < 1 || selectedRating > 5 || isSubmittingRating || hasSubmittedRating) {
      return;
    }

    setIsSubmittingRating(true);
    try {
      await apiRequest(`/api/sessions/${reader.sessionId}/rate`, {
        method: 'POST',
        body: JSON.stringify({ rating: selectedRating }),
      });
      setHasSubmittedRating(true);
      toast({
        title: 'Спасибо за оценку',
        description: `Вы поставили ${selectedRating} из 5`,
      });
    } catch (error) {
      toast({
        title: 'Не удалось сохранить оценку',
        description: error instanceof Error ? error.message : 'Попробуйте еще раз',
        variant: 'destructive',
      });
    } finally {
      setIsSubmittingRating(false);
    }
  };

  const handleVolumeChange = (v: number[]) => {
    const val = v[0] ?? 0.9;
    setVolume(val);
    setPlayerVolume(val);
  };

  const effectiveStatus: PlayerStatus = isPaused ? "paused" : status;
  const isPlaying = effectiveStatus === 'playing';
  const isLoading = status === 'loading';
  const showRecoveryActions = effectiveStatus === "stalled" || effectiveStatus === "error";
  const statusMeta = getListenerStatusMeta(effectiveStatus, isMuted);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-6">
      <div className="absolute inset-0 bg-background/35 backdrop-blur-sm" />
      <div className={cn(
        "relative z-10 w-full max-w-md rounded-3xl border border-border bg-card/95 shadow-2xl",
        "animate-in zoom-in-95 fade-in duration-300"
      )}>
        <div className="flex flex-col gap-5 p-5 sm:p-6">
          <div className="flex items-start gap-4">
            <div className="relative h-24 w-20 overflow-hidden rounded-2xl bg-muted shadow-sm shrink-0">
              {coverUrl ? (
                <img src={coverUrl} alt={bookTitle} className="h-full w-full object-cover" />
              ) : (
                <div className="flex h-full w-full items-center justify-center bg-amber-500/10">
                  <Volume2 className="h-8 w-8 text-amber-500" />
                </div>
              )}
              {isPlaying && (
                <span className="absolute right-2 top-2 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-card animate-pulse" />
              )}
            </div>

            <div className="min-w-0 flex-1 space-y-1">
              <p className={cn("text-xs font-medium uppercase tracking-[0.18em]", statusMeta.badgeClassName)}>
                {statusMeta.badgeText}
              </p>
              <h3 className="text-lg font-semibold leading-tight">{bookTitle}</h3>
              {bookAuthor && (
                <p className="text-sm text-muted-foreground">{bookAuthor}</p>
              )}
              <p className="pt-1 text-sm text-muted-foreground">
                Читает {reader.readerName} · Глава {reader.chapter}
              </p>
              <p className="text-sm text-muted-foreground">{statusMeta.description}</p>
            </div>
          </div>

          {error && status === "error" && (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
              {error}
            </div>
          )}

          {showRecoveryActions && (
            <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-4">
              <div className="space-y-1">
                <p className="text-sm font-medium text-foreground">Нужна повторная попытка подключения</p>
                <p className="text-sm text-muted-foreground">
                  Если эфир ещё идёт, попробуйте переподключиться. Если хотите выйти, можно отключиться вручную.
                </p>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1" onClick={play} disabled={isLoading}>
                  {status === "stalled" ? "Переподключить" : "Подключиться снова"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={handleStop}>
                  Закрыть плеер
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-3 rounded-2xl bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Громкость</span>
              <button
                type="button"
                onClick={toggleMute}
                className="text-muted-foreground hover:text-foreground transition-colors"
                title={isMuted ? "Включить звук" : "Выключить звук"}
              >
                {isMuted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
              </button>
            </div>
            <Slider
              value={[isMuted ? 0 : volume]}
              onValueChange={handleVolumeChange}
              min={0}
              max={1}
              step={0.05}
              aria-label="Громкость"
            />
          </div>

          <div className="space-y-3 rounded-2xl bg-muted/40 p-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Оценка чтеца</span>
              <span className="text-xs text-muted-foreground">1-5 звезд</span>
            </div>

            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((value) => {
                const active = value <= selectedRating;
                return (
                  <button
                    key={value}
                    type="button"
                    className={cn(
                      "rounded-full p-1 transition-colors",
                      hasSubmittedRating ? "cursor-default" : "hover:bg-amber-500/10",
                    )}
                    onClick={() => {
                      if (!hasSubmittedRating) {
                        setSelectedRating(value);
                      }
                    }}
                    disabled={hasSubmittedRating}
                    aria-label={`Оценка ${value} из 5`}
                    title={`${value} из 5`}
                  >
                    <Star className={cn("h-5 w-5", active ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
                  </button>
                );
              })}
            </div>

            <Button
              variant="outline"
              className="w-full rounded-2xl"
              onClick={() => void handleSubmitRating()}
              disabled={selectedRating === 0 || isSubmittingRating || hasSubmittedRating}
            >
              {hasSubmittedRating ? 'Оценка сохранена' : isSubmittingRating ? 'Сохраняем...' : 'Оценить чтеца'}
            </Button>
          </div>

          <div className="flex gap-3">
            <Button
              className="flex-1 h-11 rounded-2xl"
              variant={isPlaying ? "secondary" : "default"}
              onClick={play}
              disabled={statusMeta.actionDisabled}
              title={statusMeta.actionLabel}
            >
              <span className="mr-2">
                <PlayPauseIcon isLoading={isLoading} isPlaying={isPlaying} />
              </span>
              {statusMeta.actionLabel}
            </Button>

            <Button
              variant="destructive"
              className="h-11 rounded-2xl px-5"
              onClick={handleStop}
              title="Отключиться от эфира"
            >
              <LogOut className="mr-2 h-3.5 w-3.5" />
              Отключиться
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
