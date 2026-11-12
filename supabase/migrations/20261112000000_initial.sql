-- Run this migration in the Supabase SQL Editor for the existing project.
-- The app uses the publishable key only; RLS is the authorization boundary.

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

create or replace function public.guard_listing_updates()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' and new.status <> 'active' then
    raise exception 'New listings must start active';
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
drop trigger if exists guard_listing_updates on public.listings;
create trigger guard_listing_updates before insert or update on public.listings
  for each row execute procedure public.guard_listing_updates();

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

create unique index if not exists order_requests_one_accepted_per_listing_idx
  on public.order_requests(listing_id) where status in ('accepted','completed');

create or replace function public.guard_order_request_updates()
returns trigger language plpgsql set search_path = '' as $$
declare
  current_user_id uuid := (select auth.uid());
begin
  if new.buyer_id <> old.buyer_id or new.seller_id <> old.seller_id or new.listing_id <> old.listing_id then
    raise exception 'Order participants and listing cannot be changed';
  end if;
  if new.buyer_completed_at is distinct from old.buyer_completed_at and current_user_id <> old.buyer_id then
    raise exception 'Only the buyer can confirm buyer completion';
  end if;
  if new.seller_completed_at is distinct from old.seller_completed_at and current_user_id <> old.seller_id then
    raise exception 'Only the seller can confirm seller completion';
  end if;
  if new.status is distinct from old.status and not (
    current_user_id = old.seller_id and old.status = 'requested' and new.status in ('accepted','declined')
  ) then
    raise exception 'Only the seller can accept or decline a new request';
  end if;
  if new.status = 'accepted' and not exists (
    select 1 from public.listings l where l.id = new.listing_id and l.status = 'active'
  ) then
    raise exception 'This listing is no longer available';
  end if;
  if old.status = 'accepted' and new.buyer_completed_at is not null and new.seller_completed_at is not null then
    new.status := 'completed';
  elsif new.status = 'completed' and (new.buyer_completed_at is null or new.seller_completed_at is null) then
    raise exception 'Both sides must confirm completion';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
drop trigger if exists guard_order_request_updates on public.order_requests;
create trigger guard_order_request_updates before update on public.order_requests
  for each row execute procedure public.guard_order_request_updates();

create or replace function public.mark_listing_sold_after_confirmations()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.status = 'completed' and old.status <> 'completed' then
    update public.listings set status = 'sold', updated_at = now()
    where id = new.listing_id and status = 'active';
  end if;
  return new;
end;
$$;
drop trigger if exists mark_listing_sold_after_confirmations on public.order_requests;
create trigger mark_listing_sold_after_confirmations after update on public.order_requests
  for each row execute procedure public.mark_listing_sold_after_confirmations();

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

create index if not exists materials_owner_created_idx on public.materials(owner_id, created_at desc);
create index if not exists materials_category_idx on public.materials(category);
create index if not exists listings_status_created_idx on public.listings(status, created_at desc);
create index if not exists order_requests_buyer_idx on public.order_requests(buyer_id, created_at desc);
create index if not exists order_requests_seller_idx on public.order_requests(seller_id, created_at desc);
create index if not exists material_actions_owner_status_idx on public.material_actions(owner_id, action_type, status);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), 'REBUILD member'))
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

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

create policy "public seller names are readable" on public.profiles for select to anon, authenticated using (true);
create policy "users insert own profile" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "users update own profile" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

create policy "owners and listed materials readable" on public.materials for select to anon, authenticated
  using (owner_id = (select auth.uid()) or exists (
    select 1 from public.listings l where l.material_id = public.materials.id and l.status = 'active'
  ) or exists (
    select 1 from public.listings l join public.order_requests r on r.listing_id = l.id
    where l.material_id = public.materials.id and (r.buyer_id = (select auth.uid()) or r.seller_id = (select auth.uid()))
  ));
create policy "users create own materials" on public.materials for insert to authenticated with check (owner_id = (select auth.uid()));
create policy "users update own materials" on public.materials for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "users delete own materials" on public.materials for delete to authenticated using (owner_id = (select auth.uid()));

create policy "owners read material images" on public.material_images for select to authenticated using (owner_id = (select auth.uid()));
create policy "active listing image paths are public" on public.material_images for select to anon, authenticated using (
  exists (select 1 from public.listings l where l.material_id = public.material_images.material_id and l.status = 'active')
);
create policy "owners add material images" on public.material_images for insert to authenticated with check (owner_id = (select auth.uid()) and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())));
create policy "owners delete material images" on public.material_images for delete to authenticated using (owner_id = (select auth.uid()));

