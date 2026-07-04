/* ===========================================================================
   resumenSin.js · pestaña "Resumen Sin Sugerencias"
   Pivote: Material (fila) × Centro (columna). Cada celda = inventario general
   del centro (almacenes 1030+1031+1060) + pendiente / en curso como subíndice.
   Clic en la celda → detalle por almacén (inventario, pendiente, tránsito, consumo).
   =========================================================================== */
import { norm, num, fmt, money, esc, mesKey } from './utils.js';
import { store, C, RC } from './store.js';
import { openModal, backBtn, pill, navPush, wireSegToggle, trendText, drawSerie } from './ui.js';
import { makeFilters, toolbarHTML, wireToolbar, passes, makeSuggest } from './filters.js';
import { makeSort, applySort, th } from './sort.js';
import { zoomHTML, wireZoom } from './zoom.js';
import { exportXlsx, stamp } from './exportx.js';
import { consumoTableHTML, openConsumoMaterial } from './consumo.js';
import { openDetalle } from './sugerencias.js';
import { showLotes, ensureInvData, precioInvMat, preciosCondHTML } from './inventario.js';
import { navOpen } from './ui.js';
import { matSector, matGrupo } from './enrich.js';
import { sugTablaHTML, sugExportRows } from './sugTabla.js';
import { setRSS } from './rssStore.js';
import { serieMaterial, tendenciaTexto } from './resumenFac.js';

export const RSS = {
  centro: 'Centro', alm: 'Almacen', pedidos: 'Pedidos', material: 'Material', desc: 'Descripcion',
  pend: 'Cantidad_Pendiente', impPend: 'Importe_Pendiente', prom: 'Promedio_Consumo_12M',
  ultMes: 'Ultimo_Mes_Consumo', cantUlt: 'Cantidad_Ultimo_Mes', penMes: 'Penultimo_Mes_Consumo', cantPen: 'Cantidad_Penultimo_Mes',
  meses: 'Meses_Inventario', inv1030: 'Inv 1030', inv1031: 'Inv 1031', inv1032: 'Inv 1032', inv1060: 'Inv 1060',
  transito: 'Cant. en Tránsito', disp1030: 'Disponible 1031-1030', disp1032: 'Disponible 1031-1032',
  sumaInv: 'Suma inventario', sumaPend: 'Suma pendiente', status: 'Status Revisión', fuente: 'Fuente',
};
const ALM_INV = { '1030': 'inv1030', '1031': 'inv1031', '1032': 'inv1032', '1060': 'inv1060' };

let MATS = new Map();     // material -> objeto
let CENTROS = [];         // lista de centros presentes
let RSS_CURMES = 0;       // mesKey del mes más reciente de consumo en el archivo
const flt = makeFilters();
const sort = makeSort();

