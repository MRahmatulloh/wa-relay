import { config } from '../config.js';

const JOBS_SCHEMA = {
  type: 'OBJECT',
  properties: {
    jobs: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          from: { type: 'STRING', nullable: true },
          to: { type: 'STRING', nullable: true },
          price: { type: 'NUMBER', nullable: true },
          currency: { type: 'STRING', nullable: true },
        },
      },
    },
  },
  required: ['jobs'],
};

function buildPrompt(text) {
  return [
    'Extract airport-transfer job offers from the WhatsApp message.',
    'Return JSON with jobs: array of {from, to, price, currency}.',
    'Normalize airports to LHR, LGW, LTN, STN when clear (Heathrow→LHR, Gatwick→LGW, Luton→LTN, Stansted→STN).',
    'Keep UK postcodes / place names otherwise. price is net GBP number without £.',
    'If one message has multiple jobs, return multiple items. If nothing found, jobs=[].',
    '',
    'Message:',
    text,
  ].join('\n');
}

/** @param {unknown} data */
export function parseGeminiJobsPayload(data) {
  const text =
    data?.candidates?.[0]?.content?.parts?.map((p) => p?.text || '').join('') ||
    data?.candidates?.[0]?.content?.parts?.[0]?.text ||
    '';
  if (!text.trim()) return [];

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    const m = text.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
    if (!m) return [];
    try {
      parsed = JSON.parse(m[0]);
    } catch {
      return [];
    }
  }

  const list = Array.isArray(parsed) ? parsed : parsed?.jobs;
  return Array.isArray(list) ? list : [];
}

/**
 * Call Gemini generateContent for job extraction.
 * @param {string} text
 * @returns {Promise<null | { jobs: any[], parseStatus: string, parseSource: string }>}
 */
export async function callGeminiExtract(text, mapJob) {
  const key = config.geminiApiKey;
  if (!key) return null;

  const model = encodeURIComponent(config.geminiModel || 'gemini-2.0-flash');
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.geminiTimeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: ctrl.signal,
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: buildPrompt(text) }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: 'application/json',
          responseSchema: JOBS_SCHEMA,
        },
      }),
    });
    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      console.error('gemini extract HTTP', res.status, errText.slice(0, 300));
      return null;
    }
    const data = await res.json();
    const rawJobs = parseGeminiJobsPayload(data);
    const jobs = rawJobs
      .map((j) => mapJob(j?.from, j?.to, j?.price == null ? null : Number(j.price)))
      .filter(Boolean);
    if (!jobs.length) return null;
    return {
      jobs,
      parseStatus: 'model',
      parseSource: 'gemini',
    };
  } catch (err) {
    console.error('gemini extract error', err?.message || err);
    return null;
  } finally {
    clearTimeout(timer);
  }
}
