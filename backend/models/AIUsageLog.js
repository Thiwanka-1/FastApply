//aiUsageLog.js
import mongoose from 'mongoose';

const aiUsageLogSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  application: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    default: null
  },

  task: {
    type: String,
    enum: ['profile_extraction', 'cqfo_vision', 'form_answers'],
    required: true
  },

  provider: { type: String, default: '' },
  model: { type: String, default: '' },

  inputCharacters: { type: Number, default: 0 },
  outputCharacters: { type: Number, default: 0 },
  durationMs: { type: Number, default: 0 },

  success: { type: Boolean, default: false },
  errorMessage: { type: String, default: '' }
}, { timestamps: true });

aiUsageLogSchema.index({ user: 1, createdAt: -1 });

const AIUsageLog = mongoose.model('AIUsageLog', aiUsageLogSchema);

export default AIUsageLog;