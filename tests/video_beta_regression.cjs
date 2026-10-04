// Offline checks only: no network, real accounts, browser, or deployment.
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
  'video-frame', 'provider-link', 'year', 'toast'];
requiredIds.forEach(id => assert(ids.includes(id), `Missing public Videos contract: #${id}`));
for (const match of html.matchAll(/\b(?:aria-labelledby|aria-describedby|aria-controls|for)="([^"]+)"/g)) {
  match[1].split(/\s+/).forEach(id => assert(ids.includes(id), `Broken accessibility reference: #${id}`));
}
for (const attribute of ['data-shared-navigation', 'data-view', 'data-watch', 'data-details',
  'data-save', 'data-feature', 'data-collection', 'data-close', 'data-enhance']) {
  assert(html.includes(attribute), `Missing shared attribute: ${attribute}`);
}
assert.match(html, /<main\b[^>]*id="main"[^>]*tabindex="-1"/);
assert.match(html, /<body class="videos-site">/, 'Watching is a standalone public experience');
assert(!/editor-locked|account-gate|download-modal|data-platform|type="password"/.test(html), 'Videos must not require editor authentication or downloads');
assert(!/\/editor\/assets\/|auth-client|supabase/.test(html), 'Videos does not import the editor account gate or SDK');
assert.match(css, /\.videos-site \[hidden\]\{display:none!important\}/, 'Hidden states must beat Videos layout rules');
assert(!/editor-locked|visibility:hidden/.test(css), 'The public film library must not be hidden behind an account gate');
assert.match(html, /name="robots" content="noindex, nofollow"/);
assert.match(html, /<title>NetVista — Watch Beta<\/title>/);
assert(html.includes(`rel="canonical" href="${videoOrigin}/"`));
assert(html.includes(`property="og:url" content="${videoOrigin}/"`));
assert.equal([...html.matchAll(/<h1\b/g)].length, 1, 'One main page heading');
for (const statement of ['WEBSITE BETA', 'not a finished streaming service', 'existing external film player',
  'My List stays on your device', 'Account syncing, uploads and playback history are not available', 'Still in development']) {
  assert(html.includes(statement), `Missing honest beta disclosure: ${statement}`);
}
assert(!/v1\.4\.0-beta|aggregateRating|ratingValue|\d+% Match/.test(html), 'No editor release marketing or invented film ratings');
assert.equal([...html.matchAll(/<form\b/g)].length, 0, 'Public Videos does not collect account credentials');
assert.match(html, /<noscript>[\s\S]*watch links above still open the original films[\s\S]*<\/noscript>/, 'Watching retains a no-JavaScript fallback');
assert.match(html, /<script type="module" src="\/video-beta\/assets\/cinema\.js\?v=3"><\/script>/);
assert.match(html, /href="\/video-beta\/assets\/cinema\.css\?v=3"/);
for (const match of html.matchAll(/<a\b[^>]*href="([^"]+)"/g)) {
  const url = new URL(decode(match[1]), videoOrigin + '/');
  assert(![apexOrigin, 'https://www.netvistastudio.com'].includes(url.origin), 'Film navigation must not lead to the main or editor site');
  if (url.origin === videoOrigin) assert.equal(url.pathname, '/', 'Film navigation stays within the standalone film page');
}
assert.match(html, /<iframe\b[^>]*id="video-frame"[^>]*allowfullscreen/);
const frame = [...html.matchAll(/<iframe\b[^>]*>/g)];
assert.equal(frame.length, 1, 'There is one on-demand film player');
assert(!/\bsrc=/.test(frame[0][0]), 'External playback must not load before a watch action');
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
  const context = vm.createContext({ URL, Request, Response, Headers });
  const module = new vm.SourceTextModule(read('_worker.js'), { context });
  await module.link(() => { throw Error('Worker must not import dependencies'); });
  await module.evaluate();
  const worker = module.namespace.default;
  const routes = JSON.parse(read('_routes.json'));
  assert.equal(routes.version, 1);
  assert.deepEqual(routes.include, ['/*'], 'Host isolation must cover all page requests, including future routes');
  const excludedAssets = ['/assets/images/*', '/assets/css/*', '/assets/js/*',
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
  async function route(url, method = 'GET') {
    const original = new Request(url, { method, headers: { 'x-regression': 'preserved' } });
    const calls = [];
    const assetResponse = new Response(method === 'HEAD' ? null : 'static asset', { status: 200,
      headers: { 'x-asset-response': 'retained', 'content-type': 'text/html; charset=utf-8' } });
    const response = await worker.fetch(original, { ASSETS: { async fetch(request) { calls.push(request); return assetResponse; } } });
    return { original, calls, response, assetResponse };
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
      assert.equal(result.response.headers.get('x-robots-tag'), 'noindex, nofollow', 'The standalone film page stays unlisted');
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
    '/video-editor/getting-started/', '/404.html', '/sitemap.xml', '/accounting/', '/unknown-page/',
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
      assert.match(body, /Disallow:\s*\/\s*(?:\n|$)/i);
      assert(!/Sitemap:|netvistastudio\.com/i.test(body), 'Video robots does not advertise the main sitemap');
    }
  }
  const preservedAssets = ['/assets/mobile-navigation.js', '/assets/public-domain.js',
    '/assets/css/studio-shared.css', '/assets/js/data/catalog.js', '/assets/images/photos/final-lesson.jpg',
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
  const { LIST_KEY, playableFilms, readSaved, filterFilms, artworkURL, escapeHTML } = await evaluate('video-beta/assets/library.js');
  const filmIDs = films => Array.from(films, film => film.id);
  const savedIDs = saved => Array.from(saved);
  const films = playableFilms(catalogue);
  const expectedIDs = ['dark-echoes-1939', 'final-lesson-ap-1'];
  assert.equal(LIST_KEY, 'netvista-videos-list-v1', 'Videos storage is separate from editor accounts');
  assert.deepEqual(filmIDs(films), expectedIDs, 'Only existing, playable NetVista films populate the library');
  assert.equal(catalogue.length, films.length, 'The current catalogue contains no fake or unavailable filler');
  assert.equal([...html.matchAll(/<article class="film-card"/g)].length, films.length, 'Static watch fallbacks cover the whole existing collection');
  const providerURLs = new Set(Array.from(films, film => film.videoUrl));
  for (const film of films) {
    assert(html.includes(film.title), `Missing static film title: ${film.id}`);
    assert(html.includes(`href="${film.videoUrl}"`), `Missing direct watch fallback: ${film.id}`);
    assert(fs.existsSync(localFile(new URL(artworkURL(film), videoOrigin))), `Missing film artwork: ${film.id}`);
  }
  for (const match of html.matchAll(/\bdata-(?:watch|details|save|feature)="([^"]+)"/g)) {
    assert(expectedIDs.includes(match[1]), `Control references a non-catalogue film: ${match[1]}`);
  }
  for (const match of html.matchAll(/href="(https:\/\/clip-kingdom-play\.lovable\.app[^" ]*)"/g)) {
    assert(providerURLs.has(decode(match[1])), 'Static player link must refer to an existing film');
  }

  const valid = { id: 'synthetic-film', title: 'Synthetic film', status: 'available',
    description: 'A test story', format: 'Short film', artwork: 'assets/images/photos/final-lesson.jpg',
    videoUrl: 'https://clip-kingdom-play.lovable.app/embed/synthetic-film' };
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

(async () => {
  await checkWorker();
  await checkLibrary();
  console.log('PASS: standalone film-only navigation, no main-site entry links, route coverage/asset exclusions, host-only film HTML, GET/HEAD isolation, unchanged legacy account callbacks/assets, film fallbacks, saved lists/search, escaping and player allowlist.');
})().catch(error => { console.error(error); process.exitCode = 1; });
