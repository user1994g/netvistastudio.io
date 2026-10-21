#!/usr/bin/env node
// Static, dependency-free News publishing. All content is plain text, not HTML.
// Run from any directory: node scripts/build-news.mjs [--check]
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const origin = 'https://netvistastudio.com';
const discussionURL = 'https://github.com/user1994g/videoediterNetVistaStudio.github.io/discussions';
const check = process.argv.includes('--check');
assert(process.argv.slice(2).every(argument => argument === '--check'), 'Usage: node scripts/build-news.mjs [--check]');

const images = {
  studio: { path: '/assets/images/brand/studio-pixel-night-1672.jpg', webp: '/assets/images/brand/studio-pixel-night', alt: 'Pixel-art film studio glowing inside a chapel at night' },
  editor: { path: '/editor/assets/studio-room-1672.jpg', webp: '/editor/assets/studio-room', alt: 'An editing desk with a camera, monitor and photographs' }
};
const escape = value => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
const json = value => JSON.stringify(value, null, 2).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
const isoDate = (value, label) => {
  assert(typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value), `${label}: expected YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`);
  assert(!Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value, `${label}: invalid calendar date`);
  return value;
};
const text = (value, label) => {
  assert(typeof value === 'string' && value.trim() && value === value.trim(), `${label}: expected nonempty, trimmed plain text`);
  assert(!/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value), `${label}: unsupported control character`);
  return value;
};
const dateLabel = value => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`));
const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const milestoneDates = (value, label) => {
  text(value, label);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return { start: isoDate(value, label), end: value, label: dateLabel(value) };
  const match = value.match(/^(\d{1,2})(?:[–-](\d{1,2}))? ([A-Z][a-z]+) (\d{4})$/);
  assert(match && months.includes(match[3]), `${label}: expected a date or same-month date range, such as 10–13 August 2026`);
  const month = String(months.indexOf(match[3]) + 1).padStart(2, '0');
  const start = isoDate(`${match[4]}-${month}-${match[1].padStart(2, '0')}`, `${label} start`);
  const end = isoDate(`${match[4]}-${month}-${(match[2] || match[1]).padStart(2, '0')}`, `${label} end`);
  assert(start <= end, `${label}: date range must be chronological`);
  return { start, end, label: value };
};
const sourceURL = (value, label) => {
  text(value, label);
  assert(!/[\s\\]/.test(value), `${label}: URL cannot contain whitespace or backslashes`);
  const url = new URL(value);
  assert(url.protocol === 'https:' && !url.username && !url.password, `${label}: expected an HTTPS URL without credentials`);
  return url.href;
};
const guideURL = (value, label) => {
  text(value, label);
  assert(value.startsWith('/') && !value.startsWith('//') && !/[\s\\]/.test(value), `${label}: expected a root-relative internal URL`);
  const url = new URL(value, origin);
  assert(url.origin === origin && (url.pathname.startsWith('/video-editor/') || url.pathname === '/editor/') && !url.search, `${label}: expected an internal editing guide, product or download link`);
  return url.pathname + url.hash;
};

// Read and validate everything before creating or modifying generated output.
const data = JSON.parse(await readFile(path.join(root, 'content/news-posts.json'), 'utf8'));
isoDate(data.published, 'published');
assert(Array.isArray(data.posts) && data.posts.length > 0, 'posts: expected at least one article');
const slugs = new Set();
for (const [index, post] of data.posts.entries()) {
  const label = `posts[${index}]`;
  assert(post && typeof post === 'object' && !Array.isArray(post), `${label}: expected an article object`);
  assert(typeof post.slug === 'string' && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(post.slug) && post.slug.length <= 100, `${label}.slug: expected a lowercase hyphenated slug`);
  assert(!slugs.has(post.slug), `${label}.slug: duplicate slug ${post.slug}`);
  assert(!['index', 'feed', 'assets'].includes(post.slug), `${label}.slug: reserved output name`);
  slugs.add(post.slug);
  for (const key of ['title', 'description', 'kind', 'version', 'summary']) text(post[key], `${label}.${key}`);
  post.published = isoDate(post.published ?? data.published, `${label}.published`);
  post.modified = isoDate(post.modified ?? post.published, `${label}.modified`);
  assert(post.modified >= post.published, `${label}.modified: cannot predate publication`);
  post.milestoneDates = milestoneDates(post.milestone, `${label}.milestone`);
  assert(post.milestoneDates.end <= post.published, `${label}.milestone: cannot be later than the publication date`);
  assert(['released', 'development'].includes(post.status), `${label}.status: expected released or development`);
  assert(Array.isArray(post.sections) && post.sections.length > 0, `${label}.sections: expected article sections`);
  for (const [sectionIndex, section] of post.sections.entries()) {
    const sectionLabel = `${label}.sections[${sectionIndex}]`;
    assert(section && typeof section === 'object' && !Array.isArray(section), `${sectionLabel}: expected an object`);
    text(section.heading, `${sectionLabel}.heading`);
    assert(Array.isArray(section.paragraphs) && section.paragraphs.length > 0, `${sectionLabel}.paragraphs: expected plain-text paragraphs`);
    section.paragraphs.forEach((paragraph, paragraphIndex) => text(paragraph, `${sectionLabel}.paragraphs[${paragraphIndex}]`));
    if (section.bullets !== undefined) {
      assert(Array.isArray(section.bullets) && section.bullets.length > 0, `${sectionLabel}.bullets: expected a nonempty list`);
      section.bullets.forEach((bullet, bulletIndex) => text(bullet, `${sectionLabel}.bullets[${bulletIndex}]`));
    }
  }
  assert(Array.isArray(post.sources) && post.sources.length > 0, `${label}.sources: expected evidence links`);
  for (const [sourceIndex, source] of post.sources.entries()) {
    const sourceLabel = `${label}.sources[${sourceIndex}]`;
    assert(source && typeof source === 'object', `${sourceLabel}: expected an object`);
    text(source.label, `${sourceLabel}.label`);
    source.url = sourceURL(source.url, `${sourceLabel}.url`);
  }
  if (post.discussionURL !== undefined) {
    post.discussionURL = sourceURL(post.discussionURL, `${label}.discussionURL`);
    assert(/^https:\/\/github\.com\/user1994g\/videoediterNetVistaStudio\.github\.io\/discussions\/\d+$/.test(post.discussionURL), `${label}.discussionURL: expected a numbered discussion in the NetVista Studio app repository`);
  }
  assert(post.guide && typeof post.guide === 'object', `${label}.guide: expected a related guide`);
  text(post.guide.label, `${label}.guide.label`);
  post.guide.href = guideURL(post.guide.href, `${label}.guide.href`);
  const guide = new URL(post.guide.href, origin);
  const guideFile = path.join(root, guide.pathname, guide.pathname.endsWith('/') ? 'index.html' : '');
  const guideHTML = await readFile(guideFile, 'utf8');
  if (guide.hash) assert(guideHTML.includes(`id="${decodeURIComponent(guide.hash.slice(1))}"`), `${label}.guide: anchor does not exist`);
}
for (const image of Object.values(images)) {
  await access(path.join(root, image.path));
  for (const width of [640, 1280, 1672]) await access(path.join(root, `${image.webp}-${width}.webp`));
}

const home = await readFile(path.join(root, 'index.html'), 'utf8');
const extract = (pattern, label) => {
  const matches = [...home.matchAll(pattern)];
  assert(matches.length === 1, `Home source must contain exactly one ${label}`);
  return matches[0][0];
};
const rootReferences = html => html.replace(/(\b(?:href|src)=")([^"]+)(")/g, (match, before, value, after) => {
  if (value.startsWith('/') || value.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(value)) return match;
  return before + '/' + value + after;
});
let header = rootReferences(extract(/<header\b[^>]*data-shared-navigation\b[^>]*>[\s\S]*?<\/header>/g, 'shared header'));
assert(header.includes('href="/news/"'), 'Add News to the shared home navigation before generating News pages');
header = header.replace(/ class="is-active" aria-current="page"/g, '').replace(/(<a\b[^>]*href="\/news\/"[^>]*)(>)/, '$1 class="is-active" aria-current="page"$2');
const searchPanel = rootReferences(extract(/<section\b[^>]*id="search-panel"[^>]*>[\s\S]*?<\/section>/g, 'search panel'));
const footer = rootReferences(extract(/<footer\b[^>]*class="site-footer"[^>]*>[\s\S]*?<\/footer>/g, 'site footer'));
const navScript = home.match(/<script\b[^>]*src="(\/assets\/mobile-navigation\.js(?:\?[^"]*)?)"[^>]*><\/script>/)?.[1];
assert(navScript, 'Home source must include the shared navigation controller');

const published = data.published;
const publishedLabel = dateLabel(published);
const posts = [...data.posts].sort((a, b) => b.milestoneDates.end.localeCompare(a.milestoneDates.end) || a.slug.localeCompare(b.slug));
const asOfDate = posts.map(post => post.modified).sort().at(-1);
const asOfLabel = dateLabel(asOfDate);
const articlePath = post => `/news/${post.slug}/`;
const postImage = post => post.status === 'development' ? images.studio : images.editor;
const statusLabel = post => post.status === 'development' ? 'In development' : 'Released milestone';
const milestoneTime = post => post.milestoneDates.start === post.milestoneDates.end
  ? `<time datetime="${post.milestoneDates.end}">${escape(post.milestoneDates.label)}</time>`
  : `<span>${escape(post.milestoneDates.label)}</span>`;
const organization = {
  '@type': 'Organization', '@id': origin + '/#organization', name: 'NetVista Studio', url: origin + '/',
  logo: origin + '/assets/images/photos/netvistastudio-logo.png'
};
const pageGraph = ({ pathname, title, description, image, mainEntity, breadcrumb }) => [
  {
    '@type': 'WebPage', '@id': origin + pathname + '#webpage', url: origin + pathname, name: title, description,
    isPartOf: { '@id': origin + '/#website' }, mainEntity: { '@id': mainEntity },
    breadcrumb: { '@id': origin + pathname + '#breadcrumbs' },
    primaryImageOfPage: { '@id': origin + pathname + '#primaryimage' }, inLanguage: 'en-GB'
  },
  {
    '@type': 'ImageObject', '@id': origin + pathname + '#primaryimage', url: origin + image.path,
    width: 1672, height: 941, caption: image.alt
  },
  {
    '@type': 'BreadcrumbList', '@id': origin + pathname + '#breadcrumbs',
    itemListElement: breadcrumb.map((item, index) => ({ '@type': 'ListItem', position: index + 1, name: item.name, item: origin + item.path }))
  },
  organization
];

function picture(image, { eager = false, sizes = '(max-width: 760px) 100vw, 60vw', className = '' } = {}) {
  return `<picture${className ? ` class="${escape(className)}"` : ''}><source type="image/webp" srcset="${image.webp}-640.webp 640w, ${image.webp}-1280.webp 1280w, ${image.webp}-1672.webp 1672w" sizes="${escape(sizes)}"><img src="${image.path}" width="1672" height="941" alt="${escape(image.alt)}" ${eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async"></picture>`;
}

