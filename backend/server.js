import express from 'express';
import dotenv from 'dotenv';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import connectDB from './config/db.js';

import authRoutes from './routes/authRoutes.js';
import profileRoutes from './routes/profileRoutes.js';

// Load environment variables from .env file
dotenv.config();

// Initialize MongoDB connection
connectDB();

const app = express();

// --- Production-Ready Middleware ---

// 1. CORS Configuration: Crucial for allowing the frontend to send cookies
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true, // This MUST be true to accept cookies from the client
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
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