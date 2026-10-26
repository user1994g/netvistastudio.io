'use strict';

// Dependency-free interaction checks. Browser/layout QA remains a separate step.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(__dirname, '..', 'fibre-concept');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'assets/fibre.js'), 'utf8');
let checks = 0;
function check(name, action) {
  action();
  checks += 1;
  console.log(`PASS ${name}`);
}

class EventTarget {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(listener);
  }
  removeEventListener(type, listener) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(item => item !== listener));
  }
  dispatchEvent(event) {
    event.target ||= this;
    event.currentTarget = this;
    event.preventDefault ||= () => { event.defaultPrevented = true; };
    event.stopPropagation ||= () => { event.stopped = true; };
    for (const listener of this.listeners.get(event.type) || []) listener.call(this, event);
    if (event.bubbles && !event.stopped && this.parentNode) this.parentNode.dispatchEvent(event);
    return !event.defaultPrevented;
  }
}

function attributes(raw) {
  const result = {};
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let match;
  while ((match = pattern.exec(raw))) result[match[1].toLowerCase()] = match[2] ?? match[3] ?? match[4] ?? '';
  return result;
}

class Element extends EventTarget {
  constructor(tagName, attrs = {}, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.attrs = attrs;
    this.ownerDocument = ownerDocument;
    this.children = [];
    this.dataset = {};
    this.textContent = '';
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.value = attrs.value ?? '';
    for (const [key, value] of Object.entries(attrs)) {
      if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    }
    const classes = new Set((attrs.class || '').split(/\s+/).filter(Boolean));
    this.classList = {
      add: (...items) => items.forEach(item => classes.add(item)),
      remove: (...items) => items.forEach(item => classes.delete(item)),
      contains: item => classes.has(item),
      toggle: (item, force) => {
        const add = force === undefined ? !classes.has(item) : Boolean(force);
        if (add) classes.add(item); else classes.delete(item);
        return add;
      }
    };
  }
  get id() { return this.attrs.id || ''; }
  get hidden() { return this.hasAttribute('hidden'); }
  set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
  get inert() { return this.hasAttribute('inert'); }
  set inert(value) { if (value) this.setAttribute('inert', ''); else this.removeAttribute('inert'); }
  get disabled() { return this.hasAttribute('disabled'); }
  set disabled(value) { if (value) this.setAttribute('disabled', ''); else this.removeAttribute('disabled'); }
  getAttribute(name) { return Object.hasOwn(this.attrs, name) ? this.attrs[name] : null; }
  hasAttribute(name) { return Object.hasOwn(this.attrs, name); }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  removeAttribute(name) { delete this.attrs[name]; }
  focus() { this.ownerDocument.activeElement = this; }
  scrollIntoView() {}
  contains(node) { return this === node || this.children.some(child => child.contains(node)); }
  matches(selector) {
    let candidate = selector.trim();
    const negatives = [...candidate.matchAll(/:not\(([^)]+)\)/g)].map(match => match[1]);
    if (negatives.some(item => this.matches(item))) return false;
    candidate = candidate.replace(/:not\([^)]+\)/g, '');
    const tag = candidate.match(/^[a-z][\w-]*/i)?.[0];
    if (tag && this.tagName !== tag.toUpperCase()) return false;
    const id = candidate.match(/#([\w-]+)/)?.[1];
    if (id && this.id !== id) return false;
    for (const match of candidate.matchAll(/\.([\w-]+)/g)) if (!this.classList.contains(match[1])) return false;
    for (const match of candidate.matchAll(/\[([\w-]+)(?:(\^?=)["']?([^\]"']+)["']?)?\]/g)) {
      if (!this.hasAttribute(match[1])) return false;
      if (match[2] === '=' && this.getAttribute(match[1]) !== match[3]) return false;
      if (match[2] === '^=' && !this.getAttribute(match[1]).startsWith(match[3])) return false;
    }
    return true;
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest?.(selector) || null; }
  querySelectorAll(selector) {
    const branches = selector.split(',');
    const found = [];
    const walk = node => {
      for (const child of node.children) {
        if (branches.some(item => child.matches(item))) found.push(child);
        walk(child);
      }
    };
    walk(this);
    return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  click() { if (!this.disabled) this.dispatchEvent({ type: 'click', bubbles: true }); }
}