function document({ pathname, title, description, image, graph, content, post }) {
  const canonical = origin + pathname;
  return `<!doctype html>
<html lang="en-GB">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#faf9f6">
  <title>${escape(title)}</title>
  <meta name="description" content="${escape(description)}">
  <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">
  <link rel="canonical" href="${canonical}">
  <meta property="og:type" content="${post ? 'article' : 'website'}">
  <meta property="og:site_name" content="NetVista Studio">
  <meta property="og:locale" content="en_GB">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description)}">
  <meta property="og:url" content="${canonical}">
  <meta property="og:image" content="${origin + image.path}">
  <meta property="og:image:type" content="image/jpeg">
  <meta property="og:image:width" content="1672">
  <meta property="og:image:height" content="941">
  <meta property="og:image:alt" content="${escape(image.alt)}">${post ? `
  <meta property="article:published_time" content="${post.published}">
  <meta property="article:modified_time" content="${post.modified}">` : ''}
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(title)}">
  <meta name="twitter:description" content="${escape(description)}">
  <meta name="twitter:image" content="${origin + image.path}">
  <meta name="twitter:image:alt" content="${escape(image.alt)}">
  <link rel="alternate" type="application/rss+xml" title="NetVista Studio News" href="/news/feed.xml">
  <link rel="icon" type="image/png" sizes="32x32" href="/assets/images/brand/favicon-32.png">
  <link rel="icon" type="image/png" sizes="48x48" href="/assets/images/brand/favicon-48.png">
  <link rel="apple-touch-icon" href="/assets/images/brand/apple-touch-icon.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&amp;display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/assets/css/studio-shared.css?v=20261021">
  <link rel="stylesheet" href="/assets/css/studio-news.css?v=1">
  <script src="/assets/public-domain.js"></script>
  <script defer src="${escape(navScript)}"></script>
  <script type="application/ld+json">
${json({ '@context': 'https://schema.org', '@graph': graph }).split('\n').map(line => '    ' + line).join('\n')}
  </script>
</head>
<body class="nv-site news-page${post ? ' news-article-page' : ''}">
  <a class="skip-link" href="#main">Skip to content</a>
  ${header}
  ${searchPanel}
  <main id="main" tabindex="-1">
${content}
  </main>
  ${footer}
</body>
</html>
`;
}

