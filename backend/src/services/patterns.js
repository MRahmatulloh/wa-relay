import fs from 'fs';
import { config } from '../config.js';

/** @type {{ source: string, regex: RegExp } | null} */
let includeCompiled = null;
/** @type {{ id: string, name: string, source: string, regex: RegExp }[]} */
let foldersCompiled = [];

function compileRegex(source, label) {
  try {
    return new RegExp(source, 'i');
  } catch {
    console.warn(`Invalid ${label} pattern skipped:`, source);
    return null;
  }
}

function loadPatterns() {
  includeCompiled = null;
  foldersCompiled = [];

  // Env PATTERNS overrides as a flat include gate (legacy pipe-separated list).
  if (config.patternsEnv.trim()) {
    const source = config.patternsEnv
      .split('|')
      .map((s) => s.trim())
      .filter(Boolean)
      .join('|');
    if (source) {
      const regex = compileRegex(source, 'env include');
      if (regex) includeCompiled = { source, regex };
    }
  }

  try {
    if (fs.existsSync(config.patternsFile)) {
      const raw = JSON.parse(fs.readFileSync(config.patternsFile, 'utf8'));

      // Legacy: ["pattern", ...] → treat as include-only (folder = others).
      if (Array.isArray(raw)) {
        const source = raw.map(String).filter(Boolean).join('|');
        if (source && !includeCompiled) {
          const regex = compileRegex(source, 'file include');
          if (regex) includeCompiled = { source, regex };
        }
      } else if (raw && typeof raw === 'object') {
        if (!includeCompiled && raw.includePattern) {
          const source = String(raw.includePattern);
          const regex = compileRegex(source, 'include');
          if (regex) includeCompiled = { source, regex };
        }
        const folders = Array.isArray(raw.folders) ? raw.folders : [];
        for (const f of folders) {
          const id = String(f.id || '').trim().toLowerCase();
          const name = String(f.name || id).trim();
          const source = String(f.includePattern || '').trim();
          if (!id || !source) continue;
          const regex = compileRegex(source, `folder ${id}`);
          if (regex) foldersCompiled.push({ id, name, source, regex });
        }
      }
    }
  } catch (err) {
    console.warn('Failed to read patterns file', err.message);
  }

  console.log(
    'Loaded include pattern:',
    includeCompiled?.source || '(none)',
    '| folders:',
    foldersCompiled.map((f) => f.id).join(', ') || '(none)'
  );
}

loadPatterns();

/**
 * @param {string} text
 * @returns {{ matchedPattern: string, folder: string } | null}
 */
export function matchPattern(text) {
  if (!text || !includeCompiled) return null;
  if (!includeCompiled.regex.test(text)) return null;

  for (const f of foldersCompiled) {
    if (f.regex.test(text)) {
      return { matchedPattern: includeCompiled.source, folder: f.id };
    }
  }
  return { matchedPattern: includeCompiled.source, folder: 'others' };
}

export function reloadPatterns() {
  loadPatterns();
}
