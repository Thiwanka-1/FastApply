import mongoose from 'mongoose';

const languageSchema = new mongoose.Schema({
  language: { type: String, default: '' },
  proficiency: { type: String, default: '' },
  fluent: { type: Boolean, default: false }
}, { _id: false });

const workHistorySchema = new mongoose.Schema({
  jobTitle: { type: String, default: '' },
  company: { type: String, default: '' },
  location: { type: String, default: '' },
  employmentType: { type: String, default: '' },
  currentlyWorkHere: { type: Boolean, default: false },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  description: { type: String, default: '' }
});

const educationHistorySchema = new mongoose.Schema({
  school: { type: String, default: '' },
  institutionLocation: { type: String, default: '' },
  degree: { type: String, default: '' },
  major: { type: String, default: '' },
  minor: { type: String, default: '' },
  gpa: { type: String, default: '' },
  gpaScale: { type: String, default: '' },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' }
});

const documentSchema = new mongoose.Schema({
  fileName: { type: String, default: '' },
  fileUrl: { type: String, default: '' },

  // Firebase Storage path used to delete or replace the old file
  storagePath: { type: String, default: '' },

  // Extracted document text used by the AI
  rawText: { type: String, default: '' },

  mimeType: { type: String, default: '' },
  uploadedAt: { type: Date, default: null }
}, { _id: false });

const applicationAnswerSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    trim: true
  },

  question: {
    type: String,
    required: true,
    trim: true
  },

  // Can store a string, boolean, number, array or object
  answer: {
    type: mongoose.Schema.Types.Mixed,
    default: ''
  },

  answerType: {
    type: String,
    enum: ['text', 'boolean', 'number', 'array', 'object'],
    default: 'text'
  },

  aliases: [{
    type: String,
    trim: true
  }],

  source: {
    type: String,
    enum: ['resume', 'cqfo', 'coverLetter', 'manual', 'ai'],
    default: 'cqfo'
  },

  sensitive: {
    type: Boolean,
    default: false
  },

  confidence: {
    type: Number,
    min: 0,
    max: 1,
    default: 1
  }
}, { timestamps: true });

const profileSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true
    },

    personalInfo: {
      firstName: { type: String, default: '' },
      lastName: { type: String, default: '' },
      preferredName: { type: String, default: '' },
      pronouns: { type: String, default: '' },
      languages: {
        type: [languageSchema],
        default: []
      }
    },

    contactInfo: {
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      addressLine1: { type: String, default: '' },
      addressLine2: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: '' },
      postalCode: { type: String, default: '' }
    },

    websitesAndSkills: {
      linkedin: { type: String, default: '' },
      github: { type: String, default: '' },
      twitter: { type: String, default: '' },
      portfolio: { type: String, default: '' },
      skills: {
        type: [String],
        default: []
      }
    },

    workHistory: {
      type: [workHistorySchema],
      default: []
    },

    educationHistory: {
      type: [educationHistorySchema],
      default: []
    },

    eeo: {
      optOut: { type: Boolean, default: false },
      authorizedToWork: { type: String, default: '' },
      requireVisaNow: { type: String, default: '' },
      requireVisaFuture: { type: String, default: '' },
      disability: { type: String, default: '' },
      veteran: { type: String, default: '' },
      gender: { type: String, default: '' },
      ethnicity: { type: String, default: '' },
      race: { type: String, default: '' },
      age: { type: String, default: '' }
    },

    // Reusable answers extracted mainly from the CQFO
    applicationMemory: {
      answers: {
        type: [applicationAnswerSchema],
        default: []
      },
      lastExtractedAt: {
        type: Date,
        default: null
      }
    },

    // Current uploaded documents and current AI memory
    resume: {
      type: documentSchema,
      default: () => ({})
    },

    cqfo: {
      type: documentSchema,
      default: () => ({})
    },

    coverLetter: {
      type: documentSchema,
      default: () => ({})
    }
  },
  { timestamps: true }
);

const Profile = mongoose.model('Profile', profileSchema);

export default Profile;