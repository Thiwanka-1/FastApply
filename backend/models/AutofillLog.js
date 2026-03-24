import mongoose from 'mongoose';

const autofillLogSchema = new mongoose.Schema(
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
    jobUrl: {
      type: String,
      default: '',
    },
    dateLogged: {
      type: Date,
      default: Date.now,
    }
  },
  { timestamps: true }
);

const AutofillLog = mongoose.model('AutofillLog', autofillLogSchema);
export default AutofillLog;