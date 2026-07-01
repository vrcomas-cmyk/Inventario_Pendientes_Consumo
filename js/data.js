/* ===========================================================================
   data.js · carga del archivo (SheetJS), detección y selección de pestañas
   =========================================================================== */
import { esc, norm } from './utils.js';
import { store } from './store.js';
import { buildRF } from './resumenFac.js';
import { buildRSS } from './resumenSin.js';
import { buildBO } from './sugerencias.js';
import { openModal, closeModal } from './ui.js';
import { kvSet, kvGet, kvDel } from './persist.js';

/* recalcula el rango real de la hoja (algunos exports traen !ref truncado,
   por eso "se cargan" menos filas de las que tiene el archivo) */
function fixRange(ws) {
  const cells = Object.keys(ws).filter(k => k[0] !== '!');
  if (!cells.length) return;
  const r = { s: { r: Infinity, c: Infinity }, e: { r: 0, c: 0 } };
  cells.forEach(k => { const a = XLSX.utils.decode_cell(k); if (a.r < r.s.r) r.s.r = a.r; if (a.c < r.s.c) r.s.c = a.c; if (a.r > r.e.r) r.e.r = a.r; if (a.c > r.e.c) r.e.c = a.c; });
  ws['!ref'] = XLSX.utils.encode_range(r);
}
const sheetRows = ws => { fixRange(ws); return XLSX.utils.sheet_to_json(ws, { defval: '', raw: true }); };

/* detección de rol por firma de encabezados */
export function roleOf(headers) {
  const H = new Set(headers.map(norm));
  const has = (...c) => c.every(x => H.has(x));
  if (has('Material base', 'Fuente', 'Pedido')) return 'sug';
  if (has('Mes y año', 'Importe facturado', 'Material')) return 'fac';
  if (has('Consumo_actual', 'Ultimo mes facturacion')) return 'cons';
  if (has('Cantidad_Pendiente', 'Suma inventario', 'Centro', 'Almacen')) return 'rss';
  if (has('Lote', 'FechaCaducidad', 'CantidadDisp')) return 'lotes';
  if (has('Condicion', 'Material')) return 'cond';
  return null;
}
const ROLE_LBL = { sug:'Sugerencias (BO)', fac:'Resumen_Fac', cons:'Reporte de consumo', rss:'Resumen Sin Sugerencias', lotes:'Detalle lotes', cond:'Inventario por condición' };

let PENDING = null;
let onReadyCb = () => {};

export function initUpload(onReady) {
  onReadyCb = onReady || (() => {});
  const input = document.querySelector('#fileInput');
  input.addEventListener('change', e => { if (e.target.files[0]) readFile(e.target.files[0]); });
}
export function openUploader() { document.querySelector('#fileInput').click(); }

function readFile(f) {
  const r = new FileReader();
  r.onload = e => {
    const wb = XLSX.read(e.target.result, { type: 'array', cellDates: false });
    PENDING = { name: f.name, wb, buf: e.target.result };
    showSelector(wb);
  };
  r.readAsArrayBuffer(f);
}

function showSelector(wb) {
  const rowsHtml = wb.SheetNames.map(name => {
    const rows = sheetRows(wb.Sheets[name]);
    const headers = rows.length ? Object.keys(rows[0]) : [];
    const role = roleOf(headers);
    return `<label class="shrow">
      <input type="checkbox" ${role ? 'checked' : ''} data-name="${esc(name)}">
      <b>${esc(name)}</b> <span class="muted">(${rows.length} filas)</span>
      <span class="role">${role ? `<span class="tag">${ROLE_LBL[role]}</span>` : '<span class="muted">genérica</span>'}</span>
    </label>`;
  }).join('');
  openModal(`
    <button class="x" onclick="closeModal()">×</button>
    <h2>📂 ${esc(PENDING.name)}</h2>
    <p class="muted">Elige qué pestañas cargar. El inventario por condición se toma del AppScript, no de aquí.</p>
    <div id="sheetSel">${rowsHtml}</div>
    <div style="margin-top:14px;text-align:right"><button class="btn primary" id="doLoad">Cargar seleccionadas ▶</button></div>
  `);
  document.querySelector('#doLoad').addEventListener('click', loadSelected);
}

function loadSelected() {
  const wb = PENDING.wb;
  store.WB = {}; store.ROLE = {};
  const selected = [];
  document.querySelectorAll('#sheetSel input:checked').forEach(chk => {
    const name = chk.dataset.name; selected.push(name);
    const rows = sheetRows(wb.Sheets[name]);
    store.WB[name] = rows;
    const role = roleOf(rows.length ? Object.keys(rows[0]) : []);
    if (role && !store.ROLE[role]) store.ROLE[role] = name;
  });
  store.fileName = PENDING.name;
  store.RF = store.ROLE.fac ? buildRF(store.WB[store.ROLE.fac]) : null;
  store.BO = store.ROLE.sug ? buildBO(store.WB[store.ROLE.sug]) : [];
  if (store.ROLE.rss) buildRSS(store.WB[store.ROLE.rss]);
  // guardar para próximas sesiones (no bloquea la UI)
  if (PENDING.buf) kvSet('file', { name: PENDING.name, selected, buf: PENDING.buf }).catch(() => {});
  closeModal();
  onReadyCb();
}

/* reconstruye el último archivo guardado (al iniciar) */
export async function restoreSaved() {
  let rec; try { rec = await kvGet('file'); } catch (e) { return false; }
  if (!rec || !rec.buf) return false;
  const wb = XLSX.read(rec.buf, { type: 'array', cellDates: false });
  store.WB = {}; store.ROLE = {};
  (rec.selected || wb.SheetNames).forEach(name => {
    if (!wb.Sheets[name]) return;
    const rows = sheetRows(wb.Sheets[name]);
    store.WB[name] = rows;
    const role = roleOf(rows.length ? Object.keys(rows[0]) : []);
    if (role && !store.ROLE[role]) store.ROLE[role] = name;
  });
  store.fileName = rec.name;
  store.RF = store.ROLE.fac ? buildRF(store.WB[store.ROLE.fac]) : null;
  store.BO = store.ROLE.sug ? buildBO(store.WB[store.ROLE.sug]) : [];
  if (store.ROLE.rss) buildRSS(store.WB[store.ROLE.rss]);
  return true;
}
export async function forgetSaved() {
  try { await kvDel('file'); } catch (e) {}
  store.WB = {}; store.ROLE = {}; store.RF = null; store.BO = []; store.fileName = '';
}
export const savedFileName = () => store.fileName || '';
