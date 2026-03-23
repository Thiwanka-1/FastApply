import express from 'express';
import { 
  registerUser, 
  loginUser, 
  logoutUser,
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
  getUsers,
  deleteUserByAdmin,
  registerAdmin
} from '../controllers/authController.js';
import { protect, admin } from '../middleware/authMiddleware.js';

const router = express.Router();

// Public routes
router.post('/register', registerUser);
router.post('/login', loginUser);
router.post('/logout', logoutUser);

// Personal profile routes (Requires login)
// By using router.route, we can chain GET, PUT, and DELETE to the same URL
router.route('/profile')
  .get(protect, getUserProfile)
  .put(protect, updateUserProfile)
  .delete(protect, deleteUserProfile);

// Admin routes (Requires login AND admin role)
router.route('/admin/users')
  .get(protect, admin, getUsers);

router.route('/admin/users/:id')
  .delete(protect, admin, deleteUserByAdmin);

router.route('/admin/register')
  .post(protect, admin, registerAdmin);

export default router;