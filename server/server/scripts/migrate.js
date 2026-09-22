require('dotenv').config();
const fs = require('fs');
const path = require('path');
const db = require('../src/db');

async function main() {
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort(); // filenames are numbered (001_, 002_, ...) so sorted order is run order

  for (const file of files) {
    console.log(`Running migration: ${file} ...`);
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.query(sql);
  }
  console.log(`Done. Ran ${files.length} migration file(s).`);
  await db.pool.end();
}

main().catch((e) => {
  console.error('Migration failed:', e);
  process.exit(1);
});
