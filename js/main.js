/* ===========================================================================
   main.js · arranque y router de pestañas
   =========================================================================== */
import { initUpload, openUploader, restoreShared, loadReportsFromSupabase } from './data.js';
import { store } from './store.js';
import { openModal, closeModal } from './ui.js';
import { initAuth, login as sbLogin, isAdmin, canUpload, canVer, isLoggedIn, currentEmail, onAuthChange } from './authSupabase.js';

/* Carga perezosa por pestaña: cada vista se importa la primera vez que se abre.
   Reduce el JS parseado al arranque (26 módulos → ~8). */
const LOADERS = {
  dash: () => import('./dashboard.js').then(m => m.renderDashboard),
  inv:  () => import('./inventario.js').then(m => m.renderInventario),
  sug:  () => import('./sugerencias.js').then(m => m.renderSug),
  cons: () => import('./consumo.js').then(m => m.renderConsumo),
  rss:  () => import('./resumenSin.js').then(m => m.renderResumenSin),
  ana:  () => import('./analisis.js').then(m => m.renderAnalisis),
  cot:  () => import('./cotizador.js').then(m => m.renderCotizador),
};
const RENDER_CACHE = {};
async function renderer(id) { if (!RENDER_CACHE[id]) RENDER_CACHE[id] = await LOADERS[id](); return RENDER_CACHE[id]; }

const TABS = [
  { id: 'dash', label: '🏠 Inicio' },
  { id: 'inv',  label: '🏷️ Inventario (condición)' },
  { id: 'sug',  label: '📋 Sugerencias' },
  { id: 'cons', label: '📊 Reporte de consumo' },
  { id: 'rss',  label: '🏭 Resumen Sin Sugerencias' },
  { id: 'ana',  label: '📈 Análisis' },
  { id: 'cot',  label: '🧾 Cotizador' },
];

let current = 'dash';

function allowedTabs() { return TABS.filter(t => canVer(t.id)); }

function buildTabs() {
  const tb = document.querySelector('#tabs'); tb.innerHTML = '';
  tb.setAttribute('role', 'tablist'); tb.setAttribute('aria-label', 'Secciones del portal');
  allowedTabs().forEach(t => {
    const b = document.createElement('button');
    b.className = 'tab'; b.dataset.id = t.id; b.textContent = t.label;
    b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(t.id === current));
    b.onclick = () => switchTab(t.id);
    tb.appendChild(b);
  });
  if (!allowedTabs().some(t => t.id === current)) current = (allowedTabs()[0] || TABS[0]).id;
}

async function render() {
  ['dash', 'inv', 'sug', 'cons', 'rss', 'ana', 'cot'].forEach(id => { const el = document.querySelector('#view-' + id); if (el) el.classList.toggle('hidden', id !== current); });
  document.querySelectorAll('.tab').forEach(t => { const on = t.dataset.id === current; t.classList.toggle('active', on); t.setAttribute('aria-selected', String(on)); });
  const el = document.querySelector('#view-' + current); if (!el) return;
  if (!RENDER_CACHE[current] && !el.innerHTML) el.innerHTML = '<div class="skeleton-page"><div class="sk sk-kpis"></div><div class="sk sk-table"></div></div>';
  try { const fn = await renderer(current); fn(el); } catch (e) { el.innerHTML = '<div class="empty"><p>No se pudo cargar la vista.</p></div>'; }
}
function switchTab(id) { current = id; render(); }
window.__goTab = id => { if (TABS.some(t => t.id === id)) switchTab(id); };

/* ---- barra: subir (según permiso) + botón sesión/admin ---- */
function syncAdminUI() {
  const up = document.querySelector('#btnUpload');
  if (up) up.style.display = canUpload() ? '' : 'none';
  const ab = document.querySelector('#btnAdmin');
  if (ab) ab.textContent = isLoggedIn() ? (isAdmin() ? '⚙️ Admin' : '👤 ' + currentEmail()) : '🔐 Iniciar sesión';
}

/* abre panel admin si es admin; si no hay sesión, muestra login */
function adminPanel() {
  if (isLoggedIn()) { import('./admin.js').then(m => m.openAdmin()); return; }
  loginModal();
}