export function buildRSS(rows) {
  const mats = new Map(); const centros = new Set(); let curMes = 0;
  for (const r of rows) {
    const m = norm(r[RSS.material]); if (!m) continue;
    const c = norm(r[RSS.centro]); const a = norm(r[RSS.alm]);
    centros.add(c);
    const uk = mesKey(norm(r[RSS.ultMes])); if (uk > curMes) curMes = uk;
    let mo = mats.get(m);
    if (!mo) { mo = { material: m, desc: norm(r[RSS.desc]), centros: new Map(), fuentes: new Set(),
      disp1030: num(r[RSS.disp1030]), disp1032: num(r[RSS.disp1032]), sumaInv: num(r[RSS.sumaInv]), sumaPend: num(r[RSS.sumaPend]) };
      mats.set(m, mo); }
    if (norm(r[RSS.fuente])) mo.fuentes.add(norm(r[RSS.fuente]));
    let co = mo.centros.get(c);
    if (!co) {
      co = { centro: c, invAlm: { '1030': num(r[RSS.inv1030]), '1031': num(r[RSS.inv1031]), '1032': num(r[RSS.inv1032]), '1060': num(r[RSS.inv1060]) },
        pend: 0, transito: 0, impPend: 0, pedidos: 0, ultMesK: 0, status: new Set(), alm: new Map() };
      mo.centros.set(c, co);
    }
    co.pend += num(r[RSS.pend]); co.transito += num(r[RSS.transito]); co.impPend += num(r[RSS.impPend]);
    co.pedidos = Math.max(co.pedidos, num(r[RSS.pedidos]));       // "Pedidos" ya viene por centro
    if (uk > co.ultMesK) co.ultMesK = uk;
    if (norm(r[RSS.status])) co.status.add(norm(r[RSS.status]));
    const invA = ALM_INV[a] ? co.invAlm[a] : 0;
    co.alm.set(a || '—', { alm: a || '—', inv: invA, pend: num(r[RSS.pend]), transito: num(r[RSS.transito]), impPend: num(r[RSS.impPend]),
      prom: num(r[RSS.prom]), ultMes: norm(r[RSS.ultMes]), cantUlt: num(r[RSS.cantUlt]), penMes: norm(r[RSS.penMes]), cantPen: num(r[RSS.cantPen]),
      meses: num(r[RSS.meses]), status: norm(r[RSS.status]), fuente: norm(r[RSS.fuente]) });
  }
  MATS = mats;
  CENTROS = [...centros].filter(Boolean).sort();
  RSS_CURMES = curMes;
  setRSS(MATS, CENTROS, RSS_CURMES);
  return mats;
}

/* material sin movimiento ≥6 meses y sin pendientes en ese centro, pero con inventario:
   candidato a reubicar a un centro donde sí se ocupe */
const MESES_LENTO = 6;
function esLento(co) {
  if (!co) return false;
  if (invGen(co) <= 0 || co.pend > 0) return false;
  if (!co.ultMesK) return true;                          // nunca se ha movido
  return (RSS_CURMES - co.ultMesK) >= MESES_LENTO;
}
function statusCentro(co) { return co && co.status.size ? [...co.status].join(', ') : ''; }

const invGen = co => co ? (co.invAlm['1030'] + co.invAlm['1031'] + co.invAlm['1060']) : 0;

/* filas aplanadas para filtros (una por material) */
function rowsForFilter() {
  return [...MATS.values()].map(mo => ({
    material: mo.material, desc: mo.desc,
    sector: matSector(mo.material) || '', grupo: matGrupo(mo.material) || '',
    fuente: [...mo.fuentes].join(' '),
    centros: [...mo.centros.keys()].join(' '),
    status: [...new Set([...mo.centros.values()].flatMap(co => [...co.alm.values()].map(a => a.status)).filter(Boolean))].join(' '),
    _mo: mo,
  }));
}
const cols = () => [
  { key: 'material', label: 'Material', get: r => r.material },
  { key: 'desc', label: 'Descripción', get: r => r.desc },
  { key: 'sector', label: 'Sector', get: r => r.sector },
  { key: 'grupo', label: 'Grupo art.', get: r => r.grupo },
  { key: 'fuente', label: 'Fuente', get: r => r.fuente },
  { key: 'centro', label: 'Centro', get: r => r.centros },
  { key: 'status', label: 'Status Revisión', get: r => r.status },
];
const accessor = {
  material: r => r.material, desc: r => r.desc,
  pend: r => [...r._mo.centros.values()].reduce((s, co) => s + co.pend, 0),
  inv: r => [...r._mo.centros.values()].reduce((s, co) => s + invGen(co), 0),
};

function filtered() {
  const c = cols();
  return rowsForFilter().filter(r => passes(r, c, flt));
}

