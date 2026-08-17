//superAdminController.js
// Every handler here sits behind protect + superAdmin (which answers 404 to
// anyone else), so the whole surface is invisible to normal users and admins.
import User from '../models/User.js';
import Session from '../models/Session.js';
import Profile from '../models/Profile.js';
import Application from '../models/Application.js';
import AIUsageLog from '../models/AIUsageLog.js';
import AutofillLog from '../models/AutofillLog.js';
import { deleteUserResources } from './authController.js';

const PUBLIC_USER_FIELDS =
  '-password -resetPasswordCodeHash -resetPasswordExpiresAt ' +
  '-resetPasswordAttempts -resetPasswordLastSentAt';

const activeSessionFilter = {
  revokedAt: null,
  expiresAt: { $gt: new Date() }
};

const findTargetUser = async (req, res) => {
  const user = await User.findById(req.params.id);
  if (!user) {
    res.status(404);
    throw new Error('User not found');
  }
  return user;
};

const revokeSessions = async (userId, revokedBy, exceptTokenId = null) => {
  const filter = { user: userId, revokedAt: null };
  if (exceptTokenId) filter.tokenId = { $ne: exceptTokenId };

  const result = await Session.updateMany(filter, {
    $set: { revokedAt: new Date(), revokedBy }
  });

  return result.modifiedCount || 0;
};

const toSessionView = (session) => ({
  _id: session._id,
  user: session.user,
  ip: session.ip,
  browser: session.browser,
  os: session.os,
  deviceType: session.deviceType,
  location: session.location,
  createdAt: session.createdAt,
  lastSeenAt: session.lastSeenAt,
  expiresAt: session.expiresAt,
  revokedAt: session.revokedAt,
  revokedBy: session.revokedBy,
  active: !session.revokedAt && session.expiresAt.getTime() > Date.now()
});

// @desc  System totals + most recent logins
// @route GET /api/system/overview
export const getOverview = async (req, res, next) => {
  try {
    const [
      totalUsers,
      totalAdmins,
      disabledUsers,
      activeSessions,
      totalProfiles,
      totalApplications,
      totalAiCalls,
      totalAutofills,
      recentSessions
    ] = await Promise.all([
      User.countDocuments({ role: { $ne: 'superadmin' } }),
      User.countDocuments({ role: 'admin' }),
      User.countDocuments({ status: 'disabled' }),
      Session.countDocuments(activeSessionFilter),
      Profile.countDocuments({}),
      Application.countDocuments({}),
      AIUsageLog.countDocuments({}),
      AutofillLog.countDocuments({}),
      Session.find({})
        .sort({ createdAt: -1 })
        .limit(12)
        .populate('user', 'name email role status')
        .lean()
    ]);

    res.status(200).json({
      totals: {
        users: totalUsers,
        admins: totalAdmins,
        disabledUsers,
        activeSessions,
        profiles: totalProfiles,
        applications: totalApplications,
        aiCalls: totalAiCalls,
        autofills: totalAutofills
      },
      recentLogins: recentSessions.map(session => ({
        ...toSessionView({
          ...session,
          expiresAt: new Date(session.expiresAt)
        }),
        user: session.user
      }))
    });
  } catch (error) { next(error); }
};

// @desc  Every account in the system (including admins and the super admin)
//        with live session counts and last-login info
// @route GET /api/system/users
export const listUsers = async (req, res, next) => {
  try {
    const [users, sessionStats] = await Promise.all([
      User.find({}).select(PUBLIC_USER_FIELDS).sort({ createdAt: -1 }).lean(),
      Session.aggregate([
        {
          $group: {
            _id: '$user',
            activeSessions: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$revokedAt', null] },
                      { $gt: ['$expiresAt', new Date()] }
                    ]
                  },
                  1,
                  0
                ]
              }
            },
            lastLoginAt: { $max: '$createdAt' },
            lastSeenAt: { $max: '$lastSeenAt' }
          }
        }
      ])
    ]);

    const statsByUser = new Map(
      sessionStats.map(item => [String(item._id), item])
    );

    res.status(200).json(users.map(user => {
      const stats = statsByUser.get(String(user._id));
      return {
        ...user,
        activeSessions: stats?.activeSessions || 0,
        lastLoginAt: stats?.lastLoginAt || null,
        lastSeenAt: stats?.lastSeenAt || null
      };
    }));
  } catch (error) { next(error); }
};

