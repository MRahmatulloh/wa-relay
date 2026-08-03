import { config } from '../config.js';
import { callGeminiExtract } from './geminiExtract.js';

const AIRPORT_MAP = [
  [/heathrow(?:\s+airport)?|\blhr\b/gi, 'LHR'],
  [/gatwick(?:\s+airport)?|\blgw\b/gi, 'LGW'],
  [/luton(?:\s+airport)?|\bltn\b/gi, 'LTN'],
  [/stansted(?:\s+airport)?|\bstn\b/gi, 'STN'],
];

const POSTCODE_RE =
  /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b|\b([A-Z]{1,2}\d{1,2})\b/gi;

const PRICE_RE =
  /(?:£\s*|GBP\s*)(\d+(?:\.\d+)?)|(\d+(?:\.\d+)?)\s*£|(?:(?:net\s*)?fare|price|driver\s*income)\s*[:;]?\s*£?\s*(\d+(?:\.\d+)?)/i;

/**
 * @typedef {{ from: string|null, to: string|null, price: number|null, currency: string }} JobFields
 * @typedef {{ jobs: JobFields[], parseStatus: string, parseSource: string }} ExtractResult
 */

export function normalizePlace(raw) {
  if (!raw) return null;
  let s = String(raw)
    .replace(/[*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;

  for (const [re, code] of AIRPORT_MAP) {
    re.lastIndex = 0;
    if (re.test(s)) return code;
  }

  const pc = s.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
  if (pc) return pc[1].toUpperCase().replace(/\s+/g, ' ');

  const outcode = s.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/i);
  if (outcode && s.length <= 12) return outcode[1].toUpperCase();

  if (s.length > 80) s = s.slice(0, 80).trim();
  return s;
}

export function extractPrice(text) {
  if (!text) return null;
  const m = String(text).match(PRICE_RE);
  if (!m) return null;
  const n = Number(m[1] || m[2] || m[3]);
  return Number.isFinite(n) ? n : null;
}

function job(from, to, price) {
  const f = normalizePlace(from);
  const t = normalizePlace(to);
  const p = price == null ? null : Number(price);
  if (!f && !t && (p == null || !Number.isFinite(p))) return null;
  return {
    from: f,
    to: t,
    price: Number.isFinite(p) ? p : null,
    currency: 'GBP',
  };
}

function cleanJobs(jobs) {
  return jobs.filter(Boolean).filter((j) => j.from || j.to || j.price != null);
}

/** Split multi-job blobs into candidate chunks. */
export function splitJobChunks(text) {
  const t = String(text || '').replace(/\r/g, '');
  const parts = t.split(
    /(?:^|\n)\s*(?:\*{0,2}(?:Job\s*\d+|\d+(?:st|nd|rd|th)\s*Job|\(\s*Job\s*\d+\s*\))\*{0,2}|\*{0,2}\d+\.\s+\d{1,2}:\d{2}\*{0,2}|At:\s*\d{1,2}:\d{2})/i,
  );
  if (parts.length > 2) {
    return parts.map((p) => p.trim()).filter((p) => p.length > 15);
  }

  const atLines = t.split(/(?=\nAt:\s*\d{1,2}:\d{2})/i).map((p) => p.trim()).filter(Boolean);
  if (atLines.length > 1) return atLines;

  return [t.trim()].filter(Boolean);
}

function extractLabeled(chunk) {
  const pick =
    chunk.match(
      /(?:pick[\s-]?up(?:\s+location)?|pickup|from|address)\s*[:;]\s*([^\n]+)/i,
    )?.[1] || null;
  const drop =
    chunk.match(
      /(?:drop[\s-]?off(?:\s+location)?|dropoff|destination|drop\s*off)\s*[:;]\s*([^\n]+)/i,
    )?.[1] || null;
  const price = extractPrice(chunk);
  if (pick || drop) return job(pick, drop, price);
  return null;
}

function extractRouteLine(chunk) {
  const lines = String(chunk)
    .split('\n')
    .map((l) => l.replace(/[*_`]/g, '').trim())
    .filter(Boolean);

  for (const line of lines) {
    let m =
      line.match(
        /^(.+?)\s+(?:TO|to|To)\s+(.+?)(?:\s+[£*]|\s*$)/,
      ) ||
      line.match(/^(.+?)\s*[-–—_]{1,6}\s*(.+?)(?:\s+[£*]|\s*$)/) ||
      line.match(
        /^(?:From\s*:?\s*)(.+?)\s+(?:to|TO)\s+(.+?)(?:\s+[£*]|\s*[*,]|\s*$)/i,
      ) ||
      line.match(
        /At:\s*\d{1,2}:\d{2}\s*,?\s*From:?\s*(.+?)\s*,?\s*To:?\s*(.+?)(?:\s*,{2,}|\s*\*|£|$)/i,
      );

    if (!m) {
      // "From SE9 3NS Gatwick £80" / "From TW2 to Stansted"
      m = line.match(
        /From\s+(.+?)\s+(?:to\s+)?(Heathrow|Gatwick|Luton|Stansted|LHR|LGW|LTN|STN|[A-Z]{1,2}\d{1,2}(?:\s*\d?[A-Z]{0,2})?)\b/i,
      );
    }

    if (!m) continue;

    let from = m[1]?.trim();
    let to = m[2]?.trim();
    if (!from || !to) continue;
    // Skip pure time/date lines
    if (/^\d{1,2}:\d{2}/.test(from) || /seater|mpv|payment|tomorrow|today|asap/i.test(from) && from.length < 12) {
      continue;
    }
    if (/seater|mpv|payment|fare|price|net|vehicle/i.test(from) && !POSTCODE_RE.test(from) && !/airport|lhr|lgw|ltn|stn|heathrow|gatwick|luton|stansted/i.test(from)) {
      continue;
    }

    const price = extractPrice(line) ?? extractPrice(chunk);
    const j = job(from, to, price);
    if (j && (j.from || j.to)) return j;
  }
  return null;
}

function extractLooseAirportPostcode(chunk) {
  const price = extractPrice(chunk);
  const airports = [];
  for (const [re, code] of AIRPORT_MAP) {
    re.lastIndex = 0;
    if (re.test(chunk)) airports.push(code);
  }
  POSTCODE_RE.lastIndex = 0;
  const pcs = [];
  let m;
  const copy = String(chunk);
  while ((m = POSTCODE_RE.exec(copy)) !== null) {
    const pc = (m[1] || m[2] || '').toUpperCase().replace(/\s+/g, ' ');
    if (pc && !pcs.includes(pc)) pcs.push(pc);
  }

  if (airports.length && pcs.length) {
    // Heuristic: first airport vs first postcode order in text
    const airIdx = Math.min(
      ...AIRPORT_MAP.map(([re]) => {
        re.lastIndex = 0;
        const mm = re.exec(chunk);
        return mm ? mm.index : Infinity;
      }),
    );
    const pcIdx = chunk.search(POSTCODE_RE);
    if (pcIdx >= 0 && pcIdx < airIdx) {
      return job(pcs[0], airports[0], price);
    }
    return job(airports[0], pcs[0], price);
  }

  if (airports.length >= 2) return job(airports[0], airports[1], price);
  if (pcs.length >= 2) return job(pcs[0], pcs[1], price);
  if ((airports.length || pcs.length) && price != null) {
    return job(airports[0] || null, pcs[0] || null, price);
  }
  return null;
}

export function extractJobsFromChunk(chunk) {
  return (
    extractLabeled(chunk) ||
    extractRouteLine(chunk) ||
    extractLooseAirportPostcode(chunk) ||
    null
  );
}

/** Synchronous rules-only extraction. */
export function extractJobsRules(text) {
  const chunks = splitJobChunks(text);
  const jobs = cleanJobs(chunks.map(extractJobsFromChunk));

  // Single-chunk fallback already covered; if multi split failed to yield, try whole text once
  if (!jobs.length) {
    const one = extractJobsFromChunk(text);
    if (one) jobs.push(one);
  }

  // Price-only salvage
  if (!jobs.length) {
    const price = extractPrice(text);
    if (price != null) {
      jobs.push({ from: null, to: null, price, currency: 'GBP' });
    }
  }

  const usable = jobs.some((j) => j.from || j.to);
  return {
    jobs,
    parseStatus: usable ? 'silver' : jobs.length ? 'silver' : 'empty',
    parseSource: 'rules_v1',
  };
}

async function callOwnModel(text) {
  const base = String(config.ownModelUrl || '').replace(/\/$/, '');
  if (!base) return null;

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), config.ownModelTimeoutMs);
  try {
    const res = await fetch(`${base}/extract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text }),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    const data = await res.json();
    const jobs = Array.isArray(data?.jobs)
      ? cleanJobs(
          data.jobs.map((j) =>
            job(j?.from, j?.to, j?.price == null ? null : Number(j.price)),
          ),
        )
      : [];
    if (!jobs.length) return null;
    return {
      jobs,
      parseStatus: 'model',
      parseSource: 'own_model',
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Hybrid: Gemini (if key) → local own model → rules.
 * @param {string} text
 * @returns {Promise<ExtractResult>}
 */
export async function extractJobs(text) {
  const geminiResult = await callGeminiExtract(text, job);
  if (geminiResult?.jobs?.length) {
    return {
      ...geminiResult,
      jobs: cleanJobs(geminiResult.jobs),
    };
  }

  const modelResult = await callOwnModel(text);
  if (modelResult?.jobs?.length) return modelResult;

  return extractJobsRules(text);
}
