import admin from 'firebase-admin';
import { config } from '../config.js';
import { Device } from '../models/Device.js';

let ready = false;

export function initFcm() {
  const { projectId, clientEmail, privateKey } = config.fcm;
  if (!projectId || !clientEmail || !privateKey) {
    console.warn('FCM disabled: missing FCM_PROJECT_ID / FCM_CLIENT_EMAIL / FCM_PRIVATE_KEY');
    ready = false;
    return;
  }
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert({
          projectId,
          clientEmail,
          privateKey,
        }),
      });
    }
    ready = true;
    console.log('FCM initialized');
  } catch (err) {
    console.error('FCM init failed', err.message);
    ready = false;
  }
}

export function isFcmReady() {
  return ready;
}

export async function sendMatchedPush(message) {
  if (!ready) return;
  const devices = await Device.find().lean();
  const tokens = [...new Set(
    devices
      .map((d) => d.fcmToken)
      .filter((t) => t && !String(t).startsWith('local-'))
  )];
  if (!tokens.length) {
    console.warn('FCM skip: no valid device tokens');
    return;
  }

  const data = {
    messageId: String(message.messageId || ''),
    text: String(message.text || '').slice(0, 900),
    senderPhone: String(message.senderPhone || ''),
    senderName: String(message.senderName || ''),
    chatId: String(message.chatId || ''),
    waLink: String(message.waLink || ''),
    isGroup: String(!!message.isGroup),
    matchedPattern: String(message.matchedPattern || ''),
    folder: String(message.folder || 'others'),
  };

  // notification payload → system tray even if app process is dead (needed on MuMu).
  // data payload → available when user opens the app / onMessageReceived in foreground.
  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: {
      title: message.senderName || message.senderPhone || 'WA Relay',
      body: String(message.text || '').slice(0, 180),
    },
    data,
    android: {
      priority: 'high',
      ttl: 60 * 60 * 1000,
      notification: {
        channelId: 'wa_relay_messages',
        icon: 'ic_notification',
        sound: 'default',
        defaultVibrateTimings: true,
        visibility: 'public',
        priority: 'high',
      },
    },
  });

  console.log(
    'FCM send:',
    `success=${response.successCount}`,
    `failure=${response.failureCount}`,
    `tokens=${tokens.length}`
  );
  response.responses.forEach((r, i) => {
    if (!r.success) {
      console.warn('FCM fail', i, r.error?.code, r.error?.message);
    }
  });

  const bad = [];
  response.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code || '';
      if (code.includes('registration-token-not-registered') || code.includes('invalid-argument')) {
        bad.push(tokens[i]);
      }
    }
  });
  if (bad.length) {
    await Device.deleteMany({ fcmToken: { $in: bad } });
  }
}
