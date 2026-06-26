'use strict';

const mongoose = require('mongoose');
const os = require('os');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { version } = require('../../package.json');
const { sendSuccess } = require('../utils/response');

// ── Configurable paths (env → sensible defaults) ────────────────────────────
const PROJECT_ROOT = process.env.PROJECT_ROOT || (process.env.NODE_ENV === 'production' ? '/opt/techvault' : process.cwd());
const BACKUP_ROOT  = process.env.BACKUP_ROOT  || path.join(PROJECT_ROOT, 'backups', 'mongodb');
const BACKUP_LOG   = process.env.BACKUP_LOG   || path.join(PROJECT_ROOT, 'backups', 'backup.log');
const HEALTH_LOG   = process.env.HEALTH_LOG   || path.join(PROJECT_ROOT, 'logs', 'health-check.log');

const READY_STATE_LABELS = {
  0: 'disconnected',
  1: 'connected',
  2: 'connecting',
  3: 'disconnecting',
};

const formatBytes = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function getBackupInfo() {
  try {
    if (!fs.existsSync(BACKUP_ROOT)) return { available: false };

    const files = fs.readdirSync(BACKUP_ROOT)
      .filter(f => f.startsWith('techvault_') && f.endsWith('.gz') && !f.includes('pre-restore'))
      .sort()
      .reverse();

    if (files.length === 0) return { available: false };

    const latestFile = files[0];
    const latestPath = path.join(BACKUP_ROOT, latestFile);
    const stat = fs.statSync(latestPath);
    const ageHours = Math.floor((Date.now() - stat.mtimeMs) / 3600000);

    return {
      available: true,
      totalBackups: files.length,
      latest: {
        filename: latestFile,
        size: formatBytes(stat.size),
        date: stat.mtime.toISOString(),
        ageHours,
        healthy: ageHours <= 26,
      },
    };
  } catch {
    return { available: false };
  }
}

function getLastLineMatching(filePath, keyword) {
  try {
    if (!fs.existsSync(filePath)) return null;
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.trim().split('\n').reverse();
    return lines.find(l => l.includes(keyword)) || null;
  } catch {
    return null;
  }
}

function getDiskUsage() {
  try {
    const output = execSync("df -h / | awk 'NR==2 {print $2, $3, $4, $5}'", { timeout: 5000 }).toString().trim();
    const [total, used, available, pct] = output.split(/\s+/);
    return { total, used, available, usedPct: pct };
  } catch {
    return null;
  }
}

function getS3Info() {
  const bucket = process.env.S3_BACKUP_BUCKET;
  if (!bucket) return { configured: false, reachable: false };

  let reachable = false;
  let lastUpload = null;
  try {
    const output = execSync(
      `aws s3api head-bucket --bucket "${bucket}" 2>&1 && echo __OK__`,
      { timeout: 10000 },
    ).toString();
    reachable = output.includes('__OK__');
  } catch {
    reachable = false;
  }

  if (reachable) {
    try {
      const output = execSync(
        `aws s3 ls "s3://${bucket}/mongodb/" --recursive 2>/dev/null | sort | tail -1`,
        { timeout: 10000 },
      ).toString().trim();
      if (output) {
        const match = output.match(/^(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/);
        if (match) lastUpload = match[1];
      }
    } catch { /* non-fatal */ }
  }

  return { configured: true, reachable, bucket, lastUpload };
}

const getSystemStatus = async (req, res, next) => {
  try {
    const dbReadyState = mongoose.connection.readyState;
    const dbConnected = dbReadyState === 1;
    const mem = process.memoryUsage();
    const heapUsedPct = mem.heapUsed / mem.heapTotal;
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const ramUsedPct = ((totalMem - freeMem) / totalMem * 100).toFixed(1);

    const data = {
      status: dbConnected ? 'healthy' : 'unhealthy',
      version,
      node: process.version,
      environment: process.env.NODE_ENV || 'unknown',
      uptime: Math.floor(process.uptime()),
      timestamp: new Date().toISOString(),

      mongodb: {
        status: READY_STATE_LABELS[dbReadyState] || 'unknown',
        readyState: dbReadyState,
      },

      memory: {
        rss: formatBytes(mem.rss),
        heapUsed: formatBytes(mem.heapUsed),
        heapTotal: formatBytes(mem.heapTotal),
        heapUsedPct: `${(heapUsedPct * 100).toFixed(1)}%`,
        warning: heapUsedPct > 0.9,
      },

      system: {
        ramTotal: formatBytes(totalMem),
        ramFree: formatBytes(freeMem),
        ramUsedPct: `${ramUsedPct}%`,
        disk: getDiskUsage(),
        platform: os.platform(),
        cpus: os.cpus().length,
      },

      backups: {
        local: getBackupInfo(),
        s3: getS3Info(),
        lastLogEntry: getLastLineMatching(BACKUP_LOG, 'Backup complete'),
      },

      healthCheck: {
        lastResult: getLastLineMatching(HEALTH_LOG, 'RESULT:'),
      },
    };

    sendSuccess(res, data, 'System status retrieved');
  } catch (err) { next(err); }
};

module.exports = { getSystemStatus };
