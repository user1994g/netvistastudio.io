# NetVista Videos beta

`video-beta/` is the standalone **Videos/watch-film site**, inspired by the
supplied `velvet_stream.html` visual reference. It is not the Video Editor's
marketing, account or app-download page. Its address is
`https://video.netvistastudio.com/`. The main studio remains
`https://netvistastudio.com/`; the separate editor remains at
`https://netvistastudio.com/editor/`.

Only the two existing public films from `assets/js/data/catalog.js` appear.
There are no invented titles, ratings, release claims or subscriptions. The
site has a featured film, search, film details, an on-demand player, and My List.
My List uses a dedicated browser-storage key, not an account, and is not synced
across devices. It handles invalid/unavailable storage without breaking browsing.
Search, save and in-page playback are progressive enhancements: direct watch
links remain available without JavaScript.

Watching uses the existing external film provider. The iframe loads only after
a Watch action, closes cleanly, and has a direct-player fallback. Provider
availability is outside this site's control. Uploads, account syncing and playback
history are not implemented. Visible beta disclosures and `noindex, follow`
remain while the site develops.

Main-site HTML, styles, guides, shared navigation, catalogue and editor account
sources are unchanged. Editor login/download requirements remain intact; the
public Videos page does not load the editor auth SDK. The native app is unchanged.

## Deployment

This combined website still deploys from `user1994g/netvistastudio.io` to the
existing Cloudflare Pages project `netvistastudio`. App releases remain on GitHub.
There is no new hosting project or paid subscription. Root `_worker.js` serves `/video-beta/` internally only for the video host's
root/index request. Every main-host request is passed untouched to static assets.
`_routes.json` limits Function invocation to root/index/account entry paths;
it does not invoke the Function for artwork, styles, or the public guides.
Pages Functions have a request allowance; this is not a new paid subscription.

Cloudflare routing is configured as follows:

1. Source deploys through the existing Pages Git integration. Existing domain
   bindings and HTTPS remain active; nameservers and country rules are unchanged.
2. The old video-root-to-apex-overview redirect is disabled, not deleted.
3. The remaining canonical-host rule matches **www only**, not **video**.
   The `netvistastudio.pages.dev` Bulk Redirect remains unchanged.
4. UI corrections deploy through the same integration without changing the main
   root, applications, editor overview, account callback or security settings.

The worker redirects video `/account/` to video `/editor/account/` with a
method-preserving 308 and unchanged query. That maintains document-relative
account assets and Supabase's existing callback address. Browser URL fragments
are preserved by redirects and are not sent in HTTP requests. The worker does
not log credentials or inspect recovery tokens.
Do not convert that account redirect into an internal rewrite without also
fixing all account-relative assets and imports.

A previous permanent redirect may be cached by a visitor's browser; verify in a
fresh session or with `?videos=beta`. To restore the previous routing if needed,
re-enable the preserved video overview rule and restore video to the canonical
hostname condition. Do not change the main site, account or security settings.

## Checks

```sh
node --experimental-vm-modules tests/video_beta_regression.cjs
node --experimental-vm-modules tests/web_auth_regression.cjs
node --experimental-vm-modules tests/web_download_gate.cjs
node tests/web_seo_regression.cjs
```

The Videos regression verifies catalogue links, progressive watch fallbacks,
asset/anchor references, isolation from editor auth, browser-list parsing,
search/list intersection, HTML escaping, player URL validation and unchanged
host/account routing. No real account creation, reset emails or downloads are
required. The former app-marketing artwork is retained in source but not loaded
by this Videos page; current imagery is the existing film artwork.
