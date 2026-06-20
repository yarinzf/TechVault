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

  let ticket;
  try {
    ticket = await getClient().verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
  } catch (err) {
    const { AppError } = require('../../middleware/errorHandler');
    const { StatusCodes } = require('http-status-codes');
    const logger = require('../../config/logger');
    logger.warn('Google token verification failed', { reason: err.message });
    throw new AppError('Google token verification failed', StatusCodes.BAD_REQUEST, 'INVALID_GOOGLE_TOKEN');
  }

  const payload = ticket.getPayload();

  if (!payload) {
    const { AppError } = require('../../middleware/errorHandler');
    const { StatusCodes } = require('http-status-codes');
    throw new AppError('Invalid Google token payload', StatusCodes.BAD_REQUEST, 'INVALID_GOOGLE_TOKEN');
  }

  return {
    googleSub:     payload.sub,
    email:         payload.email,
    name:          payload.name || payload.email.split('@')[0],
    emailVerified: payload.email_verified === true,
  };
};

module.exports = { verifyGoogleToken };
