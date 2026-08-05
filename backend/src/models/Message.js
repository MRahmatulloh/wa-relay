import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema(
  {
    from: { type: String, default: null },
    to: { type: String, default: null },
    price: { type: Number, default: null },
    currency: { type: String, default: 'GBP' },
    fromLat: { type: Number, default: null },
    fromLng: { type: Number, default: null },
    toLat: { type: Number, default: null },
    toLng: { type: Number, default: null },
    distanceMiles: { type: Number, default: null },
    pricePerMile: { type: Number, default: null },
  },
  { _id: false },
);

const messageSchema = new mongoose.Schema(
  {
    messageId: { type: String, required: true, unique: true },
    text: { type: String, required: true },
    senderPhone: { type: String, default: null },
    senderName: { type: String, default: null },
    groupName: { type: String, default: null },
    chatId: { type: String, required: true },
    isGroup: { type: Boolean, default: false },
    waLink: { type: String, default: null },
    matchedPattern: { type: String, default: null },
    folder: { type: String, default: 'others' },
    jobs: { type: [jobSchema], default: [] },
    parseStatus: { type: String, default: 'empty' },
    parseSource: { type: String, default: null },
    parseBug: { type: Boolean, default: false },
    timestamp: { type: Date, required: true },
    readAt: { type: Date, default: null },
    starred: { type: Boolean, default: false },
    done: { type: Boolean, default: false },
    thumbsUp: { type: Boolean, default: false },
    participantJid: { type: String, default: null },
  },
  { timestamps: true }
);

messageSchema.index({ createdAt: -1, _id: -1 });
messageSchema.index({ folder: 1, createdAt: -1, _id: -1 });
messageSchema.index({ starred: 1, createdAt: -1 });
messageSchema.index({ done: 1, createdAt: -1 });
messageSchema.index({ readAt: 1, createdAt: -1 });
messageSchema.index({ thumbsUp: 1, createdAt: -1 });
messageSchema.index({ text: 1, senderPhone: 1, timestamp: -1 });
messageSchema.index({ text: 1, participantJid: 1, timestamp: -1 });
messageSchema.index({ parseStatus: 1, createdAt: -1 });
messageSchema.index({ parseBug: 1, createdAt: -1 });

export const Message = mongoose.model('Message', messageSchema);

export function serializeMessage(m) {
  return {
    id: m._id.toString(),
    messageId: m.messageId,
    text: m.text,
    senderPhone: m.senderPhone,
    senderName: m.senderName,
    groupName: m.groupName || null,
    chatId: m.chatId,
    isGroup: !!m.isGroup,
    waLink: m.waLink,
    matchedPattern: m.matchedPattern,
    folder: m.folder || 'others',
    jobs: Array.isArray(m.jobs)
      ? m.jobs.map((j) => ({
          from: j.from || null,
          to: j.to || null,
          price: j.price == null ? null : Number(j.price),
          currency: j.currency || 'GBP',
          fromLat: j.fromLat == null ? null : Number(j.fromLat),
          fromLng: j.fromLng == null ? null : Number(j.fromLng),
          toLat: j.toLat == null ? null : Number(j.toLat),
          toLng: j.toLng == null ? null : Number(j.toLng),
          distanceMiles: j.distanceMiles == null ? null : Number(j.distanceMiles),
          pricePerMile: j.pricePerMile == null ? null : Number(j.pricePerMile),
        }))
      : [],
    parseStatus: m.parseStatus || 'empty',
    parseSource: m.parseSource || null,
    parseBug: !!m.parseBug,
    timestamp: m.timestamp,
    createdAt: m.createdAt,
    readAt: m.readAt || null,
    starred: !!m.starred,
    done: !!m.done,
    thumbsUp: !!m.thumbsUp,
    participantJid: m.participantJid || null,
  };
}