export function renderResumenSin(container) {
  if (!store.WB || !store.ROLE || !store.ROLE.rss) {
    container.innerHTML = `<div class="empty"><p>📄 No se ha cargado la hoja <b>Resumen Sin Sugerencias</b>.</p>
      <p class="muted">Sube un archivo que contenga esa hoja (columnas Centro, Almacen, Cantidad_Pendiente, Suma inventario…).</p></div>`;
    return;
  }
  const expBtn = `<button class="btn" data-exp>⬇️ Excel</button><button class="btn" data-clearall>🧹 Limpiar todo</button>`;
  container.innerHTML = `${toolbarHTML(cols(), flt, `${zoomHTML('rss')}${expBtn}`, 'dl-rss')}<div class="result"></div>`;
  wireToolbar(container, flt, () => renderResumenSin(container), () => paint(container), makeSuggest(filtered(), cols()));
  container.querySelector('[data-clearall]')?.addEventListener('click', () => { flt.q = ''; flt.list = []; renderResumenSin(container); });
  container.querySelector('[data-exp]')?.addEventListener('click', () => exportRSS());
  paint(container);
}

function paint(container) {
  let list = applySort(filtered(), sort, accessor);

  const totPend = list.reduce((s, r) => s + accessor.pend(r), 0);
  const totInv = list.reduce((s, r) => s + accessor.inv(r), 0);
  const totTransito = list.reduce((s, r) => s + [...r._mo.centros.values()].reduce((a, co) => a + co.transito, 0), 0);

  const head = `${th('Material', 'material', sort)}${th('Descripción', 'desc', sort)}${th('Sector / Grupo art.', 'sector', sort)}${th('Tendencia', 'tend', sort)}${th('Status Revisión', 'status', sort)}
    ${CENTROS.map(c => `<th class="num">Centro ${esc(c)}</th>`).join('')}
    ${th('Inv. total', 'inv', sort, 'num')}${th('Pend. total', 'pend', sort, 'num')}`;

  const body = list.slice(0, 800).map(r => {
    const mo = r._mo;
    const cells = CENTROS.map(c => {
      const co = mo.centros.get(c);
      if (!co) return `<td class="num muted">—</td>`;
      const ig = invGen(co);
      const curso = co.transito ? ` <span class="tnd up" title="En curso / tránsito hacia este centro">+${fmt(co.transito)}</span>` : '';
      const lento = esLento(co) ? ` <span class="lento" title="Sin movimiento ≥6 meses y sin pendientes en este centro. Con ${fmt(ig)} en inventario: candidato a reubicar a un centro donde sí se ocupe.">⚠️</span>` : '';
      const sub = co.pend ? `<div class="sub"><span class="tnd down">Pend ${fmt(co.pend)}</span></div>` : '';
      return `<td class="num"><span class="lnk" data-cel="${esc(r.material)}|${esc(c)}">${fmt(ig)}</span>${curso}${lento}${sub}</td>`;
    }).join('');
    const invTot = [...mo.centros.values()].reduce((s, co) => s + invGen(co), 0);
    const pendTot = [...mo.centros.values()].reduce((s, co) => s + co.pend, 0);
    const statuses = [...new Set([...mo.centros.values()].flatMap(co => [...co.status]))].filter(Boolean);
    const fuentes = [...mo.fuentes];
    return `<tr>
      <td><span class="lnk" data-mat="${esc(r.material)}">${esc(r.material)}</span></td>
      <td class="muted" style="font-size:11px">${esc(r.desc)}</td>
      <td>${esc(r.sector) || '—'}<div class="sub">${esc(r.grupo) || ''}</div></td>
      <td>${trendText(tendenciaTexto(serieMaterial(r.material)))}</td>
      <td>${statuses.length ? statuses.map(s => pill(s, 'amb')).join(' ') : '—'}</td>
      ${cells}
      <td class="num"><b><span class="lnk" data-tot="${esc(r.material)}">${fmt(invTot)}</span></b></td>
      <td class="num">${pendTot ? `<span class="lnk" data-tot="${esc(r.material)}"><b class="tnd down">${fmt(pendTot)}</b></span>` : '—'}</td></tr>`;
  }).join('');
  const colspan = 5 + CENTROS.length + 2;

  container.querySelector('.result').innerHTML = `
    <div class="invtop">
      <div class="kpis2x2" style="max-width:520px">
        <div class="kpi sm"><div class="lbl">Materiales (filtro)</div><div class="val">${fmt(list.length)}</div></div>
        <div class="kpi sm"><div class="lbl">Inv. total (filtro)</div><div class="val" style="font-size:18px">${fmt(totInv)}</div></div>
        <div class="kpi sm"><div class="lbl">Pendiente total</div><div class="val tnd down" style="font-size:18px">${fmt(totPend)}</div></div>
        <div class="kpi sm"><div class="lbl">En tránsito total</div><div class="val tnd amb" style="font-size:18px">${fmt(totTransito)}</div></div>
      </div>
      <p class="muted" style="align-self:center;max-width:380px">Cada celda: inventario general del centro (1030+1031+1060) · <span class="tnd up">+N</span> en curso (tránsito) · <span class="tnd down">Pend</span> pendiente · <span class="lento">⚠️</span> sin movimiento ≥6 meses y sin pendientes (reubicable). Clic en el inventario = sugerencias y consumo de ese centro; clic en Inv/Pend total = totales del material.</p>
    </div>
    <div class="tablecard">
      <h3>🏭 Resumen por centro/almacén (sin sugerencias) <span class="hint">material en filas · centros en columnas</span></h3>
      <div class="tbl"><table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body || `<tr><td colspan="${colspan}" class="muted" style="padding:20px;text-align:center">Sin resultados</td></tr>`}</tbody>
      </table>${list.length > 800 ? `<p class="muted" style="padding:8px">Mostrando 800 de ${list.length}.</p>` : ''}</div>
    </div>`;

  wireZoom(container, 'rss', '.result .tbl table');
  container.querySelectorAll('.result [data-cel]').forEach(el => el.addEventListener('click', () => { const [m, c] = el.dataset.cel.split('|'); ensureInvData().finally(() => navOpen(() => openCeldaDetalle(m, c))); }));
  container.querySelectorAll('.result [data-tot]').forEach(el => el.addEventListener('click', ev => { ev.stopPropagation(); ensureInvData().finally(() => navOpen(() => openMaterialTotales(el.dataset.tot))); }));
  container.querySelectorAll('.result [data-mat]').forEach(el => el.addEventListener('click', () => {
    const mat = el.dataset.mat;
    ensureInvData().finally(() => navOpen(() => showLotes(mat)));
  }));
}

