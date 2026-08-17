//authMiddleware.js
import jwt from 'jsonwebtoken';
import User from '../models/User.js';
import Session from '../models/Session.js';

const SESSION_TOUCH_INTERVAL_MS = 60 * 1000;

export const clearAuthCookie = (res) => {
  res.cookie('jwt', '', {
    httpOnly: true,
    expires: new Date(0),
    secure: process.env.NODE_ENV !== 'development',
    sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax'
  });
};

// Protect routes - must be logged in
export const protect = async (req, res, next) => {
  let token = req.cookies.jwt;

  if (!token) {
    res.status(401);
    next(new Error('Not authorized, no token'));
    return;
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Tokens without a session id predate session tracking; force a fresh
    // login so every live credential has a revocable session row.
    if (!decoded.sid) {
      clearAuthCookie(res);
      res.status(401);
      next(new Error('Session expired, please log in again'));
      return;
    }

    const session = await Session.findOne({ tokenId: decoded.sid });

    if (!session || !session.isActive()) {
      clearAuthCookie(res);
      res.status(401);
      next(new Error('Session has ended, please log in again'));
      return;
    }

    req.user = await User.findById(decoded.userId).select('-password');

    if (!req.user) {
      clearAuthCookie(res);
      res.status(401);
      next(new Error('Not authorized, user no longer exists'));
      return;
    }

    if (req.user.status === 'disabled') {
      clearAuthCookie(res);
      res.status(403);
      next(new Error('This account has been disabled.'));
      return;
    }

    req.sessionRecord = session;

    // Keep lastSeenAt roughly current without a write per request.
    if (Date.now() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
      Session.updateOne(
        { _id: session._id },
        { $set: { lastSeenAt: new Date() } }
      ).catch(() => {});
    }

    next();
  } catch (error) {
    res.status(401);
    next(new Error('Not authorized, token failed'));
  }
};

// Admin guard - must be an admin
export const admin = (req, res, next) => {
  if (req.user && req.user.role === 'admin') {
    next();
  } else {
    res.status(403); // 403 Forbidden
    next(new Error('Not authorized as an admin'));
  }
};

// Super admin guard. Responds 404 (not 403) so probing the endpoints does not
// reveal that a super admin layer exists at all.
export const superAdmin = (req, res, next) => {
  if (req.user && req.user.role === 'superadmin') {
    next();
  } else {
    res.status(404);
    next(new Error('Not found'));
  }
};
