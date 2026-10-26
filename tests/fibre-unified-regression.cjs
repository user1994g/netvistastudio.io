'use strict';

// Integration regression tests, not a security audit. No real requests are made.
// Uses the sibling website Worker; FIBRE_UNIFIED_WORKER can select a staged copy.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

const workerPath = process.env.FIBRE_UNIFIED_WORKER || path.resolve(__dirname, '../_worker.js');
assert.ok(path.isAbsolute(workerPath), 'FIBRE_UNIFIED_WORKER must be an absolute staged unified Worker path');
const source = fs.readFileSync(workerPath, 'utf8');
assert.equal((source.match(/export\s+default\s+/g) || []).length, 1, 'Expected one default Worker export');
let externalFetches = 0;
const context = vm.createContext({
  URL, Request, Response, Headers, AbortController, setTimeout, clearTimeout,
  fetch: async () => {
    externalFetches += 1;
    throw new Error('External fetch is disabled in this integration test');
  }
});
vm.runInContext(source.replace(/export\s+default\s+/, 'globalThis.__worker = '), context, { filename: workerPath, timeout: 1000 });
const worker = context.__worker;
assert.equal(typeof worker?.fetch, 'function');

const fibre = 'https://fibre.netvistastudio.com';
const main = 'https://netvistastudio.com';
const watch = 'https://video.netvistastudio.com';

function fixture() {
  const requests = [];
  const pages = new Map([
    ['/fibre-concept/', '<!doctype html><h1>This is not a real ISP.</h1>'],
    ['/fibre-concept/high-speed/', '<!doctype html><h1>12 and 20 Gig fictional concepts.</h1>'],
    ['/fibre-concept/assets/fibre.css', '/* Fibre stylesheet */'],
    ['/fibre-concept/assets/fibre.js', '/* Fibre calculator */'],
    ['/fibre-concept/assets/fibre-loop.svg', '<svg><title>Fibre loop</title></svg>'],
    ['/fibre-concept/assets/fibre-icon.svg', '<svg><title>Fibre icon</title></svg>'],
    ['/', '<!doctype html><h1>NetVista Studio main site</h1>'],
    ['/index.html', '<!doctype html><h1>NetVista Studio main site</h1>'],
    ['/video-beta/', '<!doctype html><h1>NetVista Watch</h1>'],
    ['/assets/css/style.css', '/* Existing main stylesheet */'],
    ['/assets/images/creative/coast-1280.jpg', 'existing-image-fixture'],
    ['/assets/privacy-controls.js', '/* Existing consent script */'],
    ['/editor/assets/auth-client.js', '/* Existing account script */'],
    ['/video-beta/assets/cinema.css', '/* Existing Watch stylesheet */']
  ]);
  return { requests, env: { ASSETS: { async fetch(request) {
    requests.push(request);
    const pathname = new URL(request.url).pathname;
    const body = pages.get(pathname);
    return new Response(body ?? 'Unknown static resource', {
      status: body === undefined ? 404 : 200,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Fixture': 'existing-static-binding' }
    });
  } } } };
}

function assertFibreHeaders(response) {
  assert.match(response.headers.get('Content-Security-Policy') || '', /connect-src 'none'/);
  assert.match(response.headers.get('Content-Security-Policy') || '', /frame-ancestors 'none'/);
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.equal(response.headers.get('X-Robots-Tag'), 'noindex, nofollow');
}

test('Fibre root is dispatched before the ordinary main-site fallback', async () => {
  const { requests, env } = fixture();
  for (const suffix of ['/', '/index.html']) {
    const response = await worker.fetch(new Request(fibre + suffix), env);
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '<!doctype html><h1>This is not a real ISP.</h1>');
    assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
    assertFibreHeaders(response);
  }
  assert.deepEqual(requests.map(request => new URL(request.url).pathname), ['/fibre-concept/', '/fibre-concept/']);
});

test('all four Fibre assets are mounted into the concept directory only', async () => {
  const { requests, env } = fixture();
  const contentTypes = new Map([
    ['fibre.css', 'text/css; charset=utf-8'],
    ['fibre.js', 'text/javascript; charset=utf-8'],
    ['fibre-loop.svg', 'image/svg+xml'],
    ['fibre-icon.svg', 'image/svg+xml']
  ]);
  for (const [file, mime] of contentTypes) {
    const response = await worker.fetch(new Request(`${fibre}/assets/${file}`), env);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('Content-Type'), mime);
    assertFibreHeaders(response);
  }
  assert.deepEqual(requests.map(request => new URL(request.url).pathname), [...contentTypes.keys()].map(file => '/fibre-concept/assets/' + file));
});

test('specialist page is routed only on Fibre and strips incoming account headers', async () => {
  const { requests, env } = fixture();
  for (const suffix of ['/high-speed/', '/high-speed/index.html']) {
    const response = await worker.fetch(new Request(fibre + suffix + '?test=1', {
      headers: { Cookie: 'account=fixture', Authorization: 'Bearer fixture' }
    }), env);
    assert.equal(response.status, 200);
    assert.match(await response.text(), /12 and 20 Gig fictional/);
    assert.equal(response.headers.get('Content-Type'), 'text/html; charset=utf-8');
    assertFibreHeaders(response);
    const assetRequest = requests.at(-1);
    assert.equal(new URL(assetRequest.url).pathname, '/fibre-concept/high-speed/');
    assert.equal(new URL(assetRequest.url).search, '');
    assert.equal(assetRequest.headers.get('Cookie'), null);
    assert.equal(assetRequest.headers.get('Authorization'), null);
  }
  const redirect = await worker.fetch(new Request(fibre + '/high-speed'), env);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('Location'), fibre + '/high-speed/');
  const head = await worker.fetch(new Request(fibre + '/high-speed/', { method: 'HEAD' }), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const unknown = await worker.fetch(new Request(fibre + '/high-speed/anything'), env);
  assert.equal(unknown.status, 404);
  assert.equal(externalFetches, 0);
});