/* sugerencias (BO) y consumo (RC) para material [+ centro] */
function sugFor(material, centro) {
  const m = norm(material), c = centro ? norm(centro) : null;
  return (store.BO || []).filter(it => norm(it.bo[C.matBase]) === m && (!c || norm(it.bo[C.centro]) === c));
}
function consFor(material, centro) {
  const cons = (store.ROLE && store.ROLE.cons) ? (store.WB[store.ROLE.cons] || []) : [];
  const m = norm(material), c = centro ? norm(centro) : null;
  return cons.filter(r => norm(r[RC.material]) === m && (!c || norm(r[RC.centro]) === c));
}
function wireSugCons(sug, cons, material, tag) {
  document.querySelectorAll('#modal tr[data-sug]').forEach(tr => tr.addEventListener('click', () => navPush(() => openDetalle(sug[+tr.dataset.sug]))));
  document.querySelectorAll('#modal tr[data-cmi]').forEach(tr => tr.addEventListener('click', () => navPush(() => openConsumoMaterial(cons[+tr.dataset.cmi]))));
  const pOferta = material != null ? precioInvMat(material) : null;
  const eSug = document.querySelector('#modal [data-expsug]');
  if (eSug) eSug.onclick = () => exportXlsx(`sugerencias_${tag}_${stamp()}.xlsx`, sugExportRows(sug, pOferta), 'Sugerencias');
  const eCons = document.querySelector('#modal [data-expcons]');
  if (eCons) eCons.onclick = () => exportXlsx(`consumo_${tag}_${stamp()}.xlsx`, (cons || []).map(r => ({
    Solicitante: norm(r[RC.solic]), Destinatario: norm(r[RC.dest]), 'Razón social': norm(r[RC.razon]), Centro: norm(r[RC.centro]),
    Material: norm(r[RC.material]), 'Descripción': norm(r[RC.texto]), 'Consumo actual': num(r[RC.consumoAct]), 'Prom. mensual': num(r[RC.promedio]),
    'Último mes': norm(r[RC.ultMes]), 'Cant. última': num(r[RC.cantUlt]), 'Importe última': num(r[RC.impUlt]),
    'Penúltimo mes': norm(r[RC.penFecha]), 'Cant. penúltima': num(r[RC.cantPen]), 'Importe penúltima': num(r[RC.impPen]) })), 'Consumo');
}

