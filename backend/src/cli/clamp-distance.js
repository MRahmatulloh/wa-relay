/** Re-clamp stored distanceMiles using coords already on the job (no network). */
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Message } from '../models/Message.js';
import { clampRouteMiles, computePricePerMile } from '../services/jobDistance.js';

async function main() {
  await mongoose.connect(config.mongoUri);
  const cursor = Message.find({
    'jobs.fromLat': { $ne: null },
    'jobs.toLat': { $ne: null },
    'jobs.distanceMiles': { $ne: null },
  }).cursor();

  let scanned = 0;
  let updated = 0;

  for await (const doc of cursor) {
    scanned++;
    let changed = false;
    const jobs = (doc.jobs || []).map((j) => {
      const job = typeof j.toObject === 'function' ? j.toObject() : { ...j };
      if (
        job.distanceMiles == null ||
        job.fromLat == null ||
        job.toLat == null ||
        job.fromLng == null ||
        job.toLng == null
      ) {
        return job;
      }
      const next = clampRouteMiles(job.distanceMiles, { lat: job.fromLat, lng: job.fromLng }, { lat: job.toLat, lng: job.toLng });
      if (next != null && next !== job.distanceMiles) {
        changed = true;
        job.distanceMiles = next;
        job.pricePerMile = computePricePerMile(job.price, next);
      }
      return job;
    });
    if (changed) {
      doc.jobs = jobs;
      await doc.save();
      updated++;
    }
  }

  await mongoose.disconnect();
  console.log(JSON.stringify({ scanned, updated }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
