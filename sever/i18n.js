/* Koxyos — shared EN/FR language switcher.
   Each page defines window.I18N_DICT = { en:{...}, fr:{...} } (and optionally
   window.onLangChange(lang) for pages with JS-generated content) before
   including this script. */
(function(){
  var STORAGE_KEY = 'koxyos_lang';

  function getLang(){
    var saved = null;
    try{ saved = localStorage.getItem(STORAGE_KEY); }catch(e){}
    if(saved === 'en' || saved === 'fr') return saved;
    var nav = (navigator.language || '').toLowerCase();
    return nav.indexOf('en') === 0 ? 'en' : 'fr';
  }

  function setLang(lang){
    try{ localStorage.setItem(STORAGE_KEY, lang); }catch(e){}
    applyLang(lang);
  }

  function applyLang(lang){
    var dict = (window.I18N_DICT && window.I18N_DICT[lang]) || {};
    document.documentElement.setAttribute('lang', lang);

    document.querySelectorAll('[data-i18n]').forEach(function(el){
      var key = el.getAttribute('data-i18n');
      if(dict[key] !== undefined) el.innerHTML = dict[key];
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function(el){
      var key = el.getAttribute('data-i18n-placeholder');
      if(dict[key] !== undefined) el.setAttribute('placeholder', dict[key]);
    });
    document.querySelectorAll('[data-i18n-aria-label]').forEach(function(el){
      var key = el.getAttribute('data-i18n-aria-label');
      if(dict[key] !== undefined) el.setAttribute('aria-label', dict[key]);
    });
    document.querySelectorAll('[data-i18n-title]').forEach(function(el){
      var key = el.getAttribute('data-i18n-title');
      if(dict[key] !== undefined) el.setAttribute('title', dict[key]);
    });
    if(dict.__docTitle) document.title = dict.__docTitle;

    document.querySelectorAll('.koxyos-lang-switch button').forEach(function(b){
      b.classList.toggle('active', b.getAttribute('data-lang') === lang);
    });

    if(typeof window.onLangChange === 'function') window.onLangChange(lang);
  }

  function injectSwitcher(){
    var style = document.createElement('style');
    style.textContent =
      '.koxyos-lang-switch{position:fixed;bottom:16px;right:16px;z-index:999;' +
      'display:flex;gap:2px;background:rgba(27,24,21,0.9);' +
      'border:1px solid rgba(237,230,214,0.28);border-radius:4px;padding:3px;' +
      'font-family:"Space Mono",ui-monospace,monospace;}' +
      '.koxyos-lang-switch button{background:none;border:none;cursor:pointer;' +
      'color:#B2A996;font-size:0.7rem;font-weight:700;letter-spacing:0.04em;' +
      'padding:6px 9px;border-radius:2px;}' +
      '.koxyos-lang-switch button.active{background:#C89B3C;color:#1B1815;}' +
      '.koxyos-lang-switch button:not(.active):hover{color:#EDE6D6;}';
    document.head.appendChild(style);

    var wrap = document.createElement('div');
    wrap.className = 'koxyos-lang-switch';
    wrap.innerHTML =
      '<button type="button" data-lang="en">EN</button>' +
      '<button type="button" data-lang="fr">FR</button>';
    document.body.appendChild(wrap);
    wrap.querySelectorAll('button').forEach(function(b){
      b.addEventListener('click', function(){ setLang(b.getAttribute('data-lang')); });
    });
  }

  window.KoxyosLang = { get: getLang, set: setLang, apply: applyLang };

  document.addEventListener('DOMContentLoaded', function(){
    injectSwitcher();
    applyLang(getLang());
  });
})();
