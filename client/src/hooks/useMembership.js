import { useAuth } from './useAuth';

const DEFAULT_MEMBERSHIP = {
  status: 'none',
  joinedAt: null,
  points: 0,
  lifetimePoints: 0,
  notificationPreference: 'none',
};

// Single source of truth for "is this user a TechVault Club member" — derived
// from the authenticated user already held in AuthContext. Never scatter
// `user?.membership?.status === 'active'` checks across the app; use this.
export function useMembership() {
  const { user, loading } = useAuth();
  const membership = user?.membership ?? DEFAULT_MEMBERSHIP;

  return {
    isMember: membership.status === 'active',
    status: membership.status ?? 'none',
    joinedAt: membership.joinedAt ?? null,
    points: membership.points ?? 0,
    lifetimePoints: membership.lifetimePoints ?? 0,
    notificationPreference: membership.notificationPreference ?? 'none',
    loading,
  };
}
