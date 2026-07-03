/* ===========================================================================
   consumo.js · "Reporte de Consumo" — v4
   Paginación (dataset completo), orden multi-columna, sugerencias, filtros
   vacíos, gráfica dinámica de facturación y rankings.
   =========================================================================== */
import { norm, num, fmt, money, esc, mesKey, moneyD, pickField } from './utils.js';
import { store, RC } from './store.js';
import { serieMatDest, serieDeConsumo, clasificarEstado, tendenciaTexto, comparativa, aMesAnio, mesLabel,
         mesRefQAnterior, hoyMes, ESTADOS } from './resumenFac.js';
import { openModal, drawSerie, pill, trendText, rankingHTML, backBtn, navOpen, navPush, openClientesMes, comparativaDualHTML } from './ui.js';
import { openEvol } from './sugerencias.js';
import { toolbarHTML, wireToolbar, makeFilters, passes, makeSuggest, periodoControlHTML, wirePeriodo, dateRange, inRangeMonth, wireAddfClicks } from './filters.js';
import { zoomHTML, wireZoom } from './zoom.js';
import { makeSort, cycleSort, applySort, th } from './sort.js';
import { exportXlsx, stamp } from './exportx.js';
import { grupoCliente, ejecutivoNombre, matSector, matGrupo } from './enrich.js';

/* enriquecimiento (misma lógica que Sugerencias): Gpo.Vdor.=Zona, Grp.Cliente=Gpo Cte */
const gpoVdor = r => pickField(r, ['Gpo. Vdor.', 'Gpo.Vdor.', 'Gpo Vdor', 'Grupo Vendedor', 'Grupo de vendedor']);
const centroDe = r => pickField(r, [RC.centro, 'Centro', 'CENTRO', 'Centro Destinatario', 'Centro destinatario']);
const ultFacDestDe = r => pickField(r, [RC.ultFacDest, 'Ultima_facturacion_destinatario', 'Última_facturación_destinatario', 'Ultima facturacion destinatario', 'Ultima_facturacion_dest', 'Ultima_Facturacion_Destinatario']);
const gpoCte  = r => pickField(r, ['Grp. Cliente', 'Gpo. Cte.', 'Gpo Cte', 'Gpo. Cte', 'Grupo de cliente']);
const ejecDe   = r => ejecutivoNombre(gpoVdor(r));
const grupoCli = r => grupoCliente(gpoCte(r)) || gpoCte(r);
const sectorDe = r => matSector(r[RC.material]);
const grupoArt = r => matGrupo(r[RC.material]);

const mLbl = v => { const m = aMesAnio(v); return m ? mesLabel(m) : norm(v); };
const ultFacCell = v => { const t = mLbl(v); return t ? `<b>${esc(t)}</b>` : '—'; };
const mKey = v => { const m = aMesAnio(v); if (!m) return 0; const [mm, yy] = m.split('/').map(Number); return yy * 12 + mm; };
/* celda comparativa actual vs promedio */
function vsCell(actual, prom) {
  const a = num(actual), p = num(prom);
  const pct = p ? ((a - p) / p) * 100 : 0;
  const cls = pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat';
  const ar = pct > 5 ? '▲' : pct < -5 ? '▼' : '—';
  return `<div><b>${fmt(a)}</b></div><div class="sub tnd ${cls}">prom ${fmt(p)} ${ar}${p ? ' ' + Math.abs(pct).toFixed(0) + '%' : ''}</div>`;
}
const cantFechaCell = (cant, fecha) => `<div><b>${fmt(cant)}</b></div><div class="sub">${esc(mLbl(fecha))}</div>`;

/* celdas comunes (mismas columnas para la vista principal y el modal de inventario) */
function consumoCells(r) {
  const st = statusOf(r), tn = tendOf(r);
  return `<td class="num">${vsCell(r[RC.consumoAct], r[RC.promedio])}</td>
    <td data-sort="${mesKey(aMesAnio(r[RC.ultMes]))}">${cantFechaCell(r[RC.cantUlt], r[RC.ultMes])}</td><td class="num">${money(r[RC.impUlt])}</td><td class="num">${moneyD(r[RC.precioUltUni])}</td>
    <td data-sort="${mesKey(aMesAnio(r[RC.penFecha]))}">${cantFechaCell(r[RC.cantPen], r[RC.penFecha])}</td><td class="num">${money(r[RC.impPen])}</td><td class="num">${moneyD(r[RC.precioPenUni])}</td>
    <td>${pill(st.label, st.cls)}</td><td>${trendText(tn)}</td>`;
}

