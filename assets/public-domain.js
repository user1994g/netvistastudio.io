// Keep the Cloudflare deployment address out of public browsing and shared links.
// Preserve account recovery fragments and query parameters when changing hosts.
if (location.hostname === 'netvistastudio.pages.dev') {
  location.replace('https://netvistastudio.com' + location.pathname + location.search + location.hash);
}
