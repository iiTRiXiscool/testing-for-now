-- Koxyos data-layer schema.
-- Works on any standard PostgreSQL instance (Neon, Supabase, Railway,
-- Render, RDS, self-hosted, etc). Nothing here is provider-specific.

create extension if not exists pgcrypto; -- gives us gen_random_uuid()

-- One row per barbershop client ("tenant"). The `slug` is what each
-- deployed frontend is pointed at via config.js (KOXYOS_CONFIG.shopSlug).
create table if not exists shops (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  shop_name     text not null default 'Koxyos',
  tagline       text not null default '',
  whatsapp      text not null default '',
  password_hash text not null,           -- bcrypt hash, never sent to the frontend
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists barbers (
  id          text primary key,          -- e.g. 'b_1699999999123'
  shop_id     uuid not null references shops(id) on delete cascade,
  name        text not null,
  specialty   text not null default '',
  photo       text not null default '',
  schedule    jsonb not null default '{"mon":[],"tue":[],"wed":[],"thu":[],"fri":[],"sat":[],"sun":[]}',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_barbers_shop on barbers(shop_id);

create table if not exists services (
  id          text primary key,          -- e.g. 'm_1699999999123'
  shop_id     uuid not null references shops(id) on delete cascade,
  category    text not null default 'hair',   -- 'hair' | 'beard' | 'both'
  name_en     text not null default '',
  name_fr     text not null default '',
  duration    text not null default '',
  price       text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_services_shop on services(shop_id);
