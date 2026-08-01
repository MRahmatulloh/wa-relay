import { Router } from 'express';
import { Device } from '../models/Device.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/register', authMiddleware, async (req, res) => {
  try {
    // fcmToken kept for Android; iOS may send pushToken (APNs hex) or fcmToken.
    let fcmToken = String(req.body.fcmToken || req.body.pushToken || '').trim();
    let platform = String(req.body.platform || 'android').toLowerCase();
    if (!fcmToken) {
      return res.status(400).json({ error: 'fcmToken required' });
    }
    if (platform !== 'ios' && platform !== 'android') {
      platform = 'android';
    }
    // Normalize APNs hex for reliable lookup/delete.
    if (platform === 'ios' && /^[0-9a-fA-F]{64,}$/.test(fcmToken)) {
      fcmToken = fcmToken.toLowerCase();
    }
    const device = await Device.findOneAndUpdate(
      { userId: req.user._id, fcmToken },
      { userId: req.user._id, fcmToken, platform },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    return res.json({
      id: device._id.toString(),
      fcmToken: device.fcmToken,
      platform: device.platform,
    });
  } catch (err) {
    console.error('device register error', err);
    return res.status(500).json({ error: 'Server error' });
  }
});

export default router;
