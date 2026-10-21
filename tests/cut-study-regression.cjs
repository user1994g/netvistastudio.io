'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../assets/studio-cut-study.js'), 'utf8');

function node(extra = {}) {
  return {
    attrs: {}, dataset: {}, listeners: new Map(), disabled: true, textWrites: [], _text: '',
    get textContent() { return this._text; },
    set textContent(value) { this._text = String(value); this.textWrites.push(this._text); },
    setAttribute(name, value) { this.attrs[name] = String(value); },
    addEventListener(name, callback) {
      const callbacks = this.listeners.get(name) || [];
      callbacks.push(callback);
      this.listeners.set(name, callbacks);
    },
    dispatch(name) { (this.listeners.get(name) || []).forEach(callback => callback({ type: name })); },
    ...extra
  };
}
function setup({ noRoot = false, missing = '', brokenShot = '', raf = true } = {}) {
  const image = node({ src: '/assets/images/creative/coast-1280.jpg' });
  const title = node(), input = node({ value: 'Somewhere new.' }), scrub = node({ value: '0' });
  const time = node(), play = node(), reverse = node(), status = node(), position = node();
  const buttons = ['coast', 'petals', 'world'].map(key => {
    const number = node(), name = node();
    return node({ dataset: { cutShot: key }, number, name,
      querySelector: selector => selector === '[data-cut-number]' ? number : selector === '[data-cut-name]' ? name : null });
  });
  if (brokenShot === 'unknown') buttons[2].dataset.cutShot = 'unexpected';
  if (brokenShot === 'duplicate') buttons[2].dataset.cutShot = 'coast';
  if (brokenShot === 'number') buttons[2].querySelector = () => null;
  const strip = node({ children: [...buttons],
    querySelectorAll: () => buttons,
    appendChild(child) { this.children = this.children.filter(value => value !== child); this.children.push(child); return child; }
  });
  const nodes = {
    '[data-cut-image]': image, '[data-cut-title]': title, '[data-cut-title-input]': input,
    '[data-cut-scrub]': scrub, '[data-cut-time]': time, '[data-cut-play]': play,
    '[data-cut-reverse]': reverse, '[data-cut-strip]': strip, '[data-cut-status]': status,
    '[data-cut-position]': position
  };
  const study = node({ style: { values: {}, setProperty(name, value) { this.values[name] = value; } },
    querySelector: selector => selector === missing ? null : nodes[selector] || null });
  const document = node({ hidden: false, querySelector: () => noRoot ? null : study });
  const window = node(), pending = new Map(), cancelled = [], callbacks = new Map();
  let nextHandle = 0, requests = 0, networkCalls = 0;
  if (raf) {
    window.requestAnimationFrame = callback => {
      const handle = ++nextHandle;
      requests++;
      pending.set(handle, callback);
      callbacks.set(handle, callback);
      assert(pending.size <= 1, 'At most one animation callback may be pending');
      return handle;
    };
    window.cancelAnimationFrame = handle => { cancelled.push(handle); pending.delete(handle); };
  }
  const denied = () => { networkCalls++; throw Error('No remote or persistent APIs belong in this study'); };
  const context = { document, window, fetch: denied, XMLHttpRequest: denied, WebSocket: denied };
  Object.defineProperty(context, 'localStorage', { get: denied });
  Object.defineProperty(context, 'sessionStorage', { get: denied });
  vm.runInNewContext(source, context);
  return { image, title, input, scrub, time, play, reverse, strip, status, position, buttons, nodes, study,
    document, window, pending, cancelled, callbacks, controls: [input, scrub, play, reverse, ...buttons],
    requests: () => requests, networkCalls: () => networkCalls,
    rerun: () => vm.runInNewContext(source, context),
    tick(timestamp) {
      const batch = [...pending];
      pending.clear();
      batch.forEach(([, callback]) => callback(timestamp));
    },
    seek(value) { scrub.value = String(value); scrub.dispatch('input'); }
  };
}

const study = setup();
assert(study.controls.every(control => !control.disabled), 'Only fully initialized controls are enabled');
assert.equal(study.study.dataset.cutReady, 'true');
assert.equal(study.study.dataset.cutPlaying, 'false');
assert.equal(study.study.dataset.cutComplete, 'false');
assert.equal(study.study.dataset.cutCurrent, 'coast');
assert.equal(study.pending.size, 0, 'The study never autoplays');
assert.equal(study.requests(), 0, 'Static initialization has no animation loop');
assert.equal(study.title.textContent, 'Somewhere new.');
assert.equal(study.input.maxLength, 40);
assert.equal(study.time.textContent, '00:00:00');
assert.equal(study.time.attrs['aria-live'], 'off', 'The visual timecode never becomes a frame-by-frame live region');
assert.equal(study.play.textContent, 'Play your cut');
assert.equal(study.play.attrs['aria-label'], 'Play your cut');
assert.equal(study.buttons[0].attrs['aria-pressed'], 'true');
assert.equal(study.buttons[1].attrs['aria-pressed'], 'false');
assert.equal(study.scrub.attrs['aria-valuetext'], '00:00:00, shot 1 of 3: The coast');
assert.equal(study.study.style.values['--cut-progress'], '0%');
assert.equal(study.status.textWrites.length, 0, 'Initialization does not announce an unsolicited status');

