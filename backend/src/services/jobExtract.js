import { config } from '../config.js';
import { callGeminiExtract } from './geminiExtract.js';

const AIRPORT_MAP = [
  [/heathrow(?:\s+airport)?|\blhr\b/gi, 'LHR'],
  [/gatwick(?:\s+airport)?|\blgw\b/gi, 'LGW'],
  [/luton(?:\s+airport)?|\bltn\b/gi, 'LTN'],
  [/stansted(?:\s+airport)?|\bstn\b/gi, 'STN'],
  [/london\s*city(?:\s+airport)?|\blcy\b/gi, 'LCY'],
];

const POSTCODE_RE =
  /\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b|\b([A-Z]{1,2}\d{1,2})\b/gi;

/**
 * @typedef {{ from: string|null, to: string|null, price: number|null, currency: string }} JobFields
 * @typedef {{ jobs: JobFields[], parseStatus: string, parseSource: string }} ExtractResult
 */

/** True for separator junk like "----" mistaken as a place. */
function isGarbagePlace(s) {
  if (!s) return true;
  const t = String(s).trim();
  if (!t) return true;
  if (/^[-–—_=.*·•\s]+$/.test(t)) return true;
  // Date fragments from titles like "Tomorrow Jobs 05-08-2026" → to "08-2026"
  if (/^\d{1,2}[-/.]\d{2,4}([-/.]\d{2,4})?$/.test(t)) return true;
  if (/^(today|tomorrow|yesterday)(\s+jobs?)?(\s+\d{1,2})?$/i.test(t)) return true;
  if (/\bjobs?\b/i.test(t) && /\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}/.test(t)) return true;
  // Titles / vehicle notes mistaken as places
  if (/^(today|tomorrow|yesterday)\b/i.test(t) && !/\b[A-Z]{1,2}\d/i.test(t)) return true;
  if (/^(mpv|van|saloon|estate|executive|minibus)\b/i.test(t)) return true;
  if (/\b\d?\s*seater\b/i.test(t) && !/\b[A-Z]{1,2}\d/i.test(t)) return true;
  if (/^(pick[\s-]?up|drop[\s-]?off|landing)\b/i.test(t)) return true;
  if (/^up\)/i.test(t)) return true;
  if (/^(pair|connection)\s*jobs?\b/i.test(t)) return true;
  if (/^\d{1,2}([.:]\d{2})?\s*(am|pm)?$/i.test(t)) return true;
  const alnum = t.replace(/[^a-z0-9]/gi, '');
  return alnum.length < 2;
}

/** List headers / date banners mistaken as A-B routes. */
function isTitleOrDateLine(line) {
  const t = String(line || '')
    .replace(/[*_`~]/g, '')
    .trim();
  if (!t) return true;
  if (/^(today|tomorrow|yesterday)\s+jobs?\b/i.test(t)) return true;
  if (/\bjobs?\s+\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}\b/i.test(t)) return true;
  if (/^\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4}$/.test(t)) return true;
  return false;
}

/** Chunk looks like it might contain a real job (not just a title). */
function chunkLooksLikeJob(chunk) {
  const t = String(chunk || '');
  if (/pick[\s-]?up|drop[\s-]?off|\bfrom\b|\bto\b|p\s*\/\s*u|d\s*\/\s*o/i.test(t)) return true;
  if (/£|\bfare\b|\bprice\b|\bpounds?\b/i.test(t)) return true;
  if (POSTCODE_RE.test(t)) {
    POSTCODE_RE.lastIndex = 0;
    return true;
  }
  for (const [re] of AIRPORT_MAP) {
    re.lastIndex = 0;
    if (re.test(t)) return true;
  }
  return false;
}

export function normalizePlace(raw) {
  if (!raw) return null;
  let s = String(raw)
    .replace(/[*_`~]/g, '')
    .replace(/^\d{1,2}:\d{2}\s*,?\s*/i, '')
    .replace(/^,?\s*(?:from|to)\b\s*[:：]?\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return null;
  if (isGarbagePlace(s)) return null;
  if (/^job\s*id\b/i.test(s)) return null;

  for (const [re, code] of AIRPORT_MAP) {
    re.lastIndex = 0;
    if (re.test(s)) return code;
  }

  const pc = s.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?\s*\d[A-Z]{2})\b/i);
  if (pc) return pc[1].toUpperCase().replace(/\s+/g, ' ');

  const station = s.match(/\(([A-Z]{3,4})\)/i);
  if (station) return station[1].toUpperCase();

  const outcode = s.match(/\b([A-Z]{1,2}\d{1,2}[A-Z]?)\b/i);
  if (outcode && s.length <= 12) return outcode[1].toUpperCase();

  if (s.length > 80) s = s.slice(0, 80).trim();
  return s;
}

