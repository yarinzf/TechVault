import { describe, it, expect, beforeEach, vi } from 'vitest';
import { api, getToken, setToken } from './index';

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('api/index.js — session resilience (Part B regression coverage)', () => {
  it('8. /auth/refresh returning 429 does NOT log the user out or clear the stored token', async () => {
    setToken('valid-access-token');
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) {
        return Promise.resolve(jsonResponse(429, { error: { code: 'RATE_LIMIT_EXCEEDED', message: 'Too many', retryAfter: 30 } }));
      }
      // Every non-refresh call looks like an expired access token.
      return Promise.resolve(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED' } }));
    });

    const expiredHandler = vi.fn();
    window.addEventListener('auth:expired', expiredHandler);

    await expect(api.get('/auth/me')).rejects.toMatchObject({ code: 'REFRESH_TEMPORARILY_UNAVAILABLE', transient: true });

    expect(getToken()).toBe('valid-access-token'); // token NOT cleared
    expect(expiredHandler).not.toHaveBeenCalled();  // no global logout event fired

    window.removeEventListener('auth:expired', expiredHandler);
  });

  it('9. /auth/refresh returning 500 does NOT log the user out solely because of a transient server failure', async () => {
    setToken('valid-access-token');
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) {
        return Promise.resolve(jsonResponse(500, { error: { code: 'INTERNAL_ERROR', message: 'boom' } }));
      }
      return Promise.resolve(jsonResponse(401, { error: {} }));
    });

    const expiredHandler = vi.fn();
    window.addEventListener('auth:expired', expiredHandler);

    await expect(api.get('/auth/me')).rejects.toMatchObject({ transient: true });
    expect(getToken()).toBe('valid-access-token');
    expect(expiredHandler).not.toHaveBeenCalled();

    window.removeEventListener('auth:expired', expiredHandler);
  });

  it('10. a network failure (fetch rejects) during refresh does not destroy auth state', async () => {
    setToken('valid-access-token');
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) {
        return Promise.reject(new TypeError('Failed to fetch'));
      }
      return Promise.resolve(jsonResponse(401, { error: {} }));
    });

    const expiredHandler = vi.fn();
    window.addEventListener('auth:expired', expiredHandler);

    await expect(api.get('/auth/me')).rejects.toBeTruthy();
    expect(getToken()).toBe('valid-access-token');
    expect(expiredHandler).not.toHaveBeenCalled();

    window.removeEventListener('auth:expired', expiredHandler);
  });

  it('11. an authoritative invalid-refresh response (401 REFRESH_TOKEN_REVOKED) DOES clear authentication', async () => {
    setToken('valid-access-token');
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) {
        return Promise.resolve(jsonResponse(401, { error: { code: 'REFRESH_TOKEN_REVOKED', message: 'Refresh token revoked' } }));
      }
      return Promise.resolve(jsonResponse(401, { error: {} }));
    });

    const expiredHandler = vi.fn();
    window.addEventListener('auth:expired', expiredHandler);

    await expect(api.get('/auth/me')).rejects.toMatchObject({ code: 'SESSION_EXPIRED', status: 401 });
    expect(getToken()).toBeNull();
    expect(expiredHandler).toHaveBeenCalledTimes(1);

    window.removeEventListener('auth:expired', expiredHandler);
  });

  it('a 403 (e.g. account deactivated) from /auth/refresh is ALSO treated as authoritative', async () => {
    setToken('valid-access-token');
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) {
        return Promise.resolve(jsonResponse(403, { error: { code: 'ACCOUNT_DEACTIVATED' } }));
      }
      return Promise.resolve(jsonResponse(401, { error: {} }));
    });

    await expect(api.get('/auth/me')).rejects.toMatchObject({ code: 'SESSION_EXPIRED' });
    expect(getToken()).toBeNull();
  });

  it('12. multiple simultaneous 401 responses produce exactly ONE refresh request (single-flight), not a refresh storm', async () => {
    setToken('valid-access-token');
    let refreshCalls = 0;
    global.fetch = vi.fn((url) => {
      const u = String(url);
      if (u.includes('/auth/refresh')) {
        refreshCalls++;
        return new Promise((resolve) =>
          setTimeout(() => resolve(jsonResponse(200, { data: { accessToken: 'new-token' } })), 10));
      }
      return Promise.resolve(jsonResponse(401, { error: { code: 'TOKEN_EXPIRED' } }));
    });

    const results = await Promise.allSettled([
      api.get('/cart'),
      api.get('/wishlist'),
      api.get('/auth/me'),
    ]);

    expect(refreshCalls).toBe(1); // deduped — not 3
    expect(getToken()).toBe('new-token'); // the single refresh's new token was stored
    // The refresh itself succeeded, so nothing here is a session-destroying failure.
    results.forEach((r) => {
      if (r.status === 'rejected') expect(r.reason.code).not.toBe('SESSION_EXPIRED');
    });
  });

  it('a plain successful request never triggers refresh logic at all', async () => {
    setToken('valid-access-token');
    global.fetch = vi.fn(() => Promise.resolve(jsonResponse(200, { data: { ok: true } })));

    const { data } = await api.get('/products');
    expect(data).toEqual({ ok: true });
    expect(getToken()).toBe('valid-access-token');
  });
});
