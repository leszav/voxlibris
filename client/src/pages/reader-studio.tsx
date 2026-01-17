import React, { useState, useEffect } from "react";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Mic, MicOff, Play, Pause, Square, Settings, Heart, Upload, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ComingSoonOverlay } from "@/components/ui/coming-soon-overlay";
import { useAuth } from "@/hooks/use-auth";
import { useReadingSession } from "@/hooks/use-reading-session";
import { useBookChapter, useCreateBookContent, useDeleteBookContent } from "@/hooks/use-books";
import { useClub } from "@/hooks/use-clubs";

export default function ReaderStudio() {
  const [, params] = useRoute("/studio/:clubId/:bookId/:chapter?");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const { session, createSession, startReading, pauseReading, resumeReading, endReading } = useReadingSession();

  const [fontSize, setFontSize] = useState([18]);
  const [micLevel, setMicLevel] = useState(0);
  const [isInitialized, setIsInitialized] = useState(false);
  const [uploadMode, setUploadMode] = useState(false);
  const [contentText, setContentText] = useState("");
  const [showPrepModal, setShowPrepModal] = useState(true);
  const [micMuted, setMicMuted] = useState(false);

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
        const sessionTitle = clubData
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
          console.log('Сессия создана:', sessionId);
        }
        setIsInitialized(true);
      } catch (error) {
        // Сообщения об ошибках выводим только в режиме разработки
        if (import.meta.env.DEV) {
          console.error('Не удалось инициализировать сессию:', error);
        }
        // Try again after a delay if session creation fails
        setTimeout(() => {
          setIsInitialized(false);
        }, 3000);
      }
    };

    if (user && !isInitialized && clubId && bookId) {
      initializeSession();
    }
  }, [user, isInitialized, clubId, bookId, currentChapter, clubData]);

  // Realistic mic level simulation (when unmuted)
  useEffect(() => {
    if (micMuted) {
      setMicLevel(0);
      return;
    }

    const interval = setInterval(() => {
      // Simulate realistic audio patterns
      const baseLevel = 15 + Math.sin(Date.now() / 1000) * 10;
      const variation = Math.random() * 30;
      setMicLevel(Math.max(0, Math.min(100, baseLevel + variation)));
    }, 100);
    return () => clearInterval(interval);
  }, [micMuted]);

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
          className="font-book text-stone-300 leading-relaxed transition-all duration-200"
          style={{ fontSize: `${fontSize}px` }}
        >
          <div className="flex items-center justify-between mb-8">
            <h1 className="font-serif font-bold text-4xl text-white">
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
    <ComingSoonOverlay>
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
                  <span className="text-stone-500">{fontSize}px</span>
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
            </div>
          </div>

          <div className="p-4 flex-1">
            <h3 className="font-medium text-stone-400 text-xs uppercase tracking-wider mb-4">Аудио монитор</h3>
            <div className="bg-black/40 rounded-lg p-4 border border-white/5 space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span>Входной уровень</span>
                <Mic className="w-4 h-4 text-amber-500" />
              </div>
              {/* Fake Audio Visualizer */}
              <div className="flex items-end gap-0.5 h-12 justify-between opacity-80">
                {Array.from({ length: 20 }, (_, idx) => ({ id: `bar-${idx}`, idx })).map(({ id, idx }) => {
                  const barHeight = micMuted
                    ? 5
                    : Math.max(5, (micLevel / 100) * (50 + Math.sin(idx * 0.5) * 20));
                  return (
                    <div
                      key={id}
                      className={cn(
                        "w-1.5 rounded-t-sm transition-all duration-75",
                        micMuted ? "bg-stone-600" : "bg-amber-500"
                      )}
                      style={{
                        height: `${barHeight}%`,
                        opacity: idx > 15 ? 0.3 : 1
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
          {state === "prep" && showPrepModal && (
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
                  <p className="text-stone-400">Проверьте микрофон и настройки текста перед началом. Ваши слушатели уже ждут.</p>
                </div>
                <Button
                  size="lg"
                  className="w-full bg-amber-600 hover:bg-amber-700 text-white border-none h-12 text-lg"
                  onClick={() => {
                    startReading();
                    setShowPrepModal(false);
                  }}
                  disabled={!session.isConnected || !isInitialized}
                >
                  {session.isConnected ? "Начать прямой эфир" : "Подключение..."}
                </Button>
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
    </ComingSoonOverlay>
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
