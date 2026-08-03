#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Message } from '../models/Message.js';
import { extractJobsRules } from '../services/jobExtract.js';

function arg(name, fallback = null) {
  const i = process.argv.indexOf(name);
  if (i === -1) return fallback;
  return process.argv[i + 1] ?? fallback;
}

function hasFlag(name) {
  return process.argv.includes(name);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJsonl(filePath, rows) {
  const body = rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '');
  fs.writeFileSync(filePath, body, 'utf8');
}

function toRow(doc, extracted) {
  const id = doc._id?.$oid || doc._id?.toString?.() || doc.id || doc.messageId;
  return {
    id: String(id),
    messageId: doc.messageId || null,
    folder: doc.folder || 'others',
    text: doc.text || '',
    jobs: extracted.jobs,
    parseStatus: extracted.parseStatus,
    parseSource: extracted.parseSource,
  };
}

function isTrainable(row) {
  return row.jobs.some((j) => j.from && j.to);
}

function splitTrainVal(rows, seed = 42) {
  const arr = [...rows];
  let s = seed;
  const rnd = () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  const cut = Math.max(1, Math.floor(arr.length * 0.9));
  return { train: arr.slice(0, cut), val: arr.slice(cut) };
}

async function loadDocs() {
  const inFile = arg('--in');
  if (inFile) {
    const abs = path.resolve(inFile);
    const data = JSON.parse(fs.readFileSync(abs, 'utf8'));
    if (!Array.isArray(data)) throw new Error('Input JSON must be an array');
    return data;
  }
  if (hasFlag('--mongo')) {
    await mongoose.connect(config.mongoUri);
    const rows = await Message.find({}).lean();
    await mongoose.disconnect();
    return rows;
  }
  throw new Error('Provide --in <messages.json> or --mongo');
}

async function main() {
  const outDir = path.resolve(arg('--out', path.join(process.cwd(), '..', 'ml', 'data')));
  ensureDir(outDir);

  const docs = await loadDocs();
  const all = [];
  let multi = 0;
  let empty = 0;

  for (const doc of docs) {
    const extracted = extractJobsRules(doc.text || '');
    const row = toRow(doc, extracted);
    all.push(row);
    if (row.jobs.length > 1) multi++;
    if (!row.jobs.length || row.parseStatus === 'empty') empty++;
  }

  const trainable = all.filter(isTrainable);
  const { train, val } = splitTrainVal(trainable);

  writeJsonl(path.join(outDir, 'all.silver.jsonl'), all);
  writeJsonl(path.join(outDir, 'train.jsonl'), train);
  writeJsonl(path.join(outDir, 'val.jsonl'), val);

  console.log(
    JSON.stringify(
      {
        total: all.length,
        trainable: trainable.length,
        train: train.length,
        val: val.length,
        multiJob: multi,
        empty,
        outDir,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
