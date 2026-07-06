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
import { uploadPortalFile, latestPortalUpload, downloadPortalFile } from './supabaseData.js';

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
  r.onload = async e => {
    const buf = e.target.result;
    const parsed = await parseWorkbook(buf);
    PENDING = { name: f.name, sheets: parsed.sheets, names: parsed.names, buf };
    showSelector(parsed);
  };
  r.readAsArrayBuffer(f);
}

/* === Parseo del Excel fuera del hilo principal (Web Worker) con respaldo === */
let _worker = null, _workerBad = false;
function getWorker() {
  if (_worker || _workerBad) return _worker;
  try { _worker = new Worker(new URL('./parseWorker.js', import.meta.url)); }
  catch (e) { _workerBad = true; _worker = null; }
  return _worker;
}
function parseSync(buf) {
  const wb = XLSX.read(buf, { type: 'array', cellDates: false });
  const sheets = {}; wb.SheetNames.forEach(n => { sheets[n] = sheetRows(wb.Sheets[n]); });
  return { names: wb.SheetNames, sheets };
}
function parseWorkbook(buf) {
  return new Promise(resolve => {
    const w = getWorker();
    if (!w) { resolve(parseSync(buf)); return; }
    const done = res => { w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); resolve(res); };
    const onMsg = ev => { (ev.data && ev.data.ok) ? done({ names: ev.data.names, sheets: ev.data.sheets }) : done(parseSync(buf)); };
    const onErr = () => { _workerBad = true; _worker = null; done(parseSync(buf)); };
    w.addEventListener('message', onMsg); w.addEventListener('error', onErr);
    try { w.postMessage(buf); } catch (e) { done(parseSync(buf)); }
  });
}

function showSelector(parsed) {
  const rowsHtml = parsed.names.map(name => {
    const rows = parsed.sheets[name] || [];
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
  store.WB = {}; store.ROLE = {};
  const selected = [];
  document.querySelectorAll('#sheetSel input:checked').forEach(chk => {
    const name = chk.dataset.name; selected.push(name);
    const rows = PENDING.sheets[name] || [];
    store.WB[name] = rows;
    const role = roleOf(rows.length ? Object.keys(rows[0]) : []);
    if (role && !store.ROLE[role]) store.ROLE[role] = name;
  });
  store.fileName = PENDING.name;
  store.RF = store.ROLE.fac ? buildRF(store.WB[store.ROLE.fac]) : null;
  store.BO = store.ROLE.sug ? buildBO(store.WB[store.ROLE.sug]) : [];
  if (store.ROLE.rss) buildRSS(store.WB[store.ROLE.rss]);
  // guardar para próximas sesiones (no bloquea la UI)
  // guardar localmente (rápido) y en Supabase (multi-dispositivo). Ninguno bloquea la UI.
  if (PENDING.buf) {
    kvSet('file', { name: PENDING.name, selected, buf: PENDING.buf }).catch(() => {});
    uploadPortalFile(PENDING.buf, { name: PENDING.name, fileName: PENDING.name, selected, roles: store.ROLE }).catch(() => {});
  }
  closeModal();
  onReadyCb();
}

/* construye el store a partir de un workbook ya parseado */
function buildFromParsed(parsed, selected, fileName) {
  store.WB = {}; store.ROLE = {};
  (selected && selected.length ? selected : parsed.names).forEach(name => {
    const rows = parsed.sheets[name]; if (!rows) return;
    store.WB[name] = rows;
    const role = roleOf(rows.length ? Object.keys(rows[0]) : []);
    if (role && !store.ROLE[role]) store.ROLE[role] = name;
  });
  store.fileName = fileName || '';
  store.RF = store.ROLE.fac ? buildRF(store.WB[store.ROLE.fac]) : null;
  store.BO = store.ROLE.sug ? buildBO(store.WB[store.ROLE.sug]) : [];
  if (store.ROLE.rss) buildRSS(store.WB[store.ROLE.rss]);
}

/* reconstruye el último archivo guardado localmente (IndexedDB) */
export async function restoreSaved() {
  let rec; try { rec = await kvGet('file'); } catch (e) { return false; }
  if (!rec || !rec.buf) return false;
  const parsed = await parseWorkbook(rec.buf);
  buildFromParsed(parsed, rec.selected, rec.name);
  return true;
}

/* restaura el último archivo ACTIVO desde Supabase (visible en otros dispositivos).
   Si no hay o falla, cae al archivo local. Devuelve 'supabase' | 'local' | false. */
export async function restoreShared() {
  try {
    const meta = await latestPortalUpload();
    if (meta && meta.storage_path) {
      const buf = await downloadPortalFile(meta.storage_path);
      if (buf) {
        const parsed = await parseWorkbook(buf);
        buildFromParsed(parsed, meta.selected || [], meta.file_name || meta.name);
        // cachear local para arranques siguientes más rápidos
        kvSet('file', { name: meta.file_name || meta.name, selected: meta.selected || [], buf }).catch(() => {});
        return 'supabase';
      }
    }
  } catch (e) { /* cae a local */ }
  return (await restoreSaved()) ? 'local' : false;
}
export async function forgetSaved() {
  try { await kvDel('file'); } catch (e) {}
  store.WB = {}; store.ROLE = {}; store.RF = null; store.BO = []; store.fileName = '';
}
export const savedFileName = () => store.fileName || '';
