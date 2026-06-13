import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Play, LogOut, Volume2, VolumeX, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useIcecastPlayer } from "@/hooks/use-icecast-player";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import type { LiveReader } from "@/hooks/use-live-readers";
import type { PlayerStatus } from "@/hooks/use-icecast-player";
import { SessionEmotionalMapPanel } from "@/components/emotional-map";
import { reactionsApi } from "@/api/reactions";

const LIVE_REACTIONS = [
  { emoji: '😂', label: 'Смешно', className: 'from-yellow-200/80 to-amber-100/70 text-yellow-900 ring-yellow-300/60' },
  { emoji: '😢', label: 'Трогательно', className: 'from-sky-200/80 to-blue-100/70 text-sky-900 ring-sky-300/60' },
  { emoji: '🔥', label: 'Огонь', className: 'from-orange-200/80 to-red-100/70 text-orange-900 ring-orange-300/60' },
  { emoji: '😱', label: 'Вот это да', className: 'from-purple-200/80 to-fuchsia-100/70 text-purple-900 ring-purple-300/60' },
  { emoji: '😬', label: 'Напряжённо', className: 'from-slate-200/90 to-zinc-100/80 text-slate-900 ring-slate-300/60' },
  { emoji: '🤩', label: 'Восторг', className: 'from-pink-200/80 to-rose-100/70 text-pink-900 ring-pink-300/60' },
] as const;

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

function useCompactListenerActionButtons() {
  const [useCompactActionButtons, setUseCompactActionButtons] = useState(false);

  useEffect(() => {
    const currentWindow = globalThis.window;
    if (!currentWindow) {
      return;
    }

    const mql = currentWindow.matchMedia("(max-width: 360px)");
    const updateCompactActionButtons = () => {
      setUseCompactActionButtons(mql.matches);
    };

    updateCompactActionButtons();
    mql.addEventListener("change", updateCompactActionButtons);

    return () => {
      mql.removeEventListener("change", updateCompactActionButtons);
    };
  }, []);

  return useCompactActionButtons;
}

function getRatingButtonLabel(hasSubmittedRating: boolean, isSubmittingRating: boolean) {
  if (hasSubmittedRating) {
    return "Оценка сохранена";
  }

  if (isSubmittingRating) {
    return "Сохраняем...";
  }

  return "Оценить чтеца";
}

function getElapsedListeningMs(startedAt: number | null): number | undefined {
  if (!startedAt) return undefined;
  return Math.max(0, Date.now() - startedAt);
}