/* tabla de consumo para el modal de Inventario (mismas columnas; filas navegables) */
export function consumoTableHTML(list) {
  const head = `<tr><th>Cliente</th><th>Grupo cliente</th><th>Ejecutivo</th><th>Centro</th><th>Material</th><th class="num">Consumo (actual/prom)</th>
    <th>Última (cant/mes)</th><th class="num">Importe última</th><th class="num">P.U. última</th>
    <th>Penúltima (cant/mes)</th><th class="num">Importe penúlt.</th><th class="num">P.U. penúlt.</th><th>Estado</th><th>Tendencia</th></tr>`;
  const body = list.map((r, i) => `<tr class="click" data-cmi="${i}">
    <td>${esc(r[RC.razon])}<div class="sub"><span class="lnk" data-gosolic="${esc(r[RC.solic])}">Solic ${esc(r[RC.solic])}</span> · <span class="lnk" data-godest="${esc(r[RC.dest])}">Dest ${esc(r[RC.dest])}</span></div></td>
    <td>${esc(grupoCli(r)) || '—'}</td><td>${esc(ejecDe(r)) || '—'}</td><td>${esc(centroDe(r)) || '—'}</td>
    <td><span class="lnk" data-goinv="${esc(r[RC.material])}">${esc(r[RC.material])}</span><div class="sub">${esc(r[RC.texto])}</div></td>
    ${consumoCells(r)}</tr>`).join('');
  return `<div class="tbl"><table><thead>${head}</thead><tbody>${body || '<tr><td colspan="14" class="muted" style="padding:14px;text-align:center">Sin facturación de consumo para este material.</td></tr>'}</tbody></table></div>`;
}
export const consumoMaterialRows = material =>
  (store.ROLE.cons ? store.WB[store.ROLE.cons] || [] : []).filter(r => norm(r[RC.material]) === norm(material)).sort((a, b) => mKey(b[RC.ultMes]) - mKey(a[RC.ultMes]));
export function openConsumoMaterial(r) { navPush(() => openMaterial(r)); }

const flt = makeFilters();
flt.estado = ''; flt.periodo = ''; flt.desde = ''; flt.hasta = '';
let sort = makeSort();
let page = 0, size = 100;
const rows = () => store.ROLE.cons ? store.WB[store.ROLE.cons] : [];

/* ---- memo por clave dest||material ---- */
let mSerie = new Map(), mStatus = new Map(), mTend = new Map(), globalCmp = null;
function resetCache() { mSerie = new Map(); mStatus = new Map(); mTend = new Map(); globalCmp = null; }
const isoMesKey = iso => { const m = /^(\d{4})-(\d{2})/.exec(iso || ''); return m ? (+m[1]) * 12 + (+m[2]) : null; };
const keyR = r => norm(r[RC.dest]) + '||' + norm(r[RC.material]);
function serieOf(r) { const k = keyR(r); if (!mSerie.has(k)) mSerie.set(k, serieMatDest(r[RC.dest], r[RC.material]) || serieDeConsumo(r, RC)); return mSerie.get(k); }
function statusOf(r) { const k = keyR(r); if (!mStatus.has(k)) { const s = serieOf(r); mStatus.set(k, clasificarEstado(s.length ? s : null, false)); } return mStatus.get(k); }
function tendOf(r) { const k = keyR(r); if (!mTend.has(k)) mTend.set(k, tendenciaTexto(serieOf(r))); return mTend.get(k); }

