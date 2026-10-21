# Publishing NetVista Studio news

The public news hub is https://netvistastudio.com/news/. It is ordinary HTML, readable without an account or JavaScript. The separate Watch site stays separate. GitHub Discussions hosts the conversation, not the website itself.

## Add an article

1. Add an entry to `content/news-posts.json`. Follow an existing post's structure. Use a unique lowercase hyphenated `slug`, a clear title, summary, description, sections, source links and an existing related guide.
2. Set the new post's `published` to its real publication date (`YYYY-MM-DD`). Do not change the top-level `published` fallback: it records the date of the original archive articles. Set `modified` only when you make an actual editorial revision.
3. Use `status: "development"` for unreleased work and `"released"` for an actual published release. A branch is not a download. Record historical event dates in `milestone`, not by backdating the article.
4. Run `node scripts/build-news.mjs` to rebuild the hub, articles and RSS feed. Add the new canonical URL to `sitemap.xml` using the article's real modification/publication date. Add it to the search catalogue in `assets/mobile-navigation.js`.
5. Run `for nv_test in tests/site_design_contract.cjs tests/*regression.cjs tests/web_download_gate.cjs; do node --experimental-vm-modules "$nv_test" || exit 1; done`. Preview both a narrow and wide screen.
6. Commit the content, generated HTML/feed, sitemap and search changes, then push the website repository. The existing Cloudflare project deploys `main`; no GitHub Pages website is needed.

## GitHub announcement

Publish a short summary in the app repository's **Announcements** discussion category, link to the full website article and the original release/commit, and label retrospectives as such. Do not duplicate an existing announcement or present a development build as a released beta. Discussion posts use their real publication timestamp.

## What SEO can and cannot do

Use helpful, specific articles with verifiable sources, self-canonical URLs, visible authorship and dates, connected article/breadcrumb/image metadata, crawlable internal links and an accurate sitemap. These help search engines understand the site; they do not guarantee indexing or a particular position for competitive phrases such as “video editor”. Avoid invented reviews, fake historical dates and near-duplicate keyword pages.
