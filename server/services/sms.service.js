'use strict';

const { AppError } = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');

let twilioClient = null;

const isConfigured = () =>
  !!(process.env.TWILIO_ACCOUNT_SID &&
     process.env.TWILIO_AUTH_TOKEN   &&
     process.env.TWILIO_VERIFY_SERVICE_SID);

const getClient = () => {
  if (!isConfigured()) {
    throw new AppError(
      'SMS authentication is not configured. Set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_VERIFY_SERVICE_SID.',
      StatusCodes.SERVICE_UNAVAILABLE,
      'SMS_NOT_CONFIGURED'
    );
  }
  if (!twilioClient) {
    const twilio = require('twilio');
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return twilioClient;
};

/**
 * Send a verification code to the given phone number via Twilio Verify.
 * @param {string} phone  E.164 format: +972501234567
 */
const sendVerificationCode = async (phone) => {
  const client = getClient();
  await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID)
    .verifications.create({ to: phone, channel: 'sms' });
  return { sent: true };
};

/**
 * Check a verification code submitted by the user.
 * @returns {{ verified: boolean }}
 */
const checkVerificationCode = async (phone, code) => {
  const client = getClient();
  const result = await client.verify.v2
    .services(process.env.TWILIO_VERIFY_SERVICE_SID)
    .verificationChecks.create({ to: phone, code: String(code) });

  return { verified: result.status === 'approved' };
};

module.exports = { sendVerificationCode, checkVerificationCode, isConfigured };
