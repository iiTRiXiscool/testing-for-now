const db = require('./db');

async function findShopBySlug(slug) {
  const { rows } = await db.query('select * from shops where slug = $1', [slug]);
  return rows[0] || null;
}

/** Attaches req.shopRow (full DB row, includes password_hash) or 404s. */
async function loadShopOr404(req, res, next) {
  try {
    const shop = await findShopBySlug(req.params.slug);
    if (!shop) {
      return res.status(404).json({ error: `No shop found for slug "${req.params.slug}".` });
    }
    req.shopRow = shop;
    next();
  } catch (e) {
    next(e);
  }
}

module.exports = { findShopBySlug, loadShopOr404 };
