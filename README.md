# wa-relay

WhatsApp (Baileys) → Node backend (MongoDB, Docker) → Android APK / iOS / **web admin** (FCM + Socket.io).

Incoming matches are parsed for transfer **from / to / price** (`jobs`) via local rules + optional Flan-T5 model (`ml/`).

**Warning:** Baileys is unofficial and may violate WhatsApp ToS. Do not use your primary phone number.

## Quick start (backend)

```bash
cp .env.example .env
# edit JWT_SECRET, MONGO_ROOT_PASSWORD, MONGODB_URI, and PATTERNS
docker compose up --build
```

- API: http://localhost:4500
- Web admin: http://localhost:5173
- Job extract model: http://localhost:8000/health
- QR login: http://localhost:4500/qr (HTTP Basic Auth by default — same username/password as app users; set `QR_BASIC_AUTH=false` to disable)
- Health: http://localhost:4500/health
- MongoDB (auth): `localhost:27018` — URI like `mongodb://wa_relay:<password>@HOST:27018/wa-relay?authSource=admin`

### Job extract (from / to / price)

1. Export silver dataset from a Mongo dump or live DB:

```bash
cd backend
npm run dataset:export -- --in ../../messages.json --out ../ml/data
# or: npm run dataset:export -- --mongo --out ../ml/data
```

2. Train + eval (see [`ml/README.md`](ml/README.md)):

```bash
cd ml
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
python train.py --train data/train.jsonl --val data/val.jsonl --out artifacts/model
```

3. **Live extract order:** `GEMINI_API_KEY` (Gemini Flash) → `OWN_MODEL_URL` (local Flan-T5) → `rules_v1`.  
   Google AI Pro subscription does **not** replace an AI Studio API key — set `GEMINI_API_KEY` in `.env`.

4. Backfill existing rows: `npm run jobs:backfill` (add `--force` to rewrite all).

### Web admin (local)

```bash
cd web
npm install
npm run dev
```

Login with the same JWT user as the apps. Empty API host = Vite proxy to `:4500`.

`MONGO_INITDB_*` credentials apply only on a **fresh** Mongo volume. If `mongo_data` already exists without auth, recreate it (`docker compose down` then remove the volume) before enabling auth.

### Auth

- `POST /auth/register` `{ "username", "password" }`
- `POST /auth/login` `{ "username", "password" }` → `{ token, user }`

Create a user from the console (same rules: username ≥3, password ≥6):

```bash
# local (from backend/)
npm run user:create -- admin secret123

# docker
docker compose exec backend npm run user:create -- admin secret123
```

That account also works for QR Basic Auth at `/qr`.

### Protected (Bearer JWT)

- `GET /messages?limit=40&before=<messageId>` — cursor page (`hasMore`, `nextCursor`)
- `POST /devices/register` `{ "fcmToken", "platform": "android" | "ios" }`
- `POST /test/inject` `{ "text", "senderPhone?" }` — simulate a matched message (dev/test)
- Socket.io: connect with `auth: { token }`, event `message:matched`

## Android

Open `android/` in Android Studio (Gradle wrapper included).

1. Settings → set backend host (`http://10.0.2.2:3000` emulator, or PC LAN IP for a device)
2. Register / Login
3. Matched messages appear via Socket.io (and FCM when configured)
4. **Open in WhatsApp** uses `waLink` (`https://wa.me/<phone>`)

For real FCM: add `android/app/google-services.json` and set `FCM_*` in `.env`, then rebuild backend.

## iOS

Source: `ios/WaRelay.xcodeproj` (SwiftUI, iOS 16+).

### No Mac? Cloud build

Native iOS **cannot** be compiled on Windows. Use a cloud Mac runner:

1. Push this repo to GitHub (remote is required)
2. Actions → **iOS Build** runs on `macos-14` (Xcode 15.4) and uploads `WaRelay-ios-simulator` zip
3. Optional: [Codemagic](https://codemagic.io) with [`codemagic.yaml`](codemagic.yaml)

**Real iPhone install (Windows):** cloud must produce a **signed `.ipa`**, then install with [Sideloadly](https://sideloadly.io) (or TestFlight). That needs an Apple Developer account + signing secrets — see [`ios/README.md`](ios/README.md).

Simulator `.app` artifacts do **not** install on a physical iPhone.

### With a Mac

1. Open `ios/WaRelay.xcodeproj` in Xcode
2. Settings → backend host (`http://127.0.0.1:3000` Simulator, or PC LAN IP for a device)
3. Login with an existing backend user

### iOS push note

- **Foreground:** Socket.IO `message:matched`
- **Background (no Firebase):** set `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID`, `APNS_KEY_P8` (or `APNS_KEY_PATH`) in `.env` — see [`ios/README.md`](ios/README.md). The app registers the native APNs device token.
- **Android:** still uses FCM (`FCM_*` + `google-services.json`).
