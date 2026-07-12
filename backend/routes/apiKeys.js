import { Router } from 'express';
import { verifyToken } from '../middleware/auth.js';
import {
  getApiKeys, saveApiKey, deleteApiKey,
  updateApiKeyModel, testApiKey, getTokenUsage
} from '../controllers/apiKeyController.js';

const router = Router();
router.get('/api-keys',           verifyToken, getApiKeys);
router.put('/api-key',            verifyToken, saveApiKey);
router.delete('/api-key/:provider', verifyToken, deleteApiKey);
router.patch('/api-key/model',    verifyToken, updateApiKeyModel);
router.post('/api-key/test',      verifyToken, testApiKey);
router.get('/token-usage',        verifyToken, getTokenUsage);
export default router;
