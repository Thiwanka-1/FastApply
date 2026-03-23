import express from 'express';
import { 
  addApplication, 
  getAnalytics, 
  deleteApplication 
} from '../controllers/analyticsController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

// All analytics routes require authentication
router.use(protect);

router.route('/')
  .post(addApplication)
  .get(getAnalytics);

router.route('/:id')
  .delete(deleteApplication);

export default router;