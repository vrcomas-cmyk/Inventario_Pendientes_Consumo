/* ===========================================================================
   data.js · carga del archivo (SheetJS), detección y selección de pestañas
   =========================================================================== */
import { esc, norm } from './utils.js';
import { store } from './store.js';
import { buildRF } from './resumenFac.js';
import { buildBO } from './sugerencias.js';
import { openModal, closeModal } from './ui.js';

/* detección de rol por firma de encabezados */
export function roleOf(headers) {
  const H = new Set(headers.map(norm));
  const has = (...c) => c.every(x => H.has(x));
  if (has('Material base', 'Fuente', 'Pedido')) return 'sug';
  if (has('Mes y año', 'Importe facturado', 'Material')) return 'fac';
  if (has('Consumo_actual', 'Ultimo mes facturacion')) return 'cons';
  if (has('Lote', 'FechaCaducidad', 'CantidadDisp')) return 'lotes';
  if (has('Condicion', 'Material')) return 'cond';
  return null;
}
const ROLE_LBL = { sug:'Sugerencias (BO)', fac:'Resumen_Fac', cons:'Reporte de consumo', lotes:'Detalle lotes', cond:'Inventario por condición' };

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
    PENDING = { name: f.name, wb };
    showSelector(wb);
  };
  r.readAsArrayBuffer(f);
}

function showSelector(wb) {
  const rowsHtml = wb.SheetNames.map(name => {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true });
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
  document.querySelectorAll('#sheetSel input:checked').forEach(chk => {
    const name = chk.dataset.name;
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: true });
    store.WB[name] = rows;
    const role = roleOf(rows.length ? Object.keys(rows[0]) : []);
    if (role && !store.ROLE[role]) store.ROLE[role] = name;
  });
  store.fileName = PENDING.name;
  store.RF = store.ROLE.fac ? buildRF(store.WB[store.ROLE.fac]) : null;
  store.BO = store.ROLE.sug ? buildBO(store.WB[store.ROLE.sug]) : [];
  closeModal();
  onReadyCb();
}
