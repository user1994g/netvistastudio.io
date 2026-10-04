import { films as catalogue } from '/assets/js/data/catalog.js';
import { LIST_KEY, playableFilms, readSaved, filterFilms, artworkURL, escapeHTML } from './library.js?v=2';

const films = playableFilms(catalogue);
const $ = id => document.getElementById(id);
let saved;
try { saved = readSaved(localStorage.getItem(LIST_KEY), films); } catch { saved = new Set(); }
let collection = 'all';
let current = films.find(film => film.id === 'final-lesson-ap-1') || films[0];
let toastTimer;
const details = $('details-dialog');
const player = $('player-dialog');
const dialogOpeners = new Map();

document.querySelectorAll('[data-enhance]').forEach(element => { element.hidden = false; });
$('year').textContent = new Date().getFullYear();

function notify(message) {
  clearTimeout(toastTimer);
  const region = details.open ? $('details-status') : $('toast');
  region.textContent = message;
  region.hidden = false;
  toastTimer = setTimeout(() => { region.hidden = true; }, 4000);
}
function updateSavedControls() {
  $('list-count').textContent = saved.size;
  document.querySelectorAll('[data-save]').forEach(button => {
    const film = films.find(item => item.id === button.dataset.save);
    if (!film) return;
    const active = saved.has(film.id);
    button.setAttribute('aria-pressed', String(active));
    button.setAttribute('aria-label', `${active ? 'Remove' : 'Save'} ${film.title} ${active ? 'from' : 'to'} My List`);
    button.textContent = button.classList.contains('round-button') ? (active ? '✓' : '+') : (active ? '✓ Saved' : '+ My List');
  });
}
function saveFilm(id) {
  if (!films.some(film => film.id === id)) return;
  const wasSaved = saved.has(id);
  if (wasSaved) saved.delete(id); else saved.add(id);
  let persisted = true;
  try { localStorage.setItem(LIST_KEY, JSON.stringify([...saved])); } catch { persisted = false; }
  if (collection === 'saved' && wasSaved) {
    const restoreFocus = $('film-grid').contains(document.activeElement);
    renderLibrary();
    if (restoreFocus) ($('film-grid').querySelector('[data-save]') || $('film-search')).focus();
  }
  updateSavedControls();
  notify(persisted ? (wasSaved ? 'Removed from My List.' : 'Saved to My List on this device.')
    : 'My List updated for this visit. Browser storage is unavailable.');
}
function renderLibrary() {
  const matches = filterFilms(films, $('film-search').value, saved, collection === 'saved');
  $('film-grid').innerHTML = matches.map(film => {
    const id = escapeHTML(film.id);
    return `<article class="film-card" data-film="${id}"><a class="film-art" data-watch="${id}" href="${escapeHTML(film.videoUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Watch ${escapeHTML(film.title)}"><img src="${escapeHTML(artworkURL(film))}" alt="Artwork for ${escapeHTML(film.title)}" loading="lazy" decoding="async"><span class="card-play" aria-hidden="true">▶</span></a><div class="card-copy"><p class="card-label">NETVISTA ORIGINAL / NOW STREAMING</p><h3>${escapeHTML(film.title)}</h3><p>${escapeHTML(film.description)}</p><div class="card-actions"><a class="text-link" data-watch="${id}" href="${escapeHTML(film.videoUrl)}" target="_blank" rel="noopener noreferrer">Watch film →</a><button class="text-link" data-details="${id}" type="button">Details</button><button class="text-link save-link" data-save="${id}" type="button" aria-pressed="false">+ My List</button></div></div></article>`;
  }).join('');
  const isSaved = collection === 'saved';
  $('library-title').textContent = isSaved ? 'Your next watch.' : 'Stories worth staying for.';
  $('library-eyebrow').textContent = isSaved ? 'MY LIST / SAVED ON THIS DEVICE' : 'THE NETVISTA COLLECTION';
  $('library-note').textContent = isSaved ? 'A little shelf for the stories you want to return to.'
    : `${films.length} original ${films.length === 1 ? 'film' : 'films'}. A small collection, made our way.`;
  $('results-status').textContent = `${matches.length} ${isSaved ? 'saved ' : ''}film${matches.length === 1 ? '' : 's'}${$('film-search').value.trim() ? (matches.length === 1 ? ' matches your search' : ' match your search') : ''}.`;
  $('film-empty').hidden = matches.length > 0;
  $('empty-title').textContent = isSaved && saved.size === 0 ? 'Your list starts here.' : 'No films found.';
  $('empty-copy').textContent = isSaved && saved.size === 0 ? 'Save a film with the + button and find it here later.' : 'Try another title, clear your search or browse all films.';
  $('list-note').hidden = !isSaved;
  document.querySelectorAll('[data-collection]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.collection === collection)));
  updateSavedControls();
}
function featureFilm(id) {
  const film = films.find(item => item.id === id);
  if (!film) return;
  current = film;
  $('hero-art').src = artworkURL(film);
  $('hero-title').textContent = film.title;
  $('hero-description').textContent = film.description;
  $('hero-format').textContent = film.format;
  $('hero-watch').href = film.videoUrl;
  $('hero-watch').dataset.watch = id;
  $('hero-details').dataset.details = id;
  $('hero-save').dataset.save = id;
  document.querySelectorAll('[data-feature]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.feature === id)));
  updateSavedControls();
}
function openDetails(id) {
  const film = films.find(item => item.id === id);
  if (!film) return;
  dialogOpeners.set(details, {element:document.activeElement, id});
  $('details-status').hidden = true;
  $('details-title').textContent = film.title;
  $('details-description').textContent = film.description;
  $('details-format').textContent = film.format;
  $('details-art').src = artworkURL(film);
  $('details-art').alt = `Artwork for ${film.title}`;
  $('details-watch').href = film.videoUrl;
  $('details-watch').dataset.watch = id;
  $('details-save').dataset.save = id;
  updateSavedControls();
  details.showModal();
  document.body.classList.add('dialog-open');
}
function watchFilm(id) {
  const film = films.find(item => item.id === id);
  if (!film) return;
  dialogOpeners.set(player, {element:document.activeElement, id});
  if (details.open) details.close();
  $('player-title').textContent = film.title;
  $('provider-link').href = film.videoUrl;
  $('video-frame').title = `Film player: ${film.title}`;
  $('video-frame').src = film.videoUrl;
  player.showModal();
  document.body.classList.add('dialog-open');
}
for (const dialog of [details, player]) {
  dialog.addEventListener('close', () => {
    if (dialog === player) $('video-frame').removeAttribute('src');
    if (!details.open && !player.open) {
      document.body.classList.remove('dialog-open');
      const opener = dialogOpeners.get(dialog);
      requestAnimationFrame(() => {
        const original = opener?.element;
        const sameCard = [...$('film-grid').querySelectorAll('[data-film]')].find(card => card.dataset.film === opener?.id);
        const fallback = sameCard?.querySelector('[data-details]') || $('film-grid').querySelector('[data-details]') || $('film-search');
        (original?.isConnected && original.getClientRects().length ? original : fallback).focus();
      });
    }
  });
  // Close only on a genuine backdrop pointer gesture, not a drag out of the content.
  let backdropDown = false;
  const outside = event => {
    const rect = dialog.getBoundingClientRect();
    return event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom;
  };
  dialog.addEventListener('pointerdown', event => { backdropDown = event.target === dialog && outside(event); });
  dialog.addEventListener('click', event => { if (backdropDown && event.target === dialog && outside(event)) dialog.close(); backdropDown = false; });
}
function showView(view, scroll = true) {
  collection = view === 'list' ? 'saved' : 'all';
  renderLibrary();
  document.querySelectorAll('[data-view]').forEach(link => {
    const active = link.dataset.view === view;
    link.classList.toggle('is-active', active);
    if (active) link.setAttribute('aria-current', 'page'); else link.removeAttribute('aria-current');
  });
  if (scroll) $(view === 'about' ? 'beta' : view === 'home' ? 'home' : 'films').scrollIntoView({behavior:'instant',block:'start'});
}
function viewFromHash() { return location.hash === '#my-list' ? 'list' : location.hash === '#films' ? 'films' : location.hash === '#beta' ? 'about' : 'home'; }
document.addEventListener('click', event => {
  const target = event.target.closest('[data-watch],[data-details],[data-save],[data-feature],[data-close],[data-collection],[data-view]');
  if (!target) return;
  if (target.dataset.watch) {
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault(); watchFilm(target.dataset.watch);
  }
  else if (target.dataset.details) openDetails(target.dataset.details);
  else if (target.dataset.save) saveFilm(target.dataset.save);
  else if (target.dataset.feature) featureFilm(target.dataset.feature);
  else if (target.dataset.close) $(target.dataset.close).close();
  else if (target.dataset.collection) {
    location.hash = target.dataset.collection === 'saved' ? 'my-list' : 'films';
    showView(target.dataset.collection === 'saved' ? 'list' : 'films', false);
  } else if (target.dataset.view) {
    event.preventDefault();
    const hash = {home:'home',films:'films',list:'my-list',about:'beta'}[target.dataset.view];
    if (location.hash === '#' + hash) showView(target.dataset.view); else location.hash = hash;
  }
});
$('film-search').addEventListener('input', renderLibrary);
$('reset-library').addEventListener('click', () => {
  $('film-search').value = '';
  collection = 'all';
  renderLibrary();
  history.replaceState(null, '', '#films');
  showView('films', false);
  $('film-search').focus();
});
window.addEventListener('hashchange', () => showView(viewFromHash()));
window.addEventListener('storage', event => {
  if (event.key !== LIST_KEY && event.key !== null) return;
  saved = readSaved(event.key === null ? null : event.newValue, films);
  if (collection === 'saved') renderLibrary(); else updateSavedControls();
});
renderLibrary();
if (current) featureFilm(current.id);
showView(viewFromHash(), Boolean(location.hash));
