import admin from 'firebase-admin';
import { config } from '../config.js';
import { Device } from '../models/Device.js';
import { isApnsDeviceToken, isApnsReady, sendApnsToTokens } from './apns.js';

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

function pushTitleBody(message) {
  const senderLabel = message.senderName || message.senderPhone || 'WA Relay';
  const groupLabel = message.isGroup && message.groupName ? String(message.groupName).trim() : '';
  const title = groupLabel ? `${senderLabel} · ${groupLabel}` : senderLabel;
  const body = String(message.text || '').slice(0, 180);
  return { title, body };
}

async function sendFcmToTokens(tokens, message) {
  if (!ready || !tokens.length) return;

  const { title, body } = pushTitleBody(message);
  const data = {
    messageId: String(message.messageId || ''),
    text: String(message.text || '').slice(0, 900),
    senderPhone: String(message.senderPhone || ''),
    senderName: String(message.senderName || ''),
    groupName: String(message.groupName || ''),
    chatId: String(message.chatId || ''),
    waLink: String(message.waLink || ''),
    isGroup: String(!!message.isGroup),
    matchedPattern: String(message.matchedPattern || ''),
    folder: String(message.folder || 'others'),
  };

  const response = await admin.messaging().sendEachForMulticast({
    tokens,
    notification: { title, body },
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
    apns: {
      headers: { 'apns-priority': '10' },
      payload: {
        aps: {
          alert: { title, body },
          sound: 'default',
          badge: 1,
          'content-available': 1,
        },
      },
    },
  });

  console.log(
    'FCM send:',
    `success=${response.successCount}`,
    `failure=${response.failureCount}`,
    `tokens=${tokens.length}`,
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

/**
 * Push to all registered devices:
 * - iOS → direct APNs (hex device token) when APNs is configured
 * - Android / FCM tokens → Firebase Admin
 */
export async function sendMatchedPush(message) {
  const devices = await Device.find().lean();
  const iosTokens = [];
  const fcmTokens = [];

  for (const d of devices) {
    const token = String(d.fcmToken || '').trim();
    if (!token || token.startsWith('local-')) continue;
    const platform = String(d.platform || 'android').toLowerCase();
    if (platform === 'ios' || isApnsDeviceToken(token)) {
      iosTokens.push(token);
    } else {
      fcmTokens.push(token);
    }
  }

  const uniqueIos = [...new Set(iosTokens)];
  const uniqueFcm = [...new Set(fcmTokens)];

  if (!uniqueIos.length && !uniqueFcm.length) {
    console.warn('Push skip: no valid device tokens');
    return;
  }

  if (uniqueIos.length) {
    if (isApnsReady()) {
      await sendApnsToTokens(uniqueIos, message);
    } else if (ready) {
      // Fallback: FCM can deliver to iOS if the app registered an FCM token.
      console.warn('APNs not configured — sending iOS tokens via FCM (needs Firebase token, not APNs hex)');
      await sendFcmToTokens(uniqueIos.filter((t) => !isApnsDeviceToken(t)), message);
    } else {
      console.warn('APNs skip: not configured (set APNS_* env)');
    }
  }

  if (uniqueFcm.length) {
    if (ready) {
      await sendFcmToTokens(uniqueFcm, message);
    } else {
      console.warn('FCM skip: not configured');
    }
  }
}
