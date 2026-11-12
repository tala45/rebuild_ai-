-- Run this migration in the Supabase SQL Editor for the existing project.
-- The app uses the publishable key only; RLS is the authorization boundary.

begin;

-- Do not adopt or change unrelated tables that happen to share app table names.
do $table_preflight$
declare
  target_name text;
  target_relation regclass;
  existing_marker text;
  expected_marker text;
begin
  for target_name in
    select unnest(array[
      'profiles',
      'materials',
      'material_images',
      'ai_analyses',
      'listings',
      'inquiries',
      'order_requests',
      'reuse_projects',
      'saved_projects',
      'material_actions',
      'notifications'
    ]::text[])
  loop
    target_relation := pg_catalog.to_regclass(pg_catalog.format('public.%I', target_name));
    if target_relation is not null then
      existing_marker := pg_catalog.obj_description(target_relation, 'pg_class');
      expected_marker := 'REBUILD_AI_TABLE:20261112000000:' || target_name;
      if existing_marker is distinct from expected_marker then
        raise exception 'Table public.% already exists without this migration ownership marker; it was preserved',
          target_name;
      end if;
    end if;
  end loop;
end;
$table_preflight$;

do $internal_schema_preflight$
declare
  internal_schema oid;
  existing_marker text;
begin
  internal_schema := pg_catalog.to_regnamespace('rebuild_internal');
  if internal_schema is not null then
    existing_marker := pg_catalog.obj_description(internal_schema, 'pg_namespace');
    if existing_marker is distinct from 'REBUILD_AI_SCHEMA:20261112000000' then
      raise exception 'Schema rebuild_internal already exists without this migration ownership marker; it was preserved';
    end if;
  end if;
end;
$internal_schema_preflight$;

