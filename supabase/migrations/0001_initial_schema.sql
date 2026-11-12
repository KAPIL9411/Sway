-- SWAY initial schema. Run once in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint username_length check (username is null or char_length(username) between 2 and 24)
);

create table public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  content text not null default '',
  image_url text,
  tag text not null default 'General',
  created_at timestamptz not null default now(),
  constraint post_content_length check (char_length(content) <= 2000),
  constraint post_has_content check (char_length(trim(content)) > 0 or image_url is not null)
);

create table public.connections (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id) on delete cascade,
  receiver_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted','rejected')),
  created_at timestamptz not null default now(),
  unique(sender_id, receiver_id),
  check (sender_id <> receiver_id)
);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now()
);
create table public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  target_type text not null check (target_type in ('post','profile','message')),
  target_id uuid not null,
  reason text not null,
  details text,
  status text not null default 'open' check (status in ('open','reviewing','resolved','dismissed')),
  created_at timestamptz not null default now()
);
create table public.blocks (
  blocker_id uuid not null references public.profiles(id) on delete cascade,
  blocked_user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_user_id),
  check (blocker_id <> blocked_user_id)
);

create index posts_created_at_idx on public.posts(created_at desc);
create index posts_user_id_idx on public.posts(user_id);
create index connections_receiver_status_idx on public.connections(receiver_id, status);
create index messages_conversation_created_idx on public.messages(conversation_id, created_at desc);
create index reports_status_created_idx on public.reports(status, created_at);

-- Keep profile rows in sync for users created via Supabase Auth anonymous sign-in.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute procedure public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.connections enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.blocks enable row level security;

-- Profiles: authenticated users can read public usernames; only owner can update own row.
create policy "profiles readable by authenticated" on public.profiles for select to authenticated using (true);
create policy "profile owner updates own" on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profile owner inserts own" on public.profiles for insert to authenticated with check (id = auth.uid());

-- Posts: visible to signed-in users; authors can create/update/delete their own.
create policy "posts readable" on public.posts for select to authenticated using (true);
create policy "authors create posts" on public.posts for insert to authenticated with check (user_id = auth.uid());
create policy "authors update posts" on public.posts for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "authors delete posts" on public.posts for delete to authenticated using (user_id = auth.uid());

-- Connections are visible only to participants; sender creates, receiver responds.
create policy "connection participants read" on public.connections for select to authenticated
using (sender_id = auth.uid() or receiver_id = auth.uid());
create policy "sender creates connection" on public.connections for insert to authenticated
with check (sender_id = auth.uid());
create policy "receiver responds" on public.connections for update to authenticated
using (receiver_id = auth.uid() and status = 'pending')
with check (receiver_id = auth.uid() and status in ('accepted','rejected'));

-- Conversation membership and messages.
create policy "members read membership" on public.conversation_members for select to authenticated
using (user_id = auth.uid() or exists (
  select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
));
create policy "members read conversations" on public.conversations for select to authenticated
using (exists (select 1 from public.conversation_members cm where cm.conversation_id = id and cm.user_id = auth.uid()));
create policy "members read messages" on public.messages for select to authenticated
using (exists (select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()));
create policy "members send messages" on public.messages for insert to authenticated
with check (sender_id = auth.uid() and exists (
  select 1 from public.conversation_members cm where cm.conversation_id = conversation_id and cm.user_id = auth.uid()
));

-- Reports: reporter can submit and view own reports; admin review must use a separate privileged tool.
create policy "users create reports" on public.reports for insert to authenticated with check (reporter_id = auth.uid());
create policy "users read own reports" on public.reports for select to authenticated using (reporter_id = auth.uid());
create policy "users create blocks" on public.blocks for insert to authenticated with check (blocker_id = auth.uid());
create policy "users read own blocks" on public.blocks for select to authenticated using (blocker_id = auth.uid());
create policy "users remove own blocks" on public.blocks for delete to authenticated using (blocker_id = auth.uid());

-- Realtime: publish messages only. Realtime authorization remains governed by RLS.
alter publication supabase_realtime add table public.messages;
