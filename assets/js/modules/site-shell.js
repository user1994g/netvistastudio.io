export function initSiteShell() {
  if (window.location.protocol === 'file:') {
    document.querySelectorAll('a[href]').forEach((link) => {
      const href = link.getAttribute('href');
      if (!href) return;
      if (href === './') link.setAttribute('href', 'index.html');
      if (href.startsWith('applications/')) link.setAttribute('href', href.replace('applications/', 'applications/index.html'));
      if (href.startsWith('../')) link.setAttribute('href', href.replace('../', '../index.html'));
    });
  }

  const header = document.querySelector('#site-header');
  const navToggle = document.querySelector('#nav-toggle');
  const nav = document.querySelector('#primary-nav');
  let scrollFrame;

  const closeNavigation = ({ restoreFocus = false } = {}) => {
    if (!header || !navToggle) return;
    header.classList.remove('nav-open');
    navToggle.setAttribute('aria-expanded', 'false');
    if (restoreFocus) navToggle.focus();
  };

  const updateHeader = () => {
    if (!header) return;
    header.classList.toggle('is-scrolled', window.scrollY > 28);
    scrollFrame = null;
  };

  window.addEventListener('scroll', () => {
    if (!scrollFrame) scrollFrame = window.requestAnimationFrame(updateHeader);
  }, { passive: true });
  updateHeader();

  navToggle?.addEventListener('click', () => {
    const open = header.classList.toggle('nav-open');
    navToggle.setAttribute('aria-expanded', String(open));
  });

  document.addEventListener('click', (event) => {
    if (header && !header.contains(event.target)) closeNavigation();
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && header?.classList.contains('nav-open')) {
      closeNavigation({ restoreFocus: true });
    }
  });

  nav?.querySelectorAll('a').forEach((link) => {
    link.addEventListener('click', (event) => {
      closeNavigation();
      const href = link.getAttribute('href');
      if (!href?.startsWith('#')) return;
      const target = document.querySelector(href);
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nav.querySelectorAll('a').forEach((item) => item.classList.remove('is-active'));
      link.classList.add('is-active');
    });
  });

  document.querySelectorAll('[data-current-year]').forEach((element) => {
    element.textContent = new Date().getFullYear();
  });
}
