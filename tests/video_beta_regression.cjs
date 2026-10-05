// Offline checks only: mocked auth network, no real accounts, browser, or deployment.
// node --experimental-vm-modules tests/video_beta_regression.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const videoOrigin = 'https://video.netvistastudio.com';
const apexOrigin = 'https://netvistastudio.com';
const html = read('video-beta/index.html');
const css = read('video-beta/assets/cinema.css');
const cinema = read('video-beta/assets/cinema.js');
const authClient = read('editor/assets/auth-client.js');
const supabaseURL = authClient.match(/SUPABASE_URL\s*=\s*['"]([^'"]+)['"]/)[1];
const publishableKey = authClient.match(/SUPABASE_PUBLISHABLE_KEY\s*=\s*['"]([^'"]+)['"]/)[1];
const decode = value => value.replaceAll('&amp;', '&').replaceAll('&quot;', '"');
const attrs = tag => Object.fromEntries([...tag.matchAll(/([\w-]+)="([^"]*)"/g)].map(m => [m[1], decode(m[2])]));
const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
assert.equal(ids.length, new Set(ids).size, 'HTML IDs must be unique');
const requiredIds = ['main', 'site-header', 'nav-toggle', 'primary-nav', 'home', 'films', 'my-list',
  'beta', 'hero-art', 'hero-title', 'hero-format', 'hero-description', 'hero-watch', 'hero-details',
  'hero-save', 'list-count', 'library-title', 'library-eyebrow', 'library-note', 'film-search',
  'results-status', 'film-grid', 'film-empty', 'empty-title', 'empty-copy', 'reset-library',
  'list-note', 'details-dialog', 'details-title', 'details-art', 'details-format',
  'details-description', 'details-watch', 'details-save', 'player-dialog', 'player-title',
  'native-player', 'year', 'toast', 'welcome', 'authenticated-app',
  'guest-controls', 'account-controls', 'auth-dialog', 'auth-title', 'auth-description',
  'auth-status', 'auth-tabs', 'signin-form', 'signup-form', 'reset-form', 'signin-email',
  'signin-password', 'signup-email', 'signup-password', 'reset-email', 'account-email',
  'sign-out', 'player-status', 'restart-film', 'continue-grid', 'continue-empty',
  'saved-grid', 'saved-empty'];
requiredIds.forEach(id => assert(ids.includes(id), `Missing Watch controller contract: #${id}`));
const elementTag = id => html.match(new RegExp(`<[^>]+\\bid="${id}"[^>]*>`))?.[0] || '';
assert(!/\bhidden\b/.test(elementTag('welcome')), 'The public welcome is available without JavaScript or a session');
assert(/\bhidden\b/.test(elementTag('authenticated-app')), 'Film browsing is locked before session validation');
for (const id of ['primary-nav', 'browse-search', 'nav-toggle', 'account-controls']) {
  assert(/\bhidden\b/.test(elementTag(id)), `Signed-in navigation starts locked: #${id}`);
}
assert(!/\bhidden\b/.test(elementTag('guest-controls')), 'Public account entry points start visible');
assert(!/\bsrc=/.test(elementTag('hero-art')), 'No featured film artwork is loaded before sign-in');
assert.match(html, /id="film-grid"[^>]*>\s*<\/div>/, 'The initial film catalog is empty, not merely visually obscured');
for (const match of html.matchAll(/\b(?:aria-labelledby|aria-describedby|aria-controls|for)="([^"]+)"/g)) {
  match[1].split(/\s+/).forEach(id => assert(ids.includes(id), `Broken accessibility reference: #${id}`));
}
for (const attribute of ['data-shared-navigation', 'data-view', 'data-collection', 'data-close', 'data-auth', 'data-auth-mode']) {
  assert(html.includes(attribute), `Missing shared attribute: ${attribute}`);
}
assert.match(html, /<main\b[^>]*id="main"[^>]*tabindex="-1"/);
assert.match(html, /<body class="videos-site">/, 'Watching is a standalone branded experience');
assert(!/editor-locked|download-modal|data-platform/.test(html), 'Watch does not import the editor download gate');
assert(!/\/editor\/assets\/site\.(?:css|js)/.test(html), 'Watch styling and navigation remain separate from the editor');
assert.match(css, /\.videos-site \[hidden\]\{display:none!important\}/, 'Hidden states must beat Videos layout rules');
assert(!/editor-locked/.test(css), 'Watch uses its own account gate, not an editor-wide visibility lock');
assert.match(html, /name="robots" content="index, follow"/);
assert.match(html, /<title>NetVista Watch[^<]*Public Beta<\/title>/);
assert(html.includes(`rel="canonical" href="${videoOrigin}/"`));
assert(html.includes(`property="og:url" content="${videoOrigin}/"`));
assert.match(html, /<h1\b[^>]*id="welcome-title"[^>]*>[^<]+/, 'The public welcome has a real main heading');
assert.match(html, /id="hero-title"[^>]*>\s*<\/h[12]>/, 'No film title is delivered in the locked hero');
for (const statement of ['public beta', 'More titles have not been announced yet', 'Still in development']) {
  assert(html.toLowerCase().includes(statement.toLowerCase()), `Missing honest beta disclosure: ${statement}`);
}
assert(!/v1\.4\.0-beta|aggregateRating|ratingValue|\d+% Match/.test(html), 'No editor release marketing or invented film ratings');
assert([...html.matchAll(/<form\b/g)].length >= 1, 'The public welcome includes account sign-in/sign-up');
assert.match(html, /<input\b[^>]*type="email"/);
assert.match(html, /<input\b[^>]*type="password"/);
for (const id of ['signin-form', 'signup-form', 'reset-form']) assert.equal(attrs(elementTag(id)).method, 'post', 'Credentials are never submitted as a URL query');
const fieldsets = [...html.matchAll(/<fieldset\b[^>]*>/g)];
assert(fieldsets.length >= 3 && fieldsets.every(match => /\bdisabled\b/.test(match[0])), 'Forms stay disabled until the shared auth client is initialized');
assert.match(html, /<noscript>[\s\S]*JavaScript[\s\S]*<\/noscript>/, 'The account-only library explains its no-JavaScript limit');
assert(!/clip-kingdom-play|\/api\/public\/stream\//.test(html), 'The unauthenticated HTML contains no player or media URLs');
assert(!/assets\/js\/data\/catalog\.js/.test(cinema), 'The browser gets the catalog only from the authenticated worker');
assert.match(cinema, /(?:from\s+|import\s*\(\s*)['"]\/editor\/assets\/auth-client\.js(?:\?[^'"]*)?['"]/, 'Watch reuses the existing Supabase auth client and project');
assert.match(cinema, /\/api\/watch\/catalog/, 'Watch requests the authenticated same-host catalog');
assert.match(html, /<script type="module" src="\/video-beta\/assets\/cinema\.js\?v=\d+"><\/script>/);
assert.match(html, /href="\/video-beta\/assets\/cinema\.css\?v=\d+"/);
for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
  const url = new URL(decode(match[1]), videoOrigin + '/');
  assert(![apexOrigin, 'https://www.netvistastudio.com'].includes(url.origin), 'Film navigation must not lead to the main or editor site');
  if (url.origin === videoOrigin) assert(['/', '/account/'].includes(url.pathname), 'Watch navigation stays on its own page/account callback');
}
const frame = [...html.matchAll(/<video\b[^>]*>/g)];
assert.equal(frame.length, 1, 'There is one native on-demand film player');
assert.equal(attrs(frame[0][0]).id, 'native-player', 'The native player retains its controller contract');
assert(/\bcontrols\b/.test(frame[0][0]), 'Playback exposes accessible native controls');
assert(!/\bsrc=/.test(frame[0][0]) && !/<video\b[^>]*>[\s\S]*?<source\b[\s\S]*?<\/video>/.test(html), 'Media must not load before authenticated watch action');
assert(!/<iframe\b/.test(html), 'Actual playback progress is observed on the native player');
for (const match of html.matchAll(/data-close="([^"]+)"/g)) assert(ids.includes(match[1]), `Missing dialog close target: ${match[1]}`);
for (const match of html.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g)) {
  const link = attrs(match[0]);
  assert(link.rel?.split(/\s+/).includes('noopener'), 'External player links prevent opener access');
  assert(link.rel?.split(/\s+/).includes('noreferrer'), 'External player links suppress the referring page');
}
assert(html.indexOf('cinema.css') > html.indexOf('studio-shared.css'), 'Video-only styles override shared styles locally');

