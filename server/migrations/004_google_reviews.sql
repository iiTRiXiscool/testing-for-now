-- Google Reviews widget: each shop can point at its own Google Business
-- listing (google_place_id) so one deployed codebase + one Google API key
-- (owned by whoever resells this template) can serve many different real
-- shops' reviews, each showing only their own.
--
-- Reviews themselves aren't stored row-by-row — Google's free API only
-- ever returns up to 5 "most relevant" reviews for a place, re-fetching
-- the same handful each time, so there's nothing to accumulate. We just
-- cache that small JSON blob with a timestamp to avoid hitting Google on
-- every homepage visit.
alter table shops add column if not exists google_place_id text not null default '';
alter table shops add column if not exists google_reviews_min_rating integer not null default 4;
alter table shops add column if not exists google_reviews_cache jsonb;
alter table shops add column if not exists google_reviews_cached_at timestamptz;
