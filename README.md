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
DISCORD_GUILD_ID=<your-guild-id> npm run register-commands
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
| `JWT_SECRET` | Yes | Random secret for session signing (32+ chars) |
| `DISCORD_APPLICATION_ID` | Yes | From Discord Developer Portal |
| `DISCORD_PUBLIC_KEY` | Yes | From Discord Developer Portal |
| `DISCORD_BOT_TOKEN` | Yes | Bot token from Discord Developer Portal |
| `DISCORD_GUILD_ID` | Dev | Guild ID for instant command registration |
| `DISCORD_CLIENT_ID` | OAuth | For future OAuth2 Add to Server flow |
| `DISCORD_CLIENT_SECRET` | OAuth | For future OAuth2 Add to Server flow |
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

## Discord Setup

1. Go to https://discord.com/developers/applications
2. Create a new application
3. Under **General Information**: copy **Application ID** and **Public Key**
4. Under **Bot**: create a bot, copy the **Token**
5. Under **OAuth2 → URL Generator**:
   - Scopes: `bot`, `applications.commands`
   - Permissions: `Send Messages`, `Use Slash Commands`
   - Copy the generated URL and use it to invite the bot to your server
6. Set `DISCORD_APPLICATION_ID`, `DISCORD_PUBLIC_KEY`, `DISCORD_BOT_TOKEN` in `.env`
7. Run `npm run migrate` to create the database tables
8. Run `npm run register-commands` to register `/status` and `/report` in your guild
9. In the Discord Developer Portal → **Interactions Endpoint URL**: set to `https://<your-backend-url>/api/v1/discord/interactions`

### Global vs Guild Commands

- **Guild commands** (development): `DISCORD_GUILD_ID=<id> npm run register-commands` — appears immediately
- **Global commands** (production): `npm run register-commands` without `DISCORD_GUILD_ID` — may take up to 1 hour

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
