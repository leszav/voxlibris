// server/audio/audio-broadcaster.ts

import type { Server as SocketIOServer } from 'socket.io';
import type { AudioSession, AudioChunk, AudioSessionConfig, AudioSessionStats } from './types.js';
import { logger } from '../lib/logger.js';

export class AudioBroadcaster {
  private static instance: AudioBroadcaster;
  private sessions: Map<string, AudioSession> = new Map();
  private sessionStats: Map<string, AudioSessionStats> = new Map();
  
  static getInstance(): AudioBroadcaster {
    if (!AudioBroadcaster.instance) {
      AudioBroadcaster.instance = new AudioBroadcaster();
    }
    return AudioBroadcaster.instance;
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
    
    logger.info(`Audio session started: ${sessionId}`, {
      clubId,
      readerId,
      bookId,
      config
    } as any);
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
    
    session.listeners.add(socketId);
    
    // Обновляем статистику
    const stats = this.sessionStats.get(sessionId);
    if (stats) {
      stats.listenerCount = session.listeners.size;
    }
    
    logger.info(`Listener joined: ${socketId} to session ${sessionId}`, {
      totalListeners: session.listeners.size
    } as any);
    
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
      
      logger.info(`Listener left: ${socketId} from session ${sessionId}`, {
        totalListeners: session.listeners.size
      } as any);
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
    
    logger.debug(`Audio chunk broadcasted`, {
      sessionId: chunk.sessionId,
      sequence: chunk.sequence,
      size: chunk.data.length,
      listeners: session.listeners.size
    } as any);
  }
  
  /**
   * Завершить сессию
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.isActive = false;
      
      const stats = this.sessionStats.get(sessionId);
      logger.info(`Audio session ended: ${sessionId}`, {
        duration: stats?.duration,
        bytesTransferred: stats?.bytesTransferred,
        totalListeners: session.listeners.size
      } as any);
      
      // Очищаем через некоторое время для статистики
      setTimeout(() => {
        this.sessions.delete(sessionId);
        this.sessionStats.delete(sessionId);
      }, 60000); // 1 минута
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
