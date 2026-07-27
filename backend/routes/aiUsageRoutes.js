import express from 'express';
import {
  getAIUsageLogs,
  getAIUsageSummary
} from '../controllers/aiUsageController.js';
import { protect } from '../middleware/authMiddleware.js';

const router = express.Router();

router.use(protect);

router.get('/', getAIUsageLogs);
router.get('/summary', getAIUsageSummary);

export default router;