// @desc  Full session/login history for one user (newest first)
// @route GET /api/system/users/:id/sessions
export const getUserSessions = async (req, res, next) => {
  try {
    const user = await findTargetUser(req, res);

    const sessions = await Session.find({ user: user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    res.status(200).json(sessions.map(session => toSessionView({
      ...session,
      expiresAt: new Date(session.expiresAt)
    })));
  } catch (error) { next(error); }
};

// @desc  All live sessions across the whole system
// @route GET /api/system/sessions
export const listActiveSessions = async (req, res, next) => {
  try {
    const sessions = await Session.find(activeSessionFilter)
      .sort({ lastSeenAt: -1 })
      .limit(300)
      .populate('user', 'name email role status')
      .lean();

    res.status(200).json(sessions.map(session => ({
      ...toSessionView({
        ...session,
        expiresAt: new Date(session.expiresAt)
      }),
      user: session.user
    })));
  } catch (error) { next(error); }
};

// @desc  Log a single device/session out
// @route DELETE /api/system/sessions/:id
export const revokeSessionById = async (req, res, next) => {
  try {
    const session = await Session.findById(req.params.id);

    if (!session) {
      res.status(404);
      throw new Error('Session not found');
    }

    if (!session.revokedAt) {
      session.revokedAt = new Date();
      session.revokedBy = 'superadmin';
      await session.save();
    }

    const isOwnSession =
      req.sessionRecord && String(session._id) === String(req.sessionRecord._id);

    res.status(200).json({
      message: 'Session logged out.',
      ownSession: Boolean(isOwnSession)
    });
  } catch (error) { next(error); }
};

// @desc  Log a user out of every device
// @route POST /api/system/users/:id/logout
export const logoutUserEverywhere = async (req, res, next) => {
  try {
    const user = await findTargetUser(req, res);

    const isSelf = String(user._id) === String(req.user._id);
    const revoked = await revokeSessions(
      user._id,
      'superadmin',
      isSelf ? req.sessionRecord?.tokenId : null
    );

    res.status(200).json({
      message: `Logged ${user.email} out of ${revoked} session(s).`
    });
  } catch (error) { next(error); }
};

// @desc  Enable / disable an account. Disabling also kills its sessions.
// @route PATCH /api/system/users/:id/status
export const setUserStatus = async (req, res, next) => {
  try {
    const status = String(req.body.status || '').toLowerCase();

    if (!['active', 'disabled'].includes(status)) {
      res.status(400);
      throw new Error("Status must be 'active' or 'disabled'.");
    }

    const user = await findTargetUser(req, res);

    if (user.role === 'superadmin') {
      res.status(400);
      throw new Error('Super admin accounts cannot be disabled.');
    }

    user.status = status;
    await user.save();

    if (status === 'disabled') {
      await revokeSessions(user._id, 'superadmin-disable');
    }

    res.status(200).json({
      message: `Account ${status === 'disabled' ? 'disabled' : 'enabled'}: ${user.email}`,
      user: { _id: user._id, status: user.status }
    });
  } catch (error) { next(error); }
};

// @desc  Set any user's password (self allowed too). Kills their sessions.
// @route PATCH /api/system/users/:id/password
export const setUserPassword = async (req, res, next) => {
  try {
    const password = String(req.body.password || '');

    if (password.length < 6) {
      res.status(400);
      throw new Error('Password must be at least 6 characters.');
    }

    const user = await findTargetUser(req, res);
    const isSelf = String(user._id) === String(req.user._id);

    if (user.role === 'superadmin' && !isSelf) {
      res.status(400);
      throw new Error("Another super admin's password cannot be changed.");
    }

    user.password = password; // pre-save hook hashes it
    user.resetPasswordCodeHash = null;
    user.resetPasswordExpiresAt = null;
    user.resetPasswordAttempts = 0;
    await user.save();

    await revokeSessions(
      user._id,
      'superadmin-password-change',
      isSelf ? req.sessionRecord?.tokenId : null
    );

    res.status(200).json({ message: `Password updated for ${user.email}.` });
  } catch (error) { next(error); }
};

// @desc  Promote/demote between user and admin
// @route PATCH /api/system/users/:id/role
export const setUserRole = async (req, res, next) => {
  try {
    const role = String(req.body.role || '').toLowerCase();

    if (!['user', 'admin'].includes(role)) {
      res.status(400);
      throw new Error("Role must be 'user' or 'admin'.");
    }

    const user = await findTargetUser(req, res);

    if (user.role === 'superadmin') {
      res.status(400);
      throw new Error('The super admin role cannot be changed.');
    }

    user.role = role;
    await user.save();

    res.status(200).json({
      message: `${user.email} is now ${role === 'admin' ? 'an admin' : 'a regular user'}.`,
      user: { _id: user._id, role: user.role }
    });
  } catch (error) { next(error); }
};

// @desc  Edit a user's name / email
// @route PATCH /api/system/users/:id
export const updateUserInfo = async (req, res, next) => {
  try {
    const user = await findTargetUser(req, res);

    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').toLowerCase().trim();

    if (email && email !== user.email) {
      const taken = await User.findOne({ email, _id: { $ne: user._id } });
      if (taken) {
        res.status(400);
        throw new Error('That email is already in use.');
      }
      user.email = email;
    }

    if (name) user.name = name;

    await user.save();

    res.status(200).json({
      message: 'User updated.',
      user: { _id: user._id, name: user.name, email: user.email }
    });
  } catch (error) { next(error); }
};

// @desc  Delete any account (normal admins included) and all its data
// @route DELETE /api/system/users/:id
export const deleteUserBySuperAdmin = async (req, res, next) => {
  try {
    const user = await findTargetUser(req, res);

    if (user.role === 'superadmin') {
      res.status(400);
      throw new Error('Super admin accounts cannot be deleted.');
    }

    await deleteUserResources(user);

    res.status(200).json({
      message: `${user.email} and all associated data deleted.`
    });
  } catch (error) { next(error); }
};
