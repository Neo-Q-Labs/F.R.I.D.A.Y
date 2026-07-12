import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { trigger, notify, save, savePlanner, statusAll, statusById } from '../controllers/mcpController.js';

const router = Router();
router.post('/trigger',       trigger);
router.post('/notify',        notify);
router.post('/save',          save);
router.post('/save-planner',  savePlanner);
router.get('/status',         verifyToken, statusAll);
router.get('/status/:jobId',  verifyToken, statusById);
export default router;