function createHarness() {
  const document = new EventTarget();
  document.children = [];
  document.readyState = 'complete';
  document.querySelectorAll = selector => Element.prototype.querySelectorAll.call(document, selector);
  document.querySelector = selector => document.querySelectorAll(selector)[0] || null;
  document.getElementById = id => document.querySelector(`#${id}`);
  document.activeElement = null;
  const stack = [document];
  const voidTags = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
  const tokens = html.replace(/<!--[^]*?-->/g, '').match(/<[^>]+>|[^<]+/g) || [];
  for (const token of tokens) {
    const end = token.match(/^<\/([a-z][\w-]*)/i);
    if (end) {
      while (stack.length > 1) { if (stack.pop().tagName === end[1].toUpperCase()) break; }
      continue;
    }
    const opening = token.match(/^<([a-z][\w-]*)([^]*?)\/?\s*>$/i);
    if (opening) {
      const element = new Element(opening[1], attributes(opening[2]), document);
      const parent = stack.at(-1);
      element.parentNode = parent;
      parent.children.push(element);
      if (!voidTags.has(opening[1].toLowerCase()) && !token.endsWith('/>')) stack.push(element);
    } else if (!token.startsWith('<')) {
      for (const ancestor of stack) if (ancestor instanceof Element) ancestor.textContent += token;
    }
  }
  document.documentElement = document.querySelector('html');
  document.body = document.querySelector('body');
  for (const select of document.querySelectorAll('select')) {
    const options = select.querySelectorAll('option');
    select.value = (options.find(item => item.hasAttribute('selected')) || options[0])?.value || '';
  }
  const window = new EventTarget();
  window.innerWidth = 390;
  window.scrollTo = () => {};
  window.matchMedia = query => ({
    media: query, matches: query.includes('min-width') ? window.innerWidth >= 801 : false,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}
  });
  let timer = 0;
  const sandbox = { document, window, console, URL, Math, Number, String, Intl,
    setTimeout: callback => { callback(); return ++timer; }, clearTimeout() {},
    requestAnimationFrame: callback => { callback(); return ++timer; }, cancelAnimationFrame() {},
    matchMedia: window.matchMedia,
    fetch() { throw new Error('Unexpected network request'); }
  };
  window.document = document;
  window.requestAnimationFrame = sandbox.requestAnimationFrame;
  window.setTimeout = sandbox.setTimeout;
  vm.runInNewContext(source, sandbox, { filename: 'fibre.js', timeout: 1000 });
  document.dispatchEvent({ type: 'DOMContentLoaded' });
  const byId = id => { const item = document.getElementById(id); assert.ok(item, `Missing #${id}`); return item; };
  const key = (target, value, shiftKey = false) => target.dispatchEvent({ type: 'keydown', key: value, shiftKey, bubbles: true });
  return { document, window, byId, key };
}

check('initial HTML gates all site content behind the fictional-ISP notice', () => {
  const { byId } = createHarness();
  const gate = byId('concept-gate');
  assert.equal(gate.hidden, false);
  assert.equal(gate.getAttribute('role'), 'dialog');
  assert.equal(gate.getAttribute('aria-modal'), 'true');
  assert.match(gate.textContent, /not\s*a real ISP/i);
  assert.equal(byId('site-content').hidden, true);
  assert.equal(byId('site-content').inert, true);
});

