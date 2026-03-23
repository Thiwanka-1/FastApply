import mongoose from 'mongoose';

const profileSchema = new mongoose.Schema(
  {
    // Link to the User who owns this profile
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true, // One profile per user
    },
    
    personalInfo: {
      firstName: { type: String, default: '' },
      lastName: { type: String, default: '' },
      preferredName: { type: String, default: '' },
      pronouns: { type: String, default: '' }, // *Added for FastApply*
      languages: [
        {
          language: { type: String },
          proficiency: { type: String },
          fluent: { type: Boolean, default: false },
        }
      ]
    },

    contactInfo: {
      email: { type: String, default: '' },
      phone: { type: String, default: '' },
      addressLine1: { type: String, default: '' },
      addressLine2: { type: String, default: '' },
      city: { type: String, default: '' },
      state: { type: String, default: '' },
      country: { type: String, default: '' },
      postalCode: { type: String, default: '' },
    },

    websitesAndSkills: {
      linkedin: { type: String, default: '' },
      github: { type: String, default: '' },
      twitter: { type: String, default: '' },
      portfolio: { type: String, default: '' },
      skills: [{ type: String }],
    },

    workHistory: [
      {
        jobTitle: { type: String },
        company: { type: String },
        location: { type: String },
        employmentType: { type: String }, // *Added: Full-time, Intern, etc.*
        currentlyWorkHere: { type: Boolean, default: false },
        startDate: { type: String }, // Stored as string for easy form mapping (e.g., "Feb 2024")
        endDate: { type: String },
        description: { type: String },
      }
    ],

    educationHistory: [
      {
        school: { type: String },
        institutionLocation: { type: String }, // *Added: City, Country*
        degree: { type: String },
        major: { type: String },
        minor: { type: String }, // *Added*
        gpa: { type: String },
        gpaScale: { type: String }, // *Added: e.g., 4.0 or 10.0*
        startDate: { type: String },
        endDate: { type: String },
      }
    ],

    eeo: {
      optOut: { type: Boolean, default: false }, // "I choose not to disclose"
      authorizedToWork: { type: String, default: '' }, // Yes/No
      requireVisaNow: { type: String, default: '' }, // *Granular Visa Support*
      requireVisaFuture: { type: String, default: '' },
      disability: { type: String, default: '' },
      veteran: { type: String, default: '' },
      gender: { type: String, default: '' },
      ethnicity: { type: String, default: '' },
      age: { type: String, default: '' },
    },

    resume: {
      fileName: { type: String, default: '' },
      fileUrl: { type: String, default: '' }, // This will hold the AWS/Cloudinary link later
    }
  },
  { timestamps: true }
);

const Profile = mongoose.model('Profile', profileSchema);
export default Profile;