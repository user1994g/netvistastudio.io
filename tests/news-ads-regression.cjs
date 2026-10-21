'use strict';
// Offline only: never contacts Google or creates a live ad impression.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const source = read('assets/news-advertising.js');
const hub = read('news/index.html');
const posts = JSON.parse(read('content/news-posts.json')).posts;
const loader = '/assets/news-advertising.js?v=1';

assert.equal([...hub.matchAll(/id="news-advertising"/g)].length, 1, 'Only one manual placement');
assert.equal([...hub.matchAll(/id="news-display-ad"/g)].length, 1, 'Only one display unit');
assert(hub.includes(`src="${loader}"`), 'Hub includes the isolated first-party controller');
assert(hub.includes('data-enabled="false"') && hub.includes('data-consent-reviewed="false"'), 'Pending Google approval and CMP review are fail-closed');
assert(/<aside[^>]*id="news-advertising"[^>]*\bhidden>/.test(hub), 'Pending unit is not displayed');
assert(hub.includes('data-ad-client="ca-pub-8954463256155993"'));
assert(hub.includes('data-ad-slot="8464033041"'));
assert(hub.includes('>Advertisement</p>') && !/click (?:here|the ad)|support us by clicking/i.test(hub), 'Neutral label, no encouraged clicks');
assert(hub.includes('href="/news/privacy.html"'), 'A visible, local advertising disclosure');
assert(/<button[^>]*id="news-ad-cookie-settings"[^>]*\bhidden>/.test(hub), 'No inert cookie button before the documented API is ready');
assert(!/<script[^>]+src="https?:\/\/[^" ]*(?:googlesyndication|fundingchoices|doubleclick)/i.test(hub), 'No unguarded external Google script tag');
for (const file of ['index.html', '404.html', 'applications/index.html', 'editor/index.html',
  'editor/account/index.html', 'video-editor/index.html', 'video-beta/index.html', 'news/privacy.html',
  ...['getting-started', 'keyframes', 'colour-grading-luts', 'export-settings'].map(slug => `video-editor/${slug}/index.html`),
  ...posts.map(post => `news/${post.slug}/index.html`)]) {
  const html = read(file);
  assert(!html.includes('news-advertising.js') && !html.includes('id="news-advertising"') &&
    !/adsbygoogle|pagead2\.googlesyndication\.com/.test(html), `No News ad integration outside the hub: ${file}`);
}
assert(!/adsbygoogle|googlesyndication/.test(read('news/feed.xml')), 'RSS stays ad-free');
assert(!/enable_page_level_ads/.test(source), 'Do not switch on Auto Ads');

function harness(options = {}) {
  const nodes = new Map();
  const placement = { dataset: { enabled: options.enabled ?? 'true', consentReviewed: options.consentReviewed ?? 'true' }, hidden: true };
  const attributes = { 'data-ad-client': options.publisher ?? 'ca-pub-8954463256155993', 'data-ad-slot': options.slot ?? '8464033041' };
  const unit = { getAttribute(name) { return attributes[name] ?? null; } };
  const listeners = [];
  const settings = { hidden: true, addEventListener(type, handler) { listeners.push({ type, handler }); } };
  if (!options.noPlacement) nodes.set('news-advertising', placement);
  if (!options.noUnit) nodes.set('news-display-ad', unit);
  nodes.set('news-ad-cookie-settings', settings);
  if (options.existingScript) nodes.set('news-adsense-script', {});
  const scripts = [], timers = new Map();
  let nextTimer = 0;
  const window = {};
  if (options.brokenAdQueue) window.adsbygoogle = { push() { throw Error('Synthetic unavailable ad API'); } };
  const context = vm.createContext({ window, location: { origin: options.origin ?? 'https://netvistastudio.com', pathname: options.pathname ?? '/news/' },
    document: { getElementById(id) { return nodes.get(id) || null; },
      createElement(tag) { assert.equal(tag, 'script'); return {}; },
      head: { appendChild(script) { if (options.appendFailure) throw Error('Synthetic blocked script'); scripts.push(script); nodes.set(script.id, script); } } },
    setTimeout(callback, delay) { assert.equal(delay, 15000); timers.set(++nextTimer, callback); return nextTimer; },
    clearTimeout(id) { timers.delete(id); } });
  const run = () => vm.runInContext(source, context);
  run();
  return { run, placement, scripts, timers, window, settings, listeners };
}
function assertNoRequest(options, label) {
  const state = harness(options);
  assert.equal(state.scripts.length, 0, label);
  assert.equal(state.timers.size, 0, `${label}: no timers`);
  assert.equal(state.placement.hidden, true, `${label}: no blank banner`);
  assert.equal(state.window.googlefc, undefined, `${label}: no CMP initialization`);
  assert.equal(state.window.adsbygoogle, undefined, `${label}: no ad queue initialization`);
}

