/* ===========================================================================
   consumo.js · "Reporte de Consumo" — v3
   =========================================================================== */
import { norm, num, fmt, money, esc } from './utils.js';
import { store, RC } from './store.js';
import { serieMatDest, serieDeConsumo, clasificarEstado, tendenciaTexto, comparativa, ESTADOS } from './resumenFac.js';
import { openModal, drawSerie, pill, trendText, comparativaHTML } from './ui.js';
import { openEvol } from './sugerencias.js';
import { toolbarHTML, wireToolbar, makeFilters, passes } from './filters.js';
import { zoomHTML, wireZoom } from './zoom.js';

const flt = makeFilters();
flt.estado = '';
const rows = () => store.ROLE.cons ? store.WB[store.ROLE.cons] : [];

const serieOf = r => serieMatDest(r[RC.dest], r[RC.material]) || serieDeConsumo(r, RC);
const statusOf = r => clasificarEstado(serieOf(r).length ? serieOf(r) : null, false);
const tendOf = r => tendenciaTexto(serieOf(r));

const cols = () => [
  { key: 'solic', label: 'Solicitante', get: r => r[RC.solic] },
  { key: 'dest', label: 'Destinatario', get: r => r[RC.dest] },
  { key: 'cliente', label: 'Cliente', get: r => r[RC.razon] },
  { key: 'mat', label: 'Material', get: r => r[RC.material] },
  { key: 'desc', label: 'Descripción', get: r => r[RC.texto] },
  { key: 'centro', label: 'Centro', get: r => r[RC.centro] },
];
function filtered() {
  const Cc = cols();
  return rows().filter(r => {
    if (flt.estado && statusOf(r).key !== flt.estado) return false;
    return passes(r, Cc, flt);
  });
}

export function renderConsumo(container) {
  if (!rows().length) {
    container.innerHTML = `<div class="drop"><h2>📊 Reporte de Consumo</h2>
      <p class="muted">No se cargó la pestaña "Reporte de Consumo".</p>
      <p><button class="btn primary" id="up">📂 Cargar reporte</button></p></div>`;
    container.querySelector('#up')?.addEventListener('click', () => import('./data.js').then(m => m.openUploader()));
    return;
  }
  const estSel = `<select data-est><option value="">Estado (todos)</option>${ESTADOS.map(([k, l]) => `<option value="${k}" ${flt.estado === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  container.innerHTML = `${toolbarHTML(cols(), flt, `${estSel}${zoomHTML('cons')}`)}<div class="result"></div>`;
  wireToolbar(container, flt, () => renderConsumo(container), () => paint(container));
  container.querySelector('[data-est]').onchange = e => { flt.estado = e.target.value; paint(container); };
  paint(container);
}

function paint(container) {
  const list = filtered();
  const body = list.slice(0, 800).map((r, i) => {
    const st = statusOf(r), tn = tendOf(r);
    return `<tr data-i="${i}">
      <td><span class="lnk" data-ev="solic" data-k="${esc(r[RC.solic])}">${esc(r[RC.solic])}</span></td>
      <td><span class="lnk" data-ev="dest" data-k="${esc(r[RC.dest])}">${esc(r[RC.dest])}</span></td>
      <td>${esc(r[RC.razon])}</td>
      <td><span class="lnk" data-ev="mat" data-i="${i}">${esc(r[RC.material])}</span></td>
      <td>${esc(r[RC.texto])}</td>
      <td class="num">${fmt(r[RC.consumoAct])}</td>
      <td class="num">${fmt(r[RC.promedio])}</td>
      <td>${esc(r[RC.ultMes])}</td>
      <td class="num">${fmt(r[RC.cantUlt])}</td>
      <td>${esc(r[RC.penFecha])}</td>
      <td class="num">${fmt(r[RC.cantPen])}</td>
      <td class="num">${money(r[RC.precioMin])}</td>
      <td class="num">${money(r[RC.precioMax])}</td>
      <td class="num">${money(r[RC.precioProm])}</td>
      <td>${pill(st.label, st.cls)}</td>
      <td>${trendText(tn)}</td>
    </tr>`;
  }).join('');

  container.querySelector('.result').innerHTML = `
    <div class="kpis2x2" style="max-width:520px">
      <div class="kpi sm"><div class="lbl">Renglones</div><div class="val">${fmt(list.length)}</div></div>
      <div class="kpi sm"><div class="lbl">Al corriente</div><div class="val tnd up">${list.filter(r => statusOf(r).key === 'corriente').length}</div></div>
      <div class="kpi sm"><div class="lbl">En riesgo</div><div class="val tnd down">${list.filter(r => statusOf(r).key === 'riesgo').length}</div></div>
      <div class="kpi sm"><div class="lbl">Sin compra +1 año</div><div class="val tnd flat">${list.filter(r => statusOf(r).key === 'sinanio').length}</div></div>
    </div>
    <div class="tablecard">
      <h3>📊 Reporte de Consumo <span class="hint">Solic/Dest = facturación general + sus códigos · Material = material+destinatario</span></h3>
      <div class="tbl"><table>
        <thead><tr><th>Solicitante</th><th>Destinatario</th><th>Cliente</th><th>Material</th><th>Descripción</th>
          <th class="num">Consumo actual</th><th class="num">Prom. mensual</th><th>Último mes</th><th class="num">Cant. última</th>
          <th>Penúltima fecha</th><th class="num">Cant. penúlt.</th>
          <th class="num">Precio mín</th><th class="num">Precio máx</th><th class="num">Precio prom</th>
          <th>Estado</th><th>Tendencia</th></tr></thead>
        <tbody>${body || '<tr><td colspan="16" class="muted" style="padding:20px;text-align:center">Sin resultados</td></tr>'}</tbody>
      </table>${list.length > 800 ? `<p class="muted" style="padding:8px">Mostrando 800 de ${list.length}.</p>` : ''}</div>
    </div>`;

  wireZoom(container, 'cons', '.result .tbl table');
  container.querySelectorAll('.result [data-ev]').forEach(el => el.addEventListener('click', () => {
    const kind = el.dataset.ev;
    if (kind === 'solic') openEvol('solic', el.dataset.k);
    else if (kind === 'dest') openEvol('dest', el.dataset.k);
    else if (kind === 'mat') openMaterial(filtered()[+el.dataset.i]);
  }));
}

/* clic Material -> material+destinatario: comparativo anual + evolución (sin "detalle por mes") */
function openMaterial(r) {
  if (!r) return;
  const serie = serieMatDest(r[RC.dest], r[RC.material]) || serieDeConsumo(r, RC);
  const st = statusOf(r);
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
