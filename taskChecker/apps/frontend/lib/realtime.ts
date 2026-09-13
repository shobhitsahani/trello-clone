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
  onChat?: (event: WSMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

export function useRealtime(options: UseRealtimeOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [connectionError, setConnectionError] = useState<Event | null>(null);
  const reconnectAttempts = useRef(0);
  const maxReconnectAttempts = 10;
  const baseReconnectDelay = 1000;
  // Self-reference for the reconnect timeout (avoids useCallback self-dep).
  const connectRef = useRef<() => void>(() => {});

  // Stabilize callbacks: `options` is usually an inline object literal, so
  // depending on it directly reconnects the socket every render. Keep latest
  // handlers in a ref and connect once per token instead.
  const optionsRef = useRef(options);
  useEffect(() => {
    optionsRef.current = options;
  });

  const connect = useCallback(() => {
    const token = getAccessToken();
    if (!token) {
      return;
    }
    // Avoid duplicate sockets (StrictMode double-mount + reconnect effect).
    if (wsRef.current && (wsRef.current.readyState === WebSocket.OPEN || wsRef.current.readyState === WebSocket.CONNECTING)) {
      return;
    }

    const url = `${getWsUrl()}?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      setConnectionError(null);
      reconnectAttempts.current = 0;
      ws.send(JSON.stringify({ action: "subscribe" }));
      optionsRef.current.onConnect?.();
    };

    ws.onmessage = (event) => {
      try {
        const msg: WSMessage = JSON.parse(event.data);

        switch (msg.type) {
          case "connected":
          case "subscribed":
            break;
          case "notification":
            // Real-time notification received
            optionsRef.current.onNotification?.(msg);
            break;
          case "activity":
            // Real-time activity event
            optionsRef.current.onActivity?.(msg);
            break;
          case "chat.created":
          case "chat.deleted":
            // Real-time team-chat event (POST /v1/chat/messages fan-out)
            optionsRef.current.onChat?.(msg);
            break;
          case "error":
            break;
          default:
            break;
        }
      } catch (err) {
        console.error("[realtime] Failed to parse message:", err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      if (wsRef.current === ws) wsRef.current = null;
      optionsRef.current.onDisconnect?.();

      // Attempt reconnection with exponential backoff
      if (reconnectAttempts.current < maxReconnectAttempts) {
        const delay = Math.min(
          baseReconnectDelay * Math.pow(2, reconnectAttempts.current) + Math.random() * 1000,
          30000
        );
        reconnectAttempts.current++;
        reconnectTimeoutRef.current = setTimeout(() => connectRef.current(), delay);
      } else {
        console.error("[realtime] Max reconnect attempts reached");
      }
    };

    ws.onerror = (event) => {
      setConnectionError(event);
      optionsRef.current.onError?.(event);
    };
  }, []);

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

  // Connect when token is available — once per mount, not per render.
  useEffect(() => {
    connectRef.current = connect;
  });
  useEffect(() => {
    const token = getAccessToken();
    if (token) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [connect, disconnect]);

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
  const { mutateNotifications } = useTenant();

  const handleNotification = useCallback(
    (msg: WSMessage) => {
      const payload = msg.payload as { id?: string; type?: string; [key: string]: unknown } | undefined;
      // Targeted notifications carry targetUserIds — ignore if not for current user.
      // The envelope may also carry it at the top level (emitEvent shape).
      const targeted = (msg as { targetUserIds?: string[] }).targetUserIds ??
        (msg.payload as { targetUserIds?: string[] } | undefined)?.targetUserIds ??
        (payload as { targetUserIds?: string[] } | undefined)?.targetUserIds;
      if (Array.isArray(targeted) && targeted.length > 0) {
        try {
          const tid = localStorage.getItem("tf_tenant_id");
          // we can't easily get userId synchronously here without auth store,
          // so let the server-side DB filter be the source of truth and just
          // allow the optimistc add — the next fetch will correct it. If the
          // message explicitly lists targetUserIds and we can read the current
          // user from the token payload, filter now for snappier UX.
          const token = getAccessToken();
          if (token) {
            const part = token.split(".")[1];
            if (part) {
              const json = JSON.parse(atob(part.replace(/-/g, "+").replace(/_/g, "/")));
              const uid = json.userId ?? json.sub ?? json.uid;
              if (uid && !targeted.includes(String(uid))) return;
            }
          }
        } catch {
          // best-effort decode only
        }
      }
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