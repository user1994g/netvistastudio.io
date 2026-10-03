# NetVista search pages

The public website is served by the existing Cloudflare Pages project
`netvistastudio` on `https://netvistastudio.com`. Its automatic deployment follows
the main branch of the website source repository. App downloads remain on GitHub.

- `/`: NetVista brand, independent films and creative tools.
- `/video-editor/`: public feature/system overview for NetVista Studio.
- `/video-editor/getting-started/`: useful first-project editing guide.
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

For search visibility monitoring, use Google Search Console with the verified
`netvistastudio.com` property. Submit `https://netvistastudio.com/sitemap.xml`,
inspect the home page and video-editor overview, and request indexing if needed.
Do not assume that a sitemap file itself confirms submission or indexing.
Google controls when pages are crawled and which searches they rank for.

References:
- https://developers.google.com/search/docs/fundamentals/seo-starter-guide
- https://developers.google.com/search/docs/appearance/site-names
- https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
