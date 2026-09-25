# API Documentation

Base URL: `/api/v1`

All authenticated endpoints require either:
- `Authorization: Bearer <token>` header, OR
- `session_token` HttpOnly cookie (set automatically on login)

All responses follow the shape:
```json
{
  "success": true,
  "data": {}
}
```
Or on error:
```json
{
  "success": false,
  "error": "Human-readable error message"
}
```

---

## Authentication

### POST /api/v1/auth/login

Login with email and password.

**Request:**
```json
{
  "email": "admin@example.com",
  "password": "Admin@123"
}
```

**Response (200):**
```json
{
  "success": true,
  "data": {
    "user": {
      "public_id": "uuid",
      "email": "admin@example.com",
      "role": "admin"
    },
    "token": "hex-string",
    "expiresAt": "2024-01-01T00:00:00.000Z"
  }
}
```

Sets `session_token` HttpOnly cookie.

---

### POST /api/v1/auth/logout

Invalidate the current session.

**Auth:** Required

**Response (200):**
```json
{ "success": true, "message": "Logged out successfully" }
```

---

### GET /api/v1/auth/me

Get current authenticated user.

**Auth:** Required

**Response (200):**
```json
{
  "success": true,
  "data": {
    "public_id": "uuid",
    "email": "admin@example.com",
    "role": "admin"
  }
}
```

---

## Dashboard

### GET /api/v1/dashboard/stats

Get aggregate statistics.

**Auth:** Required (admin)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "total": 42,
    "completed": 38,
    "failed": 2,
    "duplicate": 2,
    "byCommand": [
      { "command_name": "status", "count": 25 },
      { "command_name": "report", "count": 17 }
    ]
  }
}
```

---

### GET /api/v1/interactions

List interactions with pagination.

**Auth:** Required (admin)

**Query parameters:**
- `page` (default: 1)
- `limit` (default: 50, max: 100)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "interaction_id": "1234567890",
      "discord_server_id": 1,
      "command_name": "status",
      "interaction_type": 2,
      "user_id": "987654321",
      "username": "JohnDoe",
      "input_text": null,
      "status": "completed",
      "response_status": "sent",
      "mirror_status": "sent",
      "error_message": null,
      "received_at": "2024-01-01T12:00:00.000Z",
      "completed_at": "2024-01-01T12:00:00.123Z"
    }
  ],
  "total": 42,
  "page": 1,
  "limit": 50
}
```

---

### GET /api/v1/interactions/:id

Get a single interaction with its action logs.

**Auth:** Required (admin)

**Response (200):**
```json
{
  "success": true,
  "data": {
    "interaction": { /* Interaction object */ },
    "actionLogs": [
      {
        "id": 1,
        "interaction_id": 1,
        "action_type": "discord_response",
        "status": "success",
        "details": { "content": "System is operational." },
        "error_message": null,
        "created_at": "2024-01-01T12:00:00.000Z"
      }
    ]
  }
}
```

---

## Commands

### GET /api/v1/commands

List all command configurations grouped by server.

**Auth:** Required (admin)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "server": {
        "id": 1,
        "public_id": "uuid",
        "guild_id": "123456789",
        "guild_name": "My Server",
        "bot_configured": true,
        "mirror_webhook_configured": true
      },
      "configs": [
        {
          "id": 1,
          "public_id": "uuid",
          "discord_server_id": 1,
          "command_name": "status",
          "enabled": true,
          "response_template": "System is operational. ✅",
          "mirror_enabled": true,
          "ai_enabled": false
        }
      ]
    }
  ]
}
```

---

### PATCH /api/v1/commands/:id

Update a command configuration. `:id` is the `public_id` UUID.

**Auth:** Required (admin)

**Request (partial update — all fields optional):**
```json
{
  "enabled": true,
  "response_template": "All systems operational.",
  "mirror_enabled": false,
  "ai_enabled": false
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { /* Updated CommandConfig object */ }
}
```

---

## Discord

### POST /api/v1/discord/interactions

**Public endpoint** — called by Discord for all interaction events.

**Headers (required):**
- `X-Signature-Ed25519`: Ed25519 signature hex string
- `X-Signature-Timestamp`: Unix timestamp string

**Security:** Ed25519 signature is verified before any processing.
Invalid or missing signatures return HTTP 401.

**PING (type 1) request:**
```json
{ "type": 1, "id": "...", "application_id": "...", "token": "...", "version": 1 }
```

**PING response:**
```json
{ "type": 1 }
```

**Slash command (type 2) request:**
```json
{
  "type": 2,
  "id": "interaction-snowflake",
  "application_id": "...",
  "guild_id": "guild-snowflake",
  "data": { "name": "status", "id": "..." },
  "member": { "user": { "id": "...", "username": "..." } },
  "token": "...",
  "version": 1
}
```

**Slash command response:**
```json
{
  "type": 4,
  "data": { "content": "System is operational. ✅" }
}
```

---

### GET /api/v1/discord/servers

List connected Discord servers.

**Auth:** Required (admin)

**Response (200):**
```json
{
  "success": true,
  "data": [
    {
      "id": 1,
      "public_id": "uuid",
      "guild_id": "123456789",
      "guild_name": "My Server",
      "bot_configured": true,
      "mirror_webhook_configured": true,
      "created_at": "...",
      "updated_at": "..."
    }
  ]
}
```

Note: `mirror_webhook_url` is **never** returned.

---

### POST /api/v1/discord/servers

Connect a Discord server.

**Auth:** Required (admin)

**Request:**
```json
{
  "guild_id": "123456789012345678",
  "guild_name": "My Discord Server"
}
```

**Response (201):**
```json
{
  "success": true,
  "data": { /* DiscordServer object (without webhook URL) */ }
}
```

---

### PATCH /api/v1/discord/servers/:id

Update server configuration. `:id` is the `public_id` UUID.

**Auth:** Required (admin)

**Request:**
```json
{
  "mirror_webhook_url": "https://discord.com/api/webhooks/..."
}
```

**Response (200):**
```json
{
  "success": true,
  "data": { /* Updated server (webhook URL omitted) */ }
}
```

Note: Setting `mirror_webhook_url` to `null` removes the webhook.
The webhook URL is never echoed back in the response.

---

### POST /api/v1/discord/register-commands

Register slash commands with Discord.

**Auth:** Required (admin)

**Request (optional):**
```json
{ "guild_id": "123456789012345678" }
```

If `guild_id` is omitted, uses the `DISCORD_TEST_GUILD_ID` environment variable or registers globally.

**Response (200):**
```json
{ "success": true, "message": "Commands registered successfully" }
```
