import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { generate } from '../controllers/generateController.js';

const router = Router();
router.post('/', verifyToken, generate);
export default router;
