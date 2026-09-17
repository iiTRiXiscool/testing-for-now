const { Pool } = require('pg');

if (!process.env.DATABASE_URL) {
  console.error(
    'Missing DATABASE_URL. Set it as an environment variable ' +
    '(see .env.example) before starting the server.'
  );
  process.exit(1);
}

// DATABASE_SSL defaults to "true" because almost every managed Postgres
// provider (Neon, Supabase, Render, RDS...) requires TLS. Set it to
// "false" only for a local/self-hosted Postgres that has no SSL configured.
const useSsl = process.env.DATABASE_SSL !== 'false';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: useSsl ? { rejectUnauthorized: false } : false,
});

pool.on('error', (err) => {
  // Errors on idle clients shouldn't crash the whole process.
  console.error('Unexpected Postgres pool error:', err);
});

module.exports = {
  query: (text, params) => pool.query(text, params),
  pool,
};
