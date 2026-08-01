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

  const isGroup = parseBool(query.isGroup);
  if (isGroup !== null) filter.isGroup = isGroup;

  const folder = String(query.folder || '').trim().toLowerCase();
  if (folder && folder !== 'all') {
    filter.folder = folder;
  }

  const q = String(query.q || '').trim();
  if (q) {
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [
      { text: re },
      { senderName: re },
      { senderPhone: re },
      { groupName: re },
      { matchedPattern: re },
    ];
  }

  return filter;
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
      // Combine list filter with cursor. If filter already has $or (search), use $and.
      if (filter.$or) {
        const searchOr = filter.$or;
        delete filter.$or;
        filter.$and = [{ $or: searchOr }, older];
      } else {
        Object.assign(filter, older);
      }
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

router.get('/unread-counts', authMiddleware, async (_req, res) => {
  try {
    return res.json({ counts: await computeUnreadCounts() });
  } catch (err) {
    console.error('unread-counts error', err);
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
    if (typeof req.body.read === 'boolean') {
      update.readAt = req.body.read ? new Date() : null;
    }
    const hasThumbsUp = typeof req.body.thumbsUp === 'boolean';

    if (!Object.keys(update).length && !hasThumbsUp) {
      return res.status(400).json({ error: 'No valid fields (read, starred, done, thumbsUp)' });
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