create policy "owners read analyses" on public.ai_analyses for select to authenticated using (owner_id = (select auth.uid()));
create policy "owners create analyses" on public.ai_analyses for insert to authenticated with check (owner_id = (select auth.uid()) and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())));

create policy "active listings and order participants are readable" on public.listings for select to anon, authenticated using (
  status = 'active' or seller_id = (select auth.uid()) or exists (
    select 1 from public.order_requests r where r.listing_id = public.listings.id
      and (r.buyer_id = (select auth.uid()) or r.seller_id = (select auth.uid()))
  )
);
create policy "owners create listings" on public.listings for insert to authenticated with check (seller_id = (select auth.uid()) and status = 'active' and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())));
create policy "owners update listings" on public.listings for update to authenticated using (seller_id = (select auth.uid())) with check (
  seller_id = (select auth.uid()) and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid()))
);
create policy "owners delete listings" on public.listings for delete to authenticated using (seller_id = (select auth.uid()));

create policy "participants read inquiries" on public.inquiries for select to authenticated using (sender_id = (select auth.uid()) or seller_id = (select auth.uid()));
create policy "signed-in users send inquiries" on public.inquiries for insert to authenticated with check (
  sender_id = (select auth.uid()) and sender_id <> seller_id and exists (
    select 1 from public.listings l where l.id = public.inquiries.listing_id and l.seller_id = public.inquiries.seller_id and l.status = 'active'
  )
);
create policy "participants read order requests" on public.order_requests for select to authenticated using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));
create policy "buyers create order requests" on public.order_requests for insert to authenticated with check (
  buyer_id = (select auth.uid()) and buyer_id <> seller_id and exists (
    select 1 from public.listings l where l.id = public.order_requests.listing_id
      and l.seller_id = public.order_requests.seller_id and l.status = 'active'
      and public.order_requests.fulfillment = any(l.fulfillment)
  )
);
create policy "participants update order requests" on public.order_requests for update to authenticated using (buyer_id = (select auth.uid()) or seller_id = (select auth.uid())) with check (buyer_id = (select auth.uid()) or seller_id = (select auth.uid()));

create policy "reuse ideas are public" on public.reuse_projects for select to anon, authenticated using (true);
create policy "users save own projects" on public.saved_projects for all to authenticated using (owner_id = (select auth.uid())) with check (
  owner_id = (select auth.uid()) and (
    material_id is null or exists (
      select 1 from public.materials m where m.id = public.saved_projects.material_id and m.owner_id = (select auth.uid())
    )
  )
);
create policy "users manage own material actions" on public.material_actions for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and exists (select 1 from public.materials m where m.id = material_id and m.owner_id = (select auth.uid())));
create policy "users manage own notifications" on public.notifications for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

insert into public.reuse_projects (title, description, categories, requirements) values
  ('Workshop shelving', 'Turn suitable surplus timber into small storage for a workshop. Check dimensions, moisture, and condition before use.', array['wood'], '[{"material":"wood","minimum_quantity":1,"unit":"piece"}]'),
  ('Robotics prototype', 'Explore whether a working motor can support a low-risk educational robotics prototype. Verify its electrical and mechanical specifications first.', array['mechanical','electrical','electronics'], '[{"material":"mechanical","minimum_quantity":1,"unit":"component"}]'),
  ('Electronics learning kit', 'Recover suitable components for supervised educational experiments after qualified inspection.', array['electronics','electrical'], '[{"material":"electronics","minimum_quantity":1,"unit":"component"}]'),
  ('Metal fabrication sample', 'Use suitable offcuts for a non-structural fabrication prototype. Confirm the alloy and condition before work.', array['metal'], '[{"material":"metal","minimum_quantity":1,"unit":"piece"}]')
on conflict do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('material-uploads', 'material-uploads', false, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = false, file_size_limit = 5242880, allowed_mime_types = array['image/jpeg','image/png','image/webp'];

create policy "owners upload material images" on storage.objects for insert to authenticated
  with check (bucket_id = 'material-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "owners read material images" on storage.objects for select to authenticated
  using (bucket_id = 'material-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "active listing images may be signed" on storage.objects for select to anon, authenticated
  using (bucket_id = 'material-uploads' and exists (
    select 1 from public.material_images mi
    join public.listings l on l.material_id = mi.material_id
    where mi.storage_path = name and l.status = 'active'
  ));
create policy "owners delete material images" on storage.objects for delete to authenticated
  using (bucket_id = 'material-uploads' and (storage.foldername(name))[1] = (select auth.uid())::text);
