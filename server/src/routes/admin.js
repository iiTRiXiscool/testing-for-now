const express = require('express');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { loadShopOr404 } = require('../shops');
const { issueAdminToken, requireAdmin } = require('../auth');
const googlePlaces = require('../googlePlaces');

const router = express.Router({ mergeParams: true });

function newId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

function slugify(s) {
  return String(s || '')
    .toLowerCase()
    .trim()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // strip accents
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
}

// ---------------- image uploads ----------------
// Local-disk storage so this works out of the box with zero extra services.
// Files are served back out statically from /uploads (see src/index.js).
// If you move off a single persistent disk (serverless, multi-instance
// hosting, etc), swap this `storage` for an S3/Cloudinary/etc. adapter —
// everything else (the route, the response shape) can stay the same.
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

const uploadStorage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = (path.extname(file.originalname) || '').toLowerCase().replace(/[^a-z0-9.]/g, '').slice(0, 10);
    cb(null, `${req.shop.id}_${Date.now()}_${crypto.randomBytes(4).toString('hex')}${ext}`);
  },
});

const upload = multer({
  storage: uploadStorage,
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.has(file.mimetype)) {
      return cb(new Error('Only JPEG, PNG, WEBP, or GIF images are allowed.'));
    }
    cb(null, true);
  },
});

const EMPTY_SCHEDULE = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [] };
const DAY_KEYS = Object.keys(EMPTY_SCHEDULE);
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function isValidSchedule(schedule) {
  if (!schedule || typeof schedule !== 'object') return false;
  return DAY_KEYS.every((k) => Array.isArray(schedule[k]) && schedule[k].every((t) => TIME_RE.test(t)));
}

// Slow down brute-force login attempts per IP (mirrors + backs up the
// existing client-side lockout, which a caller could otherwise bypass).
const loginLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 8,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many login attempts. Please wait a moment and try again.' },
});

// POST /api/shops/:slug/admin/login  { password }
router.post('/login', loginLimiter, loadShopOr404, async (req, res, next) => {
  try {
    const { password } = req.body || {};
    if (typeof password !== 'string' || !password) {
      return res.status(400).json({ error: 'Password is required.' });
    }
    const ok = await bcrypt.compare(password, req.shopRow.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Wrong password.' });
    }
    const token = issueAdminToken(req.shopRow);
    res.json({ token });
  } catch (e) {
    next(e);
  }
});

// Everything below requires a valid admin session for this shop.
router.use(loadShopOr404, requireAdmin);

// ---------------- shop config ----------------

// PUT /api/shops/:slug/admin/config  { shopName?, tagline?, whatsapp?, storyImageUrl? }
// Partial update — only the fields you send are changed, so this page's
// story-photo save doesn't wipe the shop name/tagline/whatsapp set from
// barbershop-booking.html's General tab, and vice versa.
router.put('/config', async (req, res, next) => {
  try {
    const current = req.shopRow;
    const body = req.body || {};
    const next_ = {
      shop_name: body.shopName !== undefined ? String(body.shopName).trim() || current.shop_name : current.shop_name,
      tagline: body.tagline !== undefined ? String(body.tagline).trim() : current.tagline,
      whatsapp: body.whatsapp !== undefined ? String(body.whatsapp).trim() : current.whatsapp,
      story_image_url:
        body.storyImageUrl !== undefined ? String(body.storyImageUrl).trim() : current.story_image_url,
    };
    const { rows } = await db.query(
      `update shops set shop_name = $1, tagline = $2, whatsapp = $3, story_image_url = $4, updated_at = now()
       where id = $5
       returning shop_name, tagline, whatsapp, story_image_url`,
      [next_.shop_name, next_.tagline, next_.whatsapp, next_.story_image_url, req.shop.id]
    );
    res.json({
      shopName: rows[0].shop_name,
      tagline: rows[0].tagline,
      whatsapp: rows[0].whatsapp,
      storyImageUrl: rows[0].story_image_url,
    });
  } catch (e) {
    next(e);
  }
});