function localFile(url) {
  let pathname = decodeURIComponent(url.pathname);
  if (url.origin === videoOrigin && pathname === '/') pathname = '/video-beta/';
  if (url.origin === videoOrigin && pathname.startsWith('/account/')) pathname = '/editor' + pathname;
  return path.join(root, pathname, pathname.endsWith('/') ? 'index.html' : '');
}
function checkLink(value, base = videoOrigin + '/') {
  const url = new URL(decode(value), base);
  if (![videoOrigin, apexOrigin].includes(url.origin)) return;
  const filename = localFile(url);
  assert(fs.existsSync(filename), `Broken local reference: ${url.href}`);
  if (url.hash && filename.endsWith('.html')) {
    assert(read(path.relative(root, filename)).includes(`id="${decodeURIComponent(url.hash.slice(1))}"`), `Missing anchor: ${url.href}`);
  }
}
for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) checkLink(match[1]);
for (const match of html.matchAll(/\bsrcset="([^"]+)"/g)) {
  for (const candidate of match[1].split(',')) checkLink(candidate.trim().split(/\s+/)[0]);
}
for (const match of html.matchAll(/<meta\b[^>]*property="og:image"[^>]*content="([^"]+)"/g)) checkLink(match[1]);
for (const match of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) checkLink(match[1], videoOrigin + '/video-beta/assets/cinema.css');
for (const match of read('video-beta/assets/cinema.js').matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)) {
  checkLink(match[1], videoOrigin + '/video-beta/assets/cinema.js');
}

function filesUnder(directory) {
  const filenames = [];
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const filename = path.posix.join(directory, entry.name);
    if (entry.isDirectory()) filenames.push(...filesUnder(filename));
    else if (entry.isFile()) filenames.push(filename);
  }
  return filenames;
}

// Inspect only website source directories, never native/app/mobile copies.
const publicHTML = ['index.html', '404.html', ...['applications', 'video-editor', 'editor', 'video-beta']
  .flatMap(filesUnder).filter(filename => filename.endsWith('.html'))];
for (const filename of publicHTML.filter(filename => !filename.startsWith('video-beta/'))) {
  for (const match of read(filename).matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
    const url = new URL(decode(match[1]), apexOrigin + '/' + filename);
    assert.notEqual(url.hostname, 'video.netvistastudio.com', `Main/editor navigation must not link to the unlisted film site: ${filename}`);
    assert(!/^\/video-beta(?:\/|$)/.test(url.pathname), `Main/editor navigation must not expose the film source path: ${filename}`);
  }
}
assert(!read('sitemap.xml').includes('video.netvistastudio.com'), 'The main sitemap must not advertise the unlisted film host');
assert(!read('sitemap.xml').includes('/video-beta'), 'The main sitemap must not advertise the film source path');

