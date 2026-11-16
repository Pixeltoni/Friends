// Verbindung zur Supabase-Datenbank.
// Der Publishable Key ist absichtlich öffentlich: Er erlaubt nur den Aufruf der
// wichtel_*-Funktionen, die PIN und Admin-Passwort selbst prüfen.
const SUPABASE_URL = 'https://fqxydmmxyijdhboufrmc.supabase.co';
const SUPABASE_KEY = 'sb_publishable_7nKooxCBSx7H_TttF_57SA_r4H5ZlDr';

async function rpc(fn, args = {}) {
  let res;
  try {
    res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: SUPABASE_KEY },
      body: JSON.stringify(args),
    });
  } catch {
    throw Object.assign(new Error('Server nicht erreichbar.'), { offline: true });
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const err = new Error((data && data.message) || 'Fehler');
    err.auth = data && data.code === '28000';
    throw err;
  }
  return data;
}
