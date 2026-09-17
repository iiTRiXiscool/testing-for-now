/**
 * Onboard a new barbershop client onto this backend.
 *
 * Usage:
 *   node scripts/create-shop.js <slug> "<Shop Name>" <admin-password>
 *
 * Example:
 *   node scripts/create-shop.js koxyos-tangier "Koxyos" "changeme"
 *
 * The resulting <slug> is what you put in that client's frontend
 * config.js as KOXYOS_CONFIG.shopSlug — it's how one shared backend
 * keeps every client's barbers/services completely separate.
 */
require('dotenv').config();
const bcrypt = require('bcryptjs');
const db = require('../src/db');

async function main() {
  const [, , slug, name, password] = process.argv;
  if (!slug || !name || !password) {
    console.error('Usage: node scripts/create-shop.js <slug> "<Shop Name>" <admin-password>');
    process.exit(1);
  }
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await db.query(
    `insert into shops (slug, shop_name, password_hash)
     values ($1, $2, $3)
     on conflict (slug) do nothing
     returning id, slug, shop_name`,
    [slug, name, hash]
  );
  if (!rows[0]) {
    console.error(`A shop with slug "${slug}" already exists. Choose a different slug.`);
    process.exit(1);
  }
  console.log('Shop created:');
  console.log(rows[0]);
  console.log(`\nSet shopSlug: "${slug}" in that client's frontend config.js`);
  await db.pool.end();
}

main().catch((e) => {
  console.error('Failed to create shop:', e);
  process.exit(1);
});
