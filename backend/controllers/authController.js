//authController.js
import crypto from 'crypto';
import User from '../models/User.js';
import Profile from '../models/Profile.js';
import generateToken from '../utils/generateToken.js';
import Application from '../models/Application.js';
import AIUsageLog from '../models/AIUsageLog.js';
import AutofillLog from '../models/AutofillLog.js';
import { deleteFirebaseFileByPath } from '../services/firebaseStorageService.js';
import { sendEmail } from '../utils/sendEmail.js';

const getProfileStoragePaths = profile => {
  return [
    profile?.resume?.storagePath,
    profile?.cqfo?.storagePath,
    profile?.coverLetter?.storagePath
  ].filter(Boolean);
};

const deleteFirebaseFiles = async storagePaths => {
  const results = await Promise.allSettled(
    storagePaths.map(storagePath => {
      return deleteFirebaseFileByPath(storagePath);
    })
  );

  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(
        `Firebase cleanup failed for ${storagePaths[index]}:`,
        result.reason?.message
      );
    }
  });
};

const deleteUserResources = async user => {
  const userId = user._id;

  const profile = await Profile.findOne({ user: userId })
    .select(
      'resume.storagePath cqfo.storagePath coverLetter.storagePath'
    )
    .lean();

  const storagePaths = getProfileStoragePaths(profile);

  await Promise.all([
    Application.deleteMany({ user: userId }),
    AIUsageLog.deleteMany({ user: userId }),
    AutofillLog.deleteMany({ user: userId }),
    Profile.deleteOne({ user: userId })
  ]);

  await user.deleteOne();

  // Database deletion is already complete, so Firebase failures
  // are logged instead of returning a false account-deletion failure.
  await deleteFirebaseFiles(storagePaths);
};

// --- PUBLIC ROUTES ---

export const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const userExists = await User.findOne({ email });

    if (userExists) {
      res.status(400);
      throw new Error('User already exists');
    }

    const user = await User.create({ name, email, password });

    if (user) {
      await Profile.create({ user: user._id }); // Create empty extension profile
      generateToken(res, user._id);
      res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role });
    } else {
      res.status(400);
      throw new Error('Invalid user data');
    }
  } catch (error) { next(error); }
};

export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      generateToken(res, user._id);
      res.status(200).json({ _id: user._id, name: user.name, email: user.email, role: user.role });
    } else {
      res.status(401);
      throw new Error('Invalid email or password');
    }
  } catch (error) { next(error); }
};

export const logoutUser = (req, res) => {
  res.cookie('jwt', '', { httpOnly: true, expires: new Date(0) });
  res.status(200).json({ message: 'Logged out successfully' });
};

// --- PASSWORD RESET (email one-time code) ---

const RESET_CODE_TTL_MS = 15 * 60 * 1000;
const RESET_RESEND_COOLDOWN_MS = 60 * 1000;
const RESET_MAX_ATTEMPTS = 5;

const hashResetCode = code => {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
};

export const forgotPassword = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();

    // The response is identical whether or not the account exists, so the
    // endpoint cannot be used to probe which emails are registered.
    const respondGenerically = () => {
      res.status(200).json({
        message:
          'If an account exists for that email, a 6-digit reset code has been sent. It expires in 15 minutes.'
      });
    };

    if (!email) return respondGenerically();

    const user = await User.findOne({ email });
    if (!user) return respondGenerically();

    // One code per minute per account.
    if (
      user.resetPasswordLastSentAt &&
      Date.now() - user.resetPasswordLastSentAt.getTime() < RESET_RESEND_COOLDOWN_MS
    ) {
      return respondGenerically();
    }

    const code = String(crypto.randomInt(100000, 1000000));
    user.resetPasswordCodeHash = hashResetCode(code);
    user.resetPasswordExpiresAt = new Date(Date.now() + RESET_CODE_TTL_MS);
    user.resetPasswordAttempts = 0;
    user.resetPasswordLastSentAt = new Date();
    await user.save();

    await sendEmail({
      to: user.email,
      subject: `${code} is your FastApply password reset code`,
      text:
        `Hi ${user.name},\n\n` +
        `Your FastApply password reset code is: ${code}\n\n` +
        `Enter this code in the reset form. It expires in 15 minutes.\n` +
        `If you did not request a password reset, you can safely ignore this email — ` +
        `your password will not change.`,
      html:
        `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">` +
        `<h2 style="color:#0891b2">FastApply password reset</h2>` +
        `<p>Hi ${user.name},</p>` +
        `<p>Your password reset code is:</p>` +
        `<p style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#0f172a">${code}</p>` +
        `<p>Enter this code in the reset form. It expires in <strong>15 minutes</strong>.</p>` +
        `<p style="color:#64748b;font-size:13px">If you did not request a password reset, you can ` +
        `safely ignore this email — your password will not change.</p>` +
        `</div>`
    });

    return respondGenerically();
  } catch (error) { next(error); }
};

