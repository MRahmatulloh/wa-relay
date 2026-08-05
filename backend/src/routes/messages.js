import { Router } from 'express';
import mongoose from 'mongoose';
import { Message, serializeMessage } from '../models/Message.js';
import { authMiddleware } from '../middleware/auth.js';
import { sendThumbsUpReaction } from '../services/baileys.js';

const router = Router();

function parseBool(value) {
  if (value === undefined || value === null || value === '') return null;
  const s = String(value).toLowerCase();
  if (s === '1' || s === 'true' || s === 'yes') return true;
  if (s === '0' || s === 'false' || s === 'no') return false;
  return null;
}

function buildListFilter(query) {
  const filter = {};

  const unread = parseBool(query.unread);
  if (unread === true) filter.readAt = null;
  if (unread === false) filter.readAt = { $ne: null };

  const starred = parseBool(query.starred);
  if (starred !== null) filter.starred = starred;

  const done = parseBool(query.done);
  if (done !== null) filter.done = done;

  const thumbsUp = parseBool(query.thumbsUp);
  if (thumbsUp !== null) filter.thumbsUp = thumbsUp;

  const parseBug = parseBool(query.parseBug);
  if (parseBug !== null) filter.parseBug = parseBug;

  const isGroup = parseBool(query.isGroup);
  if (isGroup !== null) filter.isGroup = isGroup;

  const folder = String(query.folder || '').trim().toLowerCase();
  if (folder && folder !== 'all') {
    filter.folder = folder;
  }

  const parseStatus = String(query.parseStatus || '').trim().toLowerCase();
  if (parseStatus) filter.parseStatus = parseStatus;

  const q = String(query.q || '').trim();
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { text: re },
      { senderName: re },
      { senderPhone: re },
      { groupName: re },
      { matchedPattern: re },
      { 'jobs.from': re },
      { 'jobs.to': re },
    ];
  }

  const createdAfter = resolveCreatedAfter(query);
  if (createdAfter) {
    filter.createdAt = { $gte: createdAfter };
  }

  return filter;
}

/** `time=2h` | `time=today` | raw ISO via `since`. */
function resolveCreatedAfter(query) {
  const sinceRaw = String(query.since || '').trim();
  if (sinceRaw) {
    const d = new Date(sinceRaw);
    if (!Number.isNaN(d.getTime())) return d;
  }

  const time = String(query.time || '').trim().toLowerCase();
  if (!time || time === 'all') return null;

  const now = new Date();
  if (time === 'today') {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    return start;
  }

  const m = /^(\d+)\s*h$/.exec(time);
  if (m) {
    const hours = Number(m[1]);
    if (Number.isFinite(hours) && hours > 0 && hours <= 168) {
      return new Date(now.getTime() - hours * 60 * 60 * 1000);
    }
  }

  return null;
}

