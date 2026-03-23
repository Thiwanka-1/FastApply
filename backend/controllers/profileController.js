import Profile from '../models/Profile.js';
import { storage } from '../config/firebase.js';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';

// @desc    Get current user's profile
// @route   GET /api/profile
export const getProfile = async (req, res, next) => {
  try {
    const profile = await Profile.findOne({ user: req.user._id });
    if (!profile) {
      res.status(404);
      throw new Error('Profile not found');
    }
    res.status(200).json(profile);
  } catch (error) { next(error); }
};

// @desc    Update profile (or add new data)
// @route   PUT /api/profile
export const updateProfile = async (req, res, next) => {
  try {
    // Finds the profile and updates only the fields provided in req.body
    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updatedProfile) {
      res.status(404);
      throw new Error('Profile not found');
    }

    res.status(200).json(updatedProfile);
  } catch (error) { next(error); }
};

// @desc    Upload Resume PDF to Firebase
// @route   POST /api/profile/upload-resume
export const uploadResume = async (req, res, next) => {
  try {
    if (!req.file) {
      res.status(400);
      throw new Error('No file uploaded');
    }

    const profile = await Profile.findOne({ user: req.user._id });

    // Optional: If they already have a resume, delete the old one from Firebase first to save space
    if (profile.resume && profile.resume.fileUrl) {
      try {
        const oldFileRef = ref(storage, profile.resume.fileUrl);
        await deleteObject(oldFileRef);
      } catch (err) {
        console.log("Old resume not found in storage, skipping deletion.");
      }
    }

    // Create a unique file name using the user ID and timestamp
    const fileName = `${req.user._id}_${Date.now()}_${req.file.originalname}`;
    const storageRef = ref(storage, `resumes/${fileName}`);
    
    // Upload the buffer to Firebase
    const metadata = { contentType: req.file.mimetype };
    const snapshot = await uploadBytesResumable(storageRef, req.file.buffer, metadata);
    
    // Get the public URL
    const downloadURL = await getDownloadURL(snapshot.ref);

    // Save the URL and original name to the database
    profile.resume = {
      fileName: req.file.originalname,
      fileUrl: downloadURL
    };
    
    await profile.save();

    res.status(200).json({ message: 'Resume uploaded successfully', resume: profile.resume });
  } catch (error) { next(error); }
};

// @desc    Clear entirely ALL profile data
// @route   DELETE /api/profile/clear-all
export const clearEntireProfile = async (req, res, next) => {
  try {
    const emptyProfileData = {
      personalInfo: { firstName: '', lastName: '', preferredName: '', pronouns: '', languages: [] },
      contactInfo: { email: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', country: '', postalCode: '' },
      websitesAndSkills: { linkedin: '', github: '', twitter: '', portfolio: '', skills: [] },
      workHistory: [],
      educationHistory: [],
      eeo: { optOut: false, authorizedToWork: '', requireVisaNow: '', requireVisaFuture: '', disability: '', veteran: '', gender: '', ethnicity: '', age: '' }
      // Note: We intentionally DO NOT clear the resume here. If they want to delete the file, they should do it explicitly.
    };

    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: emptyProfileData },
      { new: true }
    );

    res.status(200).json({ message: 'Entire profile cleared', profile: updatedProfile });
  } catch (error) { next(error); }
};

// @desc    Clear a specific section of the profile
// @route   DELETE /api/profile/clear-section/:sectionName
export const clearProfileSection = async (req, res, next) => {
  try {
    const { sectionName } = req.params;
    
    // Define the valid sections and their empty states
    const validSections = {
      personalInfo: { firstName: '', lastName: '', preferredName: '', pronouns: '', languages: [] },
      contactInfo: { email: '', phone: '', addressLine1: '', addressLine2: '', city: '', state: '', country: '', postalCode: '' },
      websitesAndSkills: { linkedin: '', github: '', twitter: '', portfolio: '', skills: [] },
      workHistory: [],
      educationHistory: [],
      eeo: { optOut: false, authorizedToWork: '', requireVisaNow: '', requireVisaFuture: '', disability: '', veteran: '', gender: '', ethnicity: '', age: '' }
    };

    if (!validSections[sectionName]) {
      res.status(400);
      throw new Error('Invalid section name provided');
    }

    // Use dynamic key insertion to clear only the requested section
    const updatedProfile = await Profile.findOneAndUpdate(
      { user: req.user._id },
      { $set: { [sectionName]: validSections[sectionName] } },
      { new: true }
    );

    res.status(200).json({ message: `${sectionName} cleared successfully`, profile: updatedProfile });
  } catch (error) { next(error); }
};