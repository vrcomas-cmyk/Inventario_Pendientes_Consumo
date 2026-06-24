/* ===========================================================================
   auth.js · rol admin (local) + configuración de visibilidad.
   - Admin: protegido por contraseña (se guarda en este navegador).
   - El admin decide qué pestañas ven los usuarios no-admin (config local,
     exportable para "hornearla" en el despliegue).
   NOTA: esto es control en el cliente. Para verdadero multiusuario con
   permisos por persona se requiere backend (ver Supabase en las notas).
   =========================================================================== */
const KEY = 'portal_admin', PW = 'portal_pw', TABS = 'portal_tabs_vis';
const DEFAULT_PW = 'degasa2026';

let on = localStorage.getItem(KEY) === '1';
export const isAdmin = () => on;
export function login(pw) {
  const stored = localStorage.getItem(PW) || DEFAULT_PW;
  if (pw === stored) { on = true; localStorage.setItem(KEY, '1'); return true; }
  return false;
}
export function logout() { on = false; localStorage.removeItem(KEY); }
export function setPassword(p) { if (p) localStorage.setItem(PW, p); }

/* pestañas visibles para no-admin (null = todas) */
export function visibleTabs() { try { return JSON.parse(localStorage.getItem(TABS) || 'null'); } catch (e) { return null; } }
export function setVisibleTabs(arr) { if (!arr || !arr.length) localStorage.removeItem(TABS); else localStorage.setItem(TABS, JSON.stringify(arr)); }
export function tabAllowed(key) { if (on) return true; const v = visibleTabs(); return !v || v.includes(key); }

/* exportar/importar configuración de visibilidad (para compartir) */
export function exportConfig() { return JSON.stringify({ tabs: visibleTabs() }); }
export function importConfig(json) { try { const o = JSON.parse(json); setVisibleTabs(o.tabs || null); return true; } catch (e) { return false; } }
