# Backend Test Plan

## Automated Tests (✅ Implemented - 64 tests passing)

### Unit Tests
- [✅] Username validation (length, format, special characters)
- [✅] Post content validation (length, content/image requirement)
- [✅] Message validation (emptiness, length limits)
- [✅] Connection request validation (UUID format, self-connection)
- [✅] Report validation (target types, required fields)
- [✅] Block validation (UUID format, self-blocking)
- [✅] Pagination limits (defaults, boundaries)
- [✅] Cloudinary URL validation (domain, ownership)
- [✅] Error class functionality

### Integration Tests
- [✅] Health endpoint accessible without auth
- [✅] All /api/* endpoints reject missing/invalid/expired tokens
- [✅] Request body size limit enforcement (100KB)
- [✅] Origin validation (CORS)
- [✅] Validation error responses (proper status codes)
- [✅] Malformed JSON handling
- [✅] Self-connection rejection
- [✅] Self-block rejection

**Run automated tests:**
```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
```

## Manual Tests with Supabase (Use a disposable Supabase project and two anonymous test users: A and B)

### Authentication & Authorization
- [ ] `/health` returns 200 without auth.
- [ ] All `/api/*` endpoints reject missing/invalid/expired tokens.
- [ ] A can read/update A profile; A cannot update B profile.
- [ ] A can create a post as A; request cannot override `user_id`.

### Posts & Feed
- [ ] B can read public posts; B cannot edit/delete A post.
- [ ] Feed pagination works with limit and offset parameters.
- [ ] Feed is capped at 50 posts per request.
- [ ] Posts with only an image (no content) are accepted.
- [ ] Posts exceeding 2000 characters are rejected.
- [ ] Invalid Cloudinary URLs are rejected.

### Connections
- [ ] A can send one connection request to B; duplicate request is rejected.
- [ ] Only B can accept/reject A's request.
- [ ] Accepting a connection atomically creates a conversation.
- [ ] Accepting returns the conversation_id in response.
- [ ] Connection between blocked users is prevented.

### Conversations & Messages
- [ ] After acceptance, both A and B appear in conversation_members.
- [ ] A can list their conversations and see the one with B.
- [ ] Non-members cannot list or read a conversation's messages.
- [ ] Only conversation members can send messages.
- [ ] Message pagination is capped at 100.
- [ ] Messages exceeding 2000 characters are rejected.
- [ ] Empty messages are rejected.

### Safety & Moderation
- [ ] Reports are attributed to authenticated reporter, not client-supplied ID.
- [ ] A can report B's post with valid target_type and target_id.
- [ ] A can block B; blocks cannot be created against self.
- [ ] After A blocks B, B's posts do not appear in A's feed.
- [ ] A cannot send connection request to blocked user B.
- [ ] B cannot send connection request to A who blocked them.

### Cloudinary Uploads
- [ ] Upload signatures cannot be generated without auth.
- [ ] Signed upload parameters include user-specific folder.
- [ ] Upload signature includes allowed_formats and max_file_size.
- [ ] Cloudinary rejects disallowed file types (test with .exe, .pdf).
- [ ] Cloudinary rejects oversized uploads (>5MB).
- [ ] A cannot use B's Cloudinary folder URL in posts (ownership validation).

### Realtime
- [ ] Enable messages table in Supabase Realtime publication.
- [ ] A subscribes to conversation with B using conversation_id filter.
- [ ] When B sends a message, A receives it via Realtime.
- [ ] A cannot subscribe to a conversation they're not a member of (RLS blocks it).

### Edge Cases
- [ ] Pagination offset cannot exceed 10000.
- [ ] Profile username can be 2 characters (minimum).
- [ ] Profile username can be 24 characters (maximum).
- [ ] Username with invalid characters is rejected (@, spaces, etc.).
- [ ] Request body exceeding 100KB is rejected (413 status).
- [ ] Request from disallowed origin is rejected (403 status).

### Security Verification
- [ ] User ID is derived from JWT, not request body.
- [ ] Cannot create posts with another user's user_id.
- [ ] Cannot update another user's profile.
- [ ] Cannot accept/reject connection requests intended for another user.
- [ ] Cannot send messages to conversations you're not a member of.
- [ ] RLS prevents reading other users' reports and blocks.

### Error Handling
- [ ] Invalid UUID formats return 400 with clear error message.
- [ ] Duplicate connection request returns 409 conflict.
- [ ] Attempting to accept already-accepted connection returns error.
- [ ] Missing required fields return 400 with validation details.
- [ ] Database constraint violations return user-friendly messages (not raw SQL).

## Performance Tests (Not Yet Implemented)

- [ ] API handles 100 concurrent GET /api/posts requests.
- [ ] Connection acceptance completes within 500ms.
- [ ] Message sending completes within 200ms.
- [ ] Database queries use indexes (check EXPLAIN plans).
- [ ] No N+1 query problems in feed retrieval.

## Load & Stress Testing (Not Yet Implemented)

Use tools like k6, Artillery, or Apache Bench:

- [ ] 1000 requests/second to GET /api/posts (read-heavy load).
- [ ] 100 requests/second to POST /api/posts (write-heavy load).
- [ ] Graceful degradation under overload.
- [ ] No memory leaks during extended operation.

## Test Report Template

After completing manual tests, document results:

```
Test Date: YYYY-MM-DD
Tester: Name
Environment: Local/Staging
Supabase Project: [test-project-ref]

Passed: X/Y
Failed: X/Y

Failed Tests:
- Test name: Description of failure
- Test name: Steps to reproduce

Notes:
- Any observations
- Performance issues
- Suggestions
```
