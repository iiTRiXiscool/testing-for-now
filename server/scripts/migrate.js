require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function main() {
  const file = path.join(__dirname, '..', 'migrations', '001_init.sql');
  const sql = fs.readFileSync(file, 'utf8');
  console.log('Running migration: 001_init.sql ...');
  await db.query(sql);
  console.log('Done. Tables ready: shops, barbers, services.');
  await db.pool.end();
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
