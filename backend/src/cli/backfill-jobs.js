#!/usr/bin/env node
/** Re-run rules extract on existing Mongo messages missing usable jobs. */
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Message } from '../models/Message.js';
import { extractJobsRules } from '../services/jobExtract.js';

async function main() {
  const force = process.argv.includes('--force');
  await mongoose.connect(config.mongoUri);
  const filter = force
    ? {}
    : {
        $or: [
          { jobs: { $exists: false } },
          { jobs: { $size: 0 } },
          { parseStatus: { $in: [null, 'empty'] } },
        ],
      };
  const cursor = Message.find(filter).cursor();
  let n = 0;
  let updated = 0;
  for await (const doc of cursor) {
    n++;
    const extracted = extractJobsRules(doc.text || '');
    doc.jobs = extracted.jobs;
    doc.parseStatus = extracted.parseStatus;
    doc.parseSource = extracted.parseSource;
    await doc.save();
    updated++;
    if (updated % 200 === 0) console.log(`updated ${updated}/${n}`);
  }
  await mongoose.disconnect();
  console.log(JSON.stringify({ scanned: n, updated }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
