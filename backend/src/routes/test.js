import { Router } from 'express';
import { Message } from '../models/Message.js';
import { authMiddleware } from '../middleware/auth.js';
import { sendMatchedPush } from '../services/fcm.js';

/** Dev/helper: inject a matched message (simulates Baileys pattern hit). */
export function createTestRoutes(broadcastMatched) {
  const router = Router();

  router.post('/inject', authMiddleware, async (req, res) => {
    try {
      const text = String(req.body.text || 'urgent test message');
      const senderPhone = req.body.senderPhone ? String(req.body.senderPhone) : '998901234567';
      const senderName = req.body.senderName ? String(req.body.senderName) : 'Test Sender';
      const messageId = `test-${Date.now()}`;
      const waLink = `https://wa.me/${senderPhone}`;
      const saved = await Message.create({
        messageId,
        text,
        senderPhone,
        senderName,
        chatId: `${senderPhone}@s.whatsapp.net`,
        isGroup: false,
        waLink,
        matchedPattern: 'test-inject',
        timestamp: new Date(),
      });
      const payload = {
        id: saved._id.toString(),
        messageId: saved.messageId,
        text: saved.text,
        senderPhone: saved.senderPhone,
        senderName: saved.senderName,
        chatId: saved.chatId,
        isGroup: saved.isGroup,
        waLink: saved.waLink,
        matchedPattern: saved.matchedPattern,
        timestamp: saved.timestamp,
        createdAt: saved.createdAt,
      };
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
