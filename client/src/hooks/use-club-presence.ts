import { useEffect, useRef } from "react";
import { ChatWebSocketClient } from "@/lib/chat-websocket";
import { getAccessToken } from "@/lib/token-store";

/**
 * Регистрирует присутствие пользователя на странице клуба через WebSocket.
 * Вызывает onPresenceUpdate при каждом изменении онлайн-состава клуба (real-time).
 */
export function useClubPresence(
  clubId: string | null | undefined,
  onPresenceUpdate?: (onlineUserIds: string[]) => void,
) {
  const clientRef = useRef<ChatWebSocketClient | null>(null);
  const heartbeatRef = useRef<ReturnType<typeof globalThis.setInterval> | null>(null);
  // Держим callback в ref чтобы не пересоздавать эффект при его изменении
  const callbackRef = useRef(onPresenceUpdate);
  callbackRef.current = onPresenceUpdate;

  useEffect(() => {
    if (!clubId) return;

    const token = getAccessToken() ?? "";
    const client = new ChatWebSocketClient({
      token,
      onConnect: () => {
        client.visitClub(clubId);

        if (heartbeatRef.current !== null) {
          globalThis.clearInterval(heartbeatRef.current);
        }
        heartbeatRef.current = globalThis.setInterval(() => {
          client.visitClub(clubId);
        }, 15_000);
      },
    });
    clientRef.current = client;

    client.on("club:presence_update", (data: unknown) => {
      const payload = data as { clubId?: string; onlineUserIds?: string[] };
      if (payload.clubId === clubId && Array.isArray(payload.onlineUserIds)) {
        callbackRef.current?.(payload.onlineUserIds);
      }
    });

    client.connect().catch(() => {
      // presence некритична — молча игнорируем
    });

    return () => {
      if (heartbeatRef.current !== null) {
        globalThis.clearInterval(heartbeatRef.current);
        heartbeatRef.current = null;
      }
      clientRef.current?.leaveClub(clubId);
      clientRef.current?.disconnect();
      clientRef.current = null;
    };
  }, [clubId]);
}
