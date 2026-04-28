import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Maximize2, Trash2, Eraser, Smile, ChevronDown, Send } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Textarea } from "@/components/ui/textarea";
import type { ChatMessageWithUser } from "@shared/schema";

interface ChatWidgetProps {
  readonly clubId: string;
  readonly channel?: string;
  readonly onCleanupDeleted?: () => Promise<void>;
  readonly canCleanup?: boolean;
}

const blockedEmojiPattern = /(?:🏳️‍🌈|🏳️‍⚧️|🌈|👬|👭|👨‍❤️‍👨|👩‍❤️‍👩|👨‍👨‍👧‍👦|👩‍👩‍👧‍👦|👨‍👨‍👧|👨‍👨‍👦|👩‍👩‍👧|👩‍👩‍👦)/u;

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

function formatDayLabel(date: Date): string {
  const now = new Date();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameDay(date, now)) return "Сегодня";
  if (isSameDay(date, yesterday)) return "Вчера";

  return date.toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}

type ChatRenderRow = {
  message: ChatMessageWithUser;
  showDateDivider: boolean;
  dayLabel: string | null;
  isOwnMessage: boolean;
  messageTime: string;
  username: string;
  userInitial: string;
  isGroupedWithPrev: boolean;
  showAvatar: boolean;
  showUsername: boolean;
};