router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit) || 40, 1), 100);
    const filter = buildListFilter(req.query);

    const before = String(req.query.before || '').trim();
    if (before) {
      if (!mongoose.isValidObjectId(before)) {
        return res.status(400).json({ error: 'Invalid before cursor' });
      }
      const cursorDoc = await Message.findById(before).select({ createdAt: 1 }).lean();
      if (!cursorDoc) {
        return res.status(400).json({ error: 'Cursor not found' });
      }
      const older = {
        $or: [
          { createdAt: { $lt: cursorDoc.createdAt } },
          { createdAt: cursorDoc.createdAt, _id: { $lt: cursorDoc._id } },
        ],
      };
      // Always $and cursor so time-window `createdAt` / search `$or` are preserved.
      const extras = [];
      if (filter.$or) {
        extras.push({ $or: filter.$or });
        delete filter.$or;
      }
      if (filter.$and) {
        extras.push(...filter.$and);
        delete filter.$and;
      }
      extras.push(older);
      filter.$and = extras;
    }

    const rows = await Message.find(filter)
      .sort({ createdAt: -1, _id: -1 })
      .limit(limit + 1)
      .lean();

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore && page.length ? page[page.length - 1]._id.toString() : null;

    return res.json({
      messages: page.map(serializeMessage),
      hasMore,
      nextCursor,
    });
  } catch (err) {
    console.error('messages error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

async function computeUnreadCounts() {
  const rows = await Message.aggregate([
    { $match: { readAt: null } },
    { $group: { _id: { $ifNull: ['$folder', 'others'] }, count: { $sum: 1 } } },
  ]);
  const counts = { all: 0, lgw: 0, lhr: 0, ltn: 0, stn: 0, others: 0 };
  for (const row of rows) {
    const key = String(row._id || 'others').toLowerCase();
    const n = Number(row.count) || 0;
    if (Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key] = n;
    } else {
      counts.others += n;
    }
    counts.all += n;
  }
  return counts;
}

/** Counts per folder for current list filters (ignores `folder` so every chip gets a total). */
async function computeFolderCounts(query) {
  const filter = buildListFilter(query);
  delete filter.folder;

  const mapOnly = parseBool(query.map);
  if (mapOnly === true) {
    const hasFrom = {
      jobs: {
        $elemMatch: {
          fromLat: { $type: 'number' },
          fromLng: { $type: 'number' },
        },
      },
    };
    if (filter.$or) {
      const searchOr = filter.$or;
      delete filter.$or;
      filter.$and = [...(filter.$and || []), { $or: searchOr }, hasFrom];
    } else if (filter.$and) {
      filter.$and.push(hasFrom);
    } else {
      Object.assign(filter, hasFrom);
    }
  }

  const rows = await Message.aggregate([
    { $match: filter },
    { $group: { _id: { $ifNull: ['$folder', 'others'] }, count: { $sum: 1 } } },
  ]);
  const counts = { all: 0, lgw: 0, lhr: 0, ltn: 0, stn: 0, others: 0 };
  for (const row of rows) {
    const key = String(row._id || 'others').toLowerCase();
    const n = Number(row.count) || 0;
    if (Object.prototype.hasOwnProperty.call(counts, key)) {
      counts[key] = n;
    } else {
      counts.others += n;
    }
    counts.all += n;
  }
  return counts;
}

router.get('/unread-counts', authMiddleware, async (_req, res) => {
  try {
    return res.json({ counts: await computeUnreadCounts() });
  } catch (err) {
    console.error('unread-counts error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.get('/folder-counts', authMiddleware, async (req, res) => {
  try {
    return res.json({ counts: await computeFolderCounts(req.query) });
  } catch (err) {
    console.error('folder-counts error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** Map view: same list filters, only messages with fromLat/fromLng, up to 500. */
router.get('/map', authMiddleware, async (req, res) => {
  try {
    const filter = buildListFilter(req.query);
    const hasFrom = {
      jobs: {
        $elemMatch: {
          fromLat: { $type: 'number' },
          fromLng: { $type: 'number' },
        },
      },
    };

    let query;
    if (filter.$or) {
      const searchOr = filter.$or;
      delete filter.$or;
      query = { ...filter, $and: [{ $or: searchOr }, hasFrom] };
    } else {
      query = { ...filter, ...hasFrom };
    }

    const rows = await Message.find(query)
      .sort({ createdAt: -1, _id: -1 })
      .limit(500)
      .lean();

    return res.json({ messages: rows.map(serializeMessage) });
  } catch (err) {
    console.error('messages map error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

/** Mark all unread messages as read in the current folder (`all` / omit = every folder). */
router.post('/mark-all-read', authMiddleware, async (req, res) => {
  try {
    const folder = String(req.body?.folder ?? req.query?.folder ?? '')
      .trim()
      .toLowerCase();
    const filter = { readAt: null };
    if (folder && folder !== 'all') {
      filter.folder = folder;
    }
    const result = await Message.updateMany(filter, { $set: { readAt: new Date() } });
    const counts = await computeUnreadCounts();
    return res.json({
      modifiedCount: result.modifiedCount ?? result.nModified ?? 0,
      counts,
    });
  } catch (err) {
    console.error('mark-all-read error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

router.patch('/:id', authMiddleware, async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const update = {};
    if (typeof req.body.starred === 'boolean') update.starred = req.body.starred;
    if (typeof req.body.done === 'boolean') update.done = req.body.done;
    if (typeof req.body.parseBug === 'boolean') update.parseBug = req.body.parseBug;
    if (typeof req.body.read === 'boolean') {
      update.readAt = req.body.read ? new Date() : null;
    }
    const hasThumbsUp = typeof req.body.thumbsUp === 'boolean';

    if (!Object.keys(update).length && !hasThumbsUp) {
      return res.status(400).json({ error: 'No valid fields (read, starred, done, thumbsUp, parseBug)' });
    }

    const existing = await Message.findById(id).lean();
    if (!existing) return res.status(404).json({ error: 'Message not found' });

    if (hasThumbsUp) {
      const enabled = req.body.thumbsUp;
      if (!!existing.thumbsUp !== enabled) {
        try {
          await sendThumbsUpReaction(existing, enabled);
        } catch (err) {
          console.error('thumbsUp reaction error', err);
          return res.status(503).json({
            error: err?.message || 'Failed to send WhatsApp reaction',
          });
        }
        update.thumbsUp = enabled;
      }
    }

    if (!Object.keys(update).length) {
      return res.json({ message: serializeMessage(existing) });
    }

    const saved = await Message.findByIdAndUpdate(id, { $set: update }, { new: true }).lean();
    if (!saved) return res.status(404).json({ error: 'Message not found' });
    return res.json({ message: serializeMessage(saved) });
  } catch (err) {
    console.error('message patch error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
