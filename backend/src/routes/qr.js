import { Router } from 'express';
import { getConnectionStatus, getQrDataUrl } from '../services/baileys.js';

const router = Router();

router.get('/', (req, res) => {
  const status = getConnectionStatus();
  const qr = getQrDataUrl();
  if (status === 'open') {
    return res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><title>WA Relay QR</title></head>
<body style="font-family:sans-serif;text-align:center;padding:2rem">
  <h1>WhatsApp connected</h1>
  <p>Session is active. No QR needed.</p>
</body></html>`);
  }
  if (!qr) {
    return res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>WA Relay QR</title></head>
<body style="font-family:sans-serif;text-align:center;padding:2rem">
  <h1>Waiting for QR…</h1>
  <p>Status: ${status}. This page refreshes automatically.</p>
</body></html>`);
  }
  return res.type('html').send(`<!doctype html>
<html><head><meta charset="utf-8"><meta http-equiv="refresh" content="20"><title>WA Relay QR</title></head>
<body style="font-family:sans-serif;text-align:center;padding:2rem">
  <h1>Scan with WhatsApp</h1>
  <p>Linked devices → Link a device</p>
  <img alt="QR" src="${qr}" style="width:280px;height:280px" />
</body></html>`);
});

router.get('/status', (req, res) => {
  res.json({ status: getConnectionStatus(), hasQr: Boolean(getQrDataUrl()) });
});

export default router;
