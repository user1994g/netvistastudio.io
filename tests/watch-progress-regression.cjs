// Offline only. Synthetic identities/rows, no browser accounts or live writes.
// node --experimental-vm-modules tests/watch-progress-regression.cjs
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const plain = value => JSON.parse(JSON.stringify(value));
const tick = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const context = vm.createContext({ URL, Date });
  const module = new vm.SourceTextModule(read('video-beta/assets/library.js'), { context });
  await module.link(() => { throw Error('Pure progress helpers must not import network/auth code.'); });
  await module.evaluate();
  const { continueChoice, continueRows, createProgressWriter } = module.namespace;
  const started = { film_id: 'synthetic-film', position_seconds: 82.5, duration_seconds: 180,
    completed: false, saved: true, last_watched_at: '2026-10-21T12:00:00Z' };
  const hidden = continueChoice(started, false);
  assert.deepEqual(plain(hidden), { ...started, last_watched_at: null }, 'Unticking changes membership only');
  assert.equal(started.last_watched_at, '2026-10-21T12:00:00Z', 'Choice must not mutate the old row');
  assert.equal(continueRows([hidden]).length, 0, 'Unticked film leaves Continue watching');
  const restored = continueChoice(hidden, true, '2026-10-21T12:01:00Z');
  assert.equal(continueRows([restored]).length, 1, 'Rechecking restores membership without resetting time');
  assert.equal(restored.position_seconds, 82.5);
  const complete = { ...started, completed: true };
  assert.equal(continueChoice(complete, false).completed, true, 'Membership never changes completion');

  let owner = { id: 'account-one', generation: 1 }, row = { ...started }, release;
  const writes = [];
  const writer = createProgressWriter({
    identity: () => owner,
    rowFor: () => row,
    async write(snapshot, identity, options) {
      writes.push({ snapshot, identity, options });
      if (writes.length === 1) await new Promise(resolve => { release = resolve; });
    }
  });
  const checkpoint = writer.enqueue(started.film_id);
  await tick();
  assert.equal(writes.length, 1);
  row = continueChoice({ ...row, position_seconds: 90 }, false);
  const dismiss = writer.enqueue(started.film_id);
  // Queued close/pagehide must share the writer and read the newest state.
  row = { ...row, position_seconds: 91 };
  const exit = writer.enqueue(started.film_id, { keepalive: true });
  await tick();
  assert.equal(writes.length, 1, 'Keepalive cannot run concurrently over an in-flight checkpoint');
  release();
  const results = await Promise.all([checkpoint, dismiss, exit]);
  assert(results.every(result => result.ok));
  assert.equal(writes.length, 3);
  for (const write of writes.slice(1)) {
    assert.equal(write.snapshot.last_watched_at, null, 'No queued writer resurrects dismissed membership');
    assert.equal(write.snapshot.position_seconds, 91, 'Queued writes use the latest playback, not old snapshots');
    assert.equal(write.snapshot.saved, true);
  }
  assert.equal(writes.at(-1).options.keepalive, true);

  let releaseOld;
  const identities = [], isolated = createProgressWriter({ identity: () => owner, rowFor: () => row,
    async write(snapshot, identity) {
      identities.push(identity.id);
      if (identities.length === 1) await new Promise(resolve => { releaseOld = resolve; });
    }
  });
  const oldInFlight = isolated.enqueue('synthetic-film');
  await tick();
  const oldQueued = isolated.enqueue('synthetic-film');
  owner = { id: 'account-two', generation: 2 }; row = { ...started, saved: false, position_seconds: 0, last_watched_at: null };
  const fresh = isolated.enqueue('synthetic-film');
  releaseOld();
  assert.equal((await oldInFlight).stale, true, 'An old account response cannot update the next UI');
  assert.equal((await oldQueued).stale, true, 'Queued old account work is discarded');
  assert.equal((await fresh).ok, true);
  assert.deepEqual(identities, ['account-one', 'account-two']);
  owner = null;
  assert.equal((await isolated.enqueue('synthetic-film')).stale, true, 'Signed-out calls cannot write');

  owner = { id: 'account-two', generation: 2 };
  let attempts = 0;
  const recovered = createProgressWriter({ identity: () => owner, rowFor: () => row,
    async write() { if (++attempts === 1) throw Error('Synthetic offline'); }
  });
  assert.equal((await recovered.enqueue('synthetic-film')).ok, false, 'A failed write is reported to revert the choice');
  assert.equal((await recovered.enqueue('synthetic-film')).ok, true, 'A failed write never poisons later retries');

  const cinema = read('video-beta/assets/cinema.js');
  assert(!cinema.includes('data-forget'), 'The old progress-resetting removal action is gone');
  assert(cinema.includes("document.addEventListener('change'"));
  assert(cinema.includes('suppressed.has(playing.id) ? null'), 'Active playback respects an unticked choice');
  assert(cinema.includes('persist(row, { keepalive: true, quiet: true })'), 'Exit writes use the single writer');
  assert(cinema.includes('previous') && cinema.includes('last_watched_at: previous'), 'Failed membership changes are reverted independently');
  assert(cinema.includes("view !== 'plans'"), 'Public plan descriptions never unlock the catalog');
  assert(cinema.includes("action.disabled = Boolean(user)"), 'An authenticated Free plan has no misleading checkout');
  assert(!/stripe|checkoutSession|createSubscription|paymentIntent/.test(cinema), 'No paid plan or billing integration exists');
  console.log('Watch progress regression checks passed.');
})().catch(error => { console.error(error); process.exitCode = 1; });