for (const options of [
  { enabled: 'false' }, { enabled: '1' }, { enabled: '' },
  { consentReviewed: 'false' }, { consentReviewed: '' },
  { noPlacement: true }, { noUnit: true }, { existingScript: true },
  { publisher: 'ca-pub-123' }, { publisher: 'ca-pub-8954463256155993<script>' },
  { publisher: '//evil.example/' }, { slot: '8464033041&extra=1' }, { slot: 'abc' }
]) assertNoRequest(options, `Fail closed: ${JSON.stringify(options)}`);
for (const origin of ['http://netvistastudio.com', 'https://www.netvistastudio.com',
  'http://localhost:8766', 'http://127.0.0.1:8766', 'https://netvistastudio.pages.dev',
  'https://preview.netvistastudio.pages.dev', 'https://video.netvistastudio.com',
  'https://netvistastudio.com.evil.example']) assertNoRequest({ origin }, `Off production origin ${origin}`);
for (const pathname of ['/', '/news', '/news/privacy.html', '/news/feed.xml', '/news/unknown/',
  '/newsish/', '/news//', '/editor/', '/account/', '/video-editor/',
  ...posts.map(post => `/news/${post.slug}/`)]) assertNoRequest({ pathname }, `Off hub ${pathname}`);

for (const pathname of ['/news/', '/news/index.html']) {
  const state = harness({ pathname });
  assert.equal(state.scripts.length, 1);
  const script = state.scripts[0];
  assert.equal(script.src, 'https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-8954463256155993');
  assert.equal(script.async, true);
  assert.equal(script.crossOrigin, 'anonymous');
  assert.equal(state.placement.hidden, false);
  assert.equal(state.window.adsbygoogle, undefined, 'Wait for successful script load');
  state.run();
  assert.equal(state.scripts.length, 1, 'Repeated initialization never injects another script');
  script.onload();
  script.onload();
  assert.equal(state.window.adsbygoogle.length, 1, 'Queue exactly one manual-unit request');
  assert.equal(Object.keys(state.window.adsbygoogle[0]).length, 0, 'Only the documented display-unit command');
  assert.equal(state.timers.size, 0);
  assert.equal(state.placement.dataset.adState, 'requested');
  let revocations = 0;
  const callback = state.window.googlefc.callbackQueue[0].CONSENT_API_READY;
  callback();
  assert.equal(state.settings.hidden, true, 'Wait for an actual callable API');
  state.window.googlefc.showRevocationMessage = () => { revocations++; };
  callback(); callback();
  assert.equal(state.settings.hidden, false);
  assert.equal(state.listeners.length, 1, 'Consent readiness is idempotent');
  assert.equal(state.listeners[0].type, 'click');
  state.listeners[0].handler();
  assert.equal(revocations, 1, 'The button opens Google’s actual revocation message');
}

const blocked = harness();
blocked.scripts[0].onerror();
blocked.scripts[0].onload();
assert.equal(blocked.placement.hidden, true);
assert.equal(blocked.placement.dataset.adState, 'unavailable');
assert.equal(blocked.window.adsbygoogle, undefined, 'No unit request after a blocked script');
assert.equal(blocked.timers.size, 0);
blocked.run();
assert.equal(blocked.scripts.length, 1, 'No retry loop or adblock workaround');
const silentBlock = harness();
[...silentBlock.timers.values()][0]();
silentBlock.scripts[0].onload();
assert.equal(silentBlock.placement.hidden, true, 'Silent network/adblock timeout removes the space');
assert.equal(silentBlock.window.adsbygoogle, undefined, 'A late load does not restart the request');
const brokenQueue = harness({ brokenAdQueue: true });
assert.doesNotThrow(() => brokenQueue.scripts[0].onload());
assert.equal(brokenQueue.placement.hidden, true, 'An unavailable ad API leaves content usable');
const failedAppend = harness({ appendFailure: true });
assert.equal(failedAppend.placement.hidden, true);
assert.equal(failedAppend.placement.dataset.adState, 'unavailable');
assert.equal(failedAppend.timers.size, 0);
console.log('PASS: News-hub-only advertising, disabled pending approval/CMP review, exact production guard, one initialization, privacy controls and graceful blocked/error paths');
