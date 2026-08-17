//Session.js
// One document per issued login token. Doubles as the login history:
// revoked/expired sessions stay in the collection (marked revoked) until the
// TTL index removes them, so the system console can show where and when each
// account signed in.
import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },

    // The jti embedded in the JWT. Revoking a session invalidates the token
    // even though the JWT itself is still cryptographically valid.
    tokenId: {
      type: String,
      required: true,
      unique: true
    },

    ip: { type: String, default: '' },
    userAgent: { type: String, default: '' },
    browser: { type: String, default: '' },
    os: { type: String, default: '' },
    deviceType: { type: String, default: '' },

    location: {
      country: { type: String, default: '' },
      region: { type: String, default: '' },
      city: { type: String, default: '' },
      isp: { type: String, default: '' }
    },

    lastSeenAt: { type: Date, default: Date.now },

    // Mirrors the JWT expiry so stale rows clean themselves up.
    expiresAt: { type: Date, required: true },

    revokedAt: { type: Date, default: null },
    revokedBy: { type: String, default: '' }
  },
  { timestamps: true }
);

// MongoDB drops the row once expiresAt passes.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

sessionSchema.methods.isActive = function () {
  return !this.revokedAt && this.expiresAt.getTime() > Date.now();
};

const Session = mongoose.model('Session', sessionSchema);
export default Session;
