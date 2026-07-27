import AIUsageLog from '../models/AIUsageLog.js';

const getPositiveInteger = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0
    ? parsed
    : fallback;
};

// @desc    Get current user's AI usage logs
// @route   GET /api/ai-usage
export const getAIUsageLogs = async (req, res, next) => {
  try {
    const page = getPositiveInteger(req.query.page, 1);
    const limit = Math.min(
      getPositiveInteger(req.query.limit, 20),
      100
    );

    const filter = {
      user: req.user._id
    };

    if (req.query.task) {
      filter.task = req.query.task;
    }

    if (req.query.success === 'true') {
      filter.success = true;
    }

    if (req.query.success === 'false') {
      filter.success = false;
    }

    const [logs, total] = await Promise.all([
      AIUsageLog.find(filter)
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .populate(
          'application',
          'jobContext.company jobContext.jobTitle status'
        ),

      AIUsageLog.countDocuments(filter)
    ]);

    res.status(200).json({
      logs,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Get current user's AI usage summary
// @route   GET /api/ai-usage/summary
export const getAIUsageSummary = async (req, res, next) => {
  try {
    const userId = req.user._id;

    const [overallResult, byTask] = await Promise.all([
      AIUsageLog.aggregate([
        {
          $match: {
            user: userId
          }
        },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            successfulRequests: {
              $sum: {
                $cond: ['$success', 1, 0]
              }
            },
            failedRequests: {
              $sum: {
                $cond: ['$success', 0, 1]
              }
            },
            averageDurationMs: {
              $avg: '$durationMs'
            },
            totalInputCharacters: {
              $sum: '$inputCharacters'
            },
            totalOutputCharacters: {
              $sum: '$outputCharacters'
            }
          }
        }
      ]),

      AIUsageLog.aggregate([
        {
          $match: {
            user: userId
          }
        },
        {
          $group: {
            _id: '$task',
            requests: { $sum: 1 },
            successful: {
              $sum: {
                $cond: ['$success', 1, 0]
              }
            },
            failed: {
              $sum: {
                $cond: ['$success', 0, 1]
              }
            },
            averageDurationMs: {
              $avg: '$durationMs'
            }
          }
        },
        {
          $sort: {
            requests: -1
          }
        }
      ])
    ]);

    const overall = overallResult[0] || {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      averageDurationMs: 0,
      totalInputCharacters: 0,
      totalOutputCharacters: 0
    };

    res.status(200).json({
      overall: {
        ...overall,
        averageDurationMs: Math.round(
          overall.averageDurationMs || 0
        )
      },

      byTask: byTask.map(item => ({
        task: item._id,
        requests: item.requests,
        successful: item.successful,
        failed: item.failed,
        averageDurationMs: Math.round(
          item.averageDurationMs || 0
        )
      }))
    });
  } catch (error) {
    next(error);
  }
};