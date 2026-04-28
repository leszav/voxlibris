import React, { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/use-auth";
import { useBookChapter, useCreateBookContent, useDeleteBookContent } from "@/hooks/use-books";
import { useClub } from "@/hooks/use-clubs";
import { ReadingStage, THEMES, FONTS, type ThemeKey } from "@/components/studio/ReadingStage";
import { DedicatedStudioShell } from "@/components/studio/DedicatedStudioShell";
import { StudioStageOverlays } from "@/components/studio/StudioStageOverlays";
import { useLiveReaders } from "@/hooks/use-live-readers";
import { useStudioMode } from "@/hooks/use-studio-mode";
import {
  resolveDedicatedStudioPrepModalOpen,
  resolveStudioPrepView,
} from "@/lib/studio-prep-view";
import { resolveReaderStudioViewState } from "@/lib/reader-studio-view";

export default function ReaderStudio() {
  const [, params] = useRoute("/studio/:clubId/:bookId/:chapter?");
  const [, setLocation] = useLocation();
  const { user } = useAuth();

  const [showTextSettings, setShowTextSettings] = useState(false);
  const [fontSize, setFontSize] = useState([22]);
  const [currentTheme, setCurrentTheme] = useState<ThemeKey>('sepia');
  const [currentFont, setCurrentFont] = useState(FONTS[0].id);
  const [uploadMode, setUploadMode] = useState(false);
  const [contentText, setContentText] = useState("");
  const [showPrepModal, setShowPrepModal] = useState(true);

  // Extract route params
  const clubId = params?.clubId || "";
  const bookId = params?.bookId || "";
  const currentChapter = Number.parseInt(params?.chapter || "1", 10);

  // Объявление о начале/конце эфира в клубной комнате
  const { announceLiveStart, announceLiveStop } = useLiveReaders({
    clubId,
    bookId,
  });

  const studio = useStudioMode({
    clubId,
    bookId,
    currentChapter,
    readerName: user?.username ?? 'Чтец',
    userId: user?.id,
    enabled: true,
  });

  // Hooks for data fetching
  const { data: clubData } = useClub(clubId);
  const { data: chapterData, isLoading: chapterLoading, error: chapterError } = useBookChapter(bookId, currentChapter);
  const createContentMutation = useCreateBookContent();
  const deleteContentMutation = useDeleteBookContent();

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

  const state = studio.state;
  const elapsedTime = studio.elapsedTime;
  const listenerCount = studio.listenerCount;
  const selectedFont = FONTS.find(font => font.id === currentFont) ?? FONTS[0];
  const {
    runtimeMicrophoneWarning,
    networkQuality,
    bookTitle,
    chapterTitle,
  } = resolveReaderStudioViewState({
    state,
    micCheckPassed: studio.micCheckPassed,
    isStartingBroadcast: studio.isStartingBroadcast,
    isSessionConnected: studio.session.isConnected,
    microphoneIssue: studio.microphoneIssue,
    microphoneLoading: studio.microphoneLoading,
    microphoneAvailable: studio.microphoneAvailable,
    microphoneError: studio.microphoneError,
    clubBookTitle: (clubData as { book?: { title?: string } } | undefined)?.book?.title ?? null,
    chapterTitle: chapterData?.chapter?.title ?? null,
    currentChapter,
  });

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

  const {
    startButtonLabel,
    startDisabled,
    prepStatusText,
  } = resolveStudioPrepView({
    microphoneAvailable: studio.microphoneAvailable,
    microphoneError: studio.microphoneError,
    micCheckPassed: studio.micCheckPassed,
    isStartingBroadcast: studio.isStartingBroadcast,
    sessionConnected: studio.session.isConnected,
    sessionId: studio.session.sessionId ?? null,
  });
  const prepModalOpen = resolveDedicatedStudioPrepModalOpen({
    dismissed: !showPrepModal,
    state,
    showMicCheck: studio.showMicCheck,
    microphoneAvailable: studio.microphoneAvailable,
    microphoneLoading: studio.microphoneLoading,
  });

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
    <StudioStageOverlays
      state={state}
      showMicCheck={studio.showMicCheck}
      microphoneAvailable={studio.microphoneAvailable}
      microphoneLoading={studio.microphoneLoading}
      microphoneError={studio.microphoneError}
      runtimeMicrophoneWarning={runtimeMicrophoneWarning}
      onMicCheckComplete={studio.completeMicCheck}
      onMicCheckSkip={studio.skipMicCheck}
      onRetryDetection={studio.retryDetection}
      onOpenMicCheck={studio.openMicCheck}
    />
  );

  return (
    <DedicatedStudioShell
      state={state}
      sessionId={studio.session.sessionId}
      bookTitle={bookTitle}
      chapterTitle={chapterTitle}
      networkQuality={networkQuality}
      showTextSettings={showTextSettings}
      textSettingsPanel={textSettingsPanel}
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
      micMuted={studio.micMuted}
      onMicToggle={() => studio.setMicMuted(!studio.micMuted)}
      elapsedTime={elapsedTime}
      listenerCount={listenerCount}
      micLevel={studio.micLevel}
      micBars={studio.micBars}
      onPause={studio.handlePause}
      onResume={studio.handleResume}
      onRequestEnd={studio.requestEnd}
      onConfirmEnd={() => {
        studio.handleEnd((sessionId) => {
          announceLiveStop(sessionId);
        });
      }}
      onCancelEnd={studio.cancelEnd}
      phase={studio.phase}
      onCloseSummary={studio.closeSummary}
      onTextSettings={() => setShowTextSettings((v) => !v)}
      prepModalOpen={prepModalOpen}
      prepStatusText={prepStatusText}
      startButtonLabel={startButtonLabel}
      startDisabled={startDisabled}
      onOpenMicCheck={studio.openMicCheck}
      onRetryDetection={studio.retryDetection}
      microphoneAvailable={studio.microphoneAvailable}
      microphoneLoading={studio.microphoneLoading}
      onStart={() => {
        void studio.handleStartBroadcast((sessionId) => {
          announceLiveStart({
            sessionId,
            chapter: currentChapter,
            readerName: user?.username ?? 'Чтец',
          });
          setShowPrepModal(false);
        });
      }}
      onClosePrepModal={() => setShowPrepModal(false)}
      streamStartError={studio.streamStartError}
    />
  );
}
