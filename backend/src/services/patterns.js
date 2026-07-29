import fs from 'fs';
import { config } from '../config.js';

let compiled = [];

function loadPatterns() {
  const sources = [];
  if (config.patternsEnv.trim()) {
    sources.push(
      ...config.patternsEnv
        .split('|')
        .map((s) => s.trim())
        .filter(Boolean)
    );
  }
  try {
    if (fs.existsSync(config.patternsFile)) {
      const raw = JSON.parse(fs.readFileSync(config.patternsFile, 'utf8'));
      if (Array.isArray(raw)) {
        sources.push(...raw.map(String));
      }
    }
  } catch (err) {
    console.warn('Failed to read patterns file', err.message);
  }
  const unique = [...new Set(sources)];
  compiled = unique.map((source) => {
    try {
      return { source, regex: new RegExp(source, 'i') };
    } catch {
      console.warn('Invalid pattern skipped:', source);
      return null;
    }
  }).filter(Boolean);
  console.log(
    'Loaded patterns:',
    compiled.map((p) => p.source)
  );
}

loadPatterns();

export function matchPattern(text) {
  if (!text) return null;
  for (const p of compiled) {
    if (p.regex.test(text)) {
      return p.source;
    }
  }
  return null;
}

export function reloadPatterns() {
  loadPatterns();
}
