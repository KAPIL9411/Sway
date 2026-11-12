# Admin Dashboard Specification

This document outlines the requirements for a Sway admin dashboard for content moderation and system management.

## Overview

The admin dashboard is a separate web application that provides administrative access to:
- Review reported content
- Review flagged content from automated moderation
- Manage user accounts
- View system metrics
- Configure moderation settings

## Authentication & Authorization

### Admin Access
- Admins authenticate using a separate auth system (NOT anonymous auth)
- Use Supabase Auth with email/password for admin accounts
- Admin role stored in Supabase `auth.users` metadata
- Backend validates admin JWT on admin-only endpoints

### Admin Table Schema
```sql
-- Add to migration
create table public.admins (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('admin', 'moderator', 'super_admin')),
  created_at timestamptz not null default now(),
  last_login_at timestamptz
);

-- RLS policies
alter table public.admins enable row level security;

create policy "Only super_admins can view all admins"
  on public.admins for select
  using (
    auth.jwt() ->> 'role' = 'super_admin'
  );

create policy "Admins can view themselves"
  on public.admins for select
  using (id = auth.uid());
```

## Moderation Queue

### Queue Table Schema
```sql
create table public.moderation_queue (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('post', 'message', 'profile')),
  content_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('auto_flagged', 'user_reported', 'manual_review')),
  
  -- Content snapshot (in case original is deleted)
  content_snapshot jsonb not null,
  
  -- Moderation details
  moderation_result jsonb,  -- ModerationResult from moderation.ts
  report_id uuid references public.reports(id),
  
  -- Status
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'escalated')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  
  -- Review details
  reviewed_by uuid references public.admins(id),
  reviewed_at timestamptz,
  admin_notes text,
  
  -- Actions taken
  action_taken text check (action_taken in ('none', 'content_removed', 'user_warned', 'user_suspended', 'user_banned')),
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index moderation_queue_status_priority_idx on public.moderation_queue(status, priority, created_at);
create index moderation_queue_user_idx on public.moderation_queue(user_id);
create index moderation_queue_reviewed_by_idx on public.moderation_queue(reviewed_by);

-- RLS
alter table public.moderation_queue enable row level security;

create policy "Admins and moderators can view queue"
  on public.moderation_queue for select
  using (
    auth.jwt() ->> 'role' in ('admin', 'moderator', 'super_admin')
  );

create policy "Admins and moderators can update queue"
  on public.moderation_queue for update
  using (
    auth.jwt() ->> 'role' in ('admin', 'moderator', 'super_admin')
  )
  with check (
    auth.jwt() ->> 'role' in ('admin', 'moderator', 'super_admin')
  );
```

### Admin API Endpoints

#### GET /admin/moderation/queue
List items in moderation queue

Query params:
- `status`: pending, approved, rejected, escalated
- `priority`: low, normal, high, critical
- `content_type`: post, message, profile
- `limit`: 1-100 (default 50)
- `offset`: pagination

Response:
```json
{
  "items": [{
    "id": "uuid",
    "content_type": "post",
    "content_id": "uuid",
    "user_id": "uuid",
    "reason": "auto_flagged",
    "content_snapshot": {
      "content": "...",
      "image_url": "..."
    },
    "moderation_result": {
      "flagged": true,
      "categories": {...},
      "action": "review"
    },
    "status": "pending",
    "priority": "high",
    "created_at": "..."
  }],
  "total": 42,
  "limit": 50,
  "offset": 0
}
```

#### GET /admin/moderation/queue/:id
Get single queue item with full details

Response:
```json
{
  "item": {
    "id": "uuid",
    "content_type": "post",
    "content_id": "uuid",
    "user": {
      "id": "uuid",
      "username": "user123",
      "created_at": "...",
      "post_count": 42,
      "report_count": 2
    },
    "content_snapshot": {...},
    "moderation_result": {...},
    "related_reports": [{...}],
    "user_history": {
      "previous_violations": 1,
      "total_posts": 42,
      "account_age_days": 30
    },
    "status": "pending",
    "created_at": "..."
  }
}
```

