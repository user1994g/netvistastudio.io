'use strict';

// Authored content/accessibility contracts only. Browser QA checks actual layout.
// No palette, typography choice or decorative copy is treated as a test oracle.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'fibre-concept/index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'fibre-concept/assets/fibre.css'), 'utf8');
const js = fs.readFileSync(path.join(root, 'fibre-concept/assets/fibre.js'), 'utf8');

function attrs(tag) {
  return Object.fromEntries([...tag.matchAll(/([^\s=<>/]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
    .map(match => [match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? '']));
}
function tagForId(id) {
  const tag = html.match(new RegExp(`<[^>]+\\bid=["']${id}["'][^>]*>`))?.[0];
  assert.ok(tag, `Missing #${id}`);
  return attrs(tag);
}
function text(fragment) {
  return fragment.replace(/<[^>]+>/g, ' ').replace(/&(?:nbsp|#160);/g, ' ').replace(/\s+/g, ' ').trim();
}
function section(id) {
  const fragment = html.match(new RegExp(`<section\\b[^>]*\\bid=["']${id}["'][^>]*>[\\s\\S]*?<\\/section>`))?.[0];
  assert.ok(fragment, `Missing section #${id}`);
  return fragment;
}

const gate = tagForId('concept-gate');
assert.equal(gate.role, 'dialog');
assert.equal(gate['aria-modal'], 'true');
assert.equal(Object.hasOwn(gate, 'hidden'), false, 'The warning is visible before JavaScript');
assert.match(text(section('concept-gate')), /not\s+a real ISP/i, 'The initial warning states this is not an ISP');
const page = tagForId('site-content');
assert.ok(Object.hasOwn(page, 'hidden') && Object.hasOwn(page, 'inert'), 'The concept is initially hidden and inert');
assert.ok(Object.hasOwn(tagForId('enter-concept'), 'disabled'), 'Acknowledgement stays disabled until the controller initializes');
assert.match(html, /<noscript\b/i, 'There is a usable no-JavaScript explanation');

const plans = [...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/g)]
  .map(match => match[0]).filter(fragment => /\bdata-plan-speed=/.test(fragment));
assert.equal(plans.length, 4, 'There are exactly four fictional plan cards');
const expected = new Map([['500', '25'], ['1000', '35'], ['2000', '49'], ['20000', '149']]);
const seen = new Set();
for (const card of plans) {
  const button = card.match(/<button\b[^>]*\bdata-plan-speed=[^>]*>/)?.[0];
  assert.ok(button, 'Each plan has a preview button, not checkout');
  const plan = attrs(button);
  const speed = plan['data-plan-speed'];
  assert.ok(expected.has(speed) && !seen.has(speed), `Unexpected or duplicate tier ${speed}`);
  seen.add(speed);
  assert.equal(plan['data-plan-id'], speed);
  assert.equal(plan.type, 'button');
  assert.equal(plan['aria-controls'], 'play', 'A plan preview targets only the local speed comparison');
  assert.match(plan['aria-label'] || '', /preview|concept/i, 'The button has an honest accessible name');
  const copy = text(card);
  assert.match(copy, new RegExp(`£\\s*${expected.get(speed)}(?!\\d)`), `The ${speed} tier keeps its example price`);
  assert.match(copy, /example price|illustrative price|fictional price/i, 'Pricing is clearly illustrative');
  assert.match(copy, /fictional|concept/i, 'Each plan is labelled as a concept');
  assert.match(copy, /not for sale|not available(?: to buy)?|unavailable/i, 'Each plan is visibly unavailable');
  assert.match(copy, /50G\s*-?\s*PON/i, 'Each fictional tier retains its imagined network technology');
  assert.match(copy, /download/i);
  assert.match(copy, /upload/i);
}
assert.deepEqual([...seen].sort((a, b) => Number(a) - Number(b)), [...expected.keys()]);
assert.equal(tagForId('selected-plan-status').role, 'status');
assert.match(text(section('plans')), /fictional|design examples/i);

const network = text(section('network'));
assert.match(network, /50G\s*-?\s*PON/i);
assert.match(network, /shared.{0,80}(?:line|rate|fibre|network)/i, '50G PON is described as a shared network, not a per-home promise');
assert.match(network, /not.{0,100}(?:dedicated|guarantee)/i, 'The shared line rate is not a dedicated speed guarantee');
assert.match(network, /(?:does not|do not|don’t|don't|is not|isn’t|isn't).{0,100}(?:operate|own|real|network)|(?:fictional|imagined).{0,60}(?:network|infrastructure)/i, 'There is no claim that NetVista operates the network');
assert.match(section('network'), /https:\/\/www\.itu\.int\//, 'The real technology explanation retains its primary reference');
assert.match(text(section('questions')), /does not place an order|no.{0,40}(?:orders|payments)|not.{0,40}(?:order|contract)/i, 'FAQ distinguishes the preview from an order');

const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map(match => match[1]);
assert.equal(ids.length, new Set(ids).size, 'IDs remain unique');
for (const match of html.matchAll(/\b(?:aria-labelledby|aria-describedby|aria-controls|for)=["']([^"']+)["']/g)) {
  for (const id of match[1].split(/\s+/)) assert.ok(ids.includes(id), `Broken accessible reference #${id}`);
}
assert.match(html, /<h1\b[^>]*\bid=["']page-title["']/i, 'The visible concept has its own primary heading');
assert.equal(tagForId('menu-toggle')['aria-controls'], 'primary-nav');
assert.equal(tagForId('menu-toggle')['aria-expanded'], 'false');

const resources = new Set();
const allowedResources = new Set(['./assets/fibre-icon.svg', './assets/fibre-loop.svg', './assets/fibre.css', './assets/fibre.js']);
for (const match of html.matchAll(/<(?:script|img|link)\b[^>]*>/g)) {
  const item = attrs(match[0]);
  const address = item.src || (['stylesheet', 'icon'].includes(item.rel) ? item.href : null);
  if (!address) continue;
  assert.ok(address.startsWith('./assets/'), 'No new remote script, stylesheet or image dependency');
  const resource = address.split('?')[0];
  assert.ok(allowedResources.has(resource), `Unexpected resource outside the existing local asset allowlist: ${resource}`);
  const filename = path.join(root, 'fibre-concept', resource);
  assert.ok(fs.existsSync(filename) && fs.statSync(filename).isFile(), `Declared local asset exists: ${resource}`);
  resources.add(resource);
}
for (const resource of allowedResources) {
  assert.ok(resources.has(resource), `Required local site resource is retained: ${resource}`);
}
assert.equal([...html.matchAll(/<script\b/g)].length, 1, 'Only the existing local controller script is loaded');
assert.ok(!/<form\b|\son[a-z]+\s*=/i.test(html), 'No checkout/form or inline event handler is introduced');
assert.ok(!/clarity\.ms|googletagmanager|googlesyndication|google-analytics|stripe\.com/i.test(html + css + js), 'No tracking or payment integration is added');
assert.ok(!/@import\b|url\(\s*["']?https?:/i.test(css), 'The redesign has no remote CSS dependencies');
const policyTag = [...html.matchAll(/<meta\b[^>]*>/g)].map(match => attrs(match[0]))
  .find(item => item['http-equiv']?.toLowerCase() === 'content-security-policy');
assert.ok(policyTag, 'The local page retains its CSP');
const directives = new Map(policyTag.content.split(';').map(value => value.trim().split(/\s+/)).filter(value => value[0]).map(([name, ...values]) => [name, values]));
for (const name of ['default-src', 'script-src', 'style-src', 'img-src']) assert.deepEqual(directives.get(name), ["'self'"], `${name} stays local-only`);
for (const name of ['connect-src', 'object-src', 'base-uri', 'form-action']) assert.deepEqual(directives.get(name), ["'none'"], `${name} remains disabled`);

assert.match(css, /:focus-visible\b/, 'Keyboard focus is explicitly styled');
assert.match(css, /@media\s*\([^)]*prefers-reduced-motion\s*:\s*reduce[^)]*\)/, 'Reduced-motion preferences remain supported');
assert.match(css, /scroll-behavior\s*:\s*auto\b/, 'Reduced-motion users can avoid animated page scrolling');
assert.match(css, /(?:animation|transition)\s*:\s*none\b/, 'Decorative motion can be disabled');
assert.match(css, /@media\s*[^{}]*(?:max-width|min-width|width\s*[<>]=?)/, 'Responsive layout rules are authored');
for (const name of ['hero', 'plan-grid']) {
  const pattern = new RegExp(`\\.${name}[^{}]*\\{[^{}]*grid-template-columns\\s*:\\s*(?:1fr\\b|repeat\\(\\s*1\\s*,)`, 'i');
  assert.match(css, pattern, `The ${name} has an authored single-column fallback for small screens`);
}

console.log('PASS: fictional tier/pricing contracts, shared 50G PON caveat, mandatory notice, local-only resources, accessibility and responsive/reduced-motion authoring');
