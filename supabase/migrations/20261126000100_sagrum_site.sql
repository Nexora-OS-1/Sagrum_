create table if not exists public.sagrum_admin_users (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.site_content (
  id smallint primary key check (id = 1),
  hero_text text not null default '',
  portfolio_text text not null default '',
  clips_text text not null default '',
  info_title text not null default 'O mne',
  info_text text not null default '',
  instagram_url text not null default '',
  tiktok_url text not null default '',
  discord_url text not null default '',
  booking_url text not null default '',
  updated_at timestamptz not null default now()
);

insert into public.site_content (id)
values (1)
on conflict (id) do nothing;

create table if not exists public.site_clips (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 100),
  description text not null default '' check (char_length(description) <= 500),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create or replace function public.is_sagrum_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.sagrum_admin_users
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_sagrum_admin() from public;
grant execute on function public.is_sagrum_admin() to authenticated;

alter table public.sagrum_admin_users enable row level security;
alter table public.site_content enable row level security;
alter table public.site_clips enable row level security;

revoke all on public.sagrum_admin_users from anon, authenticated;
grant select on public.site_content to anon, authenticated;
grant update on public.site_content to authenticated;
grant select on public.site_clips to anon, authenticated;
grant insert, delete on public.site_clips to authenticated;

drop policy if exists "Public can read Sagrum content" on public.site_content;
create policy "Public can read Sagrum content"
  on public.site_content for select
  to anon, authenticated
  using (true);

drop policy if exists "Sagrum admins can update content" on public.site_content;
create policy "Sagrum admins can update content"
  on public.site_content for update
  to authenticated
  using (public.is_sagrum_admin())
  with check (public.is_sagrum_admin());

drop policy if exists "Public can read Sagrum clips" on public.site_clips;
create policy "Public can read Sagrum clips"
  on public.site_clips for select
  to anon, authenticated
  using (true);

drop policy if exists "Sagrum admins can add clips" on public.site_clips;
create policy "Sagrum admins can add clips"
  on public.site_clips for insert
  to authenticated
  with check (public.is_sagrum_admin());

drop policy if exists "Sagrum admins can delete clips" on public.site_clips;
create policy "Sagrum admins can delete clips"
  on public.site_clips for delete
  to authenticated
  using (public.is_sagrum_admin());

drop policy if exists "Public can read Sagrum video files" on storage.objects;
create policy "Public can read Sagrum video files"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'sagrum-clips');

drop policy if exists "Sagrum admins can upload video files" on storage.objects;
create policy "Sagrum admins can upload video files"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'sagrum-clips' and public.is_sagrum_admin());

drop policy if exists "Sagrum admins can delete video files" on storage.objects;
create policy "Sagrum admins can delete video files"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'sagrum-clips' and public.is_sagrum_admin());
