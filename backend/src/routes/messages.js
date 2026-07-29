import { Router } from 'express';
import { Message } from '../models/Message.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const messages = await Message.find().sort({ createdAt: -1 }).limit(limit).lean();
    return res.json({
      messages: messages.map((m) => ({
        id: m._id.toString(),
        messageId: m.messageId,
        text: m.text,
        senderPhone: m.senderPhone,
        senderName: m.senderName,
        chatId: m.chatId,
        isGroup: m.isGroup,
        waLink: m.waLink,
        matchedPattern: m.matchedPattern,
        timestamp: m.timestamp,
        createdAt: m.createdAt,
      })),
    });
  } catch (err) {
    console.error('messages error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
