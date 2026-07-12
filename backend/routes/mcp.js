import { Router } from 'express';
import { trigger, notify, save, savePlanner, statusAll, statusById } from '../controllers/mcpController.js';

const router = Router();
router.post('/trigger',       trigger);
router.post('/notify',        notify);
router.post('/save',          save);
router.post('/save-planner',  savePlanner);
router.get('/status',         statusAll);
router.get('/status/:jobId',  statusById);
export default router;
