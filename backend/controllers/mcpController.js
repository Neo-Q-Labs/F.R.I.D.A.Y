import jwt from 'jsonwebtoken';
import { callAI } from '../services/aiService.js';
import { dbConnected } from '../utils/helpers.js';
import { Generation } from '../models/Generation.js';
import { Planner } from '../models/Planner.js';
import {
  CODING_SYSTEM_PROMPT, MCQ_SYSTEM_PROMPT,
  DATABASE_CODING_SYSTEM_PROMPT, DATABASE_MCQ_SYSTEM_PROMPT,
  DB_TRACK_KEYWORDS
} from '../config/constants.js';

const MCP_SECRET  = process.env.MCP_SECRET  || 'friday-mcp-2025';
const JWT_SECRET  = process.env.JWT_SECRET   || 'dev-secret-key-change-in-production';

// In-memory job store keyed by jobId
const mcpJobs = new Map();

function checkSecret(req, res) {
  if (req.headers['x-mcp-secret'] !== MCP_SECRET) {
    res.status(401).json({ error: 'Unauthorized — wrong MCP secret' });
    return false;
  }
  return true;
}

// Resolve userId: verify the signed mcpToken JWT (stateless, no server storage needed),
// then fall back to the raw userId string the LLM may have passed.
// Normalize MCQ questions: Claude returns options as {A,B,C,D} object + answer letter.
// The frontend expects an array + 0-indexed correctAnswer.
function normalizeMcqQuestions(questions, type) {
  if (type !== 'mcq') return questions;
  const letters = ['A', 'B', 'C', 'D'];
  return questions.map(q => {
    let options = q.options;
    let correctAnswer = q.correctAnswer;
    if (options && !Array.isArray(options) && typeof options === 'object') {
      options = letters.map(l => options[l] ?? '');
    }
    if (typeof correctAnswer !== 'number' && q.answer) {
      correctAnswer = letters.indexOf(q.answer.toUpperCase());
      if (correctAnswer < 0) correctAnswer = 0;
    }
    const { answer, ...rest } = q;
    return { ...rest, options, correctAnswer };
  });
}

function resolveUserId(mcpToken, fallbackUserId) {
  if (mcpToken) {
    try {
      const decoded = jwt.verify(mcpToken, JWT_SECRET);
      if (decoded.type === 'mcp' && decoded.userId) {
        return decoded.userId.toString();
      }
    } catch { /* expired or tampered */ }
  }
  return fallbackUserId ? fallbackUserId.toString() : null;
}

// GET /api/mcp/token — returns a 7-day signed JWT + shared MCP URL for prompt setup
export const getUserToken = (req, res) => {
  const userId = req.user.userId.toString();
  const token = jwt.sign({ userId, type: 'mcp' }, JWT_SECRET, { expiresIn: '7d' });
  const mcpUrl = process.env.MCP_SERVER_URL || 'https://questai-mcp.onrender.com';
  res.json({ token, mcpUrl });
};

