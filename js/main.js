/* ===========================================================================
   main.js · arranque y router de pestañas
   =========================================================================== */
import { initUpload, openUploader, restoreShared, loadReportsFromSupabase } from './data.js';
import { renderInventario, ensureInvData } from './inventario.js';
import { renderSug } from './sugerencias.js';
import { renderConsumo } from './consumo.js';
import { renderResumenSin } from './resumenSin.js';
import { renderAnalisis } from './analisis.js';
import { renderCotizador } from './cotizador.js';
import { store } from './store.js';
import { openModal, closeModal } from './ui.js';
import { loadEnrich } from './enrich.js';
import { initAuth, login as sbLogin, isAdmin, canUpload, canVer, isLoggedIn, currentEmail, onAuthChange } from './authSupabase.js';
import { openAdmin } from './admin.js';

const TABS = [
  { id: 'inv',  label: '🏷️ Inventario (condición)' },
  { id: 'sug',  label: '📋 Sugerencias' },
  { id: 'cons', label: '📊 Reporte de consumo' },
  { id: 'rss',  label: '🏭 Resumen Sin Sugerencias' },
  { id: 'ana',  label: '📈 Análisis' },
  { id: 'cot',  label: '🧾 Cotizador' },
];

let current = 'inv';

function allowedTabs() { return TABS.filter(t => canVer(t.id)); }

function buildTabs() {
  const tb = document.querySelector('#tabs'); tb.innerHTML = '';
  allowedTabs().forEach(t => {
    const b = document.createElement('button');
    b.className = 'tab'; b.dataset.id = t.id; b.textContent = t.label;
    b.onclick = () => switchTab(t.id);
    tb.appendChild(b);
  });
  if (!allowedTabs().some(t => t.id === current)) current = (allowedTabs()[0] || TABS[0]).id;
}

function render() {
  ['inv', 'sug', 'cons', 'rss', 'ana', 'cot'].forEach(id => { const el = document.querySelector('#view-' + id); if (el) el.classList.toggle('hidden', id !== current); });
  if (current === 'inv')  renderInventario(document.querySelector('#view-inv'));
  if (current === 'sug')  renderSug(document.querySelector('#view-sug'));
  if (current === 'cons') renderConsumo(document.querySelector('#view-cons'));
  if (current === 'rss')  renderResumenSin(document.querySelector('#view-rss'));
  if (current === 'ana')  renderAnalisis(document.querySelector('#view-ana'));
  if (current === 'cot')  renderCotizador(document.querySelector('#view-cot'));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.id === current));
}
function switchTab(id) { current = id; render(); }

/* ---- barra: subir (según permiso) + botón sesión/admin ---- */
function syncAdminUI() {
  const up = document.querySelector('#btnUpload');
  if (up) up.style.display = canUpload() ? '' : 'none';
  const ab = document.querySelector('#btnAdmin');
  if (ab) ab.textContent = isLoggedIn() ? (isAdmin() ? '⚙️ Admin' : '👤 ' + currentEmail()) : '🔐 Iniciar sesión';
}

/* abre panel admin si es admin; si no hay sesión, muestra login */
function adminPanel() {
  if (isLoggedIn()) { openAdmin(); return; }
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

  ensureInvData();
  loadEnrich(false).then(() => render());
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

boot();

