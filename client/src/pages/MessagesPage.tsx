import { useState, useEffect, useRef, useCallback, type ReactNode } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearch } from "wouter";
import { ArrowLeft, Send, MessageSquare, Trash2, Loader2, Flag, Share2, BookOpen } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { apiRequest, authFetch } from "@/lib/queryClient";
import { useAuth } from "@/hooks/use-auth";
import { useSocket } from "@/hooks/use-socket";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { ru } from "date-fns/locale";

interface OtherUser {
  id: string;
  username: string;
  displayName: string | null;
  avatar: string | null;
}

interface Conversation {
  id: string;
  otherUser: OtherUser;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  unreadCount: number;
  createdAt: string;
}

interface DmMessage {
  id: string;
  conversationId: string;
  senderId: string;
  body: string;
  isDeleted: boolean;
  createdAt: string;
  readAt: string | null;
}

type RecommendationType = "book" | "club" | "reader";

type RecommendationMeta = {
  type: RecommendationType;
  entityId: string;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  comment?: string | null;
};

const BOOK_SHARE_PREFIX = "[BOOK_SHARE]";
const RECOMMEND_PREFIX = "[RECOMMEND]";

function encodeRecommendation(meta: RecommendationMeta): string {
  return `${RECOMMEND_PREFIX}${JSON.stringify(meta)}`;
}

function asRecommendationType(value: unknown): RecommendationType | null {
  if (value === "book" || value === "club" || value === "reader") {
    return value;
  }
  return null;
}

function parseRecommendationRaw(raw: string): RecommendationMeta | null {
  const parsed = JSON.parse(raw) as Partial<RecommendationMeta>;
  if (!parsed || typeof parsed !== "object") return null;

  const type = asRecommendationType(parsed.type);
  if (!type || typeof parsed.entityId !== "string" || typeof parsed.title !== "string") {
    return null;
  }

  return {
    type,
    entityId: parsed.entityId,
    title: parsed.title,
    subtitle: typeof parsed.subtitle === "string" ? parsed.subtitle : null,
    imageUrl: typeof parsed.imageUrl === "string" ? parsed.imageUrl : null,
    comment: typeof parsed.comment === "string" ? parsed.comment : null,
  };
}

function parseLegacyBookRecommendationRaw(raw: string): RecommendationMeta | null {
  const parsed = JSON.parse(raw) as {
    bookId?: string;
    title?: string;
    author?: string;
    coverUrl?: string | null;
    comment?: string | null;
  };
  if (!parsed || typeof parsed !== "object") return null;
  if (typeof parsed.bookId !== "string" || typeof parsed.title !== "string") {
    return null;
  }

  return {
    type: "book",
    entityId: parsed.bookId,
    title: parsed.title,
    subtitle: typeof parsed.author === "string" ? `Автор: ${parsed.author}` : null,
    imageUrl: typeof parsed.coverUrl === "string" ? parsed.coverUrl : null,
    comment: typeof parsed.comment === "string" ? parsed.comment : null,
  };
}

function parseRecommendation(body: string): RecommendationMeta | null {
  try {
    if (body.startsWith(RECOMMEND_PREFIX)) {
      return parseRecommendationRaw(body.slice(RECOMMEND_PREFIX.length));
    }
    if (body.startsWith(BOOK_SHARE_PREFIX)) {
      return parseLegacyBookRecommendationRaw(body.slice(BOOK_SHARE_PREFIX.length));
    }
    return null;
  } catch {
    return null;
  }
}

function getRecommendationTitle(type: RecommendationType): string {
  if (type === "book") return "Рекомендация книги";
  if (type === "club") return "Рекомендация клуба";
  return "Рекомендация чтеца";
}

function getRecommendationPlaceholder(type: RecommendationType): string {
  if (type === "book") return "Введите ID книги";
  if (type === "club") return "Введите ID клуба";
  return "Введите ID чтеца";
}

function renderRecommendationContent(recommendation: RecommendationMeta): ReactNode {
  return (
    <div className="space-y-2 min-w-[220px]">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide opacity-80">
        <BookOpen className="h-3.5 w-3.5" />
        {getRecommendationTitle(recommendation.type)}
      </div>
      <div className="rounded-lg border bg-background/70 p-2">
        <p className="text-sm font-medium leading-tight">{recommendation.title}</p>
        {recommendation.subtitle ? (
          <p className="text-xs opacity-80 mt-1">{recommendation.subtitle}</p>
        ) : null}
        {recommendation.comment ? (
          <p className="text-xs mt-2 opacity-90">Комментарий: {recommendation.comment}</p>
        ) : null}
      </div>
    </div>
  );
}

