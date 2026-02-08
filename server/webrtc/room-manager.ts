import { types } from 'mediasoup';
import type { PeerInfo, RoomInfo } from './types.js';
import { MediasoupManager } from './mediasoup-manager.js';
import { logger } from '../lib/logger.js';
import { nanoid } from 'nanoid';

/**
 * Менеджер комнат WebRTC
 */
export class RoomManager {
  private static instance: RoomManager;
  private readonly rooms: Map<string, RoomInfo> = new Map();
  private readonly peerTransports: Map<string, Map<string, types.Transport>> = new Map(); // peerId -> transportId -> Transport
  private readonly peerProducers: Map<string, Map<string, types.Producer>> = new Map(); // peerId -> producerId -> Producer
  private readonly peerConsumers: Map<string, Map<string, types.Consumer>> = new Map(); // peerId -> consumerId -> Consumer
  private readonly peerDataProducers: Map<string, Map<string, types.DataProducer>> = new Map();
  private readonly peerDataConsumers: Map<string, Map<string, types.DataConsumer>> = new Map();

  private constructor() {}

  static getInstance(): RoomManager {
    if (!RoomManager.instance) {
      RoomManager.instance = new RoomManager();
    }
    return RoomManager.instance;
  }

  /**
   * Создать комнату
   */
  async createRoom(options: {
    id?: string;
    name: string;
    type: 'general' | 'reader_club';
    clubId?: string;
    bookId?: string;
    readerId?: string;
  }): Promise<RoomInfo> {
    const roomId = options.id || nanoid();
    const mediasoupManager = MediasoupManager.getInstance();

    // Создаем router для комнаты
    await mediasoupManager.createRouter(roomId);

    const room: RoomInfo = {
      id: roomId,
      name: options.name,
      type: options.type,
      clubId: options.clubId,
      bookId: options.bookId,
      readerId: options.readerId,
      createdAt: new Date(),
      peers: new Map(),
    };

    this.rooms.set(roomId, room);
    logger.info(`Room created: ${roomId} (${options.name})`);

    return room;
  }

  /**
   * Получить комнату
   */
  getRoom(roomId: string): RoomInfo | undefined {
    return this.rooms.get(roomId);
  }

  /**
   * Получить все комнаты
   */
  getAllRooms(): RoomInfo[] {
    return Array.from(this.rooms.values());
  }

  /**
   * Удалить комнату
   */
  async closeRoom(roomId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      logger.warn(`Room ${roomId} not found`);
      return;
    }

    // Отключаем всех пиров
    for (const [peerId] of room.peers.entries()) {
      await this.removePeer(roomId, peerId);
    }

    // Закрываем router
    const mediasoupManager = MediasoupManager.getInstance();
    await mediasoupManager.closeRouter(roomId);

