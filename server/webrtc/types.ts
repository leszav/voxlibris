import type { types } from 'mediasoup';

/**
 * Типы для WebRTC / mediasoup
 */

export type MediaType = 'audio' | 'video';
export type ProducerKind = 'audio' | 'video';
export type ConsumerKind = 'audio' | 'video';

export interface TransportOptions {
  id?: string;
  iceParameters: {
    usernameFragment: string;
    password: string;
  };
  iceCandidates: {
    foundation: string;
    ip: string;
    port: number;
    protocol: 'udp' | 'tcp';
    type: 'host' | 'srflx' | 'prflx' | 'relay';
    priority: number;
  }[];
  dtlsParameters: {
    role: 'auto' | 'client' | 'server';
    fingerprints: Array<{
      algorithm: string;
      value: string;
    }>;
  };
  sctpParameters?: {
    port: number;
    os: number;
    maxMessageSize: number;
  };
}

export interface ProducerOptions {
  kind: ProducerKind;
  rtpParameters: {
    codecs: Array<{
      mimeType: string;
      clockRate: number;
      channels?: number;
      parameters?: Record<string, unknown>;
    }>;
    headerExtensions: Array<{
      uri: string;
      id: number;
      encrypt?: boolean;
    }>;
    encodings?: Array<{
      ssrc?: number;
      rid?: string;
      codecPayloadType?: number;
      maxBitrate?: number;
      scalabilityMode?: string;
    }>;
    rtcp: {
      cname: string;
      reducedSize: boolean;
      mux: boolean;
    };
  };
  paused?: boolean;
}

export interface ConsumerOptions {
  producerId: string;
  rtpCapabilities: types.RtpCapabilities;
  paused?: boolean;
  preferredLayers?: {
    spatialLayer: number;
    temporalLayer: number;
  };
}

export interface DataProducerOptions {
  sctpStreamParameters: {
    streamId: number;
    ordered: boolean;
    maxPacketLifeTime?: number;
    maxRetransmits?: number;
    label?: string;
    protocol?: string;
  };
  label?: string;
  protocol?: string;
}

export interface DataConsumerOptions {
  dataProducerId: string;
  sctpStreamParameters?: {
    streamId: number;
    ordered?: boolean;
  };
}

export interface PeerInfo {
  id: string;
  userId: string;
  displayName: string;
  role: 'reader' | 'listener';
  joinedAt: Date;
  transportIds: {
    send?: string;
    recv?: string;
  };
  producerIds: {
    audio?: string;
    video?: string;
    data?: string;
  };
}

export interface RoomInfo {
  id: string;
  name: string;
  type: 'general' | 'reader_club';
  clubId?: string;
  bookId?: string;
  readerId?: string;
  createdAt: Date;
  peers: Map<string, PeerInfo>;
}

export interface WebRTCMessage {
  type:
    | 'create-room'
    | 'join-room'
    | 'leave-room'
    | 'get-router-rtp-capabilities'
    | 'create-transport'
    | 'connect-transport'
    | 'produce'
    | 'consume'
    | 'pause-producer'
    | 'resume-producer'
    | 'pause-consumer'
    | 'resume-consumer'
    | 'close-producer'
    | 'close-consumer'
    | 'request-key-frame'
    | 'data-produce'
    | 'data-consume';
  payload?: unknown;
}

export interface WebRTCResponse {
  type: string;
  success: boolean;
  data?: unknown;
  error?: string;
}
