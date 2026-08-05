/** Clear poisoned PlaceCache and re-geocode jobs with absurd miles. */
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Message } from '../models/Message.js';
import { PlaceCache } from '../models/PlaceCache.js';
import { enrichJobsGeo } from '../services/jobDistance.js';

const ABSURD_MILES = 80;
/** Newcastle-area hit used for bare London E-outcodes */
const BAD_NORTH_LAT = 54;

async function main() {
  await mongoose.connect(config.mongoUri);
  const cacheDeleted = await PlaceCache.deleteMany({});
  console.log(JSON.stringify({ cacheCleared: cacheDeleted.deletedCount }));

  const filter = {
    $or: [
      {
        jobs: {
          $elemMatch: {
            from: { $nin: [null, ''] },
            to: { $nin: [null, ''] },
            distanceMiles: { $gt: ABSURD_MILES },
          },
        },
      },
      {
        jobs: {
          $elemMatch: {
            $or: [{ fromLat: { $gte: BAD_NORTH_LAT } }, { toLat: { $gte: BAD_NORTH_LAT } }],
          },
        },
      },
      {
        // Southern England false hits (e.g. W1/W2 → East Sussex ~50.9)
        jobs: {
          $elemMatch: {
            $or: [{ fromLat: { $gt: 0, $lt: 51.1 } }, { toLat: { $gt: 0, $lt: 51.1 } }],
            distanceMiles: { $gt: 50 },
          },
        },
      },
    ],
  };

  const cursor = Message.find(filter).cursor();
  let scanned = 0;
  let updated = 0;

  for await (const doc of cursor) {
    scanned++;
    try {
      doc.jobs = await enrichJobsGeo(doc.jobs || []);
      await doc.save();
      updated++;
      if (updated % 10 === 0) console.log(`updated ${updated}/${scanned}`);
    } catch (err) {
      console.error('regeo error', doc.messageId, err?.message || err);
    }
  }

  await mongoose.disconnect();
  console.log(JSON.stringify({ scanned, updated }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
