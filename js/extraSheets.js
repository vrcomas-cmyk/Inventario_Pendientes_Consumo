/* ===========================================================================
   extraSheets.js · lee Google Sheets (gviz) y arma lookups por llave.
   Uso (cuando llenes sheetsConfig.js):
     import { loadExtraSheets, enrich } from './extraSheets.js';
     await loadExtraSheets();                 // una vez, antes de render
     enrich({ matBase:'102100', dest:'100002' });  // -> { 'Línea':'…', 'Región':'…' }
   =========================================================================== */
import { norm } from './utils.js';
import { EXTRA_SHEETS } from './sheetsConfig.js';

const maps = [];   // [{ joinOn, byKey:Map, fields }]

/* gviz devuelve "…setResponse({...});" -> extraemos el JSON */
async function fetchSheet(id, sheet) {
  const url = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(sheet)}`;
  const txt = await fetch(url).then(r => r.text());
  const json = JSON.parse(txt.replace(/^[^{]*\{/, '{').replace(/\);?\s*$/, ''));
  const cols = json.table.cols.map(c => c.label || c.id);
  return json.table.rows.map(r => {
    const o = {};
    (r.c || []).forEach((cell, i) => { o[cols[i]] = cell ? (cell.v != null ? cell.v : cell.f) : ''; });
    return o;
  });
}

export async function loadExtraSheets() {
  maps.length = 0;
  for (const cfg of EXTRA_SHEETS) {
    try {
      const rows = await fetchSheet(cfg.id, cfg.sheet);
      const byKey = new Map();
      rows.forEach(r => byKey.set(norm(r[cfg.keyCol]), r));
      maps.push({ joinOn: cfg.joinOn, byKey, fields: cfg.fields || [] });
    } catch (e) { console.warn('Extra sheet falló:', cfg.sheet, e.message); }
  }
  return maps.length;
}

/* devuelve { etiqueta: valor } cruzando por joinOn (matBase/dest/solic) */
export function enrich(keys) {
  const out = {};
  maps.forEach(m => {
    const k = norm(keys[m.joinOn]);
    const row = m.byKey.get(k);
    if (row) m.fields.forEach(f => { out[f.as] = row[f.col]; });
  });
  return out;
}

export const hasExtraSheets = () => EXTRA_SHEETS.length > 0;
