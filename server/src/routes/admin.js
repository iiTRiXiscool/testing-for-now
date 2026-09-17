const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const rateLimit = require('express-rate-limit');
const db = require('../db');
const { loadShopOr404 } = require('../shops');
const { issueAdminToken, requireAdmin } = require('../auth');

const router = express.Router({ mergeParams: true });

function newId(prefix) {
  return `${prefix}_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
}

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

// PUT /api/shops/:slug/admin/config  { shopName, tagline, whatsapp }
router.put('/config', async (req, res, next) => {
  try {
    const { shopName, tagline, whatsapp } = req.body || {};
    const { rows } = await db.query(
      `update shops set shop_name = $1, tagline = $2, whatsapp = $3, updated_at = now()
       where id = $4
       returning shop_name, tagline, whatsapp`,
      [
        (shopName || '').trim() || req.shopRow.shop_name,
        (tagline || '').trim(),
        (whatsapp || '').trim(),
        req.shop.id,
      ]
    );
    res.json({ shopName: rows[0].shop_name, tagline: rows[0].tagline, whatsapp: rows[0].whatsapp });
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

module.exports = router;