    this.rooms.delete(roomId);
    logger.info(`Room closed: ${roomId}`);
  }

  /**
   * Добавить пира в комнату
   */
  addPeer(
    roomId: string,
    peerInfo: {
      id: string;
      userId: string;
      displayName: string;
      role: 'reader' | 'listener';
    }
  ): PeerInfo | null {
    const room = this.rooms.get(roomId);
    if (!room) {
      logger.error(`Room ${roomId} not found`);
      return null;
    }

    // Проверяем, не добавлен ли уже пир
    if (room.peers.has(peerInfo.id)) {
      logger.warn(`Peer ${peerInfo.id} already in room ${roomId}`);
      return room.peers.get(peerInfo.id)!;
    }

    const peer: PeerInfo = {
      ...peerInfo,
      joinedAt: new Date(),
      transportIds: {},
      producerIds: {},
    };

    room.peers.set(peerInfo.id, peer);
    
    // Инициализуем карты для этого пира
    this.peerTransports.set(peerInfo.id, new Map());
    this.peerProducers.set(peerInfo.id, new Map());
    this.peerConsumers.set(peerInfo.id, new Map());
    this.peerDataProducers.set(peerInfo.id, new Map());
    this.peerDataConsumers.set(peerInfo.id, new Map());

    logger.info(`Peer ${peerInfo.id} joined room ${roomId}`);
    return peer;
  }

  /**
   * Удалить пира из комнаты
   */
  async removePeer(roomId: string, peerId: string): Promise<void> {
    const room = this.rooms.get(roomId);
    if (!room) {
      logger.warn(`Room ${roomId} not found`);
      return;
    }

    const peer = room.peers.get(peerId);
    if (!peer) {
      logger.warn(`Peer ${peerId} not found in room ${roomId}`);
      return;
    }

    // Закрываем все transports, producers, consumers пира
    await this.cleanupPeerResources(peerId);

    room.peers.delete(peerId);
    logger.info(`Peer ${peerId} left room ${roomId}`);

    // Если комната пустая, закрываем её
    if (room.peers.size === 0) {
      logger.info(`Room ${roomId} is empty, closing...`);
      await this.closeRoom(roomId);
    }
  }

  /**
   * Очистить ресурсы пира
   */
  private async cleanupPeerResources(peerId: string): Promise<void> {
    this.closePeerResourceMap(peerId, this.peerTransports, 'transport');
    this.closePeerResourceMap(peerId, this.peerProducers, 'producer');
    this.closePeerResourceMap(peerId, this.peerConsumers, 'consumer');
    this.closePeerResourceMap(peerId, this.peerDataProducers, 'data producer');
    this.closePeerResourceMap(peerId, this.peerDataConsumers, 'data consumer');
  }

  private closePeerResourceMap<T extends { close(): void }>(
    peerId: string,
    store: Map<string, Map<string, T>>,
    label: string
  ): void {
    const resources = store.get(peerId);
    if (!resources) {
      return;
    }

    for (const resource of resources.values()) {
      try {
        resource.close();
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Failed to close ${label} for peer ${peerId}: ${errorMessage}`);
      }
    }

    store.delete(peerId);
  }

  /**
   * Добавить transport для пира
   */
  addPeerTransport(peerId: string, transport: types.Transport, type: 'send' | 'recv'): void {
    const transports = this.peerTransports.get(peerId);
    if (!transports) {
      logger.error(`Peer ${peerId} transports not initialized`);
      return;
    }

    transports.set(transport.id, transport);

    const room = this.findPeerRoom(peerId);
    if (room) {
      const peer = room.peers.get(peerId);
      if (peer) {
        if (type === 'send') {
          peer.transportIds.send = transport.id;
        } else {
          peer.transportIds.recv = transport.id;
        }
      }
    }

    logger.info(`Transport ${transport.id} (${type}) added for peer ${peerId}`);
  }

  /**
   * Добавить producer для пира
   */
  addPeerProducer(peerId: string, producer: types.Producer): void {
    const producers = this.peerProducers.get(peerId);
    if (!producers) {
      logger.error(`Peer ${peerId} producers not initialized`);
      return;
    }

    producers.set(producer.id, producer);

    const room = this.findPeerRoom(peerId);
    if (room) {
      const peer = room.peers.get(peerId);
      if (peer) {
        if (producer.kind === 'audio') {
          peer.producerIds.audio = producer.id;
        } else if (producer.kind === 'video') {
          peer.producerIds.video = producer.id;
        }
      }
    }

    logger.info(`Producer ${producer.id} (${producer.kind}) added for peer ${peerId}`);
  }

  /**
   * Добавить consumer для пира
   */
  addPeerConsumer(peerId: string, consumer: types.Consumer): void {
    const consumers = this.peerConsumers.get(peerId);
    if (!consumers) {
      logger.error(`Peer ${peerId} consumers not initialized`);
      return;
    }

    consumers.set(consumer.id, consumer);
    logger.info(`Consumer ${consumer.id} added for peer ${peerId}`);
  }

  /**
   * Добавить data producer для пира
   */
  addPeerDataProducer(peerId: string, dataProducer: types.DataProducer): void {
    const dataProducers = this.peerDataProducers.get(peerId);
    if (!dataProducers) {
      logger.error(`Peer ${peerId} data producers not initialized`);
      return;
    }

    dataProducers.set(dataProducer.id, dataProducer);

    const room = this.findPeerRoom(peerId);
    if (room) {
      const peer = room.peers.get(peerId);
      if (peer) {
        peer.producerIds.data = dataProducer.id;
      }
    }

    logger.info(`DataProducer ${dataProducer.id} added for peer ${peerId}`);
  }

  /**
   * Добавить data consumer для пира
   */
  addPeerDataConsumer(peerId: string, dataConsumer: types.DataConsumer): void {
    const dataConsumers = this.peerDataConsumers.get(peerId);
    if (!dataConsumers) {
      logger.error(`Peer ${peerId} data consumers not initialized`);
      return;
    }

    dataConsumers.set(dataConsumer.id, dataConsumer);
    logger.info(`DataConsumer ${dataConsumer.id} added for peer ${peerId}`);
  }

  /**
   * Найти комнату по ID пира
   */
  private findPeerRoom(peerId: string): RoomInfo | undefined {
    for (const room of this.rooms.values()) {
      if (room.peers.has(peerId)) {
        return room;
      }
    }
    return undefined;
  }

  /**
   * Получить пира
   */
  getPeer(roomId: string, peerId: string): PeerInfo | undefined {
    const room = this.rooms.get(roomId);
    return room?.peers.get(peerId);
  }

  /**
   * Получить transport пира
   */
  getPeerTransport(peerId: string, transportId: string): types.Transport | undefined {
    const transports = this.peerTransports.get(peerId);
    return transports?.get(transportId);
  }

  /**
   * Получить producer пира
   */
  getPeerProducer(peerId: string, producerId: string): types.Producer | undefined {
    const producers = this.peerProducers.get(peerId);
    return producers?.get(producerId);
  }

  /**
   * Получить все producers пира
   */
  getPeerProducers(peerId: string): types.Producer[] {
    const producers = this.peerProducers.get(peerId);
    return producers ? Array.from(producers.values()) : [];
  }

  /**
   * Получить consumer пира
   */
  getPeerConsumer(peerId: string, consumerId: string): types.Consumer | undefined {
    const consumers = this.peerConsumers.get(peerId);
    return consumers?.get(consumerId);
  }

  /**
   * Получить всех пиров в комнате
   */
  getRoomPeers(roomId: string): PeerInfo[] {
    const room = this.rooms.get(roomId);
    return room ? Array.from(room.peers.values()) : [];
  }

  /**
   * Получить статистику
   */
  getStats(): {
    roomsCount: number;
    totalPeers: number;
  } {
    let totalPeers = 0;
    for (const room of this.rooms.values()) {
      totalPeers += room.peers.size;
    }

    return {
      roomsCount: this.rooms.size,
      totalPeers,
    };
  }
}
