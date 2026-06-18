'use strict';

const { scheduler }   = require('../jobs');
const { sendSuccess } = require('../utils/response');
const { AppError }    = require('../middleware/errorHandler');
const { StatusCodes } = require('http-status-codes');

/**
 * GET /api/v1/admin/jobs/status
 * Returns status for all registered jobs.
 */
const getJobsStatus = (req, res, next) => {
  try {
    const jobs = scheduler.getAllStatus();
    sendSuccess(res, { jobs }, 'Job statuses retrieved');
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/v1/admin/jobs/:name/run
 * Manually trigger a registered job by name.
 * Returns immediately — the job runs asynchronously.
 * Superadmin only.
 */
const triggerJob = (req, res, next) => {
  try {
    const { name } = req.params;

    if (!scheduler.getNames().includes(name)) {
      throw new AppError(
        `Job "${name}" not found. Known jobs: ${scheduler.getNames().join(', ')}`,
        StatusCodes.NOT_FOUND,
        'JOB_NOT_FOUND'
      );
    }

    const status = scheduler.getStatus(name);
    if (status?.isRunning) {
      throw new AppError(
        `Job "${name}" is already running`,
        StatusCodes.CONFLICT,
        'JOB_ALREADY_RUNNING'
      );
    }

    // Fire async — don't block the response
    scheduler.run(name).catch(() => {});

    sendSuccess(res, { name, triggered: true }, `Job "${name}" triggered`);
  } catch (err) {
    next(err);
  }
};

module.exports = { getJobsStatus, triggerJob };
