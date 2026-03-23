import User from '../models/User.js';
import Profile from '../models/Profile.js';
import generateToken from '../utils/generateToken.js';

// --- PUBLIC ROUTES ---

export const registerUser = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const userExists = await User.findOne({ email });

    if (userExists) {
      res.status(400);
      throw new Error('User already exists');
    }

    const user = await User.create({ name, email, password });

    if (user) {
      await Profile.create({ user: user._id }); // Create empty extension profile
      generateToken(res, user._id);
      res.status(201).json({ _id: user._id, name: user.name, email: user.email, role: user.role });
    } else {
      res.status(400);
      throw new Error('Invalid user data');
    }
  } catch (error) { next(error); }
};

export const loginUser = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });

    if (user && (await user.matchPassword(password))) {
      generateToken(res, user._id);
      res.status(200).json({ _id: user._id, name: user.name, email: user.email, role: user.role });
    } else {
      res.status(401);
      throw new Error('Invalid email or password');
    }
  } catch (error) { next(error); }
};

export const logoutUser = (req, res) => {
  res.cookie('jwt', '', { httpOnly: true, expires: new Date(0) });
  res.status(200).json({ message: 'Logged out successfully' });
};

// --- PROTECTED USER ROUTES (Requires login) ---

export const getUserProfile = async (req, res, next) => {
  try {
    // req.user is already fetched by the 'protect' middleware
    res.status(200).json({ _id: req.user._id, name: req.user.name, email: req.user.email, role: req.user.role });
  } catch (error) { next(error); }
};

export const updateUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;

      // Only update password if one is provided
      if (req.body.password) {
        user.password = req.body.password; // The pre-save hook will hash this
      }

      const updatedUser = await user.save();
      res.status(200).json({ _id: updatedUser._id, name: updatedUser.name, email: updatedUser.email, role: updatedUser.role });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) { next(error); }
};

export const deleteUserProfile = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);

    if (user) {
      await Profile.findOneAndDelete({ user: user._id }); // Delete their application profile
      await user.deleteOne(); // Delete the auth account
      res.cookie('jwt', '', { httpOnly: true, expires: new Date(0) }); // Log them out
      res.status(200).json({ message: 'User deleted successfully' });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) { next(error); }
};

// --- ADMIN ROUTES (Requires login AND Admin role) ---

export const getUsers = async (req, res, next) => {
  try {
    const users = await User.find({}).select('-password');
    res.status(200).json(users);
  } catch (error) { next(error); }
};

export const deleteUserByAdmin = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);

    if (user) {
      if (user.role === 'admin') {
        res.status(400);
        throw new Error('Cannot delete another admin');
      }
      await Profile.findOneAndDelete({ user: user._id });
      await user.deleteOne();
      res.status(200).json({ message: 'User deleted successfully by admin' });
    } else {
      res.status(404);
      throw new Error('User not found');
    }
  } catch (error) { next(error); }
};

export const registerAdmin = async (req, res, next) => {
  try {
    const { name, email, password } = req.body;
    const userExists = await User.findOne({ email });

    if (userExists) {
      res.status(400);
      throw new Error('User already exists');
    }

    const adminUser = await User.create({ name, email, password, role: 'admin' });

    if (adminUser) {
      res.status(201).json({ _id: adminUser._id, name: adminUser.name, email: adminUser.email, role: adminUser.role });
    } else {
      res.status(400);
      throw new Error('Invalid user data');
    }
  } catch (error) { next(error); }
};