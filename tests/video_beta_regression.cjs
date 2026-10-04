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
const requiredIds = ['main', 'site-header', 'nav-toggle', 'primary-nav', 'download', 'download-modal',
  'download-dialog-title', 'download-dialog-description', 'account-gate-modal', 'account-gate-title',
  'account-gate-description', 'account-gate-status', 'gate-signin-tab', 'gate-signup-tab',
  'gate-signin-form', 'gate-signup-form', 'gate-signin-email', 'gate-signin-password',
  'gate-signup-name', 'gate-signup-email', 'gate-signup-password', 'gate-forgot-password',
  'tool-search', 'tool-results', 'tool-rail', 'tool-empty', 'reset-tool-search'];
requiredIds.forEach(id => assert(ids.includes(id), `Missing shared or browsing contract: #${id}`));
for (const match of html.matchAll(/\b(?:aria-labelledby|aria-describedby|aria-controls|for)="([^"]+)"/g)) {
  match[1].split(/\s+/).forEach(id => assert(ids.includes(id), `Broken accessibility reference: #${id}`));
}
for (const name of ['download-link', 'releases-link', 'github-link', 'clone-url', 'repo-name', 'copy-button',
  'download-dialog', 'account-gate-dialog']) {
  assert(new RegExp(`class="[^"]*\\b${name}\\b`).test(html), `Missing shared class: ${name}`);
}
for (const attribute of ['data-shared-navigation', 'data-current-year', 'data-close-download', 'data-close-account-gate']) {
  assert(html.includes(attribute), `Missing shared attribute: ${attribute}`);
}
assert.match(html, /<main\b[^>]*id="main"[^>]*tabindex="-1"/);
assert.match(html, /<body class="editor-locked video-beta">/, 'Gate must be locked before scripts load');
assert.match(css, /\.video-beta\.editor-locked main[^{}]*\{visibility:hidden\}/, 'Locked surfaces stay hidden');
assert.match(read('editor/assets/site.css'), /\[hidden\]\{display:none!important\}/, 'Hidden states must beat layout rules');
assert.match(html, /name="robots" content="noindex, follow"/);
assert(html.includes(`rel="canonical" href="${videoOrigin}/"`));
assert(html.includes(`property="og:url" content="${videoOrigin}/"`));
assert.equal([...html.matchAll(/<h1\b/g)].length, 1, 'One main page heading');
for (const statement of ['Still in development', 'not a finished release', 'Not production-ready.',
  'Features can be incomplete', 'Keep backups', 'PLATFORM DIFFERENCES', 'Not an app screenshot', '1.4 Beta 6']) {
  assert(html.includes(statement), `Missing honest beta disclosure: ${statement}`);
}
assert(!/BETA 4|Beta 4|v1\.4\.0-beta\.4|aggregateRating|ratingValue|\d+% Match/.test(html), 'No stale version or invented ratings');
const forms = [...html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)].map(m => m[0]);
assert.equal(forms.length, 2, 'Only existing sign-in and signup forms');
forms.forEach(form => {
  assert.match(form, /method="post"/);
  assert.match(form, /<fieldset disabled/, 'Auth forms fail closed while SDK unavailable');
  for (const input of form.matchAll(/<input\b[^>]*>/g)) assert(!/\bname=/.test(input[0]), 'Native submit must not serialize credentials');
});
const platforms = [...html.matchAll(/<a\b[^>]*data-platform="[^"]+"[^>]*>/g)].map(m => attrs(m[0]));
assert.deepEqual(platforms.map(p => p['data-platform']).sort(), ['linux', 'mac', 'windows']);
platforms.forEach(p => assert(p.href.includes('/releases/download/v1.4.0-beta.6/'), 'Fallback downloads match release script'));
assert.equal([...html.matchAll(/<script[^>]*src="[^"]*auth-client/g)].length, 0, 'Shared entry gate retains lazy auth loading');
assert(html.indexOf('cinema.css') > html.indexOf('studio-shared.css'), 'Video-only styles override shared styles locally');

