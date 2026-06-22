/* ===========================================================================
   enrich.js · datos maestros desde Google Sheets (pestañas Ejecutivos y
   Materiales). Se cachean en el navegador (cambian poco) y se refrescan solo
   al presionar "Actualizar".
   - Grupo de cliente: Gpo Cte (código) -> "Grupo Cliente" (texto)
   - Ejecutivo: Zona (= Gpo.Vdor.) -> Ejecutivo / Región / Gerencia…
   - Material: Material (código) -> Sector / Grupo de artículos…
   Requisito: el libro debe estar compartido como "cualquiera con el enlace
   puede ver" para que el endpoint gviz responda.
   =========================================================================== */
import { norm } from './utils.js';

const SHEET_ID = '1AeDp_J7sC3PcM1duP3iXKd-VVtWm7g3d3HiSeoKdFTY';
const TABS = { ejecutivos: 'Ejecutivos', materiales: 'Materiales' };
const CACHE_KEY = 'enrich_v1';

let EJ = [], MAT = [], loaded = false, loading = false, lastErr = '';
const mapGrupo = new Map(), mapEjec = new Map(), mapMat = new Map();

/* normaliza códigos: quita decimales .0 y ceros a la izquierda.
   "000"->"0" · "001"->"1" · "017"->"17" · "20.0"->"20" · "0.0"->"0" · "602.0"->"602"
   (deja intactos los no numéricos y conserva la precisión de códigos largos) */
export function normCode(v) {
  let s = norm(v);
  if (s === '') return '';
  s = s.replace(/^(-?\d+)\.0+$/, '$1');               // 20.0 -> 20
  if (/^-?\d+$/.test(s)) {
    const neg = s[0] === '-', d = (neg ? s.slice(1) : s).replace(/^0+(?=\d)/, '');
    return (neg ? '-' : '') + d;
  }
  return s;
}
function addKey(map, v, val) { const k = normCode(v); if (k && !map.has(k)) map.set(k, val); }
function getKey(map, v) { return map.get(normCode(v)); }

async function fetchTab(name) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:json&sheet=${encodeURIComponent(name)}`;
  const txt = await fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + name); return r.text(); });
  const json = JSON.parse(txt.substring(txt.indexOf('{'), txt.lastIndexOf('}') + 1));
  const cols = json.table.cols.map((c, i) => norm(c.label) || ('col' + i));
  return json.table.rows.map(r => {
    const o = {};
    (r.c || []).forEach((cell, i) => { o[cols[i]] = cell ? (cell.v != null ? cell.v : cell.f) : ''; });
    return o;
  });
}

function build() {
  mapGrupo.clear(); mapEjec.clear(); mapMat.clear();
  EJ.forEach(r => {
    addKey(mapGrupo, r['Gpo Cte'], norm(r['Grupo Cliente']));
    addKey(mapEjec, r['Zona'], r);
  });
  MAT.forEach(r => addKey(mapMat, r['Material'], r));
}

export async function loadEnrich(force = false) {
  if (loading) return false;
  if (!force) {
    try { const c = localStorage.getItem(CACHE_KEY); if (c) { const o = JSON.parse(c); EJ = o.EJ || []; MAT = o.MAT || []; build(); loaded = true; return true; } } catch (e) {}
  }
  loading = true; lastErr = '';
  try {
    [EJ, MAT] = await Promise.all([fetchTab(TABS.ejecutivos), fetchTab(TABS.materiales)]);
    localStorage.setItem(CACHE_KEY, JSON.stringify({ EJ, MAT, ts: Date.now() }));
    build(); loaded = true;
  } catch (e) { lastErr = e.message || String(e); }
  finally { loading = false; }
  return loaded;
}

export const enrichLoaded = () => loaded;
export const enrichError  = () => lastErr;
export const enrichTs = () => { try { return JSON.parse(localStorage.getItem(CACHE_KEY) || '{}').ts || null; } catch (e) { return null; } };

/* lookups */
export const grupoCliente = code => getKey(mapGrupo, code) || '';
export const ejecutivoRow = zona => getKey(mapEjec, zona) || null;
export const ejecutivoNombre = zona => { const r = ejecutivoRow(zona); return r ? norm(r['Ejecutivo']) : ''; };
export const materialRow = mat => getKey(mapMat, mat) || null;
export const matSector = mat => { const r = materialRow(mat); return r ? norm(r['Descr. Sector'] || r['Sector']) : ''; };
export const matGrupo  = mat => { const r = materialRow(mat); return r ? norm(r['Descr. Grupo de Art.'] || r['Grupo de artículos']) : ''; };
