import { useState, useEffect, useCallback, useRef } from 'react';
import { getAdminSocket } from '../services/socket';
import { adminNotificationService } from '../features/adminNotifications/api/adminNotification.service';

const PAGE_SIZE = 20;

/**
 * useAdminNotifications — persistent admin notification center.
 *
 * Fetches the initial list + unread count from the API on mount, then listens
 * for 'notification.created' socket events to prepend new items in real-time.
 *
 * The socket connection itself is managed at the AdminLayout level.
 * This hook only adds / removes its own listener.
 */
export function useAdminNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount,   setUnreadCount]   = useState(0);
  const [loading,       setLoading]       = useState(true);
  const [hasMore,       setHasMore]       = useState(false);
  const pageRef = useRef(1);

  // ── Initial fetch ──────────────────────────────────────────────────────────
  const fetchPage = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const res = await adminNotificationService.list({ page, limit: PAGE_SIZE });
      const { notifications: items = [], meta, unreadCount: count = 0 } = res ?? {};
      setNotifications((prev) => page === 1 ? items : [...prev, ...items]);
      setUnreadCount(count);
      setHasMore((meta?.page ?? 1) < (meta?.pages ?? 1));
      pageRef.current = page;
    } catch {
      // non-fatal: bell just shows stale count
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchPage(1); }, [fetchPage]);

  // ── Real-time: new notification arrives ────────────────────────────────────
  useEffect(() => {
    const socket = getAdminSocket();
    const onNew = (data) => {
      const notif = data?.notification;
      if (!notif) return;
      setNotifications((prev) => [{ ...notif, isRead: false }, ...prev]);
      setUnreadCount((n) => n + 1);
    };
    socket.on('notification.created', onNew);
    return () => socket.off('notification.created', onNew);
  }, []);

  // ── Mark single read ───────────────────────────────────────────────────────
  const markRead = useCallback(async (id) => {
    // Optimistic update
    setNotifications((prev) =>
      prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)),
    );
    setUnreadCount((n) => Math.max(0, n - 1));
    try {
      await adminNotificationService.markRead(id);
    } catch {
      // Revert on failure
      setNotifications((prev) =>
        prev.map((n) => (n._id === id ? { ...n, isRead: false } : n)),
      );
      setUnreadCount((n) => n + 1);
    }
  }, []);

  // ── Mark all read ──────────────────────────────────────────────────────────
  const markAllRead = useCallback(async () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await adminNotificationService.markAllRead();
    } catch {
      fetchPage(1); // resync on failure
    }
  }, [fetchPage]);

  // ── Load more (pagination) ─────────────────────────────────────────────────
  const loadMore = useCallback(() => {
    if (!hasMore || loading) return;
    fetchPage(pageRef.current + 1);
  }, [hasMore, loading, fetchPage]);

  return { notifications, unreadCount, loading, hasMore, markRead, markAllRead, loadMore };
}