export function extractPrice(text) {
  if (!text) return null;
  // Mojibake / bad UTF-8 often turns £ into U+FFFD between label and digits.
  const cleaned = String(text)
    .replace(/\uFFFD/g, '£')
    .replace(/[*_`]/g, ' ');

  // Priority matters: "MPV 6 £85" must yield 85, not 6.
  const patterns = [
    /(?:£|GBP)\s*(\d+(?:\.\d+)?)/i,
    /(?:(?:net\s*)?fare|price|total|driver\s*income|payment)\s*[:;\-]?\s*£?\s*(\d+(?:\.\d+)?)/i,
    /(\d+(?:\.\d+)?)\s*pounds?\b/i,
    // Trailing £ only when not "N £M" (seat count then fare)
    /(\d+(?:\.\d+)?)\s*£(?!\s*\d)/i,
  ];
  for (const re of patterns) {
    const m = cleaned.match(re);
    if (!m) continue;
    const n = Number(m[1]);
    if (Number.isFinite(n)) return n;
  }
  return null;
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
    const chunks = parts
      .map((p) => p.trim())
      .filter((p) => p.length > 15 && chunkLooksLikeJob(p));
    if (chunks.length) return chunks;
  }

  // **Time:** 04:00 / Time: 05:00 stacked labeled jobs
  const timeBlocks = t
    .split(/(?=(?:^|\n)\s*\*{0,2}Time\*{0,2}\s*:)/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (timeBlocks.length > 1) {
    const chunks = timeBlocks.filter(
      (p) => /\bTime\b\s*:/i.test(p) && chunkLooksLikeJob(p),
    );
    if (chunks.length > 1) return chunks;
  }

  const atLines = t.split(/(?=\nAt:\s*\d{1,2}:\d{2})/i).map((p) => p.trim()).filter(Boolean);
  if (atLines.length > 1) return atLines;

  // *@12:45* / @15:25 stacked job blocks
  const atAt = t
    .split(/(?=(?:^|\n)\s*\*{0,2}@\d{1,2}:\d{2})/i)
    .map((p) => p.trim())
    .filter(Boolean);
  if (atAt.length > 1) {
    const chunks = atAt.filter((p) => /@\d{1,2}:\d{2}/.test(p) && p.length > 8);
    if (chunks.length > 1) return chunks;
  }

  return [t.trim()].filter(Boolean);
}

function labeledBlock(chunk, labels) {
  const labelRe = labels.source || labels;
  const re = new RegExp(
    `(?:${labelRe})\\s*[:;]?\\s*([^\\n]*)(?:\\n(?!\\s*(?:pick[\\s-]?up|pickup|p\\s*/\\s*u|pu|drop[\\s-]?off|dropoff|d\\s*/\\s*o|do|from|to|destination|address|vehicle|net\\s*fare|fare|price|payment|child|job\\s*id|dm\\b)[:\\s])([^\\n]+))?`,
    'i',
  );
  const m = String(chunk).match(re);
  if (!m) return null;
  const same = (m[1] || '').trim();
  const next = (m[2] || '').trim();
  // Prefer next line when same-line value is only a time / empty
  if (next && (!same || /^\d{1,2}:\d{2}$/.test(same))) return next;
  if (same && next && /^\d{1,2}:\d{2}\b/.test(same)) {
    return `${same}, ${next}`;
  }
  return same || next || null;
}

/** Cut trailing "To: ..." if From and To were on one line. */
function truncateAtToLabel(value) {
  if (!value) return value;
  return String(value)
    .replace(/\s*,?\s*\bto\s*[:：].*$/i, '')
    .replace(/\s+to\s+(?:heathrow|gatwick|luton|stansted|lhr|lgw|ltn|stn|lcy)\b.*$/i, (m, offset, s) => {
      // keep "X to LHR" intact for route parsers — only strip if From: captured both
      return m;
    })
    .trim();
}

function extractLabeled(chunk) {
  // Explicit From:/To: on one or two lines
  const fromTo =
    String(chunk).match(
      /(?:^|\n)\s*\*{0,2}From\*{0,2}\s*[:：]\s*(.+?)\s*(?:\n|,)?\s*\*{0,2}To\*{0,2}\s*[:：]\s*(.+?)(?:\n|$)/i,
    ) ||
    String(chunk).match(
      /From\s*[:：]\s*(.+?)\s*,?\s*To\s*[:：]\s*(.+?)(?:\s*,{2,}|\s*\*|£|\n|$)/i,
    );
  if (fromTo) {
    const price = extractPrice(chunk);
    const j = job(fromTo[1], fromTo[2], price);
    if (j && j.from && j.to) return j;
  }

  // "Pick Up FromLGW..." / "Pick Up From: LGW" glued forms
  const pickFrom = String(chunk).match(
    /pick[\s-]?up\s*from\s*:?\s*(.+?)(?:\n|$)/i,
  );
  const addr = String(chunk).match(
    /(?:^|\n)\s*(?:address|drop[\s-]?off|destination)\s*:?\s*(.+?)(?:\n|$)/i,
  );
  if (pickFrom && addr) {
    const price = extractPrice(chunk);
    const j = job(pickFrom[1], addr[1], price);
    if (j && (j.from || j.to)) return j;
  }

  const pick = labeledBlock(
    chunk,
    'pick[\\s-]?up(?:\\s+location)?|pickup|p\\s*/\\s*u|\\bpu\\b|from|address',
  );
  const drop = labeledBlock(
    chunk,
    'drop[\\s-]?off(?:\\s+location)?|dropoff|d\\s*/\\s*o|\\bdo\\b|destination|drop\\s*off|\\bto\\b',
  );
  const price = extractPrice(chunk);
  if (pick || drop) {
    let fromVal = pick;
    let toVal = drop;
    // From: SO15 0HH, To: SW1V — or "From Portsmouth To RM12"
    if (fromVal && /\bto\b/i.test(fromVal) && !toVal) {
      const parts = fromVal.split(/\s+to\s*[:：]?\s+/i);
      fromVal = parts[0];
      toVal = parts.slice(1).join(' ');
    }
    // drop matched mid-string "To RM12" while from still has full line
    if (fromVal && toVal && fromVal.toLowerCase().includes(`to ${toVal.toLowerCase().slice(0, 8)}`)) {
      fromVal = fromVal.split(/\s+to\s*[:：]?\s+/i)[0];
    }
    return job(fromVal, toVal, price);
  }
  return null;
}

function extractRouteLine(chunk) {
  const routes = extractAllRouteLines(chunk);
  return routes[0] || null;
}

/** Collect every `A To B` style route line (supports leading HH:MM). */
function extractAllRouteLines(chunk) {
  const lines = String(chunk)
    .split('\n')
    .map((l) => l.replace(/[*_`]/g, '').trim())
    .filter(Boolean);

  const sharedPrice = extractPrice(chunk);
  const jobs = [];

  for (const line of lines) {
    // Skip decorative separators mistaken as A - B routes
    if (/^[-–—_=.*·•\s]{4,}$/.test(line)) continue;
    if (isTitleOrDateLine(line)) continue;

    const stripped = line.replace(/^\d{1,2}:\d{2}\s+/, '');
    let m =
      stripped.match(/^(.+?)\s+(?:TO|to|To)\s+(.+?)(?:\s+[£*(]|\s*$)/) ||
      stripped.match(/^(.+?)\s*[➡️→➞➔]\s*(.+?)(?:\s+[£*(]|\s*$)/) ||
      stripped.match(/^(.+?)\s*[-–—_]{1,6}\s*(.+?)(?:\s+[£*(]|\s*$)/) ||
      stripped.match(
        /^(?:From\s*:?\s*)(.+?)\s+(?:to|TO)\s+(.+?)(?:\s+[£*]|\s*[*,(]|\s*$)/i,
      ) ||
      line.match(
        /At:\s*\d{1,2}:\d{2}\s*,?\s*From:?\s*(.+?)\s*,?\s*To:?\s*(.+?)(?:\s*,{2,}|\s*\*|£|$)/i,
      );

    if (!m) {
      m = stripped.match(
        /From\s+(.+?)\s+(?:to\s+)?(Heathrow|Gatwick|Luton|Stansted|LHR|LGW|LTN|STN|LCY|[A-Z]{1,2}\d{1,2}(?:\s*\d?[A-Z]{0,2})?)\b/i,
      );
    }

    if (!m) continue;

    let from = m[1]?.trim();
    let to = m[2]?.trim();
    if (!from || !to) continue;
    if (isGarbagePlace(from) || isGarbagePlace(to)) continue;
    if (isTitleOrDateLine(from) || isTitleOrDateLine(to)) continue;
    if (/^job\s*id\b/i.test(line) || /^job\s*id\b/i.test(from) || /^\d+$/.test(to)) {
      continue;
    }
    if (
      /seater|mpv|payment|fare|price|total|net|vehicle/i.test(from) &&
      !POSTCODE_RE.test(from) &&
      !/airport|lhr|lgw|ltn|stn|heathrow|gatwick|luton|stansted/i.test(from)
    ) {
      continue;
    }

    // Strip trailing vehicle notes from `to` e.g. "heathrow (8 Seater)"
    to = to.replace(/\s*\([^)]*\)\s*$/, '').trim();

    const price = extractPrice(line) ?? null;
    const j = job(from, to, price);
    if (j && (j.from || j.to)) jobs.push(j);
  }

  // Pair / multi-leg: shared "Total : 135" applies to first leg only for storage
  if (jobs.length && sharedPrice != null && jobs.every((j) => j.price == null)) {
    jobs[0] = { ...jobs[0], price: sharedPrice };
  }

  return jobs;
}

export function extractJobsFromChunk(chunk) {
  const labeled = extractLabeled(chunk);
  // Prefer labeled only when both ends exist; else try route lines (fixes From-only)
  if (labeled?.from && labeled?.to) return labeled;

  const routes = extractAllRouteLines(chunk);
  if (routes.length === 1) return routes[0];
  if (routes.length > 1) return routes;

  if (labeled && (labeled.from || labeled.to)) return labeled;

  return extractLooseAirportPostcode(chunk) || null;
}

/** Synchronous rules-only extraction. */
export function extractJobsRules(text) {
  const chunks = splitJobChunks(text);
  const jobs = cleanJobs(chunks.flatMap((c) => {
    const r = extractJobsFromChunk(c);
    return Array.isArray(r) ? r : [r];
  }));

  // Single-chunk fallback already covered; if multi split failed to yield, try whole text once
  if (!jobs.length) {
    const one = extractJobsFromChunk(text);
    if (Array.isArray(one)) jobs.push(...one.filter(Boolean));
    else if (one) jobs.push(one);
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
    return finalizeExtract({
      ...geminiResult,
      jobs: cleanJobs(geminiResult.jobs),
    }, text);
  }

  const modelResult = await callOwnModel(text);
  if (modelResult?.jobs?.length) return finalizeExtract(modelResult, text);

  return finalizeExtract(extractJobsRules(text), text);
}

/** Fill missing Total/fare price; prefer multi-leg rules when model returned a single incomplete route. */
function finalizeExtract(result, text) {
  let jobs = cleanJobs(result.jobs || []);
  const price = extractPrice(text);
  if (price != null && jobs.length && jobs.every((j) => j.price == null)) {
    jobs = [{ ...jobs[0], price }, ...jobs.slice(1)];
  }

  const rules = extractJobsRules(text);
  if (rules.jobs.length > jobs.length) {
    // Keep richer multi-leg parse (e.g. pair booking) when model only saw one leg
    const rulesPrice = rules.jobs[0]?.price ?? price;
    jobs = rules.jobs.map((j, i) =>
      i === 0 && j.price == null && rulesPrice != null ? { ...j, price: rulesPrice } : j,
    );
    return {
      jobs: cleanJobs(jobs),
      parseStatus: 'silver',
      parseSource: 'rules_v1',
    };
  }

  return { ...result, jobs: cleanJobs(jobs) };
}
