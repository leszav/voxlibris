import { useCallback, useEffect, useRef, useState } from "react";
import { ChatWebSocketClient, type ChatWebSocketConfig } from "../lib/chat-websocket";
import type { ChatMessageWithUser } from "@shared/schema";
import { getAccessToken, setAccessToken } from "@/lib/token-store";

interface UseChatOptions {
  clubId: string;
  channel?: string;
  autoConnect?: boolean;
}

interface ChatState {
  connected: boolean;
  loadingHistory: boolean;
  error: Error | null;
  messages: ChatMessageWithUser[];
  participants: ChatMessageWithUser["user"][];
}

export function useChat(options: UseChatOptions) {
  const { clubId, channel, autoConnect = true } = options;
  const clientRef = useRef<ChatWebSocketClient | null>(null);
  const [state, setState] = useState<ChatState>({
    connected: false,
    loadingHistory: false,
    error: null,
    messages: [],
    participants: [],
  });

  const getToken = () => {
    if (globalThis.window === undefined) return "";
    const token = getAccessToken();
    if (!token) {
      console.warn("[useChat] No authentication token found");
      return "";
    }
    
    // Проверим базовую валидность токена (формат)
    try {
      const parts = token.split('.');
      if (parts.length !== 3) {
        console.warn("[useChat] Invalid token format");
        return "";
      }
      // Декодируем payload для проверки срока действия
      const payload = JSON.parse(atob(parts[1]));
      const now = Math.floor(Date.now() / 1000);
      if (payload.exp && payload.exp < now) {
        console.warn("[useChat] Token expired");
        setAccessToken(null);
        return "";
      }
    } catch (e) {
      console.warn("[useChat] Token validation failed:", e);
      setAccessToken(null);
      return "";
    }
    
    return token;
  };
  
  const getFreshToken = () => {
    const token = getToken();
    if (!token) return token;
    
    // Проверяем свежесть токена перед каждым WebSocket подключением
    try {
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(atob(parts[1]));
        const now = Math.floor(Date.now() / 1000);
        const expThreshold = 60; // 60 секунд запаса
        
        if (payload.exp && payload.exp < (now - expThreshold)) {
          console.warn("[useChat] Token too old for WebSocket, removing...");
          setAccessToken(null);
          return "";
        }
      }
    } catch (e) {
      console.warn("[useChat] Token validation failed:", e);
      setAccessToken(null);
      return "";
    }
    
    return token;
  };

  const token = getFreshToken();

  useEffect(() => {
    if (!token || !autoConnect) return;
    
    // Проверим аутентификацию перед подключением
    const currentToken = getToken();
    if (!currentToken) {
      setState((prev) => ({ 
        ...prev, 
        error: new Error("Требуется авторизация. Войдите в систему.")
      }));
      return;
    }

    const config: ChatWebSocketConfig = {
      token,
      onConnect: () => {
        setState((prev) => ({ ...prev, connected: true, error: null }));

        // После установления соединения автоматически заходим в комнату и грузим историю
        const client = clientRef.current;
        if (client && clubId) {
          client.joinRoom(clubId, channel);
          client.getParticipants({ clubId, channel });
          setState((prev) => ({ ...prev, loadingHistory: true }));
          client.loadHistory({ clubId, channel, offset: 0, limit: 50 });
        }
      },
      onDisconnect: () => {
        setState((prev) => ({ ...prev, connected: false }));
      },
      onError: (error) => {
        console.error("[useChat] WebSocket error:", error);
        // Если ошибка аутентификации, покажем понятное сообщение
        if (error.message?.includes("Authentication") || error.message?.includes("token")) {
          setState((prev) => ({ 
            ...prev, 
            error: new Error("Ошибка аутентификации. Пожалуйста, обновите страницу.")
          }));
        } else {
          setState((prev) => ({ ...prev, error }));
        }
      },
    };

    const client = new ChatWebSocketClient(config);
    clientRef.current = client;

    client
      .connect()
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.error("[useChat] Connection failed:", error);
        }
        setState((prev) => ({ ...prev, error }));
      });

    return () => {
      clientRef.current?.leaveRoom(clubId, channel);
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, [token, autoConnect, clubId, channel]);

  useEffect(() => {
    const client = clientRef.current;
    if (!client || !clubId) return;

    const handleJoined = () => {
      // nothing special for now, onConnect уже запросил историю
    };

    type ChatParticipantsPayload = { clubId?: string; participants?: ChatMessageWithUser["user"][] };
    type ChatHistoryPayload = { clubId?: string; messages?: ChatMessageWithUser[] };
    type ChatMessagePayload = { clubId?: string; message?: ChatMessageWithUser };
    type ChatMessageDeletedPayload = { clubId?: string; messageId?: string };

    const handleParticipants = (payload: unknown) => {
      const data = payload as ChatParticipantsPayload;
      if (data?.clubId !== clubId) return;
      setState((prev) => ({ ...prev, participants: data.participants || [] }));
    };

    const handleHistory = (payload: unknown) => {
      const data = payload as ChatHistoryPayload;
      if (data?.clubId !== clubId) return;
      const messages = Array.isArray(data.messages) ? data.messages : [];
      setState((prev) => ({
        ...prev,
        loadingHistory: false,
        messages: messages,
      }));
    };

    const handleChatMessage = (payload: unknown) => {
      const data = payload as ChatMessagePayload;
      if (data?.clubId !== clubId) return;
      const message: ChatMessageWithUser | undefined = data.message;
      if (!message) return;
      setState((prev) => ({ ...prev, messages: [...prev.messages, message] }));
    };

    const handleMessageDeleted = (payload: unknown) => {
      const data = payload as ChatMessageDeletedPayload;
      if (data?.clubId !== clubId) return;
      const messageId: string | undefined = data.messageId;
      if (!messageId) return;
      
      const markMessageAsDeleted = (m: ChatMessageWithUser) => 
        m.id === messageId ? { ...m, text: "[deleted]", deletedAt: new Date() } : m;
      
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map(markMessageAsDeleted),
      }));
    };

    client.on("joined_room", handleJoined);
    client.on("participants", handleParticipants);
    client.on("history", handleHistory);
    client.on("chat_message", handleChatMessage);
    client.on("message_deleted", handleMessageDeleted);

    return () => {
      client.off("joined_room", handleJoined);
      client.off("participants", handleParticipants);
      client.off("history", handleHistory);
      client.off("chat_message", handleChatMessage);
      client.off("message_deleted", handleMessageDeleted);
    };
  }, [clubId, channel]);

  const sendMessage = useCallback((text: string) => {
    if (!clientRef.current || !text.trim()) return;
    clientRef.current.sendMessage({ clubId, channel, text: text.trim() });
  }, [clubId, channel]);

  const deleteMessage = useCallback((messageId: string) => {
    if (!clientRef.current) return;
    clientRef.current.deleteMessage({ messageId, clubId, channel });
  }, [clubId, channel]);

  return {
    ...state,
    client: clientRef.current,
    sendMessage,
    deleteMessage,
  };
}