create schema if not exists rebuild_internal;
comment on schema rebuild_internal is 'REBUILD_AI_SCHEMA:20261112000000';
revoke all privileges on schema rebuild_internal from public;
grant usage on schema rebuild_internal to anon, authenticated;

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'REBUILD member' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  name text not null check (char_length(name) between 2 and 100),
  category text not null check (category in ('construction','wood','metal','plastics','electrical','electronics','mechanical','chemicals','other')),
  description text not null default '' check (char_length(description) <= 1000),
  quantity numeric(14,3) not null check (quantity > 0),
  unit text not null check (char_length(unit) between 1 and 24),
  condition text not null default 'unknown' check (condition in ('new','good','fair','poor','unknown')),
  approximate_location text not null default '' check (char_length(approximate_location) <= 120),
  status text not null default 'available' check (status in ('available','reserved','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.material_images (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null unique,
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp')),
  created_at timestamptz not null default now()
);

create table if not exists public.ai_analyses (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  method text not null check (method in ('rule_based','ai_generated','demo')),
  result jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists public.listings (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  asking_price numeric(12,2) not null check (asking_price >= 0),
  fulfillment text[] not null check (cardinality(fulfillment) > 0 and fulfillment <@ array['pickup','shipping']::text[]),
  status text not null default 'active' check (status in ('active','paused','sold','closed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(material_id)
);

create table if not exists public.inquiries (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 5 and 800),
  created_at timestamptz not null default now()
);

create table if not exists public.order_requests (
  id uuid primary key default gen_random_uuid(),
  listing_id uuid not null references public.listings(id) on delete restrict,
  buyer_id uuid not null references public.profiles(id) on delete cascade,
  seller_id uuid not null references public.profiles(id) on delete cascade,
  message text not null check (char_length(message) between 5 and 800),
  fulfillment text not null check (fulfillment in ('pickup','shipping')),
  status text not null default 'requested' check (status in ('requested','accepted','declined','completed')),
  buyer_completed_at timestamptz,
  seller_completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (buyer_id <> seller_id)
);

create or replace function public.rebuild_guard_listing_updates_20261112000000()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status <> 'active' then
    raise exception 'New listings must start active';
  end if;
  if tg_op = 'UPDATE' then
    if new.id is distinct from old.id
       or new.material_id is distinct from old.material_id
       or new.seller_id is distinct from old.seller_id
       or new.created_at is distinct from old.created_at then
      raise exception 'Listing identity, owner, material, and creation time cannot be changed';
    end if;
    if old.status = 'sold' and new.status <> 'sold' then
      raise exception 'Sold listings cannot be reopened';
    end if;
    if new.fulfillment is distinct from old.fulfillment and exists (
      select 1 from public.order_requests r
       where r.listing_id = old.id and r.status in ('requested','accepted')
    ) then
      raise exception 'Listing fulfillment cannot change while an order request is open';
    end if;
  end if;
  if new.status = 'sold' and not exists (
    select 1 from public.order_requests r where r.listing_id = new.id and r.status = 'completed'
  ) then
    raise exception 'A listing can be marked sold only after both sides confirm a completed request';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists rebuild_guard_listing_updates_20261112000000 on public.listings;
create trigger rebuild_guard_listing_updates_20261112000000 before insert or update on public.listings
  for each row execute procedure public.rebuild_guard_listing_updates_20261112000000();

create unique index if not exists order_requests_one_accepted_per_listing_idx
  on public.order_requests(listing_id) where status in ('accepted','completed');

create or replace function public.rebuild_guard_order_request_updates_20261112000000()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if tg_op = 'INSERT' then
    if current_user_id is null or new.buyer_id is distinct from current_user_id then
      raise exception 'Only the authenticated buyer can create a request';
    end if;
    if new.status <> 'requested' or new.buyer_completed_at is not null or new.seller_completed_at is not null then
      raise exception 'New order requests must start requested with no completion confirmations';
    end if;
    if not rebuild_internal.can_create_order_request(new.listing_id, new.seller_id, new.fulfillment) then
      raise exception 'A request must match an active listing and its seller and fulfillment options';
    end if;
    new.updated_at := now();
    return new;
  end if;
  if new.id is distinct from old.id
     or new.buyer_id is distinct from old.buyer_id
     or new.seller_id is distinct from old.seller_id
     or new.listing_id is distinct from old.listing_id
     or new.message is distinct from old.message
     or new.fulfillment is distinct from old.fulfillment
     or new.created_at is distinct from old.created_at then
    raise exception 'Request identity, listing, message, fulfillment, and creation time cannot be changed';
  end if;
  if new.buyer_completed_at is distinct from old.buyer_completed_at then
    if current_user_id is distinct from old.buyer_id
       or old.status <> 'accepted'
       or old.buyer_completed_at is not null
       or new.buyer_completed_at is null then
      raise exception 'Only the buyer can confirm completion once after acceptance';
    end if;
    new.buyer_completed_at := now();
  end if;
  if new.seller_completed_at is distinct from old.seller_completed_at then
    if current_user_id is distinct from old.seller_id
       or old.status <> 'accepted'
       or old.seller_completed_at is not null
       or new.seller_completed_at is null then
      raise exception 'Only the seller can confirm completion once after acceptance';
    end if;
    new.seller_completed_at := now();
  end if;
  if new.status is distinct from old.status and not (
    current_user_id is not distinct from old.seller_id
    and old.status = 'requested'
    and new.status in ('accepted','declined')
  ) then
    raise exception 'Only the seller can accept or decline a new request';
  end if;
  if old.status = 'requested' and new.status = 'accepted'
     and not rebuild_internal.can_create_order_request(new.listing_id, new.seller_id, new.fulfillment) then
    raise exception 'This listing is no longer available';
  end if;
  if old.status = 'accepted' and new.buyer_completed_at is not null and new.seller_completed_at is not null then
    new.status := 'completed';
  elsif new.status = 'completed' and old.status <> 'completed' then
    raise exception 'Completion status is set only after both parties confirm';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists rebuild_guard_order_request_updates_20261112000000 on public.order_requests;
create trigger rebuild_guard_order_request_updates_20261112000000 before insert or update on public.order_requests
  for each row execute procedure public.rebuild_guard_order_request_updates_20261112000000();

create or replace function public.rebuild_mark_listing_sold_after_confirmations_20261112000000()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    update public.listings set status = 'sold', updated_at = now()
    where id = new.listing_id and status <> 'sold';
  end if;
  return new;
end;
$$;
drop trigger if exists rebuild_mark_listing_sold_after_confirmations_20261112000000 on public.order_requests;
create trigger rebuild_mark_listing_sold_after_confirmations_20261112000000 after update on public.order_requests
  for each row execute procedure public.rebuild_mark_listing_sold_after_confirmations_20261112000000();

create table if not exists public.reuse_projects (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 2 and 120),
  description text not null check (char_length(description) <= 1000),
  categories text[] not null default '{}',
  requirements jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.saved_projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  project_id uuid not null references public.reuse_projects(id) on delete cascade,
  material_id uuid references public.materials(id) on delete set null,
  status text not null default 'planned' check (status in ('planned','completed')),
  notes text not null default '' check (char_length(notes) <= 1000),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(owner_id, project_id, material_id)
);

create table if not exists public.material_actions (
  id uuid primary key default gen_random_uuid(),
  material_id uuid not null references public.materials(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  action_type text not null check (action_type in ('reuse','disposal')),
  status text not null default 'planned' check (status in ('planned','completed')),
  notes text not null default '' check (char_length(notes) <= 1000),
  disposal_category text check (disposal_category is null or char_length(disposal_category) <= 80),
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  body text not null default '' check (char_length(body) <= 500),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

comment on table public.profiles is 'REBUILD_AI_TABLE:20261112000000:profiles';
comment on table public.materials is 'REBUILD_AI_TABLE:20261112000000:materials';
comment on table public.material_images is 'REBUILD_AI_TABLE:20261112000000:material_images';
comment on table public.ai_analyses is 'REBUILD_AI_TABLE:20261112000000:ai_analyses';
comment on table public.listings is 'REBUILD_AI_TABLE:20261112000000:listings';
comment on table public.inquiries is 'REBUILD_AI_TABLE:20261112000000:inquiries';
comment on table public.order_requests is 'REBUILD_AI_TABLE:20261112000000:order_requests';
comment on table public.reuse_projects is 'REBUILD_AI_TABLE:20261112000000:reuse_projects';
comment on table public.saved_projects is 'REBUILD_AI_TABLE:20261112000000:saved_projects';
comment on table public.material_actions is 'REBUILD_AI_TABLE:20261112000000:material_actions';
comment on table public.notifications is 'REBUILD_AI_TABLE:20261112000000:notifications';

create or replace function rebuild_internal.can_read_material(target_material_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.listings l
     where l.material_id = target_material_id and l.status = 'active'
  ) or exists (
    select 1
      from public.listings l
      join public.order_requests r on r.listing_id = l.id
     where l.material_id = target_material_id
       and (r.buyer_id = (select auth.uid()) or r.seller_id = (select auth.uid()))
  )
$$;

create or replace function rebuild_internal.can_read_listing(target_listing_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.listings l
     where l.id = target_listing_id
       and (
         l.status = 'active'
         or l.seller_id = (select auth.uid())
         or exists (
           select 1 from public.order_requests r
            where r.listing_id = l.id
              and (r.buyer_id = (select auth.uid()) or r.seller_id = (select auth.uid()))
         )
       )
  )
$$;

create or replace function rebuild_internal.can_read_listed_material_image(
  target_material_id uuid,
  target_owner_id uuid,
  target_storage_path text,
  target_content_type text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_content_type in ('image/jpeg','image/png','image/webp')
     and split_part(target_storage_path, '/', 1) = target_owner_id::text
     and exists (
       select 1
         from public.listings l
         join public.materials m on m.id = l.material_id
        where l.material_id = target_material_id
          and l.seller_id = target_owner_id
          and m.owner_id = target_owner_id
          and l.status = 'active'
     )
$$;

create or replace function rebuild_internal.can_read_active_listing_image(
  target_storage_path text,
  target_content_type text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select target_content_type in ('image/jpeg','image/png','image/webp')
     and exists (
       select 1
         from public.material_images mi
         join public.listings l on l.material_id = mi.material_id
         join public.materials m on m.id = mi.material_id
        where mi.storage_path = target_storage_path
          and mi.content_type = target_content_type
          and l.status = 'active'
          and l.seller_id = mi.owner_id
          and m.owner_id = mi.owner_id
          and split_part(target_storage_path, '/', 1) = mi.owner_id::text
     )
$$;

create or replace function rebuild_internal.can_create_order_request(
  target_listing_id uuid,
  target_seller_id uuid,
  target_fulfillment text
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.listings l
     where l.id = target_listing_id
       and l.seller_id = target_seller_id
       and l.status = 'active'
       and target_fulfillment = any(l.fulfillment)
  )
$$;

revoke all privileges on function rebuild_internal.can_read_material(uuid) from public;
revoke all privileges on function rebuild_internal.can_read_listing(uuid) from public;
revoke all privileges on function rebuild_internal.can_read_listed_material_image(uuid, uuid, text, text) from public;
revoke all privileges on function rebuild_internal.can_read_active_listing_image(text, text) from public;
revoke all privileges on function rebuild_internal.can_create_order_request(uuid, uuid, text) from public;
grant execute on function rebuild_internal.can_read_material(uuid) to anon, authenticated;
grant execute on function rebuild_internal.can_read_listing(uuid) to anon, authenticated;
grant execute on function rebuild_internal.can_read_listed_material_image(uuid, uuid, text, text) to anon, authenticated;
grant execute on function rebuild_internal.can_read_active_listing_image(text, text) to anon, authenticated;
grant execute on function rebuild_internal.can_create_order_request(uuid, uuid, text) to authenticated;

create index if not exists materials_owner_created_idx on public.materials(owner_id, created_at desc);
create index if not exists materials_category_idx on public.materials(category);
create index if not exists listings_status_created_idx on public.listings(status, created_at desc);
create index if not exists order_requests_buyer_idx on public.order_requests(buyer_id, created_at desc);
create index if not exists order_requests_seller_idx on public.order_requests(seller_id, created_at desc);
create index if not exists material_actions_owner_status_idx on public.material_actions(owner_id, action_type, status);

create or replace function public.rebuild_handle_new_user_20261112000000()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'REBUILD member'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists rebuild_on_auth_user_created_20261112000000 on auth.users;
create trigger rebuild_on_auth_user_created_20261112000000
  after insert on auth.users
  for each row execute procedure public.rebuild_handle_new_user_20261112000000();

alter table public.profiles enable row level security;
alter table public.materials enable row level security;
alter table public.material_images enable row level security;
alter table public.ai_analyses enable row level security;
alter table public.listings enable row level security;
alter table public.inquiries enable row level security;
alter table public.order_requests enable row level security;
alter table public.reuse_projects enable row level security;
alter table public.saved_projects enable row level security;
alter table public.material_actions enable row level security;
alter table public.notifications enable row level security;

-- Keep SQL/API privileges limited to the operations exposed by the app.
-- IDs use gen_random_uuid(), so this migration creates no sequences to grant.
grant usage on schema public to anon, authenticated;
do $storage_rls_preflight$
begin
  if not exists (
    select 1
      from pg_catalog.pg_class c
     where c.oid = 'storage.objects'::regclass
       and c.relrowsecurity
  ) then
    raise exception 'storage.objects must already have row-level security enabled; this migration will not change access for other buckets';
  end if;
  if not pg_catalog.has_schema_privilege('anon', 'storage', 'USAGE')
     or not pg_catalog.has_schema_privilege('authenticated', 'storage', 'USAGE')
     or not pg_catalog.has_table_privilege('anon', 'storage.objects', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'SELECT')
     or not pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'INSERT')
     or not pg_catalog.has_table_privilege('authenticated', 'storage.objects', 'DELETE') then
    raise exception 'Supabase storage API grants are missing; restore the standard storage grants before applying this migration. This migration will not change privileges for other buckets';
  end if;
end;
$storage_rls_preflight$;

revoke all privileges on table
  public.profiles,
  public.materials,
  public.material_images,
  public.ai_analyses,
  public.listings,
  public.inquiries,
  public.order_requests,
  public.reuse_projects,
  public.saved_projects,
  public.material_actions,
  public.notifications
from public, anon, authenticated;

grant select on table
  public.profiles,
  public.materials,
  public.material_images,
  public.listings,
  public.reuse_projects
to anon, authenticated;
grant select on table
  public.ai_analyses,
  public.inquiries,
  public.order_requests,
  public.saved_projects,
  public.material_actions,
  public.notifications
to authenticated;
grant insert, update on table public.profiles to authenticated;
grant insert, update, delete on table public.materials to authenticated;
grant insert, delete on table public.material_images to authenticated;
grant insert on table public.ai_analyses to authenticated;
grant insert, update, delete on table public.listings to authenticated;
grant insert on table public.inquiries to authenticated;
grant insert, update on table public.order_requests to authenticated;
grant insert, update, delete on table public.saved_projects to authenticated;
grant insert, update, delete on table public.material_actions to authenticated;
grant insert, update, delete on table public.notifications to authenticated;

grant all privileges on table
  public.profiles,
  public.materials,
  public.material_images,
  public.ai_analyses,
  public.listings,
  public.inquiries,
  public.order_requests,
  public.reuse_projects,
  public.saved_projects,
  public.material_actions,
  public.notifications
to service_role;

create or replace function pg_temp.ensure_rebuild_policy(
  target_table regclass,
  target_policy_name text,
  create_statement text,
  ownership_marker text
)
returns void
language plpgsql
as $$
declare
  target_schema_name text;
  target_relation_name text;
  existing_comment text;
  existing_definition_hash text;
  expected_comment_prefix text;
  stored_definition_hash text;
  created_policy_oid oid;
  created_definition_hash text;
begin
  select n.nspname, c.relname
    into target_schema_name, target_relation_name
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
   where c.oid = target_table;
  if not found then
    raise exception 'Policy target relation % does not exist', target_table;
  end if;

  select
    pg_catalog.obj_description(p.oid, 'pg_policy'),
    pg_catalog.md5(
      p.polcmd::text || '|' ||
      p.polpermissive::text || '|' ||
      p.polroles::text || '|' ||
      coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') || '|' ||
      coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')
    )
    into existing_comment, existing_definition_hash
    from pg_catalog.pg_policy p
   where p.polrelid = target_table and p.polname = target_policy_name;
  if found then
    if existing_comment is null
       or left(existing_comment, char_length(ownership_marker) + 1) <> ownership_marker || ':' then
      raise exception 'Policy "%" already exists on %.% and is not owned by this migration; it was preserved',
        target_policy_name, target_schema_name, target_relation_name;
    end if;
    expected_comment_prefix := ownership_marker || ':' || pg_catalog.md5(create_statement) || ':';
    if left(existing_comment, char_length(expected_comment_prefix)) <> expected_comment_prefix then
      raise exception 'Policy "%" on %.% has a different migration definition; it was preserved',
        target_policy_name, target_schema_name, target_relation_name;
    end if;
    stored_definition_hash := substring(existing_comment from char_length(expected_comment_prefix) + 1);
    if stored_definition_hash <> existing_definition_hash then
      raise exception 'Policy "%" on %.% was changed after creation; it was preserved',
        target_policy_name, target_schema_name, target_relation_name;
    end if;
    return;
  end if;

  execute create_statement;
  select
    p.oid,
    pg_catalog.md5(
      p.polcmd::text || '|' ||
      p.polpermissive::text || '|' ||
      p.polroles::text || '|' ||
      coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') || '|' ||
      coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '')
    )
    into created_policy_oid, created_definition_hash
    from pg_catalog.pg_policy p
   where p.polrelid = target_table and p.polname = target_policy_name;
  if not found then
    raise exception 'Policy "%" was not created on %.%', target_policy_name, target_schema_name, target_relation_name;
  end if;
  execute format(
    'comment on policy %I on %I.%I is %L',
    target_policy_name,
    target_schema_name,
    target_relation_name,
    ownership_marker || ':' || pg_catalog.md5(create_statement) || ':' || created_definition_hash
  );
end;
$$;

do $policy_setup$
begin
  perform pg_temp.ensure_rebuild_policy(
    'public.profiles'::regclass,
    'public seller names are readable',
    $statement$create policy "public seller names are readable" on public.profiles for select to anon, authenticated using (true)$statement$,
    'REBUILD_AI_POLICY:20261112000000:profiles:public-read'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.profiles'::regclass,
    'users insert own profile',
    $statement$create policy "users insert own profile" on public.profiles for insert to authenticated with check (id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:profiles:insert-own'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.profiles'::regclass,
    'users update own profile',
    $statement$create policy "users update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:profiles:update-own'
  );

  perform pg_temp.ensure_rebuild_policy(
    'public.materials'::regclass,
    'owners and listed materials readable',
    $statement$create policy "owners and listed materials readable" on public.materials for select to anon, authenticated using (owner_id = (select auth.uid()) or rebuild_internal.can_read_material(public.materials.id))$statement$,
    'REBUILD_AI_POLICY:20261112000000:materials:select-owner-listed-participant'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.materials'::regclass,
    'users create own materials',
    $statement$create policy "users create own materials" on public.materials for insert to authenticated with check (owner_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:materials:insert-own'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.materials'::regclass,
    'users update own materials',
    $statement$create policy "users update own materials" on public.materials for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:materials:update-own'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.materials'::regclass,
    'users delete own materials',
    $statement$create policy "users delete own materials" on public.materials for delete to authenticated using (owner_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:materials:delete-own'
  );

  perform pg_temp.ensure_rebuild_policy(
    'public.material_images'::regclass,
    'owners read material images',
    $statement$create policy "owners read material images" on public.material_images for select to authenticated using (owner_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:material-images:select-owner'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.material_images'::regclass,
    'active listing image paths are public',
    $statement$create policy "active listing image paths are public" on public.material_images for select to anon, authenticated using (rebuild_internal.can_read_listed_material_image(public.material_images.material_id, public.material_images.owner_id, public.material_images.storage_path, public.material_images.content_type))$statement$,
    'REBUILD_AI_POLICY:20261112000000:material-images:select-listed-owner-path'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.material_images'::regclass,
    'owners add material images',
    $statement$create policy "owners add material images" on public.material_images for insert to authenticated with check (owner_id = (select auth.uid()) and split_part(storage_path, '/', 1) = (select auth.uid())::text and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())))$statement$,
    'REBUILD_AI_POLICY:20261112000000:material-images:insert-own-path'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.material_images'::regclass,
    'owners delete material images',
    $statement$create policy "owners delete material images" on public.material_images for delete to authenticated using (owner_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:material-images:delete-owner'
  );

  perform pg_temp.ensure_rebuild_policy(
    'public.ai_analyses'::regclass,
    'owners read analyses',
    $statement$create policy "owners read analyses" on public.ai_analyses for select to authenticated using (owner_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:analyses:select-owner'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.ai_analyses'::regclass,
    'owners create analyses',
    $statement$create policy "owners create analyses" on public.ai_analyses for insert to authenticated with check (owner_id = (select auth.uid()) and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())))$statement$,
    'REBUILD_AI_POLICY:20261112000000:analyses:insert-owner-material'
  );

  perform pg_temp.ensure_rebuild_policy(
    'public.listings'::regclass,
    'active listings and order participants are readable',
    $statement$create policy "active listings and order participants are readable" on public.listings for select to anon, authenticated using (rebuild_internal.can_read_listing(public.listings.id))$statement$,
    'REBUILD_AI_POLICY:20261112000000:listings:select-active-owner-participant'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.listings'::regclass,
    'owners create listings',
    $statement$create policy "owners create listings" on public.listings for insert to authenticated with check (seller_id = (select auth.uid()) and status = 'active' and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())))$statement$,
    'REBUILD_AI_POLICY:20261112000000:listings:insert-owner-material'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.listings'::regclass,
    'owners update listings',
    $statement$create policy "owners update listings" on public.listings for update to authenticated using (seller_id = (select auth.uid())) with check (seller_id = (select auth.uid()) and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())))$statement$,
    'REBUILD_AI_POLICY:20261112000000:listings:update-owner-material'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.listings'::regclass,
    'owners delete listings',
    $statement$create policy "owners delete listings" on public.listings for delete to authenticated using (seller_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:listings:delete-owner'
  );

  perform pg_temp.ensure_rebuild_policy(
    'public.inquiries'::regclass,
    'participants read inquiries',
    $statement$create policy "participants read inquiries" on public.inquiries for select to authenticated using (sender_id = (select auth.uid()) or seller_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:inquiries:select-participants'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.inquiries'::regclass,
    'signed-in users send inquiries',
    $statement$create policy "signed-in users send inquiries" on public.inquiries for insert to authenticated with check (sender_id = (select auth.uid()) and sender_id <> seller_id and exists (select 1 from public.listings l where l.id = public.inquiries.listing_id and l.seller_id = public.inquiries.seller_id and l.status = 'active'))$statement$,
    'REBUILD_AI_POLICY:20261112000000:inquiries:insert-signed-active'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.order_requests'::regclass,
    'participants read order requests',
    $statement$create policy "participants read order requests" on public.order_requests for select to authenticated using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:order-requests:select-participants'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.order_requests'::regclass,
    'buyers create order requests',
    $statement$create policy "buyers create order requests" on public.order_requests for insert to authenticated with check (buyer_id = (select auth.uid()) and buyer_id <> seller_id and rebuild_internal.can_create_order_request(public.order_requests.listing_id, public.order_requests.seller_id, public.order_requests.fulfillment))$statement$,
    'REBUILD_AI_POLICY:20261112000000:order-requests:insert-buyer-active'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.order_requests'::regclass,
    'participants update order requests',
    $statement$create policy "participants update order requests" on public.order_requests for update to authenticated using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid())) with check (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:order-requests:update-participants'
  );

  perform pg_temp.ensure_rebuild_policy(
    'public.reuse_projects'::regclass,
    'reuse ideas are public',
    $statement$create policy "reuse ideas are public" on public.reuse_projects for select to anon, authenticated using (true)$statement$,
    'REBUILD_AI_POLICY:20261112000000:reuse-projects:public-read'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.saved_projects'::regclass,
    'users save own projects',
    $statement$create policy "users save own projects" on public.saved_projects for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and (material_id is null or exists (select 1 from public.materials m where m.id = public.saved_projects.material_id and m.owner_id = (select auth.uid()))))$statement$,
    'REBUILD_AI_POLICY:20261112000000:saved-projects:all-owner-material'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.material_actions'::regclass,
    'users manage own material actions',
    $statement$create policy "users manage own material actions" on public.material_actions for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())))$statement$,
    'REBUILD_AI_POLICY:20261112000000:material-actions:all-owner-material'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.notifications'::regclass,
    'users manage own notifications',
    $statement$create policy "users manage own notifications" on public.notifications for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:notifications:all-owner'
  );

  perform pg_temp.ensure_rebuild_policy(
    'public.profiles'::regclass,
    'rebuild guard profile inserts',
    $statement$create policy "rebuild guard profile inserts" on public.profiles as restrictive for insert to authenticated with check (id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-profiles:insert-own'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.profiles'::regclass,
    'rebuild guard profile updates',
    $statement$create policy "rebuild guard profile updates" on public.profiles as restrictive for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-profiles:update-own'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.materials'::regclass,
    'rebuild guard material access',
    $statement$create policy "rebuild guard material access" on public.materials as restrictive for select to anon, authenticated using (owner_id = (select auth.uid()) or rebuild_internal.can_read_material(public.materials.id))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-materials:owner-listed-participant'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.materials'::regclass,
    'rebuild guard material inserts',
    $statement$create policy "rebuild guard material inserts" on public.materials as restrictive for insert to authenticated with check (owner_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-materials:insert-owner'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.materials'::regclass,
    'rebuild guard material updates',
    $statement$create policy "rebuild guard material updates" on public.materials as restrictive for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-materials:update-owner'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.materials'::regclass,
    'rebuild guard material deletes',
    $statement$create policy "rebuild guard material deletes" on public.materials as restrictive for delete to authenticated using (owner_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-materials:delete-owner'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.material_images'::regclass,
    'rebuild guard material image access',
    $statement$create policy "rebuild guard material image access" on public.material_images as restrictive for select to anon, authenticated using (owner_id = (select auth.uid()) or rebuild_internal.can_read_listed_material_image(public.material_images.material_id, public.material_images.owner_id, public.material_images.storage_path, public.material_images.content_type))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-material-images:owner-or-listed-path'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.material_images'::regclass,
    'rebuild guard material image inserts',
    $statement$create policy "rebuild guard material image inserts" on public.material_images as restrictive for insert to authenticated with check (owner_id = (select auth.uid()) and split_part(storage_path, '/', 1) = (select auth.uid())::text and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-material-images:insert-owner'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.material_images'::regclass,
    'rebuild guard material image updates',
    $statement$create policy "rebuild guard material image updates" on public.material_images as restrictive for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and split_part(storage_path, '/', 1) = (select auth.uid())::text and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-material-images:update-owner'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.material_images'::regclass,
    'rebuild guard material image deletes',
    $statement$create policy "rebuild guard material image deletes" on public.material_images as restrictive for delete to authenticated using (owner_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-material-images:delete-owner'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.ai_analyses'::regclass,
    'rebuild guard analysis access',
    $statement$create policy "rebuild guard analysis access" on public.ai_analyses as restrictive for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-analyses:owner-material'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.listings'::regclass,
    'rebuild guard listing access',
    $statement$create policy "rebuild guard listing access" on public.listings as restrictive for select to anon, authenticated using (rebuild_internal.can_read_listing(public.listings.id))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-listings:active-owner-participant'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.listings'::regclass,
    'rebuild guard listing inserts',
    $statement$create policy "rebuild guard listing inserts" on public.listings as restrictive for insert to authenticated with check (seller_id = (select auth.uid()) and status = 'active' and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-listings:insert-owner'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.listings'::regclass,
    'rebuild guard listing updates',
    $statement$create policy "rebuild guard listing updates" on public.listings as restrictive for update to authenticated using (seller_id = (select auth.uid())) with check (seller_id = (select auth.uid()) and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-listings:update-owner'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.listings'::regclass,
    'rebuild guard listing deletes',
    $statement$create policy "rebuild guard listing deletes" on public.listings as restrictive for delete to authenticated using (seller_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-listings:delete-owner'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.inquiries'::regclass,
    'rebuild guard inquiry access',
    $statement$create policy "rebuild guard inquiry access" on public.inquiries as restrictive for all to authenticated using (sender_id = (select auth.uid()) or seller_id = (select auth.uid())) with check (sender_id = (select auth.uid()) and sender_id <> seller_id and exists (select 1 from public.listings l where l.id = public.inquiries.listing_id and l.seller_id = public.inquiries.seller_id and l.status = 'active'))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-inquiries:participants'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.order_requests'::regclass,
    'rebuild guard order request access',
    $statement$create policy "rebuild guard order request access" on public.order_requests as restrictive for all to authenticated using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid())) with check (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-order-requests:participants'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.saved_projects'::regclass,
    'rebuild guard saved project access',
    $statement$create policy "rebuild guard saved project access" on public.saved_projects as restrictive for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and (material_id is null or exists (select 1 from public.materials m where m.id = public.saved_projects.material_id and m.owner_id = (select auth.uid()))))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-saved-projects:owner-material'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.material_actions'::regclass,
    'rebuild guard material action access',
    $statement$create policy "rebuild guard material action access" on public.material_actions as restrictive for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-material-actions:owner-material'
  );
  perform pg_temp.ensure_rebuild_policy(
    'public.notifications'::regclass,
    'rebuild guard notification access',
    $statement$create policy "rebuild guard notification access" on public.notifications as restrictive for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-notifications:owner'
  );
end
$policy_setup$;

with seed(title, description, categories, requirements) as (
  values
    ('Workshop shelving', 'Turn suitable surplus timber into small storage for a workshop. Check dimensions, moisture, and condition before use.', array['wood']::text[], jsonb_build_array(jsonb_build_object('material', 'wood', 'minimum_quantity', 1, 'unit', 'piece'))),
    ('Robotics prototype', 'Explore whether a working motor can support a low-risk educational robotics prototype. Verify its electrical and mechanical specifications first.', array['mechanical','electrical','electronics']::text[], jsonb_build_array(jsonb_build_object('material', 'mechanical', 'minimum_quantity', 1, 'unit', 'component'))),
    ('Electronics learning kit', 'Recover suitable components for supervised educational experiments after qualified inspection.', array['electronics','electrical']::text[], jsonb_build_array(jsonb_build_object('material', 'electronics', 'minimum_quantity', 1, 'unit', 'component'))),
    ('Metal fabrication sample', 'Use suitable offcuts for a non-structural fabrication prototype. Confirm the alloy and condition before work.', array['metal']::text[], jsonb_build_array(jsonb_build_object('material', 'metal', 'minimum_quantity', 1, 'unit', 'piece')))
)
insert into public.reuse_projects (title, description, categories, requirements)
select seed.title, seed.description, seed.categories, seed.requirements
from seed
where not exists (
  select 1 from public.reuse_projects existing where existing.title = seed.title
);

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('material-uploads', 'material-uploads', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

do $storage_policy_setup$
begin
  perform pg_temp.ensure_rebuild_policy(
    'storage.objects'::regclass,
    'owners upload material images',
    $statement$create policy "owners upload material images" on storage.objects for insert to authenticated with check (bucket_id = 'material-uploads' and metadata ->> 'mimetype' in ('image/jpeg','image/png','image/webp') and split_part(name, '/', 1) = (select auth.uid())::text)$statement$,
    'REBUILD_AI_POLICY:20261112000000:storage:insert-owner-folder'
  );
  perform pg_temp.ensure_rebuild_policy(
    'storage.objects'::regclass,
    'owners read material images',
    $statement$create policy "owners read material images" on storage.objects for select to authenticated using (bucket_id = 'material-uploads' and split_part(name, '/', 1) = (select auth.uid())::text)$statement$,
    'REBUILD_AI_POLICY:20261112000000:storage:select-owner-folder'
  );
  perform pg_temp.ensure_rebuild_policy(
    'storage.objects'::regclass,
    'active listing images may be signed',
    $statement$create policy "active listing images may be signed" on storage.objects for select to anon, authenticated using (bucket_id = 'material-uploads' and rebuild_internal.can_read_active_listing_image(storage.objects.name, storage.objects.metadata ->> 'mimetype'))$statement$,
    'REBUILD_AI_POLICY:20261112000000:storage:select-active-listed-owner-folder'
  );
  perform pg_temp.ensure_rebuild_policy(
    'storage.objects'::regclass,
    'owners delete material images',
    $statement$create policy "owners delete material images" on storage.objects for delete to authenticated using (bucket_id = 'material-uploads' and split_part(name, '/', 1) = (select auth.uid())::text)$statement$,
    'REBUILD_AI_POLICY:20261112000000:storage:delete-owner-folder'
  );
  perform pg_temp.ensure_rebuild_policy(
    'storage.objects'::regclass,
    'rebuild guard storage reads',
    $statement$create policy "rebuild guard storage reads" on storage.objects as restrictive for select to anon, authenticated using (bucket_id <> 'material-uploads' or (bucket_id = 'material-uploads' and (split_part(storage.objects.name, '/', 1) = (select auth.uid())::text or rebuild_internal.can_read_active_listing_image(storage.objects.name, storage.objects.metadata ->> 'mimetype'))))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-storage:owner-or-active-image'
  );
  perform pg_temp.ensure_rebuild_policy(
    'storage.objects'::regclass,
    'rebuild guard storage inserts',
    $statement$create policy "rebuild guard storage inserts" on storage.objects as restrictive for insert to authenticated with check (bucket_id <> 'material-uploads' or (bucket_id = 'material-uploads' and metadata ->> 'mimetype' in ('image/jpeg','image/png','image/webp') and split_part(name, '/', 1) = (select auth.uid())::text))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-storage:insert-owner-folder'
  );
  perform pg_temp.ensure_rebuild_policy(
    'storage.objects'::regclass,
    'rebuild guard storage deletes',
    $statement$create policy "rebuild guard storage deletes" on storage.objects as restrictive for delete to authenticated using (bucket_id <> 'material-uploads' or (bucket_id = 'material-uploads' and split_part(name, '/', 1) = (select auth.uid())::text))$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-storage:delete-owner-folder'
  );
  perform pg_temp.ensure_rebuild_policy(
    'storage.objects'::regclass,
    'rebuild guard storage updates',
    $statement$create policy "rebuild guard storage updates" on storage.objects as restrictive for update to anon, authenticated using (bucket_id <> 'material-uploads') with check (bucket_id <> 'material-uploads')$statement$,
    'REBUILD_AI_POLICY:20261112000000:guard-storage:no-update'
  );
end
$storage_policy_setup$;

commit;