const cols = () => [
  { key: 'solic', label: 'Solicitante', get: r => r[RC.solic] },
  { key: 'dest', label: 'Destinatario', get: r => r[RC.dest] },
  { key: 'cliente', label: 'Cliente', get: r => r[RC.razon] },
  { key: 'grupocli', label: 'Grupo cliente', get: r => grupoCli(r) },
  { key: 'ejecutivo', label: 'Ejecutivo', get: r => ejecDe(r) },
  { key: 'material', label: 'Material', get: r => r[RC.material] },
  { key: 'desc', label: 'Descripción', get: r => r[RC.texto] },
  { key: 'sector', label: 'Sector', get: r => sectorDe(r) },
  { key: 'grupoart', label: 'Grupo art.', get: r => grupoArt(r) },
  { key: 'centro', label: 'Centro', get: r => centroDe(r) },
  { key: 'ultMes', label: 'Último mes', get: r => r[RC.ultMes] },
  { key: 'ultFacDest', label: 'Últ. fact. destinatario', get: r => ultFacDestDe(r) },
];
const ESTRANK = { nueva: 6, corriente: 5, reactiva: 4, revisar: 3, riesgo: 2, sinanio: 1, nada: 0 };
const SORTV = {
  solic: r => r[RC.solic], dest: r => r[RC.dest], cliente: r => r[RC.razon], material: r => r[RC.material], desc: r => r[RC.texto],
  grupocli: r => grupoCli(r), ejecutivo: r => ejecDe(r), sector: r => sectorDe(r), grupoart: r => grupoArt(r),
  consumoAct: r => num(r[RC.consumoAct]), promedio: r => num(r[RC.promedio]),
  ultMes: r => mesKey(aMesAnio(r[RC.ultMes])), cantUlt: r => num(r[RC.cantUlt]), impUlt: r => num(r[RC.impUlt]),
  ultFacDest: r => mesKey(aMesAnio(ultFacDestDe(r))), centro: r => norm(centroDe(r)),
  penFecha: r => mesKey(aMesAnio(r[RC.penFecha])), cantPen: r => num(r[RC.cantPen]), impPen: r => num(r[RC.impPen]),
  precioUltUni: r => num(r[RC.precioUltUni]), precioPenUni: r => num(r[RC.precioPenUni]),
  estado: r => ESTRANK[statusOf(r).key] ?? -1, tend: r => ({ up: 2, flat: 1, down: 0 }[tendOf(r).dir] ?? 1),
};
const accessor = (r, k) => SORTV[k] ? SORTV[k](r) : '';

function filtered() {
  const Cc = cols();
  const pr = dateRange(flt.desde, flt.hasta);
  return rows().filter(r => {
    if (flt.estado && statusOf(r).key !== flt.estado) return false;
    if (pr && !inRangeMonth(r[RC.ultMes], pr)) return false;
    return passes(r, Cc, flt);
  });
}

/* serie agregada de la selección filtrada (únicos dest||material) */
function aggSerie(list) {
  const seen = new Set(), bucket = new Map();
  for (const r of list) {
    const k = keyR(r); if (seen.has(k)) continue; seen.add(k);
    for (const p of serieOf(r)) { const c = bucket.get(p.mes) || { cant: 0, imp: 0 }; c.cant += p.cant; c.imp += p.imp; bucket.set(p.mes, c); }
  }
  return [...bucket.entries()].map(([mes, v]) => ({ mes, cant: v.cant, imp: v.imp })).sort((a, b) => mesKey(a.mes) - mesKey(b.mes));
}
/* rankings derivados del filtro actual */
function rankMatFiltered(list) {
  const cur = mesKey(store.CURMES), lo = cur - 11, seen = new Set(), acc = new Map();
  for (const r of list) {
    const k = keyR(r); if (seen.has(k)) continue; seen.add(k);
    const mat = norm(r[RC.material]); let sum = 0;
    for (const p of serieOf(r)) { const mk = mesKey(p.mes); if (mk >= lo && mk <= cur) sum += p.imp; }
    if (sum) acc.set(mat, (acc.get(mat) || 0) + sum);
  }
  return [...acc.entries()].map(([m, s]) => ({ code: m, desc: (store.RF && store.RF.matTexto.get(m) || '').slice(0, 40), val: s / 12 })).sort((a, b) => b.val - a.val).slice(0, 10);
}
function globalComparativa() {
  if (!globalCmp) globalCmp = comparativa(aggSerie(rows()));
  return globalCmp;
}
function rankSolicFiltered(list) {
  const seen = new Set(), acc = new Map(), name = new Map();
  for (const r of list) {
    const s = norm(r[RC.solic]); const k = s + '|' + keyR(r); if (seen.has(k)) continue; seen.add(k);
    let sum = 0; for (const p of serieOf(r)) sum += p.imp;
    if (sum) { acc.set(s, (acc.get(s) || 0) + sum); if (!name.has(s)) name.set(s, norm(r[RC.razon])); }
  }
  return [...acc.entries()].map(([s, v]) => ({ code: s, desc: name.get(s) || '', val: v })).sort((a, b) => b.val - a.val).slice(0, 10);
}
/* Nuevas/reactivaciones por (Solicitante, Grupo de artículo).
   Para cada solicitante se agrega SU historial de todos los materiales del grupo
   (RF.solicMats) y se clasifica con la lógica trimestral. 1 par = 1 evento. */
