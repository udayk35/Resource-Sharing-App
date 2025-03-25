import express, { json } from 'express';
import expressWs from 'express-ws';
import session from 'express-session';
import cors from 'cors';
import connectDB from './config/db.config.js';
import authRoutes from './routes/authRoutes.js';
import providerRoutes from './routes/providerRoutes.js';
import { cleanupProviders } from './controllers/providerController.js';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
expressWs(app);

// Connect to MongoDB
connectDB();

// Middleware
app.use(
  cors({
    methods: ['GET', 'POST', 'PUT', 'DELETE'], // Allow specific methods if needed
    credentials: true, // Allow sending cookies with requests
  })
);
app.use(json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false, httpOnly: true, maxAge: 1000 * 60 * 60* 24 }, // 24 hour
  })
);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/providers', providerRoutes);
// setInterval(() => {
//   cleanupProviders();
//   console.log('Performed provider cleanup');
// }, 5000);
// app.use('ws:')

export default app;