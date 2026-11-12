# Sway — Product requirements (backend scope)

## Product definition
Sway is an anonymous campus/community social product centered on short confessions,
image/text posts, opt-in connection requests, and private chat after a mutual connection.

## MVP user journeys
1. User opens app; client signs in using Supabase Anonymous Auth.
2. Client calls `GET /api/me`; profile is created by the auth trigger if absent.
3. User chooses a unique 2–24 character username.
4. User browses a paginated feed and publishes text/image posts.
5. User sends a connection request to another profile.
6. Receiver accepts/rejects. A trusted backend/database workflow creates a conversation
   only after acceptance (see `docs/DATABASE_WORKFLOWS.md`).
7. Conversation members exchange messages; Supabase Realtime delivers new rows.
8. Users can report posts/profiles/messages and block other users.

## Explicitly out of scope for first backend milestone
- Campus email verification / institution-specific access
- AI moderation and image recognition
- Push notifications
- Admin dashboard
- Full-text search and ranking/trending algorithm
- Image transformations beyond Cloudinary upload and delivery
- WebRTC, voice, video, location sharing

## Product decisions required before launch
- Whether anonymous accounts can be recovered after reinstall/device change
- Whether campus membership is verified
- Age eligibility and handling of minors
- Whether usernames and posts are globally visible or campus-scoped
- Post retention, account deletion, and data export policy
- Exact connection consent and chat-unlock behavior
