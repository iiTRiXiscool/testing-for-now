const express = require('express');
const db = require('../db');
const { loadShopOr404 } = require('../shops');
const googlePlaces = require('../googlePlaces');

const router = express.Router({ mergeParams: true });

router.use(loadShopOr404);

// GET /api/shops/:slug/config
// Never includes password_hash — customers/browsers never see it.
router.get('/config', (req, res) => {
  const s = req.shopRow;
  res.json({
    shopName: s.shop_name,
    tagline: s.tagline,
    whatsapp: s.whatsapp,
    storyImageUrl: s.story_image_url,
  });
});

// GET /api/shops/:slug/barbers
router.get('/barbers', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'select id, name, specialty, photo, schedule from barbers where shop_id = $1 order by sort_order, created_at',
      [req.shopRow.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// GET /api/shops/:slug/services
router.get('/services', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'select id, category, name_en, name_fr, duration, price from services where shop_id = $1 order by sort_order, created_at',
      [req.shopRow.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// GET /api/shops/:slug/categories
router.get('/categories', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'select id, key, label_en, label_fr, sort_order from categories where shop_id = $1 order by sort_order, created_at',
      [req.shopRow.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// GET /api/shops/:slug/gallery
router.get('/gallery', async (req, res, next) => {
  try {
    const { rows } = await db.query(
      'select id, url, caption_en, caption_fr, sort_order from gallery_images where shop_id = $1 order by sort_order, created_at',
      [req.shopRow.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

const GOOGLE_REVIEWS_CACHE_MS = 12 * 60 * 60 * 1000; // 12 hours

// GET /api/shops/:slug/google-reviews
// { configured: false } if this shop hasn't set up a Google listing yet —
// the frontend just hides the whole section in that case, no error shown.
router.get('/google-reviews', async (req, res, next) => {
  try {
    const shop = req.shopRow;
    if (!shop.google_place_id) {
      return res.json({ configured: false });
    }

    const isStale =
      !shop.google_reviews_cache ||
      !shop.google_reviews_cached_at ||
      Date.now() - new Date(shop.google_reviews_cached_at).getTime() > GOOGLE_REVIEWS_CACHE_MS;

    let cache = shop.google_reviews_cache;
    if (isStale) {
      try {
        const details = await googlePlaces.fetchPlaceDetails(shop.google_place_id);
        cache = googlePlaces.shapeDetails(shop.google_place_id, details);
        await db.query('update shops set google_reviews_cache = $1, google_reviews_cached_at = now() where id = $2', [
          JSON.stringify(cache),
          shop.id,
        ]);
      } catch (e) {
        // Google hiccup or a stale/deleted place id — fall back to
        // whatever we last cached rather than breaking the homepage.
        if (!cache) return res.json({ configured: false });
      }
    }

    const minRating = shop.google_reviews_min_rating || 1;
    const reviews = (cache.reviews || [])
      .filter((r) => r.rating >= minRating)
      .sort((a, b) => b.rating - a.rating || b.time - a.time)
      .slice(0, 5);

    res.json({
      configured: true,
      name: cache.name,
      rating: cache.rating,
      totalReviews: cache.totalReviews,
      minRating: shop.google_reviews_min_rating,
      mapsUrl: cache.mapsUrl,
      writeReviewUrl: cache.writeReviewUrl,
      reviews,
    });
  } catch (e) {
    next(e);
  }
});

module.exports = router;
