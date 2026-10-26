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
const assetFiles = ['/assets/mobile-navigation.js', '/assets/public-domain.js', '/assets/studio-motion.js', '/assets/studio-look-demo.js', '/assets/studio-cut-study.js', '/assets/privacy-controls.js', '/assets/privacy-controls.css'];
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
// Fibre concept: exact-host routing must run before generic asset and API routes.
// This intentionally does not change the main site or the existing Watch host.
const host = 'fibre.netvistastudio.com';
const securityHeaders = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'X-Robots-Tag': 'noindex, nofollow'
};
const resources = new Map([
  // Use the directory form, as in the existing Watch mount, to avoid Pages'
  // index.html-to-directory canonical redirect exposing an internal mount path.
  ['/', ['/fibre-concept/', 'text/html; charset=utf-8']],
  ['/index.html', ['/fibre-concept/', 'text/html; charset=utf-8']],
  ['/assets/fibre.css', ['/fibre-concept/assets/fibre.css', 'text/css; charset=utf-8']],
  ['/assets/fibre.js', ['/fibre-concept/assets/fibre.js', 'text/javascript; charset=utf-8']],
  ['/assets/fibre-loop.svg', ['/fibre-concept/assets/fibre-loop.svg', 'image/svg+xml']],
  ['/assets/fibre-icon.svg', ['/fibre-concept/assets/fibre-icon.svg', 'image/svg+xml']]
]);

function plain(request, message, status, extraHeaders = {}) {
  return new Response(request.method === 'HEAD' ? null : message, {
    status,
    headers: { ...securityHeaders, 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', ...extraHeaders }
  });
}

async function handleFibreRequest(request, env) {
  let url;
  try { url = new URL(request.url); } catch { return null; }
  if (url.hostname !== host) return null;
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return plain(request, 'Method not allowed', 405, { Allow: 'GET, HEAD' });
  }
  if (url.protocol === 'http:') {
    url.protocol = 'https:';
    return plain(request, 'Use HTTPS', 308, { Location: url.toString() });
  }
  if (url.protocol !== 'https:') return plain(request, 'Bad request', 400);
  try { decodeURIComponent(url.pathname); } catch { return plain(request, 'Bad request', 400); }
  if (url.pathname === '/robots.txt') {
    return plain(request, 'User-agent: *\nDisallow: /\n', 200, { 'Cache-Control': 'no-cache' });
  }
  const resource = resources.get(url.pathname);
  if (!resource) return plain(request, 'Not found', 404);

  // No request cookies, Authorization, Origin, query, body or other client headers
  // are passed to the static binding. This concept has no account or API routes.
  const assetURL = new URL(url);
  assetURL.pathname = resource[0];
  assetURL.search = '';
  let response;
  try {
    response = await env.ASSETS.fetch(new Request(assetURL, { method: request.method, redirect: 'manual' }));
  } catch { return plain(request, 'Concept temporarily unavailable', 502); }
  if (response.status === 404) return plain(request, 'Not found', 404);
  if (!response.ok) return plain(request, 'Concept temporarily unavailable', 502);

  // Do not inherit application CORS, Set-Cookie, Location or other route headers.
  // Encoding/length must stay paired with the upstream static response body.
  const headers = new Headers(securityHeaders);
  for (const name of ['Content-Encoding', 'Content-Length', 'ETag', 'Last-Modified']) {
    const value = response.headers.get(name);
    if (value !== null) headers.set(name, value);
  }
  if (headers.has('Content-Encoding')) headers.set('Vary', 'Accept-Encoding');
  headers.set('Content-Type', resource[1]);
  headers.set('Cache-Control', 'no-cache');
  return new Response(request.method === 'HEAD' ? null : response.body, {
    status: response.status,
    headers
  });
}

export default {
  async fetch(request, env) {
    const fibreResponse = await handleFibreRequest(request, env);
    if (fibreResponse) return fibreResponse;
    const url = new URL(request.url), pathname = url.pathname;
    let decodedPath;
    try { decodedPath = decodeURIComponent(pathname); } catch { return missing(request); }
    if (decodedPath === '/fibre-concept' || decodedPath.startsWith('/fibre-concept/')) return missing(request);
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
      headers.set('Referrer-Policy', 'no-referrer');
      headers.set('X-Content-Type-Options', 'nosniff');
      headers.set('X-Frame-Options', 'DENY');
      headers.set('Content-Security-Policy', "base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'none'");
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    if (pathname === '/video-beta' || pathname === '/video-beta/' || pathname === '/video-beta/index.html') { url.pathname = '/'; return Response.redirect(url.toString(), 308); }
    if (pathname === '/account' || pathname.startsWith('/account/')) {
      url.pathname = '/editor' + pathname;
      if (url.pathname === '/editor/account') url.pathname += '/';
      return Response.redirect(url.toString(), 308);
    }
    if (pathname === '/editor/account' || pathname.startsWith('/editor/account/')) return env.ASSETS.fetch(request);
    if (pathname === '/privacy' || pathname === '/privacy/' || pathname === '/privacy/index.html') return env.ASSETS.fetch(request);
    if (pathname === '/editor' || pathname === '/editor/' || pathname === '/editor/index.html') {
      url.hostname = 'netvistastudio.com'; url.pathname = '/editor/'; return Response.redirect(url.toString(), 308);
    }
    if (pathname === '/robots.txt') return new Response(request.method === 'HEAD' ? null : 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /account/\nDisallow: /editor/\nSitemap: https://video.netvistastudio.com/sitemap.xml\n', { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
    if (pathname === '/sitemap.xml') return new Response(request.method === 'HEAD' ? null : '<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://video.netvistastudio.com/</loc></url></urlset>', { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
    return missing(request);
  }
};
