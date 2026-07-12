import mongoose from 'mongoose';
import * as XLSX from 'xlsx';

export const dbConnected = () => mongoose.connection.readyState === 1;

export function sanitiseJsonStrings(raw) {
  let out = '';
  let inStr = false;
  let esc = false;
  for (let i = 0; i < raw.length; i++) {
    const ch = raw[i];
    if (esc) { out += ch; esc = false; continue; }
    if (ch === '\\') { esc = true; out += ch; continue; }
    if (ch === '"') { inStr = !inStr; out += ch; continue; }
    if (inStr) {
      if      (ch === '\n') { out += '\\n';  continue; }
      else if (ch === '\r') { out += '\\r';  continue; }
      else if (ch === '\t') { out += '\\t';  continue; }
    }
    out += ch;
  }
  return out;
}

export function isRateLimitError(err) {
  if (!err) return false;
  const msg    = (err.message || '').toLowerCase();
  const status = err.status || err.statusCode || (err.response && err.response.status) || 0;
  return (
    status === 429 ||
    msg.includes('rate limit') ||
    msg.includes('rate_limit') ||
    msg.includes('tokens per day') ||
    msg.includes('tokens per minute') ||
    msg.includes('tpd') || msg.includes('tpm') ||
    msg.includes('limit exceeded') ||
    msg.includes('quota exceeded') ||
    msg.includes('429')
  );
}

export function extractWeekNumber(str) {
  const m = String(str).match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

export function parseExcelBuffer(buffer) {
  const wb = XLSX.read(buffer, { type: 'buffer' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  if (rows.length === 0) return [];

  const keys = Object.keys(rows[0]).map(k => k.toLowerCase().trim());
  const colIdx = (keywords) => keys.findIndex(k => keywords.some(kw => k.includes(kw)));
  const weekCol  = colIdx(['week', 'wk', 'sl', 'no.', 'sno', 's.no']);
  const topicCol = colIdx(['topic', 'subject', 'content', 'module', 'chapter', 'title']);
  const subCol   = colIdx(['subtopic', 'detail', 'concept', 'sub-topic', 'points']);
  const notesCol = colIdx(['note', 'objective', 'outcome', 'remark', 'context']);

  const origKeys = Object.keys(rows[0]);
  const seen = new Set();
  const weeks = [];

  rows.forEach((row, rowIdx) => {
    const vals = origKeys.map(k => String(row[k] || '').trim());

    let weekNum = weekCol >= 0 ? extractWeekNumber(vals[weekCol]) : null;
    if (!weekNum) weekNum = rowIdx + 1;

    let topic = '';
    if (topicCol >= 0) {
      topic = vals[topicCol];
    } else if (weekCol >= 0 && weekCol + 1 < vals.length) {
      topic = vals[weekCol + 1];
    } else {
      topic = vals.find((v, i) => i > 0 && v.length > 1) || vals[0] || '';
    }

    const subtopics = subCol >= 0 && vals[subCol]
      ? vals[subCol].split(/[,;\n|·•]/).map(s => s.trim()).filter(Boolean)
      : [];

    const notes = notesCol >= 0 ? vals[notesCol] : '';

    if (topic && !seen.has(weekNum)) {
      seen.add(weekNum);
      weeks.push({ weekNumber: weekNum, weekLabel: `Week ${weekNum}`, topic, subtopics, additionalContext: notes });
    }
  });

  return weeks.sort((a, b) => a.weekNumber - b.weekNumber);
}
