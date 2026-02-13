import React, { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Mic, MicOff, Play, Pause, Square, Settings, Heart, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { useAuth } from "@/hooks/use-auth";
import { useReadingSession } from "@/hooks/use-reading-session";
import { useBookChapter, useCreateBookContent, useDeleteBookContent } from "@/hooks/use-books";
import { useClub } from "@/hooks/use-clubs";
import { useAudioSession } from "@/hooks/use-audio-session";
import { useRealVUMeter } from "@/hooks/use-real-vu-meter";
import { useMicrophoneDetection } from "@/hooks/use-microphone-detection";
import { MicrophoneCheckModal } from "@/components/studio/microphone-check-modal";

const MIC_BAR_SLOTS: ReadonlyArray<{ id: string; position: number; dimmed: boolean }> = [
  { id: "mic-bar-01", position: 0, dimmed: false },
  { id: "mic-bar-02", position: 1, dimmed: false },
  { id: "mic-bar-03", position: 2, dimmed: false },
  { id: "mic-bar-04", position: 3, dimmed: false },
  { id: "mic-bar-05", position: 4, dimmed: false },
  { id: "mic-bar-06", position: 5, dimmed: false },
  { id: "mic-bar-07", position: 6, dimmed: false },
  { id: "mic-bar-08", position: 7, dimmed: false },
  { id: "mic-bar-09", position: 8, dimmed: false },
  { id: "mic-bar-10", position: 9, dimmed: false },
  { id: "mic-bar-11", position: 10, dimmed: false },
  { id: "mic-bar-12", position: 11, dimmed: false },
  { id: "mic-bar-13", position: 12, dimmed: false },
  { id: "mic-bar-14", position: 13, dimmed: false },
  { id: "mic-bar-15", position: 14, dimmed: false },
  { id: "mic-bar-16", position: 15, dimmed: false },
  { id: "mic-bar-17", position: 16, dimmed: true },
  { id: "mic-bar-18", position: 17, dimmed: true },
  { id: "mic-bar-19", position: 18, dimmed: true },
  { id: "mic-bar-20", position: 19, dimmed: true },
];

const THEMES = {
  dark: { name: "Темная", text: "#FFFFFF", bg: "#121212" },
  sepia: { name: "Сепия", text: "#43434F", bg: "#FAF8F2" },
  brown: { name: "Коричневая", text: "#6C4130", bg: "#F5EFDD" },
  light: { name: "Светлая", text: "#121212", bg: "#FFFFFF" },
  green: { name: "Зеленая", text: "#B5F8B8", bg: "#0F1C10" },
} as const;

type ThemeKey = keyof typeof THEMES;

const FONTS: ReadonlyArray<{ id: string; name: string; family: string }> = [
  { id: "georgia", name: "Georgia", family: "Georgia, serif" },
  { id: "merriweather", name: "Merriweather", family: "\"Merriweather\", serif" },
  { id: "crimson", name: "Crimson Text", family: "\"Crimson Text\", serif" },
  { id: "lora", name: "Lora", family: "\"Lora\", serif" },
  { id: "pt-serif", name: "PT Serif", family: "\"PT Serif\", serif" },
  { id: "roboto-slab", name: "Roboto Slab", family: "\"Roboto Slab\", serif" },
  { id: "playfair", name: "Playfair Display", family: "\"Playfair Display\", serif" },
  { id: "libre-baskerville", name: "Libre Baskerville", family: "\"Libre Baskerville\", serif" },
];

export default function ReaderStudio() {
  const [, params] = useRoute("/studio/:clubId/:bookId/:chapter?");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { session, createSession, startReading, pauseReading, resumeReading, endReading } = useReadingSession();

  const [fontSize, setFontSize] = useState([18]);
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>('dark');
  const [currentFont, setCurrentFont] = useState(FONTS[0].id);
  const [isInitialized, setIsInitialized] = useState(false);
  const [uploadMode, setUploadMode] = useState(false);
  const [contentText, setContentText] = useState("");
  const [showPrepModal, setShowPrepModal] = useState(true);
  const [showMicCheck, setShowMicCheck] = useState(true);
  const [micCheckPassed, setMicCheckPassed] = useState(false);
  const [micMuted, setMicMuted] = useState(false);
  const [isStartingBroadcast, setIsStartingBroadcast] = useState(false);
  const [streamStartError, setStreamStartError] = useState<string | null>(null);
  const initRetryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Microphone detection
  const {
    isAvailable: microphoneAvailable,
    isLoading: microphoneLoading,
    error: microphoneError,
    retryDetection
  } = useMicrophoneDetection();

  // Audio session integration
  const {
    isStreaming,
    error: audioError,
    startReading: startAudioStreaming,
    stopReading: stopAudioStreaming,
    mediaStream,
    microphoneIssue,
    clearMicrophoneIssue,
    setMicrophoneMuted,
  } = useAudioSession({ role: 'reader', userId: user?.id });

  // Real VU meter
  const { bars: micBars } = useRealVUMeter({
    stream: mediaStream,
    isActive: !micMuted && isStreaming,
  });

  // Extract route params
  const clubId = params?.clubId || "";
  const bookId = params?.bookId || "";
  const currentChapter = Number.parseInt(params?.chapter || "1", 10);

  // Hooks for data fetching
  const { data: clubData } = useClub(clubId);
  const { data: chapterData, isLoading: chapterLoading, error: chapterError } = useBookChapter(bookId, currentChapter);
  const createContentMutation = useCreateBookContent();
  const deleteContentMutation = useDeleteBookContent();

  // Initialize session on mount
  useEffect(() => {
    const initializeSession = async () => {
      if (!user || isInitialized || !clubId || !bookId) return;

      try {
        const sessionTitle = clubData?.book
          ? `${clubData.book.title} - Глава ${currentChapter}`
          : `Глава ${currentChapter}`;

        const sessionId = await createSession({
          clubId,
          bookId,
          title: sessionTitle,
          description: 'Live чтение'
        });
        // Логируем только в режиме разработки, чтобы не засорять консоль в продакшене
        if (import.meta.env.DEV) {
          console.warn('Сессия создана:', sessionId);
        }
        setIsInitialized(true);
      } catch (error) {
        // Сообщения об ошибках выводим только в режиме разработки
        if (import.meta.env.DEV) {
          console.error('Не удалось инициализировать сессию:', error);
        }
        // Try again after a delay if session creation fails
        if (initRetryTimeoutRef.current) {
          clearTimeout(initRetryTimeoutRef.current);
        }
        initRetryTimeoutRef.current = setTimeout(() => {
          setIsInitialized(false);
        }, 3000);
      }
    };

    if (user && !isInitialized && clubId && bookId) {
      initializeSession();
    }
  }, [user, isInitialized, clubId, bookId, currentChapter, clubData]);

  useEffect(() => {
    return () => {
      if (initRetryTimeoutRef.current) {
        clearTimeout(initRetryTimeoutRef.current);
      }
    };
  }, []);

  // Check cached microphone check on mount
  useEffect(() => {
    const cachedCheck = sessionStorage.getItem('mic_check_passed');
    if (cachedCheck) {
      const timestamp = Number.parseInt(cachedCheck, 10);
      const tenMinutes = 10 * 60 * 1000;
      if (Date.now() - timestamp < tenMinutes) {
        setMicCheckPassed(true);
        setShowMicCheck(false);
      }
    }
  }, []);

  useEffect(() => {
    const savedTheme = localStorage.getItem('reader_theme');
    if (savedTheme && savedTheme in THEMES) {
      setCurrentTheme(savedTheme as ThemeKey);
    }

    const savedFont = localStorage.getItem('reader_font');
    if (savedFont && FONTS.some(font => font.id === savedFont)) {
      setCurrentFont(savedFont);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem('reader_theme', currentTheme);
  }, [currentTheme]);

  useEffect(() => {
    localStorage.setItem('reader_font', currentFont);
  }, [currentFont]);

  // Log audio errors
  useEffect(() => {
    if (audioError) {
      if (import.meta.env.DEV) {
        console.error('[Studio] Audio error:', audioError);
      }
      setStreamStartError(audioError);
    }
  }, [audioError]);

  useEffect(() => {
    setMicrophoneMuted(micMuted);
  }, [micMuted, setMicrophoneMuted]);

  // Stop audio streaming when session ends
  useEffect(() => {
    if (!session.isLive && isStreaming) {
      stopAudioStreaming();
    }
  }, [session.isLive, isStreaming, stopAudioStreaming]);

  useEffect(() => {
    if (!microphoneIssue) return;

    setMicCheckPassed(false);
    sessionStorage.removeItem('mic_check_passed');
  }, [microphoneIssue]);

  // Handlers for content management
  const handleUploadContent = async () => {
    if (!contentText.trim() || !bookId) return;

    try {
      await createContentMutation.mutateAsync({
        bookId,
        data: {
          chapterNumber: currentChapter,
          title: `Глава ${currentChapter}`,
          content: contentText,
        }
      });
      setContentText("");
      setUploadMode(false);
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Не удалось загрузить контент:", error);
      }
    }
  };

  const handleDeleteContent = async () => {
    if (!chapterData?.chapter || !bookId) return;

    try {
      await deleteContentMutation.mutateAsync({
        bookId,
        chapterNumber: currentChapter
      });
      // Navigate to previous chapter or home
      if (currentChapter > 1) {
        setLocation(`/studio/${clubId}/${bookId}/${currentChapter - 1}`);
      } else {
        setLocation(`/clubs/${clubId}`);
      }
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error("Не удалось удалить контент:", error);
      }
    }
  };

  const handleStartBroadcast = async () => {
    if (!user?.id) {
      setStreamStartError('Пользователь не авторизован');
      return;
    }

    if (!session.sessionId) {
      setStreamStartError('Сессия чтения еще не создана. Подождите несколько секунд и попробуйте снова.');
      return;
    }

    if (!microphoneAvailable) {
      setStreamStartError(microphoneError ?? 'Микрофон недоступен');
      return;
    }

    if (!micCheckPassed) {
      setStreamStartError('Сначала пройдите проверку микрофона');
      return;
    }

    setIsStartingBroadcast(true);
    setStreamStartError(null);
    clearMicrophoneIssue();

    try {
      const clubTier = clubData?.type || 'standard';

      await startAudioStreaming(
        session.sessionId,
        clubId,
        user.id,
        bookId,
        clubTier as 'free' | 'standard' | 'premium' | 'elite'
      );

      startReading();
      setMicMuted(false);
      setShowPrepModal(false);

      console.log('[Studio] Reading started successfully');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось начать эфир';
      setStreamStartError(message);
      console.error('[Studio] Failed to start reading:', error);
    } finally {
      setIsStartingBroadcast(false);
    }
  };

  // Derive state from session (без вложенных тернарных операторов)
  let state: "prep" | "live" | "paused";
  if (!session.isLive) {
    state = "prep";
  } else if (session.isPaused) {
    state = "paused";
  } else {
    state = "live";
  }
  const elapsedTime = session.elapsedTime;
  const listenerCount = session.listenerCount;
  const selectedFont = FONTS.find(font => font.id === currentFont) ?? FONTS[0];
  const runtimeMicrophoneWarning = microphoneIssue
    ?? ((state !== "prep" && !microphoneLoading && !microphoneAvailable)
      ? (microphoneError ?? 'Микрофон недоступен во время эфира')
      : null);
  const prepModalDescription = (() => {
    if (microphoneLoading) {
      return <p className="text-amber-400">Проверяем доступ к микрофону...</p>;
    }
    if (microphoneAvailable) {
      return <p className="text-stone-400">Проверьте микрофон и настройки текста перед началом. Ваши слушатели уже ждут.</p>;
    }
    return (
      <div className="space-y-2">
        <p className="text-red-400 font-medium">Микрофон недоступен</p>
        <p className="text-stone-400 text-sm">{microphoneError}</p>
        <Button
          variant="outline"
          size="sm"
          onClick={retryDetection}
          className="border-amber-600 text-amber-400 hover:bg-amber-600/10"
        >
          Повторить проверку
        </Button>
      </div>
    );
  })();
  const startBroadcastButtonLabel = (() => {
    if (!micCheckPassed) return 'Требуется проверка микрофона';
    if (isStartingBroadcast) return 'Запуск эфира...';
    if (session.isConnected) return 'Начать прямой эфир';
    return 'Подключение...';
  })();
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const renderScrollContent = () => {
    if (uploadMode) {
      return (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="font-serif font-bold text-4xl text-white">Добавить контент</h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setUploadMode(false)}
              className="border-stone-600 text-stone-400"
            >
              Отмена
            </Button>
          </div>
          <div className="space-y-4">
            <label className="block">
              <span className="text-sm font-medium text-stone-300 mb-2 block">
                Текст главы {currentChapter}
              </span>
              <textarea
                value={contentText}
                onChange={(e) => setContentText(e.target.value)}
                className="w-full h-96 bg-black/40 border border-stone-600 rounded-lg p-4 text-stone-300 resize-none"
                placeholder="Вставьте текст главы здесь..."
              />
            </label>
            <div className="flex gap-3">
              <Button
                onClick={handleUploadContent}
                disabled={!contentText.trim() || createContentMutation.isPending}
                className="bg-amber-600 hover:bg-amber-700"
              >
                {createContentMutation.isPending ? "Сохранение..." : "Сохранить"}
              </Button>
            </div>
          </div>
        </div>
      );
    }
    if (chapterLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <div className="text-stone-400">Загрузка контента...</div>
        </div>
      );
    }
    if (chapterData?.chapter) {
      const paragraphItems: Array<{ id: string; text: string }> = chapterData.chapter.content
        .split('\n')
        .map((text: string, idx: number) => ({ id: `p-${idx}`, text }));
      return (
        <div
          className="font-book leading-relaxed transition-all duration-200 rounded-xl p-6 md:p-10 shadow-inner"
          style={{
            fontSize: `${fontSize[0]}px`,
            color: THEMES[currentTheme].text,
            backgroundColor: THEMES[currentTheme].bg,
            fontFamily: selectedFont.family,
          }}
        >
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-serif font-bold text-4xl" style={{ color: THEMES[currentTheme].text }}>
              {chapterData.chapter.title}
            </h1>
            <Button
              variant="outline"
              size="sm"
              onClick={handleDeleteContent}
              disabled={deleteContentMutation.isPending}
              className="border-red-600 text-red-400 hover:bg-red-600 hover:text-white"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {deleteContentMutation.isPending ? "Удаление..." : "Удалить"}
            </Button>
          </div>
          {paragraphItems
            .filter((p) => p.text.trim())
            .map((p) => (
              <p key={p.id} className="mb-6">{p.text}</p>
            ))}
        </div>
      );
    }
    return (
      <div className="text-center py-12">
        <p className="text-stone-400 mb-4">Контент не найден</p>
        <Button onClick={() => setUploadMode(true)} className="bg-amber-600 hover:bg-amber-700">
          <Upload className="w-4 h-4 mr-2" />
          Добавить контент
        </Button>
      </div>
    );
  };

  // Error state
  if (chapterError && !uploadMode) {
    return (
      <div className="min-h-screen bg-[#1a1a1a] text-stone-200 font-sans flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-bold">Контент не найден</h2>
          <p className="text-stone-400">Глава {currentChapter} пока не добавлена</p>
          <Button onClick={() => setUploadMode(true)} className="bg-amber-600 hover:bg-amber-700">
            <Upload className="w-4 h-4 mr-2" />
            Добавить контент
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-stone-200 font-sans flex flex-col overflow-hidden">
      {/* Top Bar - Studio Status */}
      <header className="h-14 border-b border-white/10 flex items-center justify-between px-6 bg-[#1a1a1a] z-10 shrink-0">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 font-serif font-bold text-lg text-amber-500">
            <span>VoxLibris</span>
            <span className="text-xs font-sans font-normal text-stone-500 uppercase tracking-widest border border-stone-700 px-1.5 py-0.5 rounded">Студия</span>
          </div>
          <Separator orientation="vertical" className="h-6 bg-white/10" />
          <div className="text-sm text-stone-400">
            <span className="font-medium text-stone-200">Мастер и Маргарита</span>
            <div className="w-px h-4 bg-white/10" />
            Глава 1
          </div>
        </div>

        <div className="flex items-center gap-6">
          {state === "live" && (
            <div className="flex items-center gap-2 animate-pulse">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-red-500 font-bold text-sm tracking-wide">В ЭФИРЕ</span>
            </div>
          )}

          <div className="flex items-center gap-4 text-sm font-medium tabular-nums">
            <div className="flex items-center gap-2 text-stone-400">
              <UsersIcon className="w-4 h-4" />
              <span className={state === "live" ? "text-stone-200" : ""}>{listenerCount}</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="text-amber-500">
              {formatTime(elapsedTime)}
            </div>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex overflow-hidden">

        {/* Left Panel: Settings & Prep (Hidden when live/focused mode could be implemented) */}
        <aside className="w-80 border-r border-white/10 bg-[#151515] flex flex-col shrink-0">
          <div className="p-4 border-b border-white/10">
            <h3 className="font-medium text-stone-400 text-xs uppercase tracking-wider mb-4">Настройки текста</h3>
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Размер шрифта</span>
                  <span className="text-stone-500">{fontSize[0]}px</span>
                </div>
                <Slider
                  value={fontSize}
                  onValueChange={setFontSize}
                  min={14}
                  max={32}
                  step={1}
                  className="[&>.relative>.absolute]:bg-amber-600"
                />
              </div>

              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Межстрочный</span>
                  <span className="text-stone-500">1.6</span>
                </div>
                <Slider defaultValue={[1.6]} min={1.2} max={2.2} step={0.1} />
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium text-stone-300">Тема</div>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
                    const theme = THEMES[key];
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setCurrentTheme(key)}
                        className={cn(
                          "rounded-lg border-2 p-2 transition-all",
                          currentTheme === key
                            ? "border-amber-500 bg-amber-500/10"
                            : "border-stone-700 hover:border-stone-600"
                        )}
                      >
                        <div
                          className="mb-1 h-8 w-full rounded"
                          style={{ background: `linear-gradient(to bottom, ${theme.bg} 50%, ${theme.text} 50%)` }}
                        />
                        <span className="text-xs text-stone-400">{theme.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="space-y-3">
                <div className="text-sm font-medium text-stone-300">Шрифт</div>
                <select
                  value={currentFont}
                  onChange={(event) => setCurrentFont(event.target.value)}
                  className="w-full rounded-lg border border-stone-600 bg-black/40 p-2 text-stone-300"
                >
                  {FONTS.map((font) => (
                    <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>
                      {font.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="p-4 flex-1">
            <h3 className="font-medium text-stone-400 text-xs uppercase tracking-wider mb-4">Аудио монитор</h3>
            <div className="bg-black/40 rounded-lg p-4 border border-white/5 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span>Входной уровень</span>
                <Mic className="w-4 h-4 text-amber-500" />
              </div>
              {/* Real Audio Visualizer */}
              <div className="flex items-end gap-0.5 h-12 justify-between opacity-80">
                {MIC_BAR_SLOTS.map(({ id, position, dimmed }) => {
                  const height = micBars[position] ?? 0;
                  return (
                    <div
                      key={id}
                      className={cn(
                        "w-1.5 rounded-t-sm transition-all duration-75",
                        micMuted ? "bg-stone-600" : "bg-amber-500"
                      )}
                      style={{
                        height: `${Math.max(5, height)}%`,
                        opacity: dimmed ? 0.3 : 1
                      }}
                    />
                  );
                })}
              </div>
            </div>
          </div>
        </aside>

        {/* Center: The Book Text */}
        <div className="flex-1 relative bg-[#1a1a1a] flex flex-col">
          {/* Microphone Check Modal - обязательная проверка микрофона */}
          {state === "prep" && showMicCheck && microphoneAvailable && !microphoneLoading && (
            <MicrophoneCheckModal
              onComplete={() => {
                setMicCheckPassed(true);
                setShowMicCheck(false);
                clearMicrophoneIssue();
                setStreamStartError(null);
                // Кэшируем проверку на 10 минут
                sessionStorage.setItem('mic_check_passed', Date.now().toString());
              }}
            />
          )}

          {runtimeMicrophoneWarning && (
            <div className="absolute top-4 left-4 right-4 z-40 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 backdrop-blur-sm">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-sm font-semibold text-red-300">Проблема с микрофоном</p>
                  <p className="text-sm text-red-200/90">{runtimeMicrophoneWarning}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={retryDetection}
                    className="border-red-400/40 text-red-200 hover:bg-red-500/20"
                  >
                    Обновить статус
                  </Button>
                  {state === "prep" && microphoneAvailable && (
                    <Button
                      size="sm"
                      onClick={() => {
                        clearMicrophoneIssue();
                        setShowMicCheck(true);
                      }}
                      className="bg-red-600 hover:bg-red-700 text-white"
                    >
                      Перепроверить
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {state === "prep" && showPrepModal && (!showMicCheck || !microphoneAvailable || microphoneLoading) && (
            <div className="absolute inset-0 z-20 bg-black/40 backdrop-blur-sm flex items-center justify-center">
              <div className="bg-[#252525] p-8 rounded-2xl border border-white/10 shadow-2xl max-w-md w-full text-center space-y-6">
                <button
                  onClick={() => setShowPrepModal(false)}
                  className="absolute top-4 right-4 text-stone-400 hover:text-white transition-colors"
                >
                  ✕
                </button>
                <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto text-amber-500">
                  <Mic className="w-8 h-8" />
                </div>
                <div>
                  <h2 className="text-2xl font-serif font-bold text-white mb-2">Готовы к эфиру?</h2>
                  {prepModalDescription}
                </div>
                <Button
                  size="lg"
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white border-none h-12 text-lg"
                  onClick={handleStartBroadcast}
                  disabled={!session.isConnected || !isInitialized || !microphoneAvailable || !micCheckPassed || isStartingBroadcast}
                >
                  {startBroadcastButtonLabel}
                </Button>
                {streamStartError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3">
                    <p className="text-sm text-red-300">{streamStartError}</p>
                  </div>
                )}
              </div>
            </div>
          )}

          <ScrollArea className="flex-1 p-8 md:p-16 max-w-3xl mx-auto w-full">
            {renderScrollContent()}
            {/* Bottom padding for scroll */}
            <div className="h-32" />
          </ScrollArea>

          {/* Floating Controls Overlay */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-[#252525] border border-white/10 p-2 rounded-full shadow-2xl z-30">
            {(() => {
              if (state === "live") {
                return (
                  <>
                    <Button
                      variant="ghost"
                      size="icon"
                      className={cn(
                        "rounded-full hover:bg-white/5",
                        micMuted ? "text-red-500 hover:text-red-400" : "text-stone-400 hover:text-white"
                      )}
                      onClick={() => setMicMuted(!micMuted)}
                    >
                      {micMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                    </Button>
                    <Button
                      variant="secondary"
                      size="lg"
                      className="rounded-full h-12 w-12 p-0 bg-amber-600 hover:bg-amber-700 border-none text-white"
                      onClick={pauseReading}
                    >
                      <Pause className="w-5 h-5 fill-current" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="rounded-full hover:bg-white/5 text-stone-400 hover:text-white"
                    >
                      <Settings className="w-5 h-5" />
                    </Button>
                  </>
                );
              }
              if (state === "paused") {
                return (
                  <>
                    <Button
                      variant="secondary"
                      size="lg"
                      className="rounded-full h-12 w-12 p-0 bg-emerald-600 hover:bg-emerald-700 border-none text-white"
                      onClick={resumeReading}
                    >
                      <Play className="w-5 h-5 fill-current ml-1" />
                    </Button>
                    <Button
                      variant="destructive"
                      size="lg"
                      className="rounded-full h-12 w-12 p-0"
                      onClick={endReading}
                    >
                      <Square className="w-4 h-4 fill-current" />
                    </Button>
                  </>
                );
              }
              return null;
            })()}
          </div>
        </div>

        {/* Right Panel: Chat & Interactions */}
        <aside className="w-80 border-l border-white/10 bg-[#151515] flex flex-col shrink-0">
          <div className="p-4 border-b border-white/10 flex items-center justify-between">
            <h3 className="font-medium text-stone-400 text-xs uppercase tracking-wider">Чат эфира</h3>
            <Badge variant="outline" className="border-amber-500/30 text-amber-500 bg-amber-500/5">
              Активен
            </Badge>
          </div>

          <ScrollArea className="flex-1 p-4">
            <div className="space-y-4">
              {[
                { id: "alice", user: "Алиса", msg: "Атмосфера просто потрясающая!", time: "2м" },
                { id: "boris", user: "Борис", msg: "Обожаю эту главу.", time: "1м" },
                { id: "evgeny", user: "Евгений", msg: "Как вы читаете диалоги — это нечто.", time: "Только что" },
              ].map((chat) => (
                <div key={chat.id} className="flex gap-3 animate-in slide-in-from-bottom-2 duration-500">
                  <div className="w-8 h-8 rounded-full bg-stone-700 flex items-center justify-center text-xs font-bold text-stone-300">
                    {chat.user[0]}
                  </div>
                  <div>
                    <div className="flex items-baseline gap-2">
                      <span className="text-sm font-bold text-stone-300">{chat.user}</span>
                      <span className="text-xs text-stone-600">{chat.time}</span>
                    </div>
                    <p className="text-sm text-stone-400 leading-snug">{chat.msg}</p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>

          {/* Reactions Stream */}
          <div className="h-24 border-t border-white/10 p-4 relative overflow-hidden">
            <div className="absolute bottom-4 right-4 flex gap-2">
              <div className="animate-bounce delay-75">
                <Heart className="w-6 h-6 text-rose-500 fill-rose-500" />
              </div>
              <div className="animate-bounce delay-100">
                <span className="text-xl">👏</span>
              </div>
            </div>
          </div>
        </aside>

      </main>
    </div>
  );
}

function UsersIcon(props: Readonly<React.SVGProps<SVGSVGElement>>) {
  return (
    <svg
      {...props}
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
      <path d="M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  )
}
