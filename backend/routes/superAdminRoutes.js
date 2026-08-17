//superAdminRoutes.js
// Mounted at /api/system — an intentionally unremarkable path. The superAdmin
// guard answers 404 for anyone who is not the super admin, so these endpoints
// are indistinguishable from routes that do not exist.
import express from 'express';
import { protect, superAdmin } from '../middleware/authMiddleware.js';
import {
  getOverview,
  listUsers,
  getUserSessions,
  listActiveSessions,
  revokeSessionById,
  logoutUserEverywhere,
  setUserStatus,
  setUserPassword,
  setUserRole,
  updateUserInfo,
  deleteUserBySuperAdmin
} from '../controllers/superAdminController.js';

const router = express.Router();

router.use(protect, superAdmin);

router.get('/overview', getOverview);

router.get('/users', listUsers);
router.get('/users/:id/sessions', getUserSessions);
router.post('/users/:id/logout', logoutUserEverywhere);
router.patch('/users/:id/status', setUserStatus);
router.patch('/users/:id/password', setUserPassword);
router.patch('/users/:id/role', setUserRole);
router.patch('/users/:id', updateUserInfo);
router.delete('/users/:id', deleteUserBySuperAdmin);

router.get('/sessions', listActiveSessions);
router.delete('/sessions/:id', revokeSessionById);

export default router;
