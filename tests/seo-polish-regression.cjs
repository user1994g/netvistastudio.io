// Source-level checks; Google's crawlers and search appearance remain independent.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const origin = 'https://netvistastudio.com';
const newsData = JSON.parse(fs.readFileSync(path.join(root, 'content/news-posts.json'), 'utf8'));
const paths = ['/', '/applications/', '/video-editor/',
  '/video-editor/getting-started/', '/video-editor/keyframes/',
  '/video-editor/colour-grading-luts/', '/video-editor/export-settings/', '/news/', ...newsData.posts.map(post => `/news/${post.slug}/`)];
const decode = text => text.replaceAll('&amp;', '&').replaceAll('&quot;', '"');

function meta(head, name) {
  const tags = [...head.matchAll(/<meta\b[^>]*>/g)].map(match => match[0]);
  const matches = tags.filter(tag => tag.includes(`name="${name}"`) || tag.includes(`property="${name}"`));
  assert.equal(matches.length, 1, `Exactly one ${name} tag`);
  const value = matches[0].match(/\bcontent="([^"]*)"/)?.[1];
  assert(value, `${name} must have a value`);
  return decode(value);
}

function jpegDimensions(bytes) {
  assert.equal(bytes.readUInt16BE(0), 0xffd8, 'Expected a real JPEG social image');
  let offset = 2;
  while (offset + 8 < bytes.length) {
    assert.equal(bytes[offset], 0xff, 'Expected a JPEG marker');
    while (bytes[offset] === 0xff) offset++;
    const marker = bytes[offset++];
    if (marker === 0xd9 || marker === 0xda) break;
    const length = bytes.readUInt16BE(offset);
    if ([0xc0, 0xc1, 0xc2].includes(marker)) {
      return { width: bytes.readUInt16BE(offset + 5), height: bytes.readUInt16BE(offset + 3) };
    }
    assert(length >= 2, 'Valid JPEG segment length');
    offset += length;
  }
  throw new Error('JPEG dimensions were not found');
}

for (const pathname of paths) {
  const canonical = origin + pathname;
  const html = fs.readFileSync(path.join(root, pathname, 'index.html'), 'utf8');
  const head = html.split('</head>')[0];
  const documents = [...head.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)]
    .map(match => JSON.parse(match[1]));
  const graph = documents.flatMap(document => document['@graph'] || [document]);
  const pages = graph.filter(node => node['@type'] === 'WebPage');
  assert.equal(pages.length, 1, `${pathname}: one page identity`);
  const page = pages[0];
  assert.equal(page['@id'], canonical + '#webpage');
  assert.equal(page.url, canonical);
  assert.equal(page.inLanguage, 'en-GB');
  assert.equal(page.isPartOf['@id'], origin + '/#website');
  const ids = graph.map(node => node['@id']).filter(Boolean);
  assert.equal(new Set(ids).size, ids.length, `${pathname}: no competing schema identities`);

  assert.equal(meta(head, 'og:site_name'), 'NetVista Studio');
  assert.equal(meta(head, 'og:locale'), 'en_GB');
  assert.equal(meta(head, 'og:url'), canonical);
  assert.equal(meta(head, 'twitter:card'), 'summary_large_image');
  assert.equal(meta(head, 'twitter:image'), meta(head, 'og:image'));
  assert.equal(meta(head, 'twitter:image:alt'), meta(head, 'og:image:alt'));
  assert.equal(meta(head, 'og:image:type'), 'image/jpeg');
  const imageURL = new URL(meta(head, 'og:image'));
  assert.equal(imageURL.origin, origin, 'Keep social artwork on the canonical site');
  const dimensions = jpegDimensions(fs.readFileSync(path.join(root, imageURL.pathname)));
  assert.equal(Number(meta(head, 'og:image:width')), dimensions.width, `${pathname}: real preview width`);
  assert.equal(Number(meta(head, 'og:image:height')), dimensions.height, `${pathname}: real preview height`);
  const primaryImage = page.primaryImageOfPage['@id']
    ? graph.find(node => node['@id'] === page.primaryImageOfPage['@id']) : page.primaryImageOfPage;
  assert(primaryImage && primaryImage['@type'] === 'ImageObject', `${pathname}: identifiable primary image`);
  assert.equal(primaryImage.url, imageURL.href);
  assert.equal(primaryImage.width, dimensions.width);
  assert.equal(primaryImage.height, dimensions.height);
  assert.equal(primaryImage.caption, meta(head, 'og:image:alt'));

  const article = graph.find(node => ['Article', 'NewsArticle'].includes(node['@type']));
  if (article) {
    assert.equal(meta(head, 'og:type'), 'article');
    assert.equal(page.mainEntity['@id'], article['@id']);
    assert.equal(article.mainEntityOfPage['@id'], page['@id']);
    assert.equal(article.author['@id'], origin + '/#organization');
    assert.equal(article.publisher['@id'], origin + '/#organization');
    const breadcrumb = graph.find(node => node['@id'] === page.breadcrumb['@id']);
    assert.equal(breadcrumb?.['@type'], 'BreadcrumbList');
    assert.equal(breadcrumb.itemListElement.at(-1).item, canonical);
    assert(html.includes(`<time datetime="${article.dateModified}">`), 'Editorial date agrees with visible guide');
    const post = newsData.posts.find(post => pathname === `/news/${post.slug}/`);
    const expectedPublished = post ? post.published || newsData.published : '2026-10-03';
    assert.equal(article.datePublished, expectedPublished, 'Publication dates describe the page, not its historical milestone');
    assert.equal(article.dateModified, post?.modified || expectedPublished, 'Only actual editorial revisions change modification dates');
  }
  const app = graph.find(node => node['@type'] === 'SoftwareApplication');
  if (app) {
    assert.equal(page.mainEntity['@id'], app['@id']);
    assert.equal(app.softwareVersion, '1.4 Beta 7', 'Published release, not unshipped native work');
    assert.equal(app.offers.price, '0');
    assert(app.description.includes('Mobile features and project formats differ from desktop'));
  }
  assert(!/aggregateRating|ratingValue|JobPosting|SearchAction/.test(JSON.stringify(graph)),
    'No invented ratings, job postings or obsolete search-box rich-result promises');
}

const home = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const homeGraph = JSON.parse(home.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
const site = homeGraph.filter(node => node['@type'] === 'WebSite');
assert.equal(site.length, 1, 'One site-name preference on the home page');
assert.equal(site[0].name, 'NetVista Studio');
assert(site[0].alternateName.includes('netvistastudio.com'));

const sitemap = fs.readFileSync(path.join(root, 'sitemap.xml'), 'utf8');
const entries = [...sitemap.matchAll(/<url>([\s\S]*?)<\/url>/g)].map(match => ({
  url: match[1].match(/<loc>(.*?)<\/loc>/)[1],
  date: match[1].match(/<lastmod>(.*?)<\/lastmod>/)[1]
}));
assert.deepEqual(entries.map(entry => entry.url).sort(), paths.map(pathname => origin + pathname).sort());
for (const entry of entries) {
  const pathname = new URL(entry.url).pathname;
  const post = newsData.posts.find(post => pathname === `/news/${post.slug}/`);
  const overview = ['/', '/applications/', '/video-editor/', '/news/'].includes(pathname);
  assert.equal(entry.date, post ? post.modified || post.published || newsData.published : overview ? '2026-10-21' : '2026-10-03', 'Sitemap dates follow actual editorial publication or updates');
}
console.log('PASS: connected page/article/breadcrumb entities, truthful release metadata, verified social previews, editorial dates and public-only sitemap.');
