---
name: WhatsApp Relay Stack
overview: Baileys + Node backend (MongoDB, Docker, user auth) matched habarlarni Android APKga FCM/Socket.io orqali yetkazadi; APKda host sozlamalari, login, va WhatsApp chat ochish tugmasi.
todos:
  - id: scaffold-repo
    content: Create wa-relay monorepo (backend + android), git, Docker Compose, move workspace root
    status: completed
  - id: backend-auth
    content: User register/login (JWT), users/devices/messages in MongoDB, auth middleware
    status: completed
  - id: backend-baileys
    content: Baileys QR session + messages.upsert + pattern filter + MongoDB persist
    status: completed
  - id: backend-push-ws
    content: Protected API, Socket.io JWT auth, FCM send, device register per user
    status: completed
  - id: docker-stack
    content: Dockerfile + docker-compose (backend, mongo), volumes for session and data
    status: completed
  - id: android-app
    content: "APK: host settings, login, message list, FCM, Socket.io, Open WhatsApp"
    status: completed
  - id: e2e-verify
    content: docker compose up → login → QR → match → push/live → wa.me open
    status: completed
isProject: false
---

# WhatsApp → Backend → APK relay

## Tanlovlar (qat’iy)
- WhatsApp: **Baileys**
- Backend: **Node.js** (Express + Socket.io + Firebase Admin FCM)
- Auth: **backendda** — register/login, bcrypt password, **JWT** (HTTP + Socket.io)
- DB: **MongoDB** (Mongoose)
- Infra: **Docker Compose** — `backend` + `mongo`
- APK: host sozlamalari + login + matched list
- Loyiha: `wa-relay` (~/Projects yoki ~/Developer, aks holda `~/wa-relay`)
- Monorepo: `backend/` + `android/` + `docker-compose.yml`

**Ogohlantirish:** Baileys norasmiy; bloklash xavfi. Asosiy shaxsiy raqamda ishlatilmasin.

## Arxitektura

```mermaid
flowchart LR
  WA[WhatsApp] --> Bail[Baileys in backend]
  Bail -->|pattern match| API[Express API]
  API --> Mongo[(MongoDB)]
  API --> FCM[Firebase FCM]
  API --> WS[Socket.io]
  APK[Android APK] -->|login JWT| API
  APK -->|host settings| APK
  FCM --> APK
  WS --> APK
  APK -->|Open chat| Intent["wa.me"]
```

## Docker

- `docker-compose.yml`: `mongo`, `backend`
- Volumes: `mongo_data`, `baileys_auth`
- Env: `MONGODB_URI`, `JWT_SECRET`, `PATTERNS`, FCM credentials
- Port: `3000`; `docker compose up --build`

## Backend auth (barcha auth shu yerda)

- Collections: `users` (email/username, passwordHash), `devices` (userId, fcmToken), `messages`
- `POST /auth/register`, `POST /auth/login` → JWT
- Himoyalangan: `GET /messages`, `POST /devices/register`, Socket.io connect
- Middleware: `Authorization: Bearer <token>`
- Socket.io: `auth.token` bilan bir xil JWT
- Seed/admin: birinchi user register orqali (v1)

## Backend WhatsApp + push

1. Baileys QR (`/qr` yoki log), session volume
2. Pattern match → `messages` ga yozish → Socket.io `message:matched` (auth’d userlarga) → FCM registered devices
3. Payload: text, senderPhone, senderName, chatId, isGroup, timestamp, messageId, waLink

## Android (`android/`)

1. **Sozlamalar ekrani (host)**
   - Backend base URL (masalan `http://192.168.x.x:3000`)
   - Saqlash: DataStore / SharedPreferences
   - Login/Socket/FCM shu URL dan foydalanadi; o‘zgarsa qayta ulanish

2. **Auth UI**
   - Login (va register, agar kerak)
   - Token local saqlash; 401 → login ga qaytarish
   - Parol/hash faqat backendda

3. FCM + Socket.io (JWT) live list
4. **“WhatsAppda ochish”** → `https://wa.me/<phone>`
5. Compose: Settings → Login → Messages

## Ishga tushirish tartibi

1. Repo + Docker + Mongo
2. Auth + Baileys + FCM/Socket
3. APK: host settings, login, list, open chat
4. E2E: compose → register/login → QR → match → push/live → WhatsApp

## Scope (v1)
- Bitta WhatsApp session (serverda)
- Faqat text + regex pattern
- Oddiy email/username + password JWT (OAuth yo‘q)
- Host URL faqat APK sozlamalarida
