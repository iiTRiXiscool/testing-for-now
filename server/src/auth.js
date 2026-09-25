const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET;
if (!SECRET) {
  console.error('Missing JWT_SECRET. Set it as an environment variable before starting the server.');
  process.exit(1);
}

const TOKEN_TTL = '12h';

function issueAdminToken(shop) {
  return jwt.sign(
    { shopId: shop.id, slug: shop.slug, role: 'admin' },
    SECRET,
    { expiresIn: TOKEN_TTL }
  );
}

/**
 * Express middleware: requires a valid admin bearer token whose shop slug
 * matches the :slug route param. Attaches req.shop = { id, slug }.
 */
function requireAdmin(req, res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return res.status(401).json({ error: 'Missing or malformed Authorization header.' });
  }
  let payload;
  try {
    payload = jwt.verify(token, SECRET);
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired session. Please log in again.' });
  }
  if (payload.role !== 'admin' || payload.slug !== req.params.slug) {
    return res.status(403).json({ error: 'This session is not authorized for this shop.' });
  }
  req.shop = { id: payload.shopId, slug: payload.slug };
  next();
}

module.exports = { issueAdminToken, requireAdmin };
