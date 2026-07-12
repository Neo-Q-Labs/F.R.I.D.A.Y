import { UserApiKey } from '../models/UserApiKey.js';
import { TokenUsage } from '../models/TokenUsage.js';
import { encryptApiKey } from '../utils/crypto.js';
import { dbConnected } from '../utils/helpers.js';
import { callAI } from '../services/aiService.js';

export const getApiKeys = async (req, res) => {
  try {
    if (!dbConnected()) return res.json({ groq: false, openai: false, anthropic: false });
    const records = await UserApiKey.find({ userId: req.user.userId });
    const result = { groq: false, openai: false, anthropic: false, gemini: false, mistral: false, deepseek: false };
    const models = {};
    records.forEach(r => {
      result[r.provider] = true;
      models[r.provider] = r.model || '';
    });
    res.json({ configured: result, models });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const saveApiKey = async (req, res) => {
  try {
    const { provider, apiKey, model = '' } = req.body;
    if (!provider || !apiKey) return res.status(400).json({ error: 'provider and apiKey required' });
    if (!['groq', 'openai', 'anthropic', 'gemini', 'mistral', 'deepseek', 'nvidia'].includes(provider))
      return res.status(400).json({ error: 'Invalid provider' });
    if (!dbConnected()) return res.status(503).json({ error: 'DB offline — key not saved' });
    const encrypted = encryptApiKey(apiKey);
    await UserApiKey.findOneAndUpdate(
      { userId: req.user.userId, provider },
      { ...encrypted, model, updatedAt: new Date() },
      { upsert: true, new: true }
    );
    res.json({ success: true, provider, model });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const deleteApiKey = async (req, res) => {
  try {
    if (!dbConnected()) return res.status(503).json({ error: 'DB offline' });
    await UserApiKey.findOneAndDelete({ userId: req.user.userId, provider: req.params.provider });
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const updateApiKeyModel = async (req, res) => {
  try {
    const { provider, model } = req.body;
    if (!provider) return res.status(400).json({ error: 'provider required' });
    if (!dbConnected()) return res.status(503).json({ error: 'DB offline' });
    await UserApiKey.findOneAndUpdate(
      { userId: req.user.userId, provider },
      { model, updatedAt: new Date() }
    );
    res.json({ success: true });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

export const testApiKey = async (req, res) => {
  const { provider, apiKey, model } = req.body;
  if (!provider || !apiKey) return res.status(400).json({ error: 'provider and apiKey required' });
  const start = Date.now();
  try {
    await callAI({
      provider, apiKey,
      model: model || (
        provider === 'openai'    ? 'gpt-4o-mini' :
        provider === 'anthropic' ? 'claude-3-5-haiku-20241022' :
        provider === 'gemini'    ? 'gemini-1.5-flash' :
        provider === 'mistral'   ? 'mistral-small-latest' :
        provider === 'deepseek'  ? 'deepseek-chat' :
        provider === 'nvidia'    ? 'meta/llama-3.1-70b-instruct' :
        'llama-3.3-70b-versatile'
      ),
      systemPrompt: 'You are a helpful assistant. Respond with minimal valid JSON.',
      userPrompt:   'Reply with: {"ok":true}',
      maxTokens:    128
    });
    res.json({ success: true, latencyMs: Date.now() - start });
  } catch (err) {
    const msg    = err.message || '';
    const status = err.status || err.statusCode || 0;
    const isQuota  = status === 429 || msg.includes('429') || msg.toLowerCase().includes('quota') || msg.toLowerCase().includes('billing') || msg.toLowerCase().includes('exceeded');
    const isBadKey = status === 401 || status === 403 || msg.includes('401') || msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('authentication') || msg.toLowerCase().includes('api key');

    if (isQuota) {
      return res.json({
        success: true, warning: 'quota', latencyMs: Date.now() - start,
        message: provider === 'openai'
          ? 'Key is valid — but your OpenAI account has no credits. Add billing at platform.openai.com/account/billing'
          : provider === 'anthropic'
          ? 'Key is valid — but your Anthropic account has no credits. Add billing at console.anthropic.com'
          : 'Key is valid but quota is exceeded. Check your Groq usage.'
      });
    }
    res.status(isBadKey ? 401 : 400).json({ success: false, error: msg });
  }
};

export const getTokenUsage = async (req, res) => {
  try {
    if (!dbConnected()) return res.json([]);
    const today = new Date().toISOString().split('T')[0];
    const records = await TokenUsage.find({ userId: req.user.userId, date: today }).lean();
    res.json(records);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
