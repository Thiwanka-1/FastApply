import Profile from '../models/Profile.js';
import { storage } from '../config/firebase.js';
import { ref, uploadBytesResumable, getDownloadURL, deleteObject } from 'firebase/storage';
import mammoth from 'mammoth';
import { PDFParse } from 'pdf-parse';
import { extractProfileData, generateFormAnswers } from '../services/llmService.js';

// import { createRequire } from 'module';
// const require = createRequire(import.meta.url);
// const pdfParse = require('pdf-parse');

const extractPdfText = async (buffer) => {
  const parser = new PDFParse({ data: buffer });

  try {
    const result = await parser.getText();
    return result.text || '';
  } finally {
    await parser.destroy();
  }
};

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

// @desc    Parse uploaded docs, extract data via AI, upload to Firebase, and save AI Memory Bank
// @route   POST /api/profile/parse-docs
export const parseDocumentsAndPopulateProfile = async (req, res, next) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ message: 'No documents uploaded for parsing.' });
    }

    let combinedTextContent = "";
    
    // Variables to hold our Memory Bank data before saving
    let resumeMetadata = null;
    let cqfoMetadata = null;
    let coverLetterMetadata = null;

    // 1. Loop through files: Parse Text & Upload to Firebase
    // for (const file of req.files) {
    //   let fileText = "";
    //   const lowerName = file.originalname.toLowerCase();

    //   // Extract raw text
    //   if (file.mimetype === 'application/pdf') {
    //     fileText = await extractPdfText(file.buffer);
    //   } else if (
    //     file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || 
    //     file.mimetype === 'application/msword'
    //   ) {
    //     const parsedWord = await mammoth.extractRawText({ buffer: file.buffer });
    //     fileText = parsedWord.value;
    //   }

    //   // Upload the actual file to Firebase Storage to save DB space
    //   const fileName = `${req.user._id}_${Date.now()}_${file.originalname}`;
    //   const storageRef = ref(storage, `user_documents/${fileName}`);
    //   const metadata = { contentType: file.mimetype };
    //   const snapshot = await uploadBytesResumable(storageRef, file.buffer, metadata);
    //   const downloadURL = await getDownloadURL(snapshot.ref);

    //   // Create the object that will be saved to MongoDB
    //   const fileData = {
    //     fileName: file.originalname,
    //     fileUrl: downloadURL,
    //     rawText: fileText // <-- This is the crucial AI Memory Bank data
    //   };

    //   // Categorize the document
    //   if (lowerName.includes('cover') || lowerName.includes('letter')) {
    //     coverLetterMetadata = fileData;
    //     combinedTextContent += `\n--- Cover Letter ---\n${fileText}`;
    //   } else if (lowerName.includes('cqfo') || lowerName.includes('questionnaire')) {
    //     cqfoMetadata = fileData;
    //     combinedTextContent += `\n--- CQFO ---\n${fileText}`;
    //   } else {
    //     resumeMetadata = fileData;
    //     combinedTextContent += `\n--- Resume ---\n${fileText}`;
    //   }
    // }
    for (const file of req.files) {
  let fileText = '';
  const lowerName = file.originalname.toLowerCase();

  if (file.mimetype === 'application/pdf') {
    fileText = await extractPdfText(file.buffer);
  } else if (
    file.mimetype ===
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
    file.mimetype === 'application/msword'
  ) {
    const parsedWord = await mammoth.extractRawText({
      buffer: file.buffer
    });

    fileText = parsedWord.value || '';
  } else {
    console.warn(
      `Unsupported document type: ${file.originalname} (${file.mimetype})`
    );
    continue;
  }

  const fileName =
    `${req.user._id}_${Date.now()}_${file.originalname}`;

  const storageRef = ref(
    storage,
    `user_documents/${fileName}`
  );

  const metadata = {
    contentType: file.mimetype
  };

  const snapshot = await uploadBytesResumable(
    storageRef,
    file.buffer,
    metadata
  );

  const downloadURL = await getDownloadURL(snapshot.ref);

  const fileData = {
    fileName: file.originalname,
    fileUrl: downloadURL,
    rawText: fileText
  };

  if (lowerName.includes('cover') || lowerName.includes('letter')) {
    coverLetterMetadata = fileData;
    combinedTextContent += `\n--- Cover Letter ---\n${fileText}`;
  } else if (
    lowerName.includes('cqfo') ||
    lowerName.includes('questionnaire')
  ) {
    cqfoMetadata = fileData;
    combinedTextContent += `\n--- CQFO ---\n${fileText}`;
  } else {
    resumeMetadata = fileData;
    combinedTextContent += `\n--- Resume ---\n${fileText}`;
  }
}
    // 2. Call the AI for structured data extraction
    const extractedData = await extractProfileData(combinedTextContent);
    
    // DEBUGGING: Watch the terminal to see EXACTLY what Llama extracted!
    console.log("🔥 AI Extracted Data:", JSON.stringify(extractedData, null, 2));

    let profile = await Profile.findOne({ user: req.user._id });

    // Helper function to strip empty AI fields so we don't overwrite valid existing DB data with blanks
    const removeEmptyFields = (obj) => {
      if (!obj) return {};
      const cleaned = {};
      for (const [key, value] of Object.entries(obj)) {
        if (value !== "" && value !== null && (!Array.isArray(value) || value.length > 0)) {
          cleaned[key] = value;
        }
      }
      return cleaned;
    };

    const updatePayload = {};
    
    // Merge Structured Data
    if (extractedData.personalInfo) updatePayload.personalInfo = { ...profile?.personalInfo?.toObject(), ...removeEmptyFields(extractedData.personalInfo) };
    if (extractedData.contactInfo) updatePayload.contactInfo = { ...profile?.contactInfo?.toObject(), ...removeEmptyFields(extractedData.contactInfo) };
    if (extractedData.websitesAndSkills) updatePayload.websitesAndSkills = { ...profile?.websitesAndSkills?.toObject(), ...removeEmptyFields(extractedData.websitesAndSkills) };
    
    // For Arrays (History), we overwrite completely if AI found new data
    if (extractedData.workHistory && extractedData.workHistory.length > 0) updatePayload.workHistory = extractedData.workHistory;
    if (extractedData.educationHistory && extractedData.educationHistory.length > 0) updatePayload.educationHistory = extractedData.educationHistory;
    if (extractedData.eeo) updatePayload.eeo = { ...profile?.eeo?.toObject(), ...removeEmptyFields(extractedData.eeo) };

    // 3. Attach the AI Memory Bank (Firebase URLs + Raw Text) to the payload
    if (resumeMetadata) updatePayload.resume = resumeMetadata;
    if (cqfoMetadata) updatePayload.cqfo = cqfoMetadata;
    if (coverLetterMetadata) updatePayload.coverLetter = coverLetterMetadata;

    // 4. Save to Database
    if (!profile) {
      profile = new Profile({ user: req.user._id, ...updatePayload });
      await profile.save();
    } else {
      profile = await Profile.findOneAndUpdate(
        { user: req.user._id },
        { $set: updatePayload },
        { returnDocument: 'after', runValidators: true } 
      );
    }

    res.status(200).json({ 
      message: 'Documents stored in Firebase, memory bank populated, and profile structured!', 
      profile 
    });

  } catch (error) {
    console.error("Document Parsing Error:", error);
    next(error);
  }
};

