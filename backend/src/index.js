import express from 'express';
import http from 'http';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import messagesRoutes from './routes/messages.js';
import devicesRoutes from './routes/devices.js';
import qrRoutes from './routes/qr.js';
import { createTestRoutes } from './routes/test.js';
import { createSocketServer } from './socket.js';
import { initFcm } from './services/fcm.js';
import { setBroadcast, startBaileys } from './services/baileys.js';

async function main() {
  await mongoose.connect(config.mongoUri);
  console.log('MongoDB connected');

  initFcm();

  const app = express();
  app.use(cors());
  app.use(express.json({ limit: '1mb' }));

  app.get('/health', (req, res) => {
    res.json({ ok: true });
  });

  const server = http.createServer(app);
  const { broadcastMatched } = createSocketServer(server);
  setBroadcast(broadcastMatched);

  app.use('/auth', authRoutes);
  app.use('/messages', messagesRoutes);
  app.use('/devices', devicesRoutes);
  app.use('/qr', qrRoutes);
  app.use('/test', createTestRoutes(broadcastMatched));

  server.listen(config.port, () => {
    console.log(`API listening on :${config.port}`);
  });

  startBaileys().catch((err) => {
    console.error('Baileys failed to start', err);
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
