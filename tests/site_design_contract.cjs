const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const newsPosts = JSON.parse(read('content/news-posts.json')).posts;
const pages = ['index.html','applications/index.html','editor/index.html','editor/account/index.html','404.html','video-editor/index.html',...['getting-started','keyframes','colour-grading-luts','export-settings'].map(p=>`video-editor/${p}/index.html`),'news/index.html',...newsPosts.map(p=>`news/${p.slug}/index.html`)];
const headers=[];
for (const file of pages) {
 const html=read(file), ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,`${file}: unique DOM identifiers`);
 for (const match of html.matchAll(/\b(?:for|aria-controls|aria-labelledby|aria-describedby)="([^"]+)"/g)) for(const id of match[1].split(/\s+/)) assert(ids.includes(id),`${file}: missing referenced element ${id}`);
 for(const id of ['site-header','nav-toggle','primary-nav','search-toggle','search-panel','search-input','search-close','search-results'])assert(ids.includes(id),`${file}: shared shell ${id}`);
 assert(html.includes('class="nv-wordmark">NetVista <small>STUDIO</small>'),`${file}: consistent wordmark`);
 assert(html.includes('mobile-navigation.js?v=20261021-news1'),`${file}: current navigation controller`);
 const header=html.match(/<header\b[\s\S]*?<\/header>/)[0];
 headers.push(header.replaceAll('https://netvistastudio.com','').replaceAll(' class="is-active" aria-current="page"',''));
}
assert(headers.every(header=>header===headers[0]),'Every main-site page shares identical navigation and branding');
for(const [htmlFile,jsFile] of [['editor/account/index.html','editor/account/account.js'],['index.html','assets/js/app.js']]){
 const html=read(htmlFile), js=read(jsFile);
 for(const match of js.matchAll(/(?:\$|document\.querySelector)\(['"]#([A-Za-z][\w-]*)['"]\)/g)) assert(html.includes(`id="${match[1]}"`),`${htmlFile}: controller target #${match[1]} must survive layout changes`);
}
assert(read('index.html').includes('studio-home.css?v=20261021'),'Home uses its dedicated redesigned stylesheet');
assert(/\.nv-site\.overlay-open\s*\{[^}]*overflow:\s*hidden/.test(read('assets/css/studio-shared.css')),'Film overlays lock background scrolling');
assert(!read('index.html').includes('studio-theme.css'),'Do not stack the old home theme onto the new design');
assert(!read('video-beta/index.html').includes('studio-shared.css'),'Standalone Watch remains visually independent');
console.log('PASS: identical shared shell, original branding, unique IDs, ARIA targets, controller DOM contracts, dedicated styles and Watch isolation');
