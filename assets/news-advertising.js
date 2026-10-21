// One manual display unit, on the production News hub only. No Auto Ads.
// Disabled until approval and a live review of Google's consent message.
(() => {
  'use strict';
  if (location.origin !== 'https://netvistastudio.com' ||
      !['/news/', '/news/index.html'].includes(location.pathname)) return;

  const placement = document.getElementById('news-advertising');
  const unit = document.getElementById('news-display-ad');
  if (!placement || !unit || placement.dataset.enabled !== 'true' ||
      placement.dataset.consentReviewed !== 'true' || placement.dataset.adsInitialized) return;

  const publisher = unit.getAttribute('data-ad-client');
  const slot = unit.getAttribute('data-ad-slot');
  if (!/^ca-pub-\d{16}$/.test(publisher || '') || !/^\d{10}$/.test(slot || '') ||
      document.getElementById('news-adsense-script')) return;
  placement.dataset.adsInitialized = 'true';

  // Documented Google Privacy & Messaging API. Do not show an inert button or
  // invent a local consent record. Google's configured CMP governs consent.
  const settings = document.getElementById('news-ad-cookie-settings');
  if (settings) {
    let settingsBound = false;
    window.googlefc = window.googlefc || {};
    window.googlefc.callbackQueue = window.googlefc.callbackQueue || [];
    window.googlefc.callbackQueue.push({ CONSENT_API_READY: () => {
      if (settingsBound || typeof window.googlefc?.showRevocationMessage !== 'function') return;
      settingsBound = true;
      settings.hidden = false;
      settings.addEventListener('click', () => {
        if (typeof window.googlefc?.showRevocationMessage === 'function') {
          window.googlefc.showRevocationMessage();
        }
      }, { once: false });
    } });
  }

  const script = document.createElement('script');
  script.id = 'news-adsense-script';
  script.async = true;
  script.crossOrigin = 'anonymous';
  script.src = 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=' + publisher;
  let settled = false;
  let timer;
  const unavailable = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    placement.hidden = true;
    placement.dataset.adState = 'unavailable';
    // No retries, anti-adblock prompts, fallbacks or impact on the news content.
  };
  script.onerror = unavailable;
  script.onload = () => {
    if (settled) return;
    settled = true;
    clearTimeout(timer);
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      placement.dataset.adState = 'requested';
    } catch {
      placement.hidden = true;
      placement.dataset.adState = 'unavailable';
    }
  };
  placement.hidden = false;
  placement.dataset.adState = 'loading';
  timer = setTimeout(unavailable, 15000);
  try { document.head.appendChild(script); }
  catch { unavailable(); }
})();