async function checkWorker() {
  let network;
  const context = vm.createContext({ URL, Request, Response, Headers, AbortController, AbortSignal,
    setTimeout, clearTimeout, fetch: async (input, init) => {
      const request = input instanceof Request ? input : new Request(input, init);
      network.calls.push(request);
      if (network.failure) throw Error('Synthetic unavailable auth server');
      return new Response(JSON.stringify(network.user), { status: network.status,
        headers: { 'content-type': 'application/json' } });
    } });
  const module = new vm.SourceTextModule(read('_worker.js'), { context });
  await module.link(() => { throw Error('Worker must not import dependencies'); });
  await module.evaluate();
  const worker = module.namespace.default;
  const routes = JSON.parse(read('_routes.json'));
  assert.equal(routes.version, 1);
  assert.deepEqual(routes.include, ['/*'], 'Host isolation must cover all page requests, including future routes');
  const excludedAssets = ['/assets/images/*', '/assets/css/*',
    '/assets/mobile-navigation.js', '/assets/public-domain.js', '/video-beta/assets/*', '/editor/assets/*'];
  assert.deepEqual([...routes.exclude].sort(), [...excludedAssets].sort(), 'Only verified asset-only paths bypass the worker');
  function matches(pattern, pathname) {
    const star = pattern.indexOf('*');
    return star === -1 ? pathname === pattern : pathname.startsWith(pattern.slice(0, star)) && pathname.endsWith(pattern.slice(star + 1));
  }
  function usesWorker(pathname) {
    return routes.include.some(pattern => matches(pattern, pathname)) && !routes.exclude.some(pattern => matches(pattern, pathname));
  }
  for (const filename of publicHTML) {
    assert(usesWorker('/' + filename), `Public HTML must not bypass host isolation: ${filename}`);
    if (filename.endsWith('/index.html')) {
      const directory = '/' + filename.slice(0, -'index.html'.length);
      assert(usesWorker(directory), `Directory entry must not bypass host isolation: ${directory}`);
      assert(usesWorker(directory.slice(0, -1)), `Slashless entry must not bypass host isolation: ${directory}`);
    }
  }
  for (const pattern of excludedAssets) {
    const filenames = pattern.endsWith('/*') ? filesUnder(pattern.slice(1, -2)) : [pattern.slice(1)];
    assert(filenames.length, `Excluded asset path must exist: ${pattern}`);
    for (const filename of filenames) {
      assert(!/\.(?:html?|xhtml)$/i.test(filename), `Excluded directory must not contain HTML: ${filename}`);
      assert(!usesWorker('/' + filename), `Verified static asset should avoid unnecessary Function requests: ${filename}`);
    }
  }
  assert(usesWorker('/api/watch/catalog'), 'Catalog access control always reaches the worker');
  assert(usesWorker('/assets/js/data/catalog.js'), 'Watch cannot bypass the worker through the original catalog source');
  async function route(url, method = 'GET', options = {}) {
    const original = new Request(url, { method, headers: { 'x-regression': 'preserved', ...options.headers } });
    const calls = [];
    network = { calls: [], status: options.authStatus || 200, failure: options.authFailure,
      user: options.authUser === undefined ? { id: '11111111-1111-4111-8111-111111111111', is_anonymous: false } : options.authUser };
    const assetResponse = new Response(method === 'HEAD' ? null : 'static asset', { status: 200,
      headers: { 'x-asset-response': 'retained', 'content-type': 'text/html; charset=utf-8' } });
    const response = await worker.fetch(original, { ASSETS: { async fetch(request) { calls.push(request); return assetResponse; } } });
    return { original, calls, response, assetResponse, networkCalls: network.calls };
  }
  for (const host of [apexOrigin, 'https://www.netvistastudio.com', 'https://preview.netvistastudio.pages.dev']) {
    for (const pathname of ['/', '/index.html', '/account/?code=synthetic', '/applications/', '/editor/', '/video-editor/', '/robots.txt', '/sitemap.xml']) {
      for (const method of ['GET', 'HEAD']) {
        const result = await route(host + pathname, method);
        assert.equal(result.calls.length, 1);
        assert.equal(result.calls[0], result.original, 'Non-video host passes through the exact Request');
        assert.equal(result.response, result.assetResponse, 'Non-video response must be unchanged');
      }
    }
    for (const pathname of ['/video-beta', '/video-beta/', '/video-beta/index.html', '/video-beta/unknown.html']) {
      for (const method of ['GET', 'HEAD']) {
        const result = await route(host + pathname + '?preview=synthetic', method);
        assert.equal(result.response.status, 404, `Film HTML is not exposed on another host: ${host + pathname}`);
        assert.equal(result.calls.length, 0, 'Blocked source paths must not fetch film HTML');
        assert.equal(result.response.headers.get('location'), null, 'Another host must not advertise the film subdomain through a redirect');
        if (method === 'HEAD') assert.equal(await result.response.text(), '', 'HEAD 404 has no body');
      }
    }
    const api = await route(host + '/api/watch/catalog', 'GET', { headers: { authorization: 'Bearer synthetic.token.signature' } });
    assert.equal(api.response.status, 404, 'Private Watch API is unavailable on main/editor/preview hosts');
    assert.equal(api.calls.length, 0, 'Non-Watch catalog API never fetches film data');
    assert.equal(api.networkCalls.length, 0, 'Non-Watch catalog API never validates auth');
  }
  for (const pathname of ['/', '/index.html']) {
    for (const method of ['GET', 'HEAD']) {
      const result = await route(videoOrigin + pathname + '?preview=a%2Fb&x=1', method);
      assert.equal(result.calls[0].url, videoOrigin + '/video-beta/?preview=a%2Fb&x=1');
      assert.equal(result.calls[0].method, method);
      assert.equal(result.calls[0].headers.get('x-regression'), 'preserved');
      assert.equal(result.response.status, result.assetResponse.status, 'Film rewrite retains the asset status');
      assert.equal(result.response.headers.get('x-asset-response'), 'retained', 'Film rewrite retains asset headers');
      assert.equal(result.response.headers.get('content-type'), 'text/html; charset=utf-8', 'Film rewrite retains the HTML content type');
      assert.equal(result.response.headers.get('x-robots-tag'), 'index, follow', 'The public Watch welcome page is indexable');
      assert.equal(await result.response.text(), method === 'HEAD' ? '' : 'static asset', 'Film rewrite preserves GET content and HEAD has no body');
    }
  }
  for (const pathname of ['/video-beta', '/video-beta/', '/video-beta/index.html']) {
    for (const method of ['GET', 'HEAD']) {
      const originalURL = videoOrigin + pathname + '?preview=a%2Fb&x=1';
      const result = await route(originalURL, method);
      assert.equal(result.response.status, 308, 'Film source aliases canonicalize to the standalone root');
      assert.equal(result.calls.length, 0);
      assert.equal(result.response.headers.get('location'), videoOrigin + '/?preview=a%2Fb&x=1', 'Alias redirect preserves host and query');
      if (method === 'HEAD') assert.equal(await result.response.text(), '', 'HEAD redirect has no body');
    }
  }
  for (const pathname of ['/editor', '/editor/', '/editor/index.html']) {
    assert(usesWorker(pathname), `Legacy editor exit must reach the worker: ${pathname}`);
    for (const method of ['GET', 'HEAD']) {
      const result = await route(videoOrigin + pathname + '?next=a%2Fb&x=1', method);
      assert.equal(result.response.status, 308, 'Existing account-page editor exits redirect to the editor host');
      assert.equal(result.calls.length, 0, 'The film host never fetches editor HTML');
      assert.equal(result.response.headers.get('location'), apexOrigin + '/editor/?next=a%2Fb&x=1', 'Editor exit preserves its query and goes to the apex editor');
      if (method === 'HEAD') assert.equal(await result.response.text(), '', 'HEAD editor exit has no body');
    }
  }
  const blockedVideoPaths = ['/editor/unknown.html', '/editor/accounting/',
    '/applications', '/applications/', '/applications/index.html', '/video-editor', '/video-editor/',
    '/video-editor/getting-started/', '/404.html', '/accounting/', '/unknown-page/',
    '/video-beta/unknown.html'];
  for (const pathname of blockedVideoPaths) {
    assert(usesWorker(pathname), `Blocked page must reach the worker: ${pathname}`);
    for (const method of ['GET', 'HEAD']) {
      const result = await route(videoOrigin + pathname, method);
      assert.equal(result.response.status, 404, `The film host must not serve main/editor pages: ${pathname}`);
      assert.equal(result.calls.length, 0, 'Blocked pages must not fetch main/editor HTML');
      if (method === 'HEAD') assert.equal(await result.response.text(), '', 'HEAD 404 has no body');
    }
  }
  for (const method of ['GET', 'HEAD']) {
    const result = await route(videoOrigin + '/robots.txt', method);
    assert.equal(result.response.status, 200);
    assert.equal(result.calls.length, 0, 'Video robots policy is separate from the apex policy');
    assert.match(result.response.headers.get('content-type'), /text\/plain/);
    const body = await result.response.text();
    if (method === 'HEAD') assert.equal(body, '', 'HEAD robots has no body');
    else {
      assert.match(body, /User-agent:\s*\*/i);
      assert.match(body, /Allow:\s*\/\s*(?:\n|$)/i);
      assert(!/Disallow:\s*\/\s*(?:\n|$)/i.test(body), 'Public Watch discovery is not blocked');
      assert.match(body, /Disallow:\s*\/api\//i, 'Private API routes are not crawl targets');
      assert(body.includes(`Sitemap: ${videoOrigin}/sitemap.xml`), 'Watch robots advertises only the Watch sitemap');
      assert(!body.includes(`Sitemap: ${apexOrigin}/`), 'Watch robots does not borrow the main sitemap');
    }
  }
  for (const method of ['GET', 'HEAD']) {
    const result = await route(videoOrigin + '/sitemap.xml', method);
    assert.equal(result.response.status, 200);
    assert.equal(result.calls.length, 0, 'Watch sitemap is independent of the main sitemap');
    assert.match(result.response.headers.get('content-type'), /xml/);
    const body = await result.response.text();
    if (method === 'HEAD') assert.equal(body, '', 'HEAD sitemap has no body');
    else {
      const locations = [...body.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
      assert.deepEqual(locations, [videoOrigin + '/'], 'Only the public Watch welcome root is indexed');
      assert(!/editor|account|api\/|clip-kingdom-play|\/video-beta/.test(body), 'Sitemap excludes private routes and provider URLs');
    }
  }
  const preservedAssets = ['/assets/mobile-navigation.js', '/assets/public-domain.js',
    '/assets/css/studio-shared.css', '/assets/images/photos/final-lesson.jpg',
    '/video-beta/assets/cinema.css', '/video-beta/assets/cinema.js', '/video-beta/assets/library.js',
    '/editor/assets/site.css', '/editor/assets/account-ui.css', '/editor/assets/auth-client.js',
    '/editor/assets/studio-room.png'];
  for (const host of [videoOrigin, apexOrigin]) {
    for (const pathname of preservedAssets) {
      assert(fs.existsSync(localFile(new URL(host + pathname))), `Preserved asset exists: ${pathname}`);
      for (const method of ['GET', 'HEAD']) {
        const result = await route(host + pathname + '?v=synthetic', method);
        assert.equal(result.calls.length, 1);
        assert.equal(result.calls[0], result.original, `Shared film/account asset Request is unchanged: ${pathname}`);
        assert.equal(result.response, result.assetResponse, `Shared film/account asset Response is unchanged: ${pathname}`);
      }
    }
  }
  for (const method of ['GET', 'HEAD']) {
    for (const pathname of ['/assets/js/data/catalog.js', '/assets/js/data/%63atalog.js', '/assets/js/data/catalog%2Ejs']) {
      const blocked = await route(videoOrigin + pathname + '?v=synthetic', method);
      assert.equal(blocked.response.status, 404, 'Unauthenticated Watch cannot request the public main-site catalog script, including encoded spelling');
      assert.equal(blocked.calls.length, 0);
      assert.equal(blocked.networkCalls.length, 0);
      if (method === 'HEAD') assert.equal(await blocked.response.text(), '');
    }
    const main = await route(apexOrigin + '/assets/js/data/catalog.js?v=synthetic', method);
    assert.equal(main.calls[0], main.original, 'Main catalog remains unchanged');
    assert.equal(main.response, main.assetResponse);
  }

  const token = 'c3ludGhldGlj.aGVhZGVy.c2lnbmF0dXJl';
  const authorized = { authorization: `Bearer ${token}` };
  const catalogURL = videoOrigin + '/api/watch/catalog';
  function privateResponse(result) {
    assert.match(result.response.headers.get('cache-control') || '', /(?:^|[,\s])no-store(?:$|[,\s])/i, 'Catalog successes and failures are never cached');
    assert.match(result.response.headers.get('vary') || '', /(?:^|[,\s])authorization(?:$|[,\s])/i, 'Catalog responses vary by authorization');
    assert.equal(result.response.headers.get('x-robots-tag'), 'noindex, nofollow', 'Private API is not an indexing surface');
    assert.equal(result.response.headers.get('access-control-allow-origin'), null, 'Private API never opts into cross-origin access');
    assert.equal(result.calls.length, 0, 'Auth and catalog routes never serve static assets');
  }
  for (const authorization of [undefined, '', 'Basic synthetic', 'Bearer', 'Bearer no-dots',
    'Bearer a.b', 'Bearer a.b.c.d', 'Bearer a..c', 'Bearer a.b.c!', `Bearer ${'a'.repeat(8193)}.b.c`]) {
    const result = await route(catalogURL, 'GET', { headers: authorization === undefined ? {} : { authorization } });
    assert.equal(result.response.status, 401, 'Absent, malformed and oversized tokens cannot unlock the catalog');
    assert.equal(result.networkCalls.length, 0, 'Unusable tokens do not make an upstream request');
    privateResponse(result);
    assert(!/"films"\s*:|clip-kingdom-play|dark-echoes-1939|final-lesson-ap-1/.test(await result.response.text()), 'Unauthenticated errors cannot leak the film catalog');
  }
  for (const origin of ['https://evil.example', apexOrigin, 'https://video.netvistastudio.com.evil.example', 'null']) {
    const result = await route(catalogURL, 'GET', { headers: { ...authorized, origin } });
    assert.equal(result.response.status, 403, 'Another origin cannot use the authenticated catalog');
    assert.equal(result.networkCalls.length, 0, 'Origin denial happens before auth or data work');
    privateResponse(result);
  }
  for (const method of ['HEAD', 'POST', 'PUT', 'DELETE', 'OPTIONS']) {
    const result = await route(catalogURL, method, { headers: authorized });
    assert.equal(result.response.status, 405, 'Only GET can read the catalog');
    assert.equal(result.response.headers.get('allow'), 'GET');
    assert.equal(result.networkCalls.length, 0);
    privateResponse(result);
    if (method === 'HEAD') assert.equal(await result.response.text(), '', 'HEAD denial has no body');
  }
  for (const authStatus of [401, 403]) {
    const result = await route(catalogURL, 'GET', { headers: authorized, authStatus,
      authUser: { error: 'Synthetic invalid token' } });
    assert.equal(result.response.status, 401, 'A forged or expired token cannot pass the remote getUser check');
    assert.equal(result.networkCalls.length, 1);
    privateResponse(result);
    assert(!/"films"\s*:|clip-kingdom-play|dark-echoes-1939|final-lesson-ap-1/.test(await result.response.text()));
  }
  for (const authUser of [null, {}, { id: 'not-a-user' }, { id: '__proto__' },
    { id: '11111111-1111-4111-8111-111111111111', is_anonymous: true }]) {
    const result = await route(catalogURL, 'GET', { headers: authorized, authUser });
    assert.equal(result.response.status, 401, 'Only a validated real account can unlock the catalog');
    privateResponse(result);
  }
  for (const options of [{ authStatus: 500 }, { authFailure: true }]) {
    const result = await route(catalogURL, 'GET', { headers: authorized, ...options });
    assert.equal(result.response.status, 503, 'An unavailable auth provider fails closed');
    privateResponse(result);
    assert(!/"films"\s*:|clip-kingdom-play|dark-echoes-1939|final-lesson-ap-1/.test(await result.response.text()));
  }
  for (const headers of [authorized, { ...authorized, origin: videoOrigin }]) {
    const result = await route(catalogURL, 'GET', { headers });
    assert.equal(result.response.status, 200);
    privateResponse(result);
    assert.equal(result.networkCalls.length, 1, 'Each catalog request verifies the token with the shared Supabase project');
    const authRequest = result.networkCalls[0];
    assert.equal(authRequest.url, supabaseURL + '/auth/v1/user', 'Watch uses the same existing Supabase Auth project');
    assert.equal(authRequest.method, 'GET');
    assert.equal(authRequest.headers.get('authorization'), `Bearer ${token}`, 'The supplied bearer token is remotely verified, not decoded as authority');
    assert.equal(authRequest.headers.get('apikey'), publishableKey, 'Watch reuses the browser-safe shared project key');
    assert.match(result.response.headers.get('content-type'), /application\/json/);
    const payload = await result.response.json();
    assert.deepEqual(Object.keys(payload), ['films'], 'Catalog response contains no account or token data');
    const source = read('assets/js/data/catalog.js');
    const expectedIDs = [...source.matchAll(/\bid:\s*['"]([^'"]+)['"]/g)].map(match => match[1]);
    assert.deepEqual(payload.films.map(film => film.id), expectedIDs, 'Authenticated catalog contains exactly the real collection');
    for (const film of payload.films) {
      for (const field of ['id', 'title', 'description', 'format', 'artwork', 'videoUrl', 'mediaUrl']) {
        assert.equal(typeof film[field], 'string', `Authenticated film has a ${field}`);
        assert(film[field].length, `Authenticated film ${field} is not empty`);
      }
      assert(source.includes(film.videoUrl), 'Existing approved fallback player URL is retained');
      assert.equal(new URL(film.videoUrl).origin, 'https://clip-kingdom-play.lovable.app');
      assert.equal(new URL(film.mediaUrl).origin, 'https://clip-kingdom-play.lovable.app');
      assert.match(new URL(film.mediaUrl).pathname, /^\/api\/public\/stream\/[\w-]+$/);
    }
  }
  for (const pathname of ['/editor/account', '/editor/account/', '/editor/account/index.html',
    '/editor/account/account.js', '/editor/account/account.css']) {
    assert(usesWorker(pathname), `Legacy account exception remains under explicit worker control: ${pathname}`);
    for (const method of ['GET', 'HEAD']) {
      const result = await route(videoOrigin + pathname + '?code=synthetic%2Fcode', method);
      assert.equal(result.calls.length, 1);
      assert.equal(result.calls[0], result.original, `Existing callback Request is unchanged: ${pathname}`);
      assert.equal(result.response, result.assetResponse, `Existing callback Response is unchanged: ${pathname}`);
    }
  }
  for (const pathname of ['/account', '/account/', '/account/account.js']) {
    for (const method of ['GET', 'HEAD', 'POST']) {
      const originalURL = videoOrigin + pathname + '?code=synthetic%2Fcode&next=%2Feditor%2F';
      const result = await route(originalURL, method);
      assert.equal(result.response.status, 308, 'Account redirect preserves the request method and browser-relative resources');
      assert.equal(result.calls.length, 0, 'Account redirect happens before static serving');
      const destination = new URL(result.response.headers.get('location'), originalURL);
      assert.equal(destination.origin, videoOrigin, 'Account redirect does not change the branded callback host');
      assert.equal(destination.pathname, '/editor' + pathname + (pathname === '/account' ? '/' : ''));
      assert.equal(destination.search, new URL(originalURL).search, 'Account callback query remains byte-for-byte intact');
      if (pathname !== '/account/account.js') {
        const browserURL = destination;
        const accountHTML = read('editor/account/index.html');
        // Legacy account navigation remains usable, without adding any editor
        // navigation to Watch. Model browser fragment inheritance on redirects.
        const resources = [...accountHTML.matchAll(/<(?:a|link|script|img)\b[^>]*\b(?:href|src)="([^"]+)"/g)];
        for (const match of resources) {
          const resource = new URL(match[1], browserURL);
          if (resource.origin !== videoOrigin) continue;
          let browserTarget = resource;
          let fetched = await route(resource.origin + resource.pathname + resource.search);
          if (fetched.response.status === 308) {
            browserTarget = new URL(fetched.response.headers.get('location'), resource);
            assert.equal(browserTarget.origin, apexOrigin, 'Legacy account editor exits reach the apex, not editor HTML on Watch');
            assert.equal(browserTarget.pathname, '/editor/');
            if (!browserTarget.hash) browserTarget.hash = resource.hash;
            fetched = await route(browserTarget.origin + browserTarget.pathname + browserTarget.search);
          }
          assert.equal(fetched.response.status, 200, `Account navigation/resource remains reachable: ${resource.pathname}`);
          assert.equal(fetched.calls.length, 1);
          const resourceURL = new URL(fetched.calls[0].url);
          resourceURL.hash = browserTarget.hash;
          const filename = localFile(resourceURL);
          assert(fs.existsSync(filename), `Account-relative navigation/resource broken at browser URL ${browserURL.pathname}: ${resource.pathname}`);
          if (resourceURL.hash && filename.endsWith('.html')) {
            assert(read(path.relative(root, filename)).includes(`id="${decodeURIComponent(resourceURL.hash.slice(1))}"`), `Account navigation anchor must exist, including Get the beta: ${resourceURL.pathname}${resourceURL.hash}`);
          }
        }
        const scriptURL = new URL('account.js', browserURL);
        for (const match of read('editor/account/account.js').matchAll(/import\(['"]([^'"]+)['"]\)/g)) {
          const dependency = new URL(match[1], scriptURL);
          const fetched = await route(dependency.href);
          assert(fs.existsSync(localFile(new URL(fetched.calls[0].url))), `Account module dependency broken: ${dependency.pathname}`);
        }
      }
    }
  }
}

async function checkLibrary() {
  const context = vm.createContext({ URL });
  async function evaluate(filename) {
    const module = new vm.SourceTextModule(read(filename), { context, identifier: filename });
    await module.link(() => { throw Error(`${filename} must not import network dependencies`); });
    await module.evaluate();
    return module.namespace;
  }
  const { films: catalogue } = await evaluate('assets/js/data/catalog.js');
  const { LIST_KEY, playableFilms, readSaved, filterFilms, artworkURL, escapeHTML,
    trustedMediaURL, playbackState, continueRows } = await evaluate('video-beta/assets/library.js');
  const filmIDs = films => Array.from(films, film => film.id);
  const savedIDs = saved => Array.from(saved);
  const films = playableFilms(catalogue);
  const expectedIDs = ['dark-echoes-1939', 'final-lesson-ap-1'];
  assert.equal(LIST_KEY, 'netvista-videos-list-v1', 'Videos storage is separate from editor accounts');
  assert.deepEqual(filmIDs(films), expectedIDs, 'Only existing, playable NetVista films populate the library');
  assert.equal(catalogue.length, films.length, 'The current catalogue contains no fake or unavailable filler');
  assert.equal([...html.matchAll(/<article class="film-card"/g)].length, 0, 'Film cards are populated only after authenticated catalog fetch');
  for (const film of films) {
    assert(!html.includes(film.videoUrl), `Unauthenticated HTML cannot expose direct film playback: ${film.id}`);
    assert(!html.includes(film.title), `Static welcome does not expose the signed-in film shelf: ${film.id}`);
    assert(!html.includes(film.artwork), `Static welcome does not preload film artwork: ${film.id}`);
    assert(fs.existsSync(localFile(new URL(artworkURL(film), videoOrigin))), `Missing film artwork: ${film.id}`);
  }
  for (const match of html.matchAll(/\bdata-(?:watch|details|save|feature)="([^"]+)"/g)) {
    assert(expectedIDs.includes(match[1]), `Control references a non-catalogue film: ${match[1]}`);
  }

  const valid = { id: 'synthetic-film', title: 'Synthetic film', status: 'available',
    description: 'A test story', format: 'Short film', artwork: 'assets/images/photos/final-lesson.jpg',
    videoUrl: 'https://clip-kingdom-play.lovable.app/embed/synthetic-film',
    mediaUrl: 'https://clip-kingdom-play.lovable.app/api/public/stream/21230af6-5a84-4072-befc-276e5f349145' };
  const invalidURLs = [undefined, '', 'not-a-url', 'javascript:alert(1)',
    'http://clip-kingdom-play.lovable.app/embed/synthetic-film',
    'https://other.example/embed/synthetic-film',
    'https://clip-kingdom-play.lovable.app.evil.example/embed/synthetic-film',
    'https://user@clip-kingdom-play.lovable.app/embed/synthetic-film',
    'https://user:password@clip-kingdom-play.lovable.app/embed/synthetic-film',
    'https://clip-kingdom-play.lovable.app:8443/embed/synthetic-film',
    'https://clip-kingdom-play.lovable.app/watch/synthetic-film',
    'https://clip-kingdom-play.lovable.app/embed/synthetic-film/'];
  const candidates = [valid, ...invalidURLs.map(videoUrl => ({ ...valid, videoUrl })),
    { ...valid, status: 'coming-soon' }, { ...valid, status: undefined },
    { ...valid, id: '' }, { ...valid, title: '' }];
  assert.deepEqual(filmIDs(playableFilms(candidates)), [valid.id], 'Unavailable films and unapproved player URLs must not be playable');
  assert.equal(playableFilms([valid])[0], valid, 'Playable filtering does not rewrite catalogue metadata');
  assert.deepEqual(filmIDs(playableFilms([])), []);

  const mediaURL = valid.mediaUrl;
  assert.equal(trustedMediaURL(mediaURL), mediaURL, 'The approved stable stream route is usable');
  for (const value of [undefined, null, '', 'not-a-url', '/api/public/stream/21230af6-5a84-4072-befc-276e5f349145',
    'javascript:alert(1)', 'data:video/mp4;base64,AA==', mediaURL.replace('https:', 'http:'),
    mediaURL.replace('clip-kingdom-play.lovable.app', 'other.example'),
    mediaURL.replace('clip-kingdom-play.lovable.app', 'clip-kingdom-play.lovable.app.evil.example'),
    mediaURL.replace('https://', 'https://user@'), mediaURL.replace('https://', 'https://user:password@'),
    mediaURL.replace('.app/', '.app:8443/'), mediaURL.replace('/api/public/stream/', '/embed/'),
    mediaURL + '/', mediaURL + '?token=synthetic', mediaURL + '#fragment']) {
    assert.equal(trustedMediaURL(value), null, `Native playback rejects unapproved/expiring media URLs: ${value}`);
  }
  for (const film of films) {
    const stream = film.videoUrl.replace('/embed/', '/api/public/stream/');
    assert.equal(trustedMediaURL(stream), stream, `Existing film has an approved stable stream: ${film.id}`);
  }
  const progress = (time, duration, ended) => JSON.parse(JSON.stringify(playbackState(time, duration, ended)));
  assert.deepEqual(progress(23.25, 100), { position_seconds: 23.25, duration_seconds: 100, completed: false }, 'Resume uses the real observed native position');
  assert.deepEqual(progress(99, 100), { position_seconds: 99, duration_seconds: 100, completed: false }, 'Near the end is not falsely marked completed');
  assert.deepEqual(progress(100, 100, true), { position_seconds: 100, duration_seconds: 100, completed: true }, 'The native ended event marks completion');
  assert.deepEqual(progress(200, 100), { position_seconds: 100, duration_seconds: 100, completed: false }, 'Positions never exceed known media duration');
  assert.deepEqual(progress(-5, -10), { position_seconds: 0, duration_seconds: 0, completed: false }, 'Negative playback values fail safely');
  assert.deepEqual(progress(NaN, Infinity, true), { position_seconds: 0, duration_seconds: 0, completed: false }, 'Non-finite metadata cannot create invalid database rows');
  assert.deepEqual(progress(100000, 100000), { position_seconds: 86400, duration_seconds: 86400, completed: false }, 'Native positions obey the database limits');
  assert.deepEqual(progress(15, 0, true), { position_seconds: 15, duration_seconds: 0, completed: false }, 'Unknown duration cannot be marked complete');
  const rows = [
    { film_id: expectedIDs[0], last_watched_at: '2026-01-01T12:00:00Z', completed: false, position_seconds: 20 },
    { film_id: 'already-finished', last_watched_at: '2026-01-03T12:00:00Z', completed: true, position_seconds: 100 },
    { film_id: 'saved-never-watched', last_watched_at: null, completed: false, saved: true },
    { film_id: 'invalid-time', last_watched_at: 'not-a-date', completed: false },
    { film_id: expectedIDs[1], last_watched_at: '2026-01-02T12:00:00Z', completed: false, position_seconds: 40 }
  ];
  const beforeRows = JSON.stringify(rows);
  assert.deepEqual(Array.from(continueRows(rows), row => row.film_id), [expectedIDs[1], expectedIDs[0]], 'Continue watching contains unfinished started films, newest first');
  assert.equal(JSON.stringify(rows), beforeRows, 'Continue sorting does not mutate account data');
  assert.deepEqual(Array.from(continueRows([])), []);

  for (const serialized of [null, undefined, '', ' ', 'null', '{}', 'false', '42', '"a-film"', '[', 'not JSON']) {
    assert.deepEqual(savedIDs(readSaved(serialized, films)), [], `Malformed or non-array saved data fails empty: ${serialized}`);
  }
  const mixedSaved = JSON.stringify([expectedIDs[1], expectedIDs[1], 'unknown-film', null, 4, {}, '__proto__', expectedIDs[0]]);
  assert.deepEqual(savedIDs(readSaved(mixedSaved, films)), [expectedIDs[1], expectedIDs[0]], 'Saved lists deduplicate and discard unknown/non-string IDs');
  assert.deepEqual(savedIDs(readSaved(JSON.stringify(expectedIDs), [])), [], 'Removed films do not survive a catalogue update');

  const saved = readSaved(JSON.stringify([expectedIDs[1]]), films);
  assert.deepEqual(filmIDs(filterFilms(films, '', saved)), expectedIDs, 'The public collection is not restricted by My List');
  assert.deepEqual(filmIDs(filterFilms(films, null, saved)), expectedIDs);
  assert.deepEqual(filmIDs(filterFilms(films, '  FiNaL LeSsOn  ', saved)), [expectedIDs[1]], 'Search is case-insensitive and trimmed');
  assert.deepEqual(filmIDs(filterFilms(films, 'broadcast', saved)), [expectedIDs[0]], 'Search includes descriptions');
  assert.deepEqual(filmIDs(filterFilms(films, 'feature film', saved)), expectedIDs, 'Search includes film formats');
  assert.deepEqual(filmIDs(filterFilms(films, '1939', saved)), [expectedIDs[0]], 'Search safely stringifies titles and numeric-like queries');
  assert.deepEqual(filmIDs(filterFilms(films, '<script>synthetic</script>', saved)), [], 'Search text is data, not markup');
  assert.deepEqual(filmIDs(filterFilms(films, '', saved, true)), [expectedIDs[1]], 'My List contains only saved films');
  assert.deepEqual(filmIDs(filterFilms(films, 'final', saved, true)), [expectedIDs[1]], 'Search and saved filtering intersect');
  assert.deepEqual(filmIDs(filterFilms(films, 'broadcast', saved, true)), [], 'Search cannot reveal unsaved films in My List');
  assert.deepEqual(filmIDs(filterFilms(films, '', readSaved('[]', films), true)), [], 'An empty saved list remains empty');
  assert.deepEqual(savedIDs(saved), [expectedIDs[1]], 'Searching never mutates saved state');
  assert.deepEqual(filmIDs(films), expectedIDs, 'Searching never mutates the catalogue');

  assert.equal(escapeHTML('&<>"\''), '&amp;&lt;&gt;&quot;&#39;', 'All HTML-significant characters are escaped');
  assert.equal(escapeHTML('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;', 'Markup cannot become a rendered element');
  assert.equal(escapeHTML(null), '');
  assert.equal(escapeHTML(undefined), '');
  assert.equal(escapeHTML(42), '42');
  assert.equal(escapeHTML('The dark echo’s of 1939'), 'The dark echo’s of 1939', 'Ordinary film names remain readable');

  const artwork = '/assets/images/photos/final-lesson.jpg';
  for (const value of [artwork, artwork.slice(1), apexOrigin + artwork, apexOrigin + artwork + '?probe=1#ignored']) {
    assert.equal(artworkURL({ artwork: value }), artwork, 'Approved artwork becomes a same-host static path without query or fragment');
  }
  const fallback = '/assets/images/brand/icon-512.png';
  assert(fs.existsSync(localFile(new URL(fallback, videoOrigin))), 'Artwork fallback exists');
  for (const value of ['https://other.example' + artwork, '//other.example' + artwork,
    'https://netvistastudio.com.evil.example' + artwork, 'javascript:alert(1)', 'data:image/png;base64,AA==',
    '/editor/assets/studio-room.png', 'assets/images/../../account/', 'assets/private.png', '']) {
    assert.equal(artworkURL({ artwork: value }), fallback, `Unapproved artwork uses the safe local fallback: ${value}`);
  }
}

function checkSchema() {
  const sql = read('database/watch_progress.sql');
  assert.match(sql, /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.watch_progress\b/i, 'Watch progress lives in its own table on the existing project');
  assert.match(sql, /user_id\s+uuid\s+not\s+null\s+references\s+auth\.users\s*\(\s*id\s*\)\s+on\s+delete\s+cascade/i, 'Progress is owned by a real Supabase account and deleted with it');
  assert.match(sql, /primary\s+key\s*\(\s*user_id\s*,\s*film_id\s*\)/i, 'Each account has at most one progress row per film');
  assert.match(sql, /alter\s+table\s+public\.watch_progress\s+enable\s+row\s+level\s+security/i, 'Public-schema progress must enable RLS');
  assert(sql.includes('dark-echoes-1939') && sql.includes('final-lesson-ap-1'), 'Progress is restricted to the real film IDs');
  assert(!/security\s+definer|auth\.role\s*\(|user_metadata|service_role/i.test(sql), 'Progress does not rely on bypass-RLS privileges or user-editable authorization claims');
  const policies = [...sql.matchAll(/create\s+policy\b([\s\S]*?);/gi)].map(match => match[1]);
  const operations = new Map();
  for (const policy of policies) {
    assert.match(policy, /on\s+public\.watch_progress\b/i);
    const operation = policy.match(/for\s+(select|insert|update|delete)\b/i)?.[1].toLowerCase();
    assert(operation, 'Each Watch policy scopes exactly one operation');
    assert(!operations.has(operation), 'Watch has one explicit policy for each operation');
    operations.set(operation, policy);
    assert.match(policy, /to\s+authenticated\b/i, 'No Watch policy grants anonymous row access');
    const normalized = policy.replace(/[\s()]/g, '').toLowerCase();
    const ownerChecks = [...normalized.matchAll(/(?:auth\.uid=user_id|user_id=(?:select)?auth\.uid)/g)];
    assert(ownerChecks.length >= (operation === 'update' ? 2 : 1), `${operation} must check the authenticated row owner`);
    if (operation !== 'insert') assert.match(policy, /using\s*\(/i, `${operation} only reads/modifies the current owner's rows`);
    if (['insert', 'update'].includes(operation)) assert.match(policy, /with\s+check\s*\(/i, `${operation} cannot reassign row ownership`);
  }
  assert.deepEqual([...operations.keys()].sort(), ['delete', 'insert', 'select', 'update'], 'Progress supports all four owner-only operations');
  const grants = [...sql.matchAll(/grant\s+([^;]*?)\s+on\s+(?:table\s+)?public\.watch_progress\s+to\s+authenticated\s*;/gi)].map(match => match[1]).join(' ');
  assert(grants, 'Authenticated accounts receive explicit Data API permissions');
  for (const permission of ['select', 'insert', 'update', 'delete']) assert.match(grants, new RegExp(`\\b${permission}\\b`, 'i'));
  assert(!/grant\s+[^;]*\bto\s+(?:[^;]*,\s*)?anon\b/i.test(sql), 'Anonymous callers receive no table grant');
}

const tick = () => new Promise(resolve => setImmediate(resolve));
async function flush() { for (let index = 0; index < 8; index++) await tick(); }
async function controller(options = {}) {
  const nodes = new Map(), calls = [], documentHandlers = {}, windowHandlers = {}, timers = new Map();
  let timerID = 0, changed, releaseSDK, releaseSession, releaseCatalog;
  let now = Date.now();
  class ClockDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const firstUser = { id: '11111111-1111-4111-8111-111111111111', email: 'first@example.invalid', is_anonymous: Boolean(options.anonymous) };
  let session = options.session === false ? null : { user: firstUser, access_token: 'synthetic.first.token' };
  const initialSession = session;
  const history = new Map([[firstUser.id, options.rows || []]]);
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const handlers = {}, tag = elementTag(id);
    const attributes = new Map(Object.entries(attrs(tag)));
    const element = { id, value: '', hidden: /\bhidden\b/.test(tag), disabled: id.endsWith(':fieldset'),
      textContent: '', innerHTML: '', dataset: {}, open: false, src: '', poster: '', currentTime: 0,
      duration: 100, ended: false, paused: true, isConnected: true,
      classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      getAttribute(name) { return attributes.get(name) ?? null; },
      removeAttribute(name) { attributes.delete(name); if (name === 'src') this.src = ''; },
      replaceChildren() { this.innerHTML = ''; },
      querySelector(selector) { return selector === 'fieldset' ? node(id + ':fieldset') : node(id + ':' + selector); },
      querySelectorAll() { return []; }, contains() { return false; }, closest() { return this; },
      getClientRects() { return [{}]; }, getBoundingClientRect() { return { left: 0, top: 0, right: 100, bottom: 100 }; },
      focus() { document.activeElement = this; }, scrollIntoView() {}, reset() {},
      load() {}, pause() { this.paused = true; }, play() { this.paused = false; return Promise.resolve(); },
      showModal() { this.open = true; },
      close() { this.open = false; for (const handler of handlers.close || []) handler({ target: this }); },
      addEventListener(type, handler) { (handlers[type] ||= []).push(handler); },
      async fire(type = 'click', extras = {}) {
        const event = { target: this, currentTarget: this, prevented: false, preventDefault() { this.prevented = true; }, ...extras };
        for (const handler of handlers[type] || []) await handler(event);
        await flush(); return event;
      }
    };
    nodes.set(id, element); return element;
  }
  const enhancements = [...html.matchAll(/<[^>]+\bdata-enhance\b[^>]*>/g)].map((match, index) => {
    const id = attrs(match[0]).id || 'enhancement:' + index;
    const element = node(id); element.hidden = /\bhidden\b/.test(match[0]); return element;
  });
  const document = { body: node('body'), activeElement: node('initial-focus'), hidden: false,
    getElementById: node, querySelector(selector) { return node(selector); },
    querySelectorAll(selector) { return selector === '#authenticated-app [data-enhance]' ? enhancements : []; },
    addEventListener(type, handler) { (documentHandlers[type] ||= []).push(handler); } };
  const location = { origin: videoOrigin, pathname: '/', hash: '', replace(value) { calls.push(['replace', value]); } };
  const window = { location, addEventListener(type, handler) { (windowHandlers[type] ||= []).push(handler); } };
  const auth = {
    onAuthStateChange(handler) { changed = handler; return { data: { subscription: { unsubscribe() {} } } }; },
    async getUser() { calls.push(['getUser']); return { data: { user: session?.user || null }, error: null }; },
    async getSession() {
      calls.push(['getSession']);
      if (options.pendingSession && !releaseSession) return new Promise(resolve => { releaseSession = () => resolve({ data: { session: initialSession }, error: null }); });
      return { data: { session: options.mismatchedSession && session ? { ...session, user: { id: '22222222-2222-4222-8222-222222222222' } } : session }, error: null };
    },
    async signInWithPassword(args) { calls.push(['signin', args]); session = { user: firstUser, access_token: 'synthetic.first.token' }; return { data: { session }, error: null }; },
    async signUp(args) { calls.push(['signup', args]); return { data: { session: null }, error: null }; },
    async resetPasswordForEmail(...args) { calls.push(['reset', ...args]); return { data: {}, error: null }; },
    async signOut(args) { calls.push(['signout', args]); if (options.signoutFailure) throw Error('Synthetic logout offline'); session = null; changed?.('SIGNED_OUT', null); return { error: null }; }
  };
  const supabase = { auth, from(table) {
    const query = { table, kind: 'select', filters: [],
      select(fields) { this.fields = fields; return this; },
      eq(field, value) { this.filters.push([field, value]); return this; },
      upsert(row, conflict) { this.kind = 'upsert'; this.row = row; this.conflict = conflict; return this; },
      then(resolve, reject) {
        if (this.kind === 'upsert') {
          const copy = JSON.parse(JSON.stringify(this.row));
          calls.push(['upsert', table, copy, this.conflict]);
          const previous = history.get(copy.user_id) || [];
          history.set(copy.user_id, [...previous.filter(row => row.film_id !== copy.film_id), copy]);
          return Promise.resolve({ data: null, error: null }).then(resolve, reject);
        }
        calls.push(['select', table, this.filters]);
        const owner = this.filters.find(([field]) => field === 'user_id')?.[1];
        return Promise.resolve({ data: history.get(owner) || [], error: options.historyError ? Error('Synthetic history unavailable') : null }).then(resolve, reject);
      }
    };
    return query;
  } };
  const context = vm.createContext({ URL, URLSearchParams, Request, Response, Headers, AbortController, Date: ClockDate,
    document, window, location,
    history: { replaceState(_state, _title, hash) { location.hash = hash; } },
    localStorage: { getItem() { return null; }, setItem() {}, removeItem(key) { calls.push(['removeItem', key]); } },
    requestAnimationFrame(callback) { callback(); },
    setTimeout(callback, delay) { const id = ++timerID; timers.set(id, callback); if (delay === 0) setImmediate(() => { if (timers.has(id)) { timers.delete(id); callback(); } }); return id; },
    clearTimeout(id) { timers.delete(id); }, setInterval() { return ++timerID; }, clearInterval() {},
    fetch: async (url, init = {}) => {
      calls.push(['fetch', url, init]);
      if (String(url).startsWith(supabaseURL + '/rest/v1/watch_progress')) return new Response(null, { status: 201 });
      assert.equal(url, '/api/watch/catalog', 'Browser catalog fetch is same-host');
      if (options.pendingCatalog && !releaseCatalog) await new Promise(resolve => { releaseCatalog = resolve; });
      return new Response(JSON.stringify({ films: fixtures }), { status: options.catalogStatus || 200 });
    }
  });
  const catalog = new vm.SourceTextModule(read('assets/js/data/catalog.js'), { context });
  await catalog.link(() => {}); await catalog.evaluate();
  const fixtures = Array.from(catalog.namespace.films, film => ({ ...film, mediaUrl: film.videoUrl.replace('/embed/', '/api/public/stream/') }));
  const helpers = new vm.SourceTextModule(read('video-beta/assets/library.js'), { context });
  await helpers.link(() => {});
  const dependency = new vm.SyntheticModule(['supabase', 'authRedirect', 'SUPABASE_URL', 'SUPABASE_PUBLISHABLE_KEY'], function() {
    this.setExport('supabase', supabase); this.setExport('authRedirect', videoOrigin + '/account/');
    this.setExport('SUPABASE_URL', supabaseURL); this.setExport('SUPABASE_PUBLISHABLE_KEY', publishableKey);
  }, { context });
  await dependency.link(() => {}); await dependency.evaluate();
  const source = new vm.SourceTextModule(cinema, { context, importModuleDynamically: async specifier => {
    assert.equal(specifier, '/editor/assets/auth-client.js');
    if (options.pendingSDK) await new Promise(resolve => { releaseSDK = resolve; });
    if (options.sdkFailure) throw Error('Synthetic SDK unavailable');
    return dependency;
  } });
  await source.link(specifier => { assert.match(specifier, /^\.\/library\.js\?v=\d+$/); return helpers; });
  const evaluation = source.evaluate(); await flush();
  if (!options.pendingSDK && !options.pendingSession && !options.pendingCatalog) await evaluation;
  async function click(dataset) {
    const target = node('synthetic-click'); target.dataset = dataset;
    const event = { target, preventDefault() {} };
    for (const handler of documentHandlers.click || []) await handler(event);
    await flush();
  }
  return { node, calls, click, fixtures, auth, evaluation, firstUser, history, enhancements,
    advance(milliseconds) { now += milliseconds; },
    releaseSDK: () => releaseSDK(), releaseSession: () => releaseSession(), releaseCatalog: () => releaseCatalog(),
    async changeUser(next) { session = next ? { user: next, access_token: 'synthetic.next.token' } : null; changed?.(next ? 'SIGNED_IN' : 'SIGNED_OUT', session); await flush(); },
    async pagehide() { for (const handler of windowHandlers.pagehide || []) await handler(); await flush(); } };
}

async function checkController() {
  const firstID = 'dark-echoes-1939', secondID = 'final-lesson-ap-1';
  const guest = await controller({ session: false });
  assert(guest.node('authenticated-app').hidden && !guest.node('welcome').hidden);
  assert.equal(guest.node('film-grid').innerHTML, '');
  assert(!guest.calls.some(call => call[0] === 'fetch' || call[0] === 'select'), 'Guests cannot request a catalog or viewing history');
  assert((await guest.node('signin-form').fire('submit')).prevented, 'All form events prevent native credential submission');
  assert(!guest.node('authenticated-app').hidden, 'Successful same-project sign-in opens the Watch library');
  const failed = await controller({ sdkFailure: true });
  assert(failed.node('authenticated-app').hidden && failed.node('signin-form:fieldset').disabled);
  assert((await failed.node('signin-form').fire('submit')).prevented);
  assert(!failed.calls.some(call => call[0] === 'signin'), 'SDK failure stays closed and sends no credentials');
  const delayed = await controller({ session: false, pendingSDK: true });
  assert(delayed.node('signin-form:fieldset').disabled);
  await delayed.node('signin-form').fire('submit');
  assert(!delayed.calls.some(call => call[0] === 'signin'), 'A delayed SDK cannot submit credentials early');
  delayed.releaseSDK(); await delayed.evaluation;
  assert(!delayed.node('signin-form:fieldset').disabled);
  const signup = await controller({ session: false });
  signup.node('signup-email').value = ' new@example.invalid '; signup.node('signup-password').value = 'synthetic-only';
  await signup.node('signup-form').fire('submit');
  const signupCall = signup.calls.find(call => call[0] === 'signup');
  assert.equal(signupCall[1].email, 'new@example.invalid');
  assert.equal(signupCall[1].options.emailRedirectTo, videoOrigin + '/account/', 'Confirmation keeps the existing branded callback');
  assert(signup.node('authenticated-app').hidden, 'Confirmation-required sign-up does not pretend the user is signed in');
  const normal = await controller({ rows: [{ film_id: firstID, position_seconds: 42, duration_seconds: 100, completed: false, saved: true, last_watched_at: '2026-01-01T12:00:00Z' }] });
  assert(!normal.node('authenticated-app').hidden && normal.node('welcome').hidden);
  assert(normal.enhancements.every(element => !element.hidden), 'Verified catalog load enables details, saving and search enhancements');
  assert(normal.calls.some(call => call[0] === 'getUser'), 'The browser validates the stored session before unlocking');
  assert(normal.calls.some(call => call[0] === 'select' && call[1] === 'watch_progress' && call[2].some(([key, value]) => key === 'user_id' && value === normal.firstUser.id)), 'Viewing state selects only the current account');
  assert(normal.node('continue-grid').innerHTML.includes(firstID));
  assert(normal.node('saved-grid').innerHTML.includes(firstID));
  await normal.click({ watch: firstID });
  assert(normal.node('player-dialog').open);
  assert.equal(normal.node('native-player').src, normal.fixtures[0].mediaUrl);
  await normal.node('native-player').fire('loadedmetadata');
  assert.equal(normal.node('native-player').currentTime, 42, 'Opening a film restores its real account position');
  await normal.node('native-player').fire('playing');
  const firstCheckpoint = normal.calls.filter(call => call[0] === 'upsert').length;
  normal.advance(14999); normal.node('native-player').currentTime = 50;
  await normal.node('native-player').fire('timeupdate');
  assert.equal(normal.calls.filter(call => call[0] === 'upsert').length, firstCheckpoint, 'Ordinary time updates do not write on every frame');
  normal.advance(1); normal.node('native-player').currentTime = 57;
  await normal.node('native-player').fire('timeupdate');
  assert.equal(normal.calls.filter(call => call[0] === 'upsert').at(-1)[2].position_seconds, 57, 'A 15-second checkpoint persists the real native time');
  normal.node('native-player').currentTime = 61;
  await normal.node('native-player').fire('pause');
  const progressWrite = normal.calls.filter(call => call[0] === 'upsert').at(-1);
  assert.equal(progressWrite[2].position_seconds, 61, 'Pause writes the actual native playback time');
  assert.equal(progressWrite[2].user_id, normal.firstUser.id);
  assert.equal(progressWrite[3].onConflict, 'user_id,film_id', 'Account and film jointly identify the progress row');
  await normal.pagehide();
  const exitWrite = normal.calls.find(call => call[0] === 'fetch' && String(call[1]).includes('/rest/v1/watch_progress'));
  assert(exitWrite[2].keepalive, 'Page exit uses best-effort keepalive for the final position');
  assert.equal(JSON.parse(exitWrite[2].body).position_seconds, 61);
  normal.node('native-player').currentTime = 100; normal.node('native-player').ended = true;
  await normal.node('native-player').fire('ended');
  assert.equal(normal.calls.filter(call => call[0] === 'upsert').at(-1)[2].completed, true);
  assert(!normal.node('continue-grid').innerHTML.includes(firstID), 'Finished films leave Continue watching');
  await normal.click({ save: secondID });
  assert(normal.node('saved-grid').innerHTML.includes(secondID), 'My List changes sync to the account');
  await normal.node('sign-out').fire();
  assert(normal.node('authenticated-app').hidden && !normal.node('welcome').hidden);
  for (const id of ['film-grid', 'continue-grid', 'saved-grid']) assert.equal(normal.node(id).innerHTML, '', 'Sign-out erases account film/history markup');
  assert.equal(normal.node('native-player').src, '', 'Sign-out unloads the media');
  assert.equal(normal.node('hero-art').src, '', 'Sign-out clears previous-account artwork');
  assert.equal(normal.node('account-email').textContent, '');
  const secondUser = { id: '22222222-2222-4222-8222-222222222222', email: 'second@example.invalid', is_anonymous: false };
  await normal.changeUser(secondUser);
  assert(!normal.node('authenticated-app').hidden);
  assert.equal(normal.node('saved-grid').innerHTML, '', 'Another account cannot inherit the previous My List');
  assert.equal(normal.node('continue-grid').innerHTML, '', 'Another account cannot inherit viewing history');
  await normal.click({ save: firstID });
  assert.equal(normal.calls.filter(call => call[0] === 'upsert').at(-1)[2].user_id, secondUser.id);
  normal.auth.getUser = async () => { throw Error('Synthetic verification failure'); };
  await normal.changeUser(secondUser);
  assert(normal.node('authenticated-app').hidden && normal.node('film-grid').innerHTML === '', 'A later account verification failure locks and erases the old library');
  const offlineLogout = await controller({ signoutFailure: true });
  await offlineLogout.node('sign-out').fire();
  assert(offlineLogout.node('authenticated-app').hidden);
  assert.deepEqual(offlineLogout.calls.filter(call => call[0] === 'removeItem').map(call => call[1]), ['sb-tsitgxafmtzjgtmiczsq-auth-token', 'sb-tsitgxafmtzjgtmiczsq-auth-token-code-verifier'], 'Offline logout still removes the shared SDK session from this origin');
  assert(offlineLogout.calls.some(call => call[0] === 'replace' && call[1] === '/'), 'Offline logout discards the SDK in-memory session by reloading');
  for (const options of [{ anonymous: true }, { mismatchedSession: true }]) {
    const rejected = await controller(options);
    assert(rejected.node('authenticated-app').hidden);
    assert(!rejected.calls.some(call => call[0] === 'fetch'), 'Anonymous or mismatched stored sessions cannot request the catalog');
  }
  const staleCatalog = await controller({ pendingCatalog: true });
  await staleCatalog.changeUser(null); staleCatalog.releaseCatalog(); await staleCatalog.evaluation; await flush();
  assert(staleCatalog.node('authenticated-app').hidden && staleCatalog.node('film-grid').innerHTML === '', 'A catalog response arriving after sign-out cannot restore private content');
  const staleSession = await controller({ pendingSession: true });
  await staleSession.changeUser(null); staleSession.releaseSession(); await staleSession.evaluation; await flush();
  assert(staleSession.node('authenticated-app').hidden && !staleSession.node('welcome').hidden, 'A session response arriving after sign-out cannot unlock the previous account');
  const brokenHistory = await controller({ historyError: true });
  assert.equal(brokenHistory.node('film-grid').innerHTML, '', 'Failed history load cannot overwrite unknown server state with an empty local history');
  await brokenHistory.click({ save: firstID });
  assert(!brokenHistory.calls.some(call => call[0] === 'upsert'), 'Failed history load prevents progress/list writes until retry');
}

(async () => {
  await checkWorker();
  await checkLibrary();
  checkSchema();
  await checkController();
  console.log('PASS: standalone indexable Watch welcome, gated catalog, same-project remote auth validation, failure/origin/cache isolation, GET/HEAD routes, independent SEO, unchanged main/editor/account compatibility, account-owned progress RLS, SDK/auth lifecycle, native resume/checkpoints/completion, My List sync, sign-out/stale-request/second-account isolation, escaping and player allowlist.');
})().catch(error => { console.error(error); process.exitCode = 1; });
