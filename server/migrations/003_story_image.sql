-- Adds a single site-wide photo for the homepage's "story" section (the
-- one next to "Since 2020" / "Depuis 2020"). Lives on the shops row itself
-- since there's exactly one per shop, same as shop_name/tagline/whatsapp.
alter table shops add column if not exists story_image_url text not null default '';
