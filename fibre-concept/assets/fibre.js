'use strict';

(() => {
  const gate = document.getElementById('concept-gate');
  const page = document.getElementById('site-content');
  const enter = document.getElementById('enter-concept');
  const reopen = document.getElementById('reopen-notice');
  const title = document.getElementById('page-title');
  const menu = document.getElementById('menu-toggle');
  const nav = document.getElementById('primary-nav');
  const speed = document.getElementById('connection-speed');
  const size = document.getElementById('file-size');
  const speedValue = document.getElementById('speed-value');
  const time = document.getElementById('transfer-time');
  const detail = document.getElementById('transfer-detail');
  const presets = Array.from(document.querySelectorAll('[data-speed]'));
  const plans = Array.from(document.querySelectorAll('[data-plan-speed]'));
  const selectedPlanStatus = document.getElementById('selected-plan-status');
  const planNames = new Map([[500, '500 Mbps'], [1000, '1 Gig'], [2000, '2 Gig'], [20000, '20 Gig']]);
  let returnFocus = null;

  // This notice is deliberately not remembered. Every new page load starts here.
  function showNotice() {
    returnFocus = page.hidden ? null : document.activeElement;
    page.inert = true;
    page.hidden = true;
    gate.hidden = false;
    document.body.classList.add('notice-open');
    enter.focus();
  }

  function enterConcept() {
    gate.hidden = true;
    page.hidden = false;
    page.inert = false;
    document.body.classList.remove('notice-open');
    (returnFocus || title).focus();
  }

  function setMenu(open) {
    menu.setAttribute('aria-expanded', String(open));
    nav.classList.toggle('is-open', open);
  }

  function formatTime(seconds) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainder = seconds % 60;
    const parts = [];
    if (hours) parts.push(`${hours} hr`);
    if (minutes) parts.push(`${minutes} min`);
    if (remainder || !parts.length) parts.push(`${remainder} sec`);
    return parts.join(' ');
  }

  function updateEstimate() {
    // The dropdown and slider are bounded, but treat their values as untrusted.
    const parsedSpeed = Number(speed.value);
    const parsedSize = Number(size.value);
    const mbps = Number.isFinite(parsedSpeed) ? Math.max(500, Math.min(20000, parsedSpeed)) : 1000;
    const gigabytes = [1, 10, 100].includes(parsedSize) ? parsedSize : 10;
    const label = mbps.toLocaleString('en-GB');
    speedValue.textContent = label;
    speed.setAttribute('aria-valuetext', `${label} megabits per second, illustrative`);
    speed.style.setProperty('--range-progress', `${((mbps - 500) / 19500) * 100}%`);
    time.textContent = formatTime(Math.ceil((gigabytes * 8000) / mbps));
    detail.textContent = `For ${gigabytes} GB at ${label} Mbps.`;
    presets.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.speed) === mbps)));
    plans.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.planSpeed) === mbps)));
    if (selectedPlanStatus) {
      const planName = planNames.get(mbps);
      selectedPlanStatus.textContent = planName
        ? `${planName} concept selected. Nothing has been ordered.`
        : 'Custom speed illustration selected. Nothing has been ordered.';
    }
  }

  enter.disabled = false;
  enter.addEventListener('click', enterConcept);
  reopen.addEventListener('click', showNotice);
  gate.addEventListener('keydown', event => {
    if (event.key === 'Escape') {
      // Do not bypass the fictional-service notice with Escape or a backdrop tap.
      event.preventDefault();
      return;
    }
    if (event.key !== 'Tab') return;
    const controls = Array.from(gate.querySelectorAll('button:not([disabled]), a[href]'));
    const first = controls[0];
    const last = controls[controls.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  });
  document.addEventListener('focusin', event => {
    if (!gate.hidden && !gate.contains(event.target)) enter.focus();
  });

  menu.addEventListener('click', () => setMenu(menu.getAttribute('aria-expanded') !== 'true'));
  nav.querySelectorAll('a').forEach(link => link.addEventListener('click', () => setMenu(false)));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') {
      setMenu(false);
      menu.focus();
    }
  });
  window.addEventListener('resize', () => {
    if (window.matchMedia('(min-width: 801px)').matches) setMenu(false);
  });
  window.addEventListener('pageshow', event => {
    // Back/forward-cache restores must show the notice too.
    if (event.persisted) {
      returnFocus = null;
      setMenu(false);
      showNotice();
    }
  });
  speed.addEventListener('input', updateEstimate);
  size.addEventListener('change', updateEstimate);
  presets.forEach(button => button.addEventListener('click', () => {
    speed.value = button.dataset.speed;
    updateEstimate();
  }));
  plans.forEach(button => button.addEventListener('click', () => {
    speed.value = button.dataset.planSpeed;
    updateEstimate();
  }));
  updateEstimate();
  showNotice();
})();
