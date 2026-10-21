'use strict';
// Offline editorial/SEO contract: no account, GitHub API or real network calls.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const data = JSON.parse(read('content/news-posts.json'));
const origin = 'https://netvistastudio.com';
const repo = 'https://github.com/user1994g/videoediterNetVistaStudio.github.io';
const escape = text => text.replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
assert.equal(data.published, '2026-10-21', 'Keep the archive first-publication date, not historical event dates');
assert(data.posts.length >= 8, 'Retain the complete initial archive');
assert.equal(new Set(data.posts.map(post=>post.slug)).size, data.posts.length, 'Unique article URLs');
const hub = read('news/index.html');
const feed = read('news/feed.xml');
assert(!/auth-client|editor-locked/.test(hub), 'News remains public');
assert(hub.includes('href="/news/feed.xml"'), 'Readers can discover the RSS feed');
assert(hub.includes('Development preview—not a downloadable release.'), 'Keep released and in-development work distinct');
assert(hub.includes('milestone dates refer to earlier development records'), 'No fabricated historical publication dates');
assert.equal([...feed.matchAll(/<item>/g)].length, data.posts.length);
assert(!feed.includes('127.0.0.1') && !feed.includes('localhost'), 'Feed links are public');
for(const post of data.posts){
  const route = `/news/${post.slug}/`;
  const html = read(`news/${post.slug}/index.html`);
  const published = post.published || data.published;
  assert(hub.includes(`href="${route}"`), `${post.slug}: ordinary hub discovery link`);
  assert(feed.includes(`<link>${origin}${route}</link>`), `${post.slug}: feed discovery`);
  assert(html.includes(`<h1>${escape(post.title)}</h1>`));
  assert(html.includes(`Published <time datetime="${published}">`), 'Actual publication date is visibly distinct');
  assert(html.includes('Recorded milestone') && html.includes(escape(post.milestone)));
  assert(html.includes('href="/news/"'), 'Article links back to the archive');
  assert(html.includes(`href="${post.guide.href}"`), 'Useful related editing guide, not an orphaned keyword page');
  const graph = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1])['@graph'];
  const article = graph.find(node=>node['@type']==='NewsArticle');
  assert(article && article.headline===post.title);
  assert.equal(article.datePublished,published);
  assert.equal(article.dateModified,post.modified||published);
  assert.equal(article.mainEntityOfPage['@id'], origin+route+'#webpage');
  assert.deepEqual(article.citation,post.sources.map(source=>source.url));
  const words=post.sections.flatMap(section=>section.paragraphs).join(' ').split(/\s+/).length;
  assert(words>=180, `${post.slug}: substantive reporting, not a thin doorway page`);
  assert(post.sources.length>=1 && post.sources.every(source=>source.url.startsWith(repo+'/')), 'First-party development evidence');
  for(const source of post.sources) assert(html.includes(`href="${escape(source.url)}"`));
  if(post.status==='development') assert(html.includes('Development preview—not a downloadable release.'));
  if(post.discussionURL){
    assert(new RegExp('^'+repo.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'/discussions/[1-9][0-9]*$').test(post.discussionURL));
    assert(html.includes(`href="${post.discussionURL}"`), 'Each story has its own community conversation');
  }
}
const beta7=data.posts.find(post=>post.slug==='beta-7-mobile-editing-and-dedicated-3d');
assert.equal(beta7.milestone,'7 October 2026');
const beta6=data.posts.find(post=>post.slug==='beta-6-studio-home-and-quieter-startup');
assert.equal(beta6.milestone,'29 September 2026', 'Release date, not the previous-day preparation commit');
const preview=data.posts.find(post=>post.status==='development');
assert(/not included in the downloadable Beta 7/i.test(preview.sections.flatMap(section=>section.paragraphs).join(' ')), 'Source previews must not silently redefine the shipped beta');
execFileSync(process.execPath,[path.join(root,'scripts/build-news.mjs'),'--check'],{stdio:'pipe'});
console.log('PASS: public News archive, substantive sourced articles, truthful dates/platform status, RSS, article-specific conversations and reproducible output');
