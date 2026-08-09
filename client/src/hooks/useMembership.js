import { useAuth } from './useAuth';

const DEFAULT_MEMBERSHIP = {
  status: 'none',
  plan: null,
  joinedAt: null,
  startedAt: null,
  expiresAt: null,
  points: 0,
  lifetimePoints: 0,
  notificationPreference: 'none',
  autoRenew: true,
  cancelAtPeriodEnd: false,
  cancelledAt: null,
};

// Single source of truth for "is this user a TechVault Club member" — derived
// from the authenticated user already held in AuthContext. Never scatter
// `user?.membership?.status === 'active'` checks across the app; use this.
//
// The SERVER is authoritative for expiry (server/models/User.js's
// isMembershipActive lazily corrects a stale-but-not-yet-synced 'active'
// status to 'expired' on every read — see the toJSON transform there), so
// `isMember` here can simply trust `status === 'active'` at face value; it
// never needs its own client-side expiry math.
export function useMembership() {
  const { user, loading } = useAuth();
  const membership = user?.membership ?? DEFAULT_MEMBERSHIP;

  return {
    isMember: membership.status === 'active',
    status: membership.status ?? 'none',
    plan: membership.plan ?? null,
    joinedAt: membership.joinedAt ?? null,
    startedAt: membership.startedAt ?? null,
    expiresAt: membership.expiresAt ?? null,
    points: membership.points ?? 0,
    lifetimePoints: membership.lifetimePoints ?? 0,
    notificationPreference: membership.notificationPreference ?? 'none',
    autoRenew: membership.autoRenew ?? true,
    cancelAtPeriodEnd: membership.cancelAtPeriodEnd ?? false,
    cancelledAt: membership.cancelledAt ?? null,
    loading,
  };
}
