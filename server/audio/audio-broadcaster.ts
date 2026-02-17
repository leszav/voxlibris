// server/audio/audio-broadcaster.ts

import type { Server as SocketIOServer } from 'socket.io';
import type { AudioSession, AudioChunk, AudioSessionConfig, AudioSessionStats } from './types.js';
import { logger } from '../lib/logger.js';

export class AudioBroadcaster {
  private static instance: AudioBroadcaster;
  private sessions: Map<string, AudioSession> = new Map();
  private sessionStats: Map<string, AudioSessionStats> = new Map();
  private readonly endedSessionCleanupTimers: Map<string, NodeJS.Timeout> = new Map();
  private readonly MAX_TRACKED_SESSIONS = 500;
  private readonly MAX_LISTENERS_PER_SESSION = 1000;
  private readonly ENDED_SESSION_RETENTION_MS = 60_000;
  private readonly CLEANUP_INTERVAL_MS = 5 * 60 * 1000;
  private readonly cleanupInterval: NodeJS.Timeout;

  private constructor() {
    this.cleanupInterval = setInterval(() => {
      this.cleanupEndedSessions();
    }, this.CLEANUP_INTERVAL_MS);
    this.cleanupInterval.unref();
  }
  
  static getInstance(): AudioBroadcaster {
    if (!AudioBroadcaster.instance) {
      AudioBroadcaster.instance = new AudioBroadcaster();
    }
    return AudioBroadcaster.instance;
  }

  private clearEndedSessionTimer(sessionId: string): void {
    const timer = this.endedSessionCleanupTimers.get(sessionId);
    if (!timer) {
      return;
    }
    clearTimeout(timer);
    this.endedSessionCleanupTimers.delete(sessionId);
  }

  private scheduleEndedSessionCleanup(sessionId: string): void {
    this.clearEndedSessionTimer(sessionId);

    const timer = setTimeout(() => {
      this.sessions.delete(sessionId);
      this.sessionStats.delete(sessionId);
      this.endedSessionCleanupTimers.delete(sessionId);
    }, this.ENDED_SESSION_RETENTION_MS);

    timer.unref();
    this.endedSessionCleanupTimers.set(sessionId, timer);
  }

  private ensureSessionCapacity(): void {
    if (this.sessions.size < this.MAX_TRACKED_SESSIONS) {
      return;
    }

    const removable = Array.from(this.sessions.values())
      .sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())
      .find((session) => !session.isActive);

    const target = removable ?? Array.from(this.sessions.values()).sort((a, b) => a.startedAt.getTime() - b.startedAt.getTime())[0];
    if (!target) {
      return;
    }

