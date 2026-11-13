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


---

## New Endpoints (Added in Latest Update)

### Discovery

**GET /api/discovery** - Discover users
Query params:
- `limit` (1-50, default 20)
- `offset` (default 0)
- `exclude_connected` (true/false, default false)

Response:
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "user123",
      "created_at": "2026-11-12T10:00:00Z"
    }
  ],
  "count": 10
}
```

### Safety - Extended

**GET /api/blocks** - List blocked users
Response:
```json
{
  "blocks": [
    {
      "blocked_user_id": "uuid",
      "created_at": "2026-11-12T10:00:00Z",
      "profiles": {
        "username": "blocked_user"
      }
    }
  ]
}
```

**DELETE /api/blocks/:blockedUserId** - Unblock user
Response:
```json
{
  "success": true,
  "message": "User unblocked successfully"
}
```

### Connections - Extended

**DELETE /api/connections/:id** - Cancel pending connection request
(Only works for pending requests, only sender can cancel)
Response:
```json
{
  "success": true,
  "message": "Connection request cancelled"
}
```

### Posts - Extended

**PATCH /api/posts/:id** - Edit post
Request:
```json
{
  "content": "Updated post content",
  "tag": "general"
}
```
Response:
```json
{
  "post": {
    "id": "uuid",
    "content": "Updated post content",
    "tag": "general",
    "updated_at": "2026-11-12T10:05:00Z"
  }
}
```

**DELETE /api/posts/:id** - Delete post
Response:
```json
{
  "success": true,
  "message": "Post deleted successfully"
}
```

### Notifications

**GET /api/notifications** - Get user notifications
Query params:
- `limit` (1-50, default 20)
- `offset` (default 0)
- `unread_only` (true/false, default false)

Response:
```json
{
  "notifications": [
    {
      "id": "uuid",
      "user_id": "uuid",
      "type": "connection_request",
      "title": "New connection request",
      "body": "Someone wants to connect with you",
      "data": { "connection_id": "uuid" },
      "read": false,
      "created_at": "2026-11-12T10:00:00Z"
    }
  ],
  "count": 5,
  "unread_count": 2
}
```

**PATCH /api/notifications/:id/read** - Mark notification as read
Response:
```json
{
  "success": true,
  "message": "Notification marked as read"
}
```

**POST /api/notifications/read-all** - Mark all notifications as read
Response:
```json
{
  "success": true,
  "count": 5,
  "message": "All notifications marked as read"
}
```

### Admin Endpoints

All admin endpoints require the user to have an admin role in the `admin_roles` table.
Some endpoints require specific role levels (moderator < admin < superadmin).

**GET /api/admin/moderation** - Get moderation queue
Query params:
- `status` (pending/approved/removed/dismissed, default pending)
- `limit` (1-100, default 50)
- `offset` (default 0)

Response:
```json
{
  "items": [
    {
      "id": "uuid",
      "content_type": "post",
      "content_id": "uuid",
      "reporter_id": "uuid",
      "reported_user_id": "uuid",
      "reason": "spam",
      "details": "...",
      "status": "pending",
      "created_at": "2026-11-12T10:00:00Z"
    }
  ],
  "count": 10
}
```

**PATCH /api/admin/moderation/:id** - Review moderation item
Request:
```json
{
  "action": "remove",
  "notes": "Confirmed spam violation"
}
```
Response:
```json
{
  "success": true,
  "action": "remove",
  "message": "Content removed successfully"
}
```

**GET /api/admin/users** - Search users
Query params:
- `search` (username search)
- `limit` (1-100, default 50)
- `offset` (default 0)

Response:
```json
{
  "users": [
    {
      "id": "uuid",
      "username": "user123",
      "created_at": "2026-11-12T10:00:00Z"
    }
  ],
  "count": 10
}
```

**GET /api/admin/users/:id** - Get user details
Response:
```json
{
  "profile": {
    "id": "uuid",
    "username": "user123",
    "created_at": "2026-11-12T10:00:00Z"
  },
  "suspension": {
    "id": "uuid",
    "reason": "spam",
    "expires_at": "2026-11-13T10:00:00Z"
  },
  "stats": {
    "posts": 42,
    "reports": 3
  }
}
```

**POST /api/admin/users/:id/suspend** - Suspend user (requires admin role)
Request:
```json
{
  "reason": "Repeated spam violations",
  "duration_hours": 168,
  "notes": "Third offense"
}
```
Response:
```json
{
  "success": true,
  "message": "User suspended successfully",
  "expires_at": "2026-11-19T10:00:00Z"
}
```

**DELETE /api/admin/users/:id/suspend** - Lift suspension (requires admin role)
Response:
```json
{
  "success": true,
  "message": "Suspension lifted successfully"
}
```

**GET /api/admin/roles** - List all admins (requires superadmin role)
Response:
```json
{
  "admins": [
    {
      "user_id": "uuid",
      "role": "admin",
      "granted_by": "uuid",
      "granted_at": "2026-11-12T10:00:00Z",
      "profiles": {
        "username": "admin_user"
      }
    }
  ]
}
```

**POST /api/admin/roles** - Grant admin role (requires superadmin role)
Request:
```json
{
  "user_id": "uuid",
  "role": "moderator"
}
```
Response:
```json
{
  "success": true,
  "message": "moderator role granted successfully"
}
```

**DELETE /api/admin/roles/:userId** - Revoke admin role (requires superadmin role)
Response:
```json
{
  "success": true,
  "message": "Admin role revoked successfully"
}
```

---

## Content Moderation

Content moderation is now integrated into post and message creation. When enabled (via `MODERATION_ENABLED=true` and `OPENAI_API_KEY`), all text content is automatically checked using OpenAI's moderation API before being saved to the database.

Moderation actions:
- **allow**: Content passes all checks, saved normally
- **block**: Content violates guidelines, request rejected with 400 error
- **review**: Content flagged for manual review, saved but added to moderation queue

Blocked categories include hate speech, self-harm, sexual content, and violence.
