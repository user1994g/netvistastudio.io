// Pure helpers shared by the browser and offline regression tests.
export const LIST_KEY = 'netvista-videos-list-v1';
export function playableFilms(catalogue) {
  return catalogue.filter(film => {
    if (film.status !== 'available' || !film.id || !film.title) return false;
    try {
      const url = new URL(film.videoUrl);
      return url.protocol === 'https:' && url.hostname === 'clip-kingdom-play.lovable.app'
        && /^\/embed\/[\w-]+$/.test(url.pathname) && !url.username && !url.password && !url.port;
    } catch { return false; }
  });
}
export function readSaved(serialized, films) {
  try {
    const value = JSON.parse(serialized || '[]');
    if (!Array.isArray(value)) return new Set();
    const allowed = new Set(films.map(film => film.id));
    return new Set(value.filter(id => typeof id === 'string' && allowed.has(id)));
  } catch { return new Set(); }
}
export function filterFilms(films, query, saved, savedOnly = false) {
  const needle = String(query || '').trim().toLocaleLowerCase();
  return films.filter(film => (!savedOnly || saved.has(film.id))
    && (!needle || [film.title, film.description, film.format].join(' ').toLocaleLowerCase().includes(needle)));
}
export function artworkURL(film) {
  const url = new URL(film.artwork, 'https://netvistastudio.com/');
  return url.origin === 'https://netvistastudio.com' && url.pathname.startsWith('/assets/images/')
    ? url.pathname : '/assets/images/brand/icon-512.png';
}
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
