// Both public pages use the same responsive navigation controller.
(() => {
  const header = document.querySelector('[data-shared-navigation]');
  if (!header) return;
  const toggle = header.querySelector('#nav-toggle');
  const nav = header.querySelector('#primary-nav');
  const mobile = window.matchMedia('(max-width: 1100px)');
  const backdrop = document.createElement('button');
  backdrop.className = 'navigation-backdrop';
  backdrop.setAttribute('aria-label', 'Close navigation');
  backdrop.tabIndex = -1;
  backdrop.hidden = true;
  document.body.append(backdrop);
  let open = false;
  function setOpen(value, restoreFocus = false) {
    open = value && mobile.matches;
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    toggle.innerHTML = open ? 'Close <span aria-hidden="true">×</span>' : 'Menu <span aria-hidden="true">☰</span>';
    backdrop.hidden = !open;
    document.documentElement.classList.toggle('navigation-open', open);
    if (restoreFocus) toggle.focus();
  }
  toggle.addEventListener('click', () => setOpen(!open));
  header.querySelector('#search-toggle')?.addEventListener('click', () => setOpen(false));
  backdrop.addEventListener('click', () => setOpen(false, true));
  nav.addEventListener('click', event => {
    const link = event.target.closest('a');
    if (!link) return;
    // Keep keyboard focus on an available control when the menu disappears.
    setOpen(false, mobile.matches);
  });
  document.addEventListener('keydown', event => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); setOpen(false, true); }
    if (event.key === 'Tab') {
      const items = [toggle, ...nav.querySelectorAll('a[href]')];
      const index = items.indexOf(document.activeElement);
      if (event.shiftKey && index <= 0) { event.preventDefault(); items.at(-1).focus(); }
      else if (!event.shiftKey && (index === items.length - 1 || index < 0)) { event.preventDefault(); toggle.focus(); }
    }
  });
  mobile.addEventListener('change', () => setOpen(false));
  window.addEventListener('pageshow', () => setOpen(false));
  setOpen(false);
})();
