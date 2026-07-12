import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { getFormats, upsertFormat } from '../controllers/formatController.js';

const router = Router();
router.get('/', verifyToken, getFormats);
router.put('/', verifyToken, upsertFormat);
export default router;
