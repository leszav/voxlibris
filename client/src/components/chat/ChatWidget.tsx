import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Minimize2, Trash2, Eraser, Smile } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Input } from "@/components/ui/input";
import type { ChatMessageWithUser } from "@shared/schema";

interface ChatWidgetProps {
  clubId: string;
  channel?: string;
  onCleanupDeleted?: () => Promise<void>;
  canCleanup?: boolean;
}

export function ChatWidget({ clubId, channel = "general", onCleanupDeleted, canCleanup = false }: ChatWidgetProps) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [hasUnread, setHasUnread] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [chatSize, setChatSize] = useState({ width: 335, height: 409 });
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const lastMessageCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

  const { user } = useAuth();
  const { messages, participants, sendMessage, deleteMessage, connected, client } = useChat({
    clubId,
    channel,
  });

  // Автоскролл вниз при новых сообщениях, если окно раскрыто
  useEffect(() => {
    if (!open) return;
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [messages.length, open]);

  // Подсветка пузыря при новых сообщениях, если окно свернуто
  useEffect(() => {
    if (!open && messages.length > lastMessageCountRef.current) {
      setHasUnread(true);
    }
    lastMessageCountRef.current = messages.length;
  }, [messages.length, open]);

  const handleToggle = () => {
    setOpen((prev) => !prev);
    if (!open) {
      // Сбрасываем индикатор непрочитанных при открытии
      setHasUnread(false);
    }
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    const text = input.trim();
    if (!text) return;
    sendMessage(text);
    setInput("");
  };

  const handleCleanupDeleted = async () => {
    if (!onCleanupDeleted) return;
    const confirmed = confirm(
      "Очистить все удалённые сообщения из чата? Это действие необратимо."
    );
    if (confirmed) {
      await onCleanupDeleted();
      // Перезагружаем историю чата после очистки
      if (client) {
        client.loadHistory({ clubId, channel, offset: 0, limit: 50 });
      }
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

  // Фильтрация эмоджи по поисковому запросу
  const filteredEmojis = useMemo(() => {
    if (!searchTerm.trim()) return safeEmojis;
    
    const lowerSearchTerm = searchTerm.toLowerCase();
    return safeEmojis.filter(emoji => 
      emoji.keywords.some(keyword => 
        keyword.toLowerCase().includes(lowerSearchTerm)
      )
    );
  }, [searchTerm]);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.target !== e.currentTarget) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    const deltaX = dragStart.x - e.clientX;
    const deltaY = dragStart.y - e.clientY;
    setChatSize(prev => ({
      width: Math.max(280, prev.width + deltaX),
      height: Math.max(300, prev.height + deltaY)
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
        return aTime - bTime;
      }),
    [messages],
  );

  return (
    <div className="fixed bottom-4 right-4 z-40 flex flex-col items-end gap-2">
      {/* Окно чата */}
      {open && (
        <div 
          ref={chatRef}
          className="rounded-lg shadow-xl border bg-background flex flex-col overflow-hidden relative"
          style={{ width: chatSize.width, height: chatSize.height }}
        >
          {/* Resize handle */}
          <div 
            className="absolute top-0 left-0 w-4 h-4 cursor-nw-resize bg-muted/20 hover:bg-muted/40 transition-colors"
            onMouseDown={handleMouseDown}
            title="Потяните для изменения размера"
          />
          <div className="flex items-center justify-between px-3 py-2 border-b bg-muted/60">
            <div className="flex items-center gap-2">
              <MessageCircle className="w-4 h-4" />
              <div className="flex flex-col">
                <span className="text-sm font-medium">Чат клуба</span>
                <span className="text-xs text-muted-foreground">
                  {connected ? "online" : "подключение..."} · участников: {participants.length}
                </span>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {canCleanup && (
                <Button 
                  variant="ghost" 
                  size="icon" 
                  className="h-7 w-7" 
                  onClick={handleCleanupDeleted}
                  title="Очистить удалённые сообщения"
                >
                  <Eraser className="w-3 h-3" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setOpen(false)}>
                <Minimize2 className="w-3 h-3" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                onClick={() => {
                  setOpen(false);
                }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>

          <ScrollArea className="flex-1 px-3 py-2">
            <div className="space-y-3 text-sm px-1">
              {sortedMessages.map((m) => {
                const isOwnMessage = user?.id === m.user?.id;
                const messageTime = m.createdAt
                  ? new Date(m.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
                  : '';
                const username = m.user?.username || "Участник";
                const userInitial = username.charAt(0).toUpperCase();
                
                return (
                  <div key={m.id} className={`group flex ${isOwnMessage ? 'justify-end' : 'justify-start'}`}>
                    <div className={`flex items-start gap-2 max-w-[75%] ${isOwnMessage ? 'flex-row-reverse' : 'flex-row'}`}>
                      {/* Avatar */}
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0 ${
                        isOwnMessage ? 'bg-blue-500' : 'bg-gray-500'
                      }`}>
                        {userInitial}
                      </div>
                      
                      {/* Message bubble */}
                      <div className={`relative px-3 py-2 rounded-2xl shadow-sm ${
                        isOwnMessage 
                          ? 'bg-blue-500 text-white rounded-br-md' 
                          : 'bg-gray-100 text-gray-900 rounded-bl-md'
                      } ${m.deletedAt ? 'opacity-60' : ''}`}>
                        {/* Username for other users */}
                        {!isOwnMessage && (
                          <div className="text-xs font-medium text-gray-600 mb-1">
                            {username}
                          </div>
                        )}
                        
                        {/* Message text */}
                        <div className={`text-sm leading-relaxed ${
                          m.deletedAt ? 'italic' : ''
                        } ${isOwnMessage ? 'text-white' : 'text-gray-900'}`}>
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
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <form onSubmit={handleSend} className="border-t px-2 py-2 flex items-center gap-2">
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
            
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={connected ? "Напишите сообщение..." : "Подключаем чат..."}
              disabled={!connected}
              className="h-8 text-sm"
            />
            <Button type="submit" size="sm" disabled={!connected || !input.trim()}>
              Отпр.
            </Button>
          </form>
        </div>
      )}

      {/* Пузырь чата */}
      <Button
        size="icon"
        className={`h-12 w-12 rounded-full shadow-lg relative transition-transform ${
          hasUnread ? "ring-2 ring-primary scale-105" : ""
        }`}
        variant="default"
        onClick={handleToggle}
      >
        <MessageCircle className="w-6 h-6" />
        {hasUnread && (
          <span className="absolute -top-1 -right-1 inline-flex h-3 w-3 rounded-full bg-red-500 animate-pulse" />
        )}
      </Button>
    </div>
  );
}
