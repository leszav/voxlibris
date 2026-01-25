import { io, type Socket } from "socket.io-client";
import type { ChatMessageWithUser } from "@shared/schema";

export interface ChatWebSocketConfig {
  url?: string;
  token: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
}

export type ChatEventHandler = (data: any) => void;

export class ChatWebSocketClient {
  private socket: Socket | null = null;
  private config: ChatWebSocketConfig;
  private eventHandlers: Map<string, Set<ChatEventHandler>> = new Map();
  private isConnecting = false;

  constructor(config: ChatWebSocketConfig) {
    // Определяем базовый URL для WebSocket чата:
    // 1) Если явно передан в config.url — используем его.
    // 2) Если есть VITE_BACKEND_WS_URL — используем его.
    // 3) В продакшн используем текущий хост, в разработке порт 5000.
    const explicitUrl = config.url;
    const envUrl = (import.meta as any).env?.VITE_BACKEND_WS_URL as string | undefined;
    
    // Для продакшн используем текущий хост с правильным протоколом, для разработки порт 5000
    const isProd = import.meta.env.PROD;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const fallbackUrl = isProd 
      ? `${protocol}//${window.location.hostname}` 
      : `${protocol}//${window.location.hostname}:5000`;

    this.config = {
      url: explicitUrl || envUrl || fallbackUrl,
      reconnectionAttempts: config.reconnectionAttempts ?? 5,
      reconnectionDelay: config.reconnectionDelay ?? 2000,
      ...config,
    };
  }

  connect(): Promise<void> {
    if (this.socket?.connected) {
      return Promise.resolve();
    }

    if (this.isConnecting) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (this.socket?.connected) {
            clearInterval(check);
            resolve();
          }
        }, 100);
      });
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      this.socket = io(this.config.url!, {
        path: "/ws/chat",
        auth: {
          token: this.config.token,
        },
        reconnection: true,
        reconnectionAttempts: this.config.reconnectionAttempts,
        reconnectionDelay: this.config.reconnectionDelay,
        transports: ["websocket", "polling"],
      });

      this.socket.on("connect", () => {
        this.isConnecting = false;
        this.config.onConnect?.();
        resolve();
      });

      this.socket.on("disconnect", () => {
        this.config.onDisconnect?.();
      });

      this.socket.on("connect_error", (error) => {
        this.isConnecting = false;
        this.config.onError?.(error);
        reject(error);
      });

      this.socket.on("error", (error: any) => {
        this.config.onError?.(new Error(error?.message || "Chat WebSocket error"));
      });

      this.setupEventListeners();
    });
  }

  private setupEventListeners() {
    if (!this.socket) return;

    const forward = (event: string) => {
      this.socket!.on(event, (data: any) => {
        this.emit(event, data);
      });
    };

    [
      "joined_room",
      "participants",
      "chat_message",
      "history",
      "message_sent",
      "message_deleted",
    ].forEach(forward);
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinRoom(clubId: string, channel?: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit("join_room", { clubId, channel });
  }

  leaveRoom(clubId: string, channel?: string): void {
    if (!this.socket?.connected) return;
    this.socket.emit("leave_room", { clubId, channel });
  }

  sendMessage(payload: { clubId: string; channel?: string; text: string; mentions?: string[]; attachments?: any[] }) {
    if (!this.socket?.connected) return;
    this.socket.emit("chat_message", payload);
  }

  loadHistory(payload: { clubId: string; channel?: string; offset?: number; limit?: number }) {
    if (!this.socket?.connected) return;
    this.socket.emit("load_history", payload);
  }

  deleteMessage(payload: { messageId: string; clubId: string; channel?: string }) {
    if (!this.socket?.connected) return;
    this.socket.emit("delete_message", payload);
  }

  getParticipants(payload: { clubId: string; channel?: string }) {
    if (!this.socket?.connected) return;
    this.socket.emit("get_participants", payload);
  }

  on(event: string, handler: ChatEventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  off(event: string, handler: ChatEventHandler) {
    const set = this.eventHandlers.get(event);
    if (set) set.delete(handler);
  }

  once(event: string, handler: ChatEventHandler) {
    const wrapper: ChatEventHandler = (data: any) => {
      handler(data);
      this.off(event, wrapper);
    };
    this.on(event, wrapper);
  }

  private emit(event: string, data: any) {
    const set = this.eventHandlers.get(event);
    if (!set) return;
    for (const handler of set) {
      handler(data);
    }
  }

  get connected(): boolean {
    return this.socket?.connected ?? false;
  }
}