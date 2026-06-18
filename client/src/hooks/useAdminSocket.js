import { useEffect, useRef, useState, useCallback } from 'react';
import { getAdminSocket } from '../services/socket';

/**
 * useAdminSocket — real-time admin event subscription hook.
 *
 * Connects to the /admin Socket.IO namespace on mount and disconnects on unmount.
 * All event handlers are forwarded through a stable ref so callers can update
 * their handlers without triggering re-registration of listeners.
 *
 * Usage:
 *   const { isConnected, unreadCount, clearUnread } = useAdminSocket({
 *     'order.created':        (data) => { ... },
 *     'alert.created':        (data) => { ... },
 *     'inventory.low_stock':  (data) => { ... },
 *   });
 *
 * Reconnection:
 *   Socket.IO retries automatically (up to 5 attempts, 1–5 s back-off).
 *   After 5 failures isConnected stays false — show an "offline" indicator.
 *
 * Token refresh:
 *   The socket factory uses a lazy auth callback, so a silently-refreshed
 *   token is picked up automatically on the next reconnect attempt.
 */

const ALL_ADMIN_EVENTS = [
  'order.created',
  'order.status_changed',
  'order.cancelled',
  'payment.paid',
  'payment.refunded',
  'alert.created',
  'alert.resolved',
  'inventory.low_stock',
  'inventory.scan_complete',
  'analytics.anomaly_detected',
  'notification.created',
];

export function useAdminSocket(handlers = {}) {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers; // always current — no stale closures in listeners

  const [isConnected, setIsConnected] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const clearUnread = useCallback(() => setUnreadCount(0), []);

  useEffect(() => {
    const socket = getAdminSocket();

    // ── Connection lifecycle ──────────────────────────────────────────────────
    const onConnect = () => {
      setIsConnected(true);
    };
    const onDisconnect = (reason) => {
      setIsConnected(false);
      // 'io server disconnect' = kicked by server (auth revoked etc.) — do not retry
      if (reason === 'io server disconnect') {
        socket.connect(); // re-attempt once to get a fresh auth rejection message
      }
    };
    const onConnectError = () => {
      setIsConnected(false);
    };

    socket.on('connect',       onConnect);
    socket.on('disconnect',    onDisconnect);
    socket.on('connect_error', onConnectError);

    // ── Domain event forwarding ───────────────────────────────────────────────
    // One stable wrapper per event — delegates to handlersRef so callers can
    // update their handler functions without re-running this effect.
    const wrappers = {};
    ALL_ADMIN_EVENTS.forEach((event) => {
      wrappers[event] = (data) => {
        setUnreadCount((n) => n + 1);
        handlersRef.current[event]?.(data);
      };
      socket.on(event, wrappers[event]);
    });

    // ── Cleanup ───────────────────────────────────────────────────────────────
    // Socket connect/disconnect is managed by AdminLayout — only remove listeners.
    return () => {
      socket.off('connect',       onConnect);
      socket.off('disconnect',    onDisconnect);
      socket.off('connect_error', onConnectError);
      ALL_ADMIN_EVENTS.forEach((event) => socket.off(event, wrappers[event]));
    };
  }, []); // mount/unmount only — handlers are stable via ref

  return { isConnected, unreadCount, clearUnread };
}
