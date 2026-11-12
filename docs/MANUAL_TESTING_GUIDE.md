# Manual Testing Guide with Real Supabase

This guide walks you through comprehensive manual testing of the Sway backend using a real Supabase instance.

## Prerequisites

### Required Accounts
- [ ] Supabase account (free tier is fine)
- [ ] Cloudinary account
- [ ] Two test devices or browsers (for User A and User B testing)

### Setup Checklist
- [ ] Node.js 18+ installed
- [ ] Git repository cloned
- [ ] Dependencies installed (`npm install`)

## Step 1: Create Test Supabase Project

### 1.1 Create Project
1. Go to [https://supabase.com](https://supabase.com)
2. Click "New Project"
3. Project name: `sway-test-[your-name]`
4. Database password: Generate and save securely
5. Region: Choose closest to you
6. Wait for project to provision (~2 minutes)

### 1.2 Note Credentials
1. Go to Project Settings → API
2. Copy and save:
   - Project URL: `https://xxx.supabase.co`
   - Anon public key: `eyJ...`
   - Service role key: `eyJ...` (keep secret!)

### 1.3 Run Migrations
1. Go to SQL Editor in Supabase dashboard
2. Create new query
3. Copy contents of `supabase/migrations/0001_initial_schema.sql`
4. Click "Run"
5. Verify: Should see "Success. No rows returned"
6. Repeat for `supabase/migrations/0002_accept_connection_rpc.sql`

### 1.4 Enable Anonymous Auth
1. Go to Authentication → Providers
2. Find "Anonymous sign-ins"
3. Toggle to "Enabled"
4. Click "Save"

### 1.5 Configure Realtime
1. Go to Database → Replication
2. Find `supabase_realtime` publication
3. Click on it
4. Ensure `messages` table is checked
5. Click "Save"

## Step 2: Configure Cloudinary

### 2.1 Get Credentials
1. Log in to Cloudinary dashboard
2. Go to Dashboard
3. Note:
   - Cloud name
   - API Key
   - API Secret

### 2.2 Create Upload Preset
1. Go to Settings → Upload
2. Click "Add upload preset"
3. Preset name: `sway_test`
4. Signing Mode: **Signed**
5. Folder: `sway` (or empty, we'll use dynamic folders)
6. Allowed formats: `jpg,png,webp`
7. Max file size: `5000000` (5MB)
8. Click "Save"

## Step 3: Configure Local Environment

### 3.1 Create .dev.vars
```bash
# Copy example
cp .dev.vars.example .dev.vars

# Edit .dev.vars
```

Add your credentials:
```
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
CLOUDINARY_API_SECRET=your_cloudinary_api_secret_here
```

### 3.2 Update wrangler.toml
Edit the [vars] section:
```toml
[vars]
SUPABASE_URL = "https://YOUR_PROJECT_REF.supabase.co"
CLOUDINARY_CLOUD_NAME = "YOUR_CLOUD_NAME"
CLOUDINARY_API_KEY = "YOUR_API_KEY"
CLOUDINARY_UPLOAD_PRESET = "sway_test"
ALLOWED_ORIGINS = "http://localhost:8081,http://localhost:5173,http://localhost:3000"
```

### 3.3 Start Dev Server
```bash
npm run dev
```

Should see:
```
⛅️ wrangler 4.4.0
Ready on http://localhost:8787
```

### 3.4 Test Health Endpoint
```bash
curl http://localhost:8787/health
```

Expected response:
```json
{"status":"ok","service":"sway-backend"}
```

## Step 4: Set Up Test Users

### 4.1 Install Supabase Client Locally
For testing, we'll use a simple Node.js script:

```bash
npm install -g @supabase/supabase-js
```

Create `test-auth.js`:
```javascript
const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  'https://YOUR_PROJECT.supabase.co',
  'YOUR_ANON_KEY'
);

async function createAnonymousUser() {
  const { data, error } = await supabase.auth.signInAnonymously();
  if (error) {
    console.error('Error:', error);
    return;
  }
  console.log('User created:');
  console.log('User ID:', data.user.id);
  console.log('Access Token:', data.session.access_token);
}

createAnonymousUser();
```

### 4.2 Create User A
```bash
node test-auth.js
```

Save the output:
```
User ID: 123e4567-e89b-12d3-a456-426614174000
Access Token: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 4.3 Create User B
Run the script again:
```bash
node test-auth.js
```

Save User B's credentials separately.

## Step 5: Manual Test Scenarios

### Test 1: Profile Management

**5.1 Get Profile (User A)**
```bash
curl -X GET http://localhost:8787/api/me \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Origin: http://localhost:3000"
```

✅ Expected: `{"profile":{"id":"...","username":null,"created_at":"..."}}`  
❌ If error: Check token, origin, auth middleware

**5.2 Set Username (User A)**
```bash
curl -X PATCH http://localhost:8787/api/me \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"username":"alice_test"}'
```

✅ Expected: `{"profile":{"id":"...","username":"alice_test","created_at":"..."}}`

**5.3 Set Username (User B)**
```bash
curl -X PATCH http://localhost:8787/api/me \
  -H "Authorization: Bearer USER_B_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"username":"bob_test"}'
```

✅ Expected: Success with username "bob_test"

**5.4 Try Invalid Username**
```bash
curl -X PATCH http://localhost:8787/api/me \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"username":"a"}'
```

✅ Expected: `400` error - "Username must be at least 2 characters"

### Test 2: Posts & Feed

**5.5 Create Post (User A)**
```bash
curl -X POST http://localhost:8787/api/posts \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"content":"Hello from User A!","tag":"General"}'
```

✅ Expected: `201` with post object  
Note the post ID for later tests

**5.6 Create Post (User B)**
```bash
curl -X POST http://localhost:8787/api/posts \
  -H "Authorization: Bearer USER_B_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"content":"Hello from User B!","tag":"Campus"}'
```

✅ Expected: `201` with post object

**5.7 Get Feed (User A)**
```bash
curl -X GET "http://localhost:8787/api/posts?limit=20&offset=0" \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Origin: http://localhost:3000"
```

✅ Expected: Both posts visible in feed

**5.8 Test Pagination**
```bash
curl -X GET "http://localhost:8787/api/posts?limit=1&offset=0" \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Origin: http://localhost:3000"
```

✅ Expected: Only 1 post returned

**5.9 Try Invalid Post**
```bash
curl -X POST http://localhost:8787/api/posts \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"content":""}'
```

✅ Expected: `400` error - validation failed

### Test 3: Connection Workflow

**5.10 Send Connection Request (A → B)**
```bash
curl -X POST http://localhost:8787/api/connections \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"receiver_id":"USER_B_ID"}'
```

✅ Expected: `201` with connection object, status "pending"  
Note the connection ID

**5.11 Try Duplicate Request**
```bash
# Run same command as 5.10 again
```

✅ Expected: `409` error - duplicate connection

**5.12 Try Self-Connection**
```bash
curl -X POST http://localhost:8787/api/connections \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"receiver_id":"USER_A_ID"}'
```

✅ Expected: `400` error - cannot connect to yourself

**5.13 View Connections (User B)**
```bash
curl -X GET http://localhost:8787/api/connections \
  -H "Authorization: Bearer USER_B_TOKEN" \
  -H "Origin: http://localhost:3000"
```

✅ Expected: Connection from User A visible

**5.14 Accept Connection (User B)**
```bash
curl -X PATCH http://localhost:8787/api/connections/CONNECTION_ID \
  -H "Authorization: Bearer USER_B_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"status":"accepted"}'
```

✅ Expected: `200` with connection object (status "accepted") AND `conversation_id`  
⚠️ **CRITICAL**: This must return a conversation_id. If not, RPC function failed.

Note the conversation_id for messaging tests.

**5.15 Try to Accept Again**
```bash
# Run same command as 5.14 again
```

✅ Expected: Error - request not pending

### Test 4: Messaging

**5.16 List Conversations (User A)**
```bash
curl -X GET http://localhost:8787/api/conversations \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Origin: http://localhost:3000"
```

✅ Expected: One conversation with User B

**5.17 List Conversations (User B)**
```bash
curl -X GET http://localhost:8787/api/conversations \
  -H "Authorization: Bearer USER_B_TOKEN" \
  -H "Origin: http://localhost:3000"
```

✅ Expected: Same conversation visible

**5.18 Send Message (User A → B)**
```bash
curl -X POST http://localhost:8787/api/conversations/CONVERSATION_ID/messages \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"body":"Hey Bob, this is Alice!"}'
```

✅ Expected: `201` with message object

**5.19 Get Messages (User B)**
```bash
curl -X GET http://localhost:8787/api/conversations/CONVERSATION_ID/messages \
  -H "Authorization: Bearer USER_B_TOKEN" \
  -H "Origin: http://localhost:3000"
```

✅ Expected: Alice's message visible

**5.20 Reply (User B → A)**
```bash
curl -X POST http://localhost:8787/api/conversations/CONVERSATION_ID/messages \
  -H "Authorization: Bearer USER_B_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"body":"Hi Alice! Nice to connect!"}'
```

✅ Expected: `201` with message object

**5.21 Try Unauthorized Access**

Create User C:
```bash
node test-auth.js
```

Try to access A-B conversation:
```bash
curl -X GET http://localhost:8787/api/conversations/CONVERSATION_ID/messages \
  -H "Authorization: Bearer USER_C_TOKEN" \
  -H "Origin: http://localhost:3000"
```

✅ Expected: `403` error - not a member

### Test 5: Blocking

**5.22 Block User (A blocks B)**
```bash
curl -X POST http://localhost:8787/api/blocks \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"blocked_user_id":"USER_B_ID"}'
```

✅ Expected: `201` with block object

**5.23 Verify Feed Filtering (User A)**
```bash
curl -X GET "http://localhost:8787/api/posts?limit=20&offset=0" \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Origin: http://localhost:3000"
```

✅ Expected: User B's posts NOT visible

**5.24 Try Connection After Block (B → A)**
```bash
curl -X POST http://localhost:8787/api/connections \
  -H "Authorization: Bearer USER_B_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"receiver_id":"USER_A_ID"}'
```

✅ Expected: `403` error - cannot send connection

### Test 6: Reporting

**5.25 Report Post**
```bash
curl -X POST http://localhost:8787/api/reports \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"target_type":"post","target_id":"POST_ID","reason":"Spam","details":"This is spam content"}'
```

✅ Expected: `201` with report object

**5.26 Report Profile**
```bash
curl -X POST http://localhost:8787/api/reports \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"target_type":"profile","target_id":"USER_B_ID","reason":"Harassment"}'
```

✅ Expected: `201` with report object

### Test 7: Cloudinary Upload

**5.27 Get Upload Signature**
```bash
curl -X POST http://localhost:8787/api/uploads/sign \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Origin: http://localhost:3000"
```

✅ Expected: Object with:
- `cloud_name`
- `api_key`
- `timestamp`
- `folder` (should include user ID)
- `signature`
- `upload_preset`
- `allowed_formats`
- `max_file_size`

**5.28 Test Upload to Cloudinary**

Use the signature from 5.27 to upload an image:
```bash
curl -X POST "https://api.cloudinary.com/v1_1/YOUR_CLOUD_NAME/image/upload" \
  -F "file=@test-image.jpg" \
  -F "timestamp=TIMESTAMP_FROM_5.27" \
  -F "folder=FOLDER_FROM_5.27" \
  -F "upload_preset=PRESET_FROM_5.27" \
  -F "signature=SIGNATURE_FROM_5.27" \
  -F "api_key=API_KEY_FROM_5.27"
```

✅ Expected: Upload succeeds, returns image URL

**5.29 Create Post with Image**
```bash
curl -X POST http://localhost:8787/api/posts \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"content":"Check out this image!","image_url":"CLOUDINARY_URL_FROM_5.28","tag":"Photos"}'
```

✅ Expected: `201` - post created with image

**5.30 Try Invalid Cloudinary URL**
```bash
curl -X POST http://localhost:8787/api/posts \
  -H "Authorization: Bearer USER_A_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Origin: http://localhost:3000" \
  -d '{"content":"Test","image_url":"https://example.com/image.jpg","tag":"Test"}'
```

✅ Expected: `400` error - invalid Cloudinary URL

### Test 8: Rate Limiting

**5.31 Test Post Rate Limit**

Run this command 11 times rapidly (limit is 10/hour):
```bash
for i in {1..11}; do
  curl -X POST http://localhost:8787/api/posts \
    -H "Authorization: Bearer USER_A_TOKEN" \
    -H "Content-Type: application/json" \
    -H "Origin: http://localhost:3000" \
    -d "{\"content\":\"Post number $i\"}"
  sleep 1
done
```

✅ Expected: First 10 succeed, 11th returns `429` Rate limit exceeded

### Test 9: Database Verification

**5.32 Check Supabase Dashboard**

Go to Supabase Dashboard → Table Editor:

1. **profiles** table: Should see User A and User B
2. **posts** table: Should see all created posts
3. **connections** table: Should see A-B connection (status: accepted)
4. **conversations** table: Should see one conversation
5. **conversation_members** table: Should see 2 rows (A and B)
6. **messages** table: Should see messages from both users
7. **reports** table: Should see reports created
8. **blocks** table: Should see A blocking B

### Test 10: RLS Verification

**5.33 Try Direct Database Access**

Go to Supabase → SQL Editor:

```sql
-- This should fail (RLS prevents it)
SELECT * FROM profiles;
```

✅ Expected: Empty result or error (RLS protecting data)

```sql
-- This should work (using service role)
SELECT * FROM profiles;
-- Run with "Run as service_role" toggle
```

✅ Expected: All profiles visible

## Test Results Template

```markdown
# Manual Test Results

Date: YYYY-MM-DD
Tester: [Your Name]
Environment: Local dev server + Supabase test project

## Summary
- Total Tests: 33
- Passed: X
- Failed: X
- Blocked: X

## Test Results

### Profile Management
- [✅] Get profile (5.1)
- [✅] Set username (5.2, 5.3)
- [✅] Invalid username rejected (5.4)

### Posts & Feed
- [✅] Create posts (5.5, 5.6)
- [✅] Get feed (5.7)
- [✅] Pagination (5.8)
- [✅] Invalid post rejected (5.9)

### Connection Workflow
- [✅] Send request (5.10)
- [✅] Duplicate rejected (5.11)
- [✅] Self-connection rejected (5.12)
- [✅] View connections (5.13)
- [✅] Accept creates conversation (5.14) ⚠️ CRITICAL
- [✅] Re-accept rejected (5.15)

### Messaging
- [✅] List conversations (5.16, 5.17)
- [✅] Send message (5.18)
- [✅] Receive message (5.19)
- [✅] Reply (5.20)
- [✅] Unauthorized access blocked (5.21)

### Blocking
- [✅] Create block (5.22)
- [✅] Feed filtering (5.23)
- [✅] Connection prevented (5.24)

### Reporting
- [✅] Report post (5.25)
- [✅] Report profile (5.26)

### Cloudinary
- [✅] Get signature (5.27)
- [✅] Upload image (5.28)
- [✅] Post with image (5.29)
- [✅] Invalid URL rejected (5.30)

### Rate Limiting
- [✅] Rate limit enforced (5.31)

### Database Verification
- [✅] Data in correct tables (5.32)

### RLS Verification
- [✅] RLS protecting data (5.33)

## Issues Found
None / [List any issues]

## Notes
[Any observations or concerns]

## Sign-off
Backend is ready for: [ ] Production / [ ] Needs fixes

Tester Signature: _________________
Date: __________
```

## Troubleshooting

### Issue: Cannot create anonymous users
**Solution**: Ensure anonymous auth is enabled in Supabase dashboard

### Issue: Connection acceptance doesn't return conversation_id
**Solution**: Check that `0002_accept_connection_rpc.sql` migration ran successfully

### Issue: 403 errors on all routes
**Solution**: Check ALLOWED_ORIGINS in wrangler.toml matches your Origin header

### Issue: Cloudinary uploads fail
**Solution**: Verify upload preset is set to "Signed" mode, not "Unsigned"

### Issue: RLS blocking legitimate requests
**Solution**: Check that you're using anon key, not service role key

## Next Steps After Testing

Once all tests pass:
1. [ ] Document any issues found
2. [ ] Fix critical issues
3. [ ] Re-test fixed issues
4. [ ] Get sign-off from stakeholder
5. [ ] Proceed to production deployment planning
