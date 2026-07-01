/* ===========================================================================
   resumenSin.js · pestaña "Resumen Sin Sugerencias"
   Pivote: Material (fila) × Centro (columna). Cada celda = inventario general
   del centro (almacenes 1030+1031+1060) + pendiente / en curso como subíndice.
   Clic en la celda → detalle por almacén (inventario, pendiente, tránsito, consumo).
   =========================================================================== */
import { norm, num, fmt, money, esc } from './utils.js';
import { store } from './store.js';
import { openModal, backBtn, pill } from './ui.js';
import { makeFilters, toolbarHTML, wireToolbar, passes, makeSuggest } from './filters.js';
import { makeSort, cycleSort, applySort, th } from './sort.js';
import { zoomHTML, wireZoom } from './zoom.js';
import { exportXlsx, stamp } from './exportx.js';

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
const flt = makeFilters();
const sort = makeSort();

export function buildRSS(rows) {
  const mats = new Map(); const centros = new Set();
  for (const r of rows) {
    const m = norm(r[RSS.material]); if (!m) continue;
    const c = norm(r[RSS.centro]); const a = norm(r[RSS.alm]);
    centros.add(c);
    let mo = mats.get(m);
    if (!mo) { mo = { material: m, desc: norm(r[RSS.desc]), centros: new Map(),
      disp1030: num(r[RSS.disp1030]), disp1032: num(r[RSS.disp1032]), sumaInv: num(r[RSS.sumaInv]), sumaPend: num(r[RSS.sumaPend]) };
      mats.set(m, mo); }
    let co = mo.centros.get(c);
    if (!co) {
      co = { centro: c, invAlm: { '1030': num(r[RSS.inv1030]), '1031': num(r[RSS.inv1031]), '1032': num(r[RSS.inv1032]), '1060': num(r[RSS.inv1060]) },
        pend: 0, transito: 0, impPend: 0, pedidos: 0, alm: new Map() };
      mo.centros.set(c, co);
    }
    co.pend += num(r[RSS.pend]); co.transito += num(r[RSS.transito]); co.impPend += num(r[RSS.impPend]); co.pedidos += num(r[RSS.pedidos]);
    const invA = ALM_INV[a] ? co.invAlm[a] : 0;
    co.alm.set(a || '—', { alm: a || '—', inv: invA, pend: num(r[RSS.pend]), transito: num(r[RSS.transito]), impPend: num(r[RSS.impPend]),
      prom: num(r[RSS.prom]), ultMes: norm(r[RSS.ultMes]), cantUlt: num(r[RSS.cantUlt]), penMes: norm(r[RSS.penMes]), cantPen: num(r[RSS.cantPen]),
      meses: num(r[RSS.meses]), status: norm(r[RSS.status]), fuente: norm(r[RSS.fuente]) });
  }
  MATS = mats;
  CENTROS = [...centros].filter(Boolean).sort();
  return mats;
}

const invGen = co => co ? (co.invAlm['1030'] + co.invAlm['1031'] + co.invAlm['1060']) : 0;

/* filas aplanadas para filtros (una por material) */
function rowsForFilter() {
  return [...MATS.values()].map(mo => ({
    material: mo.material, desc: mo.desc,
    centros: [...mo.centros.keys()].join(' '),
    status: [...new Set([...mo.centros.values()].flatMap(co => [...co.alm.values()].map(a => a.status)).filter(Boolean))].join(' '),
    fuente: [...new Set([...mo.centros.values()].flatMap(co => [...co.alm.values()].map(a => a.fuente)).filter(Boolean))].join(' '),
    _mo: mo,
  }));
}
const cols = () => [
  { key: 'material', label: 'Material', get: r => r.material },
  { key: 'desc', label: 'Descripción', get: r => r.desc },
  { key: 'centro', label: 'Centro', get: r => r.centros },
  { key: 'status', label: 'Status Revisión', get: r => r.status },
  { key: 'fuente', label: 'Fuente', get: r => r.fuente },
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

  const head = `${th('Material', 'material', sort)}${th('Descripción', 'desc', sort)}
    ${CENTROS.map(c => `<th class="num">Centro ${esc(c)}</th>`).join('')}
    ${th('Inv. total', 'inv', sort, 'num')}${th('Pend. total', 'pend', sort, 'num')}`;

  const body = list.slice(0, 800).map(r => {
    const mo = r._mo;
    const cells = CENTROS.map(c => {
      const co = mo.centros.get(c);
      if (!co) return `<td class="num muted">—</td>`;
      const ig = invGen(co);
      const sub = (co.pend || co.transito)
        ? `<div class="sub">${co.pend ? `<span class="tnd down">P ${fmt(co.pend)}</span>` : ''}${co.transito ? ` <span class="tnd amb">C ${fmt(co.transito)}</span>` : ''}</div>`
        : '';
      return `<td class="num"><span class="lnk" data-cel="${esc(r.material)}|${esc(c)}">${fmt(ig)}</span>${sub}</td>`;
    }).join('');
    const invTot = [...mo.centros.values()].reduce((s, co) => s + invGen(co), 0);
    const pendTot = [...mo.centros.values()].reduce((s, co) => s + co.pend, 0);
    return `<tr>
      <td><span class="lnk" data-mat="${esc(r.material)}">${esc(r.material)}</span></td>
      <td class="muted" style="font-size:11px">${esc(r.desc)}</td>
      ${cells}
      <td class="num"><b>${fmt(invTot)}</b></td><td class="num">${pendTot ? `<b class="tnd down">${fmt(pendTot)}</b>` : '—'}</td></tr>`;
  }).join('');
  const colspan = 2 + CENTROS.length + 2;

  container.querySelector('.result').innerHTML = `
    <div class="invtop">
      <div class="kpis2x2" style="max-width:520px">
        <div class="kpi sm"><div class="lbl">Materiales (filtro)</div><div class="val">${fmt(list.length)}</div></div>
        <div class="kpi sm"><div class="lbl">Inv. total (filtro)</div><div class="val" style="font-size:18px">${fmt(totInv)}</div></div>
        <div class="kpi sm"><div class="lbl">Pendiente total</div><div class="val tnd down" style="font-size:18px">${fmt(totPend)}</div></div>
        <div class="kpi sm"><div class="lbl">En tránsito total</div><div class="val tnd amb" style="font-size:18px">${fmt(totTransito)}</div></div>
      </div>
      <p class="muted" style="align-self:center;max-width:360px">Cada celda muestra el inventario general del centro (almacenes 1030+1031+1060). Subíndice: <span class="tnd down">P</span> pendiente · <span class="tnd amb">C</span> en curso. Clic para ver el detalle por almacén.</p>
    </div>
    <div class="tablecard">
      <h3>🏭 Resumen por centro/almacén (sin sugerencias) <span class="hint">material en filas · centros en columnas</span></h3>
      <div class="tbl"><table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body || `<tr><td colspan="${colspan}" class="muted" style="padding:20px;text-align:center">Sin resultados</td></tr>`}</tbody>
      </table>${list.length > 800 ? `<p class="muted" style="padding:8px">Mostrando 800 de ${list.length}.</p>` : ''}</div>
    </div>`;

  wireZoom(container, 'rss', '.result .tbl table');
  container.querySelectorAll('.result [data-cel]').forEach(el => el.addEventListener('click', () => { const [m, c] = el.dataset.cel.split('|'); openCeldaDetalle(m, c); }));
  container.querySelectorAll('.result [data-mat]').forEach(el => el.addEventListener('click', () => openMaterialRSS(el.dataset.mat)));
}

/* detalle de una celda (material × centro) desglosado por almacén */
export function openCeldaDetalle(material, centro) {
  const mo = MATS.get(norm(material)); if (!mo) return;
  const co = mo.centros.get(norm(centro)); if (!co) return;
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
    <p class="muted" style="font-size:12px">Dispersión (planta 1031): almacén 1030 = <b>${fmt(mo.disp1030)}</b> · almacén 1032 = <b>${fmt(mo.disp1032)}</b>. Suturas salen del centro 1018.</p>`);
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