study.play.dispatch('click');
assert.equal(study.pending.size, 1);
assert.equal(study.play.textContent, 'Pause your cut');
assert.equal(study.study.dataset.cutPlaying, 'true');
const playingAnnouncements = study.status.textWrites.length;
study.tick(1000);
assert.equal(Number(study.scrub.value), 0, 'The first animation timestamp establishes the playback origin');
study.tick(2000);
assert.equal(Number(study.scrub.value), 1);
study.tick(3000);
assert.equal(Number(study.scrub.value), 2);
assert.equal(study.study.dataset.cutCurrent, 'petals', 'An exact cut boundary shows the next shot');
assert.equal(study.buttons[1].attrs['aria-pressed'], 'true');
assert.equal(study.image.src, '/assets/images/creative/petals-960.jpg');
assert.equal(study.status.textWrites.length, playingAnnouncements, 'Animation frames never chatter in the live region');
const pauseHandle = [...study.pending.keys()][0];
study.play.dispatch('click');
assert.equal(study.pending.size, 0);
assert(study.cancelled.includes(pauseHandle), 'Pause cancels the pending animation');
assert.equal(Number(study.scrub.value), 2);
assert.equal(study.play.textContent, 'Play your cut');
study.play.dispatch('click');
study.tick(20000);
assert.equal(Number(study.scrub.value), 2, 'Resume does not include the paused wall-clock interval');
study.tick(21000);
assert.equal(Number(study.scrub.value), 3);
study.tick(25000);
assert.equal(Number(study.scrub.value), 6, 'Playback clamps to its six-second duration');
assert.equal(study.study.dataset.cutCurrent, 'world', 'Completion keeps the final frame');
assert.equal(study.study.dataset.cutPlaying, 'false');
assert.equal(study.study.dataset.cutComplete, 'true');
assert.equal(study.time.textContent, '00:06:00');
assert.equal(study.play.textContent, 'Play again');
assert.equal(study.play.attrs['aria-label'], 'Play again');
assert.equal(study.pending.size, 0, 'Completion has no remaining animation work');
assert.match(study.status.textContent, /complete/);
study.play.dispatch('click');
assert.equal(Number(study.scrub.value), 0, 'Play again restarts from the first frame');
study.tick(50000); study.tick(56000);
assert.equal(study.pending.size, 0, 'A replay also finishes finitely');

const seek = setup();
for (const [value, expected, current] of [
  [-5, 0, 'coast'], [1.99, 1.99, 'coast'], [2, 2, 'petals'], [3.99, 3.99, 'petals'],
  [4, 4, 'world'], [6, 6, 'world'], [99, 6, 'world'], ['not a number', 0, 'coast'], [Infinity, 0, 'coast']
]) {
  seek.seek(value);
  assert.equal(Number(seek.scrub.value), expected, `Scrub bounds: ${value}`);
  assert.equal(seek.study.dataset.cutCurrent, current, `Shot selection at ${value}`);
}
seek.seek(1.5);
assert.equal(seek.time.textContent, '00:01:12', 'The timecode uses 24 frames per second');
assert.equal(seek.status.textWrites.length, 1, 'Scrubbing clears stale playback/completion text once, without repeated live-region chatter');
assert.equal(seek.status.textContent, 'Scrub to find a moment, or play your cut.');
assert.equal(seek.requests(), 0, 'Scrubbing does not start playback');
seek.play.dispatch('click');
const scrubHandle = [...seek.pending.keys()][0];
seek.seek(4);
assert.equal(seek.pending.size, 0, 'Scrubbing pauses playback');
assert(seek.cancelled.includes(scrubHandle));
seek.buttons[1].dispatch('click');
assert.equal(Number(seek.scrub.value), 2, 'Shot buttons jump to the corresponding shot start');
assert.match(seek.status.textContent, /Shot 2: The detail/);

