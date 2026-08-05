//applicationController.js
import Application from '../models/Application.js';
import AIUsageLog from '../models/AIUsageLog.js';

const cleanText = value => {
  return typeof value === 'string' ? value.trim() : '';
};

const hasValue = value => {
  if (Array.isArray(value)) return value.length > 0;

  return value !== '' &&
    value !== null &&
    value !== undefined;
};

const recalculateApplicationStats = application => {
  const answered = application.answers.filter(answer => {
    return hasValue(answer.value);
  }).length;

  const unresolved = application.answers.filter(answer => {
    return !hasValue(answer.value);
  }).length;

  application.stats.aiFilled = answered;
  application.stats.unresolved = unresolved;
};

const cleanArray = values => {
  if (!Array.isArray(values)) return [];

  return values
    .filter(value => typeof value === 'string')
    .map(value => value.trim())
    .filter(Boolean);
};

const normalizeJobContext = input => {
  const context = input || {};

  return {
    company: cleanText(context.company).slice(0, 300),
    jobTitle: cleanText(context.jobTitle).slice(0, 300),
    jobUrl: cleanText(context.jobUrl).slice(0, 2000),
    location: cleanText(context.location).slice(0, 500),
    description: cleanText(context.description).slice(0, 30000),
    companyDescription: cleanText(context.companyDescription).slice(0, 10000),
    responsibilities: cleanArray(context.responsibilities).slice(0, 50),
    requirements: cleanArray(context.requirements).slice(0, 50),
    preferredQualifications: cleanArray(context.preferredQualifications).slice(0, 50)
  };
};

// @desc    Create a scanned job application
// @route   POST /api/applications
export const createApplication = async (req, res, next) => {
  try {
    const application = await Application.create({
      user: req.user._id,
      atsPlatform: cleanText(req.body.atsPlatform) || 'generic',
      jobContext: normalizeJobContext(req.body.jobContext),
      fields: Array.isArray(req.body.fields) ? req.body.fields : [],
      status: 'scanned'
    });

    res.status(201).json(application);
  } catch (error) {
    next(error);
  }
};

// @desc    Get user's job applications
// @route   GET /api/applications
export const getApplications = async (req, res, next) => {
  try {
    const applications = await Application.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .select('-fields -answers');

    res.status(200).json(applications);
  } catch (error) {
    next(error);
  }
};

// @desc    Get one job application
// @route   GET /api/applications/:id
export const getApplication = async (req, res, next) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!application) {
      return res.status(404).json({
        message: 'Application not found.'
      });
    }

    res.status(200).json(application);
  } catch (error) {
    next(error);
  }
};

// @desc    Update application status
// @route   PATCH /api/applications/:id/status
export const updateApplicationStatus = async (req, res, next) => {
  try {
    const allowedStatuses = [
      'scanned',
      'analysing',
      'ready_for_review',
      'submitted',
      'failed'
    ];

    if (!allowedStatuses.includes(req.body.status)) {
      return res.status(400).json({
        message: 'Invalid application status.'
      });
    }

    const application = await Application.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!application) {
      return res.status(404).json({
        message: 'Application not found.'
      });
    }

    application.status = req.body.status;

    if (req.body.status === 'submitted') {
      application.submittedAt = new Date();
    }

    await application.save();

    res.status(200).json(application);
  } catch (error) {
    next(error);
  }
};

// @desc    Delete an application
// @route   DELETE /api/applications/:id
export const deleteApplication = async (req, res, next) => {
  try {
    const application = await Application.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!application) {
      return res.status(404).json({
        message: 'Application not found.'
      });
    }

    await Promise.all([
      AIUsageLog.deleteMany({
        user: req.user._id,
        application: application._id
      }),
      application.deleteOne()
    ]);

    res.status(200).json({
      message: 'Application and related AI logs deleted successfully.'
    });
  } catch (error) {
    next(error);
  }
};

// @desc    Review or manually update application answers
// @route   PATCH /api/applications/:id/answers
export const updateApplicationAnswers = async (req, res, next) => {
  try {
    if (!Array.isArray(req.body.answers)) {
      return res.status(400).json({
        message: 'answers must be an array.'
      });
    }

    const application = await Application.findOne({
      _id: req.params.id,
      user: req.user._id
    });

    if (!application) {
      return res.status(404).json({
        message: 'Application not found.'
      });
    }

    const syncAppliedAnswers =
      req.body.syncAppliedAnswers === true;

    const allowedSources = new Set([
      'profile',
      'applicationMemory',
      'documents',
      'generated',
      'user',
      'unknown'
    ]);

    req.body.answers.forEach(update => {
      const fieldId = cleanText(update.fieldId);

      if (!fieldId) return;

      const existingAnswer = application.answers.find(answer => {
        return answer.fieldId === fieldId;
      });

      if (!existingAnswer) return;

      if (Object.prototype.hasOwnProperty.call(update, 'value')) {
        existingAnswer.value = update.value;
      }

      if (syncAppliedAnswers) {
        existingAnswer.source = allowedSources.has(update.source)
          ? update.source
          : existingAnswer.source;

        if (Number.isFinite(Number(update.confidence))) {
          existingAnswer.confidence = Math.min(
            1,
            Math.max(0, Number(update.confidence))
          );
        }

        existingAnswer.requiresReview =
          update.requiresReview === true;

        existingAnswer.reviewReason =
          existingAnswer.requiresReview
            ? cleanText(update.reviewReason).slice(0, 2000)
            : '';
      } else {
        existingAnswer.source = 'user';
        existingAnswer.confidence = 1;
        existingAnswer.requiresReview = false;
        existingAnswer.reviewReason = '';
      }
    });

    recalculateApplicationStats(application);

    if (application.stats.unresolved === 0) {
      application.status = 'ready_for_review';
    }

    await application.save();

    res.status(200).json({
      message: 'Application answers updated successfully.',
      applicationId: application._id,
      status: application.status,
      stats: application.stats,
      answers: application.answers
    });
  } catch (error) {
    next(error);
  }
};
