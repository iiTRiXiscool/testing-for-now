/**
 * Seeds a shop with the original Koxyos demo barbers + menu items
 * (the same defaults that used to live in the frontend's JS files).
 *
 * Usage:
 *   node scripts/seed-demo.js <slug>
 *
 * Run create-shop.js first to create the shop row.
 */
require('dotenv').config();
const db = require('../src/db');
const { findShopBySlug } = require('../src/shops');

const DEFAULT_BARBERS = [
  {
    id: 'b1', name: 'Marcus Reyes', specialty: 'Fades & beard sculpting', photo: '',
    schedule: { mon: ['09:00','10:00','11:00','14:00','15:00'], tue: ['09:00','10:00','11:00','14:00','15:00'],
      wed: [], thu: ['09:00','10:00','11:00','14:00','15:00'], fri: ['09:00','10:00','11:00','14:00','15:00','16:00'],
      sat: ['10:00','11:00','12:00'], sun: [] },
  },
  {
    id: 'b2', name: 'Sam Okafor', specialty: 'Classic cuts & hot towel shaves', photo: '',
    schedule: { mon: [], tue: ['10:00','11:00','13:00','14:00'], wed: ['10:00','11:00','13:00','14:00'],
      thu: ['10:00','11:00','13:00','14:00'], fri: ['10:00','11:00','13:00','14:00','15:00'],
      sat: ['09:00','10:00','11:00','12:00'], sun: [] },
  },
  {
    id: 'b3', name: 'Theo Karras', specialty: 'Curly cuts & texture work', photo: '',
    schedule: { mon: ['12:00','13:00','15:00','16:00'], tue: ['12:00','13:00','15:00','16:00'], wed: ['12:00','13:00','15:00','16:00'],
      thu: [], fri: ['12:00','13:00','15:00','16:00'], sat: ['11:00','12:00','13:00'], sun: [] },
  },
  {
    id: 'b4', name: 'Ilyas Bennani', specialty: 'Precision line-ups & scissor work', photo: '',
    schedule: { mon: ['09:00','10:00','12:00','13:00'], tue: [], wed: ['09:00','10:00','12:00','13:00'],
      thu: ['09:00','10:00','12:00','13:00'], fri: ['09:00','10:00','12:00','13:00','16:00'],
      sat: ['10:00','11:00','12:00','13:00'], sun: [] },
  },
  {
    id: 'b5', name: 'Younes Amrani', specialty: 'Classic barbering & grey blending', photo: '',
    schedule: { mon: ['14:00','15:00','16:00','17:00'], tue: ['09:00','10:00','14:00','15:00'], wed: [],
      thu: ['09:00','10:00','14:00','15:00'], fri: ['14:00','15:00','16:00','17:00'],
      sat: ['09:00','10:00','11:00'], sun: [] },
  },
];

const DEFAULT_SERVICES = [
  { id: 'm1', category: 'both',  name_en: 'Signature cut & beard', name_fr: 'Coupe signature & barbe', duration: '45 min', price: '150 MAD' },
  { id: 'm2', category: 'hair',  name_en: 'Classic haircut', name_fr: 'Coupe classique', duration: '30 min', price: '80 MAD' },
  { id: 'm3', category: 'hair',  name_en: 'Skin fade', name_fr: 'Skin fade', duration: '40 min', price: '100 MAD' },
  { id: 'm4', category: 'hair',  name_en: "Kids' cut (under 12)", name_fr: 'Coupe enfant (moins de 12 ans)', duration: '25 min', price: '50 MAD' },
  { id: 'm5', category: 'beard', name_en: 'Beard trim & line-up', name_fr: 'Taille de barbe & contours', duration: '20 min', price: '50 MAD' },
  { id: 'm6', category: 'beard', name_en: 'Hot towel straight-razor shave', name_fr: 'Rasage au rasoir, serviette chaude', duration: '35 min', price: '110 MAD' },
  { id: 'm7', category: 'hair',  name_en: 'Wash & style', name_fr: 'Shampoing & mise en forme', duration: '15 min', price: '40 MAD' },
  { id: 'm8', category: 'beard', name_en: 'Beard colour', name_fr: 'Coloration barbe', duration: '30 min', price: '90 MAD' },
];

async function main() {
  const slug = process.argv[2];
  if (!slug) {
    console.error('Usage: node scripts/seed-demo.js <slug>');
    process.exit(1);
  }
  const shop = await findShopBySlug(slug);
  if (!shop) {
    console.error(`No shop found for slug "${slug}". Run create-shop.js first.`);
    process.exit(1);
  }

  for (const [i, b] of DEFAULT_BARBERS.entries()) {
    await db.query(
      `insert into barbers (id, shop_id, name, specialty, photo, schedule, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (id) do nothing`,
      [`${slug}-${b.id}`, shop.id, b.name, b.specialty, b.photo, JSON.stringify(b.schedule), i]
    );
  }
  for (const [i, s] of DEFAULT_SERVICES.entries()) {
    await db.query(
      `insert into services (id, shop_id, category, name_en, name_fr, duration, price, sort_order)
       values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do nothing`,
      [`${slug}-${s.id}`, shop.id, s.category, s.name_en, s.name_fr, s.duration, s.price, i]
    );
  }
  console.log(`Seeded ${DEFAULT_BARBERS.length} barbers and ${DEFAULT_SERVICES.length} services for "${slug}".`);
  await db.pool.end();
}

main().catch((e) => {
  console.error('Seeding failed:', e);
  process.exit(1);
});
