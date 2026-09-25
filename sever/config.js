/* Koxyos — deployment config.
   This is the ONLY file you need to edit when you deploy this frontend
   somewhere new (Netlify, Vercel, Cloudflare Pages, GitHub Pages, a plain
   web server, ...) or when you hand this site to a different barbershop.

   It contains no secrets — just where to find the API, and which shop's
   data to load from it. */
window.KOXYOS_CONFIG = {
  // Base URL of the backend API (see /server). No trailing slash.
  // Local dev example:  "http://localhost:8080"
  apiBaseUrl: "https://testing-for-now-production.up.railway.app",

  // Which barbershop this deployed frontend belongs to. Matches the
  // `slug` a shop was created with via `node scripts/create-shop.js`.
  shopSlug: "koxyos-tangier"
};
