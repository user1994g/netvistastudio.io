// Public Watch welcome is crawlable. Catalogue needs a verified NetVista account.
// Media remains on the existing public film host, not private/DRM storage.
const videoHost = 'video.netvistastudio.com';
const noIndex = 'noindex, nofollow';
const authURL = 'https://tsitgxafmtzjgtmiczsq.supabase.co/auth/v1/user';
// Browser-safe key, also used by editor/assets/auth-client.js.
const publishableKey = 'sb_publishable__tAdP-Xsu5Gh2ImdKvOHnw_WVujAfJh';
const watchFilms = [
  { id: 'dark-echoes-1939', title: 'The dark echo’s of 1939', status: 'available', format: 'Feature film', artwork: 'assets/images/photos/dark-echoes.jpg',
    description: 'A buried broadcast, a vanished town, and one voice still echoing through the static. Uncover the story that history tried to erase.',
    videoUrl: 'https://clip-kingdom-play.lovable.app/embed/21230af6-5a84-4072-befc-276e5f349145',
    mediaUrl: 'https://clip-kingdom-play.lovable.app/api/public/stream/21230af6-5a84-4072-befc-276e5f349145' },
  { id: 'final-lesson-ap-1', title: 'The Final Lesson AP 1', status: 'available', format: 'Feature film', artwork: 'assets/images/photos/final-lesson.jpg',
    description: 'One last class reveals a lesson no one was meant to learn. What begins as an ordinary final session becomes a discovery that cannot be forgotten.',
    videoUrl: 'https://clip-kingdom-play.lovable.app/embed/878b4496-ab7a-47fe-8e0f-0b489311241c',
    mediaUrl: 'https://clip-kingdom-play.lovable.app/api/public/stream/878b4496-ab7a-47fe-8e0f-0b489311241c' }
];
const assetPrefixes = ['/assets/images/', '/assets/css/', '/assets/js/', '/video-beta/assets/', '/editor/assets/'];
const assetFiles = ['/assets/mobile-navigation.js', '/assets/public-domain.js'];
function missing(request) {
  return new Response(request.method === 'HEAD' ? null : 'Not found', { status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': noIndex, 'Cache-Control': 'no-store' } });
}
function json(data, status = 200, head = false) {
  return new Response(head ? null : JSON.stringify(data), { status, headers: {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
    'Vary': 'Authorization, Origin', 'X-Robots-Tag': noIndex, 'X-Content-Type-Options': 'nosniff'
  } });
}
async function catalogue(request) {
  if (request.method !== 'GET') {
    const response = json({ error: 'Method not allowed' }, 405, request.method === 'HEAD');
    response.headers.set('Allow', 'GET');
    return response;
  }
  const origin = request.headers.get('Origin');
  if (origin && origin !== 'https://' + videoHost) return json({ error: 'Origin not allowed' }, 403);
  const authorization = request.headers.get('Authorization') || '';
  if (authorization.length > 8192 || !/^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(authorization)) return json({ error: 'Sign in to watch' }, 401);
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 10000);
  try {
    const response = await fetch(authURL, { headers: { apikey: publishableKey, Authorization: authorization }, signal: abort.signal });
    if (response.status === 401 || response.status === 403) return json({ error: 'Sign in again to watch' }, 401);
    if (!response.ok) return json({ error: 'Account verification is temporarily unavailable' }, 503);
    const user = await response.json();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(user?.id || '') || user.is_anonymous) return json({ error: 'A NetVista account is required' }, 401);
    return json({ films: watchFilms });
  } catch { return json({ error: 'Account verification is temporarily unavailable' }, 503); }
  finally { clearTimeout(timer); }
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url), pathname = url.pathname;
    let decodedPath;
    try { decodedPath = decodeURIComponent(pathname); } catch { return missing(request); }
    if (url.hostname === videoHost && decodedPath === '/assets/js/data/catalog.js') return missing(request);
    if (pathname.startsWith('/api/watch/')) {
      if (url.hostname !== videoHost || pathname !== '/api/watch/catalog') return missing(request);
      return catalogue(request);
    }
    if (assetFiles.includes(pathname) || assetPrefixes.some(prefix => pathname.startsWith(prefix))) return env.ASSETS.fetch(request);
    if (url.hostname !== videoHost) {
      if (pathname === '/video-beta' || pathname.startsWith('/video-beta/')) return missing(request);
      return env.ASSETS.fetch(request);
    }
    if (pathname === '/' || pathname === '/index.html') {
      url.pathname = '/video-beta/';
      const response = await env.ASSETS.fetch(new Request(url, request)), headers = new Headers(response.headers);
      headers.set('X-Robots-Tag', 'index, follow');
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    if (pathname === '/video-beta' || pathname === '/video-beta/' || pathname === '/video-beta/index.html') { url.pathname = '/'; return Response.redirect(url.toString(), 308); }
    if (pathname === '/account' || pathname.startsWith('/account/')) {
      url.pathname = '/editor' + pathname;
      if (url.pathname === '/editor/account') url.pathname += '/';
      return Response.redirect(url.toString(), 308);
    }
    if (pathname === '/editor/account' || pathname.startsWith('/editor/account/')) return env.ASSETS.fetch(request);
    if (pathname === '/editor' || pathname === '/editor/' || pathname === '/editor/index.html') {
      url.hostname = 'netvistastudio.com'; url.pathname = '/editor/'; return Response.redirect(url.toString(), 308);
    }
    if (pathname === '/robots.txt') return new Response(request.method === 'HEAD' ? null : 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account/\nDisallow: /editor/\nSitemap: https://video.netvistastudio.com/sitemap.xml\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    if (pathname === '/sitemap.xml') return new Response(request.method === 'HEAD' ? null : '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://video.netvistastudio.com/</loc></url></urlset>', { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
    return missing(request);
  }
};