function renderArticle(post) {
  const pathname = articlePath(post);
  const canonical = origin + pathname;
  const title = `${post.title} | NetVista Studio News`;
  const image = postImage(post);
  const breadcrumb = [{ name: 'NetVista Studio', path: '/' }, { name: 'News', path: '/news/' }, { name: post.title, path: pathname }];
  const graph = pageGraph({ pathname, title, description: post.description, image, mainEntity: canonical + '#article', breadcrumb });
  graph.push({
    '@type': 'NewsArticle', '@id': canonical + '#article', url: canonical, headline: post.title, description: post.description,
    datePublished: post.published, dateModified: post.modified, author: { '@id': organization['@id'] },
    publisher: { '@id': organization['@id'] }, image: { '@id': canonical + '#primaryimage' },
    mainEntityOfPage: { '@id': canonical + '#webpage' }, articleSection: post.kind, inLanguage: 'en-GB',
    isPartOf: { '@id': origin + '/news/#webpage' }, citation: post.sources.map(source => source.url)
  });
  const sections = post.sections.map((section, index) => `        <section class="news-story-section" aria-labelledby="story-section-${index + 1}">
          <h2 id="story-section-${index + 1}">${escape(section.heading)}</h2>
${section.paragraphs.map(paragraph => `          <p>${escape(paragraph)}</p>`).join('\n')}${section.bullets ? `
          <ul>${section.bullets.map(bullet => `<li>${escape(bullet)}</li>`).join('')}</ul>` : ''}
        </section>`).join('\n');
  return document({ pathname, title, description: post.description, image, graph, post, content: `    <div class="shell news-article-shell">
      <nav class="breadcrumbs" aria-label="Breadcrumb"><a href="/">NetVista Studio</a><span aria-hidden="true">/</span><a href="/news/">News</a><span aria-hidden="true">/</span><span aria-current="page">${escape(post.version)}</span></nav>
      <article class="news-story">
        <header class="news-story-header">
          <div class="news-label-row"><span class="news-status${post.status === 'development' ? ' news-status-development' : ''}">${statusLabel(post)}</span><span class="eyebrow">${escape(post.kind)}</span></div>
          <h1>${escape(post.title)}</h1>
          <p class="news-story-summary">${escape(post.summary)}</p>
          <p class="news-byline">By NetVista Studio <span aria-hidden="true">·</span> Published <time datetime="${post.published}">${dateLabel(post.published)}</time>${post.modified !== post.published ? ` <span aria-hidden="true">·</span> Updated <time datetime="${post.modified}">${dateLabel(post.modified)}</time>` : ''}</p>
          <dl class="news-record"><div><dt>Recorded milestone</dt><dd>${milestoneTime(post)}</dd></div><div><dt>Version / context</dt><dd>${escape(post.version)}</dd></div></dl>
        </header>
        <aside class="news-editorial-note${post.status === 'development' ? ' news-development-note' : ''}" aria-label="Article context"><strong>${post.status === 'development' ? 'Development preview—not a downloadable release.' : 'A retrospective of an earlier development milestone.'}</strong><p>${post.status === 'development' ? 'This story describes work in development as of the recorded milestone. It is not a statement that these features are included in the public beta download.' : `This article was first published on ${dateLabel(post.published)}. The earlier milestone date describes the development record, not an earlier publication of this article.`}</p></aside>
        <figure class="news-story-figure">${picture(image, { eager: true, sizes: '(max-width: 1000px) 100vw, 1000px' })}<figcaption>NetVista Studio artwork. An illustration of the studio, not a screenshot of the features described.</figcaption></figure>
        <div class="news-story-body">
${sections}
          <aside class="news-evidence" aria-labelledby="evidence-title"><p class="eyebrow">THE DEVELOPMENT RECORD</p><h2 id="evidence-title">Where this story comes from.</h2><p>These first-party records provide the release or development context for this article.</p><ul>${post.sources.map(source => `<li><a href="${escape(source.url)}">${escape(source.label)} <span aria-hidden="true">↗</span></a></li>`).join('')}</ul></aside>
          <aside class="news-related" aria-labelledby="related-title"><p class="eyebrow">MAKE YOUR NEXT MOVE</p><h2 id="related-title">From the record to your own edit.</h2><a class="text-link" href="${escape(post.guide.href)}">${escape(post.guide.label)} <span aria-hidden="true">→</span></a><p>Features vary by platform and beta version. Keep backups of important work.</p></aside>
        </div>
        <footer class="news-story-footer"><a class="text-link" href="/news/"><span aria-hidden="true">←</span> Back to all studio news</a><a class="text-link" href="${escape(post.discussionURL || discussionURL)}">${post.discussionURL ? 'Discuss this story' : 'Discuss the development'} <span aria-hidden="true">↗</span></a></footer>
      </article>
    </div>` });
}

