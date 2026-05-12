import { useEffect, useRef, useState } from 'react';
import { io, type Socket } from 'socket.io-client';

// Singleton Socket.IO для DM / notifications.
// Токен передаётся автоматически через httpOnly-совместимый cookie (accessToken)
// при каждом WebSocket handshake — не нужно передавать его вручную.
let _socket: Socket | null = null;

function getOrCreateSocket(): Socket {
  if (_socket) return _socket;
  _socket = io('/', {
    transports: ['websocket', 'polling'],
    withCredentials: true,
    autoConnect: false, // Подключаемся явно в MainLayout после авторизации
  });
  return _socket;
}

/**
 * Возвращает singleton Socket.IO соединение.
 * Соединение устанавливается при первом использовании, не разрывается при размонтировании компонента.
 */
export function useSocket(): Socket | null {
  const [socket, setSocket] = useState<Socket | null>(null);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    const s = getOrCreateSocket();
    if (mountedRef.current) setSocket(s);
    return () => {
      mountedRef.current = false;
    };
  }, []);

  return socket;
}
