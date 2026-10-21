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

## News-only advertising (prepared, not active)

A single responsive Google AdSense display unit is prepared for the News hub
only. The site is awaiting Google's approval and live consent-message validation.
Both `newsAdvertising.enabled` and `newsAdvertising.consentReviewed` in
`scripts/build-news.mjs` are deliberately `false`: there is no Google advertising
request, CMP initialization or empty ad space while either switch is off.
The publisher and ad-unit IDs are public identifiers, not credentials.

Before enabling: confirm the site's AdSense status is **Ready**, keep Auto Ads
**off**, publish and test Google's certified consent message (including a clear
Do not consent option), and review `/news/privacy.html`. Never replace this with
a cosmetic cookie popup or enable ads merely because a code snippet exists.
Google controls approval and ad availability; this integration guarantees neither.

When both reviewed switches are enabled and the News pages are rebuilt, the
controller permits only `https://netvistastudio.com/news/` (plus the equivalent
`/news/index.html` file route). Articles, the homepage, editor/account/download,
Watch, localhost and Pages previews never initialize this unit. It uses no Auto
Ads command, retries or ad-blocker workaround. Script failures leave the News
content usable. Google's documented `CONSENT_API_READY` callback reveals the
Privacy and cookie settings button; that button invokes
`googlefc.showRevocationMessage()` to let visitors revisit their choice.

Run `node tests/news-ads-regression.cjs` along with the full site regression suite.
Do not click live ads during testing. Rebuild with `node scripts/build-news.mjs`
after changing the two switches. Advertising is not an SEO ranking shortcut.