/* detalle de una celda (material × centro) desglosado por almacén */
export function openCeldaDetalle(material, centro) {
  const mo = MATS.get(norm(material)); if (!mo) return;
  const co = mo.centros.get(norm(centro)); if (!co) return;
  const sug = sugFor(material, centro), cons = consFor(material, centro);
  const alms = [...co.alm.values()].sort((a, b) => String(a.alm).localeCompare(String(b.alm)));
  const body = alms.map(a => `<tr>
    <td>${esc(a.alm)}</td>
    <td class="num">${fmt(a.inv)}</td>
    <td class="num">${a.pend ? `<b class="tnd down">${fmt(a.pend)}</b>` : '—'}</td>
    <td class="num">${a.transito ? `<span class="tnd amb">${fmt(a.transito)}</span>` : '—'}</td>
    <td class="num">${money(a.impPend)}</td>
    <td class="num">${fmt(a.prom)}</td>
    <td>${esc(a.ultMes) || '—'}${a.cantUlt ? `<div class="sub">${fmt(a.cantUlt)} pzs</div>` : ''}</td>
    <td>${esc(a.penMes) || '—'}${a.cantPen ? `<div class="sub">${fmt(a.cantPen)} pzs</div>` : ''}</td>
    <td class="num">${a.meses ? a.meses.toFixed(1) : '—'}</td>
    <td>${a.status ? pill(a.status, 'amb') : '—'}</td>
    <td class="muted" style="font-size:11px">${esc(a.fuente)}</td></tr>`).join('');
  openModal(`${backBtn()}<button class="x" onclick="closeModal()">×</button>
    <h2>${esc(material)} · Centro ${esc(centro)}</h2>
    <p class="muted">${esc(mo.desc)}</p>
    <div class="consu" style="margin-bottom:8px">
      <div class="b"><div class="t">Inv. general del centro</div><div class="m">${fmt(invGen(co))}</div></div>
      <div class="b"><div class="t">Pendiente</div><div class="m tnd down">${fmt(co.pend)}</div></div>
      <div class="b"><div class="t">En tránsito</div><div class="m tnd amb">${fmt(co.transito)}</div></div>
      <div class="b"><div class="t">Importe pendiente</div><div class="m">${money(co.impPend)}</div></div>
    </div>
    <div class="tablecard"><div class="tbl"><table>
      <thead><tr><th>Almacén</th><th class="num">Inventario</th><th class="num">Pendiente</th><th class="num">En tránsito</th><th class="num">Importe pend.</th><th class="num">Consumo prom.</th><th>Último mes</th><th>Penúltimo mes</th><th class="num">Meses inv.</th><th>Status</th><th>Fuente</th></tr></thead>
      <tbody>${body || '<tr><td colspan="11" class="muted" style="padding:14px;text-align:center">Sin almacenes.</td></tr>'}</tbody>
    </table></div></div>
    <p class="muted" style="font-size:12px">Dispersión (planta 1031): almacén 1030 = <b>${fmt(mo.disp1030)}</b> · almacén 1032 = <b>${fmt(mo.disp1032)}</b>. Suturas salen del centro 1018.</p>
    ${preciosCondHTML(material)}
    <div class="tablecard"><h3>📈 Tendencia de facturación — material <span class="hint">Resumen_Fac</span></h3><div class="chartbox" style="height:220px;padding:10px"><canvas id="cRssMat"></canvas></div></div>
    <div class="segm" style="margin-top:14px">
      <button class="seg on" data-view="sug">📋 Sugerencias (${sug.length})</button>
      <button class="seg" data-view="cons">📊 Consumo (${cons.length})</button>
    </div>
    <div class="tablecard" data-pane="sug"><h3>📋 Sugerencias en este centro <span class="hint">clic para ver detalle / pedido</span> <button class="btn" data-expsug style="float:right">⬇️ Excel</button></h3><input class="mff" data-mf placeholder="🔎 filtrar…">${sugTablaHTML(sug, precioInvMat(material))}</div>
    <div class="tablecard" data-pane="cons" style="display:none"><h3>📊 Consumo en este centro <button class="btn" data-expcons style="float:right">⬇️ Excel</button></h3><input class="mff" data-mf placeholder="🔎 filtrar…">${cons.length ? consumoTableHTML(cons) : '<p class="muted">Sin facturación de consumo.</p>'}</div>
    <div data-condbox style="margin-top:10px"></div>`);
  wireToggleAndCond(material);
  wireSugCons(sug, cons, material, `${material}_centro_${centro}`);
}
/* dibuja la tendencia del material y añade accesos a condiciones (por inventario / por material) */
function wireToggleAndCond(material) {
  wireSegToggle();
  if (document.getElementById('cRssMat')) drawSerie('cRssMat', serieMaterial(material), 'Facturación mensual');
  const conds = window.__condMat ? window.__condMat(material) : [];
  const box = document.querySelector('#modal [data-condbox]');
  if (box && conds.length) {
    box.innerHTML = `<span class="hint">Este material tiene <b>${conds.length}</b> condición(es) en Inventario:</span> ${conds.map(c => esc(c.cond)).join(', ')}
      <button class="btn" data-cond-inv style="margin-left:8px">🏷️ Detalle por inventario</button>
      <button class="btn" data-cond-mat style="margin-left:6px">📦 Detalle por material</button>`;
    box.querySelector('[data-cond-inv]')?.addEventListener('click', () => { if (window.__openMaterialInv) window.__openMaterialInv(material); });
    box.querySelector('[data-cond-mat]')?.addEventListener('click', () => navPush(() => openMaterialTotales(material)));
  }
}

