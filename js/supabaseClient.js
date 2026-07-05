/* ===========================================================================
   supabaseClient.js · cliente Supabase (solo lectura) que CONVIVE con las
   fuentes actuales (Excel subido + Google Sheets/AppScript). Si la librería o
   la red no están disponibles, sb() devuelve null y el portal sigue con Google.
   =========================================================================== */
export const SB_URL = 'https://fiplfsuhsqibzrpvjvbx.supabase.co';
export const SB_KEY = 'sb_publishable_N9vXCxXYUzJBBCtaMWhp3Q_y8tLbOep';

let client = null;
export function sb() {
  if (client) return client;
  if (typeof window === 'undefined' || !window.supabase || !window.supabase.createClient) return null;
  try { client = window.supabase.createClient(SB_URL, SB_KEY, { auth: { persistSession: false } }); }
  catch (e) { client = null; }
  return client;
}
export const sbReady = () => !!sb();
