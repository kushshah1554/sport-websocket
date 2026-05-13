import { useState, useEffect, useRef, useCallback } from 'react';
import { WS_BASE_URL, INITIAL_RECONNECT_DELAY, MAX_RECONNECT_DELAY } from '../constants';
import { ConnectionStatus, WSMessage } from '../types';

interface UseWebSocketReturn {
  status: ConnectionStatus;
  connectGlobal: () => void;
  subscribeMatch: (matchId: string | number) => void;
  unsubscribeMatch: (matchId: string | number) => void;
  disconnect: () => void;
}

export const useWebSocket = (
  onMessage: (msg: WSMessage) => void
): UseWebSocketReturn => {
  const [status, setStatus] = useState<ConnectionStatus>('disconnected');

  const ws = useRef<WebSocket | null>(null);
  const reconnectTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reconnectAttempts = useRef(0);
  const isIntentionalClose = useRef(false);
  const isConnectedOrConnecting = useRef(false); // ✅ Guard against duplicate connections
  const subscribedMatchIdsRef = useRef(new Set<string>());
  const onMessageRef = useRef(onMessage);

  useEffect(() => {
    onMessageRef.current = onMessage;
  }, [onMessage]);

  const normalizeId = (matchId: string | number) => String(matchId);

  const sendMessage = useCallback(
    (message: WSMessage | Record<string, unknown>) => {
      if (ws.current && ws.current.readyState === WebSocket.OPEN) {
        ws.current.send(JSON.stringify(message));
      }
    },
    []
  );

  // initConnection is only called:
  // 1. Once from connectGlobal (on mount)
  // 2. Recursively from its own onclose handler for auto-reconnect
  const initConnection = useCallback(() => {
    // ✅ Prevent multiple simultaneous connection attempts
    if (isConnectedOrConnecting.current) {
      console.log('[WebSocket] Already connected/connecting, skipping.');
      return;
    }

    isIntentionalClose.current = false;
    isConnectedOrConnecting.current = true;

    setStatus(reconnectAttempts.current > 0 ? 'reconnecting' : 'connecting');

    const socketUrl = `${WS_BASE_URL}?all=1`;

    try {
      // Clean up any existing socket without triggering reconnect
      if (ws.current) {
        const old = ws.current;
        old.onclose = null; // ✅ Detach handler so it doesn't trigger reconnect
        old.onerror = null;
        old.onmessage = null;
        old.onopen = null;
        old.close();
        ws.current = null;
      }

      const socket = new WebSocket(socketUrl);
      ws.current = socket;

      socket.onopen = () => {
        console.log('[WebSocket] Connected successfully');
        reconnectAttempts.current = 0;
        setStatus('connected');

        if (subscribedMatchIdsRef.current.size > 0) {
          socket.send(
            JSON.stringify({
              type: 'setSubscriptions',
              matchIds: Array.from(subscribedMatchIdsRef.current),
            })
          );
        }
      };

      socket.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          onMessageRef.current(data);
        } catch (e) {
          console.error('[WebSocket] Failed to parse message:', e);
        }
      };

      socket.onerror = () => {
        console.warn('[WebSocket] Connection error occurred');
      };

      socket.onclose = (event) => {
        isConnectedOrConnecting.current = false; // ✅ Reset guard on close
        ws.current = null;

        if (isIntentionalClose.current) {
          console.log('[WebSocket] Intentionally closed.');
          setStatus('disconnected');
          return;
        }

        const delay = Math.min(
          INITIAL_RECONNECT_DELAY * 2 ** reconnectAttempts.current,
          MAX_RECONNECT_DELAY
        );

        console.log(
          `[WebSocket] Disconnected (Code: ${event.code}). Reconnecting in ${delay}ms...`
        );

        setStatus('reconnecting');

        reconnectTimeout.current = setTimeout(() => {
          reconnectAttempts.current += 1;
          initConnection(); // ✅ Self-contained reconnect — no external trigger needed
        }, delay);
      };
    } catch (e) {
      console.error('[WebSocket] Connection creation failed:', e);
      isConnectedOrConnecting.current = false;
      setStatus('error');
    }
  }, []); // ✅ Truly stable — no deps, all state via refs

  // ✅ connectGlobal is idempotent — safe to call multiple times,
  // will only actually connect if not already connected/connecting
  const connectGlobal = useCallback(() => {
    if (isConnectedOrConnecting.current) {
      console.log('[WebSocket] connectGlobal called but already active, ignoring.');
      return;
    }

    // Clear any pending reconnect timeout since we're manually connecting
    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    reconnectAttempts.current = 0;
    initConnection();
  }, [initConnection]);

  const subscribeMatch = useCallback(
    (matchId: string | number) => {
      subscribedMatchIdsRef.current.add(normalizeId(matchId));
      sendMessage({ type: 'subscribe', matchId });
    },
    [sendMessage]
  );

  const unsubscribeMatch = useCallback(
    (matchId: string | number) => {
      subscribedMatchIdsRef.current.delete(normalizeId(matchId));
      sendMessage({ type: 'unsubscribe', matchId });
    },
    [sendMessage]
  );

  const disconnect = useCallback(() => {
    isIntentionalClose.current = true;
    isConnectedOrConnecting.current = false;

    if (reconnectTimeout.current) {
      clearTimeout(reconnectTimeout.current);
      reconnectTimeout.current = null;
    }

    if (ws.current) {
      ws.current.close();
      ws.current = null;
    }

    setStatus('disconnected');
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isIntentionalClose.current = true;
      isConnectedOrConnecting.current = false;

      if (reconnectTimeout.current) {
        clearTimeout(reconnectTimeout.current);
      }

      if (ws.current) {
        ws.current.onclose = null; // ✅ Prevent reconnect on unmount
        ws.current.close();
        ws.current = null;
      }
    };
  }, []);

  return { status, connectGlobal, subscribeMatch, unsubscribeMatch, disconnect };
};