/* totales del material: sugerencias + consumo de todos los centros */
export function openMaterialTotales(material) {
  const mo = MATS.get(norm(material)); if (!mo) return;
  const sug = sugFor(material, null), cons = consFor(material, null);
  const pendTot = sug.reduce((s, it) => s + num(it.bo[C.pend]), 0);
  const impTot = sug.reduce((s, it) => s + num(it.bo[C.pend]) * num(it.bo[C.precio]), 0);
  openModal(`${backBtn()}<button class="x" onclick="closeModal()">×</button>
    <h2>${esc(material)} · Totales</h2>
    <p class="muted">${esc(mo.desc)}</p>
    <div class="consu" style="margin-bottom:8px">
      <div class="b"><div class="t">Inventario global</div><div class="m">${fmt(mo.sumaInv)}</div></div>
      <div class="b"><div class="t">Pendiente global</div><div class="m tnd down">${fmt(mo.sumaPend)}</div></div>
      <div class="b"><div class="t">Sugerencias</div><div class="m">${fmt(sug.length)}</div></div>
      <div class="b"><div class="t">Clientes en consumo</div><div class="m">${fmt(cons.length)}</div></div>
    </div>
    <div class="segm" style="margin-top:14px">
      <button class="seg on" data-view="sug">📋 Sugerencias (${sug.length})</button>
      <button class="seg" data-view="cons">📊 Consumo (${cons.length})</button>
    </div>
    <div class="tablecard" data-pane="sug"><h3>📋 Todas las sugerencias del material <span class="hint">clic para ver detalle / pedido</span> <button class="btn" data-expsug style="float:right">⬇️ Excel</button></h3><input class="mff" data-mf placeholder="🔎 filtrar…">${sugTablaHTML(sug, precioInvMat(material))}</div>
    <div class="tablecard" data-pane="cons" style="display:none"><h3>📊 Todo el consumo del material <button class="btn" data-expcons style="float:right">⬇️ Excel</button></h3><input class="mff" data-mf placeholder="🔎 filtrar…">${cons.length ? consumoTableHTML(cons) : '<p class="muted">Sin facturación de consumo.</p>'}</div>`);
  wireSegToggle();
  wireSugCons(sug, cons, material, `${material}_totales`);
}

