import mongoose from 'mongoose';

const deviceSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    fcmToken: { type: String, required: true },
    platform: { type: String, default: 'android' },
  },
  { timestamps: true }
);

deviceSchema.index({ userId: 1, fcmToken: 1 }, { unique: true });

export const Device = mongoose.model('Device', deviceSchema);