test('Fibre never falls through into main assets, editor, Watch or API routes', async () => {
  const { requests, env } = fixture();
  for (const suffix of [
    '/assets/css/style.css', '/assets/images/creative/coast-1280.jpg',
    '/editor/', '/editor/account/', '/editor/assets/auth-client.js',
    '/api/watch/catalog', '/video-beta/', '/video-beta/assets/cinema.css',
    '/privacy/', '/applications/', '/fibre-concept/', '/fibre-concept/assets/fibre.js'
  ]) {
    const response = await worker.fetch(new Request(fibre + suffix), env);
    assert.equal(response.status, 404, suffix);
    assertFibreHeaders(response);
  }
  assert.equal(requests.length, 0);
  assert.equal(externalFetches, 0);
});

test('internal Fibre mount and encoded aliases cannot be opened on main or Watch hosts', async () => {
  const { requests, env } = fixture();
  for (const origin of [main, watch]) {
    for (const suffix of ['/fibre-concept', '/fibre-concept/', '/fibre-concept/index.html', '/fibre-concept/high-speed/', '/fibre-concept/high-speed/index.html', '/%66ibre-concept/', '/fibre-concept%2Fassets/fibre.js']) {
      const response = await worker.fetch(new Request(origin + suffix), env);
      assert.equal(response.status, 404, origin + suffix);
      assert.equal(response.headers.get('Cache-Control'), 'no-store');
    }
  }
  assert.equal(requests.length, 0);
});

test('main homepage retains its unmodified ASSETS passthrough contract', async () => {
  const { requests, env } = fixture();
  const request = new Request(main + '/?campaign=existing', { headers: { Cookie: 'fixture-only=1' } });
  const response = await worker.fetch(request, env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /NetVista Studio main site/);
  assert.equal(response.headers.get('X-Fixture'), 'existing-static-binding');
  assert.equal(requests.length, 1);
  assert.equal(requests[0], request);
});

test('existing main, account and Watch assets remain unchanged through the Worker', async () => {
  const { requests, env } = fixture();
  for (const url of [
    main + '/assets/css/style.css', main + '/assets/images/creative/coast-1280.jpg',
    main + '/assets/privacy-controls.js', main + '/editor/assets/auth-client.js',
    watch + '/video-beta/assets/cinema.css'
  ]) {
    const request = new Request(url);
    const response = await worker.fetch(request, env);
    assert.equal(response.status, 200, url);
    assert.equal(response.headers.get('X-Fixture'), 'existing-static-binding', url);
    assert.equal(requests.at(-1), request, url);
  }
});

test('Watch root still maps into video-beta and retains its existing response protections', async () => {
  const { requests, env } = fixture();
  const response = await worker.fetch(new Request(watch + '/'), env);
  assert.equal(response.status, 200);
  assert.match(await response.text(), /NetVista Watch/);
  assert.equal(new URL(requests[0].url).pathname, '/video-beta/');
  assert.equal(response.headers.get('X-Robots-Tag'), 'index, follow');
  assert.equal(response.headers.get('Referrer-Policy'), 'no-referrer');
  assert.equal(response.headers.get('X-Frame-Options'), 'DENY');
  assert.match(response.headers.get('Content-Security-Policy') || '', /form-action 'none'/);
});

test('anonymous catalogue remains protected and is never available from main or Fibre', async () => {
  const { requests, env } = fixture();
  const before = externalFetches;
  const watchResponse = await worker.fetch(new Request(watch + '/api/watch/catalog'), env);
  assert.equal(watchResponse.status, 401);
  assert.equal(watchResponse.headers.get('Cache-Control'), 'private, no-store');
  assert.deepEqual(await watchResponse.json(), { error: 'Sign in to watch' });
  for (const origin of [main, fibre]) {
    const response = await worker.fetch(new Request(origin + '/api/watch/catalog'), env);
    assert.equal(response.status, 404);
  }
  assert.equal(requests.length, 0);
  assert.equal(externalFetches, before);
});

test('Fibre HTTP, HEAD, robots and unsupported methods are resolved in its own branch', async () => {
  const { requests, env } = fixture();
  const redirect = await worker.fetch(new Request('http://fibre.netvistastudio.com/'), env);
  assert.equal(redirect.status, 308);
  assert.equal(redirect.headers.get('Location'), fibre + '/');
  assertFibreHeaders(redirect);
  const head = await worker.fetch(new Request(fibre + '/', { method: 'HEAD' }), env);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
  const robots = await worker.fetch(new Request(fibre + '/robots.txt'), env);
  assert.equal(robots.status, 200);
  assert.equal(await robots.text(), 'User-agent: *\nDisallow: /\n');
  const denied = await worker.fetch(new Request(fibre + '/api/watch/catalog', { method: 'POST' }), env);
  assert.equal(denied.status, 405);
  assert.equal(denied.headers.get('Allow'), 'GET, HEAD');
  assert.equal(requests.length, 1);
  assert.equal(externalFetches, 0);
});

test('Pages routing cannot bypass the hostname-specific allowlist through host-agnostic exclusions', () => {
  const routesPath = process.env.FIBRE_UNIFIED_ROUTES || path.join(path.dirname(workerPath), '_routes.json');
  const routes = JSON.parse(fs.readFileSync(routesPath, 'utf8'));
  assert.equal(routes.version, 1);
  assert.deepEqual(routes.include, ['/*']);
  assert.deepEqual(routes.exclude, []);
});