function renderHub() {
  const pathname = '/news/';
  const title = 'News & Development Notes | NetVista Studio';
  const description = 'Follow the making of NetVista Studio: public beta milestones, development retrospectives and clearly labelled previews of work still in progress.';
  const preview = posts.find(post => post.status === 'development');
  const released = posts.find(post => post.status === 'released' && /beta\s*7\b/i.test(post.version)) || posts.find(post => post.status === 'released');
  const graph = pageGraph({ pathname, title, description, image: images.studio, mainEntity: origin + '/news/#archive', breadcrumb: [{ name: 'NetVista Studio', path: '/' }, { name: 'News', path: pathname }] });
  graph.push({ '@type': 'ItemList', '@id': origin + '/news/#archive', name: 'NetVista Studio development archive', numberOfItems: posts.length,
    itemListElement: posts.map((post, index) => ({ '@type': 'ListItem', position: index + 1, name: post.title, url: origin + articlePath(post) })) });
  const highlights = [preview ? `        <article class="news-preview" aria-labelledby="preview-title"><div class="news-label-row"><span class="news-status news-status-development">In development</span><span class="news-preview-date">Recorded ${escape(preview.milestoneDates.label)}</span></div><p class="eyebrow">FROM THE WORKSHOP</p><h2 id="preview-title"><a href="${articlePath(preview)}">${escape(preview.title)}</a></h2><p>${escape(preview.summary)}</p><p class="news-preview-caveat">Development preview—not a downloadable release.</p><a class="button button-secondary" href="${articlePath(preview)}">Inside the development preview <span aria-hidden="true">→</span></a></article>` : '',
  released ? `        <article class="news-release" aria-labelledby="release-title"><a class="news-release-art" href="${articlePath(released)}" tabindex="-1" aria-hidden="true">${picture(images.editor, { sizes: '(max-width: 760px) 100vw, 50vw' })}</a><div class="news-release-copy"><p class="eyebrow">RELEASED / ${escape(released.version)}</p><h2 id="release-title"><a href="${articlePath(released)}">${escape(released.title)}</a></h2><p>${escape(released.summary)}</p><a class="text-link" href="${articlePath(released)}">Read the released milestone <span aria-hidden="true">→</span></a></div></article>` : ''].filter(Boolean).join('\n');
  return document({ pathname, title, description, image: images.studio, graph, content: `    <section class="shell news-hero" aria-labelledby="news-title"><div><p class="eyebrow">NEWS / FROM THE STUDIO</p><h1 id="news-title">A studio,<br>still in the making.</h1><p class="news-hero-lead">The work behind the workspace. Development notes, public-beta milestones and an honest look at what comes next.</p><div class="news-hero-links"><a class="text-link" href="#archive-title">Explore the archive <span aria-hidden="true">↓</span></a><a class="text-link" href="/news/feed.xml">Follow by RSS <span aria-hidden="true">↗</span></a></div></div><figure class="news-hero-art">${picture(images.studio, { eager: true, sizes: '(max-width: 760px) 100vw, 48vw' })}<figcaption>A little room for what comes next.</figcaption></figure></section>
    <div class="shell news-date-note"><p>As of <time datetime="${asOfDate}">${asOfLabel}</time></p><p>The retrospective collection was first published on ${publishedLabel}. Its milestone dates refer to earlier development records, not article publication dates. Previews remain explicitly in development.</p></div>
    <section class="shell news-highlights" aria-label="Released and in-development highlights">
${highlights}
    </section>
    <section class="shell news-archive" aria-labelledby="archive-title"><div class="news-section-head"><div><p class="eyebrow">THE DEVELOPMENT ARCHIVE</p><h2 id="archive-title">One milestone at a time.</h2></div><p>${posts.length} stories. Most recent milestone first.<br>Publication dates are shown on each story.</p></div><ol class="news-archive-list">
${posts.map((post, index) => `      <li><article class="news-archive-entry"><div class="news-entry-index" aria-hidden="true">${String(index + 1).padStart(2, '0')}</div><div class="news-entry-date"><p class="eyebrow">MILESTONE</p>${milestoneTime(post)}<span class="news-status${post.status === 'development' ? ' news-status-development' : ''}">${statusLabel(post)}</span></div><div class="news-entry-copy"><p class="eyebrow">${escape(post.kind)} / ${escape(post.version)}</p><h3><a href="${articlePath(post)}">${escape(post.title)}</a></h3><p>${escape(post.description)}</p><a class="news-entry-link" href="${articlePath(post)}">Read the story <span aria-hidden="true">→</span></a></div></article></li>`).join('\n')}
    </ol></section>
    <section class="shell news-conversation" aria-labelledby="conversation-title"><div><p class="eyebrow">THE CONVERSATION CONTINUES</p><h2 id="conversation-title">Good tools start<br>with a conversation.</h2><p>Share a workflow, ask a question or talk about the work in progress with the NetVista Studio community.</p></div><div class="news-conversation-actions"><a class="button button-primary" href="${discussionURL}">Join the GitHub discussion <span aria-hidden="true">↗</span></a><a class="text-link" href="/news/feed.xml">Subscribe to the RSS feed <span aria-hidden="true">↗</span></a></div></section>` });
}

