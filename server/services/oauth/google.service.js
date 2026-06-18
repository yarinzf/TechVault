'use strict';

const { OAuth2Client } = require('google-auth-library');

let client = null;

const getClient = () => {
  if (!client) {
    if (!process.env.GOOGLE_CLIENT_ID) {
      throw new Error('GOOGLE_CLIENT_ID is not configured');
    }
    client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
  }
  return client;
};

/**
 * Verify a Google ID token (from GSI credential).
 * Returns the extracted identity fields — never the raw payload.
 *
 * @param {string} idToken  — the credential string from google.accounts.id
 * @returns {{ googleSub: string, email: string, name: string, emailVerified: boolean }}
 */
const verifyGoogleToken = async (idToken) => {
  if (!process.env.GOOGLE_CLIENT_ID) {
    const { AppError } = require('../../middleware/errorHandler');
    const { StatusCodes } = require('http-status-codes');
    throw new AppError('Google Sign In is not configured', StatusCodes.SERVICE_UNAVAILABLE, 'GOOGLE_NOT_CONFIGURED');
  }

  const ticket = await getClient().verifyIdToken({
    idToken,
    audience: process.env.GOOGLE_CLIENT_ID,
  });

  const payload = ticket.getPayload();

  if (!payload) {
    const { AppError } = require('../../middleware/errorHandler');
    const { StatusCodes } = require('http-status-codes');
    throw new AppError('Invalid Google token', StatusCodes.UNAUTHORIZED, 'INVALID_GOOGLE_TOKEN');
  }

  return {
    googleSub:     payload.sub,
    email:         payload.email,
    name:          payload.name || payload.email.split('@')[0],
    emailVerified: payload.email_verified === true,
  };
};

module.exports = { verifyGoogleToken };
