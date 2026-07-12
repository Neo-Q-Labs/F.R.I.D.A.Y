import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import { createCourse, getCourses } from '../controllers/courseController.js';

const router = Router();
router.post('/', verifyToken, createCourse);
router.get('/',  verifyToken, getCourses);
export default router;
