import { sanitiseJsonStrings, dbConnected } from '../utils/helpers.js';
import { decryptApiKey } from '../utils/crypto.js';
import { UserApiKey } from '../models/UserApiKey.js';

export async function callAI({ provider = 'groq', model, apiKey, systemPrompt, userPrompt, maxTokens = 8000 }) {
  // ── OpenAI ────────────────────────────────────────────────────────────────
  if (provider === 'openai') {
    const { default: OpenAI } = await import('openai');
    const client = new OpenAI({ apiKey });
    const resp = await client.chat.completions.create({
      model: model || 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: maxTokens
    });
    const content = sanitiseJsonStrings(resp.choices[0].message.content);
    return { content, usage: { inputTokens: resp.usage?.prompt_tokens||0, outputTokens: resp.usage?.completion_tokens||0, totalTokens: resp.usage?.total_tokens||0 } };
  }

  // ── Anthropic ─────────────────────────────────────────────────────────────
  if (provider === 'anthropic') {
    const { default: Anthropic } = await import('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });
    const resp = await client.messages.create({
      model: model || 'claude-3-5-haiku-20241022',
      max_tokens: maxTokens,
      system: systemPrompt + '\n\nCRITICAL: Return ONLY a raw valid JSON object. No markdown fences, no preamble, no explanation — just the JSON.',
      messages: [{ role: 'user', content: userPrompt }]
    });
    const text = resp.content[0].text.trim();
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const content = sanitiseJsonStrings(jsonMatch ? jsonMatch[0] : text);
    return { content, usage: { inputTokens: resp.usage?.input_tokens||0, outputTokens: resp.usage?.output_tokens||0, totalTokens: (resp.usage?.input_tokens||0)+(resp.usage?.output_tokens||0) } };
  }

  // ── OpenAI-compatible providers (Gemini, Mistral, DeepSeek, NVIDIA) ───────
  const COMPAT_CONFIGS = {
    gemini:   { baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/', defaultModel: 'gemini-1.5-flash',            jsonMode: true  },
    mistral:  { baseURL: 'https://api.mistral.ai/v1',                               defaultModel: 'mistral-small-latest',         jsonMode: true  },
    deepseek: { baseURL: 'https://api.deepseek.com',                                defaultModel: 'deepseek-chat',                jsonMode: true  },
    nvidia:   { baseURL: 'https://integrate.api.nvidia.com/v1',                     defaultModel: 'meta/llama-3.1-70b-instruct',  jsonMode: false },
  };

  if (COMPAT_CONFIGS[provider]) {
    const { default: OpenAI } = await import('openai');
    const cfg = COMPAT_CONFIGS[provider];
    const client = new OpenAI({ apiKey, baseURL: cfg.baseURL });
    const createArgs = {
      model:       model || cfg.defaultModel,
      messages:    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      temperature: 0.7,
      max_tokens:  maxTokens,
    };
    if (cfg.jsonMode) createArgs.response_format = { type: 'json_object' };
    const resp = await client.chat.completions.create(createArgs);
    const raw = resp.choices[0].message.content.trim();
    const usage = { inputTokens: resp.usage?.prompt_tokens||0, outputTokens: resp.usage?.completion_tokens||0, totalTokens: resp.usage?.total_tokens||0 };
    if (!cfg.jsonMode) {
      const m = raw.match(/\{[\s\S]*\}/);
      return { content: sanitiseJsonStrings(m ? m[0] : raw), usage };
    }
    return { content: sanitiseJsonStrings(raw), usage };
  }

  // ── Groq (default) ────────────────────────────────────────────────────────
  const { default: Groq } = await import('groq-sdk');
  const client = new Groq({ apiKey });
  const resp = await client.chat.completions.create({
    model: model || 'llama-3.3-70b-versatile',
    messages: [
      { role: 'system', content: systemPrompt + '\n\nIMPORTANT: Return ONLY a raw JSON object starting with { and ending with }. No markdown code fences, no preamble, no explanation.' },
      { role: 'user', content: userPrompt }
    ],
    temperature: 0.7,
    max_tokens: maxTokens
  });
  const raw = resp.choices[0].message.content.trim();
  const stripped = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const jsonMatch = stripped.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
  const jsonStr = jsonMatch ? jsonMatch[0] : stripped;
  const usage = { inputTokens: resp.usage?.prompt_tokens||0, outputTokens: resp.usage?.completion_tokens||0, totalTokens: resp.usage?.total_tokens||0 };
  return { content: sanitiseJsonStrings(jsonStr), usage };
}

export async function getUserApiKey(userId, provider) {
  if (dbConnected()) {
    const record = await UserApiKey.findOne({ userId, provider });
    if (record) {
      return {
        apiKey: decryptApiKey(record.encryptedKey, record.iv, record.authTag),
        model: record.model || null
      };
    }
  }
  if (provider === 'groq'   && process.env.GROQ_API_KEY)   return { apiKey: process.env.GROQ_API_KEY,   model: null };
  if (provider === 'gemini' && process.env.GEMINI_API_KEY) return { apiKey: process.env.GEMINI_API_KEY, model: null };
  return null;
}
