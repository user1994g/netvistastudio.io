// NetVista Watch is a host-only site; the studio/editor pages stay on the apex.
// This is separation/unlisting, not private authentication or access control.
const videoHost = 'video.netvistastudio.com';
const noIndex = 'noindex, nofollow';
const assetPrefixes = ['/assets/images/', '/assets/css/', '/assets/js/', '/video-beta/assets/', '/editor/assets/'];
const assetFiles = ['/assets/mobile-navigation.js', '/assets/public-domain.js'];
function missing(request) {
  return new Response(request.method === 'HEAD' ? null : 'Not found', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': noIndex, 'Cache-Control': 'no-store' }
  });
}
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const pathname = url.pathname;
    // These verified asset-only paths also bypass this Worker in _routes.json.
    if (assetFiles.includes(pathname) || assetPrefixes.some(prefix => pathname.startsWith(prefix))) {
      return env.ASSETS.fetch(request);
    }
    if (url.hostname !== videoHost) {
      if (pathname === '/video-beta' || pathname.startsWith('/video-beta/')) return missing(request);
      return env.ASSETS.fetch(request);
    }
    if (url.pathname === '/' || url.pathname === '/index.html') {
      url.pathname = '/video-beta/';
      const response = await env.ASSETS.fetch(new Request(url, request));
      const headers = new Headers(response.headers);
      headers.set('X-Robots-Tag', noIndex);
      return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
    }
    if (pathname === '/video-beta' || pathname === '/video-beta/' || pathname === '/video-beta/index.html') {
      url.pathname = '/';
      return Response.redirect(url.toString(), 308);
    }
    if (pathname === '/account' || pathname.startsWith('/account/')) {
      url.pathname = '/editor' + pathname;
      if (url.pathname === '/editor/account') url.pathname += '/';
      // Retain legacy recovery callbacks. This is not Watch-site navigation.
      // 308 keeps method/query; the browser retains its recovery fragment.
      return Response.redirect(url.toString(), 308);
    }
    if (pathname === '/editor/account' || pathname.startsWith('/editor/account/')) {
      return env.ASSETS.fetch(request);
    }
    // Existing recovery-page links must still lead back to the app website,
    // without serving that editor page inside the independent Watch host.
    if (pathname === '/editor' || pathname === '/editor/' || pathname === '/editor/index.html') {
      url.hostname = 'netvistastudio.com';
      url.pathname = '/editor/';
      return Response.redirect(url.toString(), 308);
    }
    if (pathname === '/robots.txt') {
      return new Response(request.method === 'HEAD' ? null : 'User-agent: *\nDisallow: /\n', {
        headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': noIndex }
      });
    }
    // Do not expose the main homepage, application pages, editor or its guides
    // on this host, including new pages added to the combined project later.
    return missing(request);
  }
};
