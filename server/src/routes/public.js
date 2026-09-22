const express = require('express');
const db = require('../db');
const { loadShopOr404 } = require('../shops');

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

module.exports = router;