async function fetchBookRecommendationMeta(entityId: string, comment: string): Promise<RecommendationMeta> {
  const res = await authFetch(`/api/books/${encodeURIComponent(entityId)}`);
  if (!res.ok) throw new Error("Книга не найдена");

  const data = await res.json() as {
    book?: { id: string; title: string; author: string; coverUrl?: string | null };
  };
  const book = data.book;
  if (!book?.id || !book.title || !book.author) {
    throw new Error("Не удалось получить метаданные книги");
  }

  return {
    type: "book",
    entityId: book.id,
    title: book.title,
    subtitle: `Автор: ${book.author}`,
    imageUrl: book.coverUrl ?? null,
    comment: comment || null,
  };
}

async function fetchClubRecommendationMeta(entityId: string, comment: string): Promise<RecommendationMeta> {
  const res = await authFetch(`/api/clubs/${encodeURIComponent(entityId)}`);
  if (!res.ok) throw new Error("Клуб не найден или недоступен");

  const club = await res.json() as {
    id?: string;
    title?: string;
    description?: string | null;
    coverImage?: string | null;
    ownerName?: string | null;
  };
  if (!club?.id || !club.title) {
    throw new Error("Не удалось получить метаданные клуба");
  }

  return {
    type: "club",
    entityId: club.id,
    title: club.title,
    subtitle: club.ownerName ? `Владелец: ${club.ownerName}` : (club.description ?? null),
    imageUrl: club.coverImage ?? null,
    comment: comment || null,
  };
}

async function fetchReaderRecommendationMeta(entityId: string, comment: string): Promise<RecommendationMeta> {
  const res = await authFetch(`/api/users/${encodeURIComponent(entityId)}/profile`);
  if (!res.ok) throw new Error("Профиль чтеца недоступен");

  const data = await res.json() as {
    success?: boolean;
    profile?: { id: string; username: string; displayName?: string | null; avatar?: string | null };
  };
  const profile = data.profile;
  if (!data.success || !profile?.id || !profile.username) {
    throw new Error("Не удалось получить метаданные профиля");
  }

  return {
    type: "reader",
    entityId: profile.id,
    title: profile.displayName || profile.username,
    subtitle: `@${profile.username}`,
    imageUrl: profile.avatar ?? null,
    comment: comment || null,
  };
}

async function fetchRecommendationMeta(type: RecommendationType, entityId: string, comment: string): Promise<RecommendationMeta> {
  if (type === "book") return fetchBookRecommendationMeta(entityId, comment);
  if (type === "club") return fetchClubRecommendationMeta(entityId, comment);
  return fetchReaderRecommendationMeta(entityId, comment);
}

// ─── ConversationList ────────────────────────────────────────────────────────

