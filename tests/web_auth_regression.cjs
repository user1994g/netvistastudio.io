// Run with: node --experimental-vm-modules tests/web_auth_regression.cjs
// Offline unit tests: synthetic DOM and Auth service, no real accounts/passwords.
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..');
const read = p => fs.readFileSync(path.join(root, p), 'utf8');
const redirect = 'https://video.netvistastudio.com/account/';
const tick = () => new Promise(resolve => setImmediate(resolve));
const accountA = '11111111-1111-4111-8111-111111111111';
const accountB = '22222222-2222-4222-8222-222222222222';
const storageKey = 'sb-tsitgxafmtzjgtmiczsq-auth-token';
const storageLock = 'netvista-auth-storage-v1';
const sessionFor = (id = accountA, email = id === accountB ? 'b@example.invalid' : 'a@example.invalid') => ({
  user: { id, email }, access_token: id === accountB ? 'synthetic.b.token' : 'synthetic.a.token'
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

for (const file of ['editor/index.html', 'editor/account/index.html']) {
  const html = read(file);
  for (const form of html.matchAll(/<form\b[^>]*>[\s\S]*?<\/form>/g)) {
    assert.match(form[0], /method="post"/);
    assert.match(form[0], /<fieldset disabled/);
    for (const input of form[0].matchAll(/<input\b[^>]*>/g)) {
      assert(!/\bname=/.test(input[0]), 'Native submission must not serialize input values');
    }
  }
}
assert(read('editor/assets/auth-client.js').includes("export const authRedirect = '" + redirect + "'"));
assert(!read('editor/assets/site.js').includes('window.location.origin'));
assert.match(read('editor/assets/auth-client.js'), /import\s*\{\s*authStorage\s*\}\s*from\s*'\.\/auth-storage\.js\?v=1'/);
assert.match(read('editor/assets/auth-client.js'), /storage:\s*authStorage/);

async function account({ fail = false, session = null, hash = '', search = '', pending = false,
  deleteResult = { data: { deleted: true } }, verifiedUser, locks = true, lockWait,
  lockError = false, storageBlocked = false } = {}) {
  const nodes = new Map(), calls = [], storageCalls = [], replacements = [], lockCalls = [];
  const storage = new Map(session ? [[storageKey, JSON.stringify(session)]] : []);
  let currentSession = session, inLock = false, lockChain = Promise.resolve();
  function node(id) {
    if (nodes.has(id)) return nodes.get(id);
    const e = { value: '', hidden: false, disabled: id.endsWith(':fieldset'), textContent: '',
      classList: { toggle() {} }, setAttribute() {}, checkValidity() { return this.value.includes('@'); },
      handlers: {}, addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
      open: false, focus() { this.focused = true; }, showModal() { this.open = true; },
      close() { if (!this.open) return; this.open = false; for (const fn of this.handlers.close || []) fn(); },
      querySelector() { return node(id + ':fieldset'); },
      reset() {
        const prefix = id === '#delete-account-form' ? '#delete-account-' : id.replace(/-(?:panel|form)$/, '-');
        for (const [name, input] of nodes) if (name.startsWith(prefix) && !name.includes(':')) input.value = '';
      },
      start(type = 'click') {
        const event = { prevented: false, preventDefault() { this.prevented = true; } };
        const operations = (this.handlers[type] || []).map(fn => fn(event));
        return { event, settled: Promise.all(operations).then(async () => { await tick(); await tick(); }) };
      },
      async fire(type = 'click') {
        const operation = this.start(type); await operation.settled; return operation.event;
      }
    };
    nodes.set(id, e); return e;
  }
  let onChange, release;
  const auth = {
    onAuthStateChange(fn) { onChange = fn; },
    async getSession() { assert(!inLock, 'Session cleanup must not call the SDK while holding the shared storage lock'); return { data: { session: currentSession } }; },
    async getUser() { assert(!inLock, 'Session cleanup must not call the SDK while holding the shared storage lock'); return { data: { user: verifiedUser === undefined ? currentSession?.user || null : verifiedUser } }; },
    async signInWithPassword(args) { calls.push(['signin', args]); currentSession = sessionFor(accountA, args.email); return { data: { session: currentSession } }; },
    async signUp(args) { calls.push(['signup', args]); currentSession = sessionFor(accountA, args.email); return { data: { session: currentSession } }; },
    async resetPasswordForEmail(...args) { calls.push(['reset', ...args]); return { data: {} }; },
    async updateUser(args) { calls.push(['update', args]); return { data: {} }; },
    async signOut() { calls.push(['signout']); currentSession = null; return { data: {} }; }
  };
  const functions = {
    async invoke(name, args) { calls.push(['invoke', name, args]); return typeof deleteResult === 'function' ? deleteResult(name, args) : deleteResult; }
  };
  const client = { auth, functions };
  const localStorage = {
    getItem(key) { storageCalls.push(['get', key]); if (storageBlocked) throw Error('Synthetic storage unavailable'); return storage.get(key) ?? null; },
    removeItem(key) { storageCalls.push(['remove', key]); if (storageBlocked) throw Error('Synthetic storage unavailable'); storage.delete(key); },
    setItem(key, value) { storageCalls.push(['set', key, String(value)]); if (storageBlocked) throw Error('Synthetic storage unavailable'); storage.set(key, String(value)); }
  };
  const navigator = locks ? { locks: {
    async request(name, options, operation) {
      lockCalls.push(name);
      assert.equal(name, storageLock, 'Cleanup shares the browser auth-storage adapter lock');
      assert.equal(options.mode, 'exclusive');
      if (lockError) throw Error('Synthetic lock unavailable');
      const callback = typeof options === 'function' ? options : operation;
      const task = lockChain.catch(() => {}).then(async () => {
        if (lockWait) await lockWait;
        inLock = true;
        try { return await callback(); } finally { inLock = false; }
      });
      lockChain = task;
      return task;
    }
  } } : {};
  const window = { location: { hash, search, pathname: '/account/', replace(url) { replacements.push(url); } },
    history: { replaceState(...args) { calls.push(['history', ...args]); } } };
  const context = vm.createContext({ document: { querySelector: node }, window, navigator, localStorage, URLSearchParams, setTimeout, clearTimeout });
  const accountData = new vm.SourceTextModule(read('editor/account/account-data.js'), { context });
  await accountData.link(() => {});
  const authStorage = new vm.SourceTextModule(read('editor/assets/auth-storage.js'), { context });
  await authStorage.link(() => {});
  const dependency = new vm.SyntheticModule(['supabase', 'authRedirect'], function() {
    this.setExport('supabase', client); this.setExport('authRedirect', redirect);
  }, { context });
  const source = new vm.SourceTextModule(read('editor/account/account.js'), { context,
    importModuleDynamically: async () => {
      if (pending) await new Promise(resolve => { release = resolve; });
      if (fail) throw new Error('offline');
      await dependency.link(() => {}); await dependency.evaluate(); return dependency;
    }
  });
  await source.link(specifier => {
    if (specifier === './account-data.js?v=1') return accountData;
    assert.equal(specifier, '../assets/auth-storage.js?v=1'); return authStorage;
  });
  const evaluating = source.evaluate(); await tick();
  if (!pending) await evaluating;
  return { node, calls, auth, functions, storage, storageCalls, replacements, lockCalls, evaluating,
    storageAdapter: authStorage.namespace.authStorage, clearDeletedSession: authStorage.namespace.clearDeletedSession,
    release: () => release(),
    async event(event, next, { persist = true } = {}) {
      currentSession = next;
      if (persist) {
        if (next) storage.set(storageKey, JSON.stringify(next)); else storage.delete(storageKey);
      }
      onChange(event, next); await tick(); await tick();
    }
  };
}
async function openDeletion(fixture) {
  await fixture.node('#open-delete-account').fire();
  assert(fixture.node('#delete-account-dialog').open, 'A signed-in account can open deletion settings');
  fixture.node('#delete-account-password').value = 'synthetic-current-password';
  fixture.node('#delete-account-confirm').value = 'DELETE';
}
(async () => {
  const failed = await account({ fail: true });
  assert(failed.node('#signin-panel:fieldset').disabled);
  assert((await failed.node('#signin-panel').fire('submit')).prevented);
  assert(failed.node('#delete-account-form:fieldset').disabled);
  assert((await failed.node('#delete-account-form').fire('submit')).prevented);
  await failed.node('#open-delete-account').fire();
  assert(!failed.node('#delete-account-dialog').open);
  assert.equal(failed.calls.length, 0);
  assert.match(failed.node('#status').textContent, /could not load/);
  const delayed = await account({ pending: true });
  assert(delayed.node('#signin-panel:fieldset').disabled);
  assert((await delayed.node('#signin-panel').fire('submit')).prevented);
  assert(delayed.node('#delete-account-form:fieldset').disabled);
  assert((await delayed.node('#delete-account-form').fire('submit')).prevented);
  assert.equal(delayed.calls.length, 0);
  delayed.release(); await delayed.evaluating;
  assert(!delayed.node('#signin-panel:fieldset').disabled);
  const normal = await account();
  normal.node('#signin-email').value = ' test@example.invalid ';
  normal.node('#signin-password').value = 'synthetic-only';
  assert((await normal.node('#signin-panel').fire('submit')).prevented);
  assert.equal(normal.calls[0][1].email, 'test@example.invalid');
  assert.equal(normal.calls[0][1].password, 'synthetic-only');
  assert(!normal.node('#signed-in-panel').hidden);
  const literal = await account();
  literal.node('#signin-email').value = "x' OR 1=1--@example.invalid";
  literal.node('#signin-password').value = "'; DROP TABLE users; -- <script>";
  await literal.node('#signin-panel').fire('submit');
  assert.equal(literal.calls[0][1].email, "x' OR 1=1--@example.invalid");
  assert.equal(literal.calls[0][1].password, "'; DROP TABLE users; -- <script>", 'SQL/code-like text is literal Auth input, not executable code');
  const signup = await account();
  signup.node('#signup-email').value = 'test@example.invalid';
  signup.node('#signup-password').value = 'synthetic-only';
  signup.node('#signup-name').value = '<b>Test</b>';
  assert((await signup.node('#signup-panel').fire('submit')).prevented);
  assert.equal(signup.calls[0][1].options.emailRedirectTo, redirect);
  assert.equal(signup.calls[0][1].options.data.display_name, '<b>Test</b>');
  const recovery = await account({ session: sessionFor(accountA, 'test@example.invalid'), hash: '#type=recovery&access_token=synthetic' });
  assert(!recovery.node('#recovery-panel').hidden);
  recovery.node('#recovery-password').value = 'synthetic-new';
  recovery.node('#recovery-confirm').value = 'mismatch';
  await recovery.node('#recovery-panel').fire('submit');
  assert(!recovery.calls.some(c => c[0] === 'update'));
  recovery.node('#recovery-confirm').value = 'synthetic-new';
  await recovery.node('#recovery-panel').fire('submit');
  assert(recovery.calls.some(c => c[0] === 'update' && c[1].password === 'synthetic-new'));
  const expired = await account({ hash: '#error_code=otp_expired&error_description=%3Cscript%3E' });
  assert.match(expired.node('#status').textContent, /already used/);
  assert(!expired.node('#status').textContent.includes('<script>'));
  expired.node('#signin-email').value = 'test@example.invalid';
  await expired.node('#forgot-password').fire();
  assert(expired.calls.some(c => c[0] === 'reset' && c[2].redirectTo === redirect));
  const thrown = await account();
  thrown.auth.signInWithPassword = async () => { throw Error('Network failure'); };
  await thrown.node('#signin-panel').fire('submit');
  assert(!thrown.node('#signin-panel:fieldset').disabled);
  assert.equal(thrown.node('#status').textContent, 'Network failure');

  // A deletion intent belongs to the account displayed when the dialog opened.
  // A stale confirmation must not gain authority over a subsequently signed-in B.
  const switched = await account({ session: sessionFor(accountA) });
  await openDeletion(switched);
  assert.equal(switched.node('#delete-account-email').textContent, 'a@example.invalid');
  await switched.event('SIGNED_IN', sessionFor(accountB));
  assert(!switched.node('#delete-account-dialog').open);
  assert.equal(switched.node('#delete-account-password').value, '');
  switched.node('#delete-account-password').value = 'old-account-confirmation';
  switched.node('#delete-account-confirm').value = 'DELETE';
  assert((await switched.node('#delete-account-form').fire('submit')).prevented);
  assert(!switched.calls.some(call => call[0] === 'invoke'), 'Old A confirmation cannot invoke deletion for B');
  assert.equal(switched.node('#signed-in-email').textContent, 'b@example.invalid');
  assert.equal(JSON.parse(switched.storage.get(storageKey)).user.id, accountB);

  // Completion of an already authorized A request must not sign out or erase B.
  const pendingDeletion = deferred();
  const raced = await account({ session: sessionFor(accountA), deleteResult: () => pendingDeletion.promise });
  await openDeletion(raced);
  const deleting = raced.node('#delete-account-form').start('submit');
  assert(deleting.event.prevented);
  await tick(); await tick();
  assert(raced.calls.some(call => call[0] === 'invoke'));
  assert(raced.node('#delete-account-form:fieldset').disabled);
  assert(raced.node('#cancel-delete-account').disabled);
  assert((await raced.node('#delete-account-dialog').fire('cancel')).prevented, 'An in-flight deletion cannot be dismissed by Escape');
  await raced.event('SIGNED_IN', sessionFor(accountB));
  const storedB = raced.storage.get(storageKey);
  pendingDeletion.resolve({ data: { deleted: true } });
  await deleting.settled;
  assert.equal(raced.node('#signed-in-email').textContent, 'b@example.invalid');
  assert(!raced.node('#signed-in-panel').hidden, 'A completion preserves B account UI');
  assert.equal(raced.storage.get(storageKey), storedB, 'A completion preserves B persisted session');
  assert(!raced.storageCalls.some(call => call[0] === 'remove'), 'No session is removed when persisted owner is B');
  assert(!raced.calls.some(call => call[0] === 'signout'), 'A completion must not call shared-client signOut');
  assert.deepEqual(raced.replacements, [], 'A completion must not reload the newly signed-in B');
  assert.equal(raced.node('#delete-account-password').value, '');

  for (const event of ['SIGNED_OUT', 'PASSWORD_RECOVERY']) {
    const invalidated = await account({ session: sessionFor(accountA) });
    await openDeletion(invalidated);
    await invalidated.event(event, event === 'SIGNED_OUT' ? null : sessionFor(accountA));
    assert(!invalidated.node('#delete-account-dialog').open, event + ' invalidates the open deletion dialog');
    assert.equal(invalidated.node('#delete-account-password').value, '');
    invalidated.node('#delete-account-password').value = 'old-confirmation';
    invalidated.node('#delete-account-confirm').value = 'DELETE';
    assert((await invalidated.node('#delete-account-form').fire('submit')).prevented);
    assert(!invalidated.calls.some(call => call[0] === 'invoke'), event + ' invalidates the previous deletion owner');
    if (event === 'PASSWORD_RECOVERY') assert(!invalidated.node('#recovery-panel').hidden);
  }

  // A refresh for the same owner preserves intent and uses the latest token.
  const confirmed = await account({ session: sessionFor(accountA) });
  confirmed.storage.set('netvista-unrelated-preference', 'preserve-me');
  await openDeletion(confirmed);
  const refreshedA = { ...sessionFor(accountA), access_token: 'synthetic.a.refreshed' };
  await confirmed.event('TOKEN_REFRESHED', refreshedA);
  assert(confirmed.node('#delete-account-dialog').open);
  assert.equal(confirmed.node('#delete-account-password').value, 'synthetic-current-password');
  assert((await confirmed.node('#delete-account-form').fire('submit')).prevented);
  const invocation = confirmed.calls.find(call => call[0] === 'invoke');
  assert.equal(invocation[1], 'delete-account');
  assert.equal(invocation[2].headers.Authorization, 'Bearer synthetic.a.refreshed');
  assert.equal(invocation[2].body.password, 'synthetic-current-password');
  assert.equal(invocation[2].body.confirmation, 'DELETE');
  assert.deepEqual(Object.keys(invocation[2].body).sort(), ['confirmation', 'password'], 'Caller never selects a deletion target in the payload');
  assert(!confirmed.storage.has(storageKey), 'Confirmed deletion removes A persisted session');
  assert.equal(confirmed.storage.get('netvista-unrelated-preference'), 'preserve-me');
  assert.deepEqual(confirmed.storageCalls.filter(call => call[0] === 'remove'), [['remove', storageKey]]);
  assert.deepEqual(confirmed.lockCalls, [storageLock]);
  assert.deepEqual(confirmed.replacements, ['/account/?deleted=1'], 'Success reloads a token/password-free URL to discard SDK memory');
  assert(!confirmed.calls.some(call => call[0] === 'signout'));
  assert(confirmed.node('#signed-in-panel').hidden);
  assert(!confirmed.node('#delete-account-dialog').open);
  assert.equal(confirmed.node('#delete-account-password').value, '');
  assert(confirmed.node('#delete-account-form:fieldset').disabled);
  await confirmed.event('TOKEN_REFRESHED', refreshedA, { persist: false });
  assert(confirmed.node('#signed-in-panel').hidden, 'A late callback cannot resurrect a confirmed deleted account');
  assert.equal(confirmed.node('#signed-in-email').textContent, '');
  assert(!confirmed.storage.has(storageKey));

  // The storage owner must be read after acquiring the shared storage lock, not
  // before waiting for it: another tab can install B while A cleanup is queued.
  const storageGate = deferred();
  const lockRace = await account({ session: sessionFor(accountA), lockWait: storageGate.promise });
  await openDeletion(lockRace);
  const waitingCleanup = lockRace.node('#delete-account-form').start('submit');
  await tick(); await tick();
  assert.deepEqual(lockRace.lockCalls, [storageLock]);
  await lockRace.event('SIGNED_IN', sessionFor(accountB));
  const lockedStoredB = lockRace.storage.get(storageKey);
  storageGate.resolve(); await waitingCleanup.settled;
  assert.equal(lockRace.storage.get(storageKey), lockedStoredB);
  assert.equal(lockRace.node('#signed-in-email').textContent, 'b@example.invalid');
  assert(!lockRace.node('#signed-in-panel').hidden);
  assert(!lockRace.storageCalls.some(call => call[0] === 'remove'));
  assert(!lockRace.calls.some(call => call[0] === 'signout'));
  assert.deepEqual(lockRace.replacements, []);

  const noLocks = await account({ session: sessionFor(accountA), locks: false });
  const unlockedStoredA = noLocks.storage.get(storageKey);
  await openDeletion(noLocks);
  await noLocks.node('#delete-account-form').fire('submit');
  assert.equal(noLocks.storage.get(storageKey), unlockedStoredA, 'Without a shared lock, cleanup must not race a different tab by removing the shared key');
  assert(!noLocks.storageCalls.some(call => call[0] === 'remove'));
  assert(!noLocks.calls.some(call => call[0] === 'signout'));
  assert(noLocks.node('#signed-in-panel').hidden);
  assert.equal(noLocks.replacements.length, 1);
  assert.match(noLocks.replacements[0], /^\/account\/\?deleted=1(?:&|$)/);
  assert(!noLocks.replacements[0].includes('synthetic'), 'Reload never carries session tokens or passwords');

  for (const [form, method] of [['signin', 'signInWithPassword'], ['signup', 'signUp']]) {
    const lateAuth = deferred(), staleResponse = await account();
    staleResponse.auth[method] = async args => { staleResponse.calls.push([form, args]); return lateAuth.promise; };
    if (form === 'signup') await staleResponse.node('#signup-tab').fire();
    staleResponse.node('#' + form + '-email').value = 'a@example.invalid';
    staleResponse.node('#' + form + '-password').value = 'synthetic-current-password';
    assert(staleResponse.node('#' + form + '-panel').start('submit').event.prevented);
    await tick(); await tick();
    await staleResponse.event('SIGNED_IN', sessionFor(accountA));
    await openDeletion(staleResponse);
    await staleResponse.node('#delete-account-form').fire('submit');
    lateAuth.resolve({ data: { session: sessionFor(accountA) } });
    await tick(); await tick();
    assert(staleResponse.node('#signed-in-panel').hidden, 'Delayed ' + form + ' completion cannot resurrect a deleted account');
    assert.equal(staleResponse.node('#signed-in-email').textContent, '');
    assert(!staleResponse.storage.has(storageKey));
  }

  // Missing/failed function confirmation must never become a success or logout.
  for (const [result, expected] of [
    [{ data: {} }, /Deletion was not confirmed/],
    [{ data: { error: 'Current password could not be verified.' }, error: {} }, /Current password could not be verified/]
  ]) {
    const unconfirmed = await account({ session: sessionFor(accountA), deleteResult: result });
    const storedA = unconfirmed.storage.get(storageKey);
    await openDeletion(unconfirmed);
    await unconfirmed.node('#delete-account-form').fire('submit');
    assert.match(unconfirmed.node('#delete-account-status').textContent, expected);
    assert.equal(unconfirmed.node('#delete-account-password').value, '', 'Failure clears the reauthentication password');
    assert(unconfirmed.node('#delete-account-dialog').open, 'Unconfirmed deletion remains available for explicit user action');
    assert(!unconfirmed.node('#signed-in-panel').hidden);
    assert.equal(unconfirmed.node('#signed-in-email').textContent, 'a@example.invalid');
    assert.equal(unconfirmed.storage.get(storageKey), storedA);
    assert(!unconfirmed.storageCalls.some(call => call[0] === 'remove'));
    assert(!unconfirmed.calls.some(call => call[0] === 'signout'));
    assert.deepEqual(unconfirmed.replacements, []);
    assert(!unconfirmed.node('#delete-account-form:fieldset').disabled);
    assert(!unconfirmed.node('#cancel-delete-account').disabled);
    assert(!unconfirmed.node('#status').textContent.includes('account was deleted'));
    assert(!String(unconfirmed.node('#status').className).includes('success'), 'Unknown/failed deletion cannot show success styling');
  }
  for (const verifiedUser of [sessionFor(accountB).user, { ...sessionFor(accountA).user, is_anonymous: true }, null]) {
    const unverified = await account({ session: sessionFor(accountA), verifiedUser });
    assert(unverified.node('#signed-in-panel').hidden, 'Initialization requires a remotely verified, matching non-anonymous owner');
    await unverified.node('#open-delete-account').fire();
    assert(!unverified.node('#delete-account-dialog').open);
  }

  // Exercise the real storage adapter, not the mocked Auth SDK: ordinary SDK
  // writes and deletion cleanup must serialize under the same exclusive lock.
  for (const writeFirst of [true, false]) {
    const adapter = await account({ session: sessionFor(accountA) });
    const storedB = JSON.stringify(sessionFor(accountB));
    let writeB, clearA;
    if (writeFirst) {
      writeB = adapter.storageAdapter.setItem(storageKey, storedB);
      clearA = adapter.clearDeletedSession(accountA);
    } else {
      clearA = adapter.clearDeletedSession(accountA);
      writeB = adapter.storageAdapter.setItem(storageKey, storedB);
    }
    await Promise.all([writeB, clearA]);
    assert.equal(adapter.storage.get(storageKey), storedB, 'Either lock order preserves a newly installed B session');
    assert.equal(await adapter.storageAdapter.getItem(storageKey), storedB);
    assert.deepEqual(adapter.lockCalls, [storageLock, storageLock]);
    await adapter.storageAdapter.removeItem(storageKey);
    assert.equal(await adapter.storageAdapter.getItem(storageKey), null);
    assert.equal(adapter.lockCalls.at(-1), storageLock);
  }
  for (const options of [{ lockError: true }, { storageBlocked: true }]) {
    const adapter = await account({ session: sessionFor(accountA), ...options });
    const storedB = JSON.stringify(sessionFor(accountB));
    await adapter.storageAdapter.setItem(storageKey, storedB);
    assert.equal(await adapter.storageAdapter.getItem(storageKey), storedB, 'Unavailable storage/lock falls back to this client\'s memory');
    assert.equal(await adapter.clearDeletedSession(accountA), false, 'Unreliable cleanup must not claim shared-session removal');
    assert.equal(JSON.parse(adapter.storage.get(storageKey)).user.id, accountA);
    await adapter.storageAdapter.removeItem(storageKey);
    assert.equal(await adapter.storageAdapter.getItem(storageKey), null, 'Memory fallback also supports sign-out removal');
  }
  const deletedReturn = await account({ search: '?deleted=1' });
  assert.match(deletedReturn.node('#status').textContent, /account was deleted/);
  console.log('PASS: fail-closed forms; literal login input; signup/recovery; verified initialization; deletion owner binding, account-switch races, refreshed tokens, failure safety, shared storage serialization/fallback and late callback suppression.');
})().catch(error => { console.error(error); process.exitCode = 1; });
