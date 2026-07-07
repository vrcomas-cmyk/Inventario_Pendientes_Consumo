/* ===========================================================================
   sugerencias.js · "Todas las Sugerencias" (BO) — v4
   =========================================================================== */
import { norm, num, fmt, money, esc, vigencia, moneyD } from './utils.js';
import { store, C } from './store.js';
import { serieMatDest, serieSolic, serieDest, consumoDe, clasificarEstado,
         tendenciaTexto, materialesDe, mesLabel, aMesAnio } from './resumenFac.js';
import { ESTADOS } from './resumenFac.js';
import { openModal, drawSerie, pill, trendText, invGrid, rankingHTML,
         backBtn, navOpen, navPush, openClientesMes, comparativaDualHTML } from './ui.js';
import { toolbarHTML, wireToolbar, makeFilters, passes, makeSuggest, periodoControlHTML, wirePeriodo, dateRange, inRangeDay, wireAddfClicks } from './filters.js';
import { zoomHTML, wireZoom } from './zoom.js';
import { makeSort, cycleSort, applySort, th } from './sort.js';
import { exportXlsx, stamp } from './exportx.js';

const mKey = v => { const m = aMesAnio(v); if (!m) return 0; const [mm, yy] = m.split('/').map(Number); return yy * 12 + mm; };
import { grupoCliente, ejecutivoNombre, matSector, matGrupo, loadEnrich, enrichTs, normCode } from './enrich.js';
import { precioInv } from './inventario.js';

/* ---- getters enriquecidos ---- */
const grupoCli = b => grupoCliente(b[C.gpo]) || norm(b[C.gpo]);
const ejecDe   = b => ejecutivoNombre(b[C.gpoV]);
const sectorDe = b => matSector(b[C.matBase]);
const grupoArt = b => matGrupo(b[C.matBase]);
const bloqDe   = b => norm(b[C.bloq]);

const hasFuente = r => norm(r[C.fuente]) !== '';
const invCell = (inv, tr) => { const t = num(tr); return `<td class="num">${fmt(inv)}${t > 0 ? `<div class="tr">↻ ${fmt(t)}</div>` : ''}</td>`; };
const keyOf = r => [norm(r[C.pedido]), norm(r[C.matBase]), norm(r[C.centro]), norm(r[C.alm]), norm(r[C.dest])].join('|');

export function buildBO(rows) {
  const map = new Map();
  rows.forEach(r => {
    const k = keyOf(r);
    if (!map.has(k)) map.set(k, { origen: null, fuentes: [], any: r });
    const g = map.get(k);
    if (hasFuente(r)) g.fuentes.push(r); else if (!g.origen) g.origen = r;
  });
  return [...map.values()].map(g => {
    const b = g.origen || g.any;
    const serie = serieMatDest(b[C.dest], b[C.matBase]);
    // Consumo promedio robusto: toma el del origen; si viene vacío/0, busca en el grupo
    let cp = num(b[C.consumo]);
    if (!cp) { for (const rr of [g.origen, g.any, ...g.fuentes].filter(Boolean)) { const v = num(rr[C.consumo]); if (v) { cp = v; break; } } }
    return { bo: b, fuentes: g.fuentes, k: keyOf(b), serie, consumoProm: cp,
      status: clasificarEstado(serie, num(b[C.pend]) > 0), tend: tendenciaTexto(serie), cons: consumoDe(serie) };
  });
}

