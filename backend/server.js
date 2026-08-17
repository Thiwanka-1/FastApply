//server.js
import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';
import analyticsRoutes from './routes/analyticsRoutes.js'; // <-- ADD THIS
import applicationRoutes from './routes/applicationRoutes.js';
import aiUsageRoutes from './routes/aiUsageRoutes.js';
import superAdminRoutes from './routes/superAdminRoutes.js';
import seedSuperAdmin from './utils/seedSuperAdmin.js';
// Load environment variables from .env file
dotenv.config();

// Initialize MongoDB connection, then make sure the default super admin
// exists (fresh databases get one automatically).
connectDB().then(() => seedSuperAdmin());

const app = express();

// Behind a reverse proxy (production hosting) the real client IP arrives in
// X-Forwarded-For; trust the first proxy so session logs record it.
app.set('trust proxy', 1);

const allowedOrigins = [
  process.env.CLIENT_URL,
  ...(process.env.CLIENT_URLS || '').split(','),
  process.env.CHROME_EXTENSION_ORIGIN
]
  .map(value => String(value || '').trim().replace(/\/$/, ''))
  .filter(Boolean);

// --- Production-Ready Middleware ---

// 1. CORS Configuration: Crucial for allowing the frontend to send cookies
app.use(cors({
  origin: (origin, callback) => {
    const normalizedOrigin = String(origin || '').replace(/\/$/, '');
    const isDevelopmentExtension =
      process.env.NODE_ENV !== 'production' &&
      normalizedOrigin.startsWith('chrome-extension://');

    if (
      !origin ||
      allowedOrigins.includes(normalizedOrigin) ||
      isDevelopmentExtension
    ) {
      callback(null, true);
      return;
    }

    callback(new Error('Origin is not allowed by FastApply CORS policy.'));
  },
  credentials: true, // This MUST be true to accept cookies from the client
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
}));

// 2. Body Parsers: Allows Express to read JSON data sent in the request body
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// 3. Cookie Parser: Allows Express to read the JWT tokens sent inside cookies
app.use(cookieParser());

// --- Routes ---

// A simple test route to ensure the server is responding
app.get('/api/health', (req, res) => {
  res.status(200).json({ status: 'success', message: 'FastApply API is running.' });
});

app.use('/api/auth', authRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/analytics', analyticsRoutes); // <-- ADD THIS
app.use('/api/applications', applicationRoutes);
app.use('/api/ai-usage', aiUsageRoutes);
app.use('/api/system', superAdminRoutes);

// --- Global Error Handler ---
// This prevents the server from crashing and sends clean errors to the frontend
app.use((err, req, res, next) => {
  const statusCode = res.statusCode === 200 ? 500 : res.statusCode;
  res.status(statusCode).json({
    message: err.message,
    // Only show the stack trace if we are in development mode
    stack: process.env.NODE_ENV === 'production' ? null : err.stack,
  });
});

// --- Start Server ---
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server is running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});
