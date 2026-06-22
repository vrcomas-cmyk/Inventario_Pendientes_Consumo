/* ===========================================================================
   consumo.js · "Reporte de Consumo" — v4
   Paginación (dataset completo), orden multi-columna, sugerencias, filtros
   vacíos, gráfica dinámica de facturación y rankings.
   =========================================================================== */
import { norm, num, fmt, money, esc, mesKey } from './utils.js';
import { store, RC } from './store.js';
import { serieMatDest, serieDeConsumo, clasificarEstado, tendenciaTexto, comparativa, aMesAnio,
         rankingMaterialesAvg12, rankingSolicitantes, ESTADOS } from './resumenFac.js';
import { openModal, drawSerie, pill, trendText, comparativaHTML, rankingHTML } from './ui.js';
import { openEvol } from './sugerencias.js';
import { toolbarHTML, wireToolbar, makeFilters, passes, makeSuggest } from './filters.js';
import { zoomHTML, wireZoom } from './zoom.js';
import { makeSort, cycleSort, applySort, th } from './sort.js';

const flt = makeFilters();
flt.estado = '';
let sort = makeSort();
let page = 0, size = 100;
const rows = () => store.ROLE.cons ? store.WB[store.ROLE.cons] : [];

/* ---- memo por clave dest||material ---- */
let mSerie = new Map(), mStatus = new Map(), mTend = new Map();
function resetCache() { mSerie = new Map(); mStatus = new Map(); mTend = new Map(); }
const keyR = r => norm(r[RC.dest]) + '||' + norm(r[RC.material]);
function serieOf(r) { const k = keyR(r); if (!mSerie.has(k)) mSerie.set(k, serieMatDest(r[RC.dest], r[RC.material]) || serieDeConsumo(r, RC)); return mSerie.get(k); }
function statusOf(r) { const k = keyR(r); if (!mStatus.has(k)) { const s = serieOf(r); mStatus.set(k, clasificarEstado(s.length ? s : null, false)); } return mStatus.get(k); }
function tendOf(r) { const k = keyR(r); if (!mTend.has(k)) mTend.set(k, tendenciaTexto(serieOf(r))); return mTend.get(k); }

const cols = () => [
  { key: 'solic', label: 'Solicitante', get: r => r[RC.solic] },
  { key: 'dest', label: 'Destinatario', get: r => r[RC.dest] },
  { key: 'cliente', label: 'Cliente', get: r => r[RC.razon] },
  { key: 'material', label: 'Material', get: r => r[RC.material] },
  { key: 'desc', label: 'Descripción', get: r => r[RC.texto] },
  { key: 'centro', label: 'Centro', get: r => r[RC.centro] },
  { key: 'ultMes', label: 'Último mes', get: r => r[RC.ultMes] },
];
const ESTRANK = { nueva: 6, corriente: 5, reactiva: 4, revisar: 3, riesgo: 2, sinanio: 1, nada: 0 };
const SORTV = {
  solic: r => r[RC.solic], dest: r => r[RC.dest], cliente: r => r[RC.razon], material: r => r[RC.material], desc: r => r[RC.texto],
  consumoAct: r => num(r[RC.consumoAct]), promedio: r => num(r[RC.promedio]),
  ultMes: r => mesKey(aMesAnio(r[RC.ultMes])), cantUlt: r => num(r[RC.cantUlt]),
  penFecha: r => mesKey(aMesAnio(r[RC.penFecha])), cantPen: r => num(r[RC.cantPen]),
  precioMin: r => num(r[RC.precioMin]), precioMax: r => num(r[RC.precioMax]), precioProm: r => num(r[RC.precioProm]),
  estado: r => ESTRANK[statusOf(r).key] ?? -1, tend: r => ({ up: 2, flat: 1, down: 0 }[tendOf(r).dir] ?? 1),
};
const accessor = (r, k) => SORTV[k] ? SORTV[k](r) : '';

