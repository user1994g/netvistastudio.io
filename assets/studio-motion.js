/* Optional, finite public-page motion. No accounts, analytics or click handlers. */
(() => {
  'use strict';
  const body = document.body;
  if (!body?.classList.contains('nv-site') || body.classList.contains('account-page') ||
      body.classList.contains('editor-locked') || body.classList.contains('videos-site') ||
      window.location.hostname === 'video.netvistastudio.com') return;

  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  if (!reduced || reduced.matches) return;

  // Only the primary action's existing decorative arrow moves; labels stay put.
  const arrows = { '→': 'right', '↗': 'external', '↓': 'down' };
  body.querySelectorAll('.button-primary > span[aria-hidden="true"], .nv-get > span[aria-hidden="true"]').forEach(icon => {
    const direction = arrows[icon.textContent.trim()];
    if (direction && !icon.closest('form')) icon.setAttribute('data-nv-arrow', direction);
  });

  if (typeof window.IntersectionObserver !== 'function') return;
  const selector = [
    '.home-tools .home-section-head', '.studio-feature', '.featured-project',
    '.film-grid', '.media-editorial > figure', '.studio-intro', '.home-collaborate',
    '.product-section-heading', '.workspace-grid > article', '.overview-grid > article',
    '.guide-copy > section'
  ].join(', ');
  // Skip initially visible content, initial headings, galleries, forms and hidden
  // elements. Deep-link/restore visitors see their destination immediately too.
  const candidates = [...body.querySelectorAll(selector)].filter(node =>
    !node.closest('form, .dialog, [hidden], .home-hero, .product-hero, .account-gate') &&
    node.getClientRects().length && node.getBoundingClientRect().top >= window.innerHeight
  ).slice(0, 32);
  if (!candidates.length) return;
  const pending = new Set(candidates);
  let observer;
  const clear = () => {
    observer?.disconnect();
    pending.clear();
    candidates.forEach(node => node.classList.remove('nv-entered'));
    reduced.removeEventListener?.('change', onPreferenceChange);
  };
  const onPreferenceChange = event => { if (event.matches) clear(); };
  try {
    observer = new window.IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (!entry.isIntersecting || !pending.has(entry.target)) return;
        pending.delete(entry.target);
        observer.unobserve(entry.target);
        if (!reduced.matches) entry.target.classList.add('nv-entered');
      });
      if (!pending.size) {
        observer.disconnect();
        reduced.removeEventListener?.('change', onPreferenceChange);
      }
    }, { threshold: .08, rootMargin: '0px 0px -24px 0px' });
    reduced.addEventListener?.('change', onPreferenceChange);
    candidates.forEach(node => observer.observe(node));
  } catch (_) {
    // Enhancement failure must never affect reading, navigation or controls.
    clear();
  }
})();