function gruposSolic(list) {
  if (!store.RF) return { summary: [], detail: new Map(), series: new Map() };
  const pairs = new Set();
  for (const r of list) { const s = norm(r[RC.solic]), g = grupoArt(r) || '(sin grupo)'; if (s) pairs.add(s + '\u0001' + g); }
  const cur = mesKey(store.CURMES), lo = cur - 11;
  const refPrev = mesRefQAnterior();
  const detail = new Map(), gsum = new Map(), gbucket = new Map();
  pairs.forEach(pk => {
    const i = pk.indexOf('\u0001'), s = pk.slice(0, i), g = pk.slice(i + 1);
    const mats = store.RF.solicMats.get(s); if (!mats) return;
    const bucket = new Map();
    mats.forEach((serie, mat) => {
      if ((matGrupo(mat) || '(sin grupo)') !== g) return;
      for (const p of serie) { const c = bucket.get(p.mes) || { cant: 0, imp: 0 }; c.cant += p.cant; c.imp += p.imp; bucket.set(p.mes, c); }
    });
    if (!bucket.size) return;
    const serie = [...bucket.entries()].map(([mes, v]) => ({ mes, cant: v.cant, imp: v.imp })).sort((a, b) => mesKey(a.mes) - mesKey(b.mes));
    const st = clasificarEstado(serie, false);                 // Q corriente
    const stPrev = clasificarEstado(serie, false, refPrev);    // Q anterior
    let imp12 = 0, cant12 = 0; serie.forEach(x => { const mk = mesKey(x.mes); if (mk >= lo && mk <= cur) { imp12 += x.imp; cant12 += x.cant; } });
    const ult = serie[serie.length - 1];
    let o = gsum.get(g); if (!o) { o = { grupo: g, nueva: 0, reactiva: 0, nuevaPrev: 0, reactivaPrev: 0, imp12: 0, solics: 0 }; gsum.set(g, o); }
    if (st.key === 'nueva') o.nueva++; else if (st.key === 'reactiva') o.reactiva++;
    if (stPrev.key === 'nueva') o.nuevaPrev++; else if (stPrev.key === 'reactiva') o.reactivaPrev++;
    o.imp12 += imp12; o.solics++;
    // acumular serie del grupo completo (todos los solicitantes)
    let gb = gbucket.get(g); if (!gb) { gb = new Map(); gbucket.set(g, gb); }
    serie.forEach(p => { const c = gb.get(p.mes) || { cant: 0, imp: 0 }; c.cant += p.cant; c.imp += p.imp; gb.set(p.mes, c); });
    let drows = detail.get(g); if (!drows) { drows = []; detail.set(g, drows); }
    drows.push({ solic: s, razon: store.RF.solicRazon.get(s) || '', st, imp12, cant12, ult });
  });
  detail.forEach(rows => rows.sort((a, b) => b.imp12 - a.imp12));
  const series = new Map();
  gbucket.forEach((gb, g) => { series.set(g, [...gb.entries()].map(([mes, v]) => ({ mes, cant: v.cant, imp: v.imp })).sort((a, b) => mesKey(a.mes) - mesKey(b.mes))); });
  gsum.forEach((o, g) => { o.tnd = tendenciaTexto(series.get(g) || []); });
  return { summary: [...gsum.values()].sort((a, b) => (b.nueva + b.reactiva) - (a.nueva + a.reactiva) || b.imp12 - a.imp12), detail, series };
}
let lastGrupos = { summary: [], detail: new Map() };
export function openGrupoDetalle(grupo) {
  const rows = lastGrupos.detail.get(grupo) || [];
  const serie = (lastGrupos.series && lastGrupos.series.get(grupo)) || [];
  const nueva = rows.filter(x => x.st.key === 'nueva').length, react = rows.filter(x => x.st.key === 'reactiva').length;
  const body = rows.map((x, i) => `<tr class="click" data-gs="${i}">
    <td>${esc(x.razon) || '—'}<div class="sub">Solic ${esc(x.solic)}</div></td>
    <td>${pill(x.st.label, x.st.cls)}</td>
    <td class="num">${fmt(x.cant12)}</td><td class="num">${money(x.imp12)}</td>
    <td>${x.ult ? esc(mLbl(x.ult.mes)) : '—'}</td></tr>`).join('');
  openModal(`
    ${backBtn()}<button class="x" onclick="closeModal()">×</button>
    <h2>Grupo de artículo · ${esc(grupo)}</h2>
    <p class="muted">${rows.length} solicitante(s) · 🆕 ${nueva} nueva compra · 🔁 ${react} reactivación · ${trendText(tendenciaTexto(serie))}</p>
    <div class="card"><h3>📊 Comparativo — mes corriente vs año anterior · Q corriente vs año anterior</h3>${comparativaDualHTML(serie)}</div>
    <div class="card"><h3>📈 Evolución mensual — facturación del grupo</h3><div class="chartbox"><canvas id="cGrp"></canvas></div></div>
    <div class="card"><h3>👥 Solicitantes <span class="hint">clic para ver su facturación</span></h3>
    <input class="mff" data-mf placeholder="🔎 filtrar cliente…">
    <div class="tbl"><table>
      <thead><tr><th>Cliente</th><th>Estado</th><th class="num">Piezas (12m)</th><th class="num">Importe (12m)</th><th>Última compra</th></tr></thead>
      <tbody>${body || '<tr><td colspan="5" class="muted" style="padding:14px;text-align:center">Sin datos.</td></tr>'}</tbody>
    </table></div></div>`);
  drawSerie('cGrp', serie, 'Facturación del grupo');
  document.querySelectorAll('#modal tr[data-gs]').forEach(tr => tr.addEventListener('click', () => navPush(() => openEvol('solic', rows[+tr.dataset.gs].solic))));
}

