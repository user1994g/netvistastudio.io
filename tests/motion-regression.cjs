// Optional public-page motion must remain a no-risk progressive enhancement.
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/studio-motion.js'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../assets/css/studio-motion.css'), 'utf8');

function node({ top = 1200, classes = [], hidden = false, form = false, text = '' } = {}) {
  const values = new Set(classes), attrs = new Map();
  return {
    textContent: text, attrs,
    classList: { contains: value => values.has(value), add: value => values.add(value), remove: value => values.delete(value) },
    setAttribute: (name, value) => attrs.set(name, value),
    closest: selector => (form && selector.includes('form') || hidden && selector.includes('[hidden]')) ? {} : null,
    getClientRects: () => hidden ? [] : [{}],
    getBoundingClientRect: () => ({ top }),
    querySelectorAll: () => []
  };
}
function setup({ classes = ['nv-site'], hostname = 'netvistastudio.com', reduced = false, matchMedia = true,
  io = true, fail = false, candidates = [], arrows = [] } = {}) {
  const body = node({ classes });
  body.querySelectorAll = selector => selector.startsWith('.button-primary') ? arrows : candidates;
  const listeners = new Map(), observes = [], unobserves = [];
  const media = { matches: reduced, addEventListener: (type, callback) => listeners.set(type, callback),
    removeEventListener: (type, callback) => { if (listeners.get(type) === callback) listeners.delete(type); } };
  let callback, disconnected = 0, created = 0;
  const window = { location: { hostname }, innerHeight: 800 };
  if (matchMedia) window.matchMedia = () => media;
  if (io) window.IntersectionObserver = class {
    constructor(fn, options) { created++; if (fail) throw Error('Unavailable observer'); callback = fn; assert.equal(options.threshold, .08); }
    observe(value) { observes.push(value); }
    unobserve(value) { unobserves.push(value); }
    disconnect() { disconnected++; }
  };
  vm.runInNewContext(source, { document: { body }, window, Set });
  return { body, media, listeners, observes, unobserves, created: () => created, disconnected: () => disconnected,
    intersect(target, visible = true) { callback?.([{ target, isIntersecting: visible }]); },
    reduce() { media.matches = true; listeners.get('change')?.({ matches: true }); } };
}

const first = node(), second = node({ top: 2400 }), initial = node({ top: 300 });
const hidden = node({ hidden: true }), form = node({ form: true });
const external = node({ text: '↗' }), down = node({ text: '↓' }), right = node({ text: '→' });
const play = node({ text: '▶' }), formArrow = node({ text: '↗', form: true });
const state = setup({ candidates: [first, initial, second, hidden, form], arrows: [external, down, right, play, formArrow] });
assert.deepEqual(state.observes, [first, second], 'Only below-fold visible non-form nodes are observed');
assert(!first.classList.contains('nv-entered'), 'Waiting nodes remain entirely unmodified');
assert.equal(external.attrs.get('data-nv-arrow'), 'external');
assert.equal(down.attrs.get('data-nv-arrow'), 'down');
assert.equal(right.attrs.get('data-nv-arrow'), 'right');
assert(!play.attrs.size && !formArrow.attrs.size, 'Playback icons and form controls are not enhanced');
state.intersect(first, false);
assert(!first.classList.contains('nv-entered'));
state.intersect(first);
assert(first.classList.contains('nv-entered'));
assert.deepEqual(state.unobserves, [first]);
state.intersect(first);
assert.equal(state.unobserves.length, 1, 'Repeated observer callbacks cannot restart entrances');
state.intersect(second);
assert.equal(state.disconnected(), 1, 'Observer disconnects after finite work');
assert.equal(state.listeners.size, 0, 'Completed work removes preference listener');

for (const config of [
  { classes: [] }, { classes: ['nv-site', 'account-page'] }, { classes: ['nv-site', 'editor-locked'] },
  { classes: ['nv-site', 'videos-site'] }, { hostname: 'video.netvistastudio.com' },
  { reduced: true }, { matchMedia: false }
]) {
  const icon = node({ text: '↗' }), candidate = node();
  const skipped = setup({ ...config, arrows: [icon], candidates: [candidate] });
  assert.equal(skipped.created(), 0, 'Excluded pages/preferences perform no observer work');
  assert(!icon.attrs.size && !candidate.classList.contains('nv-entered'));
}
const noObserver = node();
assert.equal(setup({ io: false, candidates: [noObserver] }).created(), 0);
assert(!noObserver.classList.contains('nv-entered'), 'No-IO path leaves content visible');
const unsupported = node();
assert.doesNotThrow(() => setup({ fail: true, candidates: [unsupported] }));
assert(!unsupported.classList.contains('nv-entered'), 'API failure leaves content visible');
const changingFirst = node(), changingNext = node();
const changed = setup({ candidates: [changingFirst, changingNext] });
changed.intersect(changingFirst); changed.reduce();
assert(!changingFirst.classList.contains('nv-entered') && !changingNext.classList.contains('nv-entered'));
assert.equal(changed.disconnected(), 1);
assert.equal(changed.listeners.size, 0);
changed.intersect(changingNext);
assert(!changingNext.classList.contains('nv-entered'), 'Reduced-motion change prevents later entrances');
assert.equal(setup({ candidates: Array.from({ length: 60 }, () => node()) }).observes.length, 32, 'Enhancement has a bounded work budget');
assert.equal(setup({ candidates: [node({ top: -40 }), node({ top: 70 })] }).created(), 0, 'Deep-link/restore viewport content is not animated');

assert(!/preventDefault|stopPropagation|setInterval|requestAnimationFrame|fetch\(|localStorage|sessionStorage|innerHTML/.test(source), 'Motion must not intercept controls, run loops or touch user data');
assert(!/addEventListener\(['"](?:scroll|mousemove|pointermove|touchmove)/.test(source), 'No continuous input listeners');
assert(/prefers-reduced-motion:\s*reduce/.test(css) && /transition:\s*none\s*!important/.test(css) && /transform:\s*none\s*!important/.test(css));
assert(/:focus-visible/.test(css) && /\[aria-disabled="true"\]/.test(css) && /:active/.test(css), 'Keyboard, pressed and disabled states are explicit');
const declarations = css.replace(/\/\*[\s\S]*?\*\//g, '');
assert(!/opacity\s*:\s*0(?:\s|;|\})|visibility\s*:\s*hidden|display\s*:\s*none|will-change\s*:/.test(declarations), 'No hidden-content fallback or persistent compositing');
assert(/@media \(hover: hover\) and \(pointer: fine\)/.test(css), 'Hover-only image effects are reserved for precise pointers');
assert(/@media print/.test(css), 'Print stays static and readable');
console.log('PASS: motion fallbacks, finite observers, exclusions, reduced motion and interaction states');
