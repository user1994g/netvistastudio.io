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

The existing Cloudflare redirect rules documented in `SEO.md` currently send
the video hostname to the apex. Before publishing on the video subdomain:

1. Deploy this source through the existing Pages Git integration. Keep both
   existing domain bindings and HTTPS; do not change nameservers or country rules.
2. Disable the rule redirecting the video host's `/` to apex `/video-editor/`.
3. Narrow the remaining canonical-host rule to **www only**, removing **video**.
   Leave the `netvistastudio.pages.dev` Bulk Redirect unchanged.
4. Verify the video root returns the beta page without an apex redirect, and the
   main root, applications, guides and recovery flow still work.

The worker redirects video `/account/` to video `/editor/account/` with a
method-preserving 308 and unchanged query. That maintains document-relative
account assets and Supabase's existing callback address. Browser URL fragments
are preserved by redirects and are not sent in HTTP requests. The worker does
not log credentials or inspect recovery tokens.
Do not convert that account redirect into an internal rewrite without also
fixing all account-relative assets and imports.

Until both the source deployment and redirect-rule changes are complete, the
new design is **not live** on the video subdomain. A previous permanent redirect
may be cached by a visitor's browser; verify in a fresh browser session.

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
this source/deployment. Real account creation/reset was not sent during QA.
