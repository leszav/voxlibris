import { useEffect, useMemo, useRef, useState } from "react";
import { MessageCircle, X, Minimize2, Trash2, Eraser, Smile } from "lucide-react";
import Picker from 'emoji-picker-react';
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
  const [chatSize, setChatSize] = useState({ width: 320, height: 384 });
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
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

  const onEmojiClick = (emojiObject: any) => {
    const emoji = emojiObject.emoji;
    setInput(prev => prev + emoji);
    setShowEmojiPicker(false);
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
            <div className="space-y-3 text-sm px-1">
              {sortedMessages.map((m) => {
                // Debug: логируем структуру сообщения
                if (import.meta.env.DEV) {
                  console.log('Message structure:', m);
                }
                
                const isOwnMessage = user?.id === m.user?.id;
                const messageTime = m.createdAt ? new Date(m.createdAt as any).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' }) : '';
                // Используем displayName, если есть, иначе username
                const username = m.user?.displayName || m.user?.username || (m as any).user?.displayName || (m as any).user?.username || (m as any).username || "Участник";
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
              
              {/* Emoji Picker */}
              {showEmojiPicker && (
                <div className="absolute bottom-10 left-0 z-50 shadow-lg rounded-lg border bg-background">
                  <Picker onEmojiClick={onEmojiClick} />
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