function filtered() {
  const Cc = cols();
  return rows().filter(r => {
    if (flt.estado && statusOf(r).key !== flt.estado) return false;
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
  container.innerHTML = `${toolbarHTML(cols(), flt, `${estSel}${zoomHTML('cons')}`)}<div class="result"></div>`;
  wireToolbar(container, flt, () => renderConsumo(container), () => { page = 0; paint(container); }, makeSuggest(rows(), cols()));
  container.querySelector('[data-est]').onchange = e => { flt.estado = e.target.value; page = 0; paint(container); };
  paint(container);
}

function paint(container) {
  const list = applySort(filtered(), sort, accessor);
  const total = list.length;
  const pages = Math.max(1, Math.ceil(total / size));
  if (page >= pages) page = pages - 1;
  const start = page * size, slice = list.slice(start, start + size);

  const rk1 = rankingMaterialesAvg12();
  const rk2 = rankingSolicitantes();

  const H = k => SORTV[k] ? th : null;     // helper
  const head = [
    th('Solicitante', 'solic', sort), th('Destinatario', 'dest', sort), th('Cliente', 'cliente', sort),
    th('Material', 'material', sort), th('Descripción', 'desc', sort),
    th('Consumo actual', 'consumoAct', sort, 'num'), th('Prom. mensual', 'promedio', sort, 'num'),
    th('Último mes', 'ultMes', sort), th('Cant. última', 'cantUlt', sort, 'num'),
    th('Penúltima fecha', 'penFecha', sort), th('Cant. penúlt.', 'cantPen', sort, 'num'),
    th('Precio mín', 'precioMin', sort, 'num'), th('Precio máx', 'precioMax', sort, 'num'), th('Precio prom', 'precioProm', sort, 'num'),
    th('Estado', 'estado', sort), th('Tendencia', 'tend', sort),
  ].join('');

  const body = slice.map(r => {
    const st = statusOf(r), tn = tendOf(r);
    return `<tr data-k="${esc(keyR(r))}">
      <td><span class="lnk" data-ev="solic" data-key="${esc(r[RC.solic])}">${esc(r[RC.solic])}</span></td>
      <td><span class="lnk" data-ev="dest" data-key="${esc(r[RC.dest])}">${esc(r[RC.dest])}</span></td>
      <td>${esc(r[RC.razon])}</td>
      <td><span class="lnk" data-ev="mat">${esc(r[RC.material])}</span></td>
      <td>${esc(r[RC.texto])}</td>
      <td class="num">${fmt(r[RC.consumoAct])}</td><td class="num">${fmt(r[RC.promedio])}</td>
      <td>${esc(r[RC.ultMes])}</td><td class="num">${fmt(r[RC.cantUlt])}</td>
      <td>${esc(r[RC.penFecha])}</td><td class="num">${fmt(r[RC.cantPen])}</td>
      <td class="num">${money(r[RC.precioMin])}</td><td class="num">${money(r[RC.precioMax])}</td><td class="num">${money(r[RC.precioProm])}</td>
      <td>${pill(st.label, st.cls)}</td><td>${trendText(tn)}</td>
    </tr>`;
  }).join('');

  container.querySelector('.result').innerHTML = `
    <div class="invtop">
      <div class="kpis2x2" style="flex:0 0 300px;min-width:260px">
        <div class="kpi sm"><div class="lbl">Renglones (filtro)</div><div class="val">${fmt(total)}</div><div class="sub">de ${fmt(rows().length)}</div></div>
        <div class="kpi sm"><div class="lbl">Al corriente</div><div class="val tnd up">${fmt(list.filter(r => statusOf(r).key === 'corriente').length)}</div></div>
        <div class="kpi sm"><div class="lbl">En riesgo</div><div class="val tnd down">${fmt(list.filter(r => statusOf(r).key === 'riesgo').length)}</div></div>
        <div class="kpi sm"><div class="lbl">Sin compra +1 año</div><div class="val tnd flat">${fmt(list.filter(r => statusOf(r).key === 'sinanio').length)}</div></div>
      </div>
      ${rankingHTML(rk1, { title: '🏆 Materiales · facturación prom. (últ. 12 m)', money: true })}
      ${rankingHTML(rk2, { title: '🏅 Solicitantes · mayor facturación', money: true })}
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

  drawSerie('cEvol', aggSerie(list), '');
  wireZoom(container, 'cons', '.result .tbl table');
  container.querySelectorAll('.result th.sortable').forEach(thEl => thEl.addEventListener('click', e => {
    sort = cycleSort(sort, thEl.dataset.sort, e.shiftKey); paint(container);
  }));
  container.querySelectorAll('.result [data-pg]').forEach(b => b.addEventListener('click', () => { page = +b.dataset.pg; paint(container); }));
  container.querySelector('[data-size]').onchange = e => { size = +e.target.value; page = 0; paint(container); };
  container.querySelectorAll('.result [data-ev]').forEach(el => el.addEventListener('click', () => {
    const kind = el.dataset.ev;
    if (kind === 'solic') openEvol('solic', el.dataset.key);
    else if (kind === 'dest') openEvol('dest', el.dataset.key);
    else if (kind === 'mat') { const r = rows().find(x => keyR(x) === el.closest('tr').dataset.k); openMaterial(r); }
  }));
}

function openMaterial(r) {
  if (!r) return;
  const serie = serieOf(r), st = statusOf(r);
  openModal(`
    <button class="x" onclick="closeModal()">×</button>
    <h2>${esc(r[RC.razon])}</h2>
    <p class="muted">Material ${esc(r[RC.material])} — ${esc(r[RC.texto])} · Dest ${esc(r[RC.dest])}</p>
    <div class="mkpis">
      <div class="stat"><div class="l">Consumo actual</div><div class="v">${fmt(r[RC.consumoAct])}</div></div>
      <div class="stat"><div class="l">Prom. mensual</div><div class="v">${fmt(r[RC.promedio])}</div></div>
      <div class="stat"><div class="l">Estado</div><div class="v" style="font-size:14px">${pill(st.label, st.cls)}</div></div>
      <div class="stat"><div class="l">Tendencia</div><div class="v" style="font-size:14px">${trendText(tendOf(r))}</div></div>
    </div>
    <div class="card"><h3>📊 Comparativo: mes actual vs año anterior · Q actual vs año anterior</h3>${comparativaHTML(comparativa(serie))}</div>
    <div class="card"><h3>📈 Evolución mensual — material + destinatario</h3><div class="chartbox"><canvas id="cC"></canvas></div></div>`);
  drawSerie('cC', serie, '');
}
