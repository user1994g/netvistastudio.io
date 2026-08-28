import { films } from './data/catalog.js';
import { createDialog } from './modules/dialog.js';
import { initSiteShell } from './modules/site-shell.js';

initSiteShell();

const filmGrid = document.querySelector('#film-grid');
const hero = document.querySelector('.hero');
const heroBackdrop = document.querySelector('#hero-backdrop');
const heroTitle = document.querySelector('#hero-title');
const heroYear = document.querySelector('#hero-year');
const heroRating = document.querySelector('#hero-rating');
const heroFormat = document.querySelector('#hero-format');
const heroDescription = document.querySelector('#hero-description');
const heroSwitcher = document.querySelector('#hero-switcher');
const heroIndex = document.querySelector('#hero-index');
const videoFrame = document.querySelector('#video-frame');

let currentFilm = films[0];
let detailsFilm = films[0];
let heroTimer;
let heroSwapTimer;

function metaMarkup(item) {
  return `
    <span class="availability">${item.statusLabel}</span>
    <span>${item.year}</span>
    ${item.certificate ? `<span class="certificate">${item.certificate}</span>` : ''}
    <span>${item.format}</span>
  `;
}

function renderFilmCard(film, index) {
  const article = document.createElement('article');
  article.className = 'film-card catalog-item';
  article.dataset.title = film.title.toLowerCase();
  article.innerHTML = `
    <span class="film-card-index">PROJECT / ${String(index + 1).padStart(2, '0')}</span>
    <button class="film-card-art" type="button" aria-label="Play ${film.title}">
      <img src="${film.artwork}" alt="Artwork for ${film.title}" loading="eager" decoding="async">
      <span class="film-card-overlay">
        <p>ORIGINAL MOVING IMAGE</p>
        <span class="play-disc" aria-hidden="true">▶</span>
      </span>
    </button>
    <div class="film-card-copy">
      <h3>${film.title}</h3>
      <div class="title-meta">${metaMarkup(film)}</div>
      <p>${film.description}</p>
      <div class="film-card-actions">
        <button class="text-button" type="button" data-play>Watch film ↗</button>
        <button class="text-button" type="button" data-details>Project notes</button>
      </div>
    </div>
  `;

  article.querySelector('.film-card-art').addEventListener('click', (event) => openPlayer(film, event.currentTarget));
  article.querySelector('[data-play]').addEventListener('click', (event) => openPlayer(film, event.currentTarget));
  article.querySelector('[data-details]').addEventListener('click', (event) => openDetails(film, event.currentTarget));
  return article;
}

films.forEach((film, index) => filmGrid.appendChild(renderFilmCard(film, index)));

const playerRoot = document.querySelector('#player-dialog');
const detailsRoot = document.querySelector('#details-dialog');

const playerDialog = createDialog(playerRoot, {
  onClose: () => {
    videoFrame.src = '';
    scheduleHero();
  }
});

const detailsDialog = createDialog(detailsRoot, {
  onClose: scheduleHero
});

function stopHero() {
  window.clearTimeout(heroTimer);
}

function scheduleHero() {
  stopHero();
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || document.hidden) return;
  heroTimer = window.setTimeout(() => {
    const nextIndex = (films.indexOf(currentFilm) + 1) % films.length;
    setHero(nextIndex);
  }, 14000);
}

function applyHero(film, index) {
  currentFilm = film;
  heroBackdrop.style.backgroundImage = `url('${film.artwork}')`;
  heroTitle.textContent = film.title;
  heroYear.textContent = film.year;
  heroRating.textContent = film.certificate;
  heroFormat.textContent = film.format;
  heroDescription.textContent = film.description;
  heroIndex.textContent = String(index + 1).padStart(2, '0');
  heroSwitcher.querySelectorAll('button').forEach((button, buttonIndex) => {
    const active = buttonIndex === index;
    button.classList.toggle('is-active', active);
    button.setAttribute('aria-pressed', String(active));
  });
  heroBackdrop.classList.remove('is-switching');
}

function setHero(index, { immediate = false } = {}) {
  const film = films[index];
  stopHero();
  window.clearTimeout(heroSwapTimer);
  if (immediate) {
    applyHero(film, index);
    scheduleHero();
    return;
  }
  heroBackdrop.classList.add('is-switching');
  heroSwapTimer = window.setTimeout(() => {
    applyHero(film, index);
    scheduleHero();
  }, 420);
}

films.forEach((film, index) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.setAttribute('aria-label', `Feature ${film.title}`);
  button.addEventListener('click', () => setHero(index));
  heroSwitcher.appendChild(button);
});

setHero(0, { immediate: true });

hero.addEventListener('pointerenter', stopHero);
hero.addEventListener('pointerleave', scheduleHero);
hero.addEventListener('focusin', stopHero);
hero.addEventListener('focusout', (event) => {
  if (!hero.contains(event.relatedTarget)) scheduleHero();
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) stopHero();
  else scheduleHero();
});

function openPlayer(film, trigger) {
  stopHero();
  document.querySelector('#player-title').textContent = film.title;
  videoFrame.title = `${film.title} player`;
  videoFrame.src = film.videoUrl;
  playerDialog.open(trigger);
}

function openDetails(film, trigger) {
  stopHero();
  detailsFilm = film;
  document.querySelector('#details-title').textContent = film.title;
  document.querySelector('#details-year').textContent = film.year;
  document.querySelector('#details-rating').textContent = film.certificate;
  document.querySelector('#details-format').textContent = film.format;
  document.querySelector('#details-description').textContent = film.description;
  document.querySelector('#details-art').style.backgroundImage = `url('${film.artwork}')`;
  detailsDialog.open(trigger);
}

document.querySelector('#hero-play').addEventListener('click', (event) => openPlayer(currentFilm, event.currentTarget));
document.querySelector('#hero-details').addEventListener('click', (event) => openDetails(currentFilm, event.currentTarget));
document.querySelector('#details-play').addEventListener('click', (event) => {
  detailsDialog.close();
  openPlayer(detailsFilm, document.querySelector('#hero-play'));
});

const searchPanel = document.querySelector('#search-panel');
const searchToggle = document.querySelector('#search-toggle');
const searchClose = document.querySelector('#search-close');
const searchInput = document.querySelector('#search-input');
const searchStatus = document.querySelector('#search-status');

function filterCatalogue(query) {
  const normalized = query.trim().toLowerCase();
  let matches = 0;

  document.querySelectorAll('.catalog-item').forEach((item) => {
    const matchesQuery = !normalized || item.dataset.title.includes(normalized);
    item.hidden = !matchesQuery;
    if (matchesQuery) matches += 1;
  });

  document.querySelector('#work').hidden = Boolean(normalized) && ![...filmGrid.children].some((item) => !item.hidden);
  searchStatus.textContent = normalized
    ? `${matches} title${matches === 1 ? '' : 's'} found.`
    : 'Search the released film portfolio.';
}

function setSearchOpen(open, { restoreFocus = false } = {}) {
  searchPanel.hidden = !open;
  searchToggle.setAttribute('aria-expanded', String(open));
  if (open) {
    stopHero();
    searchInput.focus();
  } else {
    searchInput.value = '';
    filterCatalogue('');
    scheduleHero();
    if (restoreFocus) searchToggle.focus();
  }
}

searchToggle.addEventListener('click', () => setSearchOpen(searchPanel.hidden));
searchClose.addEventListener('click', () => setSearchOpen(false, { restoreFocus: true }));
searchInput.addEventListener('input', () => filterCatalogue(searchInput.value));
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !searchPanel.hidden) setSearchOpen(false, { restoreFocus: true });
});
