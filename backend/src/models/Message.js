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
    folder: { type: String, default: 'others' },
    timestamp: { type: Date, required: true },
    readAt: { type: Date, default: null },
    starred: { type: Boolean, default: false },
    done: { type: Boolean, default: false },
  },
  { timestamps: true }
);

messageSchema.index({ createdAt: -1, _id: -1 });
messageSchema.index({ folder: 1, createdAt: -1, _id: -1 });
messageSchema.index({ starred: 1, createdAt: -1 });
messageSchema.index({ done: 1, createdAt: -1 });
messageSchema.index({ readAt: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);

export function serializeMessage(m) {
  return {
    id: m._id.toString(),
    messageId: m.messageId,
    text: m.text,
    senderPhone: m.senderPhone,
    senderName: m.senderName,
    chatId: m.chatId,
    isGroup: !!m.isGroup,
    waLink: m.waLink,
    matchedPattern: m.matchedPattern,
    folder: m.folder || 'others',
    timestamp: m.timestamp,
    createdAt: m.createdAt,
    readAt: m.readAt || null,
    starred: !!m.starred,
    done: !!m.done,
  };
}
