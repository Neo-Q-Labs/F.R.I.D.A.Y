import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { registerUser, loginUser, getMe } from '../controllers/authController.js';

const router = Router();
router.post('/users', registerUser);
router.post('/login', loginUser);
router.get('/me',    verifyToken, getMe);
export default router;
