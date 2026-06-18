import { io } from 'socket.io-client';
import { getToken } from './api';

/**
 * Socket.IO client singleton for the admin /admin namespace.
 *
 * A module-level singleton means all components share one connection.
 * The socket is created lazily on first getAdminSocket() call, with
 * autoConnect: false so it only opens when explicitly connect()ed.
 *
 * Token refresh:
 *   The JWT is read fresh on each reconnect attempt (via auth factory fn),
 *   so a token rotation during a long session works transparently.
 *
 * Reconnection strategy:
 *   - 5 attempts with exponential back-off (1 s → 5 s max)
 *   - After 5 failures the socket stops retrying; callers should show
 *     a "disconnected" indicator and offer a manual reconnect button.
 */

const SOCKET_BASE = (() => {
  const apiUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';
  // Strip the /api/v1 suffix — Socket.IO connects to the root server
  return apiUrl.replace(/\/api\/v\d+\/?$/, '');
})();

let _adminSocket = null;

export const getAdminSocket = () => {
  if (_adminSocket) return _adminSocket;

  _adminSocket = io(`${SOCKET_BASE}/admin`, {
    // Token is evaluated lazily at connect/reconnect time — handles token rotation
    auth: (cb) => cb({ token: getToken() }),
    transports:              ['websocket', 'polling'],
    autoConnect:             false,  // caller decides when to connect
    reconnectionAttempts:    5,
    reconnectionDelay:       1_000,
    reconnectionDelayMax:    5_000,
    randomizationFactor:     0.5,
  });

  return _adminSocket;
};

export const disconnectAdminSocket = () => {
  if (_adminSocket) {
    _adminSocket.disconnect();
    _adminSocket = null;
  }
};
