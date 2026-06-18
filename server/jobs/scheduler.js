'use strict';

const cron   = require('node-cron');
const logger = require('../config/logger');

/**
 * Central job scheduler.
 *
 * Usage:
 *   scheduler.define('my-job', { fn, cronExpr, description });
 *   scheduler.start();            // call once after DB is ready
 *   await scheduler.run('my-job'); // manual trigger
 *   scheduler.getAllStatus();      // job health for admin endpoint
 */
class Scheduler {
  constructor() {
    this._registry = new Map(); // name → { fn, cronExpr, description }
    this._status   = new Map(); // name → status object
    this._tasks    = new Map(); // name → node-cron task (for cleanup)
  }

  /**
   * Register a job definition. Does not schedule it yet.
   * Call start() to activate all registered jobs.
   */
  define(name, { fn, cronExpr, description = name }) {
    if (this._registry.has(name)) {
      throw new Error(`[scheduler] Duplicate job name: "${name}"`);
    }
    this._registry.set(name, { fn, cronExpr, description });
    this._status.set(name, {
      name,
      description,
      cronExpr,
      lastRunAt:    null,
      lastSuccessAt: null,
      lastError:    null,
      lastErrorAt:  null,
      runCount:     0,
      isRunning:    false,
    });
  }

  /** Internal: execute one job with overlap guard + logging. */
  async _execute(name) {
    const def    = this._registry.get(name);
    const status = this._status.get(name);

    if (status.isRunning) {
      logger.warn(`[scheduler] "${name}" already running — skipped`);
      return;
    }

    status.isRunning = true;
    status.lastRunAt = new Date();
    status.runCount += 1;

    const start = Date.now();
    logger.info(`[scheduler] "${name}" started`);

    try {
      await def.fn();
      status.lastSuccessAt = new Date();
      status.lastError     = null;
      status.lastErrorAt   = null;
      logger.info(`[scheduler] "${name}" completed in ${Date.now() - start}ms`);
    } catch (err) {
      status.lastError   = err.message;
      status.lastErrorAt = new Date();
      logger.error(`[scheduler] "${name}" failed: ${err.message}`, { stack: err.stack });
    } finally {
      status.isRunning = false;
    }
  }

  /**
   * Schedule all registered jobs using node-cron.
   * Guarded by JOBS_ENABLED env var.
   */
  start() {
    if (process.env.JOBS_ENABLED === 'false') {
      logger.info('[scheduler] Jobs disabled via JOBS_ENABLED=false');
      return;
    }

    for (const [name, def] of this._registry) {
      const task = cron.schedule(def.cronExpr, () => this._execute(name));
      this._tasks.set(name, task);
    }

    const summary = [...this._registry.entries()]
      .map(([n, d]) => `${n} (${d.cronExpr})`)
      .join(', ');
    logger.info(`[scheduler] ${this._registry.size} job(s) scheduled: ${summary}`);
  }

  /**
   * Manually trigger a registered job by name.
   * Safe to call while the scheduler is running — the overlap guard still applies.
   */
  async run(name) {
    if (!this._registry.has(name)) {
      throw new Error(`[scheduler] Job "${name}" is not registered`);
    }
    await this._execute(name);
  }

  /** Returns all job status objects (array). */
  getAllStatus() {
    return [...this._status.values()];
  }

  /** Returns a single job status, or null if not found. */
  getStatus(name) {
    return this._status.get(name) ?? null;
  }

  /** Returns all registered job names. */
  getNames() {
    return [...this._registry.keys()];
  }
}

// Export a singleton so every require() shares the same registry + state
module.exports = new Scheduler();
