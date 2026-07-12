import { callAI, getUserApiKey } from '../services/aiService.js';
import { isRateLimitError, parseExcelBuffer, dbConnected } from '../utils/helpers.js';
import { decryptApiKey } from '../utils/crypto.js';
import { UserApiKey } from '../models/UserApiKey.js';
import { TokenUsage } from '../models/TokenUsage.js';
import { Planner } from '../models/Planner.js';
import { PLANNER_WEEK_BASE_PROMPT, PROVIDER_FAILOVER_ORDER, FAILOVER_DEFAULT_MODELS } from '../config/constants.js';

export const parseExcel = (req, res) => {
  try {
    const { fileBase64, fileName } = req.body;
    if (!fileBase64) return res.status(400).json({ error: 'Missing file data' });
    const buffer = Buffer.from(fileBase64, 'base64');
    const weeks = parseExcelBuffer(buffer);
    if (weeks.length === 0) {
      return res.status(422).json({ error: 'No week/topic data found. Ensure your sheet has Week and Topic columns.' });
    }
    res.json({ weeks, fileName: fileName || 'planner.xlsx' });
  } catch (err) {
    res.status(500).json({ error: 'Excel parse failed: ' + err.message });
  }
};

export const generateWeek = async (req, res) => {
  try {
    const {
      topic, subtopics = [], week, track, course,
      skillBuilderCount = 3, practiceAtHomeCount = 3, challengeYourselfCount = 2,
      customFormat = ''
    } = req.body;

    if (!topic) return res.status(400).json({ error: 'Missing topic' });

    const reqProvider = req.body.provider || 'groq';
    const reqModel    = req.body.model    || null;
    const keyInfo     = await getUserApiKey(req.user.userId, reqProvider);
    if (!keyInfo) {
      return res.status(402).json({ error: `No API key for "${reqProvider}" — add it in Settings.` });
    }

    const formatInstruction = customFormat.trim()
      ? `\n\nFORMAT REQUIREMENT — follow this structure for each question:\n${customFormat}`
      : '';

    const systemPrompt = PLANNER_WEEK_BASE_PROMPT + formatInstruction;

    const userPrompt = `Week ${week}: ${topic}${subtopics.length ? '\nSubtopics: ' + subtopics.join(', ') : ''}
Track: ${track || 'Problem Solving'} | Course: ${course || ''}

Generate:
• ${skillBuilderCount} Skill Builder question(s) — Easy
• ${practiceAtHomeCount} Practice at Home question(s) — Medium
• ${challengeYourselfCount} Challenge Yourself question(s) — Hard`;

    const totalQ = skillBuilderCount + practiceAtHomeCount + challengeYourselfCount;
    const dynamicMaxTokens = Math.min(9000, Math.max(3000, totalQ * 900 + 1500));

    // ── Multi-provider failover chain ────────────────────────────────────────
    const failoverChain = [{ provider: reqProvider, keyInfo }];
    if (dbConnected()) {
      try {
        const otherRecs = await UserApiKey.find({ userId: req.user.userId, provider: { $ne: reqProvider } }).lean();
        for (const fp of PROVIDER_FAILOVER_ORDER) {
          if (fp === reqProvider) continue;
          const rec = otherRecs.find(r => r.provider === fp);
          if (rec) {
            failoverChain.push({
              provider: fp,
              keyInfo: { apiKey: decryptApiKey(rec.encryptedKey, rec.iv, rec.authTag), model: rec.model || null }
            });
          }
        }
      } catch {} // non-fatal
    }

    let rawContent = null, aiUsage = null;
    let usedProvider = reqProvider, switchedFrom = null, lastRLError = null;

    for (let fi = 0; fi < failoverChain.length; fi++) {
      const { provider: fp, keyInfo: fki } = failoverChain[fi];
      try {
        const result = await callAI({
          provider:  fp,
          model:     (fi === 0 ? reqModel : null) || fki.model || FAILOVER_DEFAULT_MODELS[fp] || undefined,
          apiKey:    fki.apiKey,
          systemPrompt,
          userPrompt,
          maxTokens: dynamicMaxTokens
        });
        rawContent   = result.content;
        aiUsage      = result.usage;
        usedProvider = fp;
        if (fi > 0) {
          switchedFrom = reqProvider;
          console.log(`[Failover] Switched from ${reqProvider} → ${fp} (week ${week})`);
        }
        break;
      } catch (err) {
        const isRL = isRateLimitError(err);
        if (isRL && fi < failoverChain.length - 1) {
          console.warn(`[Failover] ${fp} rate limited — trying next provider`);
          lastRLError = err;
          continue;
        }
        throw err;
      }
    }

    if (!rawContent) throw (lastRLError || new Error('All providers exhausted'));

    if (aiUsage && aiUsage.totalTokens > 0 && dbConnected()) {
      const today = new Date().toISOString().split('T')[0];
      TokenUsage.findOneAndUpdate(
        { userId: req.user.userId, provider: usedProvider, date: today },
        { $inc: { tokensUsed: aiUsage.totalTokens, requestCount: 1 }, $set: { updatedAt: new Date() } },
        { upsert: true }
      ).catch(() => {});
    }

    const data = JSON.parse(rawContent);
    res.json({
      skillBuilder:      data.skillBuilder      || [],
      practiceAtHome:    data.practiceAtHome    || [],
      challengeYourself: data.challengeYourself || [],
      providerUsed:  usedProvider,
      switchedFrom:  switchedFrom || null,
      tokensUsed:    aiUsage?.totalTokens || null
    });
  } catch (err) {
    console.error('Planner week generation error:', err?.message || err);
    let userMsg = err?.message || 'Planner generation failed';
    try {
      const jsonPart = userMsg.match(/\{[\s\S]*\}/)?.[0];
      if (jsonPart) {
        const parsed = JSON.parse(jsonPart);
        const code  = parsed?.error?.code;
        const inner = parsed?.error?.message || parsed?.message;
        if (code === 'json_validate_failed') {
          userMsg = 'Generation failed: token limit reached mid-response. Try reducing questions per section or switching to a different provider.';
        } else if (inner) {
          userMsg = inner;
        }
      }
    } catch {}
    res.status(500).json({ error: userMsg });
  }
};

export const createPlanner = async (req, res) => {
  try {
    if (!dbConnected()) {
      return res.status(202).json({ ...req.body, _id: 'local-' + Date.now(), createdAt: new Date(), note: 'offline' });
    }
    const planner = new Planner({ ...req.body, userId: req.user.userId });
    await planner.save();
    res.json(planner);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getPlanners = async (req, res) => {
  try {
    if (!dbConnected()) return res.json([]);
    const planners = await Planner.find({ userId: req.user.userId })
      .select('courseName track plannerFile skillBuilderCount practiceAtHomeCount challengeYourselfCount createdAt weeks.weekNumber weeks.topic weeks.weekLabel')
      .sort({ createdAt: -1 });
    res.json(planners);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const getPlanner = async (req, res) => {
  try {
    if (!dbConnected()) return res.status(503).json({ error: 'DB offline' });
    const planner = await Planner.findOne({ _id: req.params.id, userId: req.user.userId });
    if (!planner) return res.status(404).json({ error: 'Not found' });
    res.json(planner);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

export const deletePlanner = async (req, res) => {
  try {
    if (!dbConnected()) return res.status(503).json({ error: 'DB offline' });
    await Planner.findOneAndDelete({ _id: req.params.id, userId: req.user.userId });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
