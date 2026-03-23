import express from 'express';
import { 
  getProfile, 
  updateProfile, 
  uploadResume, 
  clearEntireProfile, 
  clearProfileSection 
} from '../controllers/profileController.js';
import { protect } from '../middleware/authMiddleware.js';
import { upload } from '../middleware/uploadMiddleware.js';

const router = express.Router();

// Apply 'protect' middleware to all routes in this file automatically
router.use(protect); 

// Standard CRUD
router.route('/')
  .get(getProfile)
  .put(updateProfile);

// File Upload (Expects a form-data field named 'resumeFile')
router.post('/upload-resume', upload.single('resumeFile'), uploadResume);

// Clearing Functions
router.delete('/clear-all', clearEntireProfile);
router.delete('/clear-section/:sectionName', clearProfileSection);

export default router;