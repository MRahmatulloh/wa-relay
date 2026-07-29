import makeWASocket, {
  DisconnectReason,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  useMultiFileAuthState,
} from '@whiskeysockets/baileys';
import { Boom } from '@hapi/boom';
import fs from 'fs';
import pino from 'pino';
import QRCode from 'qrcode';
import { config } from '../config.js';
import { Message } from '../models/Message.js';
import { matchPattern } from './patterns.js';
import { sendMatchedPush } from './fcm.js';

let sock = null;
let latestQrDataUrl = null;
let connectionStatus = 'starting';
let broadcastFn = null;

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

async function handleIncoming(msg) {
  if (!msg.message || msg.key.fromMe) return;
  const text = extractText(msg);
  if (!text) return;

  const matchedPattern = matchPattern(text);
  if (!matchedPattern) return;

  const chatId = msg.key.remoteJid;
  const isGroup = chatId?.endsWith('@g.us') || false;
  let senderJid = msg.key.participant || msg.key.remoteJid;
  if (isGroup && msg.key.participant) {
    senderJid = msg.key.participant;
  }
  const senderPhone = resolveSenderPhone(msg, senderJid, isGroup);
  const senderName = msg.pushName || null;
  const messageId = msg.key.id || `${chatId}-${msg.messageTimestamp}`;
  const waLink = senderPhone ? `https://wa.me/${senderPhone}` : null;
  const timestamp = new Date(Number(msg.messageTimestamp) * 1000 || Date.now());

  let saved;
  try {
    saved = await Message.findOneAndUpdate(
      { messageId },
      {
        messageId,
        text,
        senderPhone,
        senderName,
        chatId,
        isGroup,
        waLink,
        matchedPattern,
        timestamp,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (err) {
    if (err?.code === 11000) return;
    throw err;
  }

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

  if (broadcastFn) broadcastFn(payload);
  sendMatchedPush(payload).catch((err) => console.error('FCM send error', err.message));
}

export async function startBaileys() {
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
      const statusCode = new Boom(lastDisconnect?.error)?.output?.statusCode;
      const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
      console.log('WhatsApp closed', statusCode, 'reconnect=', shouldReconnect);
      if (shouldReconnect) {
        setTimeout(() => startBaileys().catch(console.error), 3000);
      } else {
        console.log('Logged out — delete baileys_auth volume and restart to scan QR again');
      }
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

  return sock;
}
