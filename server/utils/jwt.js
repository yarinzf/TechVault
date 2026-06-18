'use strict';

const jwt = require('jsonwebtoken');

const generateAccessToken = (payload) =>
  jwt.sign(payload, process.env.JWT_ACCESS_SECRET, {
    expiresIn: process.env.JWT_ACCESS_EXPIRES || '15m',
  });

const generateRefreshToken = (payload) =>
  jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
    expiresIn: process.env.JWT_REFRESH_EXPIRES || '7d',
  });

/** Throws JsonWebTokenError or TokenExpiredError on failure — both handled by errorHandler */
const verifyToken = (token, secret) => jwt.verify(token, secret);

module.exports = { generateAccessToken, generateRefreshToken, verifyToken };
