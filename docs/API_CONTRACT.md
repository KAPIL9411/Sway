# API contract

Base URL: `https://<worker-domain>`. Protected routes require
`Authorization: Bearer <Supabase access token>` and `Content-Type: application/json`.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/health` | Worker health check |
| GET | `/api/me` | Get/create own profile |
| PATCH | `/api/me` | Set username |
| GET | `/api/posts` | Paginated latest feed (with block filtering) |
| POST | `/api/posts` | Create a post |
| GET | `/api/connections` | List requests involving current user |
| POST | `/api/connections` | Send request using `receiver_id` |
| PATCH | `/api/connections/:id` | Receiver accepts/rejects (transactional) |
| GET | `/api/conversations` | List conversations for current user |
| GET | `/api/conversations/:id/messages` | Fetch recent messages |
| POST | `/api/conversations/:id/messages` | Send message |
| POST | `/api/reports` | Report post/profile/message |
| POST | `/api/blocks` | Block user |
| POST | `/api/uploads/sign` | Request Cloudinary signed upload params |

## Request/Response Examples

### Profile Management

**PATCH /api/me** - Set username
```json
{
  "username": "coolguy123"
}
```

Response:
```json
{
  "profile": {
    "id": "uuid",
    "username": "coolguy123",
    "created_at": "2026-11-12T10:00:00Z"
  }
}
```

### Posts

**POST /api/posts** - Create a post
```json
{
  "content": "A thought for today",
  "image_url": null,
  "tag": "Campus"
}
```

**GET /api/posts** - Get feed
Query params:
- `sort`: `latest` (default)
- `limit`: 1-50 (default: 20)
- `offset`: 0-10000 (default: 0)

Response:
```json
{
  "posts": [...],
  "limit": 20,
  "offset": 0
}
```

### Connections

**POST /api/connections** - Send connection request
```json
{
  "receiver_id": "uuid"
}
```

**PATCH /api/connections/:id** - Accept or reject
```json
{
  "status": "accepted"
}
```

Response (when accepted):
```json
{
  "connection": {
    "id": "uuid",
    "sender_id": "uuid",
    "receiver_id": "uuid",
    "status": "accepted",
    "created_at": "2026-11-12T10:00:00Z"
  },
  "conversation_id": "uuid"
}
```

Response (when rejected):
```json
{
  "connection": {
    "id": "uuid",
    "status": "rejected",
    ...
  }
}
```

### Messages

**POST /api/conversations/:id/messages** - Send message
```json
{
  "body": "Hey, how are you?"
}
```

**GET /api/conversations/:id/messages** - Get messages
Query params:
- `limit`: 1-100 (default: 50)

### Safety

**POST /api/reports** - Report content
```json
{
  "target_type": "post",
  "target_id": "uuid",
  "reason": "Harassment",
  "details": "Optional additional context"
}
```

**POST /api/blocks** - Block user
```json
{
  "blocked_user_id": "uuid"
}
```

### Uploads

**POST /api/uploads/sign** - Get Cloudinary signature
No body required.

Response:
```json
{
  "cloud_name": "your-cloud",
  "api_key": "123456789",
  "timestamp": 1699876543,
  "folder": "sway/user-uuid",
  "upload_preset": "sway_preset",
  "signature": "abc123...",
  "allowed_formats": "jpg,png,webp",
  "max_file_size": 5000000,
  "resource_type": "image"
}
```

## Error Responses

All errors return JSON with an `error` field:

```json
{
  "error": "Error message here"
}
```

Common status codes:
- `400` - Validation failed, bad request
- `401` - Missing or invalid authentication
- `403` - Forbidden (authorization failed, blocked user, etc.)
- `404` - Resource not found
- `409` - Duplicate resource (e.g., username taken, duplicate connection)
- `413` - Request body too large (max 100KB)
- `429` - Rate limit exceeded (when implemented)
- `500` - Internal server error

## Implementation Status

✅ **Completed:**
- Schema validation with Zod on all inputs
- Proper error mapping from Supabase/Postgres errors
- Request body size limits (100KB)
- Transactional connection acceptance (RPC)
- Block enforcement in posts feed
- Block checking before connection requests
- Cloudinary URL validation
- TypeScript type safety

⚠️ **Partially Implemented:**
- Block enforcement in conversations (membership check only, not per-message)
- Rate limiting infrastructure (not yet active)

🚧 **Still Required:**
- Per-message block enforcement
- Rate limiting middleware
- Idempotency keys for POST operations
- Total count in pagination responses
