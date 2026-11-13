-- Notifications and Admin Tables Migration
-- Run after 0002_accept_connection_rpc.sql

-- ======================
-- NOTIFICATIONS SYSTEM
-- ======================

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  type text not null check (type in (
    'connection_request',
    'connection_accepted',
    'new_message',
    'post_liked',
    'post_commented',
    'moderation_action'
  )),
  title text not null,
  body text not null,
  data jsonb, -- Additional contextual data
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create index notifications_user_id_created_idx on public.notifications(user_id, created_at desc);
create index notifications_user_id_unread_idx on public.notifications(user_id, is_read) where is_read = false;

-- RLS for notifications
alter table public.notifications enable row level security;

create policy "users read own notifications"
  on public.notifications for select to authenticated
  using (user_id = auth.uid());

create policy "users update own notifications"
  on public.notifications for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- System can create notifications (using service role in production)
create policy "system creates notifications"
  on public.notifications for insert
  with check (true);

-- ======================
-- ADMIN SYSTEM
-- ======================

create table public.admin_roles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null unique,
  role text not null check (role in ('moderator', 'admin', 'super_admin')),
  permissions jsonb not null default '["view_reports"]'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.admin_roles(id),
  last_login_at timestamptz
);

create index admin_roles_role_idx on public.admin_roles(role);

-- RLS for admin_roles
alter table public.admin_roles enable row level security;

create policy "admins can view all admins"
  on public.admin_roles for select to authenticated
  using (
    exists (
      select 1 from public.admin_roles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

create policy "super_admins can manage admins"
  on public.admin_roles for all to authenticated
  using (
    exists (
      select 1 from public.admin_roles
      where id = auth.uid() and role = 'super_admin'
    )
  );

-- ======================
-- MODERATION QUEUE
-- ======================

create table public.moderation_queue (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('post', 'message', 'profile')),
  content_id uuid not null,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('auto_flagged', 'user_reported', 'manual_review')),
  
  -- Content snapshot
  content_snapshot jsonb not null,
  
  -- Moderation details
  moderation_result jsonb,
  report_id uuid references public.reports(id),
  
  -- Status
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'escalated')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'critical')),
  
  -- Review details
  reviewed_by uuid references public.admin_roles(id),
  reviewed_at timestamptz,
  admin_notes text,
  
  -- Actions taken
  action_taken text check (action_taken in (
    'none',
    'content_removed',
    'user_warned',
    'user_suspended',
    'user_banned'
  )),
  
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index moderation_queue_status_priority_idx on public.moderation_queue(status, priority, created_at);
create index moderation_queue_user_id_idx on public.moderation_queue(user_id);
create index moderation_queue_reviewed_by_idx on public.moderation_queue(reviewed_by);

-- RLS for moderation_queue
alter table public.moderation_queue enable row level security;

create policy "admins and moderators view queue"
  on public.moderation_queue for select to authenticated
  using (
    exists (
      select 1 from public.admin_roles
      where id = auth.uid() and role in ('moderator', 'admin', 'super_admin')
    )
  );

create policy "admins and moderators update queue"
  on public.moderation_queue for update to authenticated
  using (
    exists (
      select 1 from public.admin_roles
      where id = auth.uid() and role in ('moderator', 'admin', 'super_admin')
    )
  )
  with check (
    exists (
      select 1 from public.admin_roles
      where id = auth.uid() and role in ('moderator', 'admin', 'super_admin')
    )
  );

-- System can create moderation queue entries
create policy "system creates moderation queue"
  on public.moderation_queue for insert
  with check (true);

-- ======================
-- USER SUSPENSION SYSTEM
-- ======================

create table public.user_suspensions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  suspended_by uuid not null references public.admin_roles(id),
  reason text not null,
  duration_hours int, -- null = permanent
  expires_at timestamptz,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index user_suspensions_user_id_active_idx on public.user_suspensions(user_id, is_active) where is_active = true;

-- RLS for suspensions
alter table public.user_suspensions enable row level security;

create policy "admins view suspensions"
  on public.user_suspensions for select to authenticated
  using (
    exists (
      select 1 from public.admin_roles
      where id = auth.uid() and role in ('moderator', 'admin', 'super_admin')
    )
  );

create policy "admins create suspensions"
  on public.user_suspensions for insert to authenticated
  with check (
    exists (
      select 1 from public.admin_roles
      where id = auth.uid() and role in ('admin', 'super_admin')
    )
  );

-- ======================
-- HELPER FUNCTIONS
-- ======================

-- Function to check if user is suspended
create or replace function public.is_user_suspended(check_user_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  return exists (
    select 1 from user_suspensions
    where user_id = check_user_id
      and is_active = true
      and (expires_at is null or expires_at > now())
  );
end;
$$;

-- Function to create notification
create or replace function public.create_notification(
  target_user_id uuid,
  notification_type text,
  notification_title text,
  notification_body text,
  notification_data jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_notification_id uuid;
begin
  insert into notifications (user_id, type, title, body, data)
  values (target_user_id, notification_type, notification_title, notification_body, notification_data)
  returning id into new_notification_id;
  
  return new_notification_id;
end;
$$;

-- Grant execute permissions
grant execute on function public.is_user_suspended(uuid) to authenticated;
grant execute on function public.create_notification(uuid, text, text, text, jsonb) to authenticated;

-- ======================
-- TRIGGER: Auto-create notifications
-- ======================

-- Trigger for connection requests
create or replace function public.notify_connection_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'pending' then
    perform create_notification(
      new.receiver_id,
      'connection_request',
      'New Connection Request',
      'Someone wants to connect with you',
      jsonb_build_object('connection_id', new.id, 'sender_id', new.sender_id)
    );
  elsif new.status = 'accepted' and old.status = 'pending' then
    perform create_notification(
      new.sender_id,
      'connection_accepted',
      'Connection Accepted',
      'Your connection request was accepted',
      jsonb_build_object('connection_id', new.id, 'receiver_id', new.receiver_id)
    );
  end if;
  return new;
end;
$$;

create trigger on_connection_change
  after insert or update on public.connections
  for each row
  execute function notify_connection_request();

-- Trigger for new messages
create or replace function public.notify_new_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient_id uuid;
begin
  -- Find the other member of the conversation
  select user_id into recipient_id
  from conversation_members
  where conversation_id = new.conversation_id
    and user_id != new.sender_id
  limit 1;
  
  if recipient_id is not null then
    perform create_notification(
      recipient_id,
      'new_message',
      'New Message',
      'You have a new message',
      jsonb_build_object(
        'conversation_id', new.conversation_id,
        'message_id', new.id,
        'sender_id', new.sender_id
      )
    );
  end if;
  
  return new;
end;
$$;

create trigger on_message_created
  after insert on public.messages
  for each row
  execute function notify_new_message();

-- ======================
-- COMMENTS
-- ======================

comment on table public.notifications is 'User notifications for various events';
comment on table public.admin_roles is 'Admin and moderator role assignments';
comment on table public.moderation_queue is 'Content flagged for moderation review';
comment on table public.user_suspensions is 'User suspension records';
comment on function public.is_user_suspended(uuid) is 'Check if a user is currently suspended';
comment on function public.create_notification(uuid, text, text, text, jsonb) is 'Create a notification for a user';
