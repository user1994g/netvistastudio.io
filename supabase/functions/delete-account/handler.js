// Server-only self-service deletion. No SQL strings or caller-supplied user ID.
const origins = new Set(['https://netvistastudio.com', 'https://www.netvistastudio.com', 'https://video.netvistastudio.com']);
const tokenPattern = /^Bearer [A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function createDeleteAccountHandler({ createClient, env }) {
  return async request => {
    const origin = request.headers.get('Origin');
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff', Vary: 'Origin' };
    if (origins.has(origin)) Object.assign(headers, { 'Access-Control-Allow-Origin': origin,
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
      'Access-Control-Allow-Methods': 'POST, OPTIONS' });
    const respond = (status, error) => new Response(JSON.stringify(error ? { error } : { deleted: true }), { status, headers });
    if (!origins.has(origin)) return respond(403, 'Open account settings on the NetVista website.');
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (request.method !== 'POST') return respond(405, 'Use the account deletion form.');
    const authorization = request.headers.get('Authorization') || '';
    if (authorization.length > 8192 || !tokenPattern.test(authorization)) return respond(401, 'Sign in again before deleting your account.');
    if ((request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase() !== 'application/json') return respond(415, 'A JSON request is required.');
    // Bound the streamed body as well as Content-Length (which callers can omit).
    const reader = request.body?.getReader();
    if (!reader) return respond(400, 'Complete the confirmation form.');
    let size = 0, chunks = [];
    try {
      while (true) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength;
        if (size > 4096) { await reader.cancel(); return respond(413, 'The confirmation is too long.'); }
        chunks.push(value);
      }
      const body = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength; }
      let input;
      try { input = JSON.parse(new TextDecoder().decode(body)); } catch { return respond(400, 'Invalid confirmation.'); }
      if (!input || Array.isArray(input) || typeof input !== 'object' ||
          Object.keys(input).some(key => !['password', 'confirmation'].includes(key)) ||
          input.confirmation !== 'DELETE' || typeof input.password !== 'string' ||
          !input.password.length || input.password.length > 1024) return respond(400, 'Enter your password and type DELETE to confirm.');
      const url = env('SUPABASE_URL'), publicKey = env('SUPABASE_ANON_KEY'), secretKey = env('SUPABASE_SERVICE_ROLE_KEY');
      if (!url || !publicKey || !secretKey) return respond(503, 'Account deletion is temporarily unavailable. Contact jackmiller@netvistastudio.com.');
      const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
      const client = createClient(url, publicKey, options);
      const jwt = authorization.slice(7);
      const verified = await client.auth.getUser(jwt);
      const user = verified.data?.user;
      if (verified.error || !uuidPattern.test(user?.id || '') || user.is_anonymous || !user.email) return respond(401, 'Sign in again before deleting your account.');
      // A stolen session alone is insufficient: reauthenticate the verified
      // account's own email. Input cannot choose an email or a deletion target.
      const fresh = await client.auth.signInWithPassword({ email: user.email, password: input.password });
      input.password = ''; chunks = [];
      if (fresh.error || fresh.data?.user?.id !== user.id || !fresh.data?.session?.access_token) return respond(403, 'Password verification failed. Check your password and try again.');
      const admin = createClient(url, secretKey, options);
      // Revoke refresh sessions before deletion. JWTs already issued can live
      // until expiry; consumers still validate the user with Auth, and progress
      // references auth.users ON DELETE CASCADE. No refresh session survives.
      const revoked = await admin.auth.admin.signOut(fresh.data.session.access_token, 'global');
      if (revoked.error) return respond(503, 'We could not close your sessions. No account was deleted; please try again.');
      const removed = await admin.auth.admin.deleteUser(user.id, false);
      if (removed.error) return respond(503, 'Your account was not deleted. Sign in again or contact jackmiller@netvistastudio.com.');
      return respond(200);
    } catch {
      // Never return provider responses, credentials or stack traces.
      return respond(503, 'Account deletion could not be confirmed. Check your account before retrying, or contact jackmiller@netvistastudio.com.');
    } finally { reader.releaseLock(); }
  };
}