export function ChatWidget({ clubId, channel = "general", onCleanupDeleted, canCleanup = false }: Readonly<ChatWidgetProps>) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [hasUnread, setHasUnread] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [chatSize, setChatSize] = useState({ width: 436, height: 532 });
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isIdle, setIsIdle] = useState(false);
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);
  const lastMessageCountRef = useRef(0);
  const unreadTrackingReadyRef = useRef(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const scrollAreaRef = useRef<HTMLDivElement | null>(null);
  const scrollViewportRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const { user } = useAuth();
  const { messages, participants, sendMessage, deleteMessage, connected, client, loadingHistory, error } = useChat({
    clubId,
    channel,
  });

  const scrollToBottom = (behavior: ScrollBehavior = "smooth") => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior, block: "end" });
    }
  };

  const getDistanceToBottom = (): number => {
    const viewport = scrollViewportRef.current;
    if (!viewport) return 0;
    return viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
  };

  // Умный автоскролл: скроллим вниз только если пользователь и так рядом с концом
  useEffect(() => {
    if (!open) return;

    const nearBottom = getDistanceToBottom() < 120;
    const lastMessage = messages.at(-1);
    const isOwnLastMessage = Boolean(lastMessage?.user?.id && lastMessage.user.id === user?.id);

    if (nearBottom || isOwnLastMessage) {
      scrollToBottom("smooth");
    }
  }, [messages.length, open, messages, user?.id]);

  // Подключаемся к viewport ScrollArea чтобы управлять кнопкой "вниз"
  useEffect(() => {
    if (!open || !scrollAreaRef.current) return;

    const viewport = scrollAreaRef.current.querySelector<HTMLDivElement>("[data-radix-scroll-area-viewport]");
    if (!viewport) return;

    scrollViewportRef.current = viewport;
    const onScroll = () => {
      const distance = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight;
      setShowScrollToBottom(distance > 140);
    };

    onScroll();
    viewport.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      viewport.removeEventListener("scroll", onScroll);
      scrollViewportRef.current = null;
    };
  }, [open]);

  // Индикатор непрочитанного только для реально новых сообщений,
  // а не для первичной подгрузки истории.
  useEffect(() => {
    if (loadingHistory) {
      return;
    }

    if (!unreadTrackingReadyRef.current) {
      lastMessageCountRef.current = messages.length;
      unreadTrackingReadyRef.current = true;
      return;
    }

    if (!open && messages.length > lastMessageCountRef.current) {
      setHasUnread(true);
    }

    lastMessageCountRef.current = messages.length;
  }, [messages.length, open, loadingHistory]);

  // Idle-эффект: чат становится полупрозрачным при неактивности
  useEffect(() => {
    const resetIdle = () => {
      setIsIdle(false);
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
      idleTimeoutRef.current = setTimeout(() => {
        setIsIdle(true);
      }, 3000); // 3 секунды без активности
    };

    // Следим за активности мыши и клавиатуры
    globalThis.addEventListener('mousemove', resetIdle);
    globalThis.addEventListener('keydown', resetIdle);
    globalThis.addEventListener('click', resetIdle);

    resetIdle();

    return () => {
      globalThis.removeEventListener('mousemove', resetIdle);
      globalThis.removeEventListener('keydown', resetIdle);
      globalThis.removeEventListener('click', resetIdle);
      if (idleTimeoutRef.current) {
        clearTimeout(idleTimeoutRef.current);
      }
    };
  }, []);

  const handleToggle = () => {
    setOpen((prev) => !prev);
    if (!open) {
      // Сбрасываем индикатор непрочитанных при открытии
      setHasUnread(false);
    }
  };

  const handleSend = () => {
    const text = input.trim();
    if (!text) return;
    sendMessage(text);
    setInput("");
    setShowEmojiPicker(false);
  };

  useEffect(() => {
    if (!inputRef.current) return;
    inputRef.current.style.height = "auto";
    inputRef.current.style.height = `${Math.min(inputRef.current.scrollHeight, 132)}px`;
  }, [input]);

  const handleInputKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) {
      return;
    }
    e.preventDefault();
    if (!connected) return;
    handleSend();
  };

  const canSend = connected && input.trim().length > 0;

  const handleCleanupDeleted = async () => {
    if (!onCleanupDeleted) return;
    // Тихая очистка без модалки подтверждения
    await onCleanupDeleted();
    // Перезагружаем историю чата после очистки
    if (client) {
      client.loadHistory({ clubId, channel, offset: 0, limit: 50 });
    }
  };

  // Безопасные эмоджи в соответствии с традиционными ценностями
  const safeEmojis = [
    // === Смайлики (нейтральные, одиночные, без ЛГБТ-ассоциаций) ===
    {"id": "smile", "char": "🙂", "keywords": ["улыбка", "вежливо", "добро"]},
    {"id": "grin", "char": "😄", "keywords": ["радость", "смех", "весело"]},
    {"id": "laugh", "char": "😂", "keywords": ["смех", "слёзы от смеха"]},
    {"id": "blush", "char": "😊", "keywords": ["смущение", "тёплая улыбка"]},
    {"id": "neutral", "char": "😐", "keywords": ["нейтрально", "равнодушие"]},
    {"id": "thinking", "char": "🤔", "keywords": ["размышление", "сомнение"]},
    {"id": "confused", "char": "😕", "keywords": ["растерянность", "непонимание"]},
    {"id": "sad", "char": "😞", "keywords": ["грусть", "разочарование"]},
    {"id": "crying", "char": "😢", "keywords": ["слёзы", "печаль", "трогательно"]},
    {"id": "angry", "char": "😠", "keywords": ["злость", "раздражение"]},
    {"id": "fearful", "char": "😨", "keywords": ["страх", "тревога"]},
    {"id": "scream", "char": "😱", "keywords": ["ужас", "шок"]},
    {"id": "surprised", "char": "😮", "keywords": ["удивление", "изумление"]},
    {"id": "yawning", "char": "🥱", "keywords": ["зевота", "усталость"]},
    {"id": "sleepy", "char": "😴", "keywords": ["сон", "покой"]},
    {"id": "dizzy", "char": "😵", "keywords": ["головокружение", "растерянность"]},
    {"id": "nauseated", "char": "🤢", "keywords": ["тошнота", "отвращение"]},
    {"id": "sick", "char": "🤒", "keywords": ["болезнь", "температура"]},
    {"id": "mask", "char": "😷", "keywords": ["маска", "болезнь", "осторожность"]},
    {"id": "nerd", "char": "🤓", "keywords": ["очкарик", "умник", "энтузиазм"]},
    {"id": "cool", "char": "😎", "keywords": ["крутой", "солнечные очки", "уверенность"]},
    {"id": "wink", "char": "😉", "keywords": ["подмигивание", "шутка", "тайна"]},
    {"id": "expressionless", "char": "😑", "keywords": ["без выражения", "сдержанность"]},
    {"id": "disappointed", "char": "😔", "keywords": ["тихая грусть", "меланхолия"]},
    {"id": "relieved", "char": "😌", "keywords": ["облегчение", "спокойствие"]},
    {"id": "innocent", "char": "😇", "keywords": ["невинность", "доброта", "ангел"]},
    {"id": "sweat", "char": "😅", "keywords": ["нервный смех", "стресс"]},
    {"id": "grimace", "char": "😬", "keywords": ["неловкость", "стиснутые зубы"]},
    {"id": "zipper_mouth", "char": "🤐", "keywords": ["молчание", "секрет"]},
    {"id": "shushing", "char": "🤫", "keywords": ["тише", "тишина", "конфиденциально"]},

    // === Поэтические / тематические эмодзи ===
    {"id": "book", "char": "📚", "keywords": ["книга", "чтение", "литература"]},
    {"id": "scroll", "char": "📜", "keywords": ["свиток", "рукопись", "архив"]},
    {"id": "pen", "char": "✒️", "keywords": ["перо", "письмо", "автор"]},
    {"id": "candle", "char": "🕯️", "keywords": ["свеча", "уют", "ночь", "тишина"]},
    {"id": "moon", "char": "🌙", "keywords": ["луна", "месяц", "ночь", "мечты"]},
    {"id": "star", "char": "⭐", "keywords": ["звезда", "надежда", "вдохновение"]},
    {"id": "teacup", "char": "🍵", "keywords": ["чай", "покой", "размышление"]},
    {"id": "rain", "char": "🌧️", "keywords": ["дождь", "осень", "меланхолия"]},
    {"id": "umbrella", "char": "☔", "keywords": ["зонтик", "дождь", "город"]},
    {"id": "leaf", "char": "🍂", "keywords": ["листья", "осень", "время"]},
    {"id": "snowflake", "char": "❄️", "keywords": ["снег", "зима", "тишина", "Россия"]},
    {"id": "fire", "char": "🔥", "keywords": ["огонь", "страсть", "мысль"]},
    {"id": "clock", "char": "🕰️", "keywords": ["часы", "время", "прошлое"]},
    {"id": "hourglass", "char": "⏳", "keywords": ["песочные часы", "время", "ожидание"]},
    {"id": "window", "char": "🪟", "keywords": ["окно", "вид", "размышление"]},
    {"id": "chair", "char": "🪑", "keywords": ["стул", "одиночество", "чтение"]},
    {"id": "lamp", "char": "💡", "keywords": ["лампа", "идея", "озарение"]},
    {"id": "mirror", "char": "🪞", "keywords": ["зеркало", "рефлексия", "душа"]},
    {"id": "key", "char": "🗝️", "keywords": ["ключ", "тайна", "сердце"]},
    {"id": "letter", "char": "✉️", "keywords": ["письмо", "любовь", "разлука"]},
    {"id": "envelope", "char": "📨", "keywords": ["конверт", "сообщение", "ожидание"]},
    {"id": "quill", "char": "🖋️", "keywords": ["кисть", "поэт", "классика"]},
    {"id": "violin", "char": "🎻", "keywords": ["скрипка", "музыка", "грусть"]},
    {"id": "piano", "char": "🎹", "keywords": ["рояль", "вечер", "вдохновение"]},
    {"id": "rose", "char": "🌹", "keywords": ["роза", "любовь", "поэзия"]},
    {"id": "lily", "char": "🌷", "keywords": ["тюльпан", "весна", "нежность"]},
    {"id": "waves", "char": "🌊", "keywords": ["волны", "море", "далёкое"]},
    {"id": "mountain", "char": "⛰️", "keywords": ["гора", "высота", "размышление"]},
    {"id": "forest", "char": "🌲", "keywords": ["сосна", "лес", "уединение"]},
    {"id": "fog", "char": "🌫️", "keywords": ["туман", "неясность", "тайна"]},
    {"id": "cloud", "char": "☁️", "keywords": ["облако", "мечты", "лёгкость"]},
    {"id": "sun", "char": "☀️", "keywords": ["солнце", "утро", "ясность"]},
    {"id": "dusk", "char": "🌆", "keywords": ["сумерки", "город", "прощание"]},
    {"id": "street", "char": "🌃", "keywords": ["ночной город", "огни", "одиночество"]},
    {"id": "bridge", "char": "🌉", "keywords": ["мост", "переход", "судьба"]},
    {"id": "train", "char": "🚂", "keywords": ["паровоз", "дорога", "отъезд"]},
    {"id": "ship", "char": "⛵", "keywords": ["парус", "путешествие", "свобода"]},
    {"id": "anchor", "char": "⚓", "keywords": ["якорь", "стабильность", "порт"]},
    {"id": "compass", "char": "🧭", "keywords": ["компас", "путь", "поиск"]},
    {"id": "map", "char": "🗺️", "keywords": ["карта", "приключения", "план"]},
    {"id": "mask_theater", "char": "🎭", "keywords": ["маска", "театр", "лицемерие"]},
    {"id": "heart", "char": "❤️", "keywords": ["сердце", "любовь", "боль"]},
    {"id": "broken_heart", "char": "💔", "keywords": ["разбитое сердце", "расставание", "грусть"]},
    {"id": "thought", "char": "💭", "keywords": ["мысль", "раздумье", "диалог"]},
    {"id": "speech", "char": "💬", "keywords": ["речь", "чат", "общение"]},
    {"id": "silence", "char": "🤫", "keywords": ["тишина", "секрет", "молчание"]},
    {"id": "writing_hand", "char": "✍️", "keywords": ["писать", "автор", "работа"]},
    {"id": "glasses", "char": "👓", "keywords": ["очки", "учёный", "читатель"]},
    {"id": "magnifier", "char": "🔍", "keywords": ["лупа", "детектив", "поиск"]},
    {"id": "lock", "char": "🔒", "keywords": ["замок", "тайна", "доверие"]},
    {"id": "unlocked", "char": "🔓", "keywords": ["открыто", "доверие", "признание"]},
    {"id": "ring", "char": "💍", "keywords": ["кольцо", "обет", "память"]},
    {"id": "diamond", "char": "💎", "keywords": ["бриллиант", "ценность", "душа"]},
    {"id": "feather", "char": "🪶", "keywords": ["перо", "лёгкость", "мысль"]},
    {"id": "shell", "char": "🐚", "keywords": ["ракушка", "море", "тайна"]},
    {"id": "crystal", "char": "🔮", "keywords": ["шар", "судьба", "гадание"]},
    {"id": "note", "char": "🎵", "keywords": ["нота", "мелодия", "чувство"]},
    {"id": "paper", "char": "📄", "keywords": ["лист", "документ", "письмо"]}
  ];

  const allowedEmojis = useMemo(
    () => safeEmojis.filter((emoji) => !blockedEmojiPattern.test(emoji.char)),
    [safeEmojis],
  );

  // Фильтрация эмоджи по поисковому запросу
  const filteredEmojis = useMemo(() => {
    if (!searchTerm.trim()) return allowedEmojis;
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    return allowedEmojis.filter(emoji => 
      emoji.keywords.some(keyword => 
        keyword.toLowerCase().includes(lowerSearchTerm)
      )
    );
  }, [searchTerm, allowedEmojis]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const deltaX = dragStart.x - e.clientX;
    const deltaY = dragStart.y - e.clientY;
    setChatSize((prev) => ({
      width: Math.max(280, prev.width + deltaX),
      height: Math.max(300, prev.height + deltaY),
    }));
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragStart]);

  // Закрытие emoji picker при клике вне его
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (showEmojiPicker) {
        const target = event.target as Element;
        if (!target.closest('.absolute.bottom-10')) {
          setShowEmojiPicker(false);
        }
      }
    };

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showEmojiPicker]);

  const sortedMessages: ChatMessageWithUser[] = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        return aTime - bTime; // Старые сообщения первыми
      }),
    [messages],
  );

  const renderRows: ChatRenderRow[] = useMemo(() => {
    return sortedMessages.map((message, index) => {
      const isOwnMessage = user?.id === message.user?.id;
      const messageTime = message.createdAt
        ? new Date(message.createdAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })
        : "";
      const username = message.user?.username || "Участник";
      const userInitial = username.charAt(0).toUpperCase();

      const prev = sortedMessages[index - 1];
      const currentDate = message.createdAt ? new Date(message.createdAt) : null;
      const prevDate = prev?.createdAt ? new Date(prev.createdAt) : null;
      const showDateDivider = Boolean(currentDate && (!prevDate || !isSameDay(currentDate, prevDate)));
      const isGroupedWithPrev = Boolean(
        prev &&
          prev.user?.id === message.user?.id &&
          currentDate &&
          prevDate &&
          isSameDay(currentDate, prevDate),
      );

      return {
        message,
        showDateDivider,
        dayLabel: showDateDivider && currentDate ? formatDayLabel(currentDate) : null,
        isOwnMessage,
        messageTime,
        username,
        userInitial,
        isGroupedWithPrev,
        showAvatar: !isGroupedWithPrev,
        showUsername: !isOwnMessage && !isGroupedWithPrev,
      };
    });
  }, [sortedMessages, user?.id]);

  const connectionMeta = useMemo(() => {
    if (connected) {
      return { label: "online", dotClass: "bg-emerald-500" };
    }
    if (error) {
      return { label: "ошибка соединения", dotClass: "bg-red-500" };
    }
    return { label: "подключение...", dotClass: "bg-amber-500 animate-pulse" };
  }, [connected, error]);

  return (
    <div className={`fixed bottom-4 right-0 z-40 flex flex-col items-end gap-2 pr-4 transition-transform duration-300 ease-out ${
      open ? "translate-x-0" : "translate-x-[calc(100%-4rem)] hover:translate-x-0 focus-within:translate-x-0"
    }`}>
      {/* Окно чата */}
      {open && (
        <div 
          ref={chatRef}
          className="relative flex flex-col overflow-hidden rounded-2xl border border-border/80 bg-background shadow-2xl backdrop-blur-sm"
          style={{ width: chatSize.width, height: chatSize.height }}
        >
          {/* Resize handle */}
          <div 
            className="absolute top-0 left-0 z-10 flex h-8 w-8 items-start justify-start p-[2px] cursor-nw-resize"
            onMouseDown={handleMouseDown}
            aria-hidden="true"
            title="Потяните для изменения размера"
          >
            <div className="pointer-events-none flex h-6 w-6 items-center justify-center rounded-br-sm border-2 border-transparent bg-muted/85 shadow-sm transition-colors">
              <Maximize2 className="h-3 w-3 rotate-90 text-foreground/90" />
            </div>
          </div>
          <div className="flex items-center justify-between border-b border-border/80 bg-card/95 px-3 py-2.5 backdrop-blur-sm">
            <div className="flex items-center gap-2 pl-7">
              <span className="flex h-8 w-8 items-center justify-center rounded-2xl border border-cyan-200/70 bg-cyan-500/10 text-cyan-600 dark:border-cyan-900 dark:text-cyan-400">
                <MessageCircle className="h-4 w-4" />
              </span>
              <div className="flex flex-col">
                <span className="text-sm font-semibold">Чат клуба</span>
                <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                  <span className={`inline-block h-1.5 w-1.5 rounded-full ${connectionMeta.dotClass}`} />
                  {connectionMeta.label} · участников: {participants.length}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canCleanup && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground" 
                  onClick={handleCleanupDeleted}
                  title="Очистить удалённые сообщения"
                >
                  <Eraser className="w-3 h-3" />
                </Button>
              )}
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-xl text-muted-foreground hover:bg-muted hover:text-foreground"
                onClick={() => {
                  setOpen(false);
                }}
                title="Свернуть чат"
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <ScrollArea ref={scrollAreaRef} className="flex-1 px-3 py-2">
            <div className="space-y-3 text-sm px-1">
              {loadingHistory && (
                <div className="space-y-2 py-2">
                  <div className="h-10 w-2/3 animate-pulse rounded-lg bg-muted" />
                  <div className="h-10 w-1/2 animate-pulse rounded-lg bg-muted" />
                  <div className="h-10 w-3/4 animate-pulse rounded-lg bg-muted" />
                </div>
              )}

              {renderRows.map((row) => {
                const {
                  message: m,
                  showDateDivider,
                  dayLabel,
                  isOwnMessage,
                  messageTime,
                  username,
                  userInitial,
                  isGroupedWithPrev,
                  showAvatar,
                  showUsername,
                } = row;
                
                return (
                  <div key={m.id}>
                    {showDateDivider && dayLabel && (
                      <div className="my-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                        <div className="h-px flex-1 bg-border" />
                        <span>{dayLabel}</span>
                        <div className="h-px flex-1 bg-border" />
                      </div>
                    )}

                    <div className={`group flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-start gap-2 max-w-[75%] ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'} ${isGroupedWithPrev ? 'mt-1' : ''}`}>
                      {/* Avatar */}
                      {showAvatar ? (
                        <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                          isOwnMessage ? 'bg-blue-500' : 'bg-gray-500'
                        }`}>
                          {userInitial}
                        </div>
                      ) : (
                        <div className="w-8 shrink-0" aria-hidden="true" />
                      )}
                      
                      {/* Message bubble */}
                      <div className={`relative px-3 py-2 rounded-2xl shadow-sm ${
                        isOwnMessage 
                          ? 'bg-blue-500 text-white rounded-br-md' 
                          : 'bg-gray-100 text-gray-900 rounded-bl-md'
                      } ${m.deletedAt ? 'opacity-60' : ''}`}>
                        {/* Username for other users */}
                        {showUsername && (
                          <div className="text-xs font-medium text-gray-600 mb-1">
                            {username}
                          </div>
                        )}
                        
                        {/* Message text */}
                        <div className={`text-sm leading-relaxed ${
                          m.deletedAt ? 'italic' : ''
                        } ${isOwnMessage ? 'text-white' : 'text-gray-900'} whitespace-pre-wrap break-words`}>
                          {m.text}
                        </div>
                        
                        {/* Time and delete button */}
                        <div className={`flex items-center justify-between mt-1 gap-2 ${
                          isOwnMessage ? 'flex-row-reverse' : 'flex-row'
                        }`}>
                          <span className={`text-xs ${
                            isOwnMessage ? 'text-blue-100' : 'text-gray-500'
                          }`}>
                            {messageTime}
                          </span>
                          {!m.deletedAt && (
                            <button
                              type="button"
                              className={`opacity-0 group-hover:opacity-100 transition-opacity ${
                                isOwnMessage 
                                  ? 'text-blue-100 hover:text-white' 
                                  : 'text-gray-400 hover:text-red-500'
                              }`}
                              title="Удалить сообщение"
                              onClick={() => m.id && deleteMessage(m.id)}
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          )}
                        </div>
                        
                        {m.deletedAt && (
                          <div className={`text-xs mt-1 ${
                            isOwnMessage ? 'text-blue-200' : 'text-gray-400'
                          }`}>
                            удалено
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          {showScrollToBottom && (
            <div className="pointer-events-none absolute bottom-16 right-3 z-10">
              <Button
                type="button"
                size="icon"
                className="pointer-events-auto h-8 w-8 rounded-full shadow-md"
                onClick={() => scrollToBottom("smooth")}
                title="К последним сообщениям"
              >
                <ChevronDown className="h-4 w-4" />
              </Button>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend();
            }}
            className="relative border-t px-2 py-2 flex items-end gap-2"
          >
            <div className="relative">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                title="Выбрать эмоджи"
              >
                <Smile className="w-4 h-4" />
              </Button>
              
              {/* Custom Safe Emoji Picker */}
              {showEmojiPicker && (
                <div className="absolute bottom-10 left-0 z-50 shadow-lg rounded-lg border bg-background p-4">
                  <div className="w-72 h-80 flex flex-col">
                    {/* Search */}
                    <input
                      type="text"
                      placeholder="Поиск эмоджи..."
                      className="w-full p-2 border rounded mb-3 text-sm"
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                    />
                    
                    {/* Emoji Grid */}
                    <div className="flex-1 overflow-hidden">
                      <div className="grid grid-cols-5 gap-2 max-h-full overflow-y-auto">
                        {filteredEmojis.map((emoji) => (
                          <button
                            key={emoji.id}
                            className="text-2xl hover:bg-gray-100 p-1 rounded transition-colors"
                            onClick={() => {
                              setInput(prev => prev + emoji.char);
                              setShowEmojiPicker(false);
                              setSearchTerm('');
                            }}
                            title={emoji.keywords.join(', ')}
                          >
                            {emoji.char}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <Textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder={connected ? "Напишите сообщение..." : "Подключаем чат..."}
              disabled={!connected}
              rows={1}
              className="min-h-[32px] max-h-[132px] resize-none py-1.5 text-sm"
            />
            <Button
              type="submit"
              size="icon"
              disabled={!canSend}
              aria-label="Отправить сообщение"
              title="Отправить сообщение"
              className={`h-9 w-9 min-w-[2.25rem] shrink-0 rounded-md p-0 transition-colors ${
                canSend
                  ? "bg-cyan-500 text-white hover:bg-cyan-400"
                  : "bg-muted text-muted-foreground hover:bg-muted"
              }`}
            >
              <Send className="h-4 w-4" />
            </Button>
          </form>
        </div>
      )}

      {/* Пузырь чата */}
      <Button
        className={`group relative flex min-w-[220px] items-center gap-3 rounded-2xl border border-cyan-200/80 bg-card/95 px-4 py-3 text-left text-foreground shadow-lg backdrop-blur-sm transition-colors duration-300 hover:border-cyan-300 hover:bg-card ${isIdle ? "opacity-30 hover:opacity-100" : "opacity-100"}`}
        variant="ghost"
        onClick={handleToggle}
        title={open ? "Свернуть чат" : "Открыть чат клуба"}
        aria-label={open ? "Свернуть чат" : "Открыть чат клуба"}
      >
        <span className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-cyan-200 bg-cyan-500/10 text-cyan-600 dark:border-cyan-900 dark:text-cyan-400">
          <MessageCircle className="h-4.5 w-4.5 transition-transform duration-200 group-hover:scale-105" />
          {hasUnread && (
            <span className="absolute right-1.5 top-1.5 inline-flex h-2.5 w-2.5 rounded-full bg-red-500" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className={`inline-block h-1.5 w-1.5 rounded-full ${connectionMeta.dotClass}`} />
            {connectionMeta.label}
            <span className="inline-flex items-center rounded-full bg-cyan-500/10 px-1.5 py-0.5 text-[10px] font-medium leading-none text-cyan-700 dark:text-cyan-300">
              {participants.length}
            </span>
          </span>
          <span className="mt-1 block text-sm font-semibold text-foreground">
            Чат клуба
          </span>
        </span>
      </Button>
    </div>
  );
}
