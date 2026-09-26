// Thin wrapper around Google's Places API (legacy "Place Details" +
// "Find Place From Text" endpoints — both are free within Google's
// standard monthly API credit for the tiny call volume this needs).
//
// One GOOGLE_PLACES_API_KEY (set in this server's environment) serves
// every shop on this install. Each shop just stores its own
// google_place_id, so reselling this template to different barbershops
// never means creating more API keys — just pointing each shop at its own
// listing (see POST /admin/google-reviews/lookup in routes/admin.js).

const PLACES_BASE = 'https://maps.googleapis.com/maps/api/place';

const STATUS_MESSAGES = {
  ZERO_RESULTS: 'No business matched that search — try adding the city, or paste your Google Maps link instead.',
  OVER_QUERY_LIMIT: 'Google rejected the request: the API key has hit its quota or billing isn\'t enabled for it.',
  REQUEST_DENIED: 'Google rejected the request: check that the API key is valid and the Places API is enabled for it.',
  INVALID_REQUEST: 'That search was invalid — try a shorter business name and city.',
  NOT_FOUND: 'That Google listing could not be found (it may have been removed).',
};

class GooglePlacesError extends Error {}

function requireApiKey() {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key) {
    throw new GooglePlacesError('Google Reviews isn\'t set up on this server yet (missing GOOGLE_PLACES_API_KEY).');
  }
  return key;
}

function statusError(status) {
  return new GooglePlacesError(STATUS_MESSAGES[status] || `Google returned an unexpected status: ${status}`);
}

// Resolves free-text (a business name + city, or often a Google Maps
// link) to one specific place. Returns a small summary for the admin to
// confirm — this does NOT save anything.
async function findPlace(query) {
  const key = requireApiKey();
  const url =
    `${PLACES_BASE}/findplacefromtext/json` +
    `?input=${encodeURIComponent(query)}&inputtype=textquery` +
    `&fields=place_id,name,formatted_address,rating,user_ratings_total` +
    `&key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.candidates || !data.candidates[0]) {
    throw statusError(data.status);
  }
  const c = data.candidates[0];
  return {
    placeId: c.place_id,
    name: c.name || '',
    address: c.formatted_address || '',
    rating: c.rating || null,
    totalReviews: c.user_ratings_total || 0,
  };
}

// Fetches full details (including up to 5 "most relevant" reviews —
// that cap and selection are Google's, not ours) for a known place id.
async function fetchPlaceDetails(placeId) {
  const key = requireApiKey();
  const url =
    `${PLACES_BASE}/details/json` +
    `?place_id=${encodeURIComponent(placeId)}` +
    `&fields=name,rating,user_ratings_total,reviews,url` +
    `&key=${key}`;
  const res = await fetch(url);
  const data = await res.json();
  if (data.status !== 'OK' || !data.result) {
    throw statusError(data.status);
  }
  return data.result;
}

// Shapes Google's raw Place Details response into the small, stable shape
// this app stores/serves. Deliberately does NOT filter or cap reviews here
// (Google already caps at 5) — the star-rating filter is applied later, at
// serve time, so changing that threshold never needs a fresh Google call.
function shapeDetails(placeId, details) {
  return {
    placeId,
    name: details.name || '',
    rating: details.rating || null,
    totalReviews: details.user_ratings_total || 0,
    mapsUrl: details.url || `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`,
    writeReviewUrl: `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`,
    reviews: (details.reviews || []).map((r) => ({
      authorName: r.author_name || 'Google user',
      profilePhotoUrl: r.profile_photo_url || '',
      rating: r.rating || 0,
      relativeTime: r.relative_time_description || '',
      text: r.text || '',
      time: r.time || 0, // unix seconds — used only for sorting
    })),
  };
}

module.exports = { findPlace, fetchPlaceDetails, shapeDetails, GooglePlacesError };
