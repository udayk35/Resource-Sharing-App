import { Router } from 'express';
const router = Router();
import { register, login, logout, getUser } from '../controllers/authController.js';
import authMiddleware from '../middleware/authMiddleware.js';

// Public routes
router.post('/signup', register);
router.post('/login', login);
router.post('/logout', logout);

// Protected route
router.get('/user', authMiddleware, getUser);

export default router;