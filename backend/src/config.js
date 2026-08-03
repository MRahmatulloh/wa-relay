import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config({ path: path.resolve(process.cwd(), '../.env') });
dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const config = {
  port: Number(process.env.PORT || 3000),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/wa-relay',
  jwtSecret: process.env.JWT_SECRET || 'dev-insecure-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  baileysAuthDir: process.env.BAILEYS_AUTH_DIR || path.join(__dirname, '..', 'baileys_auth'),
  patternsEnv: process.env.PATTERNS || '',
  patternsFile: process.env.PATTERNS_FILE || path.join(__dirname, '..', 'config', 'patterns.json'),
  /** Skip same sender+text within this window (ms). Default 10 minutes. */
  dedupeWindowMs: Math.max(0, Number(process.env.DEDUPE_WINDOW_MS) || 10 * 60 * 1000),
  /** Local job-extract model (FastAPI). Empty = skip. */
  ownModelUrl: String(process.env.OWN_MODEL_URL || '').trim(),
  ownModelTimeoutMs: Math.max(200, Number(process.env.OWN_MODEL_TIMEOUT_MS) || 2500),
  /** Gemini API (AI Studio key). Preferred over local model when set. */
  geminiApiKey: String(process.env.GEMINI_API_KEY || '').trim(),
  geminiModel: String(process.env.GEMINI_MODEL || 'gemini-2.0-flash').trim(),
  geminiTimeoutMs: Math.max(500, Number(process.env.GEMINI_TIMEOUT_MS) || 8000),
  /** QR page HTTP Basic Auth. Default on; set QR_BASIC_AUTH=false to disable. */
  qrBasicAuth: !['0', 'false', 'no', 'off'].includes(
    String(process.env.QR_BASIC_AUTH ?? 'true').toLowerCase(),
  ),
  fcm: {
    projectId: process.env.FCM_PROJECT_ID || '',
    clientEmail: process.env.FCM_CLIENT_EMAIL || '',
    privateKey: (process.env.FCM_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
  /** Direct Apple Push (iOS) — no Firebase required when these are set. */
  apns: {
    keyId: process.env.APNS_KEY_ID || '',
    teamId: process.env.APNS_TEAM_ID || '',
    bundleId: process.env.APNS_BUNDLE_ID || 'com.warelay.app',
    keyP8: (process.env.APNS_KEY_P8 || '').replace(/\\n/g, '\n'),
    keyPath: process.env.APNS_KEY_PATH || '',
    production: ['1', 'true', 'yes', 'on'].includes(
      String(process.env.APNS_PRODUCTION || '').toLowerCase(),
    ),
  },
};
