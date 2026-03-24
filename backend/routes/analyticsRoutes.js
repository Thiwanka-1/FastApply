import express from 'express';
import { 
  logAutofill, getUserAnalytics, updateLog, deleteLog, clearUserHistory, getGlobalAnalytics 
} from '../controllers/analyticsController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect); // All routes require login

// Normal User Routes
router.route('/')
  .post(logAutofill)
  .get(getUserAnalytics);

router.delete('/clear-history', clearUserHistory);

router.route('/:id')
  .put(updateLog)
  .delete(deleteLog);

// Admin Routes
router.get('/admin/global', admin, getGlobalAnalytics);

export default router;