const reversed = setup();
const originalNodes = [...reversed.strip.children];
reversed.play.dispatch('click'); reversed.tick(0); reversed.tick(3000);
const reverseHandle = [...reversed.pending.keys()][0];
reversed.reverse.dispatch('click');
assert.deepEqual(reversed.strip.children, [...originalNodes].reverse(), 'Reverse changes real DOM order using the same button objects');
assert(reversed.cancelled.includes(reverseHandle), 'Reverse cancels playback');
assert.equal(reversed.pending.size, 0, 'Reverse never autoplays');
assert.equal(Number(reversed.scrub.value), 0);
assert.equal(reversed.study.dataset.cutCurrent, 'world');
assert.equal(reversed.strip.children[0].number.textContent, '01');
assert.equal(reversed.strip.children[0].attrs['aria-pressed'], 'true');
assert.match(reversed.strip.children[0].attrs['aria-label'], /^01 Elsewhere/);
assert.equal(reversed.scrub.attrs['aria-valuetext'], '00:00:00, shot 1 of 3: Elsewhere');
assert.match(reversed.status.textContent, /Order reversed/);
reversed.buttons[0].dispatch('click');
assert.equal(Number(reversed.scrub.value), 4, 'Shot button destinations follow the new sequence');
assert.equal(reversed.position.textContent, '03 / THE COAST');
reversed.reverse.dispatch('click');
assert.deepEqual(reversed.strip.children, originalNodes, 'Reversing twice restores the original sequence');
assert.equal(reversed.study.dataset.cutCurrent, 'coast');
assert.equal(reversed.pending.size, 0);

const titled = setup();
for (const [value, expected] of [
  ['<img src=x onerror=alert(1)>', '<img src=x onerror=alert(1)>'],
  ['  A quiet place  ', '  A quiet place  '], ['   ', 'Somewhere new.'], ['', 'Somewhere new.'],
  ['x'.repeat(60), 'x'.repeat(40)]
]) {
  titled.input.value = value; titled.input.dispatch('input');
  assert.equal(titled.title.textContent, expected, 'An untrusted title is bounded plain text, with spaces preserved while typing');
}
assert.equal(titled.input.value.length, 40, 'Programmatic over-length input is also bounded');
assert.equal(titled.requests(), 0, 'Title input never starts playback');
assert.equal(titled.networkCalls(), 0);

const hidden = setup();
hidden.play.dispatch('click'); hidden.tick(0); hidden.tick(1000);
const beforeHideStatus = hidden.status.textWrites.length;
const hiddenHandle = [...hidden.pending.keys()][0];
hidden.document.hidden = true; hidden.document.dispatch('visibilitychange');
assert(hidden.cancelled.includes(hiddenHandle));
assert.equal(hidden.pending.size, 0, 'A hidden document stops all playback work');
assert.equal(hidden.study.dataset.cutPlaying, 'false');
assert.equal(hidden.status.textWrites.length, beforeHideStatus, 'Visibility changes are not unsolicited announcements');
hidden.document.hidden = false; hidden.document.dispatch('visibilitychange');
assert.equal(hidden.pending.size, 0, 'Returning to the page does not resume automatically');
hidden.play.dispatch('click'); hidden.tick(100000);
assert.equal(Number(hidden.scrub.value), 1, 'Playback after a hidden interval has a fresh timing origin');
const pageHandle = [...hidden.pending.keys()][0];
hidden.window.dispatch('pagehide');
assert(hidden.cancelled.includes(pageHandle));
assert.equal(hidden.pending.size, 0, 'Page exit cancels the animation');

const stale = setup();
stale.play.dispatch('click');
const staleCallback = stale.callbacks.get([...stale.pending.keys()][0]);
stale.play.dispatch('click'); stale.play.dispatch('click');
staleCallback(99999);
assert.equal(stale.pending.size, 1, 'A cancelled callback cannot spawn a duplicate loop after resume');
assert.equal(Number(stale.scrub.value), 0);
stale.tick(100000); stale.tick(101000);
assert.equal(Number(stale.scrub.value), 1);

