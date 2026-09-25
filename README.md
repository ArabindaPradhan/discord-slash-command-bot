# Discord Bot Dashboard

A production-quality Discord slash-command bot with a full-stack admin dashboard.
Built for the Abstrabit Technologies take-home engineering assessment.

## Architecture

```
Browser (React SPA)
        |
        | HTTPS
        v
Express API (Node.js + TypeScript)
        |
        +──── POST /api/v1/discord/interactions  ←── Discord sends interactions
        |          │
        |          ├── Ed25519 signature verified (tweetnacl)
        |          ├── PING → type:1 response
        |          └── Slash command → process → respond → async mirror webhook
        |
        +──── Auth APIs       (login/logout/me)
        +──── Dashboard APIs  (stats, interactions, commands)
        +──── Server APIs     (connect server, configure webhook)
        |
        v
PostgreSQL (Neon)
```

## Features

### Core
- ✅ Admin authentication with bcrypt passwords and session tokens
- ✅ Discord server connection and management
- ✅ `/status` slash command
- ✅ `/report <text>` slash command
- ✅ Ed25519 signature verification for every interaction
- ✅ Discord PING handling
- ✅ Interaction deduplication (DB UNIQUE constraint + error code 23505)
- ✅ Mirror notifications via Discord webhook
- ✅ Dashboard: stats, interaction history, command configuration
- ✅ Command enable/disable and response template configuration
- ✅ Structured logging (Winston)
- ✅ Rate limiting, CORS, Helmet security headers

### Stretch (planned for later phases)
- 🔜 AI processing of `/report` with Gemini (Phase 7)
- 🔜 Interactive button components (Phase 7)
- 🔜 Discord OAuth2 "Add to Server" flow (Phase 9)
- 🔜 Multi-server improvements

## Local Setup

### Prerequisites
- Node.js 20+
- PostgreSQL 14+ (or Neon free tier)

### 1. Clone and install

```bash
git clone <repo-url>
cd discord-bot-dashboard

# Install backend
cd backend
npm install

# Install frontend
cd ../frontend
npm install
```

### 2. Configure environment

```bash
# Copy example — fill in your values
cp backend/.env.example backend/.env
```

Edit `backend/.env` — see **Environment Variables** below.

### 3. Run database migrations

```bash
cd backend
npm run migrate
```

### 4. Register Discord slash commands

```bash
cd backend
npm run discord:register
```

### 5. Start the application

```bash
# Terminal 1 — backend
cd backend
npm run dev

# Terminal 2 — frontend
cd frontend
npm run dev
```

Frontend: http://localhost:5173
Backend: http://localhost:3001
Health: http://localhost:3001/health

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NODE_ENV` | Yes | `development` or `production` |
| `PORT` | No | Backend port (default: 3001) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `ADMIN_EMAIL` | Optional | Admin account email for production seed |
| `ADMIN_PASSWORD` | Optional | Admin account password for production seed |
| `SESSION_TTL_HOURS` | No | Session cookie TTL in hours (default: 24) |
| `DISCORD_APPLICATION_ID` | Yes | From Discord Developer Portal |
| `DISCORD_PUBLIC_KEY` | Yes | From Discord Developer Portal |
| `DISCORD_BOT_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `DISCORD_TEST_GUILD_ID` | Dev | Guild ID for instant command registration |
| `DISCORD_CLIENT_ID` | OAuth | For Discord OAuth2 Add to Server flow |
| `DISCORD_CLIENT_SECRET` | OAuth | For Discord OAuth2 Add to Server flow |
| `MIRROR_DISCORD_WEBHOOK_URL` | Optional | Default mirror webhook (can also set per-server in dashboard) |
| `AI_PROVIDER` | Stretch | `gemini` or `groq` |
| `AI_API_KEY` | Stretch | AI provider API key |
| `FRONTEND_URL` | Yes | CORS origin (e.g., http://localhost:5173) |

## Database Setup

1. Create a PostgreSQL database (locally or on Neon)
2. Set `DATABASE_URL` in `.env`
3. Run: `cd backend && npm run migrate`

Migrations are in `backend/migrations/` and are applied in order.
The `schema_migrations` table tracks which have been applied.

## Discord Developer Portal Setup

Follow these exact steps to connect your bot:

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications).
2. Click **New Application** and enter a name (e.g. `Bot Dashboard`).
3. Under **General Information**:
   - Copy the **Application ID** → set as `DISCORD_APPLICATION_ID` in `.env`.
   - Copy the **Public Key** → set as `DISCORD_PUBLIC_KEY` in `.env`.
4. Under **Bot**:
   - Click **Reset Token** or create a bot token.
   - Copy the **Bot Token** → set as `DISCORD_BOT_TOKEN` in `.env`.
5. Under **OAuth2 → URL Generator**:
   - Scopes: select `bot` and `applications.commands`.
   - Bot Permissions: select `Send Messages`, `Embed Links`, `Use Slash Commands`.
   - Copy the generated URL and open it in your browser to invite the bot to your Discord server.
6. Copy your test server's **Guild ID** (Enable Developer Mode in Discord settings -> Right-click server -> Copy Server ID) → set as `DISCORD_TEST_GUILD_ID` in `.env`.
7. Run migrations and register slash commands:
   ```bash
   cd backend
   npm run migrate
   npm run discord:register
   ```
8. Set the **Interactions Endpoint URL**:
   - Production: `https://<your-backend-domain>/api/v1/discord/interactions`
   - Local Development (using Cloudflare Tunnel, see below): `https://<tunnel-domain>/api/v1/discord/interactions`
   - Discord will immediately issue a `PING` request; if configured properly, it will respond with `{ type: 1 }` and display **"All changes saved!"**.

### Local Development Tunnel (Free Option)

Discord requires a publicly reachable HTTPS endpoint to deliver interactions. To test locally:

1. Install Cloudflare Tunnel (`cloudflared`):
   - Windows: `winget install --id Cloudflare.cloudflared` or download binary from GitHub.
2. Run tunnel targeting backend port `3001`:
   ```bash
   cloudflared tunnel --url http://localhost:3001
   ```
3. Copy the output HTTPS URL (e.g. `https://random-name.trycloudflare.com`).
4. Paste `https://random-name.trycloudflare.com/api/v1/discord/interactions` into the Discord Developer Portal **Interactions Endpoint URL**.

### Global vs Guild Slash Commands

- **Guild commands** (development): `npm run discord:register` (uses `DISCORD_TEST_GUILD_ID` configured in `.env`) — registers commands in your test guild instantly.

## Deployment

### Database — Neon (recommended)
1. Create a project at https://neon.tech
2. Copy the connection string to `DATABASE_URL`

### Backend — Render
1. Connect your GitHub repo to Render
2. Create a new **Web Service** pointed at `backend/`
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Set all environment variables in Render dashboard
6. Copy the Render URL → set as Discord Interactions Endpoint

### Frontend — Vercel
1. Connect your GitHub repo to Vercel
2. Set root directory to `frontend/`
3. Set `VITE_API_URL` if needed (defaults to relative `/api`)

## Testing

### Evaluator Test Flow

1. **Login**: Open the deployed frontend → sign in with `admin@example.com` / `Admin@123`
2. **Connect Discord server**: Settings page → enter your Guild ID and name
3. **Configure webhook**: Settings page → paste a Discord webhook URL for mirror channel
4. **Register commands**: Settings → click "Register commands" for your server
5. **Run /status**: In Discord server → type `/status` → should respond immediately
6. **Run /report**: In Discord server → type `/report Something is broken` → should respond and mirror to the webhook channel
7. **Check dashboard**: Dashboard page → see interaction counts and history
8. **View interaction detail**: Click any row to see action logs
9. **Configure command**: Commands page → change response template → run command again

### Automated Tests

```bash
cd backend
npm test
```

Tests run without a real database (mocked). They verify:
- Valid Ed25519 signature → passes
- Invalid signature → 401
- Missing headers → 401
- Discord PING → returns `{ type: 1 }`
- Unauthenticated dashboard access → 401

## Security

### Signature Verification
Every Discord interaction is verified using Ed25519 before any business logic runs.
The raw request body (never re-stringified JSON) is used for verification.

### Idempotency
Discord interaction IDs have a `UNIQUE` database constraint.
Duplicate interactions are caught at the DB level (PostgreSQL error 23505),
not just with an application-level SELECT check.

### Secret Management
- Bot token, public key, webhook URL, and AI key never reach the frontend
- Passwords are hashed with bcrypt (12 rounds)
- Session tokens are stored as SHA-256 hashes in the database
- `.env` is git-ignored; only `.env.example` (no real values) is committed

## Throwaway Admin Account

For evaluation:
- Email: `admin@example.com`
- Password: `Admin@123`

> ⚠️ Change this password immediately after evaluation. In production, delete this seed user and create your own.

## Contributing

See [AGENTS.md](./AGENTS.md) for coding conventions and architecture rules.
