// Account data operations use remotely verified identity; no UI session claim
// or caller-selected user ID can authorize export/deletion.
export async function verifiedAccount(client, expectedID) {
  const verified = await client.auth.getUser();
  const user = verified.data?.user;
  if (verified.error || !user?.id || user.is_anonymous || user.id !== expectedID) throw Error('Sign in again to manage your account.');
  return user;
}
export async function exportAccountData(client, expectedID) {
  const user = await verifiedAccount(client, expectedID);
  const progress = await client.from('watch_progress')
    .select('film_id,position_seconds,duration_seconds,completed,saved,last_watched_at,updated_at').eq('user_id', user.id);
  if (progress.error) throw Error('Could not download your viewing data. Please try again.');
  return {
    exported_at: new Date().toISOString(), service: 'NetVista Studio',
    account: { id: user.id, email: user.email, display_name: user.user_metadata?.display_name || '', created_at: user.created_at },
    watch_progress: progress.data || [],
    explanation: 'This file contains your account profile and saved Watch data, not passwords, tokens, provider security logs, support emails or local editing projects. Contact jackmiller@netvistastudio.com for other personal-data requests.'
  };
}
export async function deleteAccount(client, expectedID, password, confirmation) {
  if (!password || password.length > 1024 || confirmation !== 'DELETE') throw Error('Enter your password and type DELETE to confirm.');
  await verifiedAccount(client, expectedID);
  const session = await client.auth.getSession();
  if (session.error || session.data?.session?.user?.id !== expectedID || !session.data.session.access_token) throw Error('Sign in again to delete your account.');
  const result = await client.functions.invoke('delete-account', {
    headers: { Authorization: 'Bearer ' + session.data.session.access_token }, body: { password, confirmation }
  });
  if (result.error || result.data?.deleted !== true) {
    let message = result.data?.error;
    // FunctionsHttpError stores the safe function response in context. Do not
    // display raw SDK/provider error text or treat an unknown result as success.
    try { if (!message && result.error?.context) message = (await result.error.context.json()).error; } catch {}
    throw Error(message || 'Deletion was not confirmed. Check your account or contact jackmiller@netvistastudio.com before retrying.');
  }
  return true;
}