assert.doesNotThrow(() => setup({ noRoot: true }));
for (const missing of Object.keys(study.nodes).filter(key => key !== '[data-cut-position]')) {
  const incomplete = setup({ missing });
  assert(incomplete.controls.every(control => control.disabled), `Missing ${missing} leaves the static fallback intact`);
  assert.equal(incomplete.requests(), 0);
  assert.equal(incomplete.study.dataset.cutReady, undefined);
}
assert.equal(setup({ missing: '[data-cut-position]' }).study.dataset.cutReady, 'true', 'The decorative position output is optional');
for (const brokenShot of ['unknown', 'duplicate', 'number']) {
  const incomplete = setup({ brokenShot });
  assert(incomplete.controls.every(control => control.disabled), `Malformed ${brokenShot} shots fail safely`);
  assert.equal(incomplete.study.dataset.cutReady, undefined);
}
assert(setup({ raf: false }).controls.every(control => control.disabled), 'Unsupported animation APIs preserve the static fallback');
const repeat = setup();
repeat.rerun();
assert.equal(repeat.play.listeners.get('click').length, 1, 'Repeated script execution cannot register duplicate interactions');
assert.equal(repeat.requests(), 0);
assert(!/innerHTML|outerHTML|insertAdjacentHTML|fetch\s*\(|XMLHttpRequest|WebSocket|localStorage|sessionStorage|setInterval/.test(source), 'The study has no HTML sinks, remote APIs, storage or persistent timers');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'assets/css/studio-cut-study.css'), 'utf8');
const start = html.indexOf('data-cut-study');
assert(start >= 0, 'The public home includes the film study');
const fragment = html.slice(start, html.indexOf('</noscript>', start) + '</noscript>'.length);
const studyTag = (html.match(/<div\b[^>]*\bdata-cut-study(?:\s|>)[^>]*>/) || [])[0] || '';
const controls = fragment.match(/<(?:button|input)\b[^>]*>/g) || [];
assert.equal(controls.length, 7, 'The authored study has exactly seven input/button controls');
assert(controls.every(tag => /\bdisabled(?:\s|>|=)/.test(tag)), 'All controls start disabled until validation succeeds');
assert(/data-cut-image[^>]+src="\/assets\/images\/creative\/coast-1280\.jpg"/.test(fragment), 'The first frame is a real static HTML image');
assert(/<p\b[^>]*\bdata-cut-title(?:\s|>)[^>]*>Somewhere new\.<\/p>/.test(fragment), 'The title is visible without JavaScript');
assert(fragment.includes('<noscript>'), 'The static state explains how to use the enhancement');
const authoredRange = controls.find(tag => tag.includes('data-cut-scrub'));
assert(/type="range"/.test(authoredRange) && /min="0"/.test(authoredRange) && /max="6"/.test(authoredRange) && /step="0\.01"/.test(authoredRange), 'Scrubbing uses a bounded native keyboard/touch range');
assert(authoredRange.includes('id="cut-scrub"') && authoredRange.includes('aria-label="Find your moment'), 'The native range has an accessible name matching its visible label');
assert(/<label\b[^>]*for="cut-scrub"[^>]*>Find your moment<\/label>/.test(fragment));
const authoredTitleInput = controls.find(tag => tag.includes('data-cut-title-input'));
const authoredTitleDisplay = (fragment.match(/<p\b[^>]*\bdata-cut-title(?:\s|>)[^>]*>/) || [])[0] || '';
assert(authoredTitleInput.includes('maxlength="40"'));
for (const tag of [studyTag, authoredTitleInput, authoredTitleDisplay]) {
  assert(tag.includes('data-clarity-mask="true"'), 'The study and both copies of the user title are masked from session replay');
}
const authoredTimer = (fragment.match(/<span\b[^>]*\bdata-cut-time(?:\s|>)[^>]*>/) || [])[0] || '';
assert(authoredTimer.includes('role="timer"') && authoredTimer.includes('aria-live="off"'), 'The authored timer cannot announce every playback frame');
assert(/<script\b[^>]*defer[^>]*src="\/assets\/studio-cut-study\.js\?/.test(html), 'The interaction script is deferred');
assert(html.includes('href="/assets/css/studio-cut-study.css?'), 'Study styling is included');
assert(/\.cut-scrub > input\s*\{[^}]*height:\s*44px/.test(css), 'The scrubber has a 44px touch target');
assert(/\.cut-actions button\s*\{[^}]*min-height:\s*44px/.test(css), 'Action buttons have 44px touch targets');
assert(/\.cut-title-field > input\s*\{[^}]*min-height:\s*48px/.test(css), 'The title input has a comfortably sized target');
assert(css.includes(':focus-visible') && css.includes('prefers-reduced-motion'), 'Keyboard focus and reduced-motion styling are explicit');
assert(/@media\s*\(max-width:\s*760px\)\s*\{\s*\.cut-study\s*\{\s*grid-template-columns:\s*1fr/.test(css), 'Narrow layouts become one readable column');
assert(/\.cut-strip\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\)/.test(css), 'The three shots can shrink without overflowing the narrow layout');
assert(/@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*animation:\s*none\s*!important;\s*transition:\s*none\s*!important/.test(css), 'Reduced-motion users get no decorative motion');
const routes = JSON.parse(fs.readFileSync(path.join(root, '_routes.json'), 'utf8'));
assert(routes.exclude.includes('/assets/studio-cut-study.js'), 'The public script bypasses worker routing like the other public-page enhancements');
console.log('PASS: manual cut-study playback, finite RAF lifecycle, scrubbing, real DOM reversal, accessible state, safe titles and authored static fallbacks');
