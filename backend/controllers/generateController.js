import { callAI, getUserApiKey } from '../services/aiService.js';
import {
  CODING_SYSTEM_PROMPT, MCQ_SYSTEM_PROMPT,
  DATABASE_CODING_SYSTEM_PROMPT, DATABASE_MCQ_SYSTEM_PROMPT,
  DB_TRACK_KEYWORDS
} from '../config/constants.js';

export const generate = async (req, res) => {
  const { type, topic, count, source, difficulty, context = {} } = req.body;
  if (!topic || !count) return res.status(400).json({ error: 'Missing topic or count' });

  const reqProvider = context.provider || 'groq';
  const reqModel    = context.model    || null;
  const keyInfo     = await getUserApiKey(req.user.userId, reqProvider);
  if (!keyInfo) {
    return res.status(402).json({
      error: `No API key for "${reqProvider}" — go to Settings → API Keys to add your key.`
    });
  }

  const contextBlock = [
    `Client: ${context.client || 'General'}`,
    `Stack: ${context.stack || 'General'}`,
    `Domain: ${context.domain || 'General'}`,
    `Track: ${context.track || 'General'}`,
    `Course/Lesson: ${context.course || 'General'}`,
    `Generation mode: ${context.mode || 'questions'}`,
    `Tone: ${context.tone || 'Professional'}`,
    context.additionalContext ? `Additional instructions: ${context.additionalContext}` : ''
  ].filter(Boolean).join('\n');

  const customFormat = context.customFormat?.trim() || '';
  const formatInstruction = customFormat
    ? `\n\nFORMAT REQUIREMENT — Each question's content MUST strictly follow this structure:\n${customFormat}`
    : '';

  const isDbTrack = DB_TRACK_KEYWORDS.some(k => (context.track || '').toLowerCase().includes(k));

  try {
    if (type === 'coding') {
      const userPrompt = source === 'leetcode'
        ? `Generate exactly ${count} coding challenge(s) inspired by real LeetCode problems about "${topic}" for the "${context.track || 'DSA'}" track with "${difficulty}" difficulty. Set a realistic leetcodeNumber for each.\nIMPORTANT: Each question MUST use a COMPLETELY DIFFERENT real-world domain/industry setting to frame the LeetCode-style problem. Rotate through: healthcare, logistics, banking, gaming, social media, e-commerce, transport, education, cybersecurity.\nALL solutions must be COMPLETE programs — include all imports/headers and a main() function demonstrating the sample I/O. Code must compile and run without modification.\n\nContext:\n${contextBlock}`
        : `Generate exactly ${count} unique coding challenge(s) about "${topic}" for the "${context.track || 'DSA'}" track with "${difficulty}" difficulty.\nIMPORTANT: Each question MUST use a COMPLETELY DIFFERENT real-world domain/company scenario — rotate through healthcare, logistics, banking, gaming, social media, e-commerce, transport, education, cybersecurity. Never repeat the same domain in one batch.\nALL solutions must be COMPLETE programs — include all imports/headers and a main() function that reads the sample input and prints the output. Code must run as-is without modification.\n\nContext:\n${contextBlock}`;

      const { content: rawContent } = await callAI({
        provider:     reqProvider,
        model:        reqModel || keyInfo.model || undefined,
        apiKey:       keyInfo.apiKey,
        systemPrompt: (isDbTrack ? DATABASE_CODING_SYSTEM_PROMPT : CODING_SYSTEM_PROMPT) + formatInstruction,
        userPrompt,
        maxTokens:    Math.min(16000, Math.max(5000, count * 1800))
      });
      const data = JSON.parse(rawContent);
      const questions = data.questions || [];
      const enriched = (isDbTrack && data.companyContext)
        ? questions.map(q => ({ ...q, companyContext: data.companyContext }))
        : questions;
      res.json(enriched);

    } else {
      const userPrompt = `Generate exactly ${count} advanced DSA MCQ(s) about "${topic}".\n\nContext:\n${contextBlock}`;

      const { content: rawContent } = await callAI({
        provider:     reqProvider,
        model:        reqModel || keyInfo.model || undefined,
        apiKey:       keyInfo.apiKey,
        systemPrompt: (isDbTrack ? DATABASE_MCQ_SYSTEM_PROMPT : MCQ_SYSTEM_PROMPT) + formatInstruction,
        userPrompt,
        maxTokens:    4000
      });
      const data = JSON.parse(rawContent);
      const questions = data.questions || [];
      const enriched = (isDbTrack && data.companyContext)
        ? questions.map(q => ({ ...q, companyContext: data.companyContext }))
        : questions;
      res.json(enriched);
    }
  } catch (error) {
    console.error('Generation error:', error?.message || error);
    let userMsg = error?.message || 'Generation failed';
    try {
      const jsonPart = userMsg.match(/\{[\s\S]*\}/)?.[0];
      if (jsonPart) {
        const parsed = JSON.parse(jsonPart);
        const inner = parsed?.error?.message || parsed?.message;
        const code  = parsed?.error?.code;
        if (code === 'json_validate_failed') {
          userMsg = 'Generation failed: the AI produced malformed JSON. This usually means token limit was reached mid-response. Try reducing question count or switching to a different provider.';
        } else if (inner) {
          userMsg = inner;
        }
      }
    } catch {}
    res.status(500).json({ error: userMsg });
  }
};
