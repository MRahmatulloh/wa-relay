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
  /** QR page HTTP Basic Auth. Default on; set QR_BASIC_AUTH=false to disable. */
  qrBasicAuth: !['0', 'false', 'no', 'off'].includes(
    String(process.env.QR_BASIC_AUTH ?? 'true').toLowerCase(),
  ),
  fcm: {
    projectId: process.env.FCM_PROJECT_ID || '',
    clientEmail: process.env.FCM_CLIENT_EMAIL || '',
    privateKey: (process.env.FCM_PRIVATE_KEY || '').replace(/\\n/g, '\n'),
  },
};
