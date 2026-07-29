//application.js
import mongoose from 'mongoose';

const jobContextSchema = new mongoose.Schema({
  company: { type: String, default: '' },
  jobTitle: { type: String, default: '' },
  jobUrl: { type: String, default: '' },
  location: { type: String, default: '' },
  description: { type: String, default: '' },
  companyDescription: { type: String, default: '' },
  responsibilities: { type: [String], default: [] },
  requirements: { type: [String], default: [] },
  preferredQualifications: { type: [String], default: [] }
}, { _id: false });

const applicationFieldSchema = new mongoose.Schema({
  fieldId: { type: String, required: true },
  label: { type: String, required: true },
  type: { type: String, default: 'text' },
  required: { type: Boolean, default: false },
  options: { type: [String], default: [] },
  currentValue: { type: mongoose.Schema.Types.Mixed, default: '' },
  maxLength: { type: Number, default: null }
}, { _id: false });

const applicationAnswerSchema = new mongoose.Schema({
  fieldId: { type: String, required: true },
  label: { type: String, default: '' },
  value: { type: mongoose.Schema.Types.Mixed, default: '' },
  source: {
  type: String,
  enum: [
    'profile',
    'applicationMemory',
    'documents',
    'generated',
    'user',
    'unknown'
  ],
  default: 'unknown'
},
confidence: { type: Number, min: 0, max: 1, default: 0 },
requiresReview: { type: Boolean, default: true },
reviewReason: { type: String, default: '' }
}, { _id: false });

const applicationSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },

  atsPlatform: { type: String, default: 'generic' },
  jobContext: { type: jobContextSchema, default: () => ({}) },
  fields: { type: [applicationFieldSchema], default: [] },
  answers: { type: [applicationAnswerSchema], default: [] },

  status: {
    type: String,
    enum: ['scanned', 'analysing', 'ready_for_review', 'submitted', 'failed'],
    default: 'scanned'
  },

  stats: {
    totalFields: { type: Number, default: 0 },
    scriptFilled: { type: Number, default: 0 },
    aiFilled: { type: Number, default: 0 },
    unresolved: { type: Number, default: 0 }
  },

  errorMessage: { type: String, default: '' },
  submittedAt: { type: Date, default: null }
}, { timestamps: true });

applicationSchema.index({ user: 1, createdAt: -1 });

const Application = mongoose.model('Application', applicationSchema);

export default Application;