"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { getAccessToken, getWsUrl, type Notification } from "@/lib/api";
import { useTenant } from "@/components/store";

interface WSMessage {
  type: string;
  tenantId?: string;
  [key: string]: unknown;
}

interface UseRealtimeOptions {
  onNotification?: (notification: WSMessage) => void;
  onActivity?: (activity: WSMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const { markRead, unread } = useTenant();
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<Event | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000;

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token) {
      console.warn("[realtime] No access token, skipping WebSocket connection");
      return;
    }

    const url = `${getWsUrl()}?token=${encodeURIComponent(token)}`;
    console.log("[realtime] Connecting to", url.replace(token, "[REDACTED]"));

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      console.log("[realtime] Connected");
      setIsConnected(true);
      setConnectionError(null);
      reconnectAttempts.current = 0;
      ws.send(JSON.stringify({ action: "subscribe" }));
      options.onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);
        console.log("[realtime] Received:", msg.type);

        switch (msg.type) {
          case "connected":
            console.log("[realtime] Server confirmed connection for tenant:", msg.tenantId);
            break;
          case "subscribed":
            console.log("[realtime] Subscribed to channel:", msg.channel);
            break;
          case "notification":
            // Real-time notification received
            options.onNotification?.(msg);
            break;
          case "activity":
            // Real-time activity event
            options.onActivity?.(msg);
            break;
          case "error":
            console.warn("[realtime] Server error:", msg.error);
            break;
          default:
            console.log("[realtime] Unknown message type:", msg.type);
        }
      } catch (err) {
        console.error("[realtime] Failed to parse message:", err);
      }
    };

    ws.onclose = (event) => {
      console.log("[realtime] Disconnected:", event.code, event.reason);
      setIsConnected(false);
      wsRef.current = null;
      options.onDisconnect?.();

      // Attempt reconnection with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(
          baseReconnectDelay * Math.pow(2, reconnectAttempts.current) + Math.random() * 1000,
          30000
        );
        reconnectAttempts.current++;
        console.log(`[realtime] Reconnecting in ${delay}ms (attempt ${reconnectAttempts.current})`);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      } else {
        console.error("[realtime] Max reconnect attempts reached");
      }
    };

    ws.onerror = (event) => {
      console.error("[realtime] WebSocket error:", event);
      setConnectionError(event);
      options.onError?.(event);
    };
  }, [options]);

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, "Client disconnect");
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  const send = useCallback((message: unknown) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  // Connect when token is available
  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

  // Reconnect when token changes (e.g., after org switch)
  useEffect(() => {
    const token = getAccessToken();
    if (token && !isConnected && wsRef.current?.readyState !== WebSocket.OPEN) {
      connect();
    }
  }, [isConnected, connect]);

  return {
    isConnected,
    connectionError,
    send,
    connect,
    disconnect,
  };
}

// Hook for realtime notifications that auto-updates the notification store
export function useRealtimeNotifications() {
  const { markRead, mutateNotifications } = useTenant();

  const handleNotification = useCallback(
    (msg: WSMessage) => {
      const payload = msg.payload as { id?: string; type?: string; [key: string]: unknown } | undefined;
      // Optimistically add the notification to the list
      if (payload?.id) {
        mutateNotifications(
          (current) => {
            const note = { ...payload, readAt: null } as Notification;
            if (!current) {
              return { data: [note], nextCursor: null, hasMore: false };
            }
            // Avoid duplicates
            const exists = current.data.some((n) => n.id === payload.id);
            if (exists) return current;
            return {
              ...current,
              data: [note, ...current.data],
            };
          },
          { revalidate: false },
        );
      }
    },
    [mutateNotifications],
  );

  useRealtime({
    onNotification: handleNotification,
  });
}