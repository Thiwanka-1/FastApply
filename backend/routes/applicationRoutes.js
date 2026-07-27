import express from 'express';
import {
  createApplication,
  getApplications,
  getApplication,
  updateApplicationAnswers,
  updateApplicationStatus,
  deleteApplication
} from '../controllers/applicationController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.route('/')
  .post(createApplication)
  .get(getApplications);

router.route('/:id')
  .get(getApplication)
  .delete(deleteApplication);

router.patch('/:id/answers', updateApplicationAnswers);

router.patch('/:id/status', updateApplicationStatus);

export default router;