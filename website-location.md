# Website ownership

All public website source belongs to this repository (`user1994g/netvistastudio.io`),
locally at `/Volumes/Crucial X9/400.github.io`.

- `/`: main studio, films and media pages
- `/applications/`: application form
- `/editor/`: desktop editor product page and GitHub downloads
- `/editor/account/`: account pages

The desktop app source and downloadable releases remain in
`user1994g/videoediterNetVistaStudio.github.io`. Edit website files here directly;
do not recreate a `docs/` website in the app repository.

Run website regression tests from this directory:

```sh
node --experimental-vm-modules tests/web_auth_regression.cjs
node --experimental-vm-modules tests/web_download_gate.cjs
```

Password-email redirects retain their existing working branded address until
the new Cloudflare account callback is configured in Supabase.
