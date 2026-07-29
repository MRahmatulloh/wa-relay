# wa-relay

WhatsApp (Baileys) → Node backend (MongoDB, Docker) → Android APK (FCM + Socket.io).

**Warning:** Baileys is unofficial and may violate WhatsApp ToS. Do not use your primary phone number.

## Quick start (backend)

```bash
cp .env.example .env
# edit JWT_SECRET and PATTERNS
docker compose up --build
```

- API: http://localhost:3000
- QR login: http://localhost:3000/qr
- Health: http://localhost:3000/health

### Auth

- `POST /auth/register` `{ "username", "password" }`
- `POST /auth/login` `{ "username", "password" }` → `{ token, user }`

### Protected (Bearer JWT)

- `GET /messages?limit=50`
- `POST /devices/register` `{ "fcmToken", "platform": "android" }`
- `POST /test/inject` `{ "text", "senderPhone?" }` — simulate a matched message (dev/test)
- Socket.io: connect with `auth: { token }`, event `message:matched`

## Android

Open `android/` in Android Studio (Gradle wrapper included).

1. Settings → set backend host (`http://10.0.2.2:3000` emulator, or PC LAN IP for a device)
2. Register / Login
3. Matched messages appear via Socket.io (and FCM when configured)
4. **Open in WhatsApp** uses `waLink` (`https://wa.me/<phone>`)

For real FCM: add `android/app/google-services.json` and set `FCM_*` in `.env`, then rebuild backend.
