const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const origin = 'https://netvistastudio.com';
const publicPaths = ['/', '/applications/', '/video-editor/', '/video-editor/getting-started/', '/video-editor/keyframes/', '/video-editor/colour-grading-luts/', '/video-editor/export-settings/'];
const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const locations = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]);
assert.deepEqual(locations.sort(), publicPaths.map(p => origin + p).sort());
const titles = new Set();
for (const pathname of publicPaths) {
  const html = fs.readFileSync(path.join(root, pathname, 'index.html'), 'utf8');
  const title = html.match(/<title>(.*?)<\/title>/s)?.[1];
  assert(title && !titles.has(title), `${pathname}: distinct page title`); titles.add(title);
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `${pathname}: one main heading`);
  assert(html.includes(`rel="canonical" href="${origin}${pathname}"`), `${pathname}: canonical URL`);
  assert(/name="description" content="[^"]{60,220}"/.test(html), `${pathname}: useful description`);
  assert(!/name="robots" content="[^"]*noindex/.test(html), `${pathname}: must be indexable`);
  assert(!/editor-locked|auth-client\.js/.test(html), `${pathname}: public content cannot require sign-in`);
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    const schema = JSON.parse(match[1]);
    assert.equal(schema['@context'], 'https://schema.org');
    assert(!/aggregateRating|ratingValue/.test(match[1]), 'Do not invent app reviews or ratings');
    for (const m of match[1].matchAll(/"(?:@id|url|image|logo|item)"\s*:\s*"([^"]+)"/g)) assert(m[1].startsWith('https://'), `Absolute structured-data URL: ${m[1]}`);
  }
  for (const match of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    const url = new URL(match[1].replaceAll('&amp;', '&'), origin + pathname);
    if (url.origin !== origin) continue;
    const local = path.join(root, decodeURIComponent(url.pathname), url.pathname.endsWith('/') ? 'index.html' : '');
    assert(fs.existsSync(local), `${pathname}: broken local link ${url.pathname}`);
    if (url.hash && local.endsWith('.html')) {
      const target = fs.readFileSync(local, 'utf8');
      const id = decodeURIComponent(url.hash.slice(1));
      assert(target.includes(`id="${id}"`), `${pathname}: missing anchor ${url.href}`);
    }
  }
  for (const match of html.matchAll(/\bsrcset="([^"]+)"/g)) {
    for (const candidate of match[1].split(',')) {
      const url = new URL(candidate.trim().split(/\s+/)[0], origin + pathname);
      assert(fs.existsSync(path.join(root, decodeURIComponent(url.pathname))), `${pathname}: missing responsive image ${url.pathname}`);
    }
  }
}
const restricted = fs.readFileSync(path.join(root, 'editor/index.html'), 'utf8');
assert(restricted.includes('class="editor-locked"'), 'Existing download page gate stays intact');
assert(restricted.includes('name="robots" content="noindex, follow"'), 'Do not index the locked page');
assert(!locations.some(p => /account|\/editor\//.test(p)), 'No private/auth pages in sitemap');
assert(fs.readFileSync(path.join(root, 'robots.txt'), 'utf8').includes(`Sitemap: ${origin}/sitemap.xml`));
const notFound = fs.readFileSync(path.join(root, '404.html'), 'utf8');
assert(notFound.includes('name="robots" content="noindex, follow"'), 'Real Pages 404 must not be indexed');
assert(!locations.includes(origin + '/404.html'), '404 page stays out of the sitemap');
assert(!fs.readFileSync(path.join(root, 'index.html'), 'utf8').includes('as="image" href="assets/images/photos/final-lesson.jpg"'), 'Do not preload the noninitial film artwork');
for (const pathname of publicPaths.filter(p => p !== '/')) {
  assert(publicPaths.some(other => other !== pathname && fs.readFileSync(path.join(root, other, 'index.html'), 'utf8').includes(`href="${pathname}"`)), `${pathname}: public internal discovery link`);
}
console.log('PASS: public crawl access, sitemap, unique titles, descriptions, canonicals, structured data, internal links/assets/anchors, and restricted download boundary.');