    this.clearEndedSessionTimer(target.id);
    this.sessions.delete(target.id);
    this.sessionStats.delete(target.id);
  }

  private cleanupEndedSessions(): void {
    const now = Date.now();
    for (const session of this.sessions.values()) {
      if (session.isActive) {
        continue;
      }
      if (now - session.startedAt.getTime() >= this.ENDED_SESSION_RETENTION_MS) {
        this.clearEndedSessionTimer(session.id);
        this.sessions.delete(session.id);
        this.sessionStats.delete(session.id);
      }
    }
  }
  
  /**
   * Создать новую аудио-сессию
   */
  startSession(
    sessionId: string, 
    clubId: string, 
    readerId: string, 
    bookId: string,
    config?: AudioSessionConfig
  ): void {
    if (!this.sessions.has(sessionId)) {
      this.ensureSessionCapacity();
    }

    this.clearEndedSessionTimer(sessionId);

    const session: AudioSession = {
      id: sessionId,
      clubId,
      readerId,
      bookId,
      listeners: new Set(),
      startedAt: new Date(),
      isActive: true,
    };
    
    const stats: AudioSessionStats = {
      sessionId,
      listenerCount: 0,
      bytesTransferred: 0,
      duration: 0,
      lastChunkTimestamp: Date.now(),
    };
    
    this.sessions.set(sessionId, session);
    this.sessionStats.set(sessionId, stats);
    
    logger.info({
      clubId,
      readerId,
      bookId,
      config
    }, `Audio session started: ${sessionId}`);
  }
  
  /**
   * Добавить слушателя к сессии
   */
  addListener(sessionId: string, socketId: string): boolean {
    const session = this.sessions.get(sessionId);
    if (!session || !session.isActive) {
      logger.warn(`Cannot add listener to inactive session: ${sessionId}`);
      return false;
    }

    if (!session.listeners.has(socketId) && session.listeners.size >= this.MAX_LISTENERS_PER_SESSION) {
      logger.warn(`Cannot add listener, max listeners reached for session: ${sessionId}`);
      return false;
    }
    
    session.listeners.add(socketId);
    
    // Обновляем статистику
    const stats = this.sessionStats.get(sessionId);
    if (stats) {
      stats.listenerCount = session.listeners.size;
    }
    
    logger.info({
      totalListeners: session.listeners.size
    }, `Listener joined: ${socketId} to session ${sessionId}`);
    
    return true;
  }
  
  /**
   * Удалить слушателя из сессии
   */
  removeListener(sessionId: string, socketId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.listeners.delete(socketId);
      
      // Обновляем статистику
      const stats = this.sessionStats.get(sessionId);
      if (stats) {
        stats.listenerCount = session.listeners.size;
      }
      
      logger.info({
        totalListeners: session.listeners.size
      }, `Listener left: ${socketId} from session ${sessionId}`);
    }
  }
  
  /**
   * Broadcast аудио-chunk всем слушателям
   */
  broadcastChunk(io: SocketIOServer, chunk: AudioChunk): void {
    const session = this.sessions.get(chunk.sessionId);
    if (!session || !session.isActive) {
      logger.warn(`Attempting to broadcast to inactive session: ${chunk.sessionId}`);
      return;
    }
    
    // Broadcast всем в комнате Socket.IO
    io.to(chunk.sessionId).emit('audio:chunk', {
      data: chunk.data,
      timestamp: chunk.timestamp,
      sequence: chunk.sequence,
    });
    
    // Обновляем статистику
    const stats = this.sessionStats.get(chunk.sessionId);
    if (stats) {
      stats.bytesTransferred += chunk.data.length;
      stats.lastChunkTimestamp = chunk.timestamp;
      stats.duration = Math.floor((chunk.timestamp - session.startedAt.getTime()) / 1000);
    }
    
    if (chunk.sequence % 100 === 0) {
      logger.debug({
        sessionId: chunk.sessionId,
        sequence: chunk.sequence,
        size: chunk.data.length,
        listeners: session.listeners.size
      }, `Audio chunk broadcasted (sampled)`);
    }
  }
  
  /**
   * Завершить сессию
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      
      const stats = this.sessionStats.get(sessionId);
      logger.info({
        duration: stats?.duration,
        bytesTransferred: stats?.bytesTransferred,
        totalListeners: session.listeners.size
      }, `Audio session ended: ${sessionId}`);
      
      // Оставляем краткий retention, затем детерминированно удаляем
      this.scheduleEndedSessionCleanup(sessionId);
    }
  }
  
  /**
   * Получить информацию о сессии
   */
  getSession(sessionId: string): AudioSession | undefined {
    return this.sessions.get(sessionId);
  }
  
  /**
   * Получить статистику сессии
   */
  getSessionStats(sessionId: string): AudioSessionStats | undefined {
    return this.sessionStats.get(sessionId);
  }
  
  /**
   * Получить все активные сессии
   */
  getActiveSessions(): AudioSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isActive);
  }
  
  /**
   * Проверить, является ли пользователь чтецом в сессии
   */
  isReader(sessionId: string, userId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.readerId === userId;
  }
  
  /**
   * Проверить, является ли пользователь слушателем в сессии
   */
  isListener(sessionId: string, socketId: string): boolean {
    const session = this.sessions.get(sessionId);
    return session?.listeners.has(socketId) ?? false;
  }
}
