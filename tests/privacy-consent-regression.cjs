'use strict';
// Entirely offline: no browser vendor, account, email or database requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const code = fs.readFileSync(path.join(root, 'assets/privacy-controls.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'privacy/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/privacy-controls.css'), 'utf8');
for (const file of ['editor/index.html', 'editor/account/index.html', 'video-beta/index.html']) {
  const page = fs.readFileSync(path.join(root, file), 'utf8');
  assert(!page.includes('clarity.ms/tag/'), file + ': no unconditional vendor loader remains');
  assert(page.includes('src="/assets/privacy-controls.js?v=2" data-analytics="clarity"'), file + ': current shared consent gate bypasses older cached versions');
  assert(page.includes('href="/privacy/"'), file + ': accessible first-party privacy notice');
  assert(page.includes('data-clarity-mask="true"'), file + ': private account/form areas masked');
}
const KEY = 'netvista-privacy-choice-v1';
const DAY = 86400000;
const NOW = 1792584000000;

function fixture(options = {}) {
  const documentEvents = {}, windowEvents = {}, cookies = [], removals = [];
  const storage = new Map();
  if (options.choice !== undefined) storage.set(KEY, typeof options.choice === 'string' ? options.choice : JSON.stringify(options.choice));
  storage.set('sb-tsitgxafmtzjgtmiczsq-auth-token', 'FAKE_LOCAL_TEST_SESSION');
  let reloaded = 0, currentTime = NOW;
  const problems = { get: false, set: false, remove: false, ...options.problems };
  class Node {
    constructor(tag) { this.tagName = tag.toUpperCase(); this.children = []; this.attrs = {}; this.events = {}; this.hidden = false; this.disabled = false; this.isConnected = true; this.textContent = ''; }
    setAttribute(name, value) { this.attrs[name] = String(value); }
    getAttribute(name) { return this.attrs[name] ?? null; }
    appendChild(child) { this.children.push(child); return child; }
    addEventListener(type, callback) { (this.events[type] ||= []).push(callback); }
    fire(type, event = {}) { for (const handler of this.events[type] || []) handler({ target: this, preventDefault() {}, ...event }); }
    focus() { document.activeElement = this; }
    closest(selector) { return selector === '[data-privacy-settings]' && this.getAttribute('data-privacy-settings') !== null ? this : null; }
    querySelector(selector) { return descendants(this).find(node => selector === 'h2' ? node.tagName === 'H2' : selector === '[data-privacy-accept]' && node.getAttribute('data-privacy-accept') !== null) || null; }
  }
  const descendants = node => node.children.flatMap(child => [child, ...descendants(child)]);
  const currentScript = new Node('script');
  if (options.analyticsPage !== false) currentScript.setAttribute('data-analytics', 'clarity');
  const document = {
    currentScript, readyState: options.readyState || 'complete', head: new Node('head'), body: new Node('body'), activeElement: null,
    createElement: tag => new Node(tag),
    addEventListener(type, callback) { (documentEvents[type] ||= []).push(callback); }
  };
  Object.defineProperty(document, 'cookie', { get() { return '_clck=test; _clsk=test'; }, set(value) { cookies.push(value); } });
  const window = {
    location: { hostname: options.hostname || 'video.netvistastudio.com', pathname: '/editor/account/', reload() { reloaded++; } },
    addEventListener(type, callback) { (windowEvents[type] ||= []).push(callback); }
  };
  const localStorage = {
    getItem(name) { if (problems.get) throw new Error('blocked'); return storage.get(name) ?? null; },
    setItem(name, value) { if (problems.set) throw new Error('blocked'); storage.set(name, String(value)); },
    removeItem(name) { removals.push(name); if (problems.remove) throw new Error('blocked'); storage.delete(name); }
  };
  const navigator = { globalPrivacyControl: Boolean(options.gpc) };
  class Clock extends Date { static now() { return currentTime; } }
  const context = vm.createContext({ window, document, navigator, localStorage, Date: Clock, JSON, Number });
  const execute = () => vm.runInContext(code, context, { timeout: 1000 });
  execute();
  const all = () => descendants(document.body);
  const attr = name => all().find(node => node.getAttribute(name) !== null);
  const panel = () => all().find(node => node.id === 'netvista-privacy-panel');
  const status = () => all().find(node => node.className === 'nv-privacy-status');
  return {
    window, document, storage, problems, cookies, removals, navigator, execute,
    count: () => document.head.children.filter(node => /clarity\.ms\/tag\//.test(node.src || '')).length,
    reloads: () => reloaded, panel, status,
    click: name => attr(name).fire('click'),
    reopen() { all().find(node => node.className === 'nv-privacy-reopen').fire('click'); },
    event(type, event) { for (const handler of windowEvents[type] || []) handler(event); },
    documentEvent(type, event) { for (const handler of documentEvents[type] || []) handler(event); },
    advance(ms) { currentTime += ms; }
  };
}
const choice = (analytics = true, updatedAt = NOW) => ({ version: 1, analytics, updatedAt });

{
  const app = fixture();
  assert.equal(app.count(), 0, 'No Microsoft request before consent');
  assert.equal(app.panel().hidden, false, 'Explain a first-visit choice');
  assert.equal(app.window.clarity, undefined, 'No vendor stub or cookieless tracking before consent');
  app.click('data-privacy-reject');
  assert.equal(app.count(), 0);
  assert.equal(app.panel().hidden, true);
  assert.equal(JSON.parse(app.storage.get(KEY)).analytics, false);
  assert.equal(app.storage.get('sb-tsitgxafmtzjgtmiczsq-auth-token'), 'FAKE_LOCAL_TEST_SESSION');
  app.reopen();
  assert.equal(app.panel().hidden, false);
  assert.match(app.status().textContent, /necessary storage only/);
  app.click('data-privacy-accept');
  assert.equal(app.count(), 1);
  assert.equal(JSON.parse(app.storage.get(KEY)).analytics, true);
  assert.equal(app.window.clarity.q[0][0], 'consentv2');
  assert.equal(app.window.clarity.q[0][1].analytics_Storage, 'granted');
  assert.equal(app.window.clarity.q[0][1].ad_Storage, 'denied', 'Analytics acceptance is not advertising consent');
  app.reopen(); app.click('data-privacy-accept');
  assert.equal(app.count(), 1, 'Repeated acceptance does not duplicate the vendor');
  app.execute();
  assert.equal(app.count(), 1, 'Duplicate script initialization is safe');
  assert.equal(app.document.body.children.length, 2, 'Only one panel and one reopen control');
  app.reopen(); app.click('data-privacy-reject');
  assert.equal(app.reloads(), 1, 'Withdrawal reloads to stop already-loaded vendor code');
  assert.equal(JSON.parse(app.storage.get(KEY)).analytics, false);
  assert.equal(app.window.clarity.q.at(-1)[1].analytics_Storage, 'denied');
  assert.equal(app.window.clarity.q.at(-1)[1].ad_Storage, 'denied');
  assert(app.cookies.some(value => value.startsWith('_clck=;') && value.includes('Domain=.netvistastudio.com')));
  assert(app.cookies.some(value => value.startsWith('_clsk=;') && value.includes('Domain=video.netvistastudio.com')));
  assert(app.cookies.every(value => /^(?:_clck|_clsk)=;/.test(value)), 'Do not delete other cookies');
  assert.equal(app.removals.length, 0, 'With normal storage no unrelated localStorage key is removed');
}
for (const bad of [null, 'not json', {}, { ...choice(), version: 2 }, { ...choice(), analytics: 'true' }, choice(true, NOW - 180 * DAY - 1), choice(true, NOW + 1), { ...choice(), updatedAt: null }]) {
  const app = fixture({ choice: bad });
  assert.equal(app.count(), 0, 'Malformed, stale or future-dated permission is not consent');
  assert.equal(app.panel().hidden, false);
}
{
  const app = fixture({ choice: choice(true, NOW - 180 * DAY) });
  assert.equal(app.count(), 1, 'The 180-day boundary is inclusive');
  assert.equal(app.panel().hidden, true);
}
for (const hostname of ['127.0.0.1', 'localhost', 'evilnetvistastudio.com', 'video.netvistastudio.com.attacker.invalid']) {
  const app = fixture({ choice: choice(), hostname });
  assert.equal(app.count(), 0, 'Do not send local preview or lookalike-host traffic to production analytics');
}
for (const hostname of ['netvistastudio.com', 'www.netvistastudio.com', 'video.netvistastudio.com']) {
  assert.equal(fixture({ choice: choice(), hostname }).count(), 1);
}
{
  const app = fixture({ analyticsPage: false, choice: choice() });
  assert.equal(app.count(), 0, 'Policy / ordinary pages do not become analytics pages');
  app.reopen(); app.click('data-privacy-accept');
  assert.equal(app.count(), 0);
}
{
  const app = fixture({ gpc: true, choice: choice() });
  assert.equal(app.count(), 0, 'Global Privacy Control overrides previous opt-in');
  app.reopen(); app.click('data-privacy-accept');
  assert.equal(app.count(), 0);
  assert.match(app.status().textContent, /Global Privacy Control/);
}
for (const problems of [{ get: true }, { set: true }, { get: true, set: true }]) {
  const app = fixture({ problems });
  app.click('data-privacy-accept');
  assert.equal(app.count(), 0, 'Unavailable or unverifiable storage cannot allow analytics');
  assert.match(app.status().textContent, /could not save/);
}
for (const problems of [{ get: true }, { set: true }, { get: true, set: true }]) {
  const app = fixture({ problems });
  app.click('data-privacy-reject');
  assert.equal(app.panel().hidden, true, 'Reject closes the panel even when preference storage is blocked');
  assert.equal(app.count(), 0, 'Session-only rejection never loads analytics');
  assert.equal(app.storage.get('sb-tsitgxafmtzjgtmiczsq-auth-token'), 'FAKE_LOCAL_TEST_SESSION');
  app.reopen();
  assert.match(app.status().textContent, /necessary storage only for this page/);
  app.click('data-privacy-accept');
  assert.equal(app.count(), 0, 'Failed opt-in cannot override session-only rejection');
  app.problems.get = false; app.problems.set = false;
  app.click('data-privacy-accept');
  assert.equal(app.count(), 1, 'An explicit later opt-in works once storage is available');
}
{
  const app = fixture({ choice: choice(false) });
  assert.equal(app.panel().hidden, true, 'A returning visitor’s saved rejection does not prompt again');
  assert.equal(app.count(), 0);
  const opener = app.document.createElement('button');
  opener.setAttribute('data-privacy-settings', '');
  app.documentEvent('click', { target: opener, preventDefault() {} });
  assert.match(app.status().textContent, /necessary storage only/);
  app.panel().fire('keydown', { key: 'Escape' });
  assert.equal(app.panel().hidden, true);
  assert.equal(app.document.activeElement, opener, 'Closing choices returns focus to the opener');
  assert.equal(JSON.parse(app.storage.get(KEY)).analytics, false, 'Escape does not grant analytics consent');
}
{
  const app = fixture({ choice: choice() });
  app.problems.set = true;
  app.reopen(); app.click('data-privacy-reject');
  assert.equal(app.storage.has(KEY), false, 'Failed withdrawal storage clears only the old consent entry when possible');
  assert.deepEqual(app.removals, [KEY]);
  assert.equal(app.reloads(), 1);
  assert.equal(app.storage.get('sb-tsitgxafmtzjgtmiczsq-auth-token'), 'FAKE_LOCAL_TEST_SESSION');
}
{
  const app = fixture({ choice: choice() });
  app.problems.set = true; app.problems.remove = true;
  app.reopen(); app.click('data-privacy-reject');
  assert.equal(app.reloads(), 0, 'Never reload into stale accepted consent if it cannot be cleared');
  assert.match(app.status().textContent, /Close this tab/);
  assert.equal(app.window.clarity.q.at(-1)[1].analytics_Storage, 'denied');
  app.problems.get = true;
  app.event('focus', {});
  app.event('storage', { key: KEY });
  assert.equal(app.reloads(), 0, 'A later storage-read failure must not reload into an uncleared old opt-in');
  app.problems.get = false;
  app.reopen();
  assert.match(app.status().textContent, /Close this tab/);
}
{
  const app = fixture({ choice: choice() });
  app.reopen();
  app.problems.set = true; app.problems.get = true; app.problems.remove = true;
  app.click('data-privacy-reject');
  assert.equal(app.reloads(), 0, 'Unverifiable storage during withdrawal is not proof that an old opt-in was cleared');
  assert.equal(JSON.parse(app.storage.get(KEY)).analytics, true, 'Synthetic old opt-in remains uncleared');
  assert.match(app.status().textContent, /Close this tab/);
  assert.equal(app.window.clarity.q.at(-1)[1].analytics_Storage, 'denied');
}
{
  const app = fixture({ choice: choice() });
  app.storage.set(KEY, JSON.stringify(choice(false)));
  app.event('storage', { key: KEY });
  assert.equal(app.reloads(), 1, 'Withdrawal in another tab stops the existing analytics session');
}
{
  const app = fixture({ choice: choice(false) });
  app.storage.set(KEY, JSON.stringify(choice(true)));
  app.event('storage', { key: KEY });
  assert.equal(app.count(), 0, 'A cross-tab event does not silently start analytics');
}
{
  const app = fixture({ choice: choice() });
  app.advance(180 * DAY + 1);
  app.event('focus', {});
  assert.equal(app.reloads(), 1, 'Returning to a very long-lived page cannot keep expired analytics permission');
  assert.equal(app.window.clarity.q.at(-1)[1].analytics_Storage, 'denied');
}
{
  const app = fixture({ choice: choice() });
  app.navigator.globalPrivacyControl = true;
  app.documentEvent('visibilitychange', {});
  assert.equal(app.reloads(), 1, 'GPC newly enabled while the page was hidden stops already-loaded analytics');
}
{
  const app = fixture({ readyState: 'loading' });
  assert.equal(app.document.body.children.length, 0);
  app.documentEvent('DOMContentLoaded', {});
  assert.equal(app.document.body.children.length, 2);
  const settings = app.document.createElement('button'); settings.setAttribute('data-privacy-settings', '');
  app.click('data-privacy-reject');
  let prevented = false;
  app.documentEvent('click', { target: settings, preventDefault() { prevented = true; } });
  assert.equal(prevented, true);
  assert.equal(app.panel().hidden, false, 'External settings controls work without a dependency');
}

assert(html.includes('https://netvistastudio.com/privacy/'));
assert(html.includes('us-west-1, United States'), 'Disclose the verified project region, not EU-only storage');
assert(html.includes('Formspree') && html.includes('Cloudflare') && html.includes('Microsoft Clarity') && html.includes('clip-kingdom-play.lovable.app'));
assert(html.includes('jackmiller@netvistastudio.com'));
assert(html.includes('not a promise that every backup copy disappears immediately'));
assert(!/EU approved|GDPR certified|guaranteed compliance/i.test(html), 'Do not invent regulatory approval');
assert(/<script defer src="\/assets\/privacy-controls\.js\?v=2"><\/script>/.test(html), 'Policy settings do not enable a new analytics page');
assert(!html.includes('https://www.clarity.ms/tag/') && !html.includes('googlesyndication'), 'No direct vendor load from policy markup');
assert(!code.includes('innerHTML') && !code.includes('eval('), 'Consent UI never interpolates external markup');
assert(css.includes('.nv-privacy-panel[hidden]{display:none!important}'));
assert(css.includes('@media(max-width:450px)'));
console.log('PASS: offline privacy notice and consent defaults, explicit opt-in, withdrawal, equal choices, expiry, storage failure, GPC, per-page/host scope and independent account storage');
