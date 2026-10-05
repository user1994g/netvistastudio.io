import { playableFilms, filterFilms, artworkURL, escapeHTML, trustedMediaURL, playbackState, continueRows } from './library.js?v=4';

const $ = id => document.getElementById(id);
const forms = ['signin-form', 'signup-form', 'reset-form'].map($);
const authDialog = $('auth-dialog'), details = $('details-dialog'), player = $('player-dialog');
const video = $('native-player');
let client, authRedirect, apiURL, apiKey, ready = false, user = null;
let films = [], rows = new Map(), collection = 'all', current, playing, didPlay = false, restored = false;
let generation = 0, authRun = 0, authMode = 'signin', toastTimer, lastSave = 0, accessToken = '';
let writing = Promise.resolve(), checking = false, queuedCheck = false;
const openers = new Map();
const RESET_KEY = 'netvista-watch-reset-after';
for (const id of ['account-controls', 'authenticated-app', 'auth-dialog', 'details-dialog', 'player-dialog']) $(id).setAttribute('data-clarity-mask', '');

// Fail closed before loading the shared remote SDK: never native-submit passwords.
forms.forEach(form => form.addEventListener('submit', event => event.preventDefault()));
$('year').textContent = new Date().getFullYear();
function status(message, error = false) {
  $('auth-status').textContent = message;
  $('auth-status').hidden = !message;
  $('auth-status').classList.toggle('is-error', error);
}
function notify(message) {
  clearTimeout(toastTimer);
  $('toast').textContent = message; $('toast').hidden = false;
  toastTimer = setTimeout(() => { $('toast').hidden = true; }, 5000);
}
function mode(value) {
  authMode = ['signin', 'signup', 'reset'].includes(value) ? value : 'signin';
  forms.forEach(form => { form.hidden = form.id !== authMode + '-form'; });
  document.querySelectorAll('[data-auth-mode]').forEach(button => {
    button.setAttribute('aria-pressed', String(button.dataset.authMode === authMode));
    button.classList.toggle('is-active', button.dataset.authMode === authMode);
  });
  $('auth-title').textContent = authMode === 'signup' ? 'Your next story starts here.' : authMode === 'reset' ? 'Reset your password.' : 'Welcome back.';
  $('auth-description').textContent = authMode === 'signup' ? 'Create one account for watching films and using NetVista Editor.' : authMode === 'reset' ? 'Enter your account email. The reset link opens the secure NetVista account page.' : 'Sign in to your little cinema. Your Editor account works here too.';
}
function openAuth(value) {
  mode(value); status(ready ? '' : 'Connecting securely…');
  openers.set(authDialog, document.activeElement);
  if (!authDialog.open) authDialog.showModal();
}
function lock() {
  // Erase all previous-account data, not just hide the old account's library.
  if (player.open) player.close();
  if (details.open) details.close();
  video.pause(); video.removeAttribute('src'); video.load();
  user = null; accessToken = ''; films = []; rows.clear(); current = null; playing = null;
  generation++;
  if ($('nav-toggle').getAttribute('aria-expanded') === 'true') $('nav-toggle').click();
  for (const id of ['film-grid', 'continue-grid', 'saved-grid']) $(id).replaceChildren();
  $('hero-art').removeAttribute('src');
  $('account-email').textContent = '';
  $('authenticated-app').hidden = true; $('welcome').hidden = false;
  $('home').hidden = true;
  for (const id of ['primary-nav', 'browse-search', 'account-controls', 'nav-toggle']) $(id).hidden = true;
  $('guest-controls').hidden = false;
  document.querySelector('meta[name="robots"]').content = 'index, follow';
  $('site-header').classList.remove('is-watching');
}
async function deadline(operation) {
  let timer;
  try { return await Promise.race([operation(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Connection timed out. Please try again.')), 20000); })]); }
  finally { clearTimeout(timer); }
}
function rowFor(id) { return rows.get(id) || { film_id: id, position_seconds: 0, duration_seconds: 0, completed: false, saved: false, last_watched_at: null }; }
function savedIds() { return new Set([...rows.values()].filter(row => row.saved).map(row => row.film_id)); }
function time(value) {
  const seconds = Math.max(0, Math.floor(value || 0));
  return Math.floor(seconds / 60) + ':' + String(seconds % 60).padStart(2, '0');
}
function card(film, continued = false) {
  const id = escapeHTML(film.id), row = rowFor(film.id);
  const percentage = row.duration_seconds > 0 ? Math.min(100, row.position_seconds / row.duration_seconds * 100) : 0;
  return `<article class="film-card" data-film="${id}"><button class="film-art" type="button" data-watch="${id}" aria-label="${continued ? 'Resume' : 'Watch'} ${escapeHTML(film.title)}"><img src="${escapeHTML(artworkURL(film))}" alt="" loading="lazy" decoding="async"><span class="card-play" aria-hidden="true">▶</span><span class="card-original">NETVISTA ORIGINAL</span></button>${continued ? `<div class="progress-track" role="progressbar" aria-label="Playback progress" aria-valuenow="${Math.round(percentage)}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percentage}%"></span></div>` : ''}<div class="card-copy"><h3>${escapeHTML(film.title)}</h3><p class="card-label">${continued ? 'Resume at ' + time(row.position_seconds) : row.completed ? 'Watched · Play again' : 'NetVista Original'}</p><div class="card-actions"><button class="text-link" data-watch="${id}" type="button">${continued ? 'Resume' : 'Play'} <span aria-hidden="true">▶</span></button><button class="text-link" data-details="${id}" type="button">Details</button><button class="text-link save-link" data-save="${id}" type="button" aria-pressed="${row.saved}">${row.saved ? '✓ Saved' : '+ My List'}</button>${continued ? `<button class="text-link" type="button" data-forget="${id}" aria-label="Remove ${escapeHTML(film.title)} from Continue watching">×</button>` : ''}</div></div></article>`;
}
function updateSavedControls() {
  $('list-count').textContent = savedIds().size;
  document.querySelectorAll('[data-save]').forEach(button => {
    const film = films.find(item => item.id === button.dataset.save);
    if (!film) return;
    const active = rowFor(film.id).saved;
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', `${active ? 'Remove' : 'Save'} ${film.title} ${active ? 'from' : 'to'} My List`);
    button.textContent = button.classList.contains('round-button') ? (active ? '✓' : '+') : (active ? '✓ Saved' : '+ My List');
  });
}
function renderLibrary() {
  if (!user) return;
  const saved = savedIds(), matches = filterFilms(films, $('film-search').value, saved, collection === 'saved');
  $('film-grid').innerHTML = matches.map(film => card(film)).join('');
  const recent = continueRows([...rows.values()]).map(row => films.find(film => film.id === row.film_id)).filter(Boolean);
  $('continue-grid').innerHTML = recent.map(film => card(film, true)).join('');
  $('continue-empty').hidden = recent.length > 0;
  const savedFilms = films.filter(film => saved.has(film.id));
  $('saved-grid').innerHTML = savedFilms.map(film => card(film)).join('');
  $('saved-empty').hidden = savedFilms.length > 0;
  $('library-title').textContent = collection === 'saved' ? 'My List' : 'NetVista Originals';
  $('library-eyebrow').textContent = collection === 'saved' ? 'YOUR COLLECTION' : 'INDEPENDENT CINEMA';
  $('library-note').textContent = `${films.length} independent films. A small collection with its own point of view.`;
  $('results-status').textContent = `${matches.length} film${matches.length === 1 ? '' : 's'} found.`;
  $('film-empty').hidden = matches.length > 0;
  $('empty-title').textContent = collection === 'saved' && !saved.size ? 'Make it your list.' : 'No films found.';
  $('empty-copy').textContent = collection === 'saved' && !saved.size ? 'Save a film with + My List to find it here.' : 'Try another title or clear your search.';
  document.querySelectorAll('[data-collection]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.collection === collection)));
  updateSavedControls();
}
function featureFilm(id) {
  const film = films.find(item => item.id === id); if (!film) return;
  current = film; $('hero-art').src = artworkURL(film);
  $('hero-title').textContent = film.title; $('hero-description').textContent = film.description;
  $('hero-format').textContent = film.format;
  $('hero-watch').dataset.watch = id; $('hero-details').dataset.details = id; $('hero-save').dataset.save = id;
  $('hero-watch').textContent = rowFor(id).last_watched_at && !rowFor(id).completed ? '▶ Continue watching' : '▶ Play film';
  document.querySelectorAll('[data-feature]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.feature === id)));
  updateSavedControls();
}
function persist(row, message = false) {
  if (!user) return Promise.resolve(false);
  const owner = user.id, version = generation;
  const snapshot = { user_id: owner, film_id: row.film_id, position_seconds: row.position_seconds, duration_seconds: row.duration_seconds, completed: row.completed, saved: row.saved, last_watched_at: row.last_watched_at };
  const task = writing.catch(() => {}).then(async () => {
    if (!user || user.id !== owner || generation !== version) return false;
    try {
      const result = await deadline(() => client.from('watch_progress').upsert(snapshot, { onConflict: 'user_id,film_id' }));
      if (generation !== version) return false;
      if (result.error) throw result.error;
      $('player-status').textContent = 'Playback position saved to your account.';
      if (message) notify('My List saved to your account.');
      return true;
    } catch {
      if (generation === version) {
        $('player-status').textContent = 'Could not sync yet. Keep this page open and try again.';
        notify('Account sync failed. Your changes are kept for this visit; try again when connected.');
      }
      return false;
    }
  });
  writing = task; return task;
}
async function saveFilm(id) {
  if (!user || !films.some(film => film.id === id)) return;
  const row = { ...rowFor(id), saved: !rowFor(id).saved }; rows.set(id, row);
  const original = document.activeElement;
  const focused = original?.dataset.save === id;
  const grid = original?.closest?.('.film-grid');
  renderLibrary();
  if (focused) {
    if (original.isConnected) original.focus();
    else [...(grid || document).querySelectorAll('[data-save]')].find(button => button.dataset.save === id && button.getClientRects().length)?.focus();
  }
  await persist(row, true);
}
function openDetails(id) {
  const film = films.find(item => item.id === id); if (!film || !user) return;
  openers.set(details, document.activeElement);
  $('details-title').textContent = film.title; $('details-description').textContent = film.description;
  $('details-format').textContent = film.format; $('details-art').src = artworkURL(film); $('details-art').alt = '';
  $('details-watch').dataset.watch = id; $('details-save').dataset.save = id;
  updateSavedControls(); details.showModal();
}
function snapshotPlayback(ended = video.ended) {
  if (!user || !playing || !didPlay) return null;
  const row = { ...rowFor(playing.id), ...playbackState(video.currentTime, video.duration, ended), last_watched_at: new Date().toISOString() };
  rows.set(playing.id, row); return row;
}
function savePlayback(force = false) {
  const row = snapshotPlayback(); if (!row) return;
  if (!force && Date.now() - lastSave < 15000) return;
  lastSave = Date.now(); persist(row); renderLibrary();
}
function watchFilm(id) {
  const film = films.find(item => item.id === id); if (!film || !user || !trustedMediaURL(film.mediaUrl)) return;
  if (player.open) { savePlayback(true); video.pause(); }
  openers.set(player, document.activeElement); if (details.open) details.close();
  playing = film; didPlay = false; restored = false; lastSave = 0;
  $('player-title').textContent = film.title; $('player-status').textContent = 'Your playback position will save automatically.';
  video.src = trustedMediaURL(film.mediaUrl); video.poster = artworkURL(film);
  if (!player.open) player.showModal();
  video.load(); // Native controls remain usable if autoplay is restricted.
  video.play().catch(() => { $('player-status').textContent = 'Press play to start. Your position saves automatically.'; });
}
video.addEventListener('loadedmetadata', () => {
  if (!playing || restored) return;
  const row = rowFor(playing.id);
  if (!row.completed && row.position_seconds > 0 && Number.isFinite(video.duration)) video.currentTime = Math.min(row.position_seconds, Math.max(0, video.duration - 1));
  restored = true;
});
video.addEventListener('playing', () => { didPlay = true; savePlayback(true); });
video.addEventListener('timeupdate', () => savePlayback());
for (const event of ['pause', 'seeked', 'ended']) video.addEventListener(event, () => savePlayback(true));
video.addEventListener('error', () => { $('player-status').textContent = 'The film could not load. Check your connection, close the player and try again.'; });
$('restart-film').addEventListener('click', () => {
  if (!playing) return;
  rows.set(playing.id, { ...rowFor(playing.id), completed: false, position_seconds: 0 });
  video.currentTime = 0; video.play().catch(() => {}); savePlayback(true);
});
function keepaliveProgress() {
  const row = snapshotPlayback(); if (!row || !accessToken) return;
  // On page exit an ordinary SDK request may be cancelled. Keepalive is best
  // effort, backed by the 15-second checkpoints and pause/close saves.
  fetch(apiURL + '/rest/v1/watch_progress?on_conflict=user_id,film_id', {
    method: 'POST', keepalive: true, headers: { apikey: apiKey, Authorization: 'Bearer ' + accessToken,
      'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ user_id: user.id, ...row, updated_at: undefined })
  }).catch(() => {});
}
document.addEventListener('visibilitychange', () => { if (document.hidden) { savePlayback(true); keepaliveProgress(); } });
window.addEventListener('pagehide', keepaliveProgress);

for (const dialog of [authDialog, details, player]) {
  dialog.addEventListener('close', () => {
    if (dialog === authDialog) { $('signin-password').value = ''; $('signup-password').value = ''; }
    if (dialog === player) { savePlayback(true); playing = null; didPlay = false; video.pause(); video.removeAttribute('src'); video.load(); }
    requestAnimationFrame(() => {
      if ([authDialog, details, player].some(item => item.open)) return;
      const opener = openers.get(dialog);
      if (opener?.isConnected && opener.getClientRects().length) opener.focus();
      else (user ? $('hero-watch') : $('guest-controls').querySelector('button'))?.focus();
    });
  });
  let backdrop = false;
  const outside = event => { const r = dialog.getBoundingClientRect(); return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom; };
  dialog.addEventListener('pointerdown', event => { backdrop = event.target === dialog && outside(event); });
  dialog.addEventListener('click', event => { if (backdrop && event.target === dialog && outside(event)) dialog.close(); backdrop = false; });
}
function showView(view, scroll = true) {
  if (!user) { openAuth('signin'); return; }
  collection = view === 'list' ? 'saved' : 'all'; renderLibrary();
  document.querySelectorAll('[data-view]').forEach(link => {
    const active = link.dataset.view === view; link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  const id = { list: 'my-list', films: 'films', continue: 'continue-watching', about: 'beta', home: 'home' }[view] || 'home';
  if (scroll) $(id).scrollIntoView({ behavior: 'instant', block: 'start' });
}
function viewFromHash() { return ({ '#my-list': 'list', '#films': 'films', '#continue-watching': 'continue', '#beta': 'about' })[location.hash] || 'home'; }
document.addEventListener('click', async event => {
  const target = event.target.closest('[data-watch],[data-details],[data-save],[data-forget],[data-feature],[data-close],[data-collection],[data-view],[data-auth],[data-auth-mode]');
  if (!target) return;
  if (target.dataset.auth) { event.preventDefault(); openAuth(target.dataset.auth); }
  else if (target.dataset.authMode) { mode(target.dataset.authMode); status(''); }
  else if (target.dataset.close) $(target.dataset.close).close();
  else if (target.dataset.watch) { event.preventDefault(); watchFilm(target.dataset.watch); }
  else if (target.dataset.details) openDetails(target.dataset.details);
  else if (target.dataset.save) saveFilm(target.dataset.save);
  else if (target.dataset.forget && user) {
    const id = target.dataset.forget; if (!films.some(film => film.id === id)) return;
    if (playing?.id === id) player.close();
    const row = { ...rowFor(id), position_seconds: 0, completed: false, last_watched_at: null };
    rows.set(id, row); renderLibrary(); if (await persist(row)) notify('Removed from Continue watching.');
  } else if (target.dataset.feature) featureFilm(target.dataset.feature);
  else if (target.dataset.collection) { collection = target.dataset.collection; renderLibrary(); }
  else if (target.dataset.view) { event.preventDefault(); const hash = { home: 'home', films: 'films', list: 'my-list', continue: 'continue-watching', about: 'beta' }[target.dataset.view]; if (hash) { history.replaceState(null, '', '#' + hash); showView(target.dataset.view); } }
});
$('film-search').addEventListener('input', renderLibrary);
$('browse-search').addEventListener('click', () => { showView('films'); $('film-search').focus(); });
$('reset-library').addEventListener('click', () => { $('film-search').value = ''; collection = 'all'; renderLibrary(); $('film-search').focus(); });
window.addEventListener('hashchange', () => { if (user) showView(viewFromHash()); });

async function refreshAccount() {
  if (!ready) return;
  if (checking) { queuedCheck = true; return; }
  checking = true;
  const run = ++authRun;
  let verifiedAccount = false;
  try {
    const verified = await deadline(() => client.auth.getUser());
    if (run !== authRun) return;
    if (verified.error || !verified.data?.user || verified.data.user.is_anonymous) { lock(); return; }
    const next = verified.data.user;
    const changed = user?.id !== next.id;
    if (changed) lock();
    user = next;
    const session = await deadline(() => client.auth.getSession());
    if (run !== authRun) return;
    if (session.error || session.data?.session?.user?.id !== next.id) { lock(); return; }
    accessToken = session.data?.session?.access_token || '';
    if (!accessToken) { lock(); return; }
    verifiedAccount = true;
    const version = generation;
    $('authenticated-app').hidden = false; $('welcome').hidden = true;
    for (const id of ['primary-nav', 'browse-search', 'account-controls', 'nav-toggle']) $(id).hidden = false;
    $('guest-controls').hidden = true; $('account-email').textContent = user.email || 'NetVista account';
    $('site-header').classList.add('is-watching');
    document.querySelector('meta[name="robots"]').content = 'noindex, nofollow';
    if (authDialog.open) authDialog.close();
    if (films.length && !changed) return;
    $('library-status').textContent = 'Loading your cinema…'; $('library-status').hidden = false; $('catalog-retry').hidden = true;
    const response = await deadline(() => fetch('/api/watch/catalog', { headers: { Authorization: 'Bearer ' + accessToken }, cache: 'no-store' }));
    if (version !== generation || run !== authRun) return;
    if (response.status === 401) { lock(); status('Your session expired. Sign in again.', true); openAuth('signin'); return; }
    if (!response.ok) throw new Error('Could not load the film collection.');
    const data = await response.json();
    films = playableFilms(Array.isArray(data.films) ? data.films : []).filter(film => trustedMediaURL(film.mediaUrl));
    if (!films.length) throw new Error('No playable films are available yet.');
    const historyResult = await deadline(() => client.from('watch_progress').select('film_id,position_seconds,duration_seconds,completed,saved,last_watched_at').eq('user_id', user.id));
    if (version !== generation || run !== authRun) return;
    if (historyResult.error) {
      // Do not overwrite unknown server rows with an empty local history.
      films = []; throw new Error('Your viewing history could not load. Please retry before watching.');
    }
    rows = new Map((historyResult.data || []).filter(row => films.some(film => film.id === row.film_id)).map(row => [row.film_id, row]));
    $('home').hidden = false;
    document.querySelectorAll('#authenticated-app [data-enhance]').forEach(element => { element.hidden = false; });
    $('hero-selector').innerHTML = films.map((film, index) => `<button type="button" data-feature="${escapeHTML(film.id)}" aria-pressed="false"><span>${String(index + 1).padStart(2, '0')}</span> ${escapeHTML(film.title)}</button>`).join('');
    renderLibrary(); featureFilm(films.find(film => film.id === 'final-lesson-ap-1')?.id || films[0].id);
    $('library-status').hidden = true; showView(viewFromHash(), Boolean(location.hash));
  } catch (error) {
    if (!verifiedAccount) { lock(); status('Could not verify your account. Check your connection and sign in again.', true); }
    else if (user) { $('library-status').hidden = false; $('library-status').textContent = error.message || 'Connection failed. Please retry.'; $('catalog-retry').hidden = false; }
  } finally {
    checking = false;
    if (queuedCheck) { queuedCheck = false; setTimeout(refreshAccount, 0); }
  }
}
$('catalog-retry').addEventListener('click', refreshAccount);
async function runForm(form, message, operation, success) {
  if (!ready || form.querySelector('fieldset').disabled) return;
  form.querySelector('fieldset').disabled = true; status(message);
  try {
    const result = await deadline(operation);
    if (result.error) { status(result.error.message || 'Please try again.', true); return; }
    form.reset(); await success(result.data || {});
  } catch (error) { status(error.message || 'Connection failed. Please try again.', true); }
  finally { form.querySelector('fieldset').disabled = !ready; }
}
$('signin-form').addEventListener('submit', () => {
  const email = $('signin-email').value.trim(), password = $('signin-password').value;
  runForm($('signin-form'), 'Signing in…', () => client.auth.signInWithPassword({ email, password }), refreshAccount);
});
$('signup-form').addEventListener('submit', () => {
  const email = $('signup-email').value.trim(), password = $('signup-password').value;
  runForm($('signup-form'), 'Creating your NetVista account…', () => client.auth.signUp({ email, password, options: { emailRedirectTo: authRedirect } }), async data => {
    if (data.session) await refreshAccount();
    else { mode('signin'); $('signin-email').value = email; status('Account created. If a confirmation email is required, open its newest link, then sign in here.'); }
  });
});
$('reset-form').addEventListener('submit', () => {
  const email = $('reset-email').value.trim();
  let after = 0; try { after = Number(localStorage.getItem(RESET_KEY) || 0); } catch {}
  if (Date.now() < after) { status('Please wait before requesting another reset. Requests are limited to one every 10 minutes.', true); return; }
  runForm($('reset-form'), 'Requesting a password reset…', () => client.auth.resetPasswordForEmail(email, { redirectTo: authRedirect }), () => {
    try { localStorage.setItem(RESET_KEY, String(Date.now() + 600000)); } catch {}
    status('If that email has a NetVista account, a reset link is on its way. Use the newest link.');
  });
});
$('sign-out').addEventListener('click', async () => {
  $('sign-out').disabled = true;
  keepaliveProgress(); authRun++;
  // Hide private content immediately even if remote sign-out is unavailable.
  lock();
  forms.forEach(form => form.reset());
  history.replaceState(null, '', location.pathname + location.search);
  $('welcome').scrollIntoView({ behavior: 'instant', block: 'start' });
  try { const result = await deadline(() => client.auth.signOut({ scope: 'local' })); if (result.error) throw result.error; notify('You are signed out.'); }
  catch {
    // Clear this origin's shared SDK session even if the logout network request
    // failed. Reload discards the SDK's in-memory token too.
    try {
      localStorage.removeItem('sb-tsitgxafmtzjgtmiczsq-auth-token');
      localStorage.removeItem('sb-tsitgxafmtzjgtmiczsq-auth-token-code-verifier');
    } catch { notify('Could not clear browser storage. Close this private tab and clear site data before sharing this device.'); return; }
    location.replace('/');
  }
  finally { $('sign-out').disabled = false; }
});
lock(); mode('signin');
try {
  const auth = await deadline(() => import('/editor/assets/auth-client.js'));
  client = auth.supabase; authRedirect = auth.authRedirect; apiURL = auth.SUPABASE_URL; apiKey = auth.SUPABASE_PUBLISHABLE_KEY;
  ready = true; forms.forEach(form => { form.querySelector('fieldset').disabled = false; }); status('');
  client.auth.onAuthStateChange(event => {
    if (event === 'SIGNED_OUT') { authRun++; lock(); }
    else setTimeout(refreshAccount, 0); // Never await another auth method inside the SDK callback.
  });
  await refreshAccount();
  setInterval(refreshAccount, 25 * 60 * 1000);
} catch { status('Secure sign-in could not load. Check your connection and reload. No password has been sent.', true); }
