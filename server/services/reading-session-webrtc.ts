import { RoomManager } from '../webrtc/room-manager.js';
import type { RoomInfo } from '../webrtc/types.js';
import { storage } from '../repositories/index.js';
import { logger } from '../lib/logger.js';

/**
 * Сервис для интеграции сессий чтения с WebRTC
 */
export class ReadingSessionWebRTCService {
  private static instance: ReadingSessionWebRTCService;
  private readonly roomManager: RoomManager;

  private constructor() {
    this.roomManager = RoomManager.getInstance();
  }

  static getInstance(): ReadingSessionWebRTCService {
    if (!ReadingSessionWebRTCService.instance) {
      ReadingSessionWebRTCService.instance = new ReadingSessionWebRTCService();
    }
    return ReadingSessionWebRTCService.instance;
  }

  /**
   * Создать WebRTC комнату для сессии чтения
   */
  async createRoomForSession(sessionId: string): Promise<string | null> {
    try {
      const session = await storage.readingSessions.getSession(sessionId);
      if (!session) {
        logger.error(`Session ${sessionId} not found`);
        return null;
      }

      // Проверяем, существует ли уже комната для этой сессии
      const existingRooms = this.roomManager.getAllRooms();
      const existingRoom = existingRooms.find(r => r.bookId === session.bookId && r.readerId === session.userId);

      if (existingRoom) {
        logger.info(`Room ${existingRoom.id} already exists for session ${sessionId}`);
        return existingRoom.id;
      }

      // Создаем новую комнату
      const room = await this.roomManager.createRoom({
        name: `Чтение: ${session.bookId}`,
        type: 'reader_club',
        clubId: session.clubId,
        bookId: session.bookId,
        readerId: session.userId,
      });

      // Обновляем сессию с ID комнаты
      await storage.readingSessions.updateSessionRoomId(sessionId, room.id);

      logger.info(`WebRTC room ${room.id} created for session ${sessionId}`);
      return room.id;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error creating WebRTC room for session ${sessionId}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Получить ID комнаты для сессии
   */
  async getRoomIdForSession(sessionId: string): Promise<string | null> {
    try {
      const session = await storage.readingSessions.getSession(sessionId);
      return session?.roomId || null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting room ID for session ${sessionId}: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Закрыть WebRTC комнату для сессии
   */
  async closeRoomForSession(sessionId: string): Promise<boolean> {
    try {
      const roomId = await this.getRoomIdForSession(sessionId);
      if (!roomId) {
        logger.warn(`No room found for session ${sessionId}`);
        return false;
      }

      await this.roomManager.closeRoom(roomId);
      logger.info(`WebRTC room ${roomId} closed for session ${sessionId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error closing WebRTC room for session ${sessionId}: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Присоединить чтеца к комнате
   */
  async joinReaderToRoom(sessionId: string, peerId: string, userId: string, displayName: string): Promise<boolean> {
    try {
      const roomId = await this.getRoomIdForSession(sessionId);
      if (!roomId) {
        logger.error(`No room found for session ${sessionId}`);
        return false;
      }

      const peer = this.roomManager.addPeer(roomId, {
        id: peerId,
        userId,
        displayName,
        role: 'reader',
      });

      if (!peer) {
        logger.error(`Failed to add reader peer ${peerId} to room ${roomId}`);
        return false;
      }

      logger.info(`Reader ${userId} joined room ${roomId} with peer ${peerId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error joining reader to room: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Присоединить слушателя к комнате
   */
  async joinListenerToRoom(sessionId: string, peerId: string, userId: string, displayName: string): Promise<boolean> {
    try {
      const roomId = await this.getRoomIdForSession(sessionId);
      if (!roomId) {
        logger.error(`No room found for session ${sessionId}`);
        return false;
      }

      const peer = this.roomManager.addPeer(roomId, {
        id: peerId,
        userId,
        displayName,
        role: 'listener',
      });

      if (!peer) {
        logger.error(`Failed to add listener peer ${peerId} to room ${roomId}`);
        return false;
      }

      logger.info(`Listener ${userId} joined room ${roomId} with peer ${peerId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error joining listener to room: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Удалить пира из комнаты
   */
  async removePeerFromRoom(sessionId: string, peerId: string): Promise<boolean> {
    try {
      const roomId = await this.getRoomIdForSession(sessionId);
      if (!roomId) {
        logger.warn(`No room found for session ${sessionId}`);
        return false;
      }

      await this.roomManager.removePeer(roomId, peerId);
      logger.info(`Peer ${peerId} removed from room ${roomId}`);
      return true;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error removing peer from room: ${errorMessage}`);
      return false;
    }
  }

  /**
   * Получить информацию о комнате
   */
  async getRoomInfo(sessionId: string): Promise<RoomInfo | null> {
    try {
      const roomId = await this.getRoomIdForSession(sessionId);
      if (!roomId) {
        return null;
      }

      return this.roomManager.getRoom(roomId) ?? null;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting room info: ${errorMessage}`);
      return null;
    }
  }

  /**
   * Получить количество слушателей в комнате
   */
  async getListenerCount(sessionId: string): Promise<number> {
    try {
      const roomId = await this.getRoomIdForSession(sessionId);
      if (!roomId) {
        return 0;
      }

      const peers = this.roomManager.getRoomPeers(roomId);
      return peers.filter(p => p.role === 'listener').length;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Error getting listener count: ${errorMessage}`);
      return 0;
    }
  }
}

export const readingSessionWebRTCService = ReadingSessionWebRTCService.getInstance();