check('without JavaScript, the page stays hidden and acknowledgement stays disabled', () => {
  assert.match(html, /<[^>]*\bid=["']site-content["'][^>]*\bhidden\b[^>]*>/i);
  assert.match(html, /<[^>]*\bid=["']enter-concept["'][^>]*\bdisabled\b[^>]*>/i);
  assert.match(html, /<noscript[\s>]/i);
});

check('explicit acknowledgement reveals the site and moves keyboard focus', () => {
  const { document, byId } = createHarness();
  assert.equal(byId('enter-concept').disabled, false);
  byId('enter-concept').click();
  assert.equal(byId('concept-gate').hidden, true);
  assert.equal(byId('site-content').hidden, false);
  assert.equal(byId('site-content').inert, false);
  assert.equal(document.activeElement, byId('page-title'));
});

check('notice can reopen, traps keyboard focus, and cannot escape-dismiss', () => {
  const { document, byId, key } = createHarness();
  byId('enter-concept').click();
  byId('reopen-notice').click();
  const gate = byId('concept-gate');
  assert.equal(gate.hidden, false);
  assert.equal(byId('site-content').inert, true);
  const focusable = gate.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])');
  assert.ok(focusable.length >= 2);
  const first = focusable[0], last = focusable.at(-1);
  last.focus(); key(last, 'Tab');
  assert.equal(document.activeElement, first);
  first.focus(); key(first, 'Tab', true);
  assert.equal(document.activeElement, last);
  key(last, 'Escape');
  assert.equal(gate.hidden, false);
});

check('full reload and back/forward restore require a fresh acknowledgement', () => {
  const { window, byId } = createHarness();
  byId('enter-concept').click();
  window.dispatchEvent({ type: 'pageshow', persisted: true });
  assert.equal(byId('concept-gate').hidden, false);
  assert.equal(byId('site-content').hidden, true);
  const fresh = createHarness();
  assert.equal(fresh.byId('concept-gate').hidden, false);
});

check('mobile menu state closes on Escape, link activation and desktop resize', () => {
  const { document, window, byId, key } = createHarness();
  byId('enter-concept').click();
  const toggle = byId('menu-toggle');
  assert.equal(toggle.getAttribute('aria-controls'), 'primary-nav');
  toggle.click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'true');
  key(document, 'Escape');
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  toggle.click();
  byId('primary-nav').querySelector('a[href]').click();
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
  toggle.click();
  window.innerWidth = 1200;
  window.dispatchEvent({ type: 'resize' });
  assert.equal(toggle.getAttribute('aria-expanded'), 'false');
});

check('transfer calculator uses the advertised theoretical formula', () => {
  const { byId } = createHarness();
  const file = byId('file-size'), speed = byId('connection-speed'), output = byId('transfer-time');
  assert.equal(file.value, '10');
  assert.equal(speed.value, '1000');
  assert.equal(speed.getAttribute('min'), '500');
  assert.equal(speed.getAttribute('max'), '20000');
  assert.equal(speed.getAttribute('step'), '500');
  assert.equal(output.textContent.trim(), '1 min 20 sec');
  file.value = '100'; file.dispatchEvent({ type: 'change' });
  assert.equal(output.textContent.trim(), '13 min 20 sec');
  file.value = '1'; file.dispatchEvent({ type: 'change' });
  assert.equal(output.textContent.trim(), '8 sec');
  file.value = '10'; file.dispatchEvent({ type: 'change' });
  speed.value = '20000'; speed.dispatchEvent({ type: 'input' });
  assert.equal(output.textContent.trim(), '4 sec');
  file.value = '100'; file.dispatchEvent({ type: 'change' });
  assert.equal(output.textContent.trim(), '40 sec');
  speed.value = '500'; speed.dispatchEvent({ type: 'input' });
  assert.equal(output.textContent.trim(), '26 min 40 sec');
});

check('speed presets update the slider, estimate and pressed states together', () => {
  const { document, byId } = createHarness();
  const presets = document.querySelectorAll('[data-speed]');
  assert.equal(presets.length, 4);
  assert.deepEqual(presets.map(button => button.dataset.speed), ['500', '1000', '2000', '20000']);
  const fastest = presets.find(button => button.dataset.speed === '20000');
  fastest.click();
  assert.equal(byId('connection-speed').value, '20000');
  assert.equal(byId('transfer-time').textContent.trim(), '4 sec');
  assert.equal(fastest.getAttribute('aria-pressed'), 'true');
  assert.equal(presets.filter(button => button.getAttribute('aria-pressed') === 'true').length, 1);
  assert.match(byId('connection-speed').getAttribute('aria-valuetext'), /20,000.*illustrative/);
});

check('each fictional plan updates the calculator without placing an order', () => {
  const { document, byId } = createHarness();
  const plans = document.querySelectorAll('[data-plan-speed]');
  const status = byId('selected-plan-status');
  assert.equal(status.getAttribute('role'), 'status');
  assert.equal(status.textContent, '1 Gig concept selected. Nothing has been ordered.');
  assert.equal(plans.length, 4);
  assert.deepEqual(plans.map(button => button.dataset.planSpeed), ['500', '1000', '2000', '20000']);
  const expected = {
    '500': ['500 Mbps', '2 min 40 sec'],
    '1000': ['1 Gig', '1 min 20 sec'],
    '2000': ['2 Gig', '40 sec'],
    '20000': ['20 Gig', '4 sec']
  };
  for (const button of plans) {
    const mbps = button.dataset.planSpeed;
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.getAttribute('type'), 'button');
    assert.equal(button.getAttribute('aria-controls'), 'play');
    assert.equal(button.dataset.planId, mbps);
    button.click();
    assert.equal(byId('connection-speed').value, mbps);
    assert.equal(byId('transfer-time').textContent.trim(), expected[mbps][1]);
    assert.equal(status.textContent, `${expected[mbps][0]} concept selected. Nothing has been ordered.`);
    assert.equal(plans.filter(item => item.getAttribute('aria-pressed') === 'true').length, 1);
    assert.equal(button.getAttribute('aria-pressed'), 'true');
  }
  const speed = byId('connection-speed');
  speed.value = '1500'; speed.dispatchEvent({ type: 'input' });
  assert.equal(plans.filter(item => item.getAttribute('aria-pressed') === 'true').length, 0);
  assert.equal(status.textContent, 'Custom speed illustration selected. Nothing has been ordered.');
  speed.value = '2000'; speed.dispatchEvent({ type: 'input' });
  assert.equal(status.textContent, '2 Gig concept selected. Nothing has been ordered.');
});

