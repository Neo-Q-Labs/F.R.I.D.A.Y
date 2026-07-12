import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { saveHistory, getHistory } from '../controllers/historyController.js';

const router = Router();
router.post('/', verifyToken, saveHistory);
router.get('/',  verifyToken, getHistory);
export default router;
