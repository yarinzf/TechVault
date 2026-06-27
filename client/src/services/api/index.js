const BASE = import.meta.env.VITE_API_URL || 'http://localhost:5000/api/v1';

// ── Token storage ─────────────────────────────────────────────────────────────
export const getToken = () => localStorage.getItem('accessToken');
export const setToken = (t) => localStorage.setItem('accessToken', t);
export const clearToken = () => localStorage.removeItem('accessToken');

// ── Singleton refresh promise ─────────────────────────────────────────────────
// Prevents concurrent 401s from each spawning their own refresh call.
// The first caller fires the refresh; all others await the same promise.
// If the refresh token has been rotated by the first call, the second call
// would get REFRESH_TOKEN_REVOKED and log the user out — this fixes that.
let _refreshPromise = null;

function silentRefresh() {
  if (_refreshPromise) return _refreshPromise;

  _refreshPromise = fetch(`${BASE}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
  })
    .then(async (rr) => {
      if (!rr.ok) throw new Error('refresh_failed');
      const json = await rr.json();
      const token = json?.data?.accessToken;
      if (!token) throw new Error('no_token_in_response');
      setToken(token);
      return token;
    })
    .finally(() => {
      _refreshPromise = null;
    });

  return _refreshPromise;
}

// ── Core fetch wrapper ────────────────────────────────────────────────────────
async function request(path, options = {}) {
  const { _retry, ...opts } = options;

  const headers = { 'Content-Type': 'application/json', ...opts.headers };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers,
    credentials: 'include',
  });

  // ── 401: try silent refresh once (only if we had a token — skip for unauthenticated calls) ──
  if (res.status === 401 && !_retry && token) {
    try {
      await silentRefresh();
      return request(path, { ...options, _retry: true });
    } catch {
      // Refresh failed — session is genuinely expired. Clean up silently.
    }

    clearToken();
    window.dispatchEvent(new CustomEvent('auth:expired'));

    const err = new Error('Session expired');
    err.code = 'SESSION_EXPIRED';
    err.status = 401;
    throw err;
  }

  // ── Empty body (204) ──────────────────────────────────────────────────────────
  if (res.status === 204) return null;

  const json = await res.json().catch(() => null);

  if (!res.ok) {
    const err = new Error(json?.error?.message || 'Request failed');
    err.code = json?.error?.code || 'UNKNOWN_ERROR';
    err.status = res.status;
    err.details = json?.error?.details || [];
    throw err;
  }

  return { data: json?.data ?? json, meta: json?.meta ?? null };
}

// ── HTTP verbs ────────────────────────────────────────────────────────────────
export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) =>
    request(path, {
      ...opts,
      method: 'POST',
      body: JSON.stringify(body),
    }),
  patch: (path, body, opts) =>
    request(path, {
      ...opts,
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  put: (path, body, opts) =>
    request(path, {
      ...opts,
      method: 'PUT',
      body: JSON.stringify(body),
    }),
  delete: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
};

// ── Query string builder ──────────────────────────────────────────────────────
export const qs = (params = {}) => {
  const p = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== '') p.append(k, v);
  });
  const s = p.toString();
  return s ? `?${s}` : '';
};