#### PATCH /admin/moderation/queue/:id
Review and take action on queue item

Request:
```json
{
  "action": "approved",  // approved, rejected, escalated
  "action_taken": "content_removed",  // none, content_removed, user_warned, user_suspended, user_banned
  "admin_notes": "Reviewed and found no violation"
}
```

Response:
```json
{
  "item": {...},
  "message": "Review completed"
}
```

#### GET /admin/users/:id
Get user details and history

Response:
```json
{
  "user": {
    "id": "uuid",
    "username": "user123",
    "created_at": "...",
    "stats": {
      "post_count": 42,
      "connection_count": 10,
      "message_count": 150,
      "report_count": 2,
      "violation_count": 1
    },
    "recent_posts": [...],
    "recent_reports": [...],
    "moderation_history": [...]
  }
}
```

#### POST /admin/users/:id/suspend
Suspend user account

Request:
```json
{
  "duration_hours": 24,  // null for permanent
  "reason": "Repeated violations"
}
```

#### POST /admin/users/:id/ban
Permanently ban user

Request:
```json
{
  "reason": "Severe policy violation"
}
```

#### GET /admin/stats
System-wide statistics

Response:
```json
{
  "stats": {
    "total_users": 1000,
    "active_users_24h": 500,
    "total_posts": 5000,
    "posts_24h": 200,
    "pending_reports": 10,
    "pending_reviews": 5,
    "avg_review_time_minutes": 12.5
  },
  "trends": {
    "user_growth_7d": 15,
    "post_growth_7d": 120,
    "report_rate_7d": 0.02
  }
}
```

## Frontend Implementation

### Technology Stack
Recommended:
- **Framework**: Next.js or Remix (React-based)
- **UI**: shadcn/ui or Mantine
- **Auth**: Supabase Auth (admin accounts)
- **State**: TanStack Query for data fetching
- **Charts**: Recharts or Chart.js

### Key Pages

1. **Dashboard** (`/admin`)
   - Key metrics overview
   - Pending queue count
   - Recent activity
   - Trends charts

2. **Moderation Queue** (`/admin/queue`)
   - Filterable table of pending items
   - Priority indicators
   - Quick actions
   - Bulk actions

3. **Queue Item Detail** (`/admin/queue/:id`)
   - Full content display
   - User history sidebar
   - Action buttons (approve/reject/escalate)
   - Related reports
   - Admin notes

4. **Users** (`/admin/users`)
   - Search users
   - User statistics
   - Filter by status (active, suspended, banned)

5. **User Detail** (`/admin/users/:id`)
   - User profile
   - Content history
   - Moderation history
   - Actions (warn, suspend, ban)

6. **Reports** (`/admin/reports`)
   - All user reports
   - Filter by status
   - Link to moderation queue

7. **Settings** (`/admin/settings`)
   - Moderation thresholds
   - Auto-moderation toggle
   - Admin user management

### Example Queue Item Component

