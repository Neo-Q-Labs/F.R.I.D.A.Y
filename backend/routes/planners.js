import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  parseExcel, generateWeek,
  createPlanner, getPlanners, getPlanner, deletePlanner
} from '../controllers/plannerController.js';

const router = Router();
router.post('/parse-excel',    verifyToken, parseExcel);
router.post('/generate-week',  verifyToken, generateWeek);
router.post('/',               verifyToken, createPlanner);
router.get('/',                verifyToken, getPlanners);
router.get('/:id',             verifyToken, getPlanner);
router.delete('/:id',          verifyToken, deletePlanner);
export default router;
