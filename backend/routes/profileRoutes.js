import express from 'express';
import { 
  getProfile, 
  updateProfile, 
  uploadResume, 
  clearEntireProfile, 
  clearProfileSection,
  parseDocumentsAndPopulateProfile // <-- NEW: Imported our future AI controller
} from '../controllers/profileController.js';
import { protect } from '../middleware/authMiddleware.js';
import { uploadDocs } from '../middleware/uploadMiddleware.js'; // <-- NEW: Updated import name

const router = express.Router();

// Apply 'protect' middleware to all routes in this file automatically
router.use(protect); 

// Standard CRUD
router.route('/')
  .get(getProfile)
  .put(updateProfile);

// Existing File Upload (Expects a form-data field named 'resumeFile')
router.post('/upload-resume', uploadDocs.single('resumeFile'), uploadResume);

// NEW AI PARSING ROUTE
// Expects an array of up to 3 files under the form-data field name 'documents'
router.post('/parse-docs', uploadDocs.array('documents', 3), parseDocumentsAndPopulateProfile);

// Clearing Functions
router.delete('/clear-all', clearEntireProfile);
router.delete('/clear-section/:sectionName', clearProfileSection);

export default router;