interface FlyingReaction {
  id: number;
  emoji: string;
  offsetX: number;
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
  const [lastReactionEmoji, setLastReactionEmoji] = useState<string | null>(null);
  const [flyingReactions, setFlyingReactions] = useState<FlyingReaction[]>([]);
  const useCompactActionButtons = useCompactListenerActionButtons();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const streamEndedHandledRef = useRef(false);
  const listeningStartedAtRef = useRef<number | null>(null);
  const flyingReactionIdRef = useRef(0);

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
    setLastReactionEmoji(null);
    setFlyingReactions([]);
    streamEndedHandledRef.current = false;
    listeningStartedAtRef.current = Date.now();
  }, [reader.sessionId]);

  const reactionMutation = useMutation({
    mutationFn: (emoji: string) => reactionsApi.addReaction({
      sessionId: reader.sessionId,
      emoji,
      type: 'positive',
      audioTimestampMs: getElapsedListeningMs(listeningStartedAtRef.current),
      chapterNumber: reader.chapter,
    }),
    onSuccess: async (_data, emoji) => {
      setLastReactionEmoji(emoji);
      const id = flyingReactionIdRef.current + 1;
      flyingReactionIdRef.current = id;
      const offsetX = Math.round((Math.random() - 0.5) * 72);
      setFlyingReactions((items) => [...items, { id, emoji, offsetX }].slice(-8));
      globalThis.setTimeout(() => {
        setLastReactionEmoji((current) => current === emoji ? null : current);
      }, 700);
      globalThis.setTimeout(() => {
        setFlyingReactions((items) => items.filter((item) => item.id !== id));
      }, 1400);
      await queryClient.invalidateQueries({ queryKey: ['reading-session', reader.sessionId, 'emotional-map'] });
    },
    onError: (error) => {
      toast({
        title: 'Не удалось отправить реакцию',
        description: error instanceof Error ? error.message : 'Попробуйте ещё раз',
        variant: 'destructive',
      });
    },
  });

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
  const ratingButtonLabel = getRatingButtonLabel(hasSubmittedRating, isSubmittingRating);

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center px-4 py-6">
      <style>{`
        @keyframes voxlibris-float-reaction {
          0% { opacity: 0; transform: translate(-50%, 10px) scale(0.72) rotate(-6deg); }
          12% { opacity: 1; transform: translate(-50%, -8px) scale(1.08) rotate(4deg); }
          100% { opacity: 0; transform: translate(calc(-50% + var(--reaction-offset-x, 0px)), -118px) scale(1.35) rotate(12deg); }
        }
      `}</style>
      <div className="absolute inset-0 bg-background/35 backdrop-blur-sm" />
      <div className={cn(
        "relative z-10 max-h-[calc(100dvh-3rem)] w-full max-w-md overflow-y-auto rounded-3xl border border-border bg-card/95 shadow-2xl",
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
              {ratingButtonLabel}
            </Button>
          </div>

          <div className="relative space-y-3 overflow-hidden rounded-2xl bg-muted/40 p-4">
            <div className="pointer-events-none absolute inset-x-0 bottom-16 z-10 flex justify-center">
              {flyingReactions.map((reaction) => (
                <span
                  key={reaction.id}
                  className="absolute text-4xl drop-shadow-lg"
                  style={{
                    '--reaction-offset-x': `${reaction.offsetX}px`,
                    animation: 'voxlibris-float-reaction 1.35s ease-out forwards',
                  } as CSSProperties}
                  aria-hidden="true"
                >
                  {reaction.emoji}
                </span>
              ))}
            </div>

            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-muted-foreground">Реакция на эфир</span>
              <span className="text-xs text-muted-foreground">с таймкодом</span>
            </div>

            <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
              {LIVE_REACTIONS.map((reaction) => (
                <button
                  key={reaction.emoji}
                  type="button"
                  className={cn(
                    'group relative flex min-h-12 items-center justify-center overflow-hidden rounded-2xl border bg-gradient-to-br px-2 py-2 shadow-sm ring-1 transition-all duration-200 ease-out sm:min-h-14 sm:py-3',
                    'hover:-translate-y-0.5 hover:scale-[1.04] hover:shadow-md active:translate-y-0 active:scale-95',
                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2',
                    'disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:scale-100 disabled:hover:shadow-sm',
                    reaction.className,
                    lastReactionEmoji === reaction.emoji && 'scale-105 shadow-lg animate-pulse',
                  )}
                  onClick={() => reactionMutation.mutate(reaction.emoji)}
                  disabled={!isPlaying || reactionMutation.isPending}
                  aria-label={`Отправить реакцию: ${reaction.label}`}
                  title={isPlaying ? reaction.label : 'Реакции доступны во время воспроизведения эфира'}
                >
                  <span className="block text-[1.7rem] leading-none transition-transform duration-200 group-hover:scale-110 sm:text-3xl">
                    {reaction.emoji}
                  </span>
                </button>
              ))}
            </div>

            <p className="text-xs text-muted-foreground">
              Реакция попадёт на эмоциональную карту в текущий момент прослушивания.
            </p>
          </div>

          <SessionEmotionalMapPanel sessionId={reader.sessionId} />

          <div className="flex gap-3">
            <Button
              className={cn(
                "h-11 rounded-2xl min-w-0",
                useCompactActionButtons ? "flex-1 px-0" : "flex-1",
              )}
              variant={isPlaying ? "secondary" : "default"}
              onClick={play}
              disabled={statusMeta.actionDisabled}
              title={statusMeta.actionLabel}
              aria-label={statusMeta.actionLabel}
            >
              <span className={cn(!useCompactActionButtons && "mr-2")}>
                <PlayPauseIcon isLoading={isLoading} isPlaying={isPlaying} />
              </span>
              {useCompactActionButtons ? (
                <span className="sr-only">{statusMeta.actionLabel}</span>
              ) : (
                statusMeta.actionLabel
              )}
            </Button>

            <Button
              variant="destructive"
              className={cn(
                "h-11 rounded-2xl min-w-0",
                useCompactActionButtons ? "flex-1 px-0" : "px-5",
              )}
              onClick={handleStop}
              title="Отключиться от эфира"
              aria-label="Отключиться от эфира"
            >
              <LogOut className={cn("h-3.5 w-3.5", !useCompactActionButtons && "mr-2")} />
              {useCompactActionButtons ? (
                <span className="sr-only">Отключиться</span>
              ) : (
                "Отключиться"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
