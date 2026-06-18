'use strict';

const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const path = require('path');

const { NODE_ENV } = process.env;
const isTest = NODE_ENV === 'test';
const isProd = NODE_ENV === 'production';

const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.json()
);

const prettyFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, ...meta }) => {
    const extra = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
    return `${timestamp} [${level}]: ${message}${extra}`;
  })
);

const transports = [];

if (isTest) {
  // Silent in tests — no noise, no file writes
  transports.push(new winston.transports.Console({ silent: true }));
} else {
  transports.push(
    new winston.transports.Console({ format: isProd ? jsonFormat : prettyFormat })
  );
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'app-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '14d',
      format: jsonFormat,
    })
  );
  transports.push(
    new DailyRotateFile({
      filename: path.join('logs', 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      zippedArchive: true,
      maxSize: '20m',
      maxFiles: '30d',
      format: jsonFormat,
    })
  );
}

const logger = winston.createLogger({
  level: isProd ? 'info' : 'debug',
  transports,
});

module.exports = logger;