check('calculator clamps unexpected input instead of emitting NaN or markup', () => {
  const { byId } = createHarness();
  const file = byId('file-size'), speed = byId('connection-speed'), output = byId('transfer-time');
  file.value = '<img src=x onerror=alert(1)>';
  speed.value = 'not-a-number';
  speed.dispatchEvent({ type: 'input' });
  assert.equal(output.textContent.trim(), '1 min 20 sec');
  assert.equal(byId('transfer-detail').textContent, 'For 10 GB at 1,000 Mbps.');
  speed.value = '-500'; speed.dispatchEvent({ type: 'input' });
  assert.equal(output.textContent.trim(), '2 min 40 sec');
  speed.value = '99999'; speed.dispatchEvent({ type: 'input' });
  assert.equal(output.textContent.trim(), '4 sec');
});

check('concept does not collect accounts, analytics, orders or payment data', () => {
  assert.doesNotMatch(html, /<form[\s>]/i);
  assert.doesNotMatch(html, /<script[^>]+src=["'](?:https?:)?\/\//i);
  assert.doesNotMatch(html, /<link[^>]+rel=["']stylesheet["'][^>]+href=["'](?:https?:)?\/\//i);
  assert.doesNotMatch(source, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|document\.cookie|serviceWorker/);
  assert.match(html, /concept|fictional/i);
  assert.match(html, /not a speed test|not an actual speed test|not measuring your connection/i);
  const { document } = createHarness();
  for (const link of document.querySelectorAll('a[href]')) {
    assert.doesNotMatch(link.getAttribute('href'), /checkout|payment|stripe\.com|paypal\.com/i);
  }
});

console.log(`\n${checks} fibre concept checks passed.`);
