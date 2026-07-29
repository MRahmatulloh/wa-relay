import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema(
  {
    messageId: { type: String, required: true, unique: true },
    text: { type: String, required: true },
    senderPhone: { type: String, default: null },
    senderName: { type: String, default: null },
    chatId: { type: String, required: true },
    isGroup: { type: Boolean, default: false },
    waLink: { type: String, default: null },
    matchedPattern: { type: String, default: null },
    timestamp: { type: Date, required: true },
  },
  { timestamps: true }
);

messageSchema.index({ createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);