function localFile(url) {
  let pathname = decodeURIComponent(url.pathname);
  if (url.origin === videoOrigin && pathname === '/') pathname = '/video-beta/';
  return path.join(root, pathname, pathname.endsWith('/') ? 'index.html' : '');
}
function checkLink(value) {
  const url = new URL(decode(value), videoOrigin + '/');
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
for (const match of css.matchAll(/url\(['"]?([^)'"\s]+)['"]?\)/g)) checkLink(match[1]);

async function checkWorker() {
  const context = vm.createContext({ URL, Request, Response });
  const module = new vm.SourceTextModule(read('_worker.js'), { context });
  await module.link(() => { throw Error('Worker must not import dependencies'); });
  await module.evaluate();
  const worker = module.namespace.default;
  const routes = JSON.parse(read('_routes.json'));
  assert.equal(routes.version, 1);
  for (const value of ['/', '/index.html', '/account', '/account/*']) assert(routes.include.includes(value), `Route excluded from worker: ${value}`);
  assert.deepEqual(routes.exclude, []);
  async function route(url, method = 'GET') {
    const original = new Request(url, { method, headers: { 'x-regression': 'preserved' } });
    const calls = [];
    const assetResponse = new Response(method === 'HEAD' ? null : 'static asset', { status: 200, headers: { 'x-asset-response': 'retained' } });
    const response = await worker.fetch(original, { ASSETS: { async fetch(request) { calls.push(request); return assetResponse; } } });
    return { original, calls, response, assetResponse };
  }
  for (const host of [apexOrigin, 'https://www.netvistastudio.com', 'https://preview.netvistastudio.pages.dev']) {
    for (const pathname of ['/', '/index.html', '/account/?code=synthetic', '/applications/', '/editor/']) {
      for (const method of ['GET', 'HEAD']) {
        const result = await route(host + pathname, method);
        assert.equal(result.calls.length, 1);
        assert.equal(result.calls[0], result.original, 'Non-video host passes through the exact Request');
        assert.equal(result.response, result.assetResponse, 'Non-video response must be unchanged');
      }
    }
  }
  for (const pathname of ['/', '/index.html']) {
    for (const method of ['GET', 'HEAD']) {
      const result = await route(videoOrigin + pathname + '?preview=a%2Fb&x=1', method);
      assert.equal(result.calls[0].url, videoOrigin + '/video-beta/?preview=a%2Fb&x=1');
      assert.equal(result.calls[0].method, method);
      assert.equal(result.calls[0].headers.get('x-regression'), 'preserved');
      assert.equal(result.response, result.assetResponse, 'Rewrite retains the asset Response');
    }
  }
  for (const pathname of ['/editor/', '/assets/mobile-navigation.js', '/video-beta/assets/cinema.css', '/accounting/']) {
    const result = await route(videoOrigin + pathname);
    assert.equal(result.calls[0], result.original, `Unmatched video path unchanged: ${pathname}`);
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
        for (const match of accountHTML.matchAll(/\b(?:href|src)="([^"#][^"]*)"/g)) {
          const resource = new URL(match[1], browserURL);
          if (resource.origin !== videoOrigin) continue;
          const fetched = await route(resource.href);
          const resourceURL = fetched.response.status === 308
            ? new URL(fetched.response.headers.get('location'), resource)
            : new URL(fetched.calls[0].url);
          assert(fs.existsSync(localFile(resourceURL)), `Account-relative resource broken at browser URL ${browserURL.pathname}: ${resource.pathname}`);
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

function checkBrowsing() {
  const nodes = new Map(), assigned = [], locked = new Set(['editor-locked']);
  function node(name, dataset = {}, textContent = '') {
    const handlers = {}, attributes = {};
    const value = { dataset, textContent, value: '', hidden: false, focused: false,
      setAttribute(key, value) { attributes[key] = value; }, getAttribute(key) { return attributes[key]; },
      focus() { this.focused = true; }, addEventListener(type, callback, options) { (handlers[type] ||= []).push({ callback, options }); },
      fire(type, key) { const event = { key, prevented: false, stopped: false, preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; } }; for (const handler of handlers[type] || []) { handler.callback(event); if (event.stopped) break; } return event; },
      handlers };
    nodes.set(name, value); return value;
  }
  const filters = ['all', 'edit', 'finish', '3d'].map(category => node(`filter-${category}`, { toolFilter: category }));
  const cards = [...html.matchAll(/<article class="cinema-tool-card"([^>]*)>([\s\S]*?)<\/article>/g)].map((m, index) => {
    const attributes = attrs(m[1]);
    return node(`card-${index}`, { tool: attributes['data-tool'], search: attributes['data-search'] }, decode(m[2].replace(/<[^>]+>/g, ' ')));
  });
  for (const id of ['tool-search', 'tool-results', 'tool-empty', 'tool-rail', 'reset-tool-search', 'account-gate-modal']) node('#' + id);
  const closeButtons = [node('gate-close'), node('gate-backdrop')];
  const document = { body: { classList: { contains: name => locked.has(name) } },
    querySelector: selector => nodes.get(selector) || null,
    querySelectorAll: selector => selector === '[data-tool-filter]' ? filters : selector === '[data-tool]' ? cards : selector === '[data-close-account-gate]' ? closeButtons : [] };
  new vm.Script(read('video-beta/assets/cinema.js')).runInNewContext({ document, window: { location: { assign: value => assigned.push(value) } } });
  const search = nodes.get('#tool-search'), results = nodes.get('#tool-results');
  const visible = () => cards.filter(card => !card.hidden);
  assert.equal(visible().length, 4); assert.equal(results.textContent, '4 tools');
  filters[2].fire('click'); assert.equal(visible().length, 2);
  assert.equal(filters[2].getAttribute('aria-pressed'), 'true');
  filters.filter(filter => filter !== filters[2]).forEach(filter => assert.equal(filter.getAttribute('aria-pressed'), 'false'));
  search.value = '  CoLoUr  '; search.fire('input');
  assert.equal(visible().length, 1); assert.equal(results.textContent, '1 tool matches your search');
  search.value = '<script>synthetic</script>'; search.fire('input');
  assert.equal(visible().length, 0); assert(!nodes.get('#tool-empty').hidden); assert(nodes.get('#tool-rail').hidden);
  nodes.get('#reset-tool-search').fire('click');
  assert.equal(search.value, ''); assert(search.focused); assert.equal(visible().length, 4);
  assert(nodes.get('#tool-empty').hidden); assert(!nodes.get('#tool-rail').hidden);
  assert.equal(filters[0].getAttribute('aria-pressed'), 'true');
  filters[3].fire('click'); assert.equal(visible().length, 1);
  search.value = 'lut'; search.fire('input'); assert.equal(visible().length, 0, 'Search and category are intersected');
  closeButtons.forEach(button => { assert.equal(button.handlers.click[0].options.capture, true); const event = button.fire('click'); assert(event.prevented && event.stopped); });
  const modal = nodes.get('#account-gate-modal');
  assert.equal(modal.handlers.keydown[0].options.capture, true);
  const escape = modal.fire('keydown', 'Escape'); assert(escape.prevented && escape.stopped);
  assert.deepEqual(assigned, [apexOrigin + '/', apexOrigin + '/', apexOrigin + '/']);
  const otherKey = modal.fire('keydown', 'Tab'); assert(!otherKey.prevented && !otherKey.stopped);
  locked.clear();
  closeButtons.forEach(button => { const event = button.fire('click'); assert(!event.prevented && !event.stopped); });
  const unlockedEscape = modal.fire('keydown', 'Escape'); assert(!unlockedEscape.prevented && !unlockedEscape.stopped);
  assert.equal(assigned.length, 3, 'Unlocked gate close remains owned by the shared auth flow');
}

(async () => {
  await checkWorker();
  checkBrowsing();
  console.log('PASS: video beta assets/anchors/IDs, fail-closed forms, honest beta/version/canonical, host-isolated GET/HEAD routing, account queries/resources, filters/search/reset, and locked/unlocked gate exits.');
})().catch(error => { console.error(error); process.exitCode = 1; });
