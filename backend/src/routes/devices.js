import { Router } from 'express';
import { Device } from '../models/Device.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.post('/register', authMiddleware, async (req, res) => {
  try {
    const fcmToken = String(req.body.fcmToken || '').trim();
    const platform = String(req.body.platform || 'android');
    if (!fcmToken) {
      return res.status(400).json({ error: 'fcmToken required' });
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