function ConversationList({
   selected,
   onSelect,
 }: Readonly<{
   selected: string | null;
   onSelect: (conv: Conversation) => void;
}>) {
  const { data, isLoading } = useQuery<{ conversations: Conversation[] }>({
    queryKey: ["/api/dm/conversations"],
    queryFn: () => authFetch("/api/dm/conversations").then((r) => r.json()),
    refetchInterval: 30_000,
  });

  const conversations = data?.conversations ?? [];

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-32 text-muted-foreground text-sm">
        <Loader2 className="h-4 w-4 animate-spin mr-2" /> Загрузка...
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-muted-foreground text-sm gap-2">
        <MessageSquare className="h-8 w-8 opacity-40" />
        <p>Нет диалогов</p>
        <p className="text-xs">Откройте профиль пользователя и нажмите «Написать»</p>
      </div>
    );
  }

  return (
    <ul className="divide-y">
      {conversations.map((conv) => {
        const name = conv.otherUser.displayName || conv.otherUser.username;
        const initials = name.slice(0, 2).toUpperCase();
        const isActive = conv.id === selected;

        return (
          <li key={conv.id}>
            <button
              className={`w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors ${isActive ? "bg-muted" : ""}`}
              onClick={() => onSelect(conv)}
            >
              <div className="relative flex-shrink-0">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={conv.otherUser.avatar ?? ""} />
                  <AvatarFallback className="text-xs">{initials}</AvatarFallback>
                </Avatar>
                {conv.unreadCount > 0 && (
                  <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-xs rounded-full h-5 w-5 flex items-center justify-center font-medium">
                    {conv.unreadCount > 9 ? "9+" : conv.unreadCount}
                  </span>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between gap-1">
                  <span className={`text-sm font-medium truncate ${conv.unreadCount > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {name}
                  </span>
                  {conv.lastMessageAt && (
                    <span className="text-xs text-muted-foreground flex-shrink-0">
                      {formatDistanceToNow(new Date(conv.lastMessageAt), { locale: ru, addSuffix: false })}
                    </span>
                  )}
                </div>
                {conv.lastMessagePreview && (
                  <p className="text-xs text-muted-foreground truncate mt-0.5">
                    {conv.lastMessagePreview}
                  </p>
                )}
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ─── MessageBubble ───────────────────────────────────────────────────────────

function MessageBubble({
   msg,
   isOwn,
   isReported,
   onDelete,
   onReport,
 }: Readonly<{
   msg: DmMessage;
   isOwn: boolean;
   isReported: boolean;
   onDelete: (id: string) => void;
   onReport: (id: string, category: string) => void;
}>) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const recommendation = msg.isDeleted ? null : parseRecommendation(msg.body);
  let messageContent: ReactNode;
  if (msg.isDeleted) {
    messageContent = "Сообщение удалено";
  } else if (recommendation) {
    messageContent = renderRecommendationContent(recommendation);
  } else {
    messageContent = msg.body;
  }

  let bubbleClassName: string;
  if (msg.isDeleted) {
    bubbleClassName = "bg-muted text-muted-foreground italic";
  } else if (isOwn) {
    bubbleClassName = "bg-primary text-primary-foreground";
  } else {
    bubbleClassName = "bg-muted text-foreground";
  }

  return (
    <div
      className={`flex ${isOwn ? "justify-end" : "justify-start"} mb-1`}
    >
      <div className="relative max-w-[70%] group">
        <div className={`px-3 py-2 rounded-2xl text-sm break-words ${bubbleClassName}`}>{messageContent}</div>
        <div className={`flex items-center gap-1 mt-0.5 ${isOwn ? "justify-end" : "justify-start"}`}>
          <span className="text-[10px] text-muted-foreground">
            {formatDistanceToNow(new Date(msg.createdAt), { locale: ru, addSuffix: true })}
          </span>
          {isOwn && msg.readAt && <span className="text-[10px] text-muted-foreground">✓✓</span>}
        </div>
        {/* Кнопка удаления (только для своих) */}
        {isOwn && !msg.isDeleted && (
          <button
            className="absolute -left-7 top-1 text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100"
            onClick={() => onDelete(msg.id)}
            title="Удалить"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        {/* Кнопка жалобы (только для чужих) */}
        {!isOwn && !msg.isDeleted && (
          <DropdownMenu open={dropdownOpen} onOpenChange={setDropdownOpen}>
            <DropdownMenuTrigger asChild>
              <button
                className={`absolute -right-7 top-1 transition-colors opacity-0 group-hover:opacity-100 ${isReported ? "!opacity-100 text-orange-500" : "text-muted-foreground hover:text-orange-500"}`}
                title={isReported ? "Жалоба отправлена" : "Пожаловаться"}
                disabled={isReported}
              >
                <Flag className="h-3.5 w-3.5" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="text-sm">
              <DropdownMenuItem onClick={() => onReport(msg.id, 'spam')}>Спам</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReport(msg.id, 'harassment')}>Харассмент</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReport(msg.id, 'threats')}>Угрозы</DropdownMenuItem>
              <DropdownMenuItem onClick={() => onReport(msg.id, 'other')}>Другое</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </div>
  );
}

// ─── ConversationView ────────────────────────────────────────────────────────

function ConversationView({
   conv,
   onBack,
 }: Readonly<{
   conv: Conversation;
   onBack: () => void;
}>) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const [text, setText] = useState("");
  const [messages, setMessages] = useState<DmMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(true);
  const [reportedMsgIds, setReportedMsgIds] = useState<Set<string>>(new Set());
  const [recommendDialogOpen, setRecommendDialogOpen] = useState(false);
  const [recommendType, setRecommendType] = useState<RecommendationType>("book");
  const [recommendEntityId, setRecommendEntityId] = useState("");
  const [recommendComment, setRecommendComment] = useState("");
  const [recommendLoading, setRecommendLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const prependAnchorRef = useRef<number | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const socket = useSocket();
  const PAGE_SIZE = 40;

  // Загрузить сообщения
  const loadMessages = useCallback(async () => {
    setLoadingMessages(true);
    try {
      const res = await authFetch(`/api/dm/conversations/${conv.id}/messages?limit=${PAGE_SIZE}`);
      const data = await res.json() as { messages: DmMessage[] };
      setMessages(data.messages ?? []);
      setHasMoreMessages((data.messages?.length ?? 0) === PAGE_SIZE);
      shouldStickToBottomRef.current = true;
    } finally {
      setLoadingMessages(false);
    }
  }, [conv.id]);

  const loadOlderMessages = useCallback(async () => {
    if (loadingMessages || loadingOlder || !hasMoreMessages || messages.length === 0) return;
    const oldestMessageId = messages[0]?.id;
    if (!oldestMessageId) return;

    const listEl = listRef.current;
    prependAnchorRef.current = listEl ? listEl.scrollHeight : null;
    shouldStickToBottomRef.current = false;
    setLoadingOlder(true);

    try {
      const res = await authFetch(`/api/dm/conversations/${conv.id}/messages?limit=${PAGE_SIZE}&before=${encodeURIComponent(oldestMessageId)}`);
      const data = await res.json() as { messages: DmMessage[] };
      const older = data.messages ?? [];

      if (older.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      setHasMoreMessages(older.length === PAGE_SIZE);
      setMessages((prev) => {
        const knownIds = new Set(prev.map((m) => m.id));
        const uniqueOlder = older.filter((m) => !knownIds.has(m.id));
        return [...uniqueOlder, ...prev];
      });
    } finally {
      setLoadingOlder(false);
    }
  }, [conv.id, hasMoreMessages, loadingMessages, loadingOlder, messages]);

  useEffect(() => {
    loadMessages();
  }, [loadMessages]);

  // Скролл вниз при новых сообщениях
  useEffect(() => {
    if (shouldStickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  // Сохранить позицию viewport при догрузке старых сообщений сверху
  useEffect(() => {
    if (prependAnchorRef.current === null) return;
    const listEl = listRef.current;
    if (!listEl) {
      prependAnchorRef.current = null;
      return;
    }

    const prevHeight = prependAnchorRef.current;
    requestAnimationFrame(() => {
      const nextHeight = listEl.scrollHeight;
      listEl.scrollTop += nextHeight - prevHeight;
      prependAnchorRef.current = null;
    });
  }, [messages]);

  // Пометить прочитанным при открытии
  useEffect(() => {
    if (!user) return;
    authFetch(`/api/dm/conversations/${conv.id}/read`, { method: "POST" }).catch(() => {});
    queryClient.invalidateQueries({ queryKey: ["/api/dm/conversations"] });
    queryClient.invalidateQueries({ queryKey: ["/api/dm/unread"] });
  }, [conv.id, user, queryClient]);

  // Real-time сообщения
  useEffect(() => {
    if (!socket || !user) return;

    const handler = (data: { conversationId: string; message: DmMessage }) => {
      if (data.conversationId !== conv.id) return;
      shouldStickToBottomRef.current = true;
      setMessages((prev) => [...prev, data.message]);
      // Пометить прочитанным
      authFetch(`/api/dm/conversations/${conv.id}/read`, { method: "POST" }).catch(() => {});
      queryClient.invalidateQueries({ queryKey: ["/api/dm/conversations"] });
      queryClient.invalidateQueries({ queryKey: ["/api/dm/unread"] });
    };

    const sentHandler = (data: { message: DmMessage }) => {
      shouldStickToBottomRef.current = true;
      setMessages((prev) => [...prev, data.message]);
      queryClient.invalidateQueries({ queryKey: ["/api/dm/conversations"] });
    };

    socket.on("dm:new_message", handler);
    socket.on("dm:message_sent", sentHandler);
    return () => {
      socket.off("dm:new_message", handler);
      socket.off("dm:message_sent", sentHandler);
    };
  }, [socket, conv.id, user, queryClient]);

  const sendMutation = useMutation({
    mutationFn: async (body: string) => {
      if (socket?.connected && user) {
        // Real-time через сокет
        socket.emit("dm:send", {
          conversationId: conv.id,
          body,
          tempId: crypto.randomUUID(),
        });
        return;
      }
      // HTTP fallback
      const res = await authFetch(`/api/dm/conversations/${conv.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });
      if (!res.ok) throw new Error("Failed to send");
      const data = await res.json() as { message: DmMessage };
      setMessages((prev) => [...prev, data.message]);
      queryClient.invalidateQueries({ queryKey: ["/api/dm/conversations"] });
    },
  });

  const handleSend = () => {
    const trimmed = text.trim();
    if (!trimmed || sendMutation.isPending) return;
    shouldStickToBottomRef.current = true;
    setText("");
    sendMutation.mutate(trimmed);
  };

  const handleRecommendEntity = async () => {
    const entityId = recommendEntityId.trim();
    if (!entityId) {
      toast({ title: "Укажите ID сущности", variant: "destructive" });
      return;
    }

    try {
      setRecommendLoading(true);
      const meta = await fetchRecommendationMeta(recommendType, entityId, recommendComment.trim());
      const payload = encodeRecommendation(meta);

      shouldStickToBottomRef.current = true;
      sendMutation.mutate(payload);
      setRecommendDialogOpen(false);
      setRecommendEntityId("");
      setRecommendComment("");
      toast({ title: "Рекомендация отправлена" });
    } catch (error) {
      const title = error instanceof Error && error.message
        ? error.message
        : "Не удалось отправить рекомендацию";
      toast({ title, variant: "destructive" });
    } finally {
      setRecommendLoading(false);
    }
  };

  const handleMessagesScroll = () => {
    const listEl = listRef.current;
    if (!listEl) return;
    if (listEl.scrollTop <= 40) {
      void loadOlderMessages();
    }
  };

  const deleteMutation = useMutation({
    mutationFn: async (msgId: string) => {
      await authFetch(`/api/dm/messages/${msgId}`, { method: "DELETE" });
      setMessages((prev) =>
        prev.map((m) => (m.id === msgId ? { ...m, isDeleted: true, body: "" } : m)),
      );
    },
  });

  const reportMutation = useMutation({
    mutationFn: async ({ msgId, category }: { msgId: string; category: string }) => {
      await apiRequest(`/api/dm/messages/${msgId}/report`, {
        method: "POST",
        body: JSON.stringify({ category }),
      });
    },
    onSuccess: (_data, { msgId }) => {
      setReportedMsgIds((prev) => new Set(prev).add(msgId));
      toast({ title: "Жалоба отправлена", description: "Мы рассмотрим её в ближайшее время." });
    },
    onError: () => {
      toast({ title: "Не удалось отправить жалобу", variant: "destructive" });
    },
  });

  const name = conv.otherUser.displayName || conv.otherUser.username;
  const recommendPlaceholder = getRecommendationPlaceholder(recommendType);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-3 border-b bg-background">
        <Button variant="ghost" size="icon" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <Avatar className="h-8 w-8">
          <AvatarImage src={conv.otherUser.avatar ?? ""} />
          <AvatarFallback className="text-xs">{name.slice(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div>
          <p className="text-sm font-medium">{name}</p>
          <p className="text-xs text-muted-foreground">@{conv.otherUser.username}</p>
        </div>
      </div>

      {/* Messages */}
      <div ref={listRef} className="flex-1 overflow-y-auto p-4 space-y-1" onScroll={handleMessagesScroll}>
        {loadingOlder && (
          <div className="flex justify-center pb-2">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {loadingMessages && (
          <div className="flex justify-center pt-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
        {!loadingMessages && messages.length === 0 && (
          <p className="text-center text-muted-foreground text-sm pt-8">
            Начните диалог — напишите первое сообщение
          </p>
        )}
        {!loadingMessages && messages.length > 0 && (
          messages.map((msg) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              isOwn={msg.senderId === user?.id}
              isReported={reportedMsgIds.has(msg.id)}
              onDelete={(id) => deleteMutation.mutate(id)}
              onReport={(id, category) => reportMutation.mutate({ msgId: id, category })}
            />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="p-3 border-t bg-background">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
        >
          <Input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Напишите сообщение..."
            className="flex-1"
            maxLength={4000}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
          />
          <Button type="submit" size="icon" disabled={!text.trim() || sendMutation.isPending}>
            <Send className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => setRecommendDialogOpen(true)}
            title="Порекомендовать"
            disabled={sendMutation.isPending}
          >
            <Share2 className="h-4 w-4" />
          </Button>
        </form>
      </div>

      <Dialog open={recommendDialogOpen} onOpenChange={setRecommendDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Порекомендовать</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="recommend-type">Тип рекомендации</Label>
              <select
                id="recommend-type"
                className="w-full rounded-md border bg-background px-3 py-2 text-sm"
                value={recommendType}
                onChange={(e) => setRecommendType(e.target.value as RecommendationType)}
              >
                <option value="book">Книга</option>
                <option value="club">Клуб</option>
                <option value="reader">Чтец</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="recommend-entity-id">ID</Label>
              <Input
                id="recommend-entity-id"
                placeholder={recommendPlaceholder}
                value={recommendEntityId}
                onChange={(e) => setRecommendEntityId(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="recommend-comment">Комментарий к рекомендации</Label>
              <Textarea
                id="recommend-comment"
                placeholder="Почему рекомендуете?"
                value={recommendComment}
                onChange={(e) => setRecommendComment(e.target.value)}
                maxLength={500}
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Отправляются только метаданные сущности (книга, клуб или чтец) и ваш комментарий. Контент книги не передаётся.
            </p>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setRecommendDialogOpen(false)}>
              Отмена
            </Button>
            <Button type="button" onClick={() => void handleRecommendEntity()} disabled={recommendLoading}>
              {recommendLoading ? "Отправка..." : "Отправить"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ─── MessagesPanel (embeddable, sheet-friendly) ───────────────────────────────

export function MessagesPanel({ initialConvId }: { readonly initialConvId?: string | null }) {
  const [selectedConv, setSelectedConv] = useState<Conversation | null>(null);
  const { user } = useAuth();
  const socket = useSocket();
  const queryClient = useQueryClient();
  const search = useSearch();
  const urlConvId = new URLSearchParams(search).get('conv');
  const targetConvId = urlConvId || initialConvId;

  // Auto-select when conversations load and targetConvId is set
  const { data: initData } = useQuery<{ conversations: Conversation[] }>({
    queryKey: ["/api/dm/conversations"],
    queryFn: () => authFetch("/api/dm/conversations").then((r) => r.json()),
    enabled: !!targetConvId,
  });
  useEffect(() => {
    if (!targetConvId || !initData?.conversations) return;
    const conv = initData.conversations.find((c) => c.id === targetConvId);
    if (conv) setSelectedConv(conv);
  }, [targetConvId, initData]);

  // Real-time: обновить список диалогов при новом сообщении
  useEffect(() => {
    if (!socket || !user) return;
    const handler = () => {
      queryClient.invalidateQueries({ queryKey: ["/api/dm/conversations"] });
    };
    socket.on("dm:new_message", handler);
    return () => { socket.off("dm:new_message", handler); };
  }, [socket, user, queryClient]);

  return (
    <div className="flex h-[70vh] min-h-[520px] max-h-[calc(100vh-12rem)] overflow-hidden">
      {/* Sidebar — список диалогов */}
      <div className={`w-full md:w-72 border-r flex flex-col flex-shrink-0 ${selectedConv ? "hidden md:flex" : "flex"}`}>
        <div className="p-4 border-b flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          <span className="font-semibold">Сообщения</span>
        </div>
        <div className="flex-1 overflow-y-auto">
          <ConversationList
            selected={selectedConv?.id ?? null}
            onSelect={setSelectedConv}
          />
        </div>
      </div>

      {/* Основная область */}
      <div className={`flex-1 flex flex-col min-w-0 ${selectedConv ? "flex" : "hidden md:flex"}`}>
        {selectedConv ? (
          <ConversationView
            conv={selectedConv}
            onBack={() => setSelectedConv(null)}
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-muted-foreground gap-3">
            <MessageSquare className="h-12 w-12 opacity-30" />
            <p className="text-sm">Выберите диалог</p>
          </div>
        )}
      </div>
    </div>
  );
}
