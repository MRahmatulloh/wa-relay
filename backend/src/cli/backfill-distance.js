#!/usr/bin/env node
/** Enrich existing jobs with geocode + driving miles + £/mi. */
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Message } from '../models/Message.js';
import { enrichJobsGeo } from '../services/jobDistance.js';

function needsDistance(jobs) {
  if (!Array.isArray(jobs) || !jobs.length) return false;
  return jobs.some(
    (j) => j?.from && j?.to && (j.distanceMiles == null || j.distanceMiles === undefined),
  );
}

async function main() {
  const force = process.argv.includes('--force');
  await mongoose.connect(config.mongoUri);
  const filter = force
    ? { 'jobs.0': { $exists: true } }
    : {
        jobs: {
          $elemMatch: {
            from: { $nin: [null, ''] },
            to: { $nin: [null, ''] },
            $or: [{ distanceMiles: null }, { distanceMiles: { $exists: false } }],
          },
        },
      };

  const cursor = Message.find(filter).cursor();
  let scanned = 0;
  let updated = 0;
  let skipped = 0;

  for await (const doc of cursor) {
    scanned++;
    if (!force && !needsDistance(doc.jobs)) {
      skipped++;
      continue;
    }
    try {
      doc.jobs = await enrichJobsGeo(doc.jobs || []);
      await doc.save();
      updated++;
    } catch (err) {
      console.error('backfill error', doc.messageId, err?.message || err);
    }
    if (updated % 20 === 0 && updated > 0) {
      console.log(`updated ${updated}/${scanned}`);
    }
  }

  await mongoose.disconnect();
  console.log(JSON.stringify({ scanned, updated, skipped }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
