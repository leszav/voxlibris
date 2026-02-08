import type { Socket } from 'socket.io';
import { types } from 'mediasoup';
import { MediasoupManager } from './mediasoup-manager.js';
import { RoomManager } from './room-manager.js';
import type { WebRTCMessage, WebRTCResponse } from './types.js';
import { logger } from '../lib/logger.js';
import { nanoid } from 'nanoid';

/**
 * Обработчик WebRTC сообщений через Socket.IO
 */
export class WebRTCHandler {
  private readonly mediasoupManager: MediasoupManager;
  private readonly roomManager: RoomManager;

  constructor() {
    this.mediasoupManager = MediasoupManager.getInstance();
    this.roomManager = RoomManager.getInstance();
  }

  /**
   * Настроить обработчики для сокета
   */
  setupHandlers(socket: Socket): void {
    socket.on('webrtc', async (message: WebRTCMessage) => {
      try {
        await this.handleMessage(socket, message);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`Error handling WebRTC message: ${errorMessage}`);
        this.sendError(socket, message.type, errorMessage);
      }
    });
  }

  /**
   * Обработать сообщение WebRTC
   */
  private async handleMessage(socket: Socket, message: WebRTCMessage): Promise<void> {
    switch (message.type) {
      case 'create-room':
        await this.handleCreateRoom(socket, message.payload as {
          name: string;
          type: 'general' | 'reader_club';
          clubId?: string;
          bookId?: string;
          readerId?: string;
        });
        break;

      case 'join-room':
        await this.handleJoinRoom(socket, message.payload as {
          roomId: string;
          userId: string;
          displayName: string;
          role: 'reader' | 'listener';
        });
        break;

      case 'leave-room':
        await this.handleLeaveRoom(socket, message.payload as { roomId: string });
        break;

      case 'get-router-rtp-capabilities':
        await this.handleGetRouterRtpCapabilities(socket, message.payload as { roomId: string });
        break;

      case 'create-transport':
        await this.handleCreateTransport(socket, message.payload as {
          roomId: string;
          type: 'send' | 'recv';
        });
        break;

      case 'connect-transport':
        await this.handleConnectTransport(socket, message.payload as {
          transportId: string;
          dtlsParameters: types.DtlsParameters;
        });
        break;

      case 'produce':
        await this.handleProduce(socket, message.payload as {
          transportId: string;
          kind: 'audio' | 'video';
          rtpParameters: types.RtpParameters;
        });
        break;

      case 'consume':
        await this.handleConsume(socket, message.payload as {
          transportId: string;
          producerId: string;
          rtpCapabilities: types.RtpCapabilities;
        });
        break;

      case 'pause-producer':
        await this.handlePauseProducer(socket, message.payload as { producerId: string });
        break;

      case 'resume-producer':
        await this.handleResumeProducer(socket, message.payload as { producerId: string });
        break;

      case 'pause-consumer':
        await this.handlePauseConsumer(socket, message.payload as { consumerId: string });
        break;

      case 'resume-consumer':
        await this.handleResumeConsumer(socket, message.payload as { consumerId: string });
        break;

      case 'close-producer':
        await this.handleCloseProducer(socket, message.payload as { producerId: string });
        break;

      case 'close-consumer':
        await this.handleCloseConsumer(socket, message.payload as { consumerId: string });
        break;

      case 'request-key-frame':
        await this.handleRequestKeyFrame(socket, message.payload as { consumerId: string });
        break;

      case 'data-produce':
        await this.handleDataProduce(socket, message.payload as {
          transportId: string;
          sctpStreamParameters: types.SctpStreamParameters;
          label?: string;
          protocol?: string;
        });
        break;

      case 'data-consume':
        await this.handleDataConsume(socket, message.payload as {
          transportId: string;
          dataProducerId: string;
        });
        break;

      default:
        logger.warn(`Unknown WebRTC message type: ${message.type}`);
        this.sendError(socket, message.type, 'Unknown message type');
    }
  }

  /**
   * Создать комнату
   */
  private async handleCreateRoom(socket: Socket, payload: {
    name: string;
    type: 'general' | 'reader_club';
    clubId?: string;
    bookId?: string;
    readerId?: string;
  }): Promise<void> {
    const room = await this.roomManager.createRoom(payload);
    this.sendSuccess(socket, 'create-room', { room });
  }

  /**
   * Присоединиться к комнате
   */
  private async handleJoinRoom(socket: Socket, payload: {
    roomId: string;
    userId: string;
    displayName: string;
    role: 'reader' | 'listener';
  }): Promise<void> {
    const { roomId, userId, displayName, role } = payload;
    const peerId = `${userId}_${nanoid(8)}`;

    const peer = this.roomManager.addPeer(roomId, {
      id: peerId,
      userId,
      displayName,
      role,
    });

    if (!peer) {
      throw new Error('Failed to join room');
    }

    // Сохраняем peerId в сокете для дальнейшего использования
    socket.data.peerId = peerId;
    socket.data.roomId = roomId;

    // Уведомляем других участников
    socket.to(roomId).emit('webrtc', {
      type: 'peer-joined',
      payload: { peer },
    });

    // Отправляем список участников
    const peers = this.roomManager.getRoomPeers(roomId);
    this.sendSuccess(socket, 'join-room', { peer, peers });
  }

  /**
   * Покинуть комнату
   */
  private async handleLeaveRoom(socket: Socket, payload: { roomId: string }): Promise<void> {
    const { roomId } = payload;
    const peerId = socket.data.peerId;

    if (!peerId) {
      throw new Error('Peer not found in socket data');
    }

    await this.roomManager.removePeer(roomId, peerId);

    // Уведомляем других участников
    socket.to(roomId).emit('webrtc', {
      type: 'peer-left',
      payload: { peerId },
    });

    this.sendSuccess(socket, 'leave-room', {});
  }

  /**
   * Получить RTP возможности роутера
   */
  private async handleGetRouterRtpCapabilities(socket: Socket, payload: { roomId: string }): Promise<void> {
    const { roomId } = payload;
    const router = this.mediasoupManager.getRouter(roomId);

    if (!router) {
      throw new Error('Router not found');
    }

    this.sendSuccess(socket, 'get-router-rtp-capabilities', {
      rtpCapabilities: router.rtpCapabilities,
    });
  }

  /**
   * Создать transport
   */
  private async handleCreateTransport(socket: Socket, payload: {
    roomId: string;
    type: 'send' | 'recv';
  }): Promise<void> {
    const { roomId, type } = payload;
    const peerId = socket.data.peerId;

    if (!peerId) {
      throw new Error('Peer not found in socket data');
    }

    const router = this.mediasoupManager.getRouter(roomId);
    if (!router) {
      throw new Error('Router not found');
    }

    const transport = await this.mediasoupManager.createWebRtcTransport(router);
    this.roomManager.addPeerTransport(peerId, transport, type);

    // WebRtcTransport имеет специфичные свойства для ICE/DTLS/SCTP
    this.sendSuccess(socket, 'create-transport', {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
      sctpParameters: transport.sctpParameters,
    });
  }

  /**
   * Подключить transport
   */
  private async handleConnectTransport(socket: Socket, payload: {
    transportId: string;
    dtlsParameters: types.DtlsParameters;
  }): Promise<void> {
    const { transportId, dtlsParameters } = payload;
    const peerId = socket.data.peerId;

    if (!peerId) {
      throw new Error('Peer not found in socket data');
    }

    const transport = this.roomManager.getPeerTransport(peerId, transportId);
    if (!transport) {
      throw new Error('Transport not found');
    }

    await transport.connect({ dtlsParameters });
    this.sendSuccess(socket, 'connect-transport', {});
  }

  /**
   * Создать producer (для отправки медиа)
   */
  private async handleProduce(socket: Socket, payload: {
    transportId: string;
    kind: 'audio' | 'video';
    rtpParameters: types.RtpParameters;
  }): Promise<void> {
    const { transportId, kind, rtpParameters } = payload;
    const peerId = socket.data.peerId;
    const roomId = socket.data.roomId;

    if (!peerId || !roomId) {
      throw new Error('Peer or room not found in socket data');
    }

    const transport = this.roomManager.getPeerTransport(peerId, transportId);
    if (!transport) {
      throw new Error('Transport not found');
    }

    const producer = await transport.produce({ kind, rtpParameters });
    this.roomManager.addPeerProducer(peerId, producer);

    // Уведомляем других участников о новом producer
    socket.to(roomId).emit('webrtc', {
      type: 'new-producer',
      payload: {
        peerId,
        producerId: producer.id,
        kind: producer.kind,
      },
    });

    this.sendSuccess(socket, 'produce', { id: producer.id });
  }

  /**
   * Создать consumer (для получения медиа)
   */
  private async handleConsume(socket: Socket, payload: {
    transportId: string;
    producerId: string;
    rtpCapabilities: types.RtpCapabilities;
  }): Promise<void> {
    const { transportId, producerId, rtpCapabilities } = payload;
    const peerId = socket.data.peerId;
    const roomId = socket.data.roomId;

    if (!peerId || !roomId) {
      throw new Error('Peer or room not found in socket data');
    }

    const transport = this.roomManager.getPeerTransport(peerId, transportId);
    if (!transport) {
      throw new Error('Transport not found');
    }

    const router = this.mediasoupManager.getRouter(roomId);
    if (!router) {
      throw new Error('Router not found');
    }

    // Ищем producer по ID среди всех пиров в комнате
    const producers: types.Producer[] = [];
    for (const peer of this.roomManager.getRoomPeers(roomId)) {
      const peerProducers = this.roomManager.getPeerProducers(peer.id);
      producers.push(...peerProducers);
    }

    const producer = producers.find(p => p.id === producerId);
    if (!producer) {
      throw new Error('Producer not found');
    }

    const consumer = await transport.consume({
      producerId,
      rtpCapabilities,
      paused: true,
    });

    this.roomManager.addPeerConsumer(peerId, consumer);

    this.sendSuccess(socket, 'consume', {
      id: consumer.id,
      producerId,
      kind: consumer.kind,
      rtpParameters: consumer.rtpParameters,
    });
  }

  /**
   * Пауза producer
   */
  private async handlePauseProducer(socket: Socket, payload: { producerId: string }): Promise<void> {
    const { producerId } = payload;
    const peerId = socket.data.peerId;

    if (!peerId) {
      throw new Error('Peer not found in socket data');
    }

    const producer = this.roomManager.getPeerProducer(peerId, producerId);
    if (!producer) {
      throw new Error('Producer not found');
    }

    await producer.pause();
    this.sendSuccess(socket, 'pause-producer', {});
  }

  /**
   * Возобновить producer
   */
  private async handleResumeProducer(socket: Socket, payload: { producerId: string }): Promise<void> {
    const { producerId } = payload;
    const peerId = socket.data.peerId;

    if (!peerId) {
      throw new Error('Peer not found in socket data');
    }

    const producer = this.roomManager.getPeerProducer(peerId, producerId);
    if (!producer) {
      throw new Error('Producer not found');
    }

    await producer.resume();
    this.sendSuccess(socket, 'resume-producer', {});
  }

  /**
   * Пауза consumer
   */
  private async handlePauseConsumer(socket: Socket, payload: { consumerId: string }): Promise<void> {
    const { consumerId } = payload;
    const peerId = socket.data.peerId;

    if (!peerId) {
      throw new Error('Peer not found in socket data');
    }

    const consumer = this.roomManager.getPeerConsumer(peerId, consumerId);
    if (!consumer) {
      throw new Error('Consumer not found');
    }

    await consumer.pause();
    this.sendSuccess(socket, 'pause-consumer', {});
  }

  /**
   * Возобновить consumer
   */
  private async handleResumeConsumer(socket: Socket, payload: { consumerId: string }): Promise<void> {
    const { consumerId } = payload;
    const peerId = socket.data.peerId;

    if (!peerId) {
      throw new Error('Peer not found in socket data');
    }

    const consumer = this.roomManager.getPeerConsumer(peerId, consumerId);
    if (!consumer) {
      throw new Error('Consumer not found');
    }

    await consumer.resume();
    this.sendSuccess(socket, 'resume-consumer', {});
  }

  /**
   * Закрыть producer
   */
  private async handleCloseProducer(socket: Socket, payload: { producerId: string }): Promise<void> {
    const { producerId } = payload;
    const peerId = socket.data.peerId;
    const roomId = socket.data.roomId;

    if (!peerId) {
      throw new Error('Peer not found in socket data');
    }

    const producer = this.roomManager.getPeerProducer(peerId, producerId);
    if (!producer) {
      throw new Error('Producer not found');
    }

    producer.close();

    // Уведомляем других участников
    if (roomId) {
      socket.to(roomId).emit('webrtc', {
        type: 'producer-closed',
        payload: { peerId, producerId },
      });
    }

    this.sendSuccess(socket, 'close-producer', {});
  }

  /**
   * Закрыть consumer
   */
  private async handleCloseConsumer(socket: Socket, payload: { consumerId: string }): Promise<void> {
    const { consumerId } = payload;
    const peerId = socket.data.peerId;

    if (!peerId) {
      throw new Error('Peer not found in socket data');
    }

    const consumer = this.roomManager.getPeerConsumer(peerId, consumerId);
    if (!consumer) {
      throw new Error('Consumer not found');
    }

    consumer.close();
    this.sendSuccess(socket, 'close-consumer', {});
  }

  /**
   * Запросить ключевой кадр
   */
  private async handleRequestKeyFrame(socket: Socket, payload: { consumerId: string }): Promise<void> {
    const { consumerId } = payload;
    const peerId = socket.data.peerId;

    if (!peerId) {
      throw new Error('Peer not found in socket data');
    }

    const consumer = this.roomManager.getPeerConsumer(peerId, consumerId);
    if (!consumer) {
      throw new Error('Consumer not found');
    }

    await consumer.requestKeyFrame();
    this.sendSuccess(socket, 'request-key-frame', {});
  }

  /**
   * Создать data producer
   */
  private async handleDataProduce(socket: Socket, payload: {
    transportId: string;
    sctpStreamParameters: types.SctpStreamParameters;
    label?: string;
    protocol?: string;
  }): Promise<void> {
    const { transportId, sctpStreamParameters, label, protocol } = payload;
    const peerId = socket.data.peerId;

    if (!peerId) {
      throw new Error('Peer not found in socket data');
    }

    const transport = this.roomManager.getPeerTransport(peerId, transportId);
    if (!transport) {
      throw new Error('Transport not found');
    }

    const dataProducer = await transport.produceData({
      sctpStreamParameters,
      label,
      protocol,
    });

    this.roomManager.addPeerDataProducer(peerId, dataProducer);
    this.sendSuccess(socket, 'data-produce', { id: dataProducer.id });
  }

  /**
   * Создать data consumer
   */
  private async handleDataConsume(socket: Socket, payload: {
    transportId: string;
    dataProducerId: string;
  }): Promise<void> {
    const { transportId, dataProducerId } = payload;
    const peerId = socket.data.peerId;

    if (!peerId) {
      throw new Error('Peer not found in socket data');
    }

    const transport = this.roomManager.getPeerTransport(peerId, transportId);
    if (!transport) {
      throw new Error('Transport not found');
    }

    const dataConsumer = await transport.consumeData({
      dataProducerId,
    });

    this.roomManager.addPeerDataConsumer(peerId, dataConsumer);
    this.sendSuccess(socket, 'data-consume', { id: dataConsumer.id });
  }

  /**
   * Отправить успешный ответ
   */
  private sendSuccess(socket: Socket, type: string, data: unknown): void {
    const response: WebRTCResponse = {
      type,
      success: true,
      data,
    };
    socket.emit('webrtc-response', response);
  }

  /**
   * Отправить ошибку
   */
  private sendError(socket: Socket, type: string, error: string): void {
    const response: WebRTCResponse = {
      type,
      success: false,
      error,
    };
    socket.emit('webrtc-response', response);
  }

  /**
   * Обработать отключение сокета
   */
  async handleDisconnect(socket: Socket): Promise<void> {
    const peerId = socket.data.peerId;
    const roomId = socket.data.roomId;

    if (peerId && roomId) {
      await this.roomManager.removePeer(roomId, peerId);
    }
  }
}
