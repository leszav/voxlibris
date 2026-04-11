import { useEffect, useRef, useState } from "react";
import { Play, Square, Volume2, VolumeX } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import { useIcecastPlayer } from "@/hooks/use-icecast-player";
import type { LiveReader } from "@/hooks/use-live-readers";

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

interface ListenerOverlayProps {
  reader: LiveReader;
  /** URL обложки книги */
  coverUrl?: string | null;
  bookTitle: string;
  bookAuthor?: string;
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
  onStop,
  onStreamEnded,
}: Readonly<ListenerOverlayProps>) {
  const [volume, setVolume] = useState(0.9);

  const { status, play, pause, stop, setVolume: setPlayerVolume, toggleMute, isMuted } = useIcecastPlayer({
    streamUrl: reader.streamUrl,
    autoPlay: true,
    initialVolume: volume,
    onStatusChange: (s) => {
      if (s === 'ended' || s === 'error') {
        onStreamEnded?.();
      }
    },
  });

  const onStopRef = useRef(onStop);
  useEffect(() => { onStopRef.current = onStop; }, [onStop]);

  const handleStop = () => {
    stop();
    onStopRef.current();
  };

  const handleVolumeChange = (v: number[]) => {
    const val = v[0] ?? 0.9;
    setVolume(val);
    setPlayerVolume(val);
  };

  const isPlaying = status === 'playing';
  const isLoading = status === 'loading' || status === 'idle';

  return (
    <div className={cn(
      "fixed bottom-24 left-1/2 -translate-x-1/2 z-40",
      "flex items-center gap-4",
      "bg-card/95 border border-border rounded-2xl shadow-2xl backdrop-blur-sm",
      "px-4 py-3 w-[min(92vw,420px)]",
      "animate-in slide-in-from-bottom-4 duration-300"
    )}>
      {/* Обложка / визуализатор */}
      <div className="relative w-12 h-12 rounded-xl overflow-hidden bg-muted shrink-0">
        {coverUrl ? (
          <img src={coverUrl} alt={bookTitle} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-amber-500/10">
            <Volume2 className="w-5 h-5 text-amber-500" />
          </div>
        )}
        {/* Пульс-индикатор live */}
        {isPlaying && (
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-emerald-500 ring-1 ring-card animate-pulse" />
        )}
      </div>

      {/* Информация */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-muted-foreground truncate">{reader.readerName} · Гл. {reader.chapter}</p>
        <p className="text-sm font-medium truncate">{bookTitle}</p>
        {bookAuthor && (
          <p className="text-xs text-muted-foreground truncate">{bookAuthor}</p>
        )}
      </div>

      {/* Управление громкостью */}
      <div className="flex items-center gap-2 shrink-0 w-24">
        <button
          type="button"
          onClick={toggleMute}
          className="text-muted-foreground hover:text-foreground transition-colors"
          title={isMuted ? "Включить звук" : "Выключить звук"}
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
        <Slider
          value={[isMuted ? 0 : volume]}
          onValueChange={handleVolumeChange}
          min={0}
          max={1}
          step={0.05}
          className="w-16"
          aria-label="Громкость"
        />
      </div>

      {/* Play/Pause */}
      <Button
        size="icon"
        variant="ghost"
        className="h-9 w-9 rounded-xl text-muted-foreground hover:text-foreground shrink-0"
        onClick={isPlaying ? pause : play}
        disabled={isLoading}
        title={isPlaying ? "Пауза" : "Воспроизвести"}
      >
        <PlayPauseIcon isLoading={isLoading} isPlaying={isPlaying} />
      </Button>

      {/* Стоп */}
      <Button
        size="icon"
        variant="destructive"
        className="h-9 w-9 rounded-xl shrink-0"
        onClick={handleStop}
        title="Завершить прослушивание"
      >
        <Square className="w-3 h-3 fill-current" />
      </Button>
    </div>
  );
}
