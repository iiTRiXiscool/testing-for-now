-- Koxyos migration 002: staff-managed service categories + a drag-and-drop
-- shop gallery, replacing the hardcoded hair/beard/both categories and the
-- static placeholder gallery tiles.

create table if not exists categories (
  id          text primary key,          -- e.g. 'c_1699999999123'
  shop_id     uuid not null references shops(id) on delete cascade,
  key         text not null,             -- stable slug stored on services.category, e.g. 'kids-cuts'
  label_en    text not null default '',
  label_fr    text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (shop_id, key)
);
create index if not exists idx_categories_shop on categories(shop_id);

create table if not exists gallery_images (
  id          text primary key,          -- e.g. 'g_1699999999123'
  shop_id     uuid not null references shops(id) on delete cascade,
  url         text not null,
  caption_en  text not null default '',
  caption_fr  text not null default '',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists idx_gallery_shop on gallery_images(shop_id);

-- Backfill: turn every category value already used by an existing service
-- into a real, staff-editable category row, so nothing a shop already saved
-- (including the old hardcoded 'hair' / 'beard' / 'both') disappears from
-- the menu tabs once categories stop being hardcoded.
insert into categories (id, shop_id, key, label_en, label_fr, sort_order)
select
  'c_' || replace(gen_random_uuid()::text, '-', ''),
  shop_id,
  category,
  initcap(replace(category, '-', ' ')),
  initcap(replace(category, '-', ' ')),
  row_number() over (partition by shop_id order by first_created)
from (
  select shop_id, category, min(created_at) as first_created
  from services
  group by shop_id, category
) grouped
on conflict (shop_id, key) do nothing;
