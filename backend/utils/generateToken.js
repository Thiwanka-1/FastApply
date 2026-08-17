import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import Session from '../models/Session.js';
import {
  getClientIp,
  parseUserAgent,
  lookupIpLocation
} from './requestInfo.js';

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// Issues a JWT bound to a Session record. The session row is what makes the
// token revocable (remote logout / disable) and is where the device, IP and
// location of the login are stored.
const generateToken = async (res, userId, req) => {
  const tokenId = crypto.randomUUID();

  const ip = req ? getClientIp(req) : '';
  const userAgent = String(req?.headers?.['user-agent'] || '');

  const session = await Session.create({
    user: userId,
    tokenId,
    ip,
    userAgent,
    ...parseUserAgent(userAgent),
    lastSeenAt: new Date(),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS)
  });

  // Geo lookup is best-effort and must never delay the login response.
  lookupIpLocation(ip)
    .then(location => {
      if (!location) return null;
      return Session.updateOne(
        { _id: session._id },
        { $set: { location } }
      );
    })
    .catch(() => {});

  const token = jwt.sign({ userId, sid: tokenId }, process.env.JWT_SECRET, {
    expiresIn: '30d',
  });

  // Set JWT as HTTP-Only cookie
  res.cookie('jwt', token, {
    httpOnly: true,
    // In production, Chrome Extensions require 'secure: true' and 'sameSite: none'
    // to allow cookies to be sent from the extension to your hosted API.
    secure: process.env.NODE_ENV !== 'development',
    sameSite: process.env.NODE_ENV !== 'development' ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  });
};

export default generateToken;
