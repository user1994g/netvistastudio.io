/* Shared navigation and quick search for the public NetVista site. No account state. */
(() => {
  'use strict';
  const header = document.querySelector('[data-shared-navigation]');
  if (!header) return;
  const toggle = header.querySelector('#nav-toggle');
  const nav = header.querySelector('#primary-nav');
  if (!toggle || !nav) return;
  const mobile = window.matchMedia('(max-width: 1100px)');
  const searchToggle = header.querySelector('#search-toggle');
  const searchPanel = document.querySelector('#search-panel');
  const searchInput = document.querySelector('#search-input');
  const searchClose = document.querySelector('#search-close');
  const searchStatus = document.querySelector('#search-status');
  let results = document.querySelector('#search-results');
  if (searchPanel && !results) {
    results = document.createElement('ul');
    results.id = 'search-results';
    searchPanel.append(results);
  }
  results?.classList.add('search-results');
  const backdrop = document.createElement('button');
  backdrop.className = 'navigation-backdrop';
  backdrop.type = 'button';
  backdrop.setAttribute('aria-label', 'Close navigation');
  backdrop.tabIndex = -1;
  backdrop.hidden = true;
  const searchBackdrop = document.createElement('button');
  searchBackdrop.className = 'search-backdrop';
  searchBackdrop.type = 'button';
  searchBackdrop.setAttribute('aria-label', 'Close search');
  searchBackdrop.tabIndex = -1;
  searchBackdrop.hidden = true;
  document.body.append(backdrop, searchBackdrop);
  let open = false;
  let searching = false;
  let returnFocus = null;
  // The Watch site's account screen shares this shell, not the studio's routes.
  // Restrict rewriting to public navigation; auth callbacks remain untouched.
  const studioOrigin = window.location.hostname === 'video.netvistastudio.com' ? 'https://netvistastudio.com' : '';
  if (studioOrigin) {
    document.querySelectorAll('.nv-header a[href], .site-footer a[href], .application-footer a[href]').forEach(link => {
      const href = link.getAttribute('href');
      if (href?.startsWith('/') && !href.startsWith('//')) link.href = studioOrigin + href;
    });
  }

  const catalogue = [
    { title: 'NetVista Studio Video Editor', kind: 'Creative tool', href: '/video-editor/', terms: 'timeline cut clips movie editing colour grading effects keyframes export windows mac linux ipad android samsung' },
    { title: 'Download the public beta', kind: 'Native apps', href: '/editor/', terms: 'get install application downloads desktop mobile beta free' },
    { title: 'The dark echo’s of 1939', kind: 'Film · Now streaming', href: '/#work', terms: 'dark echoes 1939 film watch cinema story' },
    { title: 'The Final Lesson AP 1', kind: 'Film · Now streaming', href: '/#work', terms: 'final lesson film watch cinema' },
    { title: 'Your first video project', kind: 'Getting-started guide', href: '/video-editor/getting-started/', terms: 'tutorial help learn import trim save editing start beginner' },
    { title: 'Zoom and fade with keyframes', kind: 'Editing guide', href: '/video-editor/keyframes/', terms: 'effects animate scale opacity zoom fade animation' },
    { title: 'Colour grading and LUTs', kind: 'Editing guide', href: '/video-editor/colour-grading-luts/', terms: 'color grading colour correction cube lut looks wheels node' },
    { title: 'MP4 and 4K export settings', kind: 'Editing guide', href: '/video-editor/export-settings/', terms: 'render movie resolution fps frame rate export mp4 4k 1080' },
    { title: 'Applications', kind: 'Join a production', href: '/applications/', terms: 'acting actors crew join apply cast casting application film production' },
    { title: 'Media lab', kind: 'Studio experiments', href: '/#media', terms: 'experiments explore work creative media lab' },
    {"title":"Studio news and release notes","kind":"News","href":"/news/","terms":"news updates release changelog development history beta roadmap"},
    {"title":"Development preview: native mobile creative workspaces after Beta 7","kind":"Development preview","href":"/news/october-20-native-mobile-development-preview/","terms":"news beta updates Post-Beta 7 development The 20 October development report documents newer Apple and Android workspaces, their test evidence and the gaps before a future release."},
    {"title":"NetVista Studio Beta 7: standalone mobile editing and a dedicated 3D workspace","kind":"Release retrospective","href":"/news/beta-7-mobile-editing-and-dedicated-3d/","terms":"news beta updates 1.4 Beta 7 The 7 October public beta added first native iPad/Android video editors and expanded Mac modelling, sculpting, keying and collaboration."},
    {"title":"Beta 6 makes Studio Home clearer and startup quieter","kind":"Release retrospective","href":"/news/beta-6-studio-home-and-quieter-startup/","terms":"news beta updates 1.4 Beta 6 Published on 29 September, Beta 6 gave the existing Game Maker a Home card and reduced interactive Keychain requests during startup."},
    {"title":"Beta 4 expands photo, colour, 3D and Game Maker tools","kind":"Release retrospective","href":"/news/beta-4-creative-tools-and-safer-updates/","terms":"news beta updates 1.4 Beta 4 The 19 September release broadened Mac creative workspaces and introduced in-place updating with project recovery and rollback protections."},
    {"title":"Beta 3 brings a separate native photo workspace to Mac","kind":"Release retrospective","href":"/news/beta-3-separate-native-photo-workspace/","terms":"news beta updates 1.4 Beta 3 The 3 September beta introduced layered photo editing and separate editor windows, alongside clearer effects, colour and export controls."},
    {"title":"Two focused betas make video export clearer and more reliable","kind":"Release retrospective","href":"/news/clearer-and-more-reliable-video-export/","terms":"news beta updates 1.4 Betas 1–2 NetVista Studio 1.4 Betas 1 and 2 improved resolution selection, progress, completion messages and longer FFmpeg renders."},
    {"title":"Windows and Linux join NetVista Studio as 3D animation develops","kind":"Release retrospective","href":"/news/windows-linux-animated-3d-and-mods/","terms":"news beta updates 1.2–1.3 Beta 1 The August 1.2 and 1.3 betas added native Windows/Linux editions, animated Mac scenes and a deliberately data-only Mods system."},
    {"title":"NetVista Studio's first public source and Mac beta","kind":"Release retrospective","href":"/news/first-public-source-and-mac-beta/","terms":"news beta updates 1.1 Beta 1 A look back at the earliest public app source on 10 August 2026 and the first downloadable Mac beta three days later."},
    { title: 'About NetVista Studio', kind: 'Independent film studio', href: '/#studio', terms: 'about contact studio independent team email' }
  ];

  const available = element => Boolean(element && !element.hidden && element.getClientRects().length);
  const focusable = container => [...container.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]')].filter(available);
  const focus = element => { if (available(element)) element.focus({ preventScroll: true }); };

  function setMenu(value, restore = false) {
    open = Boolean(value && mobile.matches);
    if (open && searching) setSearch(false);
    header.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    toggle.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    const icon = document.createElement('span');
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = open ? '×' : '☰';
    toggle.replaceChildren(document.createTextNode(open ? 'Close ' : 'Menu '), icon);
    backdrop.hidden = !open;
    document.documentElement.classList.toggle('navigation-open', open);
    if (restore) focus(toggle);
  }

  function renderSearch() {
    if (!results || !searchInput) return;
    const words = searchInput.value.trim().toLocaleLowerCase('en-GB').split(/\s+/).filter(Boolean);
    const matching = catalogue.filter(item => words.every(word => `${item.title} ${item.kind} ${item.terms}`.toLocaleLowerCase('en-GB').includes(word))).slice(0, words.length ? 9 : 5);
    const children = matching.map(item => {
      const row = document.createElement('li');
      const link = document.createElement('a');
      link.href = studioOrigin + item.href;
      const copy = document.createElement('span');
      const title = document.createElement('strong');
      title.textContent = item.title;
      const kind = document.createElement('small');
      kind.textContent = item.kind;
      copy.append(title, kind);
      const arrow = document.createElement('span');
      arrow.textContent = '→';
      arrow.setAttribute('aria-hidden', 'true');
      link.append(copy, arrow);
      row.append(link);
      return row;
    });
    if (!children.length) {
      const empty = document.createElement('li');
      empty.className = 'search-empty';
      empty.textContent = 'No matching pages. Try “video”, “colour” or “films”.';
      children.push(empty);
    }
    results.replaceChildren(...children);
    if (searchStatus) searchStatus.textContent = words.length ? `${matching.length} matching page${matching.length === 1 ? '' : 's'}.` : 'Find tools, films and editing guides.';
  }

  function setSearch(value, restore = false) {
    if (!searchToggle || !searchPanel || !searchInput) return;
    if (value && !searching) returnFocus = document.activeElement;
    searching = Boolean(value);
    if (searching && open) setMenu(false);
    searchPanel.hidden = !searching;
    searchBackdrop.hidden = !searching;
    searchToggle.setAttribute('aria-expanded', String(searching));
    document.documentElement.classList.toggle('search-open', searching);
    if (searching) {
      renderSearch();
      focus(searchInput);
    } else {
      searchInput.value = '';
      if (restore) focus(available(returnFocus) ? returnFocus : searchToggle);
      returnFocus = null;
    }
  }

  function trapTab(event, items) {
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    if (event.shiftKey && index <= 0) { event.preventDefault(); focus(items.at(-1)); }
    else if (!event.shiftKey && (index < 0 || index === items.length - 1)) { event.preventDefault(); focus(items[0]); }
  }

  toggle.addEventListener('click', () => setMenu(!open));
  backdrop.addEventListener('click', () => setMenu(false, true));
  searchToggle?.addEventListener('click', () => setSearch(!searching, searching));
  searchClose?.addEventListener('click', () => setSearch(false, true));
  searchBackdrop.addEventListener('click', () => setSearch(false, true));
  searchInput?.addEventListener('input', renderSearch);
  searchInput?.addEventListener('keydown', event => {
    if (event.key === 'Enter') {
      const first = results?.querySelector('a[href]');
      if (first) { event.preventDefault(); first.click(); }
    }
  });
  results?.addEventListener('click', event => { if (event.target.closest('a[href]')) setSearch(false, true); });
  nav.addEventListener('click', event => {
    if (!event.target.closest('a[href]')) return;
    setMenu(false, mobile.matches);
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && searching) { event.preventDefault(); setSearch(false, true); }
    else if (event.key === 'Escape' && open) { event.preventDefault(); setMenu(false, true); }
    else if (event.key === 'Tab' && searching) trapTab(event, focusable(searchPanel));
    else if (event.key === 'Tab' && open) trapTab(event, [toggle, ...focusable(nav)]);
  });
  mobile.addEventListener('change', () => setMenu(false));
  window.addEventListener('resize', () => { if (open) setMenu(false); });
  window.addEventListener('pageshow', () => { setMenu(false); setSearch(false); });
  window.addEventListener('hashchange', () => { setMenu(false); setSearch(false); });
  if (searchStatus) { searchStatus.setAttribute('role', 'status'); searchStatus.setAttribute('aria-live', 'polite'); }
  setMenu(false);
  if (searchPanel) { searchPanel.hidden = true; searchToggle?.setAttribute('aria-expanded', 'false'); }
})();
