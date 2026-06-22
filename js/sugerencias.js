/* ===========================================================================
   sugerencias.js · "Todas las Sugerencias" (BO) — v3
   Estado (recencia) y Tendencia (dirección con mes actual) separados.
   Buscador con refresco ligero (no reconstruye el input -> admite espacios).
   =========================================================================== */
import { norm, num, fmt, money, esc } from './utils.js';
import { store, C } from './store.js';
import { serieMatDest, serieSolic, serieDest, consumoDe, clasificarEstado,
         tendenciaTexto, comparativa, materialesDe, ESTADOS } from './resumenFac.js';
import { openModal, drawSerie, pill, trendText, invGrid, rankingHTML,
         comparativaHTML, materialesTablaHTML } from './ui.js';
import { toolbarHTML, wireToolbar, makeFilters, passes } from './filters.js';
import { zoomHTML, wireZoom } from './zoom.js';

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
    return { bo: b, fuentes: g.fuentes, k: keyOf(b), serie,
      status: clasificarEstado(serie, num(b[C.pend]) > 0), tend: tendenciaTexto(serie), cons: consumoDe(serie) };
  });
}

const flt = makeFilters();
flt.estado = ''; flt.fuente = '';
const cols = () => [
  { key: 'gpo', label: 'Grupo cliente', get: it => it.bo[C.gpo] },
  { key: 'oc', label: 'OC', get: it => it.bo[C.oc] },
  { key: 'pedido', label: 'Pedido', get: it => it.bo[C.pedido] },
  { key: 'cliente', label: 'Cliente', get: it => it.bo[C.razon] },
  { key: 'solic', label: 'Solicitante', get: it => it.bo[C.solic] },
  { key: 'dest', label: 'Destinatario', get: it => it.bo[C.dest] },
  { key: 'mat', label: 'Material', get: it => it.bo[C.matBase] },
  { key: 'desc', label: 'Descripción', get: it => it.bo[C.descSol] },
  { key: 'centro', label: 'Centro', get: it => it.bo[C.centro] },
];
function filtered() {
  const Cc = cols();
  return store.BO.filter(it => {
    if (flt.estado && it.status.key !== flt.estado) return false;
    if (flt.fuente === 'si' && !it.fuentes.length) return false;
    if (flt.fuente === 'no' && it.fuentes.length) return false;
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
  container.innerHTML = `${toolbarHTML(cols(), flt, `${estSel}${fueSel}${zoomHTML('sug')}`)}<div class="result"></div>`;
  wireToolbar(container, flt, () => renderSug(container), () => paint(container));
  container.querySelector('[data-est]').onchange = e => { flt.estado = e.target.value; paint(container); };
  container.querySelector('[data-fue]').onchange = e => { flt.fuente = e.target.value; paint(container); };
  paint(container);
}

function paint(container) {
  const list = filtered();
  const pend = list.reduce((s, it) => s + num(it.bo[C.pend]), 0);
  const impPend = list.reduce((s, it) => s + num(it.bo[C.pend]) * num(it.bo[C.precio]), 0);
  const conF = list.filter(it => it.fuentes.length).length;

  const rkMap = new Map();
  list.forEach(it => {
    const m = norm(it.bo[C.matBase]); if (!m) return;
    const cur = rkMap.get(m) || { code: m, desc: norm(it.bo[C.descSol]).slice(0, 40), val: 0 };
    cur.val += num(it.bo[C.pend]) * num(it.bo[C.precio]); rkMap.set(m, cur);
  });
  const rk = [...rkMap.values()].filter(x => x.val > 0).sort((a, b) => b.val - a.val).slice(0, 10);

  const rows = list.map((it, i) => {
    const b = it.bo, cen = `${esc(b[C.centro])}${norm(b[C.alm]) ? ' / ' + esc(b[C.alm]) : ''}`;
    return `<tr class="click" data-i="${i}">
      <td>${esc(b[C.gpo])}</td><td>${esc(b[C.oc])}</td><td>${esc(b[C.pedido])}</td><td>${esc(b[C.fecha])}</td>
      <td><div>${esc(b[C.razon])}</div>
        <div style="font-size:11px;margin-top:2px">
          <span class="lnk" data-ev="solic" data-k="${esc(b[C.solic])}">Solic ${esc(b[C.solic])}</span> ·
          <span class="lnk" data-ev="dest"  data-k="${esc(b[C.dest])}">Dest ${esc(b[C.dest])}</span></div></td>
      <td>${cen}</td>
      <td><span class="lnk" data-ev="det" data-i="${i}">${esc(b[C.matBase])}</span></td>
      <td>${esc(b[C.descSol])}</td>
      <td class="num">${fmt(b[C.cantPed])}</td><td class="num">${fmt(b[C.pend])}</td>
      <td class="num">${money(b[C.precio])}</td><td class="num">${fmt(b[C.consumo])}</td>
      ${invCell(b[C.inv1030], b[C.tr1030])}${invCell(b[C.inv1031], b[C.tr1031])}
      ${invCell(b[C.inv1032], b[C.tr1032])}${invCell(b[C.inv1060], 0)}
      <td>${pill(it.status.label, it.status.cls)}</td>
      <td>${trendText(it.tend)}</td>
      <td class="num"><span class="lnk" data-ev="det" data-i="${i}">${it.fuentes.length || '—'}</span></td>
    </tr>`;
  }).join('');

  container.querySelector('.result').innerHTML = `
    <div class="invtop">
      <div class="kpis2x2">
        <div class="kpi sm"><div class="lbl">Renglones BO</div><div class="val">${fmt(list.length)}</div></div>
        <div class="kpi sm"><div class="lbl">Cant. pendiente</div><div class="val">${fmt(pend)}</div></div>
        <div class="kpi sm"><div class="lbl">Importe pendiente</div><div class="val" style="font-size:18px">${money(impPend)}</div></div>
        <div class="kpi sm"><div class="lbl">Con fuentes</div><div class="val">${fmt(conF)}</div></div>
      </div>
      ${rankingHTML(rk, { title: '🏆 Top 10 material por importe pendiente', money: true })}
    </div>
    <div class="tablecard">
      <h3>📋 Todas las Sugerencias <span class="hint">fila = detalle · material/fuentes = inventario y evolución · Solic/Dest = facturación general</span></h3>
      <div class="tbl"><table>
        <thead><tr>
          <th>Grupo de cliente</th><th>OC</th><th>Pedido</th><th>Fecha</th><th>Cliente</th><th>Centro/Alm</th>
          <th>Material base</th><th>Descripción material</th><th class="num">Cant. ped.</th><th class="num">Pendiente</th>
          <th class="num">Precio</th><th class="num">Consumo</th>
          <th class="num">Inv 1030</th><th class="num">Inv 1031</th><th class="num">Inv 1032</th><th class="num">Inv 1060</th>
          <th>Estado</th><th>Tendencia</th><th class="num">Fuentes</th>
        </tr></thead>
        <tbody>${rows || '<tr><td colspan="19" class="muted" style="padding:20px;text-align:center">Sin resultados</td></tr>'}</tbody>
      </table></div>
    </div>`;

  wireZoom(container, 'sug', '.result .tbl table');
  container.querySelectorAll('.result [data-ev]').forEach(el => el.addEventListener('click', ev => {
    ev.stopPropagation();
    const kind = el.dataset.ev, l2 = filtered();
    if (kind === 'det') openDetalle(l2[+el.dataset.i]);
    else if (kind === 'solic') openEvol('solic', el.dataset.k);
    else if (kind === 'dest') openEvol('dest', el.dataset.k);
  }));
  container.querySelectorAll('.result tr.click').forEach(tr => tr.addEventListener('click', () => openDetalle(filtered()[+tr.dataset.i])));
}

function consumoHTML(cons, status) {
  const st = status || (cons && cons.tnd);
  if (!store.RF) return '<p class="muted">Sin Resumen_Fac cargado.</p>';
  if (!cons || cons.tipo === 'nada') return `<p class="muted">Sin facturación registrada.</p>${st ? '<div class="consu"><div class="b"><div class="t">Estado</div><div class="m">' + pill(st.label, st.cls) + '</div></div></div>' : ''}`;
  if (cons.tipo === 'actual') {
    return `<div class="consu">
      <div class="b" style="border-color:#1f6feb55"><div class="t">Consumo mes corriente</div><div class="m">${fmt(cons.cant)} pzs · ${money(cons.imp)}</div></div>
      <div class="b"><div class="t">Estado</div><div class="m">${pill(st.label, st.cls)}</div></div></div>`;
  }
  const u = cons.ultimo, p = cons.penultimo;
  return `<div class="consu">
    <div class="b" style="border-color:#d2992255"><div class="t">⚠️ Sin facturación en el mes · Último</div><div class="m">${u ? fmt(u.cant) + ' pzs · ' + money(u.imp) : '—'}</div></div>
    <div class="b"><div class="t">Penúltimo</div><div class="m">${p ? fmt(p.cant) + ' pzs · ' + money(p.imp) : '—'}</div></div>
    <div class="b"><div class="t">Estado</div><div class="m">${pill(st.label, st.cls)}</div></div></div>`;
}

export function openDetalle(it) {
  if (!it) return;
  const b = it.bo;
  const invPrincipales = [['1030', b[C.inv1030]], ['1031', b[C.inv1031]], ['1032', b[C.inv1032]], ['1060', b[C.inv1060]]];
  const invOtros = [['1001', b[C.inv1001]], ['1003', b[C.inv1003]], ['1004', b[C.inv1004]], ['1017', b[C.inv1017]], ['1018', b[C.inv1018]], ['1022', b[C.inv1022]], ['1036', b[C.inv1036]]];
  const dispo = [['Disp. 1031-1030', b[C.disp31_30]], ['Disp. 1031-1032', b[C.disp31_32]]];
  const transito = [['Tránsito 1030', b[C.tr1030]], ['Tránsito 1031', b[C.tr1031]], ['Tránsito 1032', b[C.tr1032]], ['Tránsito total', b[C.transito]]].filter(([, v]) => num(v) > 0);

  const fz = it.fuentes.length
    ? `<div class="tbl"><table><thead><tr><th>Fuente</th><th>Material sug.</th><th>Descripción</th><th>Centro/Alm</th><th class="num">Disponible</th><th>Lote</th><th>Caducidad</th></tr></thead><tbody>${
        it.fuentes.map(f => `<tr><td>${pill(norm(f[C.fuente]), /[Cc]orta/.test(norm(f[C.fuente])) ? 'rojo' : 'azul')}</td><td>${esc(f[C.matSug])}</td><td>${esc(f[C.descSug])}</td><td>${esc(f[C.cenSug])}${norm(f[C.almSug]) ? ' / ' + esc(f[C.almSug]) : ''}</td><td class="num">${fmt(f[C.disp])}</td><td>${esc(f[C.lote])}</td><td>${esc(f[C.cad])}</td></tr>`).join('')
      }</tbody></table></div>`
    : '<p class="muted">Este BO no tiene fuentes asociadas.</p>';

  openModal(`
    <button class="x" onclick="closeModal()">×</button>
    <h2>${esc(b[C.razon])}</h2>
    <p class="muted">Pedido ${esc(b[C.pedido])} · OC ${esc(b[C.oc])} · Material ${esc(b[C.matBase])} — ${esc(b[C.descSol])}</p>
    <div class="mkpis">
      <div class="stat"><div class="l">Pendiente</div><div class="v">${fmt(b[C.pend])}</div></div>
      <div class="stat"><div class="l">Precio</div><div class="v">${money(b[C.precio])}</div></div>
      <div class="stat"><div class="l">Estado</div><div class="v" style="font-size:14px">${pill(it.status.label, it.status.cls)}</div></div>
      <div class="stat"><div class="l">Tendencia</div><div class="v" style="font-size:14px">${trendText(it.tend)}</div></div>
      <div class="stat"><div class="l">Solic / Dest</div><div class="v" style="font-size:14px">${esc(b[C.solic])} / ${esc(b[C.dest])}</div></div>
    </div>
    <div class="card"><h3>💵 Consumo / facturación</h3>${consumoHTML(it.cons, it.status)}</div>
    ${store.RF ? `<div class="card"><h3>📊 Comparativo anual</h3>${comparativaHTML(comparativa(it.serie))}</div>` : ''}
    <div class="card"><h3>📈 Evolución mensual — material + destinatario</h3><div class="chartbox"><canvas id="cD"></canvas></div></div>
    <div class="card"><h3>🔀 Fuentes / materiales ofertables (${it.fuentes.length})</h3>${fz}</div>
    <div class="card"><h3>📦 Inventario principales</h3>${invGrid(invPrincipales)}
      <h3 style="margin-top:12px">🏬 Otros centros (1001–1036)</h3>${invGrid(invOtros)}
      <h3 style="margin-top:12px">🔁 Disponible entre almacenes</h3>${invGrid(dispo)}
      <h3 style="margin-top:12px">🚚 Material en curso (tránsito) por almacén</h3>${transito.length ? invGrid(transito) : '<p class="muted">Sin material en tránsito.</p>'}</div>
  `);
  drawSerie('cD', it.serie, '');
}

/* clic Solic/Dest: general + comparativa + todos los códigos facturados con su tendencia */
export function openEvol(kind, key) {
  if (!store.RF) { alert('No hay Resumen_Fac cargado.'); return; }
  const serie = kind === 'solic' ? serieSolic(key) : serieDest(key);
  const titulo = kind === 'solic' ? 'Facturación general del Solicitante' : 'Facturación general del Destinatario';
  const mats = materialesDe(kind, key);
  openModal(`
    <button class="x" onclick="closeModal()">×</button>
    <h2>${titulo}</h2>
    <p class="muted">${kind === 'solic' ? 'Solicitante' : 'Destinatario'}: ${esc(key)} · ${mats.length} material(es) facturado(s)</p>
    <div class="card"><h3>📊 Comparativo anual</h3>${comparativaHTML(comparativa(serie))}</div>
    <div class="card"><h3>📈 Evolución mensual — Importe facturado</h3><div class="chartbox"><canvas id="cG"></canvas></div></div>
    <div class="card"><h3>🧾 Códigos facturados y su tendencia</h3>${materialesTablaHTML(mats)}</div>`);
  drawSerie('cG', serie, titulo);
}
