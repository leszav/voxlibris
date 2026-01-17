import { useEffect, useRef, useState, useCallback } from "react";
import { ReaderWebSocketClient } from "../lib/websocket";
import type { ReaderProgressUpdate } from "@shared/schema";

interface UseReaderWebSocketOptions {
  bookId: string;
  clubId?: string;
  autoConnect?: boolean;
}

interface WebSocketState {
  connected: boolean;
  joining: boolean;
  error: Error | null;
}

export function useReaderWebSocket(options: UseReaderWebSocketOptions) {
  const { bookId, clubId, autoConnect = true } = options;
  const clientRef = useRef<ReaderWebSocketClient | null>(null);
  const [state, setState] = useState<WebSocketState>({
    connected: false,
    joining: false,
    error: null,
  });

  // Получаем токен из localStorage
  const token = localStorage.getItem("accessToken") || "";

  // Инициализация клиента
  useEffect(() => {
    if (!token || !autoConnect) return;

    const client = new ReaderWebSocketClient({
      token,
      onConnect: () => {
        setState((prev) => ({ ...prev, connected: true, error: null }));
      },
      onDisconnect: () => {
        setState((prev) => ({ ...prev, connected: false }));
      },
      onError: (error) => {
        setState((prev) => ({ ...prev, error, connected: false }));
      },
    });

    clientRef.current = client;

    // Подключение
    client.connect().catch((error) => {
      if (import.meta.env.DEV) {
        console.error("[useReaderWebSocket] Connection failed:", error);
      }
      setState((prev) => ({ ...prev, error }));
    });

    return () => {
      if (clientRef.current) {
        clientRef.current.leaveBook(bookId, clubId);
        clientRef.current.disconnect();
      }
    };
  }, [token, autoConnect]);

  // Присоединение к комнате книги
  useEffect(() => {
    if (!clientRef.current?.connected || !bookId) return;

    setState((prev) => ({ ...prev, joining: true }));

    clientRef.current
      .joinBook(bookId, clubId)
      .then(() => {
        setState((prev) => ({ ...prev, joining: false }));
      })
      .catch((error) => {
        if (import.meta.env.DEV) {
          console.error("[useReaderWebSocket] Join book failed:", error);
        }
        setState((prev) => ({ ...prev, joining: false, error }));
      });

    return () => {
      if (clientRef.current) {
        clientRef.current.leaveBook(bookId, clubId);
      }
    };
  }, [bookId, clubId, state.connected]);

  // Обновление прогресса с debounce
  const updateProgress = useCallback(
    (data: ReaderProgressUpdate) => {
      if (clientRef.current?.connected) {
        clientRef.current.updateProgress(data);
      }
    },
    []
  );

  // Подписка на события
  const on = useCallback((event: string, handler: (data: any) => void) => {
    if (clientRef.current) {
      clientRef.current.on(event, handler);
      return () => {
        clientRef.current?.off(event, handler);
      };
    }
  }, []);

  return {
    ...state,
    client: clientRef.current,
    updateProgress,
    on,
  };
}