// PUT /api/shops/:slug/admin/password  { newPassword }
router.put('/password', async (req, res, next) => {
  try {
    const { newPassword } = req.body || {};
    if (typeof newPassword !== 'string' || newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters.' });
    }
    const hash = await bcrypt.hash(newPassword, 10);
    await db.query('update shops set password_hash = $1, updated_at = now() where id = $2', [hash, req.shop.id]);
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------- barbers ----------------

// POST /api/shops/:slug/admin/barbers  { name, specialty, photo }
router.post('/barbers', async (req, res, next) => {
  try {
    const { name, specialty, photo } = req.body || {};
    if (typeof name !== 'string' || !name.trim()) {
      return res.status(400).json({ error: 'Barber name is required.' });
    }
    const id = newId('b');
    const { rows } = await db.query(
      `insert into barbers (id, shop_id, name, specialty, photo, schedule)
       values ($1, $2, $3, $4, $5, $6)
       returning id, name, specialty, photo, schedule`,
      [id, req.shop.id, name.trim(), (specialty || '').trim(), (photo || '').trim(), JSON.stringify(EMPTY_SCHEDULE)]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// PUT /api/shops/:slug/admin/barbers/:id  { name?, specialty?, photo? }
router.put('/barbers/:id', async (req, res, next) => {
  try {
    const { name, specialty, photo } = req.body || {};
    const { rows: existingRows } = await db.query('select * from barbers where id = $1 and shop_id = $2', [
      req.params.id,
      req.shop.id,
    ]);
    if (!existingRows[0]) return res.status(404).json({ error: 'Barber not found.' });
    const current = existingRows[0];
    const { rows } = await db.query(
      `update barbers set name = $1, specialty = $2, photo = $3, updated_at = now()
       where id = $4 and shop_id = $5
       returning id, name, specialty, photo, schedule`,
      [
        name !== undefined ? String(name).trim() : current.name,
        specialty !== undefined ? String(specialty).trim() : current.specialty,
        photo !== undefined ? String(photo).trim() : current.photo,
        req.params.id,
        req.shop.id,
      ]
    );
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// PUT /api/shops/:slug/admin/barbers/:id/schedule  { schedule }
// Replaces the whole weekly schedule object in one call (simplest way to
// support both "add slot" and "remove slot" from the existing admin UI).
router.put('/barbers/:id/schedule', async (req, res, next) => {
  try {
    const { schedule } = req.body || {};
    if (!isValidSchedule(schedule)) {
      return res.status(400).json({ error: 'Schedule must map mon..sun to arrays of "HH:MM" times.' });
    }
    const { rows } = await db.query(
      `update barbers set schedule = $1, updated_at = now()
       where id = $2 and shop_id = $3
       returning id, name, specialty, photo, schedule`,
      [JSON.stringify(schedule), req.params.id, req.shop.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Barber not found.' });
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/shops/:slug/admin/barbers/:id
router.delete('/barbers/:id', async (req, res, next) => {
  try {
    const { rowCount } = await db.query('delete from barbers where id = $1 and shop_id = $2', [
      req.params.id,
      req.shop.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Barber not found.' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------- services / menu items ----------------

// POST /api/shops/:slug/admin/services  { category, name_en, name_fr, duration, price }
router.post('/services', async (req, res, next) => {
  try {
    const { category, name_en, name_fr, duration, price } = req.body || {};
    if (!(name_en && name_en.trim()) && !(name_fr && name_fr.trim())) {
      return res.status(400).json({ error: 'At least one of name_en / name_fr is required.' });
    }
    const id = newId('m');
    const { rows } = await db.query(
      `insert into services (id, shop_id, category, name_en, name_fr, duration, price)
       values ($1, $2, $3, $4, $5, $6, $7)
       returning id, category, name_en, name_fr, duration, price`,
      [
        id,
        req.shop.id,
        (category || 'hair').trim(),
        (name_en || '').trim(),
        (name_fr || '').trim(),
        (duration || '').trim(),
        (price || '').trim(),
      ]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// PUT /api/shops/:slug/admin/services/:id  { category?, name_en?, name_fr?, duration?, price? }
router.put('/services/:id', async (req, res, next) => {
  try {
    const { rows: existingRows } = await db.query('select * from services where id = $1 and shop_id = $2', [
      req.params.id,
      req.shop.id,
    ]);
    if (!existingRows[0]) return res.status(404).json({ error: 'Service not found.' });
    const current = existingRows[0];
    const body = req.body || {};
    const next_ = {
      category: body.category !== undefined ? String(body.category).trim() : current.category,
      name_en: body.name_en !== undefined ? String(body.name_en).trim() : current.name_en,
      name_fr: body.name_fr !== undefined ? String(body.name_fr).trim() : current.name_fr,
      duration: body.duration !== undefined ? String(body.duration).trim() : current.duration,
      price: body.price !== undefined ? String(body.price).trim() : current.price,
    };
    const { rows } = await db.query(
      `update services set category = $1, name_en = $2, name_fr = $3, duration = $4, price = $5, updated_at = now()
       where id = $6 and shop_id = $7
       returning id, category, name_en, name_fr, duration, price`,
      [next_.category, next_.name_en, next_.name_fr, next_.duration, next_.price, req.params.id, req.shop.id]
    );
    res.json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/shops/:slug/admin/services/:id
router.delete('/services/:id', async (req, res, next) => {
  try {
    const { rowCount } = await db.query('delete from services where id = $1 and shop_id = $2', [
      req.params.id,
      req.shop.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Service not found.' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------- service categories ----------------
// A category is { id, key, label_en, label_fr, sort_order }. "key" is a
// stable slug (derived from the label) that gets stored on services.category
// and is never shown to customers directly.

// POST /api/shops/:slug/admin/categories  { label_en, label_fr }
router.post('/categories', async (req, res, next) => {
  try {
    const { label_en, label_fr } = req.body || {};
    const en = (label_en || '').trim();
    const fr = (label_fr || '').trim();
    if (!en && !fr) {
      return res.status(400).json({ error: 'At least one of label_en / label_fr is required.' });
    }

    let key = slugify(en || fr);
    if (!key) {
      return res.status(400).json({ error: 'Could not derive a category key from that label — try adding a letter or number.' });
    }
    // Keys must be unique per shop; suffix -2, -3, ... on a clash.
    let candidate = key;
    for (let n = 2; n <= 50; n++) {
      const { rows: clash } = await db.query('select 1 from categories where shop_id = $1 and key = $2', [
        req.shop.id,
        candidate,
      ]);
      if (!clash[0]) { key = candidate; break; }
      candidate = `${key}-${n}`;
    }

    const { rows: maxRows } = await db.query(
      'select coalesce(max(sort_order), -1) + 1 as next from categories where shop_id = $1',
      [req.shop.id]
    );
    const id = newId('c');
    const { rows } = await db.query(
      `insert into categories (id, shop_id, key, label_en, label_fr, sort_order)
       values ($1, $2, $3, $4, $5, $6)
       returning id, key, label_en, label_fr, sort_order`,
      [id, req.shop.id, key, en, fr, maxRows[0].next]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/shops/:slug/admin/categories/:id
// Any service still using this category's key is left alone (it just won't
// match a visible tab anymore, aside from "All") rather than being deleted
// or silently reassigned.
router.delete('/categories/:id', async (req, res, next) => {
  try {
    const { rowCount } = await db.query('delete from categories where id = $1 and shop_id = $2', [
      req.params.id,
      req.shop.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Category not found.' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------- gallery photos ----------------

// POST /api/shops/:slug/admin/gallery  { url, caption_en?, caption_fr? }
// `url` normally comes from a prior POST /admin/uploads call.
router.post('/gallery', async (req, res, next) => {
  try {
    const { url, caption_en, caption_fr } = req.body || {};
    if (typeof url !== 'string' || !url.trim()) {
      return res.status(400).json({ error: 'Image url is required — upload the image first via /admin/uploads.' });
    }
    const { rows: maxRows } = await db.query(
      'select coalesce(max(sort_order), -1) + 1 as next from gallery_images where shop_id = $1',
      [req.shop.id]
    );
    const id = newId('g');
    const { rows } = await db.query(
      `insert into gallery_images (id, shop_id, url, caption_en, caption_fr, sort_order)
       values ($1, $2, $3, $4, $5, $6)
       returning id, url, caption_en, caption_fr, sort_order`,
      [id, req.shop.id, url.trim(), (caption_en || '').trim(), (caption_fr || '').trim(), maxRows[0].next]
    );
    res.status(201).json(rows[0]);
  } catch (e) {
    next(e);
  }
});

// PUT /api/shops/:slug/admin/gallery/reorder  { order: [id1, id2, id3, ...] }
// `order` is every gallery photo id for this shop, in the new display
// order. Ids that don't belong to this shop are silently ignored (the
// where clause below scopes every row to req.shop.id).
router.put('/gallery/reorder', async (req, res, next) => {
  try {
    const { order } = req.body || {};
    if (!Array.isArray(order) || order.length === 0) {
      return res.status(400).json({ error: '"order" must be a non-empty array of gallery photo ids.' });
    }
    const ids = order.map((id) => String(id));
    const positions = order.map((_, i) => i);
    await db.query(
      `update gallery_images as g
       set sort_order = v.pos
       from unnest($1::text[], $2::int[]) as v(id, pos)
       where g.id = v.id and g.shop_id = $3`,
      [ids, positions, req.shop.id]
    );
    const { rows } = await db.query(
      'select id, url, caption_en, caption_fr, sort_order from gallery_images where shop_id = $1 order by sort_order, created_at',
      [req.shop.id]
    );
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

// DELETE /api/shops/:slug/admin/gallery/:id
router.delete('/gallery/:id', async (req, res, next) => {
  try {
    const { rowCount } = await db.query('delete from gallery_images where id = $1 and shop_id = $2', [
      req.params.id,
      req.shop.id,
    ]);
    if (!rowCount) return res.status(404).json({ error: 'Photo not found.' });
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// ---------------- image upload ----------------

// ---------------- Google Reviews ----------------

// POST /api/shops/:slug/admin/google-reviews/lookup  { query }
// Resolves free text (a business name + city usually works best; a Google
// Maps link is also worth trying) to one specific Google listing, for the
// admin to confirm before it's saved. Doesn't change anything by itself.
router.post('/google-reviews/lookup', async (req, res) => {
  const { query } = req.body || {};
  if (!query || !String(query).trim()) {
    return res.status(400).json({ error: 'Type your business name (and city), or paste your Google Maps link.' });
  }
  try {
    const found = await googlePlaces.findPlace(String(query).trim());
    res.json(found);
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// PUT /api/shops/:slug/admin/google-reviews  { placeId?, minRating? }
// placeId: attaches this shop to a specific Google listing (from the
// lookup step above) and does an immediate fetch so the widget has real
// data right away instead of waiting up to 12h for the cache to naturally
// expire. Omit placeId to just change minRating on an already-configured
// shop — that's a pure filter change, so it skips calling Google entirely.
router.put('/google-reviews', async (req, res, next) => {
  try {
    const { placeId, minRating } = req.body || {};
    const min = minRating !== undefined ? Math.max(1, Math.min(5, parseInt(minRating, 10) || 4)) : undefined;

    if (!placeId) {
      if (!req.shopRow.google_place_id) {
        return res.status(400).json({ error: 'No Google listing is set up yet — run the lookup first.' });
      }
      if (min === undefined) {
        return res.status(400).json({ error: 'Nothing to update — pass placeId and/or minRating.' });
      }
      const { rows } = await db.query(
        `update shops set google_reviews_min_rating = $1, updated_at = now() where id = $2
         returning google_place_id, google_reviews_min_rating`,
        [min, req.shop.id]
      );
      return res.json({ placeId: rows[0].google_place_id, minRating: rows[0].google_reviews_min_rating });
    }

    const cleanPlaceId = String(placeId).trim();
    const details = await googlePlaces.fetchPlaceDetails(cleanPlaceId);
    const cache = googlePlaces.shapeDetails(cleanPlaceId, details);
    const effectiveMin = min !== undefined ? min : req.shopRow.google_reviews_min_rating;

    const { rows } = await db.query(
      `update shops
       set google_place_id = $1, google_reviews_min_rating = $2,
           google_reviews_cache = $3, google_reviews_cached_at = now(), updated_at = now()
       where id = $4
       returning google_place_id, google_reviews_min_rating`,
      [cleanPlaceId, effectiveMin, JSON.stringify(cache), req.shop.id]
    );
    res.json({ placeId: rows[0].google_place_id, minRating: rows[0].google_reviews_min_rating, name: cache.name });
  } catch (e) {
    if (e instanceof googlePlaces.GooglePlacesError) return res.status(400).json({ error: e.message });
    next(e);
  }
});

// DELETE /api/shops/:slug/admin/google-reviews
// Unlinks the Google listing — the public widget goes back to hidden.
router.delete('/google-reviews', async (req, res, next) => {
  try {
    await db.query(
      `update shops
       set google_place_id = '', google_reviews_cache = null, google_reviews_cached_at = null, updated_at = now()
       where id = $1`,
      [req.shop.id]
    );
    res.json({ ok: true });
  } catch (e) {
    next(e);
  }
});

// POST /api/shops/:slug/admin/google-reviews/refresh
// Forces a fresh Google fetch right now, bypassing the 12h cache —
// useful right after configuring, or to check a new review shows up.
router.post('/google-reviews/refresh', async (req, res, next) => {
  try {
    if (!req.shopRow.google_place_id) {
      return res.status(400).json({ error: 'No Google listing is set up yet.' });
    }
    const details = await googlePlaces.fetchPlaceDetails(req.shopRow.google_place_id);
    const cache = googlePlaces.shapeDetails(req.shopRow.google_place_id, details);
    await db.query('update shops set google_reviews_cache = $1, google_reviews_cached_at = now() where id = $2', [
      JSON.stringify(cache),
      req.shop.id,
    ]);
    res.json({ ok: true });
  } catch (e) {
    if (e instanceof googlePlaces.GooglePlacesError) return res.status(400).json({ error: e.message });
    next(e);
  }
});

// POST /api/shops/:slug/admin/uploads  (multipart/form-data, field name "image")
// Used by both the gallery drag-and-drop and (optionally) service/barber
// photo fields. Returns { url } pointing at the stored image; the caller is
// responsible for then saving that url onto a gallery item / service / barber.
router.post('/uploads', (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image is too large (max 8MB).' : (err.message || 'Upload failed.');
      return res.status(400).json({ error: msg });
    }
    if (!req.file) {
      return res.status(400).json({ error: 'No image file was uploaded.' });
    }
    const publicBase = (process.env.PUBLIC_BASE_URL || `${req.protocol}://${req.get('host')}`).replace(/\/+$/, '');
    res.status(201).json({ url: `${publicBase}/uploads/${req.file.filename}` });
  });
});

module.exports = router;
