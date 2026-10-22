/* Shared, dependency-free privacy choices. Never required for account access. */
(function () {
  'use strict';
  if (window.__netvistaPrivacyControls) return;
  window.__netvistaPrivacyControls = true;

  var key = 'netvista-privacy-choice-v1';
  var lifetime = 180 * 24 * 60 * 60 * 1000;
  var analyticsPage = document.currentScript && document.currentScript.getAttribute('data-analytics') === 'clarity';
  var production = /^(?:www\.)?netvistastudio\.com$|^video\.netvistastudio\.com$/.test(window.location.hostname);
  var loaded = false, rejectedForPage = false, banner, status, reopen, opener;
  var withdrawalWarning = 'Analytics permission has been withdrawn for this page, but your browser could not clear the old saved choice. Close this tab and clear this site’s browser data before returning.';

  function gpc() { return navigator.globalPrivacyControl === true; }
  function read() {
    try {
      var value = JSON.parse(localStorage.getItem(key) || 'null');
      if (!value || value.version !== 1 || typeof value.analytics !== 'boolean' ||
          !Number.isFinite(value.updatedAt) || value.updatedAt > Date.now() || Date.now() - value.updatedAt > lifetime) return null;
      return value;
    } catch (_) { return null; }
  }
  function store(analytics) {
    var value = { version: 1, analytics: analytics, updatedAt: Date.now() };
    try {
      var serialized = JSON.stringify(value);
      localStorage.setItem(key, serialized);
      return localStorage.getItem(key) === serialized;
    } catch (_) { return false; }
  }
  function removeAnalyticsCookies() {
    // Only Clarity's first-party cookies: never remove the account session.
    var domains = ['', '; Domain=' + window.location.hostname];
    if (production) domains.push('; Domain=netvistastudio.com', '; Domain=.netvistastudio.com');
    var paths = ['/', window.location.pathname];
    ['_clck', '_clsk'].forEach(function (name) {
      paths.forEach(function (path) { domains.forEach(function (domain) {
        try { document.cookie = name + '=; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; Path=' + path + domain + '; SameSite=Lax; Secure'; } catch (_) {}
      }); });
    });
  }
  function stopAnalytics() {
    var wasLoaded = loaded;
    if (typeof window.clarity === 'function') {
      try { window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'denied' }); } catch (_) {}
    }
    removeAnalyticsCookies();
    return wasLoaded;
  }
  function startAnalytics() {
    var choice = read();
    if (loaded || rejectedForPage || !analyticsPage || !production || gpc() || !choice || choice.analytics !== true) return;
    // Consent is persisted and verified before even contacting Microsoft.
    if (typeof window.clarity !== 'function') {
      window.clarity = function () { (window.clarity.q = window.clarity.q || []).push(arguments); };
    }
    window.clarity('consentv2', { ad_Storage: 'denied', analytics_Storage: 'granted' });
    var script = document.createElement('script');
    script.async = true;
    script.src = 'https://www.clarity.ms/tag/yi9b33i0az';
    script.setAttribute('data-netvista-analytics', 'clarity');
    script.onerror = function () {
      if (status && !banner.hidden) status.textContent = 'Your choice is saved. Analytics could not load; account access is unaffected.';
    };
    document.head.appendChild(script);
    loaded = true;
  }
  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function close() {
    banner.hidden = true;
    if (opener && opener.isConnected) opener.focus();
  }
  function checkActivePermission() {
    var choice = read();
    // Never reload into an old opt-in after storage prevented a withdrawal.
    if (loaded && rejectedForPage) { stopAnalytics(); return true; }
    if (loaded && (gpc() || !choice || !choice.analytics)) {
      stopAnalytics();
      window.location.reload();
      return false;
    }
    return true;
  }
  function show(from) {
    if (!banner) return;
    if (!checkActivePermission()) return;
    opener = from || document.activeElement;
    banner.hidden = false;
    var choice = read();
    status.textContent = gpc() ? 'Your browser’s Global Privacy Control is on. Optional analytics stays off.' :
      rejectedForPage ? (loaded ? withdrawalWarning : 'Your current choice: necessary storage only for this page. Your browser could not save it for future visits.') :
      choice ? (choice.analytics ? 'Your current choice: analytics allowed on this browser and site.' : 'Your current choice: necessary storage only.') :
        'Optional analytics is off until you choose to allow it.';
    banner.querySelector('[data-privacy-accept]').disabled = gpc();
    if (from) banner.querySelector('h2').focus();
  }
  function choose(analytics) {
    if (analytics && gpc()) { status.textContent = 'Global Privacy Control keeps optional analytics off.'; return; }
    var saved = store(analytics);
    if (!analytics) rejectedForPage = !saved;
    else if (saved) rejectedForPage = false;
    if (!analytics) {
      var reload = stopAnalytics();
      var cleared = false;
      if (!saved) {
        try { localStorage.removeItem(key); cleared = localStorage.getItem(key) === null; } catch (_) {}
      }
      if (reload && (saved || cleared)) {
        // A reload removes the already-running vendor, not just its script tag.
        // With no saved choice the next page also defaults to analytics off.
        window.location.reload();
        return;
      }
      if (reload) {
        status.textContent = withdrawalWarning;
        return;
      }
    }
    if (!saved) {
      // Rejection never needs browser storage to let someone use the page.
      if (!analytics) { close(); return; }
      status.textContent = 'Your browser could not save this choice. Optional analytics stays off. You can still sign in and use the site.';
      return;
    }
    if (analytics) startAnalytics();
    close();
  }
  function init() {
    if (!document.body) return;
    banner = element('section', 'nv-privacy-panel');
    banner.id = 'netvista-privacy-panel';
    banner.setAttribute('role', 'dialog');
    banner.setAttribute('aria-modal', 'false');
    banner.setAttribute('aria-labelledby', 'netvista-privacy-title');
    banner.setAttribute('aria-describedby', 'netvista-privacy-description');
    banner.hidden = true;
    var label = element('p', 'nv-privacy-eyebrow', 'YOUR PRIVACY');
    var title = element('h2', '', 'A choice, not a condition.');
    title.id = 'netvista-privacy-title'; title.tabIndex = -1;
    var description = element('p', '', 'Necessary browser storage keeps sign-in and security working. With your permission, Microsoft Clarity helps us understand page use through analytics and session recordings. Rejecting optional analytics never blocks your account, downloads or films.');
    description.id = 'netvista-privacy-description';
    var link = element('a', '', 'Read our privacy and storage notice');
    link.href = 'https://netvistastudio.com/privacy/';
    var actions = element('div', 'nv-privacy-actions');
    var reject = element('button', 'nv-privacy-choice', 'Reject optional');
    reject.type = 'button'; reject.setAttribute('data-privacy-reject', '');
    var accept = element('button', 'nv-privacy-choice', 'Accept analytics');
    accept.type = 'button'; accept.setAttribute('data-privacy-accept', ''); accept.disabled = gpc();
    var dismiss = element('button', 'nv-privacy-dismiss', 'Close choices');
    dismiss.type = 'button';
    actions.appendChild(reject); actions.appendChild(accept); actions.appendChild(dismiss);
    status = element('p', 'nv-privacy-status');
    status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    banner.appendChild(label); banner.appendChild(title); banner.appendChild(description);
    banner.appendChild(link); banner.appendChild(actions); banner.appendChild(status);
    document.body.appendChild(banner);
    reopen = element('button', 'nv-privacy-reopen', 'Privacy choices');
    reopen.type = 'button'; reopen.setAttribute('aria-controls', banner.id);
    document.body.appendChild(reopen);
    reject.addEventListener('click', function () { choose(false); });
    accept.addEventListener('click', function () { choose(true); });
    dismiss.addEventListener('click', close);
    reopen.addEventListener('click', function () { show(reopen); });
    document.addEventListener('click', function (event) {
      var target = event.target && typeof event.target.closest === 'function' && event.target.closest('[data-privacy-settings]');
      if (target) { event.preventDefault(); show(target); }
    });
    banner.addEventListener('keydown', function (event) { if (event.key === 'Escape') { event.preventDefault(); close(); } });
    window.addEventListener('storage', function (event) {
      if (event.key !== key && event.key !== null) return;
      if (loaded && rejectedForPage) {
        stopAnalytics();
        if (!banner.hidden) show();
        return;
      }
      var next = read();
      if (!next || !next.analytics || gpc()) {
        if (stopAnalytics()) { window.location.reload(); return; }
      }
      // A different tab cannot cause a new vendor load in this tab.
      if (!banner.hidden) show();
    });
    window.addEventListener('focus', checkActivePermission);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) checkActivePermission(); });
    var choice = read();
    if (gpc() || !choice || !choice.analytics) stopAnalytics();
    else startAnalytics();
    if (!choice && !gpc()) show();
  }
  // A failing preferences feature must not prevent the rest of the page loading.
  try {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
    else init();
  } catch (_) { /* Necessary-only is the failure mode. */ }
})();
