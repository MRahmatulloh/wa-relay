#!/usr/bin/env node
/** Re-run rules extract on existing Mongo messages missing usable jobs. */
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Message } from '../models/Message.js';
import { extractJobsRules } from '../services/jobExtract.js';

/** Keep geocode / miles when from→to (and price) still match after re-parse. */
function mergePreservedGeo(prevJobs, nextJobs) {
  const prev = Array.isArray(prevJobs) ? prevJobs : [];
  return (Array.isArray(nextJobs) ? nextJobs : []).map((job, i) => {
    const old = prev[i];
    if (
      !old ||
      old.from !== job.from ||
      old.to !== job.to ||
      (old.price != null && job.price != null && Number(old.price) !== Number(job.price))
    ) {
      return job;
    }
    return {
      ...job,
      fromLat: old.fromLat ?? job.fromLat ?? null,
      fromLng: old.fromLng ?? job.fromLng ?? null,
      toLat: old.toLat ?? job.toLat ?? null,
      toLng: old.toLng ?? job.toLng ?? null,
      distanceMiles: old.distanceMiles ?? job.distanceMiles ?? null,
      pricePerMile: old.pricePerMile ?? job.pricePerMile ?? null,
    };
  });
}

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
    doc.jobs = mergePreservedGeo(doc.jobs, extracted.jobs);
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
