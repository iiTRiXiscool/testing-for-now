/* Koxyos — API client.
   Replaces the old window.storage-based persistence (which only worked
   inside a Claude artifact) with real calls to the backend in /server.
   Every page that needs data goes through window.KoxyosAPI instead of
   talking to storage directly.

   Requires config.js to be loaded first (window.KOXYOS_CONFIG). */
(function () {
  'use strict';

  function cfg() {
    var c = window.KOXYOS_CONFIG;
    if (!c || !c.apiBaseUrl || !c.shopSlug) {
      throw new Error('Missing window.KOXYOS_CONFIG — make sure config.js is loaded before api-client.js.');
    }
    return c;
  }

  function base() {
    var c = cfg();
    return c.apiBaseUrl.replace(/\/+$/, '') + '/api/shops/' + encodeURIComponent(c.shopSlug);
  }

  // Admin session token. Kept in memory only (not localStorage/sessionStorage),
  // same lifetime as the old isAdmin flag: lost on refresh, so staff log back
  // in each visit — matches the original app's behavior exactly.
  var adminToken = null;

  function setToken(t) { adminToken = t; }
  function clearToken() { adminToken = null; }
  function hasToken() { return !!adminToken; }

  async function request(path, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {});
    if (options.body !== undefined) headers['Content-Type'] = 'application/json';
    if (options.auth) {
      if (!adminToken) throw new Error('Not logged in.');
      headers['Authorization'] = 'Bearer ' + adminToken;
    }

    var res;
    try {
      res = await fetch(base() + path, {
        method: options.method || 'GET',
        headers: headers,
        body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      });
    } catch (networkErr) {
      throw new Error('Could not reach the server. Check your connection and try again.');
    }

    var data = null;
    try { data = await res.json(); } catch (e) { /* empty body is fine for some responses */ }

    if (!res.ok) {
      var msg = (data && data.error) || ('Request failed (' + res.status + ').');
      throw new Error(msg);
    }
    return data;
  }

  window.KoxyosAPI = {
    setToken: setToken,
    clearToken: clearToken,
    hasToken: hasToken,

    // ---- public reads (no auth) ----
    getConfig: function () { return request('/config'); },
    getBarbers: function () { return request('/barbers'); },
    getServices: function () { return request('/services'); },
    getCategories: function () { return request('/categories'); },
    getGalleryImages: function () { return request('/gallery'); },

    // ---- admin auth ----
    login: async function (password) {
      var result = await request('/admin/login', { method: 'POST', body: { password: password } });
      setToken(result.token);
      return result;
    },

    // ---- admin: shop config ----
    updateConfig: function (patch) {
      return request('/admin/config', { method: 'PUT', body: patch, auth: true });
    },
    updatePassword: function (newPassword) {
      return request('/admin/password', { method: 'PUT', body: { newPassword: newPassword }, auth: true });
    },

    // ---- admin: barbers ----
    createBarber: function (data) {
      return request('/admin/barbers', { method: 'POST', body: data, auth: true });
    },
    updateBarber: function (id, patch) {
      return request('/admin/barbers/' + encodeURIComponent(id), { method: 'PUT', body: patch, auth: true });
    },
    updateBarberSchedule: function (id, schedule) {
      return request('/admin/barbers/' + encodeURIComponent(id) + '/schedule', {
        method: 'PUT', body: { schedule: schedule }, auth: true,
      });
    },
    deleteBarber: function (id) {
      return request('/admin/barbers/' + encodeURIComponent(id), { method: 'DELETE', auth: true });
    },

    // ---- admin: services / menu items ----
    createService: function (data) {
      return request('/admin/services', { method: 'POST', body: data, auth: true });
    },
    updateService: function (id, patch) {
      return request('/admin/services/' + encodeURIComponent(id), { method: 'PUT', body: patch, auth: true });
    },
    deleteService: function (id) {
      return request('/admin/services/' + encodeURIComponent(id), { method: 'DELETE', auth: true });
    },

    // ---- admin: service categories ----
    // A category is { id, key, label_en, label_fr }. "key" is a stable
    // machine-readable slug (e.g. "kids-cuts"); label_en/label_fr are what
    // customers see on the tab.
    createCategory: function (data) {
      return request('/admin/categories', { method: 'POST', body: data, auth: true });
    },
    deleteCategory: function (id) {
      return request('/admin/categories/' + encodeURIComponent(id), { method: 'DELETE', auth: true });
    },

    // ---- admin: gallery photos ----
    // A gallery image is { id, url, caption_en, caption_fr }.
    createGalleryImage: function (data) {
      return request('/admin/gallery', { method: 'POST', body: data, auth: true });
    },
    deleteGalleryImage: function (id) {
      return request('/admin/gallery/' + encodeURIComponent(id), { method: 'DELETE', auth: true });
    },

    // ---- admin: image upload ----
    // Uploads a single image file (from a <input type="file">) and returns
    // { url: "https://..." } pointing at the stored image. Used for both
    // service photos and gallery photos — callers save that URL onto the
    // service (image_url) or the gallery item (url) afterwards.
    // Uses FormData/multipart instead of the JSON `request()` helper above
    // because it's a binary file, not a JSON body.
    uploadImage: async function (file) {
      if (!adminToken) throw new Error('Not logged in.');
      var res;
      try {
        var formData = new FormData();
        formData.append('image', file);
        res = await fetch(base() + '/admin/uploads', {
          method: 'POST',
          headers: { 'Authorization': 'Bearer ' + adminToken },
          body: formData,
        });
      } catch (networkErr) {
        throw new Error('Could not reach the server. Check your connection and try again.');
      }
      var data = null;
      try { data = await res.json(); } catch (e) { /* empty body is fine */ }
      if (!res.ok) {
        var msg = (data && data.error) || ('Request failed (' + res.status + ').');
        throw new Error(msg);
      }
      return data;
    },
  };
})();
