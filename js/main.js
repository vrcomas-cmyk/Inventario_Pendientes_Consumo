/* ===========================================================================
   main.js · arranque y router de pestañas
   =========================================================================== */
import { initUpload, openUploader, restoreSaved, forgetSaved, savedFileName } from './data.js';
import { renderInventario, ensureInvData } from './inventario.js';
import { renderSug } from './sugerencias.js';
import { renderConsumo } from './consumo.js';
import { renderResumenSin } from './resumenSin.js';
import { openModal, closeModal } from './ui.js';
import { loadEnrich } from './enrich.js';
import { isAdmin, login, logout, setPassword, setVisibleTabs, visibleTabs, tabAllowed } from './auth.js';

const TABS = [
  { id: 'inv',  label: '🏷️ Inventario (condición)' },
  { id: 'sug',  label: '📋 Sugerencias' },
  { id: 'cons', label: '📊 Reporte de consumo' },
  { id: 'rss',  label: '🏭 Resumen Sin Sugerencias' },
];

let current = 'inv';

function allowedTabs() { return TABS.filter(t => tabAllowed(t.id)); }

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
  ['inv', 'sug', 'cons', 'rss'].forEach(id => document.querySelector('#view-' + id).classList.toggle('hidden', id !== current));
  if (current === 'inv')  renderInventario(document.querySelector('#view-inv'));
  if (current === 'sug')  renderSug(document.querySelector('#view-sug'));
  if (current === 'cons') renderConsumo(document.querySelector('#view-cons'));
  if (current === 'rss')  renderResumenSin(document.querySelector('#view-rss'));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.id === current));
}
function switchTab(id) { current = id; render(); }

/* ---- barra admin (botón de carga solo admin) ---- */
function syncAdminUI() {
  const up = document.querySelector('#btnUpload');
  if (up) up.style.display = isAdmin() ? '' : 'none';
  const ab = document.querySelector('#btnAdmin');
  if (ab) ab.textContent = isAdmin() ? '🔓 Admin' : '🔒 Admin';
}

function adminPanel() {
  if (!isAdmin()) {
    const pw = prompt('Contraseña de administrador:');
    if (pw == null) return;
    if (!login(pw)) { alert('Contraseña incorrecta.'); return; }
    buildTabs(); syncAdminUI(); render(); return;
  }
  const vt = visibleTabs() || TABS.map(t => t.id);
  openModal(`
    <button class="x" onclick="closeModal()">×</button>
    <h2>⚙️ Administración</h2>
    <p class="muted">Archivo guardado: <b>${savedFileName() || '—'}</b></p>
    <div class="card"><h3>👁️ Pestañas visibles para usuarios (no-admin)</h3>
      <div id="tabvis">${TABS.map(t => `<label class="shrow"><input type="checkbox" data-tab="${t.id}" ${vt.includes(t.id) ? 'checked' : ''}> ${t.label}</label>`).join('')}</div>
      <p class="muted" style="font-size:12px">El admin siempre ve todas. Esta config se guarda en este navegador; usa "Exportar config" para aplicarla en otros.</p>
    </div>
    <div class="card"><h3>🗂️ Datos</h3>
      <button class="btn" id="aUpload">📂 Subir / reemplazar archivo</button>
      <button class="btn" id="aForget">🗑️ Olvidar archivo guardado</button>
    </div>
    <div class="card"><h3>🔐 Seguridad y configuración</h3>
      <button class="btn" id="aPw">Cambiar contraseña</button>
      <button class="btn" id="aExport">⬇️ Exportar config</button>
      <button class="btn" id="aImport">⬆️ Importar config</button>
      <button class="btn" id="aLogout">Cerrar sesión admin</button>
    </div>`);
  document.querySelectorAll('#tabvis [data-tab]').forEach(c => c.onchange = () => {
    const sel = [...document.querySelectorAll('#tabvis [data-tab]:checked')].map(x => x.dataset.tab);
    setVisibleTabs(sel.length === TABS.length ? null : sel); buildTabs(); render();
  });
  document.querySelector('#aUpload').onclick = () => { closeModal(); openUploader(); };
  document.querySelector('#aForget').onclick = () => { if (confirm('¿Olvidar el archivo guardado?')) forgetSaved().then(() => { closeModal(); render(); }); };
  document.querySelector('#aPw').onclick = () => { const p = prompt('Nueva contraseña:'); if (p) { setPassword(p); alert('Contraseña actualizada.'); } };
  document.querySelector('#aLogout').onclick = () => { logout(); closeModal(); buildTabs(); syncAdminUI(); render(); };
  document.querySelector('#aExport').onclick = () => import('./auth.js').then(m => { prompt('Copia esta configuración:', m.exportConfig()); });
  document.querySelector('#aImport').onclick = () => import('./auth.js').then(m => { const j = prompt('Pega la configuración:'); if (j && m.importConfig(j)) { buildTabs(); render(); alert('Config aplicada.'); } });
}

function boot() {
  // botón admin en la barra
  const top = document.querySelector('.top') || document.body;
  const ab = document.createElement('button');
  ab.id = 'btnAdmin'; ab.className = 'btn'; ab.textContent = '🔒 Admin';
  ab.onclick = adminPanel; top.appendChild(ab);

  buildTabs();
  document.querySelector('#btnUpload').addEventListener('click', openUploader);
  initUpload(() => { buildTabs(); syncAdminUI(); render(); });
  document.querySelector('#ov').addEventListener('click', e => { if (e.target.id === 'ov') closeModal(); });
  syncAdminUI();
  render();

  ensureInvData();
  loadEnrich(false).then(() => render());
  // restaurar archivo guardado (IndexedDB)
  restoreSaved().then(ok => { if (ok) { buildTabs(); render(); } }).catch(() => {});
}

boot();

