import { io, Socket } from "socket.io-client";
import type {
  ReaderProgressUpdate,
  Bookmark,
  Note,
} from "@shared/schema";

export interface ReaderWebSocketConfig {
  url?: string;
  token: string;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  reconnectionAttempts?: number;
  reconnectionDelay?: number;
}

export type ReaderEventHandler = (data: unknown) => void;

export class ReaderWebSocketClient {
  private socket: Socket | null = null;
  private readonly config: ReaderWebSocketConfig;
  private readonly eventHandlers: Map<string, Set<ReaderEventHandler>> = new Map();
  private isConnecting = false;

  constructor(config: ReaderWebSocketConfig) {
    this.config = {
      url: config.url || `${globalThis.location.protocol}//${globalThis.location.host}`,
      reconnectionAttempts: config.reconnectionAttempts || 5,
      reconnectionDelay: config.reconnectionDelay || 2000,
      ...config,
    };
  }

  connect(): Promise<void> {
    if (this.socket?.connected) {
      return Promise.resolve();
    }

    if (this.isConnecting) {
      return new Promise((resolve, reject) => {
        const startedAt = Date.now();
        const checkConnection = setInterval(() => {
          if (this.socket?.connected) {
            clearInterval(checkConnection);
            resolve();
            return;
          }

          if (!this.isConnecting && !this.socket?.connected) {
            clearInterval(checkConnection);
            reject(new Error("Reader WebSocket connection failed"));
            return;
          }

          if (Date.now() - startedAt > 10000) {
            clearInterval(checkConnection);
            reject(new Error("Reader WebSocket connection timeout"));
          }
        }, 100);
      });
    }

    this.isConnecting = true;

    return new Promise((resolve, reject) => {
      this.socket = io(this.config.url, {
        path: "/ws/reader",
        auth: {
          token: this.config.token,
        },
        reconnection: true,
        reconnectionAttempts: this.config.reconnectionAttempts,
        reconnectionDelay: this.config.reconnectionDelay,
        transports: ["websocket", "polling"],
      });

      this.socket.on("connect", () => {
        console.warn("[Reader WS] Connected");
        this.isConnecting = false;
        this.config.onConnect?.();
        resolve();
      });

      this.socket.on("disconnect", (reason) => {
        console.warn("[Reader WS] Disconnected:", reason);
        this.config.onDisconnect?.();
      });

      this.socket.on("connect_error", (error) => {
        console.error("[Reader WS] Connection error:", error);
        this.isConnecting = false;
        this.config.onError?.(error);
        reject(error);
      });

      this.socket.on("error", (error: unknown) => {
        console.error("[Reader WS] Error:", error);
        const message = error instanceof Error ? error.message : String(error);
        this.config.onError?.(new Error(message || "WebSocket error"));
      });

      // Регистрация обработчиков событий
      this.setupEventListeners();
    });
  }

  private setupEventListeners() {
    if (!this.socket) return;

    // Progress updates
    this.socket.on("progress_saved", (data) => {
      this.emit("progress_saved", data);
    });

    this.socket.on("member_progress", (data) => {
      this.emit("member_progress", data);
    });

    // Bookmarks
    this.socket.on("bookmark_added", (data) => {
      this.emit("bookmark_added", data);
    });

    // Notes
    this.socket.on("note_added", (data) => {
      this.emit("note_added", data);
    });

    // Book room events
    this.socket.on("joined_book", (data) => {
      this.emit("joined_book", data);
    });

    this.socket.on("user_joined", (data) => {
      this.emit("user_joined", data);
    });

    this.socket.on("user_left", (data) => {
      this.emit("user_left", data);
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
  }

  // Join book room
  joinBook(bookId: string, clubId?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket?.connected) {
        reject(new Error("Socket not connected"));
        return;
      }

      this.socket.emit("join_book", { bookId, clubId });

      const handleJoinedBook = () => {
        clearTimeout(timeout);
        this.off("joined_book", handleJoinedBook);
        resolve();
      };

      const timeout = setTimeout(() => {
        this.off("joined_book", handleJoinedBook);
        reject(new Error("Join book timeout"));
      }, 5000);

      this.on("joined_book", handleJoinedBook);
    });
  }

  // Leave book room
  leaveBook(bookId: string, clubId?: string) {
    if (this.socket?.connected) {
      this.socket.emit("leave_book", { bookId, clubId });
    }
  }

  // Send progress update
  updateProgress(data: ReaderProgressUpdate) {
    if (this.socket?.connected) {
      this.socket.emit("progress_update", data);
    }
  }

  // Add bookmark
  addBookmark(data: Omit<Bookmark, "id" | "userId" | "createdAt">) {
    if (this.socket?.connected) {
      this.socket.emit("bookmark_add", data);
    }
  }

  // Add note
  addNote(data: Omit<Note, "id" | "userId" | "createdAt" | "updatedAt">) {
    if (this.socket?.connected) {
      this.socket.emit("note_add", data);
    }
  }

  // Event handling
  on(event: string, handler: ReaderEventHandler) {
    if (!this.eventHandlers.has(event)) {
      this.eventHandlers.set(event, new Set());
    }
    this.eventHandlers.get(event)!.add(handler);
  }

  once(event: string, handler: ReaderEventHandler) {
    const wrappedHandler = (data: unknown) => {
      handler(data);
      this.off(event, wrappedHandler);
    };
    this.on(event, wrappedHandler);
  }

  off(event: string, handler: ReaderEventHandler) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.delete(handler);
    }
  }

  private emit(event: string, data: unknown) {
    const handlers = this.eventHandlers.get(event);
    if (handlers) {
      handlers.forEach((handler) => handler(data));
    }
  }

  get connected(): boolean {
    return this.socket?.connected || false;
  }
}
