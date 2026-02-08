import { Router, Request, Response } from 'express';
import { storage, repositories } from '../repositories/index.js';
import { RoomManager } from '../webrtc/room-manager.js';
import { logger } from '../lib/logger.js';

const router = Router();
const roomManager = RoomManager.getInstance();

/**
 * GET /api/webrtc/rooms
 * Получить список активных комнат
 */
router.get('/rooms', async (req: Request, res: Response) => {
  try {
    const rooms = roomManager.getAllRooms();
    res.json({
      success: true,
      rooms: rooms.map(room => ({
        id: room.id,
        name: room.name,
        type: room.type,
        clubId: room.clubId,
        bookId: room.bookId,
        readerId: room.readerId,
        createdAt: room.createdAt,
        peersCount: room.peers.size,
      })),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting rooms: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get rooms',
    });
  }
});

/**
 * GET /api/webrtc/rooms/:roomId
 * Получить информацию о комнате
 */
router.get('/rooms/:roomId', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const room = roomManager.getRoom(roomId);

    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found',
      });
    }

    res.json({
      success: true,
      room: {
        id: room.id,
        name: room.name,
        type: room.type,
        clubId: room.clubId,
        bookId: room.bookId,
        readerId: room.readerId,
        createdAt: room.createdAt,
        peers: Array.from(room.peers.values()).map(peer => ({
          id: peer.id,
          userId: peer.userId,
          displayName: peer.displayName,
          role: peer.role,
          joinedAt: peer.joinedAt,
        })),
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting room: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get room',
    });
  }
});

/**
 * POST /api/webrtc/rooms
 * Создать новую комнату для чтения
 */
router.post('/rooms', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { name, clubId, bookId } = req.body;

    if (!name || !clubId || !bookId) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: name, clubId, bookId',
      });
    }

    // Проверяем, что пользователь является членом клуба
    const membership = await storage.getUserClubMembership(clubId, userId);
    if (!membership) {
      return res.status(403).json({
        success: false,
        error: 'You are not a member of this club',
      });
    }

    // Создаем комнату
    const room = await roomManager.createRoom({
      name,
      type: 'reader_club',
      clubId,
      bookId,
      readerId: userId,
    });

    // Создаем статус чтения
    await repositories.clubReadingStatus.createReadingStatus({
      userId,
      bookId,
      clubId,
      sessionType: 'reader_club',
      isOpenForListeners: true,
    });

    res.json({
      success: true,
      room: {
        id: room.id,
        name: room.name,
        type: room.type,
        clubId: room.clubId,
        bookId: room.bookId,
        readerId: room.readerId,
        createdAt: room.createdAt,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error creating room: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to create room',
    });
  }
});

/**
 * DELETE /api/webrtc/rooms/:roomId
 * Закрыть комнату
 */
router.delete('/rooms/:roomId', async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        error: 'Unauthorized',
      });
    }

    const { roomId } = req.params;

    const room = roomManager.getRoom(roomId);
    if (!room) {
      return res.status(404).json({
        success: false,
        error: 'Room not found',
      });
    }

    // Проверяем, что пользователь является читателем в этой комнате
    if (room.readerId !== userId) {
      return res.status(403).json({
        success: false,
        error: 'Only the reader can close the room',
      });
    }

    await roomManager.closeRoom(roomId);

    res.json({
      success: true,
      message: 'Room closed',
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error closing room: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to close room',
    });
  }
});

/**
 * GET /api/webrtc/stats
 * Получить статистику WebRTC
 */
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = roomManager.getStats();

    res.json({
      success: true,
      stats: {
        rooms: stats.roomsCount,
        peers: stats.totalPeers,
      },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting stats: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get stats',
    });
  }
});

/**
 * GET /api/webrtc/rooms/:roomId/peers
 * Получить список пиров в комнате
 */
router.get('/rooms/:roomId/peers', async (req: Request, res: Response) => {
  try {
    const { roomId } = req.params;
    const peers = roomManager.getRoomPeers(roomId);

    res.json({
      success: true,
      peers: peers.map(peer => ({
        id: peer.id,
        userId: peer.userId,
        displayName: peer.displayName,
        role: peer.role,
        joinedAt: peer.joinedAt,
      })),
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Error getting peers: ${errorMessage}`);
    res.status(500).json({
      success: false,
      error: 'Failed to get peers',
    });
  }
});

export default router;
