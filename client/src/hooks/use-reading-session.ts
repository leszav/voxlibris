import { useState, useEffect, useRef } from 'react';
import { useAuth } from './use-auth';
import { io, type Socket } from 'socket.io-client';

interface ReadingSessionState {
  sessionId?: string;
  isLive: boolean;
  isPaused: boolean;
  isConnected: boolean;
  listenerCount: number;
  currentChapter: number;
  currentPosition: string;
  elapsedTime: number;
}

interface CreateSessionParams {
  clubId: string;
  bookId: string;
  title: string;
  description?: string;
}

export function useReadingSession() {
  const { user } = useAuth();
  const [session, setSession] = useState<ReadingSessionState>({
    isLive: false,
    isPaused: false,
    isConnected: false,
    listenerCount: 0,
    currentChapter: 1,
    currentPosition: '0:0',
    elapsedTime: 0
  });
  
  const socketRef = useRef<Socket | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize WebSocket connection
  useEffect(() => {
    if (!user) return;

    const socket = io(globalThis.location.origin, {
      withCredentials: true,
      auth: {
        userId: user.id
      }
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      if (import.meta.env.DEV) {
        console.log('WebSocket connected');
      }
      setSession(prev => ({ ...prev, isConnected: true }));
    });

    socket.on('disconnect', () => {
      if (import.meta.env.DEV) {
        console.log('WebSocket disconnected');
      }
      setSession(prev => ({ ...prev, isConnected: false }));
    });

    socket.on('session_joined', (data: any) => {
      if (import.meta.env.DEV) {
        console.log('Successfully joined session:', data);
      }
      setSession(prev => ({
        ...prev,
        listenerCount: data.listenerCount,
        currentChapter: data.currentChapter,
        currentPosition: data.currentPosition
      }));
    });

    socket.on('session_started', () => {
      setSession(prev => ({ ...prev, isLive: true, isPaused: false }));
    });

    socket.on('listener_update', () => {
      // Update listener count when someone joins/leaves
      fetchListenerCount();
    });

    socket.on('session_ended', () => {
      setSession(prev => ({ ...prev, isLive: false }));
      stopTimer();
    });

    socket.on('error', (error) => {
      if (import.meta.env.DEV) {
        console.error('WebSocket error:', error);
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [user]);

  // Timer for elapsed time
  const startTimer = () => {
    if (timerRef.current) return;
    
    timerRef.current = setInterval(() => {
      setSession(prev => ({ ...prev, elapsedTime: prev.elapsedTime + 1 }));
    }, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  // Create new reading session
  const createSession = async (params: CreateSessionParams): Promise<string> => {
    try {
      const response = await fetch('/api/sessions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(params),
      });

      if (!response.ok) {
        throw new Error('Failed to create reading session');
      }

      const data = await response.json();
      const sessionId = data.session.id;
      
      setSession(prev => ({
        ...prev,
        sessionId,
        currentChapter: 1,
        currentPosition: '0:0',
        elapsedTime: 0
      }));
      
      // Join the WebSocket session after creation
      if (socketRef.current?.connected) {
        if (import.meta.env.DEV) {
          console.log('Joining WebSocket session:', sessionId);
        }
        socketRef.current.emit('join_session', sessionId);
      }
      
      return sessionId;
    } catch (error) {
      if (import.meta.env.DEV) {
        console.error('Error creating session:', error);
      }
      throw error;
    }
  };

  // Start live reading
  const startReading = () => {
    if (!session.sessionId || !socketRef.current) {
      if (import.meta.env.DEV) {
        console.error('Cannot start reading: missing sessionId or socket connection');
      }
      return;
    }
    
    if (!session.isConnected) {
      if (import.meta.env.DEV) {
        console.error('Cannot start reading: WebSocket not connected');
      }
      return;
    }
    
    if (import.meta.env.DEV) {
      console.log('Starting reading session:', session.sessionId);
    }
    socketRef.current.emit('start_reading', session.sessionId);
    startTimer();
    
    setSession(prev => ({
      ...prev,
      isLive: true,
      isPaused: false
    }));
  };

  // Pause reading
  const pauseReading = () => {
    stopTimer();
    setSession(prev => ({ 
      ...prev, 
      isPaused: true 
    }));
  };

  // Resume reading
  const resumeReading = () => {
    startTimer();
    setSession(prev => ({ 
      ...prev, 
      isPaused: false 
    }));
  };

  // End reading session
  const endReading = () => {
    if (!session.sessionId || !socketRef.current) return;
    
    socketRef.current.emit('end_reading', session.sessionId);
    stopTimer();
    
    setSession(prev => ({ 
      ...prev, 
      isLive: false,
      isPaused: false
    }));
  };

  // Update reading position
  const updatePosition = (chapter: number, position: string) => {
    if (!session.sessionId || !socketRef.current) return;
    
    socketRef.current.emit('update_position', {
      sessionId: session.sessionId,
      currentChapter: chapter,
      currentPosition: position,
      timestamp: new Date().toISOString()
    });
    
    setSession(prev => ({ 
      ...prev, 
      currentChapter: chapter,
      currentPosition: position
    }));
  };

  // Fetch current listener count
  const fetchListenerCount = async () => {
    if (!session.sessionId) return;
    
    try {
      const response = await fetch(`/api/sessions/${session.sessionId}/listeners`, {
        credentials: 'include'
      });
      
      if (response.ok) {
        const data = await response.json();
        setSession(prev => ({ 
          ...prev, 
          listenerCount: data.count 
        }));
      }
      } catch (error) {
        if (import.meta.env.DEV) {
          console.error('Error fetching listener count:', error);
        }
      }
  };

  return {
    session,
    createSession,
    startReading,
    pauseReading,
    resumeReading,
    endReading,
    updatePosition,
    fetchListenerCount
  };
}