/* detalle del material en todos los centros */
export function openMaterialRSS(material) {
  const mo = MATS.get(norm(material)); if (!mo) return;
  const rows = [...mo.centros.values()].sort((a, b) => invGen(b) - invGen(a)).map(co => `<tr class="click" data-cel2="${esc(co.centro)}">
    <td><span class="lnk">Centro ${esc(co.centro)}</span></td>
    <td class="num">${fmt(invGen(co))}</td>
    <td class="num">${co.pend ? `<b class="tnd down">${fmt(co.pend)}</b>` : '—'}</td>
    <td class="num">${co.transito ? `<span class="tnd amb">${fmt(co.transito)}</span>` : '—'}</td>
    <td class="num">${money(co.impPend)}</td>
    <td class="num">${fmt(co.pedidos)}</td></tr>`).join('');
  openModal(`${backBtn()}<button class="x" onclick="closeModal()">×</button>
    <h2>${esc(material)}</h2>
    <p class="muted">${esc(mo.desc)} · Inv. global ${fmt(mo.sumaInv)} · Pendiente global ${fmt(mo.sumaPend)}</p>
    <div class="tablecard"><h3>Por centro <span class="hint">clic para ver almacenes</span></h3><div class="tbl"><table>
      <thead><tr><th>Centro</th><th class="num">Inv. general</th><th class="num">Pendiente</th><th class="num">En tránsito</th><th class="num">Importe pend.</th><th class="num">Pedidos</th></tr></thead>
      <tbody>${rows || '<tr><td colspan="6" class="muted" style="padding:14px;text-align:center">Sin centros.</td></tr>'}</tbody>
    </table></div></div>
    <p class="muted" style="font-size:12px">Dispersión (planta 1031): almacén 1030 = <b>${fmt(mo.disp1030)}</b> · almacén 1032 = <b>${fmt(mo.disp1032)}</b>.</p>`);
  document.querySelectorAll('#modal tr[data-cel2]').forEach(tr => tr.addEventListener('click', () => openCeldaDetalle(material, tr.dataset.cel2)));
}

function exportRSS() {
  const out = [];
  filtered().forEach(r => {
    const mo = r._mo;
    mo.centros.forEach(co => co.alm.forEach(a => out.push({
      Material: mo.material, Descripción: mo.desc, Centro: co.centro, Almacén: a.alm,
      Inventario: a.inv, Pendiente: a.pend, 'En tránsito': a.transito, 'Importe pendiente': a.impPend,
      'Consumo prom 12M': a.prom, 'Último mes': a.ultMes, 'Cant último': a.cantUlt, 'Penúltimo mes': a.penMes, 'Cant penúltimo': a.cantPen,
      'Meses inventario': a.meses, Status: a.status, Fuente: a.fuente,
      'Inv general centro (1030+1031+1060)': invGen(co),
    })));
  });
  exportXlsx(`resumen_sin_sugerencias_${stamp()}.xlsx`, out, 'ResumenSinSug');
}

if (typeof window !== 'undefined') window.__openRSSCelda = (m, c) => ensureInvData().finally(() => navPush(() => openCeldaDetalle(m, c)));