export const trigger = (req, res) => {
  if (!checkSecret(req, res)) return;
  const { topic, type = 'coding', count = 10, track = 'DSA', client = 'General', difficulty = 'Medium', source = 'non-leetcode', userId, mcpToken } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic is required' });

  const resolvedUserId = resolveUserId(mcpToken, userId);
  const jobId = `mcp-${Date.now()}`;
  const job = {
    id: jobId, topic, type, count: parseInt(count) || 10, track, client,
    difficulty, source, status: 'running', startedAt: Date.now(),
    userId: resolvedUserId,
    result: null, error: null, completedAt: null
  };
  mcpJobs.set(jobId, job);

  if (mcpJobs.size > 100) {
    const oldest = [...mcpJobs.keys()].slice(0, mcpJobs.size - 100);
    oldest.forEach(k => mcpJobs.delete(k));
  }

  (async () => {
    try {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error('GROQ_API_KEY not set');
      const isDbTrack = DB_TRACK_KEYWORDS.some(k => (track || '').toLowerCase().includes(k));
      const contextBlock = `Client: ${client}\nTrack: ${track}\nDifficulty: ${difficulty}`;
      let questions = [];
      if (type === 'coding') {
        const userPrompt = source === 'leetcode'
          ? `Generate exactly ${count} coding challenge(s) inspired by real LeetCode problems about "${topic}" for "${track}" track with "${difficulty}" difficulty. Set a realistic leetcodeNumber for each.\nContext:\n${contextBlock}`
          : `Generate exactly ${count} unique coding challenge(s) about "${topic}" for "${track}" track with "${difficulty}" difficulty.\nContext:\n${contextBlock}`;
        const r = await callAI({ provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey, systemPrompt: isDbTrack ? DATABASE_CODING_SYSTEM_PROMPT : CODING_SYSTEM_PROMPT, userPrompt, maxTokens: 16000 });
        questions = (JSON.parse(r.content)).questions || [];
      } else {
        const userPrompt = `Generate exactly ${count} advanced MCQ(s) about "${topic}" for "${track}" track.\nContext:\n${contextBlock}`;
        const r = await callAI({ provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey, systemPrompt: isDbTrack ? DATABASE_MCQ_SYSTEM_PROMPT : MCQ_SYSTEM_PROMPT, userPrompt, maxTokens: 4000 });
        questions = (JSON.parse(r.content)).questions || [];
      }
      job.result = questions;
      job.status = 'done';
      job.completedAt = Date.now();
    } catch (err) {
      job.error = err.message;
      job.status = 'error';
      job.completedAt = Date.now();
    }
  })();

  res.json({ jobId, status: 'running', topic, type, count: job.count });
};

export const notify = (req, res) => {
  if (!checkSecret(req, res)) return;
  const { jobId, topic, type, count, track, client, course, status, result, userId, mcpToken } = req.body;
  if (!jobId) return res.status(400).json({ error: 'jobId required' });

  const resolvedUserId = resolveUserId(mcpToken, userId);
  console.log(`[MCP notify] jobId=${jobId} status=${status} userId=${resolvedUserId || '(none)'} mcpToken=${mcpToken ? 'present' : 'absent'}`);

  if (status === 'running') {
    mcpJobs.set(jobId, {
      id: jobId, topic, type, count: parseInt(count) || 10,
      track: track || 'DSA', client: client || 'General', course: course || '',
      status: 'running', userId: resolvedUserId,
      startedAt: Date.now(), result: null, error: null, completedAt: null
    });
    if (mcpJobs.size > 100) {
      const oldest = [...mcpJobs.keys()].slice(0, mcpJobs.size - 100);
      oldest.forEach(k => mcpJobs.delete(k));
    }
  } else if (mcpJobs.has(jobId)) {
    const job = mcpJobs.get(jobId);
    job.status = status;
    job.completedAt = Date.now();
    if (result) job.result = result;
    if (resolvedUserId && !job.userId) job.userId = resolvedUserId;
  }
  res.json({ ok: true });
};

export const save = async (req, res) => {
  if (!checkSecret(req, res)) return;
  const { jobId, questions: rawQuestions, topic, type, track, client, course, difficulty, userId, mcpToken } = req.body;
  if (!rawQuestions || !Array.isArray(rawQuestions)) return res.status(400).json({ error: 'questions array required' });

  const questions = normalizeMcqQuestions(rawQuestions, type);
  const resolvedUserId = resolveUserId(mcpToken, userId);
  console.log(`[MCP save] jobId=${jobId} questions=${questions.length} userId=${resolvedUserId || '(none)'}`);

  if (mcpJobs.has(jobId)) {
    const job = mcpJobs.get(jobId);
    job.status = 'done';
    job.result = questions;
    job.completedAt = Date.now();
    if (resolvedUserId && !job.userId) job.userId = resolvedUserId;
  } else {
    // notify may have been missed (server was sleeping) — create job as done so statusAll picks it up
    mcpJobs.set(jobId, {
      id: jobId, topic: topic || 'MCP Generated', type: type || 'coding',
      count: questions.length, track: track || 'DSA',
      client: client || 'General', course: course || '',
      difficulty: difficulty || 'Medium', status: 'done',
      userId: resolvedUserId,
      startedAt: Date.now() - 120000, result: questions,
      error: null, completedAt: Date.now()
    });
  }

  try {
    if (dbConnected()) {
      const g = new Generation({
        topic: topic || 'MCP Generated', type: type || 'coding',
        track, client, course: course || '', difficulty, questions, timestamp: new Date(),
        ...(resolvedUserId ? { userId: resolvedUserId } : {})
      });
      await g.save();
      console.log(`[MCP save] Saved to DB for userId=${resolvedUserId}`);
    }
  } catch (err) {
    console.error('[MCP save] DB error:', err.message);
  }
  res.json({ ok: true, saved: questions.length });
};

export const savePlanner = async (req, res) => {
  if (!checkSecret(req, res)) return;
  const { jobId, courseName, track, client, weeks, userId, mcpToken } = req.body;
  if (!weeks || !Array.isArray(weeks)) return res.status(400).json({ error: 'weeks array required' });

  const resolvedUserId = resolveUserId(mcpToken, userId);

  if (mcpJobs.has(jobId)) {
    const job = mcpJobs.get(jobId);
    job.status = 'done';
    job.result = weeks;
    job.topic = courseName || job.topic;
    job.completedAt = Date.now();
    if (resolvedUserId && !job.userId) job.userId = resolvedUserId;
  } else {
    mcpJobs.set(jobId, {
      id: jobId, topic: courseName || 'MCP Planner', type: 'planner',
      count: weeks.length, track: track || 'DSA',
      client: client || 'General', course: '', status: 'done',
      userId: resolvedUserId,
      startedAt: Date.now() - 120000, result: weeks,
      error: null, completedAt: Date.now()
    });
  }

  try {
    if (dbConnected()) {
      const planner = new Planner({
        courseName: courseName || 'MCP Generated', track: track || 'DSA',
        plannerFile: 'mcp-generated', weeks, createdAt: new Date()
      });
      await planner.save();
    }
  } catch (err) {
    console.error('[MCP save-planner]', err.message);
  }
  res.json({ ok: true, saved: weeks.length });
};

// GET /api/mcp/status — requires JWT; strictly returns only this user's jobs
export const statusAll = (req, res) => {
  const userId = req.user.userId.toString();
  const jobs = [...mcpJobs.values()]
    .filter(j => j.userId && j.userId === userId)
    .sort((a, b) => b.startedAt - a.startedAt);
  const active = jobs.find(j => j.status === 'running') || jobs[0] || null;
  if (!active) return res.json({ status: 'idle' });
  res.json({
    jobId:       active.id,
    status:      active.status,
    topic:       active.topic,
    type:        active.type,
    count:       active.count,
    track:       active.track,
    course:      active.course || '',
    client:      active.client || '',
    difficulty:  active.difficulty || 'Medium',
    startedAt:   active.startedAt,
    completedAt: active.completedAt || null,
    result:      active.status === 'done' ? active.result : null,
    error:       active.error || null
  });
};

// GET /api/mcp/status/:jobId — requires JWT, verifies ownership
export const statusById = (req, res) => {
  const job = mcpJobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  const userId = req.user.userId.toString();
  if (job.userId && job.userId !== userId) return res.status(403).json({ error: 'Access denied' });
  res.json({
    jobId: job.id, status: job.status, topic: job.topic, type: job.type,
    count: job.count, track: job.track, startedAt: job.startedAt,
    completedAt: job.completedAt || null,
    result: job.status === 'done' ? job.result : null,
    error: job.error || null
  });
};
