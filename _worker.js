// Serve the video beta on its own host from the combined Pages project.
// Nothing on the apex host is rewritten; static serving retains existing behavior.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.hostname !== 'video.netvistastudio.com') return env.ASSETS.fetch(request);
    if (url.pathname === '/' || url.pathname === '/index.html') {
      url.pathname = '/video-beta/';
    } else if (url.pathname === '/account' || url.pathname.startsWith('/account/')) {
      url.pathname = '/editor' + url.pathname;
      if (url.pathname === '/editor/account') url.pathname += '/';
      // The account page uses document-relative assets and module imports.
      // Keep its browser URL on the existing path; 308 preserves method/query,
      // and the browser retains the recovery fragment through this redirect.
      return Response.redirect(url.toString(), 308);
    } else {
      return env.ASSETS.fetch(request);
    }
    const response = await env.ASSETS.fetch(new Request(url, request));
    return response;
  }
};
