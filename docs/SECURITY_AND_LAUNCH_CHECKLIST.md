# Security and launch checklist

## Must complete before public launch
- [ ] Use Supabase Anonymous Auth; never trust a client-generated device UUID as identity.
- [ ] Confirm RLS is enabled on every exposed table and test as two different users.
- [ ] Keep service-role key and Cloudinary API secret out of client bundles and Git.
- [ ] Add Cloudflare rate limiting for sign-in, posts, connection requests, messages, reports,
      and upload signing. Add per-user quotas and abuse telemetry.
- [ ] Add database constraints / transactional RPC for connection acceptance and chat creation.
- [ ] Enforce block relationships across feed, search, connections, and chat.
- [ ] Add automated text/image moderation plus a human moderation queue and escalation SLA.
- [ ] Add admin-only review access using a separate server-side role; never expose admin keys.
- [ ] Add pagination caps, request body size limits, schema validation, and structured logs.
- [ ] Restrict Cloudinary upload types, dimensions, file size, folders, and transformations.
- [ ] Add account deletion and retention workflows, privacy policy, terms, community rules.
- [ ] Decide age gate and campus verification. Anonymous social products need strong safety controls.
- [ ] Test CORS, auth expiry, SQL injection attempts, IDOR, spam, duplicate requests, and RLS.
- [ ] Set alerts, backups, database monitoring, and an incident response process.

## Architecture note
The API uses Supabase Auth's `/auth/v1/user` endpoint to validate each bearer token.
PostgREST requests use the user's JWT plus the public anon key so RLS is applied.
Do not replace this with the service-role key as a shortcut.
