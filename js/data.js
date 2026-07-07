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
import { uploadPortalFile, latestActiveByType, downloadPortalFile, ingestFacturacion, readView, VIEWS } from './supabaseData.js';
import { isAdmin } from './authSupabase.js';

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

/* Vuelca la facturación mensual a Supabase con barra de progreso (admin). */
async function ingestarFacturacion(rows) {
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:200;background:var(--panel);border:1px solid var(--bd2);border-radius:10px;padding:12px 14px;min-width:240px;box-shadow:0 6px 20px #0007';
  host.innerHTML = '<div style="font-size:13px;margin-bottom:6px">☁️ Guardando facturación en Supabase…</div><div style="height:8px;background:var(--panel2);border-radius:5px;overflow:hidden"><div id="ingBar" style="height:100%;width:0;background:var(--acc,#8bc53f)"></div></div><div id="ingTxt" class="muted" style="font-size:11px;margin-top:4px">0%</div>';
  document.body.appendChild(host);
  const bar = host.querySelector('#ingBar'), txt = host.querySelector('#ingTxt');
  const res = await ingestFacturacion(rows, (done, total) => {
    const p = Math.round(done / total * 100); bar.style.width = p + '%'; txt.textContent = `${done.toLocaleString('es-MX')} / ${total.toLocaleString('es-MX')} (${p}%)`;
  });
  txt.textContent = res.ok ? `✔ ${res.done.toLocaleString('es-MX')} filas guardadas` : `⚠️ ${res.error || 'error'}`;
  setTimeout(() => host.remove(), res.ok ? 3000 : 8000);
}

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
  const sheets = {}, grids = {};
  wb.SheetNames.forEach(n => { sheets[n] = sheetRows(wb.Sheets[n]); grids[n] = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '', raw: true }); });
  return { names: wb.SheetNames, sheets, grids };
}
/* parseo reutilizable: ArrayBuffer → { names, sheets }. Usado por el cotizador. */
export function parseArrayBuffer(buf) { return parseWorkbook(buf); }

function parseWorkbook(buf) {
  return new Promise(resolve => {
    const w = getWorker();
    if (!w) { resolve(parseSync(buf)); return; }
    const done = res => { w.removeEventListener('message', onMsg); w.removeEventListener('error', onErr); resolve(res); };
    const onMsg = ev => { (ev.data && ev.data.ok) ? done({ names: ev.data.names, sheets: ev.data.sheets, grids: ev.data.grids }) : done(parseSync(buf)); };
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
  // tipos de reporte presentes (cada uno reemplaza SOLO su tipo en Supabase)
  const types = Object.keys(store.ROLE).filter(Boolean);
  store._manual = true;                             // esta sesión manda: restoreShared no debe pisarla
  // guardar localmente (rápido) y en Supabase por tipo (multi-dispositivo). No bloquea la UI.
  if (PENDING.buf) {
    kvSet('file', { name: PENDING.name, selected, buf: PENDING.buf }).catch(() => {});
    uploadPortalFile(PENDING.buf, { name: PENDING.name, fileName: PENDING.name, selected, roles: store.ROLE, types: types.length ? types : ['multi'] })
      .then(async path => {
        if (!path) return;
        // refrescar la caché por tipo con este mismo buffer (no re-descargar después)
        try { const cache = (await kvGet('byType')) || {}; const marker = 'sb:' + path;
          (types.length ? types : ['multi']).forEach(t => { cache[t] = { marker, buf: PENDING.buf }; });
          kvSet('byType', cache).catch(() => {}); } catch (e) {}
      })
      .catch(() => {});
  }
  // Resumen_Fac → tabla mensual (reemplaza) para comparativos/tendencia. Solo admin.
  if (isAdmin() && store.ROLE.fac && store.WB[store.ROLE.fac] && store.WB[store.ROLE.fac].length) {
    ingestarFacturacion(store.WB[store.ROLE.fac]);
  }
  closeModal();
  onReadyCb();
}

/* Arma Sugerencias / Consumo / RSS directamente desde las vistas de Supabase
   (datos vivos, sin necesidad de Excel). La facturación mensual (comparativos)
   se mantiene por el archivo activo / RPC. Devuelve true si cargó algo. */
export async function loadReportsFromSupabase() {
  let sug, cons, rss;
  try { [sug, cons, rss] = await Promise.all([readView(VIEWS.sug), readView(VIEWS.cons), readView(VIEWS.rss)]); }
  catch (e) { return false; }
  if (!(sug && sug.length) && !(cons && cons.length) && !(rss && rss.length)) return false;
  store.WB = store.WB || {}; store.ROLE = store.ROLE || {};
  if (sug && sug.length)  { store.WB['Sugerencias'] = sug;  store.ROLE.sug = 'Sugerencias';  store.BO = buildBO(sug); }
  if (cons && cons.length) { store.WB['Consumo'] = cons;     store.ROLE.cons = 'Consumo'; }
  if (rss && rss.length)  { store.WB['RSS'] = rss;           store.ROLE.rss = 'RSS';          buildRSS(rss); }
  if (!store.fileName) store.fileName = 'Supabase (vistas)';
  return true;
}
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

/* Restaura el ÚLTIMO archivo de CADA tipo de reporte desde Supabase (cada uno se
   reemplaza por separado). Usa caché por tipo para no re-descargar lo que no cambió.
   Devuelve 'supabase' | 'local' | false. */
export async function restoreShared() {
  if (store._manual) return false;                 // el usuario ya cargó un archivo en esta sesión: no pisar
  try {
    const byType = await latestActiveByType();
    if (byType && byType.size) {
      let cache = {}; try { cache = (await kvGet('byType')) || {}; } catch (e) {}
      const merged = {}; const roles = {}; const newCache = {}; let names = []; const info = [];
      // 'multi' (archivo completo legado) primero, para que los tipos específicos lo SOBREESCRIBAN
      const entries = [...byType.entries()].sort((a, b) => (a[0] === 'multi' ? -1 : b[0] === 'multi' ? 1 : 0));
      for (const [type, rec] of entries) {
        const marker = 'sb:' + rec.storage_path;
        let buf = null;
        if (cache[type] && cache[type].marker === marker && cache[type].buf) buf = cache[type].buf;   // sin cambios → caché
        else buf = await downloadPortalFile(rec.storage_path);
        if (!buf) continue;
        newCache[type] = { marker, buf };
        names.push(rec.file_name || type);
        info.push({ type, file: rec.file_name || '', at: rec.uploaded_at || '' });
        const parsed = await parseWorkbook(buf);
        const use = (rec.selected && rec.selected.length) ? rec.selected : parsed.names;
        use.forEach(n => { const rows = parsed.sheets[n]; if (!rows) return; merged[n] = rows;
          const role = roleOf(rows.length ? Object.keys(rows[0]) : []); if (role) roles[role] = n; });  // el último (más específico) gana
      }
      if (Object.keys(merged).length) {
        if (store._manual) return false;           // guard por si el usuario subió mientras descargábamos
        store.WB = merged; store.ROLE = roles; store.fileName = [...new Set(names)].join(' + ');
        store.DATAINFO = info;
        store.RF = store.ROLE.fac ? buildRF(store.WB[store.ROLE.fac]) : null;
        store.BO = store.ROLE.sug ? buildBO(store.WB[store.ROLE.sug]) : [];
        if (store.ROLE.rss) buildRSS(store.WB[store.ROLE.rss]);
        kvSet('byType', newCache).catch(() => {});
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
