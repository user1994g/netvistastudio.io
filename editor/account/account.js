import { exportAccountData, deleteAccount } from './account-data.js?v=1';
import { clearDeletedSession } from '../assets/auth-storage.js?v=1';
const $ = selector => document.querySelector(selector);
const signin = $('#signin-panel'), signup = $('#signup-panel'), recovery = $('#recovery-panel');
const forms = [signin, signup, recovery];
const callback = new URLSearchParams(window.location.hash.slice(1));
const callbackError = callback.get('error_code') || callback.get('error');
let wantsRecovery = callback.get('type') === 'recovery';
let client, redirectTo, user = null, ready = false;
let mode = new URLSearchParams(window.location.search).get('mode') === 'signup' ? 'signup' : 'signin';
let deleting = false, dataBusy = false, deleteOwner = null;
const deletedAccounts = new Set();
const sessionUser = session => session?.user && !deletedAccounts.has(session.user.id) ? session.user : null;
const deleteDialog = $('#delete-account-dialog'), deleteForm = $('#delete-account-form');
const setStatus = (message, tone = '') => {
  $('#status').hidden = !message;
  $('#status').className = 'account-status ' + tone;
  $('#status').textContent = message;
};
const render = () => {
  const recovering = mode === 'recovery' && Boolean(user);
  signin.hidden = Boolean(user) || mode !== 'signin';
  signup.hidden = Boolean(user) || mode !== 'signup';
  recovery.hidden = !recovering;
  $('#signed-in-panel').hidden = !user || recovering;
  $('.account-tabs').hidden = Boolean(user);
  for (const tab of ['signin', 'signup']) {
    $('#' + tab + '-tab').setAttribute('aria-selected', String(mode === tab));
    $('#' + tab + '-tab').classList.toggle('is-active', mode === tab);
  }
  $('#account-subtitle').textContent = recovering ? 'Choose a new, unique password.' : user ? 'Your NetVista account is ready.' : 'Sign in or create your NetVista account.';
  $('#signed-in-email').textContent = user?.email || '';
  $('#account-title').textContent = recovering ? 'A fresh start.' : user ? 'You’re all set.' : mode === 'signup' ? 'Join the studio.' : 'Welcome back.';
};
const request = async operation => {
  let timer;
  try {
    return await Promise.race([operation(), new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Connection timed out. Please try again.')), 20000);
    })]);
  } catch (error) { return { data: {}, error }; }
  finally { clearTimeout(timer); }
};
const run = async (form, message, operation, success) => {
  if (!ready || form.querySelector('fieldset').disabled) return;
  form.querySelector('fieldset').disabled = true;
  setStatus(message);
  try {
    const { data, error } = await request(operation);
    if (error) { setStatus(error.message || 'Please try again.', 'error'); return; }
    form.reset();
    success(data);
  } finally { form.querySelector('fieldset').disabled = !ready; }
};
// Cancel submission before importing remote code. HTML is disabled and inputs
// are nameless as independent defenses against native credential serialization.
forms.forEach(form => form.addEventListener('submit', event => event.preventDefault()));
deleteForm.addEventListener('submit', event => event.preventDefault());
deleteDialog.addEventListener('cancel', event => { if (deleting) event.preventDefault(); });
deleteDialog.addEventListener('close', () => { deleteOwner = null; deleteForm.reset(); $('#delete-account-password').value = ''; $('#delete-account-confirm').value = ''; if (user) $('#open-delete-account').focus(); });
$('#open-delete-account').addEventListener('click', () => {
  if (!ready || !user || deleting) return;
  $('#delete-account-status').textContent = '';
  deleteOwner = user.id;
  $('#delete-account-email').textContent = user.email || '';
  deleteForm.querySelector('fieldset').disabled = false;
  deleteDialog.showModal();
});
$('#cancel-delete-account').addEventListener('click', () => { if (!deleting) deleteDialog.close(); });
deleteForm.addEventListener('submit', async () => {
  if (!ready || !user || deleting || deleteForm.querySelector('fieldset').disabled) return;
  const owner = deleteOwner, password = $('#delete-account-password').value, confirmation = $('#delete-account-confirm').value;
  if (!owner || user.id !== owner || mode === 'recovery') { deleteDialog.close(); setStatus('The account changed. Open deletion settings again for the account you intend to delete.', 'error'); return; }
  if (!password || confirmation !== 'DELETE') { $('#delete-account-status').textContent = 'Enter your current password and type DELETE exactly.'; return; }
  deleting = true; deleteForm.querySelector('fieldset').disabled = true;
  $('#cancel-delete-account').disabled = true;
  $('#delete-account-status').textContent = 'Verifying your password and deleting your shared NetVista account…';
  try {
    await deleteAccount(client, owner, password, confirmation);
    deletedAccounts.add(owner);
    // Server already revoked all refresh sessions. Avoid shared-client signOut:
    // an asynchronous completion could clear a newly switched account B.
    // Remove only the persisted session actually belonging to deleted A.
    await clearDeletedSession(owner);
    if (user?.id === owner) {
      user = null; wantsRecovery = false; mode = 'signin'; forms.forEach(form => form.reset());
      deleteDialog.close(); render();
      // Discard the SDK's old in-memory session; password/reset data is not
      // copied into this URL. Other browser-origin sessions expire remotely.
      window.location.replace(window.location.pathname + '?deleted=1');
    } else if (deleteDialog.open) deleteDialog.close();
  } catch (error) {
    if (user?.id === owner) $('#delete-account-status').textContent = error.message || 'Deletion was not confirmed. Please contact us before retrying.';
  } finally {
    $('#delete-account-password').value = ''; deleting = false;
    deleteForm.querySelector('fieldset').disabled = !ready || !user;
    $('#cancel-delete-account').disabled = false;
  }
});
$('#export-account-data').addEventListener('click', async () => {
  if (!ready || !user || dataBusy) return;
  const owner = user.id; dataBusy = true; $('#export-account-data').disabled = true;
  setStatus('Preparing your account and viewing data…');
  try {
    const data = await exportAccountData(client, owner);
    if (user?.id !== owner) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = 'netvista-account-data.json'; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus('Your account data download is ready. Keep this personal file somewhere safe.', 'success');
  } catch (error) { if (user?.id === owner) setStatus(error.message, 'error'); }
  finally { dataBusy = false; $('#export-account-data').disabled = false; }
});
$('#signin-tab').addEventListener('click', () => { mode = 'signin'; render(); setStatus(''); });
$('#signup-tab').addEventListener('click', () => { mode = 'signup'; render(); setStatus(''); });
signin.addEventListener('submit', () => {
  const email = $('#signin-email').value.trim(), password = $('#signin-password').value;
  run(signin, 'Signing you in…', () => client.auth.signInWithPassword({ email, password }), data => {
    user = sessionUser(data.session); mode = 'signin'; render();
    setStatus(user ? 'Signed in. You can now get the app.' : 'Sign-in did not create a session. Please try again.', user ? 'success' : 'error');
  });
});
signup.addEventListener('submit', () => {
  const email = $('#signup-email').value.trim(), password = $('#signup-password').value;
  const name = $('#signup-name').value.trim();
  run(signup, 'Creating your account…', () => client.auth.signUp({ email, password,
    options: { emailRedirectTo: redirectTo, data: name ? { display_name: name } : undefined }
  }), data => {
    user = sessionUser(data.session); mode = 'signin'; render();
    $('#signin-email').value = email;
    setStatus(user ? 'Account created. You can now get the app.' : 'Account created. Sign in to continue.', user ? 'success' : '');
  });
});
$('#forgot-password').addEventListener('click', () => {
  const email = $('#signin-email').value.trim();
  if (!email || !$('#signin-email').checkValidity()) { setStatus('Enter a valid email address first.', 'error'); return; }
  run(signin, 'Sending a password reset email…', () => client.auth.resetPasswordForEmail(email, { redirectTo }), () => {
    $('#signin-email').value = email;
    setStatus('If an account uses that email, a reset link is on its way. Open the newest link once.', 'success');
  });
});
recovery.addEventListener('submit', () => {
  if (!user) return;
  const password = $('#recovery-password').value;
  if (password.length < 8 || password !== $('#recovery-confirm').value) { setStatus('Use at least 8 characters and make both passwords match.', 'error'); return; }
  run(recovery, 'Saving your new password…', () => client.auth.updateUser({ password }), () => {
    wantsRecovery = false; mode = 'signin'; render(); setStatus('Your password has been updated.', 'success');
  });
});
$('#change-password').addEventListener('click', () => { if (ready && user && !deleting) { if (deleteDialog.open) deleteDialog.close(); mode = 'recovery'; render(); setStatus(''); } });
$('#cancel-recovery').addEventListener('click', () => { wantsRecovery = false; recovery.reset(); mode = 'signin'; render(); setStatus(''); });
$('#signout').addEventListener('click', async () => {
  if (!ready) return;
  const { error } = await request(() => client.auth.signOut());
  if (error) setStatus(error.message, 'error');
  else { user = null; wantsRecovery = false; mode = 'signin'; forms.forEach(form => form.reset()); render(); setStatus('You are signed out.', 'success'); }
});
$('#year').textContent = new Date().getFullYear();
render();
setStatus('Connecting securely…');
const initialized = await request(async () => {
  const auth = await import('../assets/auth-client.js');
  client = auth.supabase; redirectTo = auth.authRedirect;
  client.auth.onAuthStateChange((event, session) => {
    const next = sessionUser(session);
    if (deleteDialog.open && (next?.id !== deleteOwner || event === 'PASSWORD_RECOVERY')) deleteDialog.close();
    user = next;
    if (event === 'PASSWORD_RECOVERY') wantsRecovery = true;
    // Preserve an explicit ?mode=signup deep link on the initial signed-out
    // callback; this is how the native app opens the create-account tab.
    if (!user) { wantsRecovery = false; if (mode !== 'signup') mode = 'signin'; }
    else if (wantsRecovery) mode = 'recovery';
    render();
  });
  const result = await client.auth.getSession();
  if (result.error) throw result.error;
  if (result.data?.session) {
    const verified = await client.auth.getUser();
    if (verified.error || verified.data?.user?.is_anonymous || verified.data?.user?.id !== result.data.session.user.id) return { data: { session: null } };
  }
  return result;
});
if (initialized.error) {
  setStatus('Secure sign-in could not load. Check your connection and reload this page. No password has been sent.', 'error');
} else {
  ready = true;
  user = sessionUser(initialized.data.session);
  if (wantsRecovery && user) mode = 'recovery';
  forms.forEach(form => { form.querySelector('fieldset').disabled = false; });
  render();
  setStatus(new URLSearchParams(window.location.search).get('deleted') === '1' && !user ? 'Your NetVista account was deleted. Local editing projects were not deleted.' : callbackError ? (callbackError === 'otp_expired'
    ? 'This email link has expired or was already used. Try signing in; for a password reset, request a new link below.'
    : 'This email link could not be verified. Try signing in or request a new password reset.') : '', callbackError ? 'error' : '');
  // Remove callback material only after the SDK has consumed it.
  if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
}
