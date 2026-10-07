// Offline behavior tests; no real accounts or network requests.
// node --experimental-vm-modules tests/web_download_gate.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const tick = () => new Promise(resolve => setImmediate(resolve));
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const siteSource = read('editor/assets/site.js');
const html = read('editor/index.html');
const releaseTag = 'v1.4.0-beta.7';
const repositoryURL = 'https://github.com/user1994g/videoediterNetVistaStudio.github.io';
const assets = {
  mac: 'NetVista-Studio-macOS-1.4-Beta-7.zip',
  windows: 'NetVista-Studio-Windows-1.4-Beta-7.zip',
  linux: 'NetVista-Studio-Linux-1.4-Beta-7.zip',
  ipad: 'NetVista-Studio-iPadOS-1.4-Beta-7.ipa',
  android: 'NetVista-Studio-Android-1.4-Beta-7.apk'
};
assert(siteSource.includes(`const releaseTag = '${releaseTag}'`), 'Use the newest verified release tag');
Object.values(assets).forEach(name => assert(siteSource.includes(name), `Missing Beta 7 asset: ${name}`));
assert(!/Beta[- ](?:4|6)\b|beta\.(?:4|6)\b/i.test(html + siteSource), 'Current download labels/links cannot point at an older beta');
assert(html.includes(`${repositoryURL}/releases/tag/${releaseTag}`), 'Static release notes point at Beta 7 without JavaScript');
assert(html.includes('assets/site.js?v=20') && html.includes('assets/site.css?v=13'), 'Changed release scripts/styles have new cache versions');
assert.deepEqual([...html.matchAll(/\bdata-platform="([^"]+)"/g)].map(match => match[1]), Object.keys(assets), 'Desktop and native mobile packages are distinct download controls');
const mobileRows = [...html.matchAll(/<a\b[^>]*class="[^"]*\bplatform-mobile\b[^"]*"[^>]*>[\s\S]*?<\/a>/g)].map(match => match[0]);
assert.equal(mobileRows.length, 2, 'Both native mobile packages have download rows');
for (const [platform, label, install] of [['ipad', 'iPadOS', 'AltStore Classic sideload'], ['android', 'Samsung/Android', 'Signed APK sideload']]) {
  const row = mobileRows.find(value => value.includes(`data-platform="${platform}"`));
  assert(row && row.includes(`<strong>${label}</strong>`), `Distinct mobile download: ${label}`);
  assert(row.includes('First standalone mobile beta') && row.includes('import, trim, reorder, save &amp; export'), 'Mobile scope lists only its implemented core editing features');
  assert(row.toLowerCase().includes(install.toLowerCase()) && row.includes('limited mobile feature set'), 'Installation method and limited scope are explicit');
  assert(!/aria-disabled|platform-unavailable/.test(row), 'Actual native packages are not unavailable placeholders');
}
assert(html.includes('not the complete desktop toolset') && html.includes('not the Mac browser companion'), 'Native mobile beta is neither desktop parity nor the browser companion');
assert(html.includes('iPadOS 16+') && html.includes('Android 8.0+'), 'Mobile downloads state their supported minimum operating systems');
assert(html.includes('Desktop export up to 16K'), 'Desktop export capabilities are not promised for mobile');
assert(read('editor/assets/site.css').includes('.platform-mobile{flex-wrap:wrap}'), 'Long mobile feature/installation labels wrap within narrow cards');
const overview = read('video-editor/index.html');
const overviewSchema = JSON.parse(overview.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const software = overviewSchema['@graph'].find(item => item['@type'] === 'SoftwareApplication');
assert.equal(software.softwareVersion, '1.4 Beta 7', 'Public software overview describes the current beta');
assert.equal(software.releaseNotes, `${repositoryURL}/releases/tag/${releaseTag}`, 'Public structured release notes match the downloads');
assert(software.operatingSystem.includes('iPadOS 16+') && software.operatingSystem.includes('Android 8.0+'), 'Structured overview states mobile operating-system requirements');
assert(overview.includes(`${repositoryURL}/blob/${releaseTag}/MOBILE_RELEASE.md`), 'Public mobile installation notes link to this release source');
assert(overview.includes('do not include the complete desktop toolset') && overview.includes('Mobile project formats are not interchangeable'), 'Overview explains mobile feature and project-format limits');
assert(overview.includes('validated against the macOS 1.4 Beta 6 app'), 'Dated desktop tutorial validation retains its historical version context');

async function page({ fail = false, platform = 'Mac', userAgent = '', maxTouchPoints = 0 } = {}) {
  const nodes = new Map(), calls = [], windowHandlers = {};
  const platformIDs = { mac: '#platform', windows: '#platform-windows', linux: '#platform-linux', ipad: '#platform-ipad', android: '#platform-android' };
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const handlers = {}, classes = new Set();
    const n = {
      hidden: id.endsWith('-modal'), value: '', dataset: { platform: Object.keys(platformIDs).find(platform => platformIDs[platform] === id) || 'mac' },
      classList: {
        add(name) { classes.add(name); }, remove(name) { classes.delete(name); }, contains(name) { return classes.has(name); },
        toggle(name, force) { const add = force ?? !classes.has(name); if (add) classes.add(name); else classes.delete(name); return add; }
      },
      setAttribute() {}, hasAttribute(name) { return id === '#site-header' && name === 'data-shared-navigation'; },
      focus() { calls.push(['focus', id]); }, insertAdjacentHTML(position, content) { calls.push(['html', id, position, content]); }, contains() { return false; },
      querySelector(selector) {
        const match = selector.match(/^\[data-platform="(mac|windows|linux|ipad|android)"\]$/);
        return match ? node(platformIDs[match[1]]) : node(id + ' ' + selector);
      },
      querySelectorAll(selector) { return selector.includes('data-platform') ? Object.values(platformIDs).map(node) : []; },
      reset() { calls.push(['reset', id]); },
      addEventListener(type, fn) { (handlers[type] ||= []).push(fn); },
      async fire(type = 'click') {
        const event = { currentTarget: n, preventDefault() {} };
        for (const fn of handlers[type] || []) await fn(event);
        await tick(); await tick();
      }
    };
    nodes.set(id, n); return n;
  }
  const savedSession = { user: { email: 'remembered@example.invalid' } };
  const auth = {
    async getSession() { return { data: { session: savedSession } }; },
    onAuthStateChange(fn) { fn('SIGNED_IN', savedSession); },
    async signInWithPassword() { calls.push(['signin']); return { data: { session: savedSession } }; },
    async signUp() { calls.push(['signup']); return { data: { session: savedSession } }; }
  };
  const context = vm.createContext({
    document: {
      body: node('body'), querySelector: node, addEventListener() {},
      querySelectorAll(selector) {
        if (selector === '.download-link') return [node('#get-app')];
        if (selector === '[data-platform]') return Object.values(platformIDs).map(node);
        return [];
      }
    },
    window: { scrollY: 0, addEventListener(type, fn) { (windowHandlers[type] ||= []).push(fn); } },
    navigator: { platform, userAgent, maxTouchPoints }, setTimeout, clearTimeout
  });
  const dep = new vm.SyntheticModule(['supabase', 'authRedirect'], function () {
    this.setExport('supabase', { auth });
    this.setExport('authRedirect', 'https://video.netvistastudio.com/account/');
  }, { context });
  const source = new vm.SourceTextModule(siteSource, {
    context, importModuleDynamically: async () => {
      if (fail) throw Error('SDK unavailable');
      await dep.link(() => {}); await dep.evaluate(); return dep;
    }
  });
  await source.link(() => {}); await source.evaluate(); await tick(); await tick();
  return { node, auth, calls, restore() { windowHandlers.pageshow.forEach(fn => fn({ persisted: true })); } };
}

(async () => {
  for (const device of [
    { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X)', expected: 'mac' },
    { platform: 'Win32', userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)', expected: 'windows' },
    { platform: 'Linux x86_64', userAgent: 'Mozilla/5.0 (X11; Linux x86_64)', expected: 'linux' }
  ]) {
    const desktop = await page(device);
    for (const [platform, filename] of Object.entries(assets)) {
      const card = desktop.node(platform === 'mac' ? '#platform' : `#platform-${platform}`);
      assert.equal(card.href, `${repositoryURL}/releases/download/${releaseTag}/${filename}`, `${platform}: exact Beta 7 asset URL`);
      assert.equal(card.classList.contains('recommended'), platform === device.expected, 'Recommend only the matching desktop package');
    }
  }
  for (const device of [
    { platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 15; SAMSUNG SM-S938B) Mobile', expected: 'android', label: 'Samsung phone' },
    { platform: 'Linux armv8l', userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel Tablet)', expected: 'android', label: 'Android tablet' },
    { platform: 'iPad', userAgent: 'Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X)', maxTouchPoints: 5, expected: 'ipad', label: 'iPad mobile user agent' },
    { platform: 'MacIntel', userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18 Safari/605.1.15', maxTouchPoints: 5, expected: 'ipad', label: 'iPad desktop user agent' }
  ]) {
    const mobile = await page(device);
    for (const platform of Object.keys(assets)) {
      const card = mobile.node(platform === 'mac' ? '#platform' : `#platform-${platform}`);
      assert.equal(card.classList.contains('recommended'), platform === device.expected, `${device.label}: recommend only the correct native mobile package`);
      assert.equal(card.href, `${repositoryURL}/releases/download/${releaseTag}/${assets[platform]}`, 'All packages use the exact Beta 7 asset URLs');
    }
    assert(!mobile.node('#account-gate-modal').hidden && mobile.node('#download-modal').hidden, 'Mobile still requires fresh login even with a saved session');
    await mobile.node('#gate-signin-form').fire('submit');
    await mobile.node('#get-app').fire();
    assert(!mobile.node('#download-modal').hidden, `${device.label}: fresh login permits the download chooser`);
    assert(mobile.calls.some(call => call[0] === 'focus' && call[1] === `#platform-${device.expected}`), 'Mobile chooser focuses the correct native package');
    assert(!mobile.calls.some(call => call[0] === 'focus' && ['#platform', '#platform-windows', '#platform-linux'].includes(call[1])), 'Mobile detection never focuses a desktop package');
    await mobile.node(`#platform-${device.expected}`).fire();
    assert(mobile.node('#download-modal').hidden, 'Native mobile download uses the same one-shot chooser lifecycle');
    mobile.restore();
    assert(!mobile.node('#account-gate-modal').hidden && mobile.node('#download-modal').hidden, 'Restored mobile pages require a new login');
  }
  const iphone = await page({ platform: 'iPhone', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', maxTouchPoints: 5 });
  for (const platform of Object.keys(assets)) assert(!iphone.node(platform === 'mac' ? '#platform' : `#platform-${platform}`).classList.contains('recommended'), 'iPhone is not misidentified as iPadOS or macOS');
  await iphone.node('#gate-signin-form').fire('submit'); await iphone.node('#get-app').fire();
  assert(iphone.calls.some(call => call[0] === 'focus' && call[1].endsWith('[data-close-download]')), 'Unsupported mobile devices start on the chooser close button');
  const p = await page();
  const gate = p.node('#account-gate-modal'), chooser = p.node('#download-modal');
  assert(!gate.hidden && chooser.hidden, 'Entry requires login even with a saved session');
  await p.node('#gate-signin-form').fire('submit');
  assert(gate.hidden && chooser.hidden, 'Fresh login opens the page, not downloads');
  await p.node('#get-app').fire();
  assert(!chooser.hidden, 'Download opens platform choices without another login');
  await p.node('#platform').fire();
  assert(chooser.hidden, 'Choosing a platform consumes this download flow');
  await p.node('#get-app').fire();
  assert(gate.hidden && !chooser.hidden, 'Second download reuses page access');
  p.restore();
  assert(!gate.hidden && chooser.hidden, 'Restored page requires login');
  p.auth.signInWithPassword = async () => ({ data: {}, error: Error('Wrong password') });
  await p.node('#gate-signin-form').fire('submit');
  assert(!gate.hidden && chooser.hidden, 'Old session cannot bypass a failed login');
  await p.node('#gate-signup-form').fire('submit');
  assert(gate.hidden && chooser.hidden, 'Fresh signup opens the page');
  p.restore();
  assert(chooser.hidden, 'Browser back cannot restore an unlocked chooser');
  await p.node('#get-app').fire();
  let finish;
  p.auth.signInWithPassword = () => new Promise(resolve => { finish = resolve; });
  const pending = p.node('#gate-signin-form').fire('submit');
  await tick();
  p.restore();
  await p.node('#get-app').fire();
  finish({ data: { session: { user: {} } } });
  await pending;
  assert(!gate.hidden && chooser.hidden, 'Cancelled login cannot unlock a later request');
  const broken = await page({ fail: true });
  await broken.node('#get-app').fire();
  assert(broken.node('#download-modal').hidden, 'SDK failure keeps downloads closed');
  console.log('PASS: exact Beta 7 desktop/IPA/APK URLs, honest limited mobile scope, Android/iPad native recommendations, unsupported iPhone handling, fresh mobile/desktop entry gate, repeat download, failed login, signup, browser back, cancelled request, SDK failure.');
})().catch(error => { console.error(error); process.exitCode = 1; });
