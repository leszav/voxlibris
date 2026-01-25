import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Minimize2, Trash2, Eraser } from "lucide-react";
import { useChat } from "@/hooks/use-chat";
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
  const [chatSize, setChatSize] = useState({ width: 320, height: 384 });
  const lastMessageCountRef = useRef(0);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const chatRef = useRef<HTMLDivElement | null>(null);

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

  const sortedMessages: ChatMessageWithUser[] = useMemo(
    () =>
      [...messages].sort((a, b) => {
        const aTime = a.createdAt ? new Date(a.createdAt as any).getTime() : 0;
        const bTime = b.createdAt ? new Date(b.createdAt as any).getTime() : 0;
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
            <div className="space-y-2 text-sm">
              {sortedMessages.map((m) => (
                <div key={m.id} className="group flex flex-col gap-0.5">
                  <div className="flex items-center justify-between">
                    <span className="font-medium text-xs">
                      {(m as any).user?.username || "Участник"}
                    </span>
                    {m.deletedAt ? (
                      <span className="text-[10px] text-muted-foreground">удалено</span>
                    ) : null}
                  </div>
                  <div className="flex items-start gap-2">
                    <p className={`text-sm ${m.deletedAt ? "italic text-muted-foreground" : ""}`}>
                      {m.text}
                    </p>
                    {!m.deletedAt && (
                      <button
                        type="button"
                        className="opacity-0 group-hover:opacity-100 text-[10px] text-muted-foreground hover:text-destructive flex items-center"
                        title="Удалить сообщение"
                        onClick={() => m.id && deleteMessage(m.id)}
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </ScrollArea>

          <form onSubmit={handleSend} className="border-t px-2 py-2 flex items-center gap-2">
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