// @desc    Generate AI answers for unanswered job application questions using Memory Bank
// @route   POST /api/profile/answer-questions
export const answerApplicationQuestions = async (req, res, next) => {
  try {
    const { targetCompany, targetJobTitle, unansweredQuestions } = req.body;

    // Validate the incoming request from the extension
    if (!unansweredQuestions || !Array.isArray(unansweredQuestions) || unansweredQuestions.length === 0) {
      return res.status(400).json({ message: 'No questions provided to answer.' });
    }

    const profile = await Profile.findOne({ user: req.user._id });
    if (!profile) {
      return res.status(404).json({ message: 'Profile not found. Please upload your documents first.' });
    }

    // Combine the raw text from the AI Memory Bank
    let aiMemoryBank = "";
    if (profile.resume?.rawText) aiMemoryBank += `\n--- RESUME ---\n${profile.resume.rawText}`;
    if (profile.coverLetter?.rawText) aiMemoryBank += `\n--- COVER LETTER ---\n${profile.coverLetter.rawText}`;
    if (profile.cqfo?.rawText) aiMemoryBank += `\n--- QUESTIONNAIRE ---\n${profile.cqfo.rawText}`;

    if (!aiMemoryBank.trim()) {
      return res.status(400).json({ message: 'No document context found in your profile to answer these questions.' });
    }

    // Feed the memory bank and the questions to the new LLM function
    const answers = await generateFormAnswers(
      aiMemoryBank,
      targetCompany || "this company", // Fallbacks just in case the extension couldn't find them on the page
      targetJobTitle || "this position",
      unansweredQuestions
    );

    res.status(200).json({ 
      message: 'Questions successfully answered by AI!', 
      answers 
    });

  } catch (error) {
    console.error("AI Form Answering Error:", error);
    next(error);
  }
};