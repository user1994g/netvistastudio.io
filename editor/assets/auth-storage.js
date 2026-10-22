// Serialize persistent session mutations with self-deletion cleanup. The
// pinned Auth SDK does not lock password-sign-in storage writes itself.
const lockName = 'netvista-auth-storage-v1';
const sessionKey = 'sb-tsitgxafmtzjgtmiczsq-auth-token';
const memory = new Map(), volatile = new Set();
const locks = () => typeof navigator !== 'undefined' ? navigator.locks : null;
async function mutate(key, operation) {
  const change = () => {
    try { operation(localStorage); volatile.delete(key); }
    catch { volatile.add(key); }
  };
  if (locks()?.request) {
    try { await locks().request(lockName, { mode: 'exclusive' }, change); }
    catch { volatile.add(key); } // Memory-only if cross-tab locking failed.
  } else change();
}
export const authStorage = {
  getItem(key) {
    if (volatile.has(key)) return memory.get(key) || null;
    try { return localStorage.getItem(key); } catch { return memory.get(key) || null; }
  },
  async setItem(key, value) { memory.set(key, value); await mutate(key, storage => storage.setItem(key, value)); },
  async removeItem(key) { memory.delete(key); await mutate(key, storage => storage.removeItem(key)); }
};
export async function clearDeletedSession(owner) {
  // Without a shared cross-tab lock, never risk removing another newly signed
  // in account. Remote user verification still prevents deleted-profile UI.
  if (!locks()?.request) return false;
  try {
    return await locks().request(lockName, { mode: 'exclusive' }, () => {
      const stored = JSON.parse(localStorage.getItem(sessionKey) || 'null');
      if (stored?.user?.id !== owner) return false;
      localStorage.removeItem(sessionKey); memory.delete(sessionKey); volatile.delete(sessionKey);
      return true;
    });
  } catch { return false; }
}