export function renderConsumo(container) {
  if (!rows().length) {
    container.innerHTML = `<div class="drop"><h2>📊 Reporte de Consumo</h2>
      <p class="muted">No se cargó la pestaña "Reporte de Consumo".</p>
      <p><button class="btn primary" id="up">📂 Cargar reporte</button></p></div>`;
    container.querySelector('#up')?.addEventListener('click', () => import('./data.js').then(m => m.openUploader()));
    return;
  }
  resetCache();
  const estSel = `<select data-est><option value="">Estado (todos)</option>${ESTADOS.map(([k, l]) => `<option value="${k}" ${flt.estado === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const expBtn = `<button class="btn" data-exp>⬇️ Excel</button><button class="btn" data-clearall>🧹 Limpiar todo</button>`;
  container.innerHTML = `${toolbarHTML(cols(), flt, `${estSel}${periodoControlHTML(flt)}${zoomHTML('cons')}${expBtn}`, 'dl-cons')}<div class="result"></div>`;
  wireToolbar(container, flt, () => renderConsumo(container), () => { page = 0; paint(container); }, makeSuggest(filtered(), cols()));
  container.querySelector('[data-est]').onchange = e => { flt.estado = e.target.value; page = 0; paint(container); };
  wirePeriodo(container, flt, store.CURMES, () => renderConsumo(container));
  container.querySelector('[data-exp]').onclick = () => exportConsumo();
  container.querySelector('[data-clearall]').onclick = () => {
    flt.q = ''; flt.list = []; flt.estado = ''; flt.periodo = ''; flt.desde = ''; flt.hasta = '';
    sort = makeSort(); page = 0; renderConsumo(container);
  };
  paint(container);
}

function paint(container) {
  const list = applySort(filtered(), sort, accessor);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  if (page >= pages) page = pages - 1;
  const start = page * size, slice = list.slice(start, start + size);

  const rk1 = rankMatFiltered(list);
  const rk2 = rankSolicFiltered(list);
  lastGrupos = gruposSolic(list);
  const grSum = lastGrupos.summary;
  const grNueva = grSum.reduce((a, x) => a + x.nueva, 0), grReact = grSum.reduce((a, x) => a + x.reactiva, 0);
  const grNuevaPrev = grSum.reduce((a, x) => a + x.nuevaPrev, 0), grReactPrev = grSum.reduce((a, x) => a + x.reactivaPrev, 0);
  const refPrev = mesRefQAnterior();
  const qLbl = (() => { const [cm, cy] = String(hoyMes()).split('/').map(Number); return 'Q' + (Math.floor((cm - 1) / 3) + 1) + ' ' + cy; })();

  const head = [
    th('Cliente (Solic › Razón › Dest)', 'cliente', sort),
    th('Grupo cliente', 'grupocli', sort), th('Ejecutivo', 'ejecutivo', sort), th('Centro', 'centro', sort),
    th('Material', 'material', sort), th('Sector / Grupo art.', 'sector', sort),
    th('Consumo (actual/prom)', 'consumoAct', sort, 'num'),
    th('Última (cant/mes)', 'ultMes', sort), th('Importe última', 'impUlt', sort, 'num'), th('P.U. última', 'precioUltUni', sort, 'num'),
    th('Penúltima (cant/mes)', 'penFecha', sort), th('Importe penúlt.', 'impPen', sort, 'num'), th('P.U. penúlt.', 'precioPenUni', sort, 'num'),
    th('Estado', 'estado', sort), th('Tendencia', 'tend', sort), th('Últ. fact. dest.', 'ultFacDest', sort),
  ].join('');

  const body = slice.map(r => `<tr class="click" data-k="${esc(keyR(r))}">
      <td><div>${esc(r[RC.razon])}</div>
        <div style="font-size:11px;margin-top:2px">
          <span class="lnk" data-ev="solic" data-key="${esc(r[RC.solic])}">Solic ${esc(r[RC.solic])}</span> ·
          <span class="lnk" data-ev="dest" data-key="${esc(r[RC.dest])}">Dest ${esc(r[RC.dest])}</span></div></td>
      <td>${grupoCli(r) ? `<span class="lnk" data-addf="grupocli|${esc(grupoCli(r))}" title="Filtrar por este grupo">${esc(grupoCli(r))}</span>` : '—'}</td><td>${ejecDe(r) ? `<span class="lnk" data-addf="ejecutivo|${esc(ejecDe(r))}" title="Filtrar por este ejecutivo">${esc(ejecDe(r))}</span>` : '—'}</td><td>${centroDe(r) ? `<span class="lnk" data-addf="centro|${esc(centroDe(r))}" title="Filtrar por este centro">${esc(centroDe(r))}</span>` : '—'}</td>
      <td><span class="lnk" data-ev="mat">${esc(r[RC.material])}</span><div class="sub">${esc(r[RC.texto])}</div></td>
      <td>${esc(sectorDe(r)) || '—'}<div class="sub">${esc(grupoArt(r)) || ''}</div></td>
      ${consumoCells(r)}
      <td>${ultFacCell(ultFacDestDe(r))}</td>
    </tr>`).join('');

  container.querySelector('.result').innerHTML = `
    <div class="invtop">
      <div class="kpis2x2" style="flex:0 0 300px;min-width:260px">
        <div class="kpi sm"><div class="lbl">Al corriente</div><div class="val tnd up">${fmt(list.filter(r => statusOf(r).key === 'corriente').length)}</div></div>
        <div class="kpi sm"><div class="lbl">En riesgo</div><div class="val tnd down">${fmt(list.filter(r => statusOf(r).key === 'riesgo').length)}</div></div>
        <div class="kpi sm"><div class="lbl">Reactivación</div><div class="val tnd vio">${fmt(list.filter(r => statusOf(r).key === 'reactiva').length)}</div></div>
        <div class="kpi sm"><div class="lbl">Nueva compra</div><div class="val tnd vio">${fmt(list.filter(r => statusOf(r).key === 'nueva').length)}</div></div>
      </div>
      ${rankingHTML(rk1, { title: '🏆 Materiales · facturación prom. (últ. 12 m)', money: true })}
      ${rankingHTML(rk2, { title: '🏅 Solicitantes · mayor facturación', money: true })}
    </div>
    <div class="tablecard" style="margin-bottom:12px">
      <h3>📊 Comparativo de la selección — mes corriente vs año anterior · Q corriente vs año anterior</h3>
      ${comparativaDualHTML(aggSerie(list))}
    </div>
    <div class="tablecard" style="margin-bottom:12px">
      <h3>🆕 Nuevas compras y reactivaciones por Grupo de artículo <span class="hint">por solicitante · Q corriente = ${esc(qLbl)} · se ajusta a los filtros · clic en un grupo</span></h3>
      <div class="kpis2x2" style="max-width:640px;margin-bottom:8px;grid-template-columns:repeat(4,1fr)">
        <div class="kpi sm"><div class="lbl">🆕 Nuevas compras (Q corriente)</div><div class="val tnd vio">${fmt(grNueva)}</div></div>
        <div class="kpi sm"><div class="lbl">🔁 Reactivaciones (Q corriente)</div><div class="val tnd vio">${fmt(grReact)}</div></div>
        <div class="kpi sm"><div class="lbl">🆕 Nuevas compras (Q anterior)</div><div class="val">${fmt(grNuevaPrev)}</div></div>
        <div class="kpi sm"><div class="lbl">🔁 Reactivación (Q anterior)</div><div class="val">${fmt(grReactPrev)}</div></div>
      </div>
      <div class="tbl"><table><thead><tr><th>Grupo de artículo</th><th class="num">🆕 Nueva</th><th class="num">🔁 Reactiva</th><th class="num">🆕 Q ant.</th><th class="num">🔁 Q ant.</th><th>Tendencia</th><th class="num"># Solic.</th><th class="num">Facturación últ. 12 m</th></tr></thead>
        <tbody>${grSum.filter(x => x.nueva > 0 || x.reactiva > 0 || x.nuevaPrev > 0 || x.reactivaPrev > 0).map(x => `<tr class="click" data-grupo="${esc(x.grupo)}"><td><span class="lnk">${esc(x.grupo)}</span></td><td class="num">${x.nueva ? `<b class="tnd vio">${fmt(x.nueva)}</b>` : '—'}</td><td class="num">${x.reactiva ? `<b class="tnd vio">${fmt(x.reactiva)}</b>` : '—'}</td><td class="num">${x.nuevaPrev ? fmt(x.nuevaPrev) : '—'}</td><td class="num">${x.reactivaPrev ? fmt(x.reactivaPrev) : '—'}</td><td>${trendText(x.tnd)}</td><td class="num">${fmt(x.solics)}</td><td class="num">${money(x.imp12)}</td></tr>`).join('') || '<tr><td colspan="8" class="muted" style="padding:12px;text-align:center">Sin nuevas compras ni reactivaciones en la selección.</td></tr>'}</tbody></table></div>
    </div>
    <div class="tablecard" style="margin-bottom:12px">
      <h3>📈 Evolución mensual — facturación (se ajusta a los filtros)</h3>
      <div class="chartbox" style="height:240px;padding:10px"><canvas id="cEvol"></canvas></div>
    </div>
    <div class="tablecard">
      <h3>📊 Reporte de Consumo <span class="hint">clic encabezado = ordenar (Shift = varias) · Solic/Dest/Material = facturación</span></h3>
      <div class="tbl"><table><thead><tr>${head}</tr></thead>
        <tbody>${body || '<tr><td colspan="16" class="muted" style="padding:20px;text-align:center">Sin resultados</td></tr>'}</tbody></table></div>
      <div class="pager">
        <button class="btn" data-pg="0" ${page === 0 ? 'disabled' : ''}>« Inicio</button>
        <button class="btn" data-pg="${page - 1}" ${page === 0 ? 'disabled' : ''}>‹ Anterior</button>
        <span class="muted">${total ? (start + 1) : 0}–${Math.min(start + size, total)} de ${fmt(total)} · pág. ${page + 1}/${pages}</span>
        <button class="btn" data-pg="${page + 1}" ${page >= pages - 1 ? 'disabled' : ''}>Siguiente ›</button>
        <button class="btn" data-pg="${pages - 1}" ${page >= pages - 1 ? 'disabled' : ''}>Final »</button>
        <select data-size>${[50, 100, 200, 500, 1000].map(n => `<option ${n === size ? 'selected' : ''}>${n}</option>`).join('')}</select>
        <span class="muted">por página</span>
      </div>
    </div>`;

  const prM = (flt.desde || flt.hasta)
    ? [isoMesKey(flt.desde) || (aggSerie(list)[0] && mesKey(aggSerie(list)[0].mes)) || mesKey(store.CURMES), isoMesKey(flt.hasta) || mesKey(store.CURMES)]
    : null;
  drawSerie('cEvol', aggSerie(list), '', prM);
  wireZoom(container, 'cons', '.result .tbl table');
  container.querySelectorAll('.result th.sortable').forEach(thEl => thEl.addEventListener('click', e => {
    sort = cycleSort(sort, thEl.dataset.sort, e.shiftKey); paint(container);
  }));
  container.querySelectorAll('.result [data-pg]').forEach(b => b.addEventListener('click', () => { page = +b.dataset.pg; paint(container); }));
  container.querySelector('[data-size]').onchange = e => { size = +e.target.value; page = 0; paint(container); };
  container.querySelectorAll('.result [data-ev]').forEach(el => el.addEventListener('click', ev => {
    ev.stopPropagation();
    const kind = el.dataset.ev;
    if (kind === 'solic') navOpen(() => openEvol('solic', el.dataset.key));
    else if (kind === 'dest') navOpen(() => openEvol('dest', el.dataset.key));
    else if (kind === 'mat') { const r = rows().find(x => keyR(x) === el.closest('tr').dataset.k); navOpen(() => openMaterial(r)); }
  }));
  wireAddfClicks(container, flt, () => renderConsumo(container));
  container.querySelectorAll('.result [data-grupo]').forEach(tr => tr.addEventListener('click', () => navOpen(() => openGrupoDetalle(tr.dataset.grupo))));
  container.querySelectorAll('.result tr.click').forEach(tr => tr.addEventListener('click', () => {
    if (tr.dataset.grupo) return;
    const r = rows().find(x => keyR(x) === tr.dataset.k); navOpen(() => openMaterial(r));
  }));
}

function exportConsumo() {
  const list = applySort(filtered(), sort, accessor);
  const rowsX = list.map(r => {
    const st = statusOf(r), tn = tendOf(r);
    return {
      'Solicitante': norm(r[RC.solic]), 'Destinatario': norm(r[RC.dest]), 'Razón social': norm(r[RC.razon]),
      'Grupo cliente': grupoCli(r), 'Ejecutivo': ejecDe(r), 'Centro': centroDe(r),
      'Material': norm(r[RC.material]), 'Descripción': norm(r[RC.texto]), 'Sector': sectorDe(r), 'Grupo art.': grupoArt(r),
      'Consumo actual': num(r[RC.consumoAct]), 'Prom. mensual': num(r[RC.promedio]),
      'Último mes': mLbl(r[RC.ultMes]), 'Cant. última': num(r[RC.cantUlt]), 'Importe última': num(r[RC.impUlt]), 'P.U. última': num(r[RC.precioUltUni]),
      'Penúltimo mes': mLbl(r[RC.penFecha]), 'Cant. penúltima': num(r[RC.cantPen]), 'Importe penúltima': num(r[RC.impPen]), 'P.U. penúltima': num(r[RC.precioPenUni]),
      'Estado': st.label, 'Tendencia': tn.txt, 'Últ. fact. destinatario': mLbl(ultFacDestDe(r)),
    };
  });
  exportXlsx(`consumo_${stamp()}.xlsx`, rowsX, 'Consumo');
}

export function openMaterial(r) {
  if (!r) return;
  const serie = serieOf(r), st = statusOf(r);
  openModal(`
    ${backBtn()}<button class="x" onclick="closeModal()">×</button>
    <h2>${esc(r[RC.razon])}</h2>
    <p class="muted">Material ${esc(r[RC.material])} — ${esc(r[RC.texto])} · <span class="lnk" data-go="solic">Solic ${esc(r[RC.solic])}</span> · <span class="lnk" data-go="dest">Dest ${esc(r[RC.dest])}</span></p>
    <div class="mkpis">
      <div class="stat"><div class="l">Ejecutivo</div><div class="v" style="font-size:13px">${esc(ejecDe(r)) || '—'}</div></div>
      <div class="stat"><div class="l">Grupo cliente</div><div class="v" style="font-size:13px">${esc(grupoCli(r)) || '—'}</div></div>
      <div class="stat"><div class="l">Consumo actual</div><div class="v">${fmt(r[RC.consumoAct])}</div></div>
      <div class="stat"><div class="l">Prom. mensual</div><div class="v">${fmt(r[RC.promedio])}</div></div>
      <div class="stat"><div class="l">Importe última</div><div class="v" style="font-size:14px">${money(r[RC.impUlt])}</div></div>
      <div class="stat"><div class="l">Estado</div><div class="v" style="font-size:14px">${pill(st.label, st.cls)}</div></div>
      <div class="stat"><div class="l">Tendencia</div><div class="v" style="font-size:14px">${trendText(tendOf(r))}</div></div>
    </div>
    <div class="card"><h3>📊 Comparativo: mes actual vs año anterior · Q actual vs año anterior</h3>${comparativaDualHTML(serie)}</div>
    <div class="card"><h3>📈 Evolución mensual — material + destinatario <span class="hint">clic en un mes = clientes de ese material</span></h3><div class="chartbox"><canvas id="cC"></canvas></div></div>`);
  drawSerie('cC', serie, '', undefined, mes => navPush(() => openClientesMes(r[RC.material], mes)));
  document.querySelector('#modal [data-go="solic"]')?.addEventListener('click', () => navPush(() => openEvol('solic', r[RC.solic])));
  document.querySelector('#modal [data-go="dest"]')?.addEventListener('click', () => navPush(() => openEvol('dest', r[RC.dest])));
}
