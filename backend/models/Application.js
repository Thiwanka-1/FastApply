import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    jobTitle: {
      type: String,
      required: true,
    },
    company: {
      type: String,
      required: true,
    },
    jobLink: {
      type: String,
      default: '',
    },
    companyLink: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      default: 'Applied', // Could be 'Applied', 'Interviewing', 'Rejected' later
    },
    dateApplied: {
      type: Date,
      default: Date.now,
    }
  },
  { timestamps: true }
);

const Application = mongoose.model('Application', applicationSchema);
export default Application;