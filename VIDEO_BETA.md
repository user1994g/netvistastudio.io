# NetVista Watch public beta

The standalone film site is `https://video.netvistastudio.com/`. It is not the
Video Editor marketing/download page. Its editorial independent-cinema design
uses a warm paper palette, teal accents, framed artwork and original NetVista
typography rather than a red condensed streaming-service wordmark. It has a
public welcome and Plans section, and a signed-in cinematic library. Only the
two existing published originals appear; no fake films, ratings or release
claims are used. The native app and main website are unchanged.

## Plans

The only available option is **Free plan with ads**, at £0. Existing Watch
accounts already use that plan; guests join through the existing NetVista
account flow. There is no paid subscription, payment form, checkout, trial or
new subscription database. The public page explicitly states that advertising
is planned and **is not active in this Watch beta yet**. This is not a deployment
of the separate News-page AdSense feature onto Watch.

The future-plans panel is information only: other plans have not been released
and cannot be bought or joined. No prices, dates or paid features are promised.

## Accounts and private history

Watch imports the **same pinned `editor/assets/auth-client.js`** and Supabase
project as the app website. Existing accounts work; no second user directory or
password database is created. Sessions belong to the watch origin, so signing
in on the main domain does not automatically sign in on this subdomain.

The collection is empty and hidden until `getUser()` verifies the account.
`GET /api/watch/catalog` validates its bearer token with Supabase on the server;
missing, expired, spoofed and anonymous sessions cannot retrieve it. Responses
are private/no-store. The main site's public catalogue source is blocked on the
watch host, including URL-encoded aliases. Origin checks complement, not replace,
token verification. No service-role key is shipped or used.

`database/watch_progress.sql` records the applied `netvista_watch_progress`
Supabase migration. `watch_progress` stores one small row per account/film:
position, duration, completion, saved-list flag and last-watched timestamp.
Owner-only SELECT/INSERT/UPDATE/DELETE RLS, a composite primary key, allowed film
IDs and bounded numeric fields protect it. Anonymous access is revoked. Account
deletion cascades history deletion. There are no IP/device/event-history logs.
Add future film IDs to the table constraint when adding published originals.

My List and Continue watching load from this table, not a device-wide local
list. Account changes/sign-out clear the previous account's DOM and memory.
History load failure blocks watching rather than overwriting unknown progress.
Writes are serialized and generation-guarded against account-switch races.

Playback uses native video controls and the provider's stable
`/api/public/stream/{film-id}` routes, which are the same sources used by its
embed. Playback resumes after metadata loads. Progress saves on playing,
pause, seek, completion, close and every 15 seconds during playback. Page exit
has a best-effort keepalive checkpoint. Redirected signed storage URLs expire
and are never stored. Completed films leave Continue watching but stay playable;
users can restart or remove a film from that rail without removing it from My List.

Unchecking **Keep in Continue watching** only clears the nullable membership
timestamp. It retains the exact resume position, duration, completion and My List
choice. A successful save offers Undo; a failed save restores membership and
explains how to retry. Detail/player controls reflect the same choice. Playback
checkpoints, close and page-exit writes cannot re-add an unticked film in that
session. Deliberately opening a new playback session or rechecking adds it back.
SDK writes and keepalives share a single queue which reads the latest state;
stale account operations cannot update another account's UI. No new schema or
subscription records are required.

**Boundary:** these films were already public on the main site/provider.
Login gates the Watch experience; it does not turn the external files into
private/DRM media. Native streams may fail if the external provider is unavailable.
No password, account creation or reset email is used by offline tests.

## SEO and deployment

The latest request makes the **public welcome page discoverable**: index/follow,
own canonical and social metadata, WebSite structured data, own-host robots and
sitemap. Account/API paths are excluded; authenticated UI sets noindex locally.
The sitemap does not expose private history or invent public film pages. Search
engines control crawling/ranking; metadata cannot guarantee placement.

Source still deploys from `user1994g/netvistastudio.io` through the existing
Cloudflare Pages `netvistastudio` Git integration. No new hosting subscription,
DNS changes or app release. The root Worker isolates watch HTML from the apex;
main site/editor pages still pass through unchanged. Asset-only image/CSS/script
paths bypass Functions, but `/assets/js/*` now runs through the Worker so the
watch host can deny its legacy public catalogue script.

Video `/account/` still redirects with HTTP 308 to same-host `/editor/account/`
for established Supabase email callbacks and relative assets. Legacy editor
exits redirect to the main editor. Password resets use this real HTTPS address,
never localhost. Main/editor authentication and downloads are unchanged.

Cloudflare: old video-to-editor redirect remains disabled, canonical www-only
rule and production Pages bulk redirect are unchanged, as are country rules.
A previous browser-cached permanent redirect may require a fresh session or
`?watch=beta` once. Existing source images are reused; no new remote media copied.

## Checks

```sh
node --experimental-vm-modules tests/video_beta_regression.cjs
node --experimental-vm-modules tests/watch-progress-regression.cjs
node tests/watch-design-regression.cjs
node --experimental-vm-modules tests/web_auth_regression.cjs
node --experimental-vm-modules tests/web_download_gate.cjs
node tests/web_seo_regression.cjs
```

Also verify live HTTP root/robots/sitemap, unauthenticated catalogue denial,
main/editor isolation and legacy callback assets after Cloudflare deploys.
Browser QA covers desktop/mobile welcome/login and signed-in synthetic fixtures
without production test accounts. Real user login/playback cross-device QA is
performed by the account owner, not using their password in automation.
