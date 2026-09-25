# AGENTS.md — Discord Bot Dashboard

This file contains coding conventions, architecture rules, and security constraints
for AI agents and human developers working on this codebase.

---

## Project Architecture

```
/
├── backend/           Node.js + TypeScript + Express API
│   ├── src/
│   │   ├── config/          Configuration + database pool
│   │   ├── controllers/     Thin HTTP handlers only
│   │   ├── middleware/       Auth, signature verification, error handling
│   │   ├── routes/          Express router definitions
│   │   ├── services/        Business logic layer
│   │   ├── repositories/    SQL data access layer
│   │   ├── integrations/
│   │   │   └── discord/     Discord API client + interaction handler
│   │   ├── scripts/         Migration runner
│   │   ├── types/           Shared TypeScript interfaces
│   │   └── utils/           Logger, sanitize helpers
│   ├── migrations/    SQL migration files (numbered, sequential)
│   └── tests/         Jest test suites
├── frontend/          React + TypeScript + Vite SPA
│   └── src/
│       ├── pages/     Full-page React components
│       ├── layouts/   Page wrappers (sidebar, nav)
│       ├── hooks/     Custom React hooks (useAuth)
│       ├── services/  API client (api.ts)
│       └── types/     Frontend-specific types
└── docs/              API documentation
```

---

## Layer Responsibility Rules

### Controllers (thin layer only)
- Validate HTTP input (presence, type)
- Call exactly one service method
- Return the response
- **Do NOT** contain business logic, SQL, or conditional branching over business rules

### Services (business logic)
- Coordinate between repositories, integrations, and external APIs
- Handle transactions (use `withTransaction`)
- Perform data transformations
- Record action logs

### Repositories (data access only)
- Contain all SQL queries
- Use parameterized queries ALWAYS — no string interpolation
- Return typed rows — no business logic
- Do not call other services

### Integrations (external APIs)
- `discord/discordApiClient.ts` — Discord REST API
- `discord/interactionHandler.ts` — Routes and handles Discord interactions

---

## TypeScript Rules

- **Strict mode is required** (`strict: true` in all tsconfigs)
- No `any` types — use `unknown` and narrow
- No `ts-ignore` or `@ts-expect-error` without documented reason
- No unused locals or parameters
- Import types explicitly where possible
- Use `interface` for shapes, `type` for unions/computed types

---

## Security Rules (NON-NEGOTIABLE)

### Secrets
- **Never** log or expose: bot token, public key, webhook URL, AI API key, passwords, session tokens
- All secrets must come from environment variables
- Secrets must never appear in API responses, frontend code, or Git history
- Webhook URL is stored in DB but never returned by any API endpoint

### Discord Interactions Endpoint
- Ed25519 signature verification happens in middleware **before** any business logic
- Raw body must be used for verification — never re-stringify parsed JSON
- Missing signature headers → HTTP 401
- Invalid signature → HTTP 401
- PING (type 1) must return `{ type: 1 }` immediately

### Idempotency
- `interaction_id` is the idempotency key
- Use `tryInsert` pattern — attempt INSERT, handle `23505` unique violation
- Do NOT rely solely on SELECT-then-INSERT (race condition)
- The `UNIQUE` constraint on `interactions.interaction_id` is the authoritative guard

### Authentication
- Session tokens are random 32-byte values
- Only the SHA-256 hash of the token is stored in the database
- Tokens are sent via HttpOnly cookie (browser) or Authorization Bearer header (API clients)
- Never store tokens in localStorage

### SQL
- All queries must use parameterized statements (`$1, $2` etc.)
- Never interpolate user input into SQL strings

---

## Database Rules

- Use `pg` driver directly — no ORM (Prisma/Sequelize/TypeORM)
- Use `withTransaction()` for multi-step operations
- Public IDs (UUIDs) in API responses — never raw integer primary keys
- Add indexes for all foreign keys and frequently-queried columns
- Migration files are append-only and numbered (001, 002, ...)
- The `schema_migrations` table tracks applied migrations

---

## API Conventions

- Base path: `/api/v1/`
- All responses: `{ success: boolean, data?: T, error?: string }`
- Paginated: add `total, page, limit` to response
- HTTP status codes:
  - `200` OK, `201` Created
  - `400` Bad Request (invalid input)
  - `401` Unauthorized (not authenticated)
  - `403` Forbidden (authenticated but insufficient role)
  - `404` Not Found
  - `500` Internal Server Error (never expose details)
- Never expose internal stack traces in error responses

---

## Testing Expectations

- Tests mock the database — no real PostgreSQL required for unit/integration tests
- Use `jest.mock()` for database and external services
- Security tests must cover:
  - Valid Ed25519 signature → passes
  - Invalid Ed25519 signature → 401
  - Missing signature headers → 401
  - Discord PING → type 1 response
  - Slash command → processes correctly
  - Duplicate interaction → idempotent (no double processing)
  - Unknown command → graceful error response
  - Disabled command → graceful error response
  - Mirror webhook failure → command still completes
  - Unauthenticated dashboard access → 401

---

## Deployment Constraints

- Backend: Render (free tier) or similar
- Frontend: Vercel/Netlify (static hosting)
- Database: Neon PostgreSQL (free tier)
- Environment variables must be set in the deployment platform — never committed
- Discord interactions endpoint must be reachable at a public HTTPS URL
- Register slash commands after deploying (guild commands for instant effect, global for production)

---

## Logging Rules

- Use structured Winston logger (`logger.info/warn/error`)
- Every log must include `operation` field
- Include `interactionId` for Discord interaction logs
- **Never log**: tokens, hashes, webhook URLs, passwords, API keys
- Use `sanitizeForLog()` for user-provided data that might contain secrets
- Production: JSON format. Development: colored simple format

---

## Dependency Policy

- No ORM (Prisma, TypeORM, Sequelize, Knex)
- No unnecessary wrapper libraries
- Prefer Node.js built-ins (https, crypto) over extra packages where practical
- All dependencies must have a clear, justified purpose
- Approved: express, pg, bcrypt, tweetnacl, winston, helmet, cors, cookie-parser, express-rate-limit, dotenv, uuid
