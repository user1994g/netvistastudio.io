# NetVista search pages

The public website is served by the existing Cloudflare Pages project
`netvistastudio` on `https://netvistastudio.com`. Its automatic deployment follows
the main branch of the website source repository. App downloads remain on GitHub.

- `/`: NetVista brand, independent films and creative tools.
- `/video-editor/`: public feature/system overview for NetVista Studio.
- `/video-editor/getting-started/`: useful first-project editing guide.
- `/video-editor/keyframes/`: Mac scale/zoom and opacity keyframe workflow.
- `/video-editor/colour-grading-luts/`: Mac .cube import and node-stack LUT export.
- `/video-editor/export-settings/`: Mac format, resolution, frame rate and export troubleshooting.
- `/applications/`: creative collaborator applications.
- `/editor/`: existing sign-in/download flow, deliberately excluded from search.

The overview and guide are ordinary HTML that can be read without JavaScript or
an account. Keep links to them in the studio site so crawlers can discover them.
Do not expose account details or remove the download sign-in requirement for SEO.

Update the software version and release notes when a new beta is actually
published. Only describe shipped features and note platform differences. Never
add invented reviews, stars, or guarantees that every computer can export 16K.
Software metadata describes the app; it does not guarantee a Google rich result.

Update sitemap dates only when the corresponding page meaningfully changes.
Include only canonical, public HTML pages. Account/recovery URLs and download
assets do not belong in the sitemap.

Run `node tests/web_seo_regression.cjs` and the existing authentication/download
regression checks before publication. Verify the live public URLs, sitemap and
robots file after Cloudflare finishes deploying.

The root `404.html` is intentional: Cloudflare otherwise treats this static site
as an SPA and returns the homepage with a 200 for missing URLs. Keep real missing
paths at 404, and keep the error page out of the sitemap.

Public room/pixel-night illustrations use responsive WebP with JPEG fallbacks.
Original artwork remains unchanged. Run `node scripts/optimize-public-images.cjs
--check` with `sharp` available to verify outputs; run without `--check` to
regenerate them. Do not preload the inactive film slide or eagerly load all cards.

Canonical host redirects are configured in Cloudflare, not `_redirects` (Pages
does not support host matching there):
- First: `video.netvistastudio.com/` redirects permanently to the public
  `https://netvistastudio.com/video-editor/` overview.
- Then: remaining `video` and `www` requests permanently redirect to the apex
  with their path and query intact. Method-preserving 308 protects POST requests.
- Account Bulk Redirect list `netvista_canonical_pages`: only the production
  `netvistastudio.pages.dev/` host redirects to the apex with subpath matching,
  path suffix and query preservation enabled. Include subdomains is disabled so
  individual preview deployments remain available for QA.
These redirects consolidate duplicate pages; do not create cloned keyword
subdomains or doorway pages. Keep account/recovery paths and queries intact.

For search visibility monitoring, use Google Search Console with the verified
`netvistastudio.com` property. Submit `https://netvistastudio.com/sitemap.xml`,
inspect the home page and video-editor overview, and request indexing if needed.
Do not assume that a sitemap file itself confirms submission or indexing.
Google controls when pages are crawled and which searches they rank for.
Domain ownership verification succeeded on 3 October 2026 using a Cloudflare
DNS TXT record. Keep that record so Google can recheck ownership.
On the same date Search Console read the sitemap successfully and discovered
seven pages. The public video-editor overview passed Google's live test
("URL is available to Google" / "Page can be indexed"), and its indexing request
was accepted. These results confirm fetchability, not an indexing or ranking
guarantee. The first sitemap read failed transiently; a retry succeeded without
loosening the site's existing country-block security rule.

References:
- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://developers.google.com/search/docs/appearance/site-names
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
- https://developers.google.com/search/help/crawling-index-faq
- https://developers.cloudflare.com/pages/configuration/serving-pages/
- https://developers.cloudflare.com/pages/configuration/redirects/
