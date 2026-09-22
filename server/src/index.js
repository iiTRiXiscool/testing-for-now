require('dotenv').config();

const path = require('path');
const express = require('express');
const cors = require('cors');

const publicRoutes = require('./routes/public');
const adminRoutes = require('./routes/admin');

const app = express();

// Railway (like most hosts) puts this app behind a reverse proxy that
// terminates TLS and forwards the real client IP via X-Forwarded-For.
// Without this, express-rate-limit logs an ERR_ERL_UNEXPECTED_X_FORWARDED_FOR
// error on every request, and req.protocol reports "http" even on https
// requests (which would make uploaded-image URLs built in routes/admin.js
// come back as http:// and get blocked as mixed content on the https site).
// "1" = trust exactly one hop (Railway's own proxy), not any proxy that
// claims to be one.
app.set('trust proxy', 1);

app.use(express.json({ limit: '200kb' }));

// Uploaded gallery/service/barber photos (see routes/admin.js POST /admin/uploads).
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

// CORS: only origins listed in CORS_ORIGINS may call this API from a browser.
// Set this env var to your deployed frontend URL(s), comma-separated.
const allowedOrigins = (process.env.CORS_ORIGINS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow no-origin requests (curl, server-to-server, some mobile webviews).
      if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) {
        return callback(null, true);
      }
      // Reject quietly (no CORS headers) rather than throwing — the browser
      // blocks the response either way, but this avoids a noisy 500.
      callback(null, false);
    },
  })
);

app.get('/health', (req, res) => res.json({ ok: true }));

// Every route is scoped under /api/shops/:slug/... so one backend can serve
// many barbershop clients ("tenants"), each isolated by their own slug.
app.use('/api/shops/:slug', publicRoutes);
app.use('/api/shops/:slug/admin', adminRoutes);

app.use((req, res) => res.status(404).json({ error: 'Not found.' }));

// Centralized error handler — keeps stack traces out of API responses.
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  console.error(err);
  res.status(500).json({ error: 'Internal server error.' });
});

const port = process.env.PORT || 8080;
app.listen(port, () => {
  console.log(`Koxyos API listening on port ${port}`);
});
