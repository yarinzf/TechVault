'use strict';

const jwt       = require('jsonwebtoken');
const https     = require('https');
const { AppError } = require('../../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');

const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER   = 'https://appleid.apple.com';

let cachedKeys = null;
let keysCachedAt = 0;
const KEYS_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetch Apple's public JWKS with a simple 1-hour in-memory cache.
 */
const fetchApplePublicKeys = () =>
  new Promise((resolve, reject) => {
    const now = Date.now();
    if (cachedKeys && now - keysCachedAt < KEYS_TTL_MS) {
      return resolve(cachedKeys);
    }
    https.get(APPLE_KEYS_URL, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          cachedKeys  = JSON.parse(raw).keys;
          keysCachedAt = Date.now();
          resolve(cachedKeys);
        } catch (e) {
          reject(new Error('Failed to parse Apple JWKS'));
        }
      });
    }).on('error', reject);
  });

/**
 * Convert a JWK to a PEM string using Node's built-in crypto.
 * Avoids the need for jwk-to-pem or similar packages.
 */
const jwkToPem = (jwk) => {
  const { createPublicKey } = require('crypto');
  const key = createPublicKey({ key: jwk, format: 'jwk' });
  return key.export({ type: 'spki', format: 'pem' });
};

/**
 * Check whether Apple Sign In env vars are configured.
 * Call this before every Apple auth request.
 */
const isConfigured = () =>
  !!(process.env.APPLE_CLIENT_ID && process.env.APPLE_TEAM_ID &&
     process.env.APPLE_KEY_ID    && process.env.APPLE_PRIVATE_KEY);

/**
 * Verify an Apple ID token.
 * Returns extracted identity fields.
 *
 * @param {string} idToken — the id_token from Apple's response
 * @returns {{ appleSub: string, email: string|null, emailVerified: boolean }}
 */
const verifyAppleToken = async (idToken) => {
  if (!isConfigured()) {
    throw new AppError(
      'Apple Sign In is not configured. Set APPLE_CLIENT_ID, APPLE_TEAM_ID, APPLE_KEY_ID, and APPLE_PRIVATE_KEY.',
      StatusCodes.SERVICE_UNAVAILABLE,
      'APPLE_NOT_CONFIGURED'
    );
  }

  // Decode header to find which key to use (kid)
  const decoded = jwt.decode(idToken, { complete: true });
  if (!decoded) {
    throw new AppError('Invalid Apple ID token', StatusCodes.UNAUTHORIZED, 'INVALID_APPLE_TOKEN');
  }

  const keys = await fetchApplePublicKeys();
  const signingKey = keys.find(k => k.kid === decoded.header.kid);

  if (!signingKey) {
    throw new AppError('Apple signing key not found', StatusCodes.UNAUTHORIZED, 'APPLE_KEY_NOT_FOUND');
  }

  let pem;
  try {
    pem = jwkToPem(signingKey);
  } catch {
    throw new AppError('Failed to convert Apple JWK to PEM', StatusCodes.INTERNAL_SERVER_ERROR, 'APPLE_KEY_CONVERT_ERROR');
  }

  let payload;
  try {
    payload = jwt.verify(idToken, pem, {
      algorithms: ['RS256'],
      issuer:     APPLE_ISSUER,
      audience:   process.env.APPLE_CLIENT_ID,
    });
  } catch (err) {
    throw new AppError('Apple ID token verification failed', StatusCodes.UNAUTHORIZED, 'INVALID_APPLE_TOKEN');
  }

  return {
    appleSub:      payload.sub,
    // Apple only provides email on first sign-in; subsequent logins have it null
    email:         payload.email || null,
    emailVerified: payload.email_verified === true || payload.email_verified === 'true',
  };
};

module.exports = { verifyAppleToken, isConfigured };
