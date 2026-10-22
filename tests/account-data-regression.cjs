'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
async function fixture(options = {}) {
  const module = new vm.SourceTextModule(fs.readFileSync(path.join(__dirname, '../editor/account/account-data.js'), 'utf8'));
  await module.link(() => {}); await module.evaluate();
  const calls = [], user = { id: options.other ? other : id, email: 'synthetic@example.invalid', created_at: '2026-01-01',
    user_metadata: { display_name: '<script>literal name</script>', unneeded: 'not exported' }, secret: 'not exported', is_anonymous: !!options.anonymous };
  const client = {
    auth: { getUser: async () => ({ data: { user: options.noUser ? null : user }, error: options.invalid ? {} : null }),
      getSession: async () => ({ data: { session: { user: { id: options.sessionMismatch ? other : id }, access_token: 'synthetic.only.token' } } }) },
    from(table) { calls.push(['from', table]); return { select(fields) { calls.push(['select', fields]); return this; },
      eq(field, value) { calls.push(['eq', field, value]); return Promise.resolve({ data: [{ film_id: 'dark-echoes-1939', saved: true, position_seconds: 12 }], error: options.readFailure ? {} : null }); } }; },
    functions: { async invoke(name, input) { calls.push(['invoke', name, input]); return options.result || { data: { deleted: true } }; } }
  };
  return { module: module.namespace, client, calls };
}
(async () => {
  const f = await fixture(), output = await f.module.exportAccountData(f.client, id);
  assert.deepEqual(f.calls, [['from', 'watch_progress'], ['select', 'film_id,position_seconds,duration_seconds,completed,saved,last_watched_at,updated_at'], ['eq', 'user_id', id]]);
  assert.equal(output.account.email, 'synthetic@example.invalid'); assert.equal(output.watch_progress[0].position_seconds, 12);
  assert.equal(output.account.display_name, '<script>literal name</script>', 'JSON data is not HTML');
  assert(!JSON.stringify(output).includes('synthetic.only.token'), 'No session token is exported');
  assert.equal(output.account.access_token, undefined); assert.equal(output.account.refresh_token, undefined);
  assert.equal(output.account.secret, undefined); assert.equal(output.account.user_metadata, undefined);
  for (const options of [{ other: true }, { anonymous: true }, { noUser: true }, { invalid: true }]) {
    const f = await fixture(options);
    await assert.rejects(() => f.module.exportAccountData(f.client, id), /Sign in again/);
    await assert.rejects(() => f.module.deleteAccount(f.client, id, 'test-password', 'DELETE'), /Sign in again/);
    assert.equal(f.calls.length, 0, 'No row read or destructive request before owner verification');
  }
  const broken = await fixture({ readFailure: true }); await assert.rejects(() => broken.module.exportAccountData(broken.client, id), /Could not download/);
  const mismatch = await fixture({ sessionMismatch: true }); await assert.rejects(() => mismatch.module.deleteAccount(mismatch.client, id, 'test-password', 'DELETE'), /Sign in again/); assert.equal(mismatch.calls.length, 0);
  const deleted = await fixture(); assert.equal(await deleted.module.deleteAccount(deleted.client, id, 'test-password', 'DELETE'), true);
  assert.deepEqual(Object.keys(deleted.calls[0][2].body).sort(), ['confirmation', 'password']);
  for (const result of [{ data: {} }, { error: { context: new Response(JSON.stringify({ error: 'Password verification failed.' })) } }]) {
    const f = await fixture({ result }); await assert.rejects(() => f.module.deleteAccount(f.client, id, 'test-password', 'DELETE'));
  }
  console.log('PASS: remotely verified self-only data export, fixed owner query, no passwords/tokens, literal JSON, session mismatch and explicit deletion confirmation');
})().catch(error => { console.error(error); process.exitCode = 1; });
