/* ===========================================================================
   authSupabase.js · sesión y rol con Supabase Auth (login por correo).
   Mantiene el rol del usuario y expone helpers: sesión actual, login, logout,
   y permisos (isAdmin, canUpload, canConfig, canUsers). Si no hay Supabase,
   todo cae a "invitado" sin romper el portal.
   =========================================================================== */
import { sb } from './supabaseClient.js';

let session = null;   // objeto de sesión de Supabase
let profile = null;   // { role, email, permisos }
const listeners = [];

export function onAuthChange(fn) { listeners.push(fn); return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); }; }
function emit() { listeners.forEach(fn => { try { fn(profile, session); } catch (e) {} }); }

export function currentUser() { return session && session.user ? session.user : null; }
export function currentRole() { return profile ? profile.role : 'anon'; }
export function currentEmail() { return (session && session.user && session.user.email) || (profile && profile.email) || ''; }
export const isLoggedIn = () => !!currentUser();
export const isAdmin = () => currentRole() === 'admin';
export const canUpload = () => !!(profile && (profile.permisos.upload || isAdmin()));
export const canConfig = () => !!(profile && (profile.permisos.config || isAdmin()));
export const canUsers  = () => !!(profile && (profile.permisos.users  || isAdmin()));
export function canVer(tab) { if (isAdmin()) return true; const v = profile && profile.permisos.ver; return !v || (Array.isArray(v) && v.includes(tab)); }

async function loadProfile() {
  const c = sb(); const u = currentUser();
  if (!c || !u) { profile = null; return; }
  try {
    const { data } = await c.from('portal_users').select('email,role,active').eq('user_id', u.id).single();
    let permisos = {};
    if (data && data.role) {
      const r = await c.from('portal_roles').select('permisos').eq('role', data.role).single();
      permisos = (r.data && r.data.permisos) || {};
    }
    profile = data ? { email: data.email, role: data.active ? data.role : 'lectura', permisos } : { email: u.email, role: 'lectura', permisos: {} };
  } catch (e) { profile = { email: u.email, role: 'lectura', permisos: {} }; }
}

/* inicializa la sesión y se suscribe a cambios de Auth */
export async function initAuth() {
  const c = sb(); if (!c) return null;
  try {
    const { data } = await c.auth.getSession();
    session = data ? data.session : null;
    await loadProfile();
    c.auth.onAuthStateChange(async (_ev, sess) => { session = sess; await loadProfile(); emit(); });
  } catch (e) { session = null; profile = null; }
  return profile;
}

export async function login(email, password) {
  const c = sb(); if (!c) return { error: 'Supabase no disponible' };
  const { data, error } = await c.auth.signInWithPassword({ email: (email || '').trim(), password: password || '' });
  if (error) return { error: error.message };
  session = data.session; await loadProfile(); emit();
  return { ok: true, role: currentRole() };
}

export async function logout() {
  const c = sb(); if (!c) return;
  try { await c.auth.signOut(); } catch (e) {}
  session = null; profile = null; emit();
}
