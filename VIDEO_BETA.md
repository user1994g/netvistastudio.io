# Video subdomain beta design

`video-beta/` is an isolated cinematic landing page inspired by the supplied
`velvet_stream.html` visual reference, not its fictional streaming catalogue.
It describes the desktop editor's published Beta 6, includes visible unfinished
software/platform caveats, and reuses the existing fresh sign-in and GitHub
download chooser. Main-site HTML, styles, guides, navigation and auth sources
are unchanged. The native app is unchanged.

The page's production address is `https://video.netvistastudio.com/`.
The main studio remains `https://netvistastudio.com/`.
Account-required pages remain `noindex`; no duplicate SEO landing pages or
fictional reviews/ratings have been added. Account credentials are not needed
for any offline test.

## Deployment

This combined website still deploys from `user1994g/netvistastudio.io` to the
existing Cloudflare Pages project `netvistastudio`. App releases remain on GitHub.
The root `_worker.js` serves `/video-beta/` internally only for the video host's
root/index request. Every main-host request is passed untouched to static assets.
`_routes.json` limits Function invocation to root/index/account entry paths;
it does not invoke the Function for artwork, styles, or the public guides.
Pages Functions have a request allowance; this is not a new paid subscription.

Published and verified on 4 October 2026. The live video root and `/index.html`
return this beta HTML with HTTP 200 and no redirect to the main site. Cloudflare
routing is configured as follows:

1. Source deploys through the existing Pages Git integration. Existing domain
   bindings and HTTPS remain active; nameservers and country rules are unchanged.
2. The old video-root-to-apex-overview redirect is disabled, not deleted.
3. The remaining canonical-host rule matches **www only**, not **video**.
   The `netvistastudio.pages.dev` Bulk Redirect remains unchanged.
4. Live checks confirmed the beta HTML, CSS, JS and artwork match source, while
   the main root, applications and public editor overview remain byte-for-byte
   unchanged. Account routing returned the expected same-host redirect and page.

The worker redirects video `/account/` to video `/editor/account/` with a
method-preserving 308 and unchanged query. That maintains document-relative
account assets and Supabase's existing callback address. Browser URL fragments
are preserved by redirects and are not sent in HTTP requests. The worker does
not log credentials or inspect recovery tokens.
Do not convert that account redirect into an internal rewrite without also
fixing all account-relative assets and imports.

A previous permanent redirect may be cached by a visitor's browser; verify in a
fresh browser session. To restore the previous routing if a rollback is needed,
re-enable the preserved video overview rule and restore video to the canonical
hostname condition. Do not change the main site, account or security settings.

## Checks

```sh
node --experimental-vm-modules tests/video_beta_regression.cjs
node --experimental-vm-modules tests/web_auth_regression.cjs
node --experimental-vm-modules tests/web_download_gate.cjs
node tests/web_seo_regression.cjs
```

New imagery reuses the app's own coast, flower and world artwork. Regenerate
the optimized WebP/JPEG derivatives with `sharp` available:

```sh
node scripts/prepare-video-beta-art.cjs '/absolute/path/to/app/assets'
```

UI verification: 1280px desktop, 768px tablet, 390px phone and 320px narrow phone;
no page-level overflow; real browser mock-auth entry, menu/Escape, filters,
search/empty/reset and download chooser. Offline auth fixtures are not part of
this source/deployment. A fresh live browser confirmed the beta sign-in screen,
account tab switching and no warning/error console messages. Real account
creation/reset was not sent during QA.
