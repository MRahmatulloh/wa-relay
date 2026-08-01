import fs from 'fs';
import http2 from 'http2';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { Device } from '../models/Device.js';

let ready = false;
let cachedJwt = null;
let cachedJwtExp = 0;

export function initApns() {
  const { keyId, teamId, bundleId, keyP8, keyPath } = config.apns;
  const key = resolveKey(keyP8, keyPath);
  if (!keyId || !teamId || !bundleId || !key) {
    console.warn(
      'APNs disabled: set APNS_KEY_ID, APNS_TEAM_ID, APNS_BUNDLE_ID, and APNS_KEY_P8 (or APNS_KEY_PATH)',
    );
    ready = false;
    return;
  }
  ready = true;
  console.log(
    `APNs initialized (topic=${bundleId}, host=${config.apns.production ? 'production' : 'sandbox'})`,
  );
}

export function isApnsReady() {
  return ready;
}

/** Apple device tokens are hex (usually 64 chars). */
export function isApnsDeviceToken(token) {
  return typeof token === 'string' && /^[0-9a-f]{64,}$/i.test(token.trim());
}

function resolveKey(keyP8, keyPath) {
  if (keyP8 && keyP8.includes('BEGIN PRIVATE KEY')) return keyP8;
  if (keyPath) {
    try {
      return fs.readFileSync(keyPath, 'utf8');
    } catch (err) {
      console.error('APNs key file read failed', err.message);
    }
  }
  return '';
}

function apnsJwt() {
  const now = Math.floor(Date.now() / 1000);
  if (cachedJwt && cachedJwtExp - 60 > now) return cachedJwt;
  const key = resolveKey(config.apns.keyP8, config.apns.keyPath);
  cachedJwt = jwt.sign(
    { iss: config.apns.teamId, iat: now },
    key,
    {
      algorithm: 'ES256',
      header: { alg: 'ES256', kid: config.apns.keyId },
      expiresIn: '50m',
    },
  );
  cachedJwtExp = now + 50 * 60;
  return cachedJwt;
}

function host() {
  return config.apns.production
    ? 'https://api.push.apple.com'
    : 'https://api.sandbox.push.apple.com';
}

function buildPayload(message) {
  const senderLabel = message.senderName || message.senderPhone || 'WA Relay';
  const groupLabel = message.isGroup && message.groupName ? String(message.groupName).trim() : '';
  const title = groupLabel ? `${senderLabel} · ${groupLabel}` : senderLabel;
  const body = String(message.text || '').slice(0, 180);
  return {
    aps: {
      alert: { title, body },
      sound: 'default',
      badge: 1,
    },
    messageId: String(message.messageId || ''),
    folder: String(message.folder || 'others'),
    waLink: String(message.waLink || ''),
  };
}

function sendOne(client, token, payload, bearer) {
  return new Promise((resolve) => {
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${bearer}`,
      'apns-topic': config.apns.bundleId,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
    });
    let status = 0;
    let raw = '';
    req.on('response', (headers) => {
      status = Number(headers[':status'] || 0);
    });
    req.on('data', (chunk) => {
      raw += chunk;
    });
    req.on('end', () => {
      let reason = '';
      try {
        reason = JSON.parse(raw || '{}').reason || '';
      } catch {
        reason = raw;
      }
      resolve({ token, status, reason, ok: status === 200 });
    });
    req.on('error', (err) => {
      resolve({ token, status: 0, reason: err.message, ok: false });
    });
    req.end(JSON.stringify(payload));
  });
}

/**
 * Send alert pushes to iOS APNs device tokens.
 * @param {string[]} tokens hex device tokens
 */
export async function sendApnsToTokens(tokens, message) {
  if (!ready || !tokens.length) return { successCount: 0, failureCount: 0 };

  const unique = [...new Set(tokens.map((t) => String(t).trim().toLowerCase()).filter(isApnsDeviceToken))];
  if (!unique.length) return { successCount: 0, failureCount: 0 };

  const payload = buildPayload(message);
  const bearer = apnsJwt();
  const client = http2.connect(host());
  client.on('error', (err) => console.error('APNs http2 error', err.message));

  try {
    const results = [];
    for (const token of unique) {
      results.push(await sendOne(client, token, payload, bearer));
    }

    const successCount = results.filter((r) => r.ok).length;
    const failureCount = results.length - successCount;
    console.log(`APNs send: success=${successCount} failure=${failureCount} tokens=${unique.length}`);

    const bad = results
      .filter((r) => !r.ok && ['BadDeviceToken', 'Unregistered', 'DeviceTokenNotForTopic'].includes(r.reason))
      .map((r) => r.token);

    results.filter((r) => !r.ok).forEach((r) => {
      console.warn('APNs fail', r.status, r.reason, r.token.slice(0, 12) + '…');
    });

    if (bad.length) {
      // Stored tokens may be mixed case; delete case-insensitively via regex alternatives.
      await Device.deleteMany({
        platform: 'ios',
        fcmToken: { $in: [...bad, ...bad.map((t) => t.toUpperCase())] },
      });
    }

    return { successCount, failureCount };
  } finally {
    client.close();
  }
}
