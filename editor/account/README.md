# NetVista Studio account setup

The account page uses Supabase Auth with the browser-safe publishable key. It never includes a service-role key and it does not store project files in the account database.

## Supabase dashboard settings

In the NetVista Supabase project (`tsitgxafmtzjgtmiczsq`), open **Authentication → URL Configuration** and set:

- **Site URL:** `https://video.netvistastudio.com/`
- **Additional Redirect URLs:** `https://video.netvistastudio.com/account/`

Keep the **Email** provider enabled. Email confirmation is controlled in Supabase, not by a GitHub Pages deployment. For the NetVista Studio beta, **Confirm email is currently disabled**, so new accounts can sign in immediately without waiting for a message. Disabling confirmation means signup does not prove ownership of an email address.

All confirmation and recovery requests use the production account URL above, even when testing the website locally. The redirect must be allowed in Supabase; otherwise Supabase can fall back to its configured Site URL.

## What the page supports

- Email/password sign-in
- New account creation with an optional display name
- Password reset email and a new-password form on return
- Password changes for signed-in users
- Persistent browser sessions and sign-out
- A link back to the native editor download page

The main editor landing page uses the same client and opens this sign-in/create-account flow inline when a visitor chooses **Get the beta**. The Account page remains available as the confirmation and password-reset return route, but it is not required from the main navigation.

Entering the download page requires successful sign-in or signup in that dialog. Downloads reuse this page's verified access until it is closed, reloaded or re-locked on browser-history restoration. Existing sessions still work for account management. This is a website workflow, not file confidentiality: public GitHub release assets remain accessible directly.

The website deploys through the existing Cloudflare Pages integration. Supabase handles password storage and token exchange; the site only receives the user session through the official JavaScript client. The Watch catalogue also relies on its Cloudflare Worker, not static GitHub Pages hosting.

Credential fields remain disabled until authentication loads, have no HTML submission names, and use POST forms as a fallback. JavaScript cancels native submissions before loading the remote client. Login values stay structured Auth data; a blacklist of punctuation is not an injection defence. Account messages use text-only rendering. Frame embedding, base-URL rewriting, native form actions and object plugins are restricted on login surfaces.

## Data, deletion and privacy

The account page offers a JSON download of the remotely verified user's profile and owned Watch rows. Passwords, tokens, other users, local projects and provider logs are excluded. Privacy requests for other information use the domain contact in `/privacy/`.

Self-service deletion calls the server-only Supabase Edge Function `delete-account`. It verifies the bearer with Auth, derives the target from that identity (never request user ID), verifies the current password against the same account, requires exact `DELETE` confirmation, revokes refresh sessions globally and hard-deletes that Auth account. The deployed `watch_progress_user_id_fkey` cascades its progress/list rows. Current project has no Storage buckets. Existing access JWTs can remain cryptographically valid until expiry: consumers must still validate the user and enforce RLS; do not claim instant token invalidation.

`SUPABASE_SERVICE_ROLE_KEY` is read only from Edge Function environment, never included in static/browser files. The function requires JWT verification as well as its own getUser check, exact trusted website origins, POST JSON and a bounded body. New functions are deployed separately from Cloudflare. Do not test deletion using a real user's account.

Confirmation is bound to the opening identity and invalidated on account change/recovery. A completed deletion cannot sign out a different newly switched account. The shared storage adapter serializes session writes and owner-checked deletion cleanup with a Web Lock; an SDK reload discards old in-memory state. If cross-tab locking is unavailable, cleanup does not risk deleting a different account's shared storage; remote user verification prevents a deleted profile being displayed. Users can also clear browser site data on shared devices. Ambiguous errors are never treated as success.

Clarity is no longer loaded directly by HTML. `/assets/privacy-controls.js` defaults to necessary-only and offers equal accept/reject, withdrawal, GPC handling and a180-day per-origin choice; no analytics request occurs without valid opt-in. News and Watch advertising remain disabled. No legal compliance certification is implied. Operator identity/country, processor transfer arrangements and exact backup/log retention still require operational/legal review; no address was fabricated.

Checks: `node --experimental-vm-modules tests/web_auth_regression.cjs`, `tests/account-deletion-regression.cjs`, `tests/video_beta_regression.cjs`, and `node tests/privacy-consent-regression.cjs`. All use synthetic inputs, no real accounts.
