import { Router } from 'express';
import { Message, serializeMessage } from '../models/Message.js';
import { authMiddleware } from '../middleware/auth.js';
import { sendMatchedPush } from '../services/fcm.js';
import { matchPattern } from '../services/patterns.js';
import { extractJobs } from '../services/jobExtract.js';
import { enrichJobsGeo } from '../services/jobDistance.js';

/** Dev/helper: inject a matched message (simulates Baileys pattern hit). */
export function createTestRoutes(broadcastMatched) {
  const router = Router();

  router.post('/inject', authMiddleware, async (req, res) => {
    try {
      const text = String(req.body.text || 'saloon LGW test message');
      const senderPhone = req.body.senderPhone ? String(req.body.senderPhone) : '998901234567';
      const senderName = req.body.senderName ? String(req.body.senderName) : 'Test Sender';
      const messageId = `test-${Date.now()}`;
      const waLink = `https://wa.me/${senderPhone}`;
      const match = matchPattern(text) || {
        matchedPattern: 'test-inject',
        folder: String(req.body.folder || 'others'),
      };
      const extracted = await extractJobs(text);
      let jobs = extracted.jobs;
      try {
        jobs = await enrichJobsGeo(jobs);
      } catch (err) {
        console.error('job distance enrich error', err?.message || err);
      }
      const saved = await Message.create({
        messageId,
        text,
        senderPhone,
        senderName,
        chatId: `${senderPhone}@s.whatsapp.net`,
        isGroup: false,
        waLink,
        matchedPattern: match.matchedPattern,
        folder: match.folder,
        jobs,
        parseStatus: extracted.parseStatus,
        parseSource: extracted.parseSource,
        timestamp: new Date(),
      });
      const payload = serializeMessage(saved);
      broadcastMatched(payload);
      sendMatchedPush(payload).catch(() => {});
      return res.status(201).json({ message: payload });
    } catch (err) {
      console.error('inject error', err);
      return res.status(500).json({ error: 'Server error' });
    }
  });

  return router;
}