```typescript
interface QueueItemProps {
  item: ModerationQueueItem;
  onApprove: (id: string, notes: string) => Promise<void>;
  onReject: (id: string, action: string, notes: string) => Promise<void>;
}

function QueueItemCard({ item, onApprove, onReject }: QueueItemProps) {
  return (
    <Card>
      <CardHeader>
        <Badge color={getPriorityColor(item.priority)}>
          {item.priority}
        </Badge>
        <Text>{item.content_type}</Text>
        <Text size="sm" color="dimmed">
          {formatDistance(item.created_at, new Date())} ago
        </Text>
      </CardHeader>
      
      <CardContent>
        {/* Content preview */}
        <Text>{item.content_snapshot.content}</Text>
        {item.content_snapshot.image_url && (
          <Image src={item.content_snapshot.image_url} />
        )}
        
        {/* Moderation flags */}
        {item.moderation_result?.categories && (
          <Group>
            {Object.entries(item.moderation_result.categories)
              .filter(([_, flagged]) => flagged)
              .map(([category, _]) => (
                <Badge key={category} color="red">
                  {category}
                </Badge>
              ))}
          </Group>
        )}
        
        {/* User info */}
        <Group>
          <Avatar />
          <div>
            <Text weight={500}>{item.user.username}</Text>
            <Text size="xs" color="dimmed">
              {item.user.previous_violations} previous violations
            </Text>
          </div>
        </Group>
      </CardContent>
      
      <CardFooter>
        <Button
          variant="subtle"
          color="green"
          onClick={() => handleApprove(item.id)}
        >
          Approve
        </Button>
        <Button
          variant="subtle"
          color="red"
          onClick={() => handleReject(item.id)}
        >
          Reject
        </Button>
        <Button variant="subtle">
          View Details
        </Button>
      </CardFooter>
    </Card>
  );
}
```

## Deployment

### Option 1: Separate Cloudflare Worker
- Deploy admin API as a separate Worker
- Use subdomain: `admin.sway.app`
- Isolate admin logic from main API

### Option 2: Admin Routes in Main Worker
- Add `/admin/*` routes to main API
- Use middleware to enforce admin auth
- Simpler deployment

### Option 3: Serverless Functions (Vercel/Netlify)
- Deploy Next.js app with API routes
- Connect to Supabase database
- Simplest for full-stack framework

## Security Considerations

1. **Authentication**
   - Separate admin auth system
   - MFA required for admin accounts
   - Session timeout (30 minutes)

2. **Authorization**
   - Role-based access control
   - Moderators can review, admins can suspend/ban
   - Super admins can manage other admins

3. **Audit Logging**
   - Log all admin actions
   - Track who reviewed what and when
   - Immutable audit trail

4. **Network Security**
   - Admin dashboard behind VPN or IP allowlist
   - HTTPS only
   - CSP headers

5. **Data Protection**
   - Don't expose user PII unnecessarily
   - Redact sensitive data in content snapshots
   - Secure admin sessions

## Monitoring & Alerts

### Metrics to Track
- Queue backlog (alert if >50 pending)
- Average review time
- Actions taken (approve/reject ratio)
- User suspension/ban rate
- Admin activity

### Alerts
- Critical priority items added to queue
- Queue backlog exceeds threshold
- Suspicious admin activity
- System errors in moderation

## Implementation Priority

1. **Phase 1** (MVP)
   - ✅ Database tables (moderation_queue, admins)
   - ✅ Admin authentication
   - ✅ Queue list endpoint
   - ✅ Queue detail endpoint
   - ✅ Review/approve/reject endpoint
   - ✅ Basic dashboard UI

2. **Phase 2**
   - User detail endpoint
   - User suspend/ban endpoints
   - User search
   - Advanced filtering
   - Bulk actions

3. **Phase 3**
   - Statistics dashboard
   - Trend charts
   - Admin user management
   - Audit log viewer
   - Settings management

## Cost Estimate

### Development
- Backend API: 8-16 hours
- Frontend dashboard: 40-60 hours
- Testing & refinement: 8-16 hours
- **Total:** 56-92 hours

### Ongoing
- Hosting (Vercel/Netlify): $0-20/month
- Moderation time: Depends on user volume
  - Small (<1000 users): 1-2 hours/day
  - Medium (1000-10k users): 4-8 hours/day
  - Large (>10k users): Full-time moderator(s)

## References

- [Supabase Row Level Security](https://supabase.com/docs/guides/auth/row-level-security)
- [Next.js Admin Dashboard Examples](https://github.com/topics/admin-dashboard)
- [shadcn/ui](https://ui.shadcn.com/)
- [Mantine UI](https://mantine.dev/)
