import React, { useState, useEffect, useRef } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Mic } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useReadingSession } from "@/hooks/use-reading-session";
import { useBookChapter, useCreateBookContent, useDeleteBookContent } from "@/hooks/use-books";
import { useClub } from "@/hooks/use-clubs";
import { useAudioSession } from "@/hooks/use-audio-session";
import { useAudioStream } from "@/hooks/use-audio-stream";
import { useRealVUMeter } from "@/hooks/use-real-vu-meter";
import { useMicrophoneDetection } from "@/hooks/use-microphone-detection";
import { MicrophoneCheckModal } from "@/components/studio/microphone-check-modal";
import { LiveTopBar, type NetworkQuality } from "@/components/studio/LiveTopBar";
import { ControlBar } from "@/components/studio/ControlBar";
import { ReadingStage, THEMES, FONTS, type ThemeKey } from "@/components/studio/ReadingStage";
import { LiveShell } from "@/components/studio/LiveShell";
import { useLiveReaders } from "@/hooks/use-live-readers";

export default function ReaderStudio() {
  const [, params] = useRoute("/studio/:clubId/:bookId/:chapter?");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { session, createSession, startReading, pauseReading, resumeReading, endReading } = useReadingSession();

  const [showTextSettings, setShowTextSettings] = useState(false);
  const [fontSize, setFontSize] = useState([22]);
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>('sepia');
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
  const startLockRef = useRef(false);

  // Microphone detection
  const {
    isAvailable: microphoneAvailable,
    isLoading: microphoneLoading,
    error: microphoneError,
    retryDetection
  } = useMicrophoneDetection();

  // Socket.IO: счётчик слушателей и оповещения о состоянии эфира
  const {
    listenerCount: sessionListenerCount,
    notifyBroadcastStarted,
    notifyBroadcastEnded,
    notifyBroadcastPaused,
    notifyBroadcastResumed,
    joinSessionRoom,
  } = useAudioSession({ userId: user?.id });

  // Аудиопоток в Icecast
  const {
    status: audioStatus,
    mediaStream,
    start: startAudioStream,
    stop: stopAudioStream,
    pause: pauseAudioStream,
    resume: resumeAudioStream,
    mute: muteAudioStream,
  } = useAudioStream({
    sessionId: session.sessionId ?? null,
    enableRecording: false,
    onError: (msg, source) => {
      if (source === 'microphone') {
        setMicrophoneIssue(msg);
      } else {
        setStreamStartError(msg);
      }
    },
  });

  const isStreaming = audioStatus === 'streaming' || audioStatus === 'paused';
  const [microphoneIssue, setMicrophoneIssue] = useState<string | null>(null);
  const clearMicrophoneIssue = () => setMicrophoneIssue(null);

  // Real VU meter
  const { level: micLevel, bars: micBars } = useRealVUMeter({
    stream: mediaStream,
    isActive: !micMuted && Boolean(mediaStream),
  });

  // Extract route params
  const clubId = params?.clubId || "";
  const bookId = params?.bookId || "";
  const currentChapter = Number.parseInt(params?.chapter || "1", 10);

  // Объявление о начале/конце эфира в клубной комнате
  const { announceLiveStart, announceLiveStop } = useLiveReaders({
    clubId,
    bookId,
  });

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
      if (Date.now() - timestamp < tenMinutes && microphoneAvailable) {
        setMicCheckPassed(true);
        setShowMicCheck(false);
      } else {
        setMicCheckPassed(false);
        sessionStorage.removeItem('mic_check_passed');
      }
    }
  }, [microphoneAvailable]);

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

  // Синхронизация mute с аудиостримером
  useEffect(() => {
    muteAudioStream(micMuted);
  }, [micMuted, muteAudioStream]);

  // Остановить поток при завершении сессии
  useEffect(() => {
    if (!session.isLive && isStreaming) {
      stopAudioStream();
    }
  }, [session.isLive, isStreaming, stopAudioStream]);

  // Подписаться на комнату сессии когда sessionId известен
  useEffect(() => {
    if (session.sessionId) {
      joinSessionRoom(session.sessionId);
    }
  }, [session.sessionId, joinSessionRoom]);

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
    if (startLockRef.current) return;
    if (!user?.id) {
      setStreamStartError('Пользователь не авторизован');
      return;
    }

    if (!session.sessionId) {
      setStreamStartError('Сессия чтения еще не создана. Подождите несколько секунд и попробуйте снова.');
      return;
    }

    const isMicAvailableNow = await retryDetection();
    if (!isMicAvailableNow) {
      setStreamStartError(microphoneError ?? 'Микрофон недоступен');
      setMicCheckPassed(false);
      sessionStorage.removeItem('mic_check_passed');
      setShowMicCheck(true);
      return;
    }

    if (!micCheckPassed) {
      setStreamStartError('Сначала пройдите проверку микрофона');
      return;
    }

  startLockRef.current = true;
    setIsStartingBroadcast(true);
    setStreamStartError(null);
    clearMicrophoneIssue();

    try {
      await startAudioStream();

      if (session.sessionId) {
        notifyBroadcastStarted(session.sessionId);
        // Объявляем всем в клубной комнате
        const streamUrl = `${import.meta.env.VITE_ICECAST_PUBLIC_URL ?? ''}/live/${session.sessionId}`;
        announceLiveStart({
          sessionId: session.sessionId,
          chapter: currentChapter,
          readerName: user.username ?? 'Чтец',
          streamUrl,
        });
      }

      await startReading();
      setMicMuted(false);
      setShowPrepModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Не удалось начать эфир';
      setStreamStartError(message);
    } finally {
      startLockRef.current = false;
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
  // Helpers
  const listenerCount = sessionListenerCount || session.listenerCount;
  const selectedFont = FONTS.find(font => font.id === currentFont) ?? FONTS[0];
  const runtimeMicrophoneWarning = microphoneIssue
    ?? ((state !== "prep" && !microphoneLoading && !microphoneAvailable)
      ? (microphoneError ?? 'Микрофон недоступен во время эфира')
      : null);
  const startBroadcastButtonLabel = (() => {
    if (!micCheckPassed) return 'Требуется проверка микрофона';
    if (isStartingBroadcast) return 'Запуск эфира...';
    if (session.isConnected) return 'Начать прямой эфир';
    return 'Начать прямой эфир (соединение восстанавливается)';
  })();

  // Синхронизируем индикатор сети с реальным состоянием соединения с сервером
  const networkQuality: NetworkQuality = session.isConnected ? "good" : "poor";

  // Book display info
  const bookTitle =
    (clubData as { book?: { title?: string } } | undefined)?.book?.title ?? "Книга";
  const chapterTitle = chapterData?.chapter?.title ?? `Глава ${currentChapter}`;

  // Error state (chapter load failed, not in upload mode)
  if (chapterError && !uploadMode) {
    return (
      <div className="min-h-screen bg-[#F9F8F6] flex items-center justify-center">
        <div className="text-center space-y-4">
          <h2 className="text-xl font-bold">Контент не найден</h2>
          <p className="text-muted-foreground">Глава {currentChapter} пока не добавлена</p>
          <Button onClick={() => setUploadMode(true)} className="bg-amber-500 hover:bg-amber-600 text-white border-none gap-2">
            Добавить контент
          </Button>
        </div>
      </div>
    );
  }

  // Prep-modal description
  const prepModalDescription = (() => {
    if (microphoneLoading) return <p className="text-amber-500">Проверяем доступ к микрофону...</p>;
    if (microphoneAvailable) return <p className="text-muted-foreground">Проверьте микрофон и настройки перед началом. Ваши слушатели уже ждут.</p>;
    return (
      <div className="space-y-2">
        <p className="text-destructive font-medium">Микрофон недоступен</p>
        <p className="text-muted-foreground text-sm">{microphoneError}</p>
        <Button variant="outline" size="sm" onClick={retryDetection}>
          Повторить проверку
        </Button>
      </div>
    );
  })();

  // ── Текстовые настройки ─────────────────────────────────────────

  const textSettingsPanel = showTextSettings ? (
    <div className="absolute top-14 right-4 z-50 w-72 rounded-xl border border-border bg-card shadow-xl p-4 space-y-5">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold text-foreground">Настройки текста</span>
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setShowTextSettings(false)}>✕</Button>
      </div>
      <div className="space-y-2">
        <div className="flex justify-between text-xs text-muted-foreground">
          <span>Размер шрифта</span>
          <span>{fontSize[0]}px</span>
        </div>
        <Slider value={fontSize} onValueChange={setFontSize} min={14} max={32} step={1} />
      </div>
      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">Тема</span>
        <div className="grid grid-cols-3 gap-1.5">
          {(Object.keys(THEMES) as ThemeKey[]).map((key) => {
            const theme = THEMES[key];
            return (
              <button
                key={key}
                type="button"
                onClick={() => setCurrentTheme(key)}
                className={`rounded-lg border-2 p-1.5 text-[10px] transition-all ${
                  currentTheme === key ? "border-amber-500 bg-amber-500/10" : "border-border hover:border-muted-foreground"
                }`}
              >
                <div className="mb-1 h-6 w-full rounded" style={{ background: `linear-gradient(to bottom, ${theme.bg} 50%, ${theme.text} 50%)` }} />
                {theme.name}
              </button>
            );
          })}
        </div>
      </div>
      <div className="space-y-2">
        <span className="text-xs text-muted-foreground">Шрифт</span>
        <select
          value={currentFont}
          onChange={(e) => setCurrentFont(e.target.value)}
          className="w-full rounded-lg border border-border bg-muted px-2 py-1.5 text-sm text-foreground"
        >
          {FONTS.map((font) => (
            <option key={font.id} value={font.id} style={{ fontFamily: font.family }}>{font.name}</option>
          ))}
        </select>
      </div>
    </div>
  ) : null;

  // ── Оверлеи для ReadingStage ─────────────────────────────────────
  const stageOverlays = (
    <>
      {/* Проверка микрофона */}
      {state === "prep" && showMicCheck && microphoneAvailable && !microphoneLoading && (
        <MicrophoneCheckModal
          microphoneAvailable={microphoneAvailable}
          microphoneLoading={microphoneLoading}
          microphoneError={microphoneError}
          onComplete={() => {
            setMicCheckPassed(true);
            setShowMicCheck(false);
            clearMicrophoneIssue();
            setStreamStartError(null);
            sessionStorage.setItem('mic_check_passed', Date.now().toString());
          }}
          onSkip={() => {
            setMicCheckPassed(false);
            setShowMicCheck(false);
            sessionStorage.removeItem('mic_check_passed');
          }}
        />
      )}

      {/* Предупреждение о микрофоне во время эфира */}
      {runtimeMicrophoneWarning && (
        <div className="absolute top-4 left-4 right-4 z-40 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 backdrop-blur-sm">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold text-destructive">Проблема с микрофоном</p>
              <p className="text-sm text-destructive/90">{runtimeMicrophoneWarning}</p>
            </div>
            <div className="flex items-center gap-2">
              <Button size="sm" variant="outline" onClick={retryDetection}>
                Обновить статус
              </Button>
              {state === "prep" && microphoneAvailable && (
                <Button size="sm" variant="destructive" onClick={() => { clearMicrophoneIssue(); setShowMicCheck(true); }}>
                  Перепроверить
                </Button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Модальное окно подготовки к эфиру */}
      {state === "prep" && showPrepModal && (!showMicCheck || !microphoneAvailable || microphoneLoading) && (
        <div className="absolute inset-0 z-20 bg-background/60 backdrop-blur-sm flex items-center justify-center">
          <div className="bg-card p-8 rounded-2xl border border-border shadow-2xl max-w-md w-full text-center space-y-6">
            <button
              type="button"
              onClick={() => setShowPrepModal(false)}
              className="absolute top-4 right-4 text-muted-foreground hover:text-foreground transition-colors"
            >
              ✕
            </button>
            <div className="w-16 h-16 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto text-amber-500">
              <Mic className="w-8 h-8" />
            </div>
            <div>
              <h2 className="text-2xl font-serif font-bold text-foreground mb-2">Готовы к эфиру?</h2>
              {prepModalDescription}
            </div>
            <Button
              size="lg"
              className="w-full bg-amber-500 hover:bg-amber-600 text-white border-none h-12 text-lg"
              onClick={handleStartBroadcast}
              disabled={!isInitialized || !microphoneAvailable || !micCheckPassed || isStartingBroadcast}
            >
              {startBroadcastButtonLabel}
            </Button>
            {streamStartError && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3">
                <p className="text-sm text-destructive">{streamStartError}</p>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  return (
    <div className="relative">
      {textSettingsPanel}
      <LiveShell
        topBar={
          <LiveTopBar
            bookTitle={bookTitle}
            chapterTitle={chapterTitle}
            isLive={state === "live"}
            isRecording={false}
            recordingTime={0}
            networkQuality={networkQuality}
            onBookmark={() => {}}
            onTextSettings={() => setShowTextSettings((v) => !v)}
          />
        }
        stage={
          <ReadingStage
            chapterData={chapterData}
            chapterLoading={chapterLoading}
            currentChapter={currentChapter}
            uploadMode={uploadMode}
            contentText={contentText}
            onContentTextChange={setContentText}
            onUpload={handleUploadContent}
            onCancelUpload={() => setUploadMode(false)}
            onDeleteContent={handleDeleteContent}
            deleteIsPending={deleteContentMutation.isPending}
            createIsPending={createContentMutation.isPending}
            onOpenUpload={() => setUploadMode(true)}
            fontSize={fontSize[0]}
            currentTheme={currentTheme}
            fontFamily={selectedFont.family}
            overlays={stageOverlays}
          />
        }
        controlBar={
          <ControlBar
            state={state}
            isOnline={state !== "prep" || session.isConnected}
            micMuted={micMuted}
            onMicToggle={() => setMicMuted((v) => !v)}
            elapsedTime={elapsedTime}
            listenerCount={listenerCount}
            micLevel={micLevel}
            micBars={micBars}
            onPause={() => {
              pauseReading();
              pauseAudioStream();
              if (session.sessionId) notifyBroadcastPaused(session.sessionId);
            }}
            onResume={() => {
              resumeReading();
              resumeAudioStream();
              if (session.sessionId) notifyBroadcastResumed(session.sessionId);
            }}
            onEnd={() => {
              endReading();
              stopAudioStream();
              if (session.sessionId) {
                notifyBroadcastEnded(session.sessionId);
                announceLiveStop(session.sessionId);
              }
            }}
            onOpenChat={() => {}}
            onSettings={() => setShowTextSettings((v) => !v)}
          />
        }
      />
    </div>
  );
}

