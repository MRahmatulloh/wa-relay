import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import path from 'path';
import pino from 'pino';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { Message, serializeMessage } from '../models/Message.js';
import { matchPattern } from './patterns.js';
import { extractJobs } from './jobExtract.js';
import { enrichJobsGeo } from './jobDistance.js';
import { sendMatchedPush } from './fcm.js';

let sock = null;
let latestQrDataUrl = null;
let connectionStatus = 'starting';
let broadcastFn = null;

/** chatId -> { name, expires } */
const groupNameCache = new Map();
const GROUP_NAME_TTL_MS = 30 * 60 * 1000;

const logger = pino({ level: 'silent' });

export function setBroadcast(fn) {
  broadcastFn = fn;
}

export function getQrDataUrl() {
  return latestQrDataUrl;
}

export function getConnectionStatus() {
  return connectionStatus;
}

function phoneFromJid(jid) {
  if (!jid) return null;
  // @lid is WhatsApp Linked ID, not a dialable phone number
  if (String(jid).endsWith('@lid')) return null;
  const base = jid.split('@')[0] || '';
  const user = base.split(':')[0];
  if (/^\d{7,15}$/.test(user)) return user;
  return null;
}

/** Prefer PN JIDs (senderPn/participantPn); never treat @lid digits as phone. */
function resolveSenderPhone(msg, senderJid, isGroup) {
  const candidates = [
    isGroup ? msg.key?.participantPn : null,
    msg.key?.senderPn,
    msg.key?.participantPn,
    senderJid,
  ].filter(Boolean);
  for (const jid of candidates) {
    const phone = phoneFromJid(jid);
    if (phone) return phone;
  }
  return null;
}

function extractText(msg) {
  const m = msg.message;
  if (!m) return null;
  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  return null;
}

async function resolveGroupName(chatId) {
  if (!chatId?.endsWith('@g.us') || !sock) return null;
  const cached = groupNameCache.get(chatId);
  if (cached && cached.expires > Date.now()) return cached.name;
  try {
    const meta = await sock.groupMetadata(chatId);
    const name = meta?.subject?.trim() || null;
    groupNameCache.set(chatId, { name, expires: Date.now() + GROUP_NAME_TTL_MS });
    return name;
  } catch (err) {
    console.error('groupMetadata error', err.message);
    return cached?.name || null;
  }
}

