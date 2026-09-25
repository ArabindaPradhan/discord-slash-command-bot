# AI_NOTES.md

## AI Tools and Models Used

**Primary AI assistant:** Google Gemini (Antigravity IDE)
Used throughout the development process as a pair programmer for architecture planning, code generation, and code review.

---

## What the AI Handled

- Generating boilerplate Express/TypeScript project structure based on requirements
- Writing parameterized SQL queries for repositories
- Drafting the Ed25519 signature verification middleware (initial version)
- Creating Jest test scaffolding with mocked modules
- Drafting the CSS design system (dark mode, Discord color palette)
- Generating the migration runner script logic
- Writing initial versions of all controllers and services

---

## What the Developer Handled

- **Architecture decisions** (detailed in next section)
- Reviewing every piece of AI-generated code for correctness, security, and alignment with requirements
- Adjusting the idempotency implementation — AI initially generated a SELECT-then-INSERT pattern
- Catching the `captureRawBody` sequencing issue (described in "Hardest Bug" below)
- Ensuring webhook URL is never returned to the frontend (AI initially included it in server responses)
- Writing and validating the security checklist
- Setting up real Discord application credentials and end-to-end testing
- Configuring deployment environments and verifying public reachability

---

## 2–3 Important Architecture Decisions Made by the Developer

### 1. Idempotency via DB Constraint, Not Application-Level SELECT
The assessment required deduplication of Discord interactions. AI's first suggestion was a SELECT-then-INSERT pattern:
```
SELECT WHERE interaction_id = X → if none, INSERT
```
This is a classic TOCTOU race condition — two concurrent requests for the same interaction could both pass the SELECT and then both INSERT. The correct approach is:
- Attempt `INSERT` directly
- Catch PostgreSQL error code `23505` (unique_violation)
- If duplicate, return the existing row without re-executing business logic

The `UNIQUE` constraint on `interactions.interaction_id` is the authoritative guard; the application check is a courtesy.

### 2. Raw Body Capture Before JSON Parsing for Discord Signature
Discord's Ed25519 signature is computed over the raw request body bytes. If Express parses JSON first, the raw bytes are consumed and unavailable. The solution was:
- Skip `express.json()` for the `/api/v1/discord/interactions` route entirely
- Apply custom `captureRawBody` middleware that collects raw Buffer chunks before anything else
- Parse JSON manually from the buffer inside the middleware, making both `req.rawBody` (Buffer) and `req.body` (object) available

This is critical — re-stringifying the parsed JSON produces different byte sequences and will always fail signature verification.

### 3. Webhook URL Access Separation
The mirror webhook URL is sensitive and must never reach the frontend. The design decision:
- All public `SELECT` queries for `discord_servers` explicitly exclude `mirror_webhook_url`
- Only `getWebhookUrl(serverId)` fetches the URL, used exclusively on the server for outgoing webhook calls
- Frontend dashboard shows `"Mirror: Configured"` boolean only — never the URL
- Saving a new webhook URL is a one-way operation; the response does not echo it back

---

## The Hardest Bug (AI-Caused)

**Issue:** Discord was rejecting the interactions endpoint with `INVALID_INTERACTION_APPLICATION_ID`.

**Root cause identified by developer:** The AI generated the app factory (`app.ts`) with `express.json()` applied globally before the Discord interactions route. This meant that for the interactions endpoint:
1. `express.json()` consumed and parsed the request body (destroying the raw bytes)
2. `captureRawBody` was called but `req` was already in a consumed state — it emitted no `data` events
3. `req.rawBody` was an empty Buffer
4. The Ed25519 signature was computed over empty bytes → always invalid → HTTP 401 back to Discord

**How it was identified:**
Added debug logging to print `req.rawBody.length` before the signature verification step. Observed it was always `0`. Traced back to the middleware order in `app.ts` and confirmed that `express.json()` was draining the stream first.

**How it was fixed:**
Added a path-based conditional in the body parser middleware to skip `express.json()` for `POST /api/v1/discord/interactions`:
```typescript
app.use((req, res, next) => {
  if (req.path === '/api/v1/discord/interactions' && req.method === 'POST') {
    return next();
  }
  express.json({ limit: '1mb' })(req, res, next);
});
```
`captureRawBody` then correctly collects the stream and parses JSON manually.

---

## What Would Be Improved With More Time

1. **Discord OAuth2 "Add to Bot" flow** — currently uses manual guild ID entry. Full OAuth2 callback would be cleaner UX.
2. **Real-time dashboard updates** — WebSocket or Server-Sent Events to push new interactions to the dashboard without page refresh.
3. **AI processing with retry and circuit breaker** — current AI stub has basic error handling; a proper circuit breaker pattern would prevent cascading failures if the AI provider is unreliable.
4. **Interaction modal UI** — the stretch goal button/modal interactions need a polished implementation with proper state management.
5. **Comprehensive E2E tests** — Playwright tests that exercise the full dashboard flow, not just API security.
6. **Webhook replay queue** — if the mirror webhook fails, queue it for retry rather than marking it permanently failed.