export const resetPassword = async (req, res, next) => {
  try {
    const email = String(req.body.email || '').toLowerCase().trim();
    const code = String(req.body.code || '').trim();
    const newPassword = String(req.body.newPassword || '');

    if (!email || !code || !newPassword) {
      res.status(400);
      throw new Error('Email, reset code and new password are required');
    }

    if (newPassword.length < 6) {
      res.status(400);
      throw new Error('Password must be at least 6 characters');
    }

    const rejectCode = () => {
      res.status(400);
      throw new Error('The reset code is invalid or has expired. Request a new one.');
    };

    const user = await User.findOne({ email });
    if (!user || !user.resetPasswordCodeHash || !user.resetPasswordExpiresAt) rejectCode();
    if (user.resetPasswordExpiresAt.getTime() < Date.now()) rejectCode();
    if (user.resetPasswordAttempts >= RESET_MAX_ATTEMPTS) rejectCode();

    if (hashResetCode(code) !== user.resetPasswordCodeHash) {
      user.resetPasswordAttempts += 1;
      await user.save();
      rejectCode();
    }

    user.password = newPassword; // the pre-save hook hashes it
    user.resetPasswordCodeHash = null;
    user.resetPasswordExpiresAt = null;
    user.resetPasswordAttempts = 0;
    user.resetPasswordLastSentAt = null;
    await user.save();

    res.status(200).json({
      message: 'Password reset successfully. You can now log in with your new password.'
    });
  } catch (error) { next(error); }
};

// --- PROTECTED USER ROUTES (Requires login) ---

export const getUserProfile = async (req, res, next) => {
  try {
    // req.user is already fetched by the 'protect' middleware
    res.status(200).json({ _id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role });
  } catch (error) { next(error); }
};

export const updateUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;

      // Only update password if one is provided
      if (req.body.password) {
        user.password = req.body.password; // The pre-save hook will hash this
      }

      const updatedUser = await user.save();
      res.status(200).json({ _id: updatedUser._id, name: updatedUser.name, email: updatedUser.email, role: updatedUser.role });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) { next(error); }
};

export const deleteUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    await deleteUserResources(user);

    res.cookie('jwt', '', {
      httpOnly: true,
      expires: new Date(0),
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production'
        ? 'none'
        : 'lax'
    });

    res.status(200).json({
      message: 'User and all associated data deleted successfully'
    });
  } catch (error) {
    next(error);
  }
};

// --- ADMIN ROUTES (Requires login AND Admin role) ---

export const getUsers = async (req, res, next) => {
  try {
    const users = await User.find({}).select('-password');
    res.status(200).json(users);
  } catch (error) { next(error); }
};

export const deleteUserByAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (!user) {
      res.status(404);
      throw new Error('User not found');
    }

    if (user.role === 'admin') {
      res.status(400);
      throw new Error('Cannot delete another admin');
    }

    await deleteUserResources(user);

    res.status(200).json({
      message:
        'User and all associated data deleted successfully by admin'
    });
  } catch (error) {
    next(error);
  }
};

export const registerAdmin = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const userExists = await User.findOne({ email });

    if (userExists) {
      res.status(400);
      throw new Error('User already exists');
    }

    const adminUser = await User.create({ name, email, password, role: 'admin' });

    if (adminUser) {
      res.status(201).json({ _id: adminUser._id, name: adminUser.name, email: adminUser.email, role: adminUser.role });
    } else {
      res.status(400);
      throw new Error('Invalid user data');
    }
  } catch (error) { next(error); }
};