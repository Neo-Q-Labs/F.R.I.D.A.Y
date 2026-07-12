import { callAI } from '../services/aiService.js';
import { dbConnected } from '../utils/helpers.js';
import { Generation } from '../models/Generation.js';
import { Planner } from '../models/Planner.js';
import {
  CODING_SYSTEM_PROMPT, MCQ_SYSTEM_PROMPT,
  DATABASE_CODING_SYSTEM_PROMPT, DATABASE_MCQ_SYSTEM_PROMPT,
  DB_TRACK_KEYWORDS
} from '../config/constants.js';

const MCP_SECRET = process.env.MCP_SECRET || 'friday-mcp-2025';

// In-memory job store — keyed by jobId, each job has a userId field for isolation
const mcpJobs = new Map();

function checkSecret(req, res) {
  if (req.headers['x-mcp-secret'] !== MCP_SECRET) {
    res.status(401).json({ error: 'Unauthorized — wrong MCP secret' });
    return false;
  }
  return true;
}

export const trigger = (req, res) => {
  if (!checkSecret(req, res)) return;
  const { topic, type = 'coding', count = 10, track = 'DSA', client = 'General', difficulty = 'Medium', source = 'non-leetcode', userId } = req.body;
  if (!topic) return res.status(400).json({ error: 'topic is required' });

  const jobId = `mcp-${Date.now()}`;
  const job = {
    id: jobId, topic, type, count: parseInt(count) || 10, track, client,
    difficulty, source, status: 'running', startedAt: Date.now(),
    userId: userId || null,
    result: null, error: null, completedAt: null
  };
  mcpJobs.set(jobId, job);

  if (mcpJobs.size > 50) {
    const oldest = [...mcpJobs.keys()].slice(0, mcpJobs.size - 50);
    oldest.forEach(k => mcpJobs.delete(k));
  }

  (async () => {
    try {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey) throw new Error('GROQ_API_KEY not set in environment');
      const isDbTrack = DB_TRACK_KEYWORDS.some(k => (track || '').toLowerCase().includes(k));
      const contextBlock = `Client: ${client}\nTrack: ${track}\nDifficulty: ${difficulty}`;

      let questions = [];
      if (type === 'coding') {
        const userPrompt = source === 'leetcode'
          ? `Generate exactly ${count} coding challenge(s) inspired by real LeetCode problems about "${topic}" for "${track}" track with "${difficulty}" difficulty. Set a realistic leetcodeNumber for each.\nContext:\n${contextBlock}`
          : `Generate exactly ${count} unique coding challenge(s) about "${topic}" for "${track}" track with "${difficulty}" difficulty.\nContext:\n${contextBlock}`;
        const r = await callAI({ provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey, systemPrompt: isDbTrack ? DATABASE_CODING_SYSTEM_PROMPT : CODING_SYSTEM_PROMPT, userPrompt, maxTokens: 16000 });
        const data = JSON.parse(r.content);
        questions = data.questions || [];
      } else {
        const userPrompt = `Generate exactly ${count} advanced MCQ(s) about "${topic}" for "${track}" track.\nContext:\n${contextBlock}`;
        const r = await callAI({ provider: 'groq', model: 'llama-3.3-70b-versatile', apiKey, systemPrompt: isDbTrack ? DATABASE_MCQ_SYSTEM_PROMPT : MCQ_SYSTEM_PROMPT, userPrompt, maxTokens: 4000 });
        const data = JSON.parse(r.content);
        questions = data.questions || [];
      }

      job.result = questions;
      job.status = 'done';
      job.completedAt = Date.now();
      console.log(`[MCP] Job ${jobId} completed — ${questions.length} questions`);
    } catch (err) {
      job.error = err.message;
      job.status = 'error';
      job.completedAt = Date.now();
      console.error(`[MCP] Job ${jobId} failed:`, err.message);
    }
  })();

  res.json({ jobId, status: 'running', topic, type, count: job.count });
};

export const notify = (req, res) => {
  if (!checkSecret(req, res)) return;
  const { jobId, topic, type, count, track, client, course, status, result, userId } = req.body;
  if (!jobId) return res.status(400).json({ error: 'jobId required' });

  if (status === 'running') {
    mcpJobs.set(jobId, {
      id: jobId, topic, type, count: parseInt(count) || 10, track: track || 'DSA',
      client: client || 'General', course: course || '', status: 'running',
      userId: userId || null,
      startedAt: Date.now(), result: null, error: null, completedAt: null
    });
    if (mcpJobs.size > 50) {
      const oldest = [...mcpJobs.keys()].slice(0, mcpJobs.size - 50);
      oldest.forEach(k => mcpJobs.delete(k));
    }
  } else if (mcpJobs.has(jobId)) {
    const job = mcpJobs.get(jobId);
    job.status = status;
    job.completedAt = Date.now();
    if (result) job.result = result;
    if (userId && !job.userId) job.userId = userId;
  }
  res.json({ ok: true });
};

export const save = async (req, res) => {
  if (!checkSecret(req, res)) return;
  const { jobId, questions, topic, type, track, client, course, difficulty, userId } = req.body;
  if (!questions || !Array.isArray(questions)) return res.status(400).json({ error: 'questions array required' });

  if (mcpJobs.has(jobId)) {
    const job = mcpJobs.get(jobId);
    job.status = 'done';
    job.result = questions;
    job.completedAt = Date.now();
    if (userId && !job.userId) job.userId = userId;
  }

  try {
    if (dbConnected()) {
      const g = new Generation({
        topic: topic || 'MCP Generated', type: type || 'coding',
        track, client, course: course || '', difficulty, questions, timestamp: new Date()
      });
      await g.save();
    }
  } catch (err) {
    console.error('[MCP save]', err.message);
  }
  res.json({ ok: true, saved: questions.length });
};

export const savePlanner = async (req, res) => {
  if (!checkSecret(req, res)) return;
  const { jobId, courseName, track, client, weeks, userId } = req.body;
  if (!weeks || !Array.isArray(weeks)) return res.status(400).json({ error: 'weeks array required' });

  if (mcpJobs.has(jobId)) {
    const job = mcpJobs.get(jobId);
    job.status = 'done';
    job.result = weeks;
    job.topic = courseName || job.topic;
    job.completedAt = Date.now();
    if (userId && !job.userId) job.userId = userId;
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

// GET /api/mcp/status — requires JWT (applied at route level), returns only the requesting user's jobs
export const statusAll = (req, res) => {
  const userId = req.user.userId.toString();
  const jobs = [...mcpJobs.values()]
    .filter(j => j.userId === userId)
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
  if (job.userId && job.userId !== userId) {
    return res.status(403).json({ error: 'Access denied' });
  }
  res.json({
    jobId:       job.id,
    status:      job.status,
    topic:       job.topic,
    type:        job.type,
    count:       job.count,
    track:       job.track,
    startedAt:   job.startedAt,
    completedAt: job.completedAt || null,
    result:      job.status === 'done' ? job.result : null,
    error:       job.error || null
  });
};