async function handleIncoming(msg) {
  if (!msg.message || msg.key.fromMe) return;
  const text = extractText(msg)?.trim();
  if (!text) return;

  const match = matchPattern(text);
  if (!match) return;
  const { matchedPattern, folder } = match;

  const chatId = msg.key.remoteJid;
  const isGroup = chatId?.endsWith('@g.us') || false;
  let senderJid = msg.key.participant || msg.key.remoteJid;
  if (isGroup && msg.key.participant) {
    senderJid = msg.key.participant;
  }
  const senderPhone = resolveSenderPhone(msg, senderJid, isGroup);
  const senderName = msg.pushName || null;
  const groupName = isGroup ? await resolveGroupName(chatId) : null;
  const messageId = msg.key.id || `${chatId}-${msg.messageTimestamp}`;
  const participantJid = isGroup && msg.key.participant ? msg.key.participant : null;
  const waLink = senderPhone ? `https://wa.me/${senderPhone}` : null;
  const timestamp = new Date(Number(msg.messageTimestamp) * 1000 || Date.now());

  if (config.dedupeWindowMs > 0) {
    const windowStart = new Date(Date.now() - config.dedupeWindowMs);
    const senderFilter = senderPhone
      ? { senderPhone }
      : isGroup && participantJid
        ? { participantJid }
        : { chatId, isGroup: false };
    const dup = await Message.findOne({
      text,
      ...senderFilter,
      timestamp: { $gte: windowStart },
    })
      .select({ _id: 1 })
      .lean();
    if (dup) {
      console.log('skip duplicate message', { messageId, senderPhone, chatId });
      return;
    }
  }

  const extracted = await extractJobs(text);
  let jobs = extracted.jobs;
  try {
    jobs = await enrichJobsGeo(jobs);
  } catch (err) {
    console.error('job distance enrich error', err?.message || err);
  }

  let saved;
  try {
    saved = await Message.findOneAndUpdate(
      { messageId },
      {
        messageId,
        text,
        senderPhone,
        senderName,
        groupName,
        chatId,
        isGroup,
        participantJid,
        waLink,
        matchedPattern,
        folder,
        jobs,
        parseStatus: extracted.parseStatus,
        parseSource: extracted.parseSource,
        timestamp,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err?.code === 11000) return;
    throw err;
  }

  const payload = serializeMessage(saved);

  if (broadcastFn) broadcastFn(payload);
  sendMatchedPush(payload).catch((err) => console.error('FCM send error', err.message));
}

/**
 * Send or remove a 👍 reaction on the original WhatsApp message.
 * @param {{ chatId: string, messageId: string, isGroup?: boolean, participantJid?: string|null }} msg
 * @param {boolean} enabled
 */
export async function sendThumbsUpReaction(msg, enabled) {
  if (!sock || connectionStatus !== 'open') {
    throw new Error('WhatsApp is not connected');
  }
  const chatId = msg.chatId;
  const messageId = msg.messageId;
  if (!chatId || !messageId) {
    throw new Error('Missing chatId or messageId');
  }
  const key = {
    remoteJid: chatId,
    id: messageId,
    fromMe: false,
  };
  if (msg.isGroup && msg.participantJid) {
    key.participant = msg.participantJid;
  } else if (msg.isGroup) {
    throw new Error('Missing participantJid for group reaction');
  }
  await sock.sendMessage(chatId, {
    react: {
      text: enabled ? '👍' : '',
      key,
    },
  });
}

function clearAuthDir() {
  try {
    // Docker mounts baileys_auth as a volume — remove contents, not the mountpoint.
    fs.mkdirSync(config.baileysAuthDir, { recursive: true });
    for (const name of fs.readdirSync(config.baileysAuthDir)) {
      fs.rmSync(path.join(config.baileysAuthDir, name), { recursive: true, force: true });
    }
    console.log('Cleared baileys_auth — will request a new QR');
  } catch (err) {
    console.error('Failed to clear baileys auth', err.message);
  }
}

function endSocket() {
  if (!sock) return;
  try {
    sock.ev.removeAllListeners();
    sock.end(undefined);
  } catch {
    // ignore teardown errors
  }
  sock = null;
}

export async function startBaileys() {
  endSocket();
  fs.mkdirSync(config.baileysAuthDir, { recursive: true });
  const { state, saveCreds } = await useMultiFileAuthState(config.baileysAuthDir);
  const { version } = await fetchLatestBaileysVersion();

  sock = makeWASocket({
    version,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger),
    },
    logger,
    printQRInTerminal: false,
    syncFullHistory: false,
    markOnlineOnConnect: false,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      connectionStatus = 'qr';
      latestQrDataUrl = await QRCode.toDataURL(qr);
      console.log('WhatsApp QR ready — open /qr');
    }
    if (connection === 'open') {
      connectionStatus = 'open';
      latestQrDataUrl = null;
      console.log('WhatsApp connected');
    }
    if (connection === 'close') {
      connectionStatus = 'close';
      latestQrDataUrl = null;
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const loggedOut = statusCode === DisconnectReason.loggedOut;
      console.log('WhatsApp closed', statusCode, 'loggedOut=', loggedOut);
      if (loggedOut) {
        // Stale creds never emit a QR — wipe session and start fresh.
        clearAuthDir();
      }
      setTimeout(() => startBaileys().catch(console.error), loggedOut ? 1000 : 3000);
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify' && type !== 'append') return;
    for (const msg of messages) {
      try {
        await handleIncoming(msg);
      } catch (err) {
        console.error('message handle error', err);
      }
    }
  });

  sock.ev.on('groups.update', (updates) => {
    for (const u of updates || []) {
      const id = u?.id;
      if (!id?.endsWith('@g.us')) continue;
      if (typeof u.subject === 'string' && u.subject.trim()) {
        groupNameCache.set(id, {
          name: u.subject.trim(),
          expires: Date.now() + GROUP_NAME_TTL_MS,
        });
      }
    }
  });

  return sock;
}