function renderFeed() {
  // RSS requires RFC 822 dates. Midnight UTC represents our day-only editorial
  // date, not a claim that the articles were published at a recorded time.
  const rssDate = value => new Date(`${value}T00:00:00Z`).toUTCString();
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>NetVista Studio News</title>
    <link>${origin}/news/</link>
    <description>Development notes, released beta milestones and clearly labelled previews from NetVista Studio.</description>
    <language>en-GB</language>
    <lastBuildDate>${rssDate(asOfDate)}</lastBuildDate>
    <atom:link href="${origin}/news/feed.xml" rel="self" type="application/rss+xml"/>
${posts.map(post => `    <item>
      <title>${escape(post.title)}</title>
      <link>${origin + articlePath(post)}</link>
      <guid isPermaLink="true">${origin + articlePath(post)}</guid>
      <description>${escape(`${post.summary} ${post.status === 'development' ? 'Development preview—not a downloadable release.' : 'Development retrospective.'} Recorded milestone: ${post.milestoneDates.label}. First published: ${dateLabel(post.published)}.`)}</description>
      <category>${escape(post.kind)}</category>
      <pubDate>${rssDate(post.published)}</pubDate>
    </item>`).join('\n')}
  </channel>
</rss>
`;
}

const output = new Map([
  ['news/index.html', renderHub()],
  ...posts.map(post => [`news/${post.slug}/index.html`, renderArticle(post)]),
  ['news/feed.xml', renderFeed()]
]);
for (const [filename, html] of output) {
  if (!filename.endsWith('.html')) continue;
  assert.equal([...html.matchAll(/<h1\b/g)].length, 1, `${filename}: expected one main heading`);
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(new Set(ids).size, ids.length, `${filename}: duplicate DOM identifiers`);
  for (const match of html.matchAll(/\b(?:for|aria-controls|aria-labelledby|aria-describedby)="([^"]+)"/g)) {
    for (const id of match[1].split(/\s+/)) assert(ids.includes(id), `${filename}: missing ARIA or label target ${id}`);
  }
}
if (check) {
  for (const [filename, expected] of output) {
    let actual;
    try { actual = await readFile(path.join(root, filename), 'utf8'); }
    catch { throw new Error(`Missing generated file: ${filename}. Run node scripts/build-news.mjs.`); }
    assert.equal(actual, expected, `Generated file is stale: ${filename}. Run node scripts/build-news.mjs.`);
  }
  console.log(`PASS: ${posts.length} validated News articles, hub and RSS feed match their deterministic sources.`);
} else {
  for (const [filename, content] of output) {
    await mkdir(path.dirname(path.join(root, filename)), { recursive: true });
    await writeFile(path.join(root, filename), content);
  }
  console.log(`Built ${posts.length} static News articles, the News hub and RSS feed. Sitemap and shared source files were not modified.`);
}
