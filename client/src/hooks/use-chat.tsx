import { useCallback, useEffect, useRef, useState } from "react";
import { ChatWebSocketClient, type ChatWebSocketConfig } from "../lib/chat-websocket";
import type { ChatMessageWithUser } from "@shared/schema";

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
  participants: Array<{ userId: string; username: string }>;
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

  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") || "" : "";

  useEffect(() => {
    if (!token || !autoConnect) return;

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
        setState((prev) => ({ ...prev, error }));
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

    const handleParticipants = (payload: any) => {
      if (payload?.clubId !== clubId) return;
      setState((prev) => ({ ...prev, participants: payload.participants || [] }));
    };

    const handleHistory = (payload: any) => {
      if (payload?.clubId !== clubId) return;
      const messages = Array.isArray(payload.messages) ? payload.messages : [];
      setState((prev) => ({
        ...prev,
        loadingHistory: false,
        messages: messages,
      }));
    };

    const handleChatMessage = (payload: any) => {
      if (payload?.clubId !== clubId) return;
      const message: ChatMessageWithUser | undefined = payload.message;
      if (!message) return;
      setState((prev) => ({ ...prev, messages: [...prev.messages, message] }));
    };

    const handleMessageDeleted = (payload: any) => {
      if (payload?.clubId !== clubId) return;
      const messageId: string | undefined = payload.messageId;
      if (!messageId) return;
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === messageId ? { ...m, text: "[deleted]", deletedAt: new Date() as any } : m,
        ),
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