function loginModal() {
  openModal(`
    <button class="x" onclick="closeModal()">×</button>
    <h2>🔐 Iniciar sesión</h2>
    <p class="muted">Acceso del personal DEGASA. La subida de archivos y la configuración son solo para administradores.</p>
    <div class="card" style="max-width:360px">
      <label class="lbl">Correo</label>
      <input id="loginEmail" type="email" placeholder="usuario@degasa.com" style="width:100%;margin-bottom:8px">
      <label class="lbl">Contraseña</label>
      <input id="loginPass" type="password" placeholder="••••••••" style="width:100%">
      <div id="loginErr" class="muted" style="color:#e66;margin-top:8px;display:none"></div>
      <div style="text-align:right;margin-top:12px"><button class="btn primary" id="loginBtn">Entrar</button></div>
    </div>
  `);
  const doLogin = async () => {
    const btn = document.getElementById('loginBtn'); const err = document.getElementById('loginErr');
    btn.disabled = true; btn.textContent = 'Entrando…'; err.style.display = 'none';
    const r = await sbLogin(document.getElementById('loginEmail').value, document.getElementById('loginPass').value);
    if (r.error) { err.textContent = 'No se pudo entrar: ' + r.error; err.style.display = ''; btn.disabled = false; btn.textContent = 'Entrar'; return; }
    closeModal(); syncAdminUI(); buildTabs(); render();
  };
  document.getElementById('loginBtn').addEventListener('click', doLogin);
  document.getElementById('loginPass').addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}


function boot() {
  // botón sesión/admin en la barra
  const top = document.querySelector('.top') || document.body;
  const ab = document.createElement('button');
  ab.id = 'btnAdmin'; ab.className = 'btn'; ab.textContent = '🔐 Iniciar sesión';
  ab.onclick = adminPanel; top.appendChild(ab);
  // botón actualizar datos + chip de frescura
  const rb = document.createElement('button');
  rb.id = 'btnRefresh'; rb.className = 'btn'; rb.title = 'Buscar datos nuevos en Supabase';
  rb.textContent = '🔄 Actualizar'; top.appendChild(rb);
  const chip = document.createElement('span');
  chip.id = 'dataChip'; chip.className = 'datachip'; chip.textContent = 'Cargando datos…'; top.appendChild(chip);
  rb.onclick = async () => {
    rb.disabled = true; rb.textContent = '⏳ Buscando…'; store._manual = false;
    const ok = await restoreShared().catch(() => false);
    rb.disabled = false; rb.textContent = '🔄 Actualizar';
    if (ok) { buildTabs(); render(); }
    syncDataChip(ok ? 'Datos actualizados' : 'Sin cambios');
  };

  buildTabs();
  document.querySelector('#btnUpload').addEventListener('click', openUploader);
  initUpload(() => { buildTabs(); syncAdminUI(); syncDataChip(); render(); });
  document.querySelector('#ov').addEventListener('click', e => { if (e.target.id === 'ov') closeModal(); });
  syncAdminUI();
  render();

  // sesión Supabase: al iniciar y cuando cambie, refrescar UI/permisos/pestañas
  onAuthChange(() => { syncAdminUI(); buildTabs(); render(); });
  initAuth().then(() => { syncAdminUI(); buildTabs(); render(); }).catch(() => {});

  // precalentar datos en segundo plano sin bloquear el arranque (lazy)
  import('./inventario.js').then(m => m.ensureInvData()).catch(() => {});
  import('./enrich.js').then(m => m.loadEnrich(false)).then(() => render()).catch(() => {});
  // restaurar archivo activo (Supabase multi-dispositivo → local)
  restoreShared().then(async ok => {
    if (!ok) ok = await loadReportsFromSupabase().catch(() => false);
    if (ok) { buildTabs(); render(); }
    syncDataChip();
  }).catch(() => syncDataChip());
}

/* chip con la frescura de cada reporte (tipo · fecha de subida) */
const TYPE_LBL = { sug: 'Sugerencias', cons: 'Consumo', fac: 'Facturación', rss: 'Resumen Sin Sug.', multi: 'Archivo' };
function syncDataChip(msg) {
  const chip = document.querySelector('#dataChip'); if (!chip) return;
  const info = store.DATAINFO;
  if (info && info.length) {
    chip.innerHTML = info.filter(i => i.type !== 'multi').map(i => {
      const d = i.at ? new Date(i.at) : null;
      const f = d ? d.toLocaleDateString('es-MX', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' }) : '';
      return `<span title="${(i.file || '')}">${TYPE_LBL[i.type] || i.type} <b>${f}</b></span>`;
    }).join(' · ');
  } else chip.textContent = msg || (store.fileName ? store.fileName : 'Sin datos cargados');
  if (msg) { chip.dataset.flash = '1'; setTimeout(() => { delete chip.dataset.flash; syncDataChip(); }, 1800); }
}

/* PWA: registrar service worker + indicador online/offline */
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
function syncOnline() {
  const chip = document.querySelector('#netChip'); if (!chip) return;
  const on = navigator.onLine;
  chip.textContent = on ? '● En línea' : '● Sin conexión';
  chip.className = 'netchip ' + (on ? 'on' : 'off');
  chip.title = on ? 'Conectado — los datos se sincronizan' : 'Trabajas con la última información descargada';
}
window.addEventListener('online', () => { syncOnline(); const rb = document.querySelector('#btnRefresh'); if (rb) rb.click(); });
window.addEventListener('offline', syncOnline);

boot();
{ const top = document.querySelector('.top') || document.body; const nc = document.createElement('span'); nc.id = 'netChip'; top.appendChild(nc); syncOnline(); }

