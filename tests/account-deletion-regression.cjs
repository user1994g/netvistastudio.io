'use strict';
// Offline only: no real user, secret, email, account creation or deletion.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'supabase/functions/delete-account/handler.js'), 'utf8');
const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
async function fixture(options = {}) {
  const calls = [], context = vm.createContext({ Request, Response, TextDecoder, Uint8Array, Set });
  const module = new vm.SourceTextModule(source, { context }); await module.link(() => {}); await module.evaluate();
  const handler = module.namespace.createDeleteAccountHandler({
    env: name => ({ SUPABASE_URL: 'https://synthetic.invalid', SUPABASE_ANON_KEY: 'public-fixture', SUPABASE_SERVICE_ROLE_KEY: 'private-fixture' })[name],
    createClient(_url, key) {
      calls.push(['createClient', key]);
      return { auth: {
        getUser: async token => { calls.push(['getUser', token]); return { data: { user: options.noUser ? null : { id, email: 'test@example.invalid', is_anonymous: !!options.anonymous } }, error: options.invalidToken ? {} : null }; },
        signInWithPassword: async input => { calls.push(['reauth', { ...input }]); return { data: { user: { id: options.wrongUser ? other : id }, session: { access_token: 'fresh.fixture.token' } }, error: options.wrongPassword ? {} : null }; },
        admin: {
          signOut: async (...args) => { calls.push(['revoke', ...args]); return { error: options.revokeFailure ? {} : null }; },
          deleteUser: async (...args) => { calls.push(['delete', ...args]); if (options.throwDelete) throw Error('secret provider details'); return { error: options.deleteFailure ? {} : null }; }
        }
      } };
    }
  });
  return { calls, run: (input = { password: 'test-only-password', confirmation: 'DELETE' }, settings = {}) => {
    const headers = { Origin: 'https://video.netvistastudio.com', Authorization: 'Bearer fixture.only.token', 'Content-Type': 'application/json', ...settings.headers };
    const method = settings.method || 'POST';
    return handler(new Request('https://synthetic.invalid/functions/v1/delete-account', { method, headers, body: ['GET', 'HEAD', 'OPTIONS'].includes(method) ? undefined : settings.raw ?? JSON.stringify(input) }));
  } };
}
(async () => {
  for (const origin of ['https://netvistastudio.com', 'https://video.netvistastudio.com', 'https://www.netvistastudio.com']) {
    const f = await fixture(), response = await f.run(undefined, { headers: { Origin: origin } });
    assert.equal(response.status, 200); assert.deepEqual(await response.json(), { deleted: true });
    assert.equal(response.headers.get('Access-Control-Allow-Origin'), origin);
    assert.deepEqual(f.calls.filter(c => c[0] === 'revoke' || c[0] === 'delete'), [['revoke', 'fresh.fixture.token', 'global'], ['delete', id, false]], 'Only verified identity is deleted, after global session revocation');
  }
  for (const [settings, status] of [
    [{ headers: { Origin: 'https://evil.invalid' } }, 403], [{ headers: { Authorization: '' } }, 401],
    [{ headers: { Authorization: 'Bearer not-a-jwt' } }, 401], [{ method: 'GET' }, 405],
    [{ headers: { 'Content-Type': 'text/plain' } }, 415], [{ headers: { 'Content-Type': 'application/jsonp' } }, 415], [{ raw: '{broken' }, 400],
    [{ raw: ' '.repeat(4097) }, 413]
  ]) { const f = await fixture(); assert.equal((await f.run(undefined, settings)).status, status); assert.equal(f.calls.length, 0); }
  for (const input of [{ password: 'x', confirmation: 'DELETE', user_id: other }, { password: 'x', confirmation: 'DELETE', email: 'victim@example.invalid' }, { password: 'x', confirmation: 'delete' }, { password: null, confirmation: 'DELETE' }, []]) {
    const f = await fixture(); assert.equal((await f.run(input)).status, 400); assert.equal(f.calls.length, 0);
  }
  for (const [options, status] of [[{ noUser: true }, 401], [{ invalidToken: true }, 401], [{ anonymous: true }, 401], [{ wrongUser: true }, 403], [{ wrongPassword: true }, 403], [{ revokeFailure: true }, 503]]) {
    const f = await fixture(options); assert.equal((await f.run()).status, status); assert(!f.calls.some(c => c[0] === 'delete'));
  }
  const injected = await fixture(); await injected.run({ password: "' OR 1=1; -- <script>alert(1)</script>", confirmation: 'DELETE' });
  assert.equal(injected.calls.find(c => c[0] === 'reauth')[1].password, "' OR 1=1; -- <script>alert(1)</script>", 'Code-like passwords remain literal JSON data, never executed or SQL');
  const failure = await fixture({ throwDelete: true }); const response = await failure.run();
  assert.equal(response.status, 503); assert(!(await response.text()).includes('secret provider'));
  assert.equal((await (await fixture()).run(undefined, { method: 'OPTIONS' })).status, 204);
  console.log('PASS: self-only deletion, trusted origins/methods, bounded JSON, fresh password verification, session revocation, failure safety and literal injection input');
})().catch(error => { console.error(error); process.exitCode = 1; });
