export interface MemoryChunk {
  id: string;
  content: string;
  timestamp: Date;
  sessionId: string;
  userId: string;
  type: 'conversation' | 'code' | 'decision' | 'context' | 'error' | 'solution';
  metadata: {
    tags: string[];
    priority: number;
    fileReferences?: string[];
    relevanceScore?: number;
  };
}

export interface MemorySearchResult {
  chunk: MemoryChunk;
  relevanceScore: number;
  context: string;
}

export interface ConversationContext {
  sessionId: string;
  userId: string;
  activeMemories: MemoryChunk[];
  lastActivity: Date;
}

export interface MemoryConfig {
  maxContextSize: number;
  embeddingModel: string;
  vectorDimensions: number;
  retentionDays: number;
  priorityThreshold: number;
}