const flt = makeFilters();
flt.estado = ''; flt.fuente = ''; flt.periodo = ''; flt.desde = ''; flt.hasta = '';
let sort = makeSort();
const ESTRANK = { nueva: 7, corriente: 6, reactiva: 5, revisar: 4, riesgo: 3, sinanio: 2, nada: 1 };
const SORTV = {
  grupocli: it => grupoCli(it.bo), pedido: it => it.bo[C.pedido], oc: it => it.bo[C.oc], fecha: it => it.bo[C.fecha],
  cliente: it => it.bo[C.razon], ejecutivo: it => ejecDe(it.bo), centro: it => it.bo[C.centro],
  mat: it => it.bo[C.matBase], desc: it => it.bo[C.descSol], sector: it => sectorDe(it.bo), grupoart: it => grupoArt(it.bo),
  cantped: it => num(it.bo[C.cantPed]), pend: it => num(it.bo[C.pend]), precio: it => num(it.bo[C.precio]), consumo: it => num(it.consumoProm),
  inv1030: it => num(it.bo[C.inv1030]), inv1031: it => num(it.bo[C.inv1031]), inv1032: it => num(it.bo[C.inv1032]), inv1060: it => num(it.bo[C.inv1060]),
  bloq: it => bloqDe(it.bo), estado: it => ESTRANK[it.status.key] ?? 0, tend: it => ({ up: 2, flat: 1, down: 0 }[it.tend.dir] ?? 1),
  fuentes: it => it.fuentes.length,
};
const accessor = (it, k) => SORTV[k] ? SORTV[k](it) : '';
const cols = () => [
  { key: 'grupocli', label: 'Grupo cliente', get: it => grupoCli(it.bo) },
  { key: 'pedido', label: 'Pedido', get: it => it.bo[C.pedido] },
  { key: 'oc', label: 'OC', get: it => it.bo[C.oc] },
  { key: 'cliente', label: 'Cliente', get: it => it.bo[C.razon] },
  { key: 'ejecutivo', label: 'Ejecutivo', get: it => ejecDe(it.bo) },
  { key: 'solic', label: 'Solicitante', get: it => it.bo[C.solic] },
  { key: 'dest', label: 'Destinatario', get: it => it.bo[C.dest] },
  { key: 'mat', label: 'Material', get: it => it.bo[C.matBase] },
  { key: 'desc', label: 'Descripción', get: it => it.bo[C.descSol] },
  { key: 'sector', label: 'Sector', get: it => sectorDe(it.bo) },
  { key: 'grupoart', label: 'Grupo art.', get: it => grupoArt(it.bo) },
  { key: 'centro', label: 'Centro', get: it => it.bo[C.centro] },
  { key: 'almacen', label: 'Almacén', get: it => it.bo[C.alm] },
  { key: 'bloq', label: 'Bloqueado', get: it => bloqDe(it.bo) },
];
function filtered() {
  const Cc = cols();
  const pr = dateRange(flt.desde, flt.hasta);
  return store.BO.filter(it => {
    if (flt.estado && it.status.key !== flt.estado) return false;
    if (flt.fuente === 'si' && !it.fuentes.length) return false;
    if (flt.fuente === 'no' && it.fuentes.length) return false;
    if (pr && !inRangeDay(it.bo[C.fecha], pr)) return false;
    return passes(it, Cc, flt);
  });
}

export function renderSug(container) {
  if (!store.BO.length) {
    container.innerHTML = `<div class="drop"><h2>📋 Sugerencias</h2><p class="muted">Sube tu reporte para ver las sugerencias.</p>
      <p><button class="btn primary" id="up">📂 Cargar reporte</button></p></div>`;
    container.querySelector('#up')?.addEventListener('click', () => import('./data.js').then(m => m.openUploader()));
    return;
  }
  const estSel = `<select data-est><option value="">Estado (todos)</option>${ESTADOS.map(([k, l]) => `<option value="${k}" ${flt.estado === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
  const fueSel = `<select data-fue><option value="">Fuentes</option><option value="si" ${flt.fuente === 'si' ? 'selected' : ''}>Con fuentes</option><option value="no" ${flt.fuente === 'no' ? 'selected' : ''}>Sin fuentes</option></select>`;
  const ts = enrichTs();
  const updBtn = `<button class="btn" data-upd title="${ts ? 'Última actualización: ' + new Date(ts).toLocaleString('es-MX') : 'Sin descargar aún'}">🔄 Actualizar Ejecutivos/Materiales</button>`;
  const expBtn = `<button class="btn" data-exp>⬇️ Excel</button><button class="btn" data-clearall>🧹 Limpiar todo</button>`;
  container.innerHTML = `${toolbarHTML(cols(), flt, `${estSel}${fueSel}${periodoControlHTML(flt)}${zoomHTML('sug')}${expBtn}${updBtn}`, 'dl-sug')}<div class="result"></div>`;
  wireToolbar(container, flt, () => renderSug(container), () => paint(container), makeSuggest(filtered(), cols()));
  container.querySelector('[data-est]').onchange = e => { flt.estado = e.target.value; paint(container); };
  container.querySelector('[data-fue]').onchange = e => { flt.fuente = e.target.value; paint(container); };
  wirePeriodo(container, flt, store.CURMES, () => renderSug(container));
  container.querySelector('[data-exp]').onclick = () => exportSug();
  container.querySelector('[data-clearall]').onclick = () => {
    flt.q = ''; flt.list = []; flt.estado = ''; flt.fuente = ''; flt.periodo = ''; flt.desde = ''; flt.hasta = '';
    sort = makeSort(); renderSug(container);
  };
  container.querySelector('[data-upd]').onclick = ev => { ev.target.textContent = '⏳ Actualizando…'; loadEnrich(true).then(() => renderSug(container)); };
  paint(container);
}

let lastList = [];
function paint(container) {
  const list = applySort(filtered(), sort, accessor);
  lastList = list;
  const isBloq = it => bloqDe(it.bo) !== '';
  const pendTot = list.reduce((s, it) => s + num(it.bo[C.pend]), 0);
  const pendBloq = list.filter(isBloq).reduce((s, it) => s + num(it.bo[C.pend]), 0);
  const impTot = list.reduce((s, it) => s + num(it.bo[C.pend]) * num(it.bo[C.precio]), 0);
  const impBloq = list.filter(isBloq).reduce((s, it) => s + num(it.bo[C.pend]) * num(it.bo[C.precio]), 0);
  const conF = list.filter(it => it.fuentes.length).length;

  const rkMap = new Map();
  list.forEach(it => {
    const m = norm(it.bo[C.matBase]); if (!m) return;
    const cur = rkMap.get(m) || { code: m, desc: norm(it.bo[C.descSol]).slice(0, 40), val: 0 };
    cur.val += num(it.bo[C.pend]) * num(it.bo[C.precio]); rkMap.set(m, cur);
  });
  const rk = [...rkMap.values()].filter(x => x.val > 0).sort((a, b) => b.val - a.val).slice(0, 10);

  const boMap = new Map(list.map(it => [it.k, it]));
  const rows = list.map(it => {
    const b = it.bo, bl = bloqDe(b), cen = `${esc(b[C.centro])}${norm(b[C.alm]) ? ' / ' + esc(b[C.alm]) : ''}`;
    return `<tr class="click ${bl ? 'bloq' : ''}" data-k="${esc(it.k)}">
      <td><div>${grupoCli(b) ? `<span class="lnk" data-addf="grupocli|${esc(grupoCli(b))}" title="Filtrar por este grupo">${esc(grupoCli(b))}</span>` : '—'}</div><div class="sub">${esc(normCode(b[C.gpo]))}</div></td>
      <td><span class="lnk" data-ev="ped" data-key="${esc(b[C.pedido])}"><b>${esc(b[C.pedido])}</b></span><div class="sub">OC ${esc(b[C.oc]) || '—'}</div></td>
      <td>${esc(b[C.fecha])}</td>
      <td><div>${esc(b[C.razon])}</div>
        <div style="font-size:11px;margin-top:2px">
          <span class="lnk" data-ev="solic" data-key="${esc(b[C.solic])}">Solic ${esc(b[C.solic])}</span> ·
          <span class="lnk" data-ev="dest"  data-key="${esc(b[C.dest])}">Dest ${esc(b[C.dest])}</span></div></td>
      <td>${ejecDe(b) ? `<span class="lnk" data-addf="ejecutivo|${esc(ejecDe(b))}" title="Filtrar por este ejecutivo">${esc(ejecDe(b))}</span>` : '—'}</td>
      <td>${cen}</td>
      <td><span class="lnk" data-ev="det">${esc(b[C.matBase])}</span><div class="sub">${esc(b[C.descSol])}</div></td>
      <td>${esc(sectorDe(b)) || '—'}<div class="sub">${esc(grupoArt(b)) || ''}</div></td>
      <td class="num">${fmt(b[C.cantPed])}</td><td class="num">${fmt(b[C.pend])}</td>
      <td class="num">${moneyD(b[C.precio])}</td><td class="num">${fmt(it.consumoProm)}</td>
      ${invCell(b[C.inv1030], b[C.tr1030])}${invCell(b[C.inv1031], b[C.tr1031])}
      ${invCell(b[C.inv1032], b[C.tr1032])}${invCell(b[C.inv1060], 0)}
      <td>${bl ? `<span class="pill amb">${esc(bl)}</span>` : '—'}</td>
      <td>${pill(it.status.label, it.status.cls)}</td>
      <td>${trendText(it.tend)}</td>
      <td class="num"><span class="lnk" data-ev="det">${it.fuentes.length || '—'}</span></td>
    </tr>`;
  }).join('');

  container.querySelector('.result').innerHTML = `
    <div class="invtop">
      <div class="kpis2x2">
        <div class="kpi sm"><div class="lbl">Renglones BO</div><div class="val">${fmt(list.length)}</div></div>
        <div class="kpi sm"><div class="lbl">Cant. pendiente</div><div class="val">${fmt(pendTot)}</div>
          <div class="sub"><span class="gok">🟢 ${fmt(pendTot - pendBloq)}</span> · <span class="gwarn">🟡 ${fmt(pendBloq)}</span></div></div>
        <div class="kpi sm"><div class="lbl">Importe pendiente</div><div class="val" style="font-size:17px">${money(impTot)}</div>
          <div class="sub"><span class="gok">🟢 ${money(impTot - impBloq)}</span> · <span class="gwarn">🟡 ${money(impBloq)}</span></div></div>
        <div class="kpi sm"><div class="lbl">Con fuentes</div><div class="val">${fmt(conF)}</div></div>
      </div>
      ${rankingHTML(rk, { title: '🏆 Top 10 material por importe pendiente', money: true })}
    </div>
    <div class="tablecard">
      <h3>📋 Todas las Sugerencias <span class="hint">fila = detalle · Pedido = detalle del pedido · material/fuentes = inventario · Solic/Dest = facturación</span></h3>
      <div class="tbl"><table>
        <thead><tr>
          ${th('Grupo de cliente', 'grupocli', sort)}${th('Pedido / OC', 'pedido', sort)}${th('Fecha', 'fecha', sort)}
          ${th('Cliente', 'cliente', sort)}${th('Ejecutivo', 'ejecutivo', sort)}${th('Centro/Alm', 'centro', sort)}
          ${th('Material base / Descripción', 'mat', sort)}${th('Sector / Grupo art.', 'sector', sort)}
          ${th('Cant. ped.', 'cantped', sort, 'num')}${th('Pendiente', 'pend', sort, 'num')}${th('Precio', 'precio', sort, 'num')}${th('Consumo', 'consumo', sort, 'num')}
          ${th('Inv 1030', 'inv1030', sort, 'num')}${th('Inv 1031', 'inv1031', sort, 'num')}${th('Inv 1032', 'inv1032', sort, 'num')}${th('Inv 1060', 'inv1060', sort, 'num')}
          ${th('Bloqueado', 'bloq', sort)}${th('Estado', 'estado', sort)}${th('Tendencia', 'tend', sort)}${th('Fuentes', 'fuentes', sort, 'num')}
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="20" class="muted" style="padding:20px;text-align:center">Sin resultados</td></tr>'}</tbody>
      </table></div>
    </div>`;

  wireZoom(container, 'sug', '.result .tbl table');
  container.querySelectorAll('.result th.sortable').forEach(thEl => thEl.addEventListener('click', e => {
    sort = cycleSort(sort, thEl.dataset.sort, e.shiftKey); paint(container);
  }));
  wireAddfClicks(container, flt, () => renderSug(container));
  container.querySelectorAll('.result [data-ev]').forEach(el => el.addEventListener('click', ev => {
    ev.stopPropagation();
    const kind = el.dataset.ev;
    if (kind === 'det') { const it = boMap.get(el.closest('tr').dataset.k); if (it) navOpen(() => openDetalle(it)); }
    else if (kind === 'ped') navOpen(() => openPedido(el.dataset.key));
    else if (kind === 'solic') navOpen(() => openEvol('solic', el.dataset.key));
    else if (kind === 'dest') navOpen(() => openEvol('dest', el.dataset.key));
  }));
  container.querySelectorAll('.result tr.click').forEach(tr => tr.addEventListener('click', () => { const it = boMap.get(tr.dataset.k); if (it) navOpen(() => openDetalle(it)); }));
}

function exportSug() {
  const list = applySort(filtered(), sort, accessor);
  const rowsX = list.map(it => { const b = it.bo;
    return {
      'Grupo de cliente': grupoCli(b), 'Código grupo': normCode(b[C.gpo]),
      'Pedido': norm(b[C.pedido]), 'OC': norm(b[C.oc]), 'Fecha': norm(b[C.fecha]),
      'Razón social': norm(b[C.razon]), 'Solicitante': norm(b[C.solic]), 'Destinatario': norm(b[C.dest]),
      'Ejecutivo': ejecDe(b), 'Centro': norm(b[C.centro]), 'Almacén': norm(b[C.alm]),
      'Material base': norm(b[C.matBase]), 'Descripción': norm(b[C.descSol]), 'Sector': sectorDe(b), 'Grupo art.': grupoArt(b),
      'Cant. pedida': num(b[C.cantPed]), 'Pendiente': num(b[C.pend]), 'Precio': num(b[C.precio]), 'Consumo prom.': num(it.consumoProm),
      'Inv 1030': num(b[C.inv1030]), 'Inv 1031': num(b[C.inv1031]), 'Inv 1032': num(b[C.inv1032]), 'Inv 1060': num(b[C.inv1060]),
      'Bloqueado': bloqDe(b), 'Estado': it.status.label, 'Tendencia': it.tend.txt, 'Fuentes': it.fuentes.length,
    };
  });
  exportXlsx(`sugerencias_${stamp()}.xlsx`, rowsX, 'Sugerencias');
}

/* encabezado: solicitante › razón social › destinatario */
const cabecera = b => `<div class="detail-head">📋 Detalle de sugerencia / BO</div>
  <h2>${esc(b[C.solic])} › ${esc(b[C.razon])} › ${esc(b[C.dest])}</h2>
  <p class="muted">Solicitante › Razón social › Destinatario</p>
  <div class="factbar">
    <span><b>Pedido</b> ${esc(b[C.pedido]) || '—'}</span>
    <span><b>OC</b> ${esc(b[C.oc]) || '—'}</span>
    <span><b>Fecha pedido</b> ${esc(b[C.fecha]) || '—'}</span>
    <span><b>Material</b> ${esc(b[C.matBase]) || '—'} · ${esc(b[C.descSol]) || ''}</span>
    <span><b>Ejecutivo</b> ${esc(ejecDe(b)) || '—'}</span>
    <span><b>Grupo cliente</b> ${esc(grupoCli(b)) || '—'}</span>
    <span><b>Centro/Alm</b> ${esc(b[C.centro]) || '—'}${norm(b[C.alm]) ? ' / ' + esc(b[C.alm]) : ''}</span>
  </div>`;

function consumoHTML(cons, status) {
  const st = status || (cons && cons.tnd);
  if (!store.RF) return '<p class="muted">Sin Resumen_Fac cargado.</p>';
  if (!cons || cons.tipo === 'nada') return `<p class="muted">Sin facturación registrada.</p>${st ? '<div class="consu"><div class="b"><div class="t">Estado</div><div class="m">' + pill(st.label, st.cls) + '</div></div></div>' : ''}`;
  if (cons.tipo === 'actual') {
    return `<div class="consu">
      <div class="b" style="border-color:#1f6feb55"><div class="t">Facturación corriente (${mesLabel(store.CURMES)})</div><div class="m">${fmt(cons.cant)} pzs · ${money(cons.imp)}</div></div>
      <div class="b"><div class="t">Estado</div><div class="m">${pill(st.label, st.cls)}</div></div></div>`;
  }
  const u = cons.ultimo, p = cons.penultimo;
  return `<div class="consu">
    <div class="b" style="border-color:#d2992255"><div class="t">⚠️ Sin factura en el mes · Último: ${u ? mesLabel(u.mes) : '—'}</div><div class="m">${u ? fmt(u.cant) + ' pzs · ' + money(u.imp) : '—'}</div></div>
    <div class="b"><div class="t">Penúltimo: ${p ? mesLabel(p.mes) : '—'}</div><div class="m">${p ? fmt(p.cant) + ' pzs · ' + money(p.imp) : '—'}</div></div>
    <div class="b"><div class="t">Estado</div><div class="m">${pill(st.label, st.cls)}</div></div></div>`;
}

/* detalle del PEDIDO: todos los materiales, navegables */
export function openPedido(pedido) {
  const items = store.BO.filter(it => norm(it.bo[C.pedido]) === norm(pedido));
  if (!items.length) return;
  const b0 = items[0].bo;
  const pendTot = items.reduce((s, it) => s + num(it.bo[C.pend]), 0);
  const impTot = items.reduce((s, it) => s + num(it.bo[C.pend]) * num(it.bo[C.precio]), 0);
  const rows = items.map((it, i) => {
    const b = it.bo, bl = bloqDe(b);
    return `<tr class="click ${bl ? 'bloq' : ''}" data-pi="${i}">
      <td><span class="lnk">${esc(b[C.matBase])}</span> <span class="lnk" data-goinv="${esc(b[C.matBase])}" title="Inventario del material">🏷️</span></td><td>${esc(b[C.descSol])}</td>
      <td class="num">${fmt(b[C.cantPed])}</td><td class="num">${fmt(b[C.pend])}</td><td class="num">${moneyD(b[C.precio])}</td>
      <td class="num">${it.fuentes.length || '—'}</td>
      <td>${bl ? `<span class="pill amb">${esc(bl)}</span>` : '—'}</td>
      <td>${pill(it.status.label, it.status.cls)}</td><td>${trendText(it.tend)}</td></tr>`;
  }).join('');
  openModal(`
    ${backBtn()}<button class="x" onclick="closeModal()">×</button>
    <div class="detail-head">🧾 Detalle del pedido</div>
    <h2>Pedido ${esc(pedido)}</h2>
    <p class="muted">${esc(b0[C.razon])} · OC ${esc(b0[C.oc]) || '—'} · ${items.length} material(es)</p>
    <div class="factbar">
      <span><b>Pedido</b> ${esc(pedido)}</span>
      <span><b>OC</b> ${esc(b0[C.oc]) || '—'}</span>
      <span><b>Fecha pedido</b> ${esc(b0[C.fecha]) || '—'}</span>
      <span><b>Cliente</b> ${esc(b0[C.razon]) || '—'}</span>
      <span><b>Ejecutivo</b> ${esc(ejecDe(b0)) || '—'}</span>
      <span><b>Grupo cliente</b> ${esc(grupoCli(b0)) || '—'}</span>
      <span><b>Solic/Dest</b> ${esc(b0[C.solic])} / ${esc(b0[C.dest])}</span>
    </div>
    <div class="mkpis">
      <div class="stat"><div class="l">Materiales</div><div class="v">${items.length}</div></div>
      <div class="stat"><div class="l">Cant. pendiente</div><div class="v">${fmt(pendTot)}</div></div>
      <div class="stat"><div class="l">Importe pendiente</div><div class="v" style="font-size:16px">${money(impTot)}</div></div>
    </div>
    <div class="tablecard"><h3>Materiales del pedido <span class="hint">clic en una fila para ver el detalle del material</span></h3>
      <input class="mff" data-mf placeholder="🔎 filtrar materiales…">
      <div class="tbl"><table><thead><tr><th>Material</th><th>Descripción</th><th class="num">Cant. ped.</th><th class="num">Pendiente</th><th class="num">Precio</th><th class="num">Fuentes</th><th>Bloqueado</th><th>Estado</th><th>Tendencia</th></tr></thead>
      <tbody>${rows}</tbody></table></div></div>`);
  document.querySelectorAll('#modal tr.click').forEach(tr => tr.addEventListener('click', () => navPush(() => openDetalle(items[+tr.dataset.pi]))));
}

export function openDetalle(it, fromPedido) {
  if (!it) return;
  const b = it.bo;
  const invPrincipales = [['1030', b[C.inv1030]], ['1031', b[C.inv1031]], ['1032', b[C.inv1032]], ['1060', b[C.inv1060]]];
  const invOtros = [['1001', b[C.inv1001]], ['1003', b[C.inv1003]], ['1004', b[C.inv1004]], ['1017', b[C.inv1017]], ['1018', b[C.inv1018]], ['1022', b[C.inv1022]], ['1036', b[C.inv1036]]];
  const dispo = [['Disp. 1031-1030', b[C.disp31_30]], ['Disp. 1031-1032', b[C.disp31_32]]];
  const transito = [['Tránsito 1030', b[C.tr1030]], ['Tránsito 1031', b[C.tr1031]], ['Tránsito 1032', b[C.tr1032]], ['Tránsito total', b[C.transito]]].filter(([, v]) => num(v) > 0);

  const fz = it.fuentes.length
    ? `<div class="tbl"><table><thead><tr><th>Fuente</th><th>Material sug.</th><th>Descripción</th><th>Centro/Alm</th><th class="num">Disponible</th><th class="num">Precio inv.</th><th>Lote</th><th>Caducidad / vigencia</th></tr></thead><tbody>${
        it.fuentes.map(f => {
          const pInv = precioInv(f[C.matSug], f[C.fuente]);
          const vg = vigencia(f[C.cad]);
          return `<tr><td>${pill(norm(f[C.fuente]), /[Cc]orta/.test(norm(f[C.fuente])) ? 'rojo' : 'azul')}</td><td><span class="lnk" data-goinv="${esc(f[C.matSug])}">${esc(f[C.matSug])}</span></td><td>${esc(f[C.descSug])}</td><td>${esc(f[C.cenSug])}${norm(f[C.almSug]) ? ' / ' + esc(f[C.almSug]) : ''}</td><td class="num">${fmt(f[C.disp])}</td><td class="num">${pInv != null ? moneyD(pInv) : '—'}</td><td>${esc(f[C.lote])}</td><td>${esc(f[C.cad]) || '—'}${vg ? `<div class="vig ${vg.cls}">${vg.txt}</div>` : ''}</td></tr>`;
        }).join('')
      }</tbody></table></div>`
    : '<p class="muted">Este BO no tiene fuentes asociadas.</p>';

  const bl = bloqDe(b);
  openModal(`
    ${backBtn()}<button class="x" onclick="closeModal()">×</button>
    ${cabecera(b)}
    <p class="muted">Pedido <span class="lnk" id="goped">${esc(b[C.pedido])}</span> · OC ${esc(b[C.oc]) || '—'} · Material <span class="lnk" id="goinv">${esc(b[C.matBase])}</span> — ${esc(b[C.descSol])} ${bl ? '· <span class="pill amb">' + esc(bl) + '</span>' : ''} <button class="btn" id="goinv2" style="margin-left:8px">🏷️ Inventario del material</button></p>
    <div class="mkpis">
      <div class="stat"><div class="l">Pendiente</div><div class="v">${fmt(b[C.pend])}</div></div>
      <div class="stat"><div class="l">Precio</div><div class="v">${moneyD(b[C.precio])}</div></div>
      <div class="stat"><div class="l">Estado</div><div class="v" style="font-size:14px">${pill(it.status.label, it.status.cls)}</div></div>
      <div class="stat"><div class="l">Tendencia</div><div class="v" style="font-size:14px">${trendText(it.tend)}</div></div>
      <div class="stat"><div class="l">Ejecutivo</div><div class="v" style="font-size:13px">${esc(ejecDe(b)) || '—'}</div></div>
    </div>
    <div class="card"><h3>💵 Consumo / facturación</h3>${consumoHTML(it.cons, it.status)}</div>
    ${store.RF ? `<div class="card"><h3>📊 Comparativo anual</h3>${comparativaDualHTML(it.serie)}</div>` : ''}
    <div class="card"><h3>📈 Evolución mensual — material + destinatario</h3><div class="chartbox"><canvas id="cD"></canvas></div></div>
    <div class="card"><h3>🔀 Fuentes / materiales ofertables (${it.fuentes.length})</h3><input class="mff" data-mf placeholder="🔎 filtrar fuentes…">${fz}</div>
    <div class="card"><h3>📦 Inventario principales</h3>${invGrid(invPrincipales)}
      <h3 style="margin-top:12px">🏬 Otros centros (1001–1036)</h3>${invGrid(invOtros)}
      <h3 style="margin-top:12px">🔁 Disponible entre almacenes</h3>${invGrid(dispo)}
      <h3 style="margin-top:12px">🚚 Material en curso (tránsito) por almacén</h3>${transito.length ? invGrid(transito) : '<p class="muted">Sin material en tránsito.</p>'}</div>
  `);
  drawSerie('cD', it.serie, '');
  document.getElementById('goped')?.addEventListener('click', () => navPush(() => openPedido(b[C.pedido])));
  const goInv = () => { if (window.__openMaterialInv) window.__openMaterialInv(b[C.matBase]); };
  document.getElementById('goinv')?.addEventListener('click', goInv);
  document.getElementById('goinv2')?.addEventListener('click', goInv);
}
function matsTableHTML(mats) {
  if (!mats.length) return '<p class="muted">Sin materiales facturados.</p>';
  const rows = mats.map(m => `<tr class="click" data-mat="${esc(m.material)}" data-sector="${esc(m.sector)}" data-grupo="${esc(m.grupo)}">
    <td><span class="lnk">${esc(m.material)}</span> <span class="lnk" data-goinv="${esc(m.material)}" title="Inventario del material">🏷️</span></td><td>${esc(m.texto)}</td>
    <td>${esc(m.sector) || '—'}</td><td>${esc(m.grupo) || '—'}</td>
    <td>${m.ultimo ? esc(mesLabel(m.ultimo.mes)) : '—'}</td>
    <td class="num">${m.ultimo ? money(m.ultimo.imp) : '—'}</td>
    <td>${trendText(m.tend)}</td></tr>`).join('');
  return `<div class="tbl" style="max-height:300px"><table><thead><tr><th>Material</th><th>Descripción</th><th>Sector</th><th>Grupo art.</th><th>Último mes</th><th class="num">Importe</th><th>Tendencia</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function openCodigoEvol(kind, key, material) {
  const serie = kind === 'solic'
    ? ((store.RF.solicMats.get(norm(key)) || new Map()).get(norm(material)) || [])
    : (serieMatDest(key, material) || []);
  const texto = store.RF.matTexto.get(norm(material)) || '';
  openModal(`${backBtn()}<button class="x" onclick="closeModal()">×</button>
    <h2>${esc(material)} · ${esc(texto)}</h2>
    <p class="muted">${kind === 'solic' ? 'Solicitante' : 'Destinatario'} ${esc(key)} · comportamiento del material</p>
    <div class="card"><h3>📊 Comparativo anual</h3>${comparativaDualHTML(serie)}</div>
    <div class="card"><h3>📈 Evolución mensual <span class="hint">clic en un mes = clientes de ese material</span></h3><div class="chartbox"><canvas id="cCod"></canvas></div></div>`);
  drawSerie('cCod', serie, 'Importe', undefined, mes => navPush(() => openClientesMes(material, mes)));
}

export function openEvol(kind, key) {
  if (!store.RF) { alert('No hay Resumen_Fac cargado.'); return; }
  const serie = kind === 'solic' ? serieSolic(key) : serieDest(key);
  const titulo = kind === 'solic' ? 'Facturación general del Solicitante' : 'Facturación general del Destinatario';
  const mats = materialesDe(kind, key).map(m => ({ ...m, sector: matSector(m.material) || '', grupo: matGrupo(m.material) || '' }));

  let destCard = '';
  if (kind === 'solic') {
    const dmap = new Map();
    (store.FACROWS || []).forEach(r => {
      if (norm(r['Solicitante']) !== norm(key)) return;
      const d = norm(r['Destinatario']); if (!d) return;
      let o = dmap.get(d); if (!o) { o = { dest: d, imp: 0, cant: 0 }; dmap.set(d, o); }
      o.imp += num(r['Importe facturado']); o.cant += num(r['Cantidad facturada']);
    });
    const drows = [...dmap.values()].sort((a, b) => b.imp - a.imp).map(d =>
      `<tr class="click" data-dest="${esc(d.dest)}"><td><span class="lnk">Dest ${esc(d.dest)}</span></td><td class="num">${fmt(d.cant)}</td><td class="num">${money(d.imp)}</td></tr>`).join('');
    destCard = `<div class="card"><h3>🏢 Destinatarios de este solicitante <span class="hint">clic para ver su facturación</span></h3>
      <div class="tbl" style="max-height:200px"><table><thead><tr><th>Destinatario</th><th class="num">Cantidad</th><th class="num">Importe</th></tr></thead><tbody>${drows || '<tr><td colspan="3" class="muted" style="padding:10px;text-align:center">Sin destinatarios.</td></tr>'}</tbody></table></div></div>`;
  }

  const sectores = [...new Set(mats.map(m => m.sector).filter(Boolean))].sort();
  const grupos = [...new Set(mats.map(m => m.grupo).filter(Boolean))].sort();
  const filtBar = `<div class="trow" style="gap:8px;align-items:center;margin-bottom:8px;flex-wrap:wrap">
    <input class="mff" data-msearch placeholder="🔎 material / descripción…">
    <select data-fsec><option value="">Sector (todos)</option>${sectores.map(s => `<option>${esc(s)}</option>`).join('')}</select>
    <select data-fgru><option value="">Grupo art. (todos)</option>${grupos.map(g => `<option>${esc(g)}</option>`).join('')}</select></div>`;

  openModal(`
    ${backBtn()}<button class="x" onclick="closeModal()">×</button>
    <h2>${titulo}</h2>
    <p class="muted">${kind === 'solic' ? 'Solicitante' : 'Destinatario'}: ${esc(key)} · ${mats.length} material(es) facturado(s)</p>
    <div class="card"><h3>📊 Comparativo anual <span class="hint">refleja el filtro de abajo</span></h3><div id="cmpWrap">${comparativaDualHTML(serie)}</div></div>
    <div class="card"><h3>📈 Evolución mensual — Importe facturado <span class="hint">refleja el filtro de abajo</span></h3><div class="chartbox"><canvas id="cG"></canvas></div></div>
    ${destCard}
    <div class="card"><h3>🧾 Códigos facturados y su tendencia <span class="hint">clic en un material para ver su comportamiento</span></h3>${filtBar}${matsTableHTML(mats)}</div>`);
  drawSerie('cG', serie, titulo);

  const fsec = document.querySelector('#modal [data-fsec]'), fgru = document.querySelector('#modal [data-fgru]'), mf = document.querySelector('#modal [data-msearch]');
  const matchMat = m => {
    const s = fsec ? fsec.value : '', g = fgru ? fgru.value : '', q = norm(mf ? mf.value : '').toLowerCase();
    if (s && m.sector !== s) return false;
    if (g && m.grupo !== g) return false;
    if (q && !((m.material + ' ' + m.texto).toLowerCase().includes(q))) return false;
    return true;
  };
  const recompute = () => {
    const ok = new Set(mats.filter(matchMat).map(m => m.material));
    document.querySelectorAll('#modal tr[data-mat]').forEach(tr => { tr.style.display = ok.has(tr.dataset.mat) ? '' : 'none'; });
    const bk = new Map();
    mats.forEach(m => { if (!ok.has(m.material)) return; m.serie.forEach(p => { const c = bk.get(p.mes) || { cant: 0, imp: 0 }; c.cant += p.cant; c.imp += p.imp; bk.set(p.mes, c); }); });
    const agg = [...bk.entries()].map(([mes, v]) => ({ mes, cant: v.cant, imp: v.imp })).sort((a, b) => mKey(a.mes) - mKey(b.mes));
    const w = document.querySelector('#modal #cmpWrap'); if (w) w.innerHTML = comparativaDualHTML(agg);
    drawSerie('cG', agg, titulo);
  };
  if (fsec) fsec.onchange = recompute; if (fgru) fgru.onchange = recompute; if (mf) mf.oninput = recompute;
  document.querySelectorAll('#modal tr[data-dest]').forEach(tr => tr.addEventListener('click', () => navPush(() => openEvol('dest', tr.dataset.dest))));
  document.querySelectorAll('#modal tr[data-mat]').forEach(tr => tr.addEventListener('click', () => navPush(() => openCodigoEvol(kind, key, tr.dataset.mat))));
}

if (typeof window !== 'undefined') {
  window.__openDestEvol = d => navPush(() => openEvol('dest', d));
  window.__openSolicEvol = s2 => navPush(() => openEvol('solic', s2));
  window.__openPedidoG = p => navPush(() => openPedido(p));
}
