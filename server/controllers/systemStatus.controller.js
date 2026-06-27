'use strict';

const mongoose = require('mongoose');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { version } = require('../../package.json');
const { sendSuccess } = require('../utils/response');

const PROJECT_ROOT = process.env.PROJECT_ROOT || (process.env.NODE_ENV === 'production' ? '/opt/techvault' : process.cwd());
const BACKUP_ROOT  = process.env.BACKUP_ROOT  || path.join(PROJECT_ROOT, 'backups', 'mongodb');
const BACKUP_LOG   = process.env.BACKUP_LOG   || path.join(PROJECT_ROOT, 'backups', 'backup.log');
const HEALTH_LOG   = process.env.HEALTH_LOG   || path.join(PROJECT_ROOT, 'logs', 'health-check.log');
const IS_PROD      = process.env.NODE_ENV === 'production';

const DB_STATE_LABELS = { 0: 'disconnected', 1: 'connected', 2: 'connecting', 3: 'disconnecting' };
const MB = 1024 * 1024;
const formatMB = (bytes) => `${(bytes / MB).toFixed(1)} MB`;

// ── Helpers ─────────────────────────────────────────────────────────────────

function readLastMatch(filePath, keyword) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const lines = fs.readFileSync(filePath, 'utf8').trim().split('\n');
    for (let i = lines.length - 1; i >= 0; i--) {
      if (lines[i].includes(keyword)) return lines[i];
    }
    return null;
  } catch { return null; }
}

function parseTimestampFromLogLine(line) {
  if (!line) return null;
  const m = line.match(/\[(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})\]/);
  return m ? m[1] : null;
}

function getBackupInfo() {
  try {
    if (!fs.existsSync(BACKUP_ROOT)) return { status: 'unavailable', available: false };

    const files = fs.readdirSync(BACKUP_ROOT)
      .filter(f => f.startsWith('techvault_') && f.endsWith('.gz') && !f.includes('pre-restore'))
      .sort().reverse();

    if (files.length === 0) return { status: IS_PROD ? 'warning' : 'unavailable', available: false };

    const stat = fs.statSync(path.join(BACKUP_ROOT, files[0]));
    const ageHours = Math.floor((Date.now() - stat.mtimeMs) / 3600000);

    let status = 'healthy';
    if (ageHours > 48) status = 'critical';
    else if (ageHours > 26) status = 'warning';

    return {
      status,
      available: true,
      totalBackups: files.length,
      latest: {
        filename: files[0],
        size: formatMB(stat.size),
        sizeBytes: stat.size,
        date: stat.mtime.toISOString(),
        ageHours,
      },
    };
  } catch { return { status: 'unavailable', available: false }; }
}

function getS3Info() {
  const bucket = process.env.S3_BACKUP_BUCKET;
  if (!bucket) return { status: 'unavailable', configured: false, lastUploadConfirmed: false };

  const logLine = readLastMatch(BACKUP_LOG, 'S3 upload complete');
  const ts = parseTimestampFromLogLine(logLine);

  let status = 'warning';
  if (logLine) {
    if (ts) {
      const ageHours = Math.floor((Date.now() - new Date(ts.replace(' ', 'T')).getTime()) / 3600000);
      status = ageHours <= 26 ? 'healthy' : 'warning';
    } else {
      status = 'healthy';
    }
  }

  return { status, configured: true, lastUploadConfirmed: !!logLine, bucket, lastUploadLog: logLine, lastUploadTime: ts };
}

function getHealthCheckInfo() {
  const line = readLastMatch(HEALTH_LOG, 'RESULT:');
  if (!line) return { status: 'unavailable', lastResult: null };

  const ts = parseTimestampFromLogLine(line);
  let ageMinutes = null;
  if (ts) ageMinutes = Math.floor((Date.now() - new Date(ts.replace(' ', 'T')).getTime()) / 60000);

  let resultStatus = 'info';
  if (line.includes('HEALTHY')) resultStatus = 'healthy';
  else if (line.includes('WARNING')) resultStatus = 'warning';
  else if (line.includes('CRITICAL')) resultStatus = 'critical';

  let status = resultStatus;
  if (ageMinutes !== null) {
    if (ageMinutes > 360) status = 'critical';
    else if (ageMinutes > 90) status = 'warning';
  }

  return { status, lastResult: line, lastRunTime: ts, ageMinutes };
}

function getMemoryInfo() {
  const mem = process.memoryUsage();
  const heapPct = mem.heapUsed / mem.heapTotal;
  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  const ramPct = (totalRam - freeRam) / totalRam;
  const freeRamMB = freeRam / MB;

  let status = 'healthy';
  if (ramPct > 0.95 || freeRamMB < 100) status = 'critical';
  else if (ramPct > 0.9 || freeRamMB < 200 || (mem.rss > 512 * MB && ramPct > 0.85)) status = 'warning';

  return {
    status,
    rss: formatMB(mem.rss),
    heapUsed: formatMB(mem.heapUsed),
    heapTotal: formatMB(mem.heapTotal),
    heapUsedPct: `${(heapPct * 100).toFixed(1)}%`,
  };
}

function getSystemInfo() {
  const totalRam = os.totalmem();
  const freeRam = os.freemem();
  let disk = null;
  if (os.platform() !== 'win32') {
    try {
      const out = execSync("df -h / | awk 'NR==2 {print $2, $3, $4, $5}'", { timeout: 3000 }).toString().trim();
      const [total, used, available, pct] = out.split(/\s+/);
      disk = { total, used, available, usedPct: pct };
    } catch { /* graceful */ }
  }
  return {
    ramTotal: formatMB(totalRam),
    ramFree: formatMB(freeRam),
    ramUsedPct: `${(((totalRam - freeRam) / totalRam) * 100).toFixed(1)}%`,
    disk,
    platform: os.platform(),
    cpus: os.cpus().length,
  };
}

function deriveOverallStatus(components) {
  const statuses = Object.values(components).map(c => c.status || c);
  if (statuses.includes('critical') || statuses.includes('unhealthy')) return 'critical';
  if (statuses.includes('warning')) return 'warning';
  return 'healthy';
}

// ── Handler ─────────────────────────────────────────────────────────────────

const getSystemStatus = async (req, res, next) => {
  try {
    const dbReadyState = mongoose.connection.readyState;
    const dbConnected = dbReadyState === 1;
    const memory = getMemoryInfo();
    const backupLocal = getBackupInfo();
    const backupS3 = getS3Info();
    const healthCheck = getHealthCheckInfo();
    const lastLogEntry = readLastMatch(BACKUP_LOG, 'Backup complete');

    const mongoStatus = dbConnected ? 'healthy' : 'critical';

    const overall = deriveOverallStatus({
      mongo: mongoStatus,
      memory,
      backup: IS_PROD ? backupLocal : { status: 'healthy' },
      healthCheck: healthCheck.status === 'unavailable' ? { status: 'healthy' } : healthCheck,
    });

    const data = {
      status: overall,
      version,
      node: process.version,
      environment: process.env.NODE_ENV || 'unknown',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),

      mongodb: {
        status: DB_STATE_LABELS[dbReadyState] || 'unknown',
        readyState: dbReadyState,
      },

      memory,
      system: getSystemInfo(),

      backups: {
        local: backupLocal,
        s3: backupS3,
        lastLogEntry,
      },

      healthCheck,
    };

    const httpStatus = overall === 'critical' && !dbConnected ? 503 : 200;
    sendSuccess(res, data, 'System status retrieved', httpStatus);
  } catch (err) { next(err); }
};

module.exports = { getSystemStatus };
