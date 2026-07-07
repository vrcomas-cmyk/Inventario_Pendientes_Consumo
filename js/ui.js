/* ===========================================================================
   ui.js · modal, gráficas y pequeños renderers compartidos
   =========================================================================== */
import { esc, fmt, money, norm } from './utils.js';
import { mesLabel, completarSerie, aMesAnio, clientesPorMesMaterial, comparativa, hoyMes, mesAnterior } from './resumenFac.js';

let chartRef = null;
const charts = {};
let navStack = [];

export function openModal(html) {
  const m = document.querySelector('#modal');
  m.innerHTML = html;
  document.querySelector('#ov').classList.add('show');
  m.querySelectorAll('[data-mf]').forEach(inp => {
    const card = inp.closest('.tablecard, .card') || m;
    const tbl = card.querySelector('table');
    if (!tbl) return;
    let tmr;
    inp.addEventListener('input', () => {
      clearTimeout(tmr);
      tmr = setTimeout(() => {
        const q = inp.value.toLowerCase().trim();
        tbl.querySelectorAll('tbody tr').forEach(tr => { tr.style.display = (!q || tr.textContent.toLowerCase().includes(q)) ? '' : 'none'; });
      }, 120);
    });
  });
  makeModalTablesSortable(m);
  wireDrillLinks(m);
}

/* Enlaces de drill universales: cualquier tabla/modal puede emitir
   data-goinv (material→inventario), data-gosolic / data-godest (cliente→facturación),
   data-goped (pedido→detalle), data-gorss (material|centro→Resumen Sin Sugerencias). */
export function wireDrillLinks(root) {
  const bind = (sel, fn) => (root || document).querySelectorAll(sel).forEach(el => el.addEventListener('click', ev => { ev.stopPropagation(); fn(el); }));
  bind('[data-goinv]',   el => window.__openMaterialInv && window.__openMaterialInv(el.dataset.goinv));
  bind('[data-gosolic]', el => window.__openSolicEvol && window.__openSolicEvol(el.dataset.gosolic));
  bind('[data-godest]',  el => window.__openDestEvol && window.__openDestEvol(el.dataset.godest));
  bind('[data-goped]',   el => window.__openPedidoG && window.__openPedidoG(el.dataset.goped));
  bind('[data-gorss]',   el => { const [m, c] = el.dataset.gorss.split('|'); window.__openRSSCelda && window.__openRSSCelda(m, c); });
}

/* Toggle segmentado 📋/📊 dentro del modal: botones .seg[data-view] muestran su [data-pane] */
export function wireSegToggle() {
  const panes = {};
  document.querySelectorAll('#modal [data-pane]').forEach(p => { panes[p.dataset.pane] = p; });
  document.querySelectorAll('#modal .segm .seg').forEach(btn => btn.addEventListener('click', () => {
    document.querySelectorAll('#modal .segm .seg').forEach(b => b.classList.remove('on'));
    btn.classList.add('on');
    const v = btn.dataset.view;
    Object.entries(panes).forEach(([k, p]) => { p.style.display = k === v ? '' : 'none'; });
  }));
}

/* Hace ordenables (clic en encabezado) todas las tablas dentro de un modal.
   Detecta números, importes y meses (Junio/2026, 06/2026). Alterna asc/desc. */
function sortKey(td) {
  if (td.dataset && td.dataset.sort !== undefined && td.dataset.sort !== '') {
    const n = Number(td.dataset.sort); return isNaN(n) ? td.dataset.sort.toLowerCase() : n;
  }
  const t = (td.textContent || '').trim();
  const meses = { enero:1, febrero:2, marzo:3, abril:4, mayo:5, junio:6, julio:7, agosto:8, septiembre:9, octubre:10, noviembre:11, diciembre:12 };
  let mm = t.toLowerCase().match(/^([a-záéíóú]+)\/(\d{4})/);
  if (mm && meses[mm[1]]) return Number(mm[2]) * 12 + meses[mm[1]];
  mm = t.match(/^(\d{1,2})\/(\d{4})$/);
  if (mm) return Number(mm[2]) * 12 + Number(mm[1]);
  mm = t.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (mm) return Number(mm[3].length === 2 ? '20' + mm[3] : mm[3]) * 10000 + Number(mm[2]) * 100 + Number(mm[1]);
  const num = t.replace(/[^0-9.\-]/g, '');
  if (num !== '' && !isNaN(Number(num)) && /\d/.test(t)) return Number(num);
  return t.toLowerCase();
}
export function makeModalTablesSortable(root) {
  (root || document).querySelectorAll('table').forEach(tbl => {
    const thead = tbl.tHead; const tbody = tbl.tBodies[0];
    if (!thead || !tbody) return;
    const ths = thead.rows.length ? thead.rows[thead.rows.length - 1].cells : [];
    Array.from(ths).forEach((thEl, i) => {
      if (thEl.dataset.noSort !== undefined) return;
      thEl.style.cursor = 'pointer'; thEl.title = 'Ordenar';
      thEl.addEventListener('click', () => {
        const asc = thEl.dataset.dir !== 'asc';
        Array.from(ths).forEach(x => { delete x.dataset.dir; x.querySelectorAll('.sortcaret').forEach(c => c.remove()); });
        thEl.dataset.dir = asc ? 'asc' : 'desc';
        const car = document.createElement('span'); car.className = 'sortcaret'; car.textContent = asc ? ' ▲' : ' ▼'; thEl.appendChild(car);
        const rows = Array.from(tbody.rows).filter(r => !r.querySelector('td[colspan]'));
        rows.sort((ra, rb) => {
          const a = sortKey(ra.cells[i] || {}), b = sortKey(rb.cells[i] || {});
          if (a < b) return asc ? -1 : 1; if (a > b) return asc ? 1 : -1; return 0;
        });
        rows.forEach(r => tbody.appendChild(r));
      });
    });
  });
}
export function closeModal() {
  document.querySelector('#ov').classList.remove('show');
  ['cD', 'cG', 'cC'].forEach(destroyChart);     // gráficas de modal
  navStack = [];
}
export function destroyChart(id) { if (charts[id]) { try { charts[id].destroy(); } catch (e) {} delete charts[id]; } }

/* navegación entre detalles: cada nivel guarda su thunk + etiqueta (título del modal) */
function captureLabel() {
  const top = navStack[navStack.length - 1]; if (!top) return;
  const h = document.querySelector('#modal h2');
  top.label = (h ? h.textContent : '').trim().slice(0, 60) || 'Detalle';
}
export function navOpen(thunk) { navStack = [{ t: thunk }]; thunk(); captureLabel(); }   // primer nivel
export function navPush(thunk) { navStack.push({ t: thunk }); thunk(); captureLabel(); } // anidado
export function navBack() { navStack.pop(); const p = navStack[navStack.length - 1]; if (p) { p.t(); captureLabel(); } else closeModal(); }
export function navTo(i) { if (i < 0 || i >= navStack.length - 1) return; navStack = navStack.slice(0, i + 1); const p = navStack[i]; p.t(); captureLabel(); }
export function navCanBack() { return navStack.length > 1; }
export function backBtn() {
  if (!navCanBack()) return '';
  const crumbs = navStack.slice(0, -1).map((x, i) =>
    `<span class="crumb" onclick="window.__navTo(${i})" title="Ir a este nivel">${esc(x.label || 'Detalle')}</span>`).join('<span class="csep">›</span>');
  return `<div class="bcrumb"><button class="btn" onclick="window.__navBack()">← Volver</button><span class="ctrail">${crumbs}<span class="csep">›</span><span class="crumb cur">aquí</span></span></div>`;
}

/* clic en un mes de cualquier tendencia de material → clientes que facturaron ese mes, con filtro por centro */
export function openClientesMes(material, mes) {
  const all = clientesPorMesMaterial(material, mes) || [];
  const centros = [...new Set(all.map(x => x.centro).filter(Boolean))].sort();
  const tot = all.reduce((s, x) => s + x.imp, 0), totc = all.reduce((s, x) => s + x.cant, 0);
  const rowsHtml = all.map(x => `<tr data-centro="${esc(x.centro)}" class="click" data-dest="${esc(x.dest)}">
    <td>${esc(x.razon) || '—'}<div class="sub">Solic ${esc(x.solic)} · Dest ${esc(x.dest)}</div></td>
    <td>${esc(x.centro) || '—'}</td><td class="num">${fmt(x.cant)}</td><td class="num">${money(x.imp)}</td></tr>`).join('');
  openModal(`${backBtn()}<button class="x" onclick="closeModal()">×</button>
    <h2>Clientes · ${esc(material)} · ${esc(mesLabel(aMesAnio(mes)) || mes)}</h2>
    <p class="muted">${all.length} cliente(s) · ${fmt(totc)} pzs · ${money(tot)} · clic en un cliente para su facturación</p>
    <div class="trow" style="margin-bottom:8px;gap:8px;align-items:center">
      <label class="muted" style="font-size:12px">Centro:</label>
      <select data-cf><option value="">(todos)</option>${centros.map(c => `<option value="${esc(c)}">${esc(c)}</option>`).join('')}</select>
      <input class="mff" data-csearch placeholder="🔎 filtrar cliente / destinatario…">
    </div>
    <div class="tablecard"><div class="tbl"><table>
      <thead><tr><th>Cliente</th><th>Centro</th><th class="num">Cantidad</th><th class="num">Importe</th></tr></thead>
      <tbody>${rowsHtml || '<tr><td colspan="4" class="muted" style="padding:14px;text-align:center">Sin facturación ese mes.</td></tr>'}</tbody>
    </table></div></div>`);
  const cf = document.querySelector('#modal [data-cf]'), cs = document.querySelector('#modal [data-csearch]');
  const apply = () => {
    const v = cf ? cf.value : '', q = norm(cs ? cs.value : '').toLowerCase();
    document.querySelectorAll('#modal tbody tr[data-centro]').forEach(tr => {
      const okC = !v || tr.dataset.centro === v, okQ = !q || tr.textContent.toLowerCase().includes(q);
      tr.style.display = (okC && okQ) ? '' : 'none';
    });
  };
  if (cf) cf.onchange = apply;
  if (cs) cs.oninput = apply;
  document.querySelectorAll('#modal tr[data-dest]').forEach(tr => tr.addEventListener('click', () => { if (window.__openDestEvol) window.__openDestEvol(tr.dataset.dest); }));
}
window.__navBack = navBack;
window.__navTo = navTo;
window.closeModal = closeModal; // para el botón × inline

/* pill de estado/tendencia */
export const pill = (label, cls) => `<span class="pill ${cls}">${esc(label)}</span>`;
export const trendPct = st => {
  if (!st || st.key === 'nada') return `<span class="tnd flat">→ s/d</span>`;
  if (st.key === 'flat') return `<span class="tnd flat">→ ${st.pct > 0 ? '+' : ''}${st.pct.toFixed(0)}%</span>`;
  const ar = st.key === 'up' ? '▲' : '▼';
  return `<span class="tnd ${st.key}">${ar} ${st.pct > 0 ? '+' : ''}${st.pct.toFixed(0)}%</span>`;
};

/* tendencia como texto con flecha y color */
export function trendText(t) {
  if (!t) return '<span class="tnd flat">· Sin datos</span>';
  const ar = t.dir === 'up' ? '↑' : t.dir === 'down' ? '↓' : t.dir === 'flat' && t.txt !== 'Sin datos' ? '→' : '·';
  return `<span class="tnd ${t.dir}">${ar} ${esc(t.txt)}</span>`;
}

/* comparativa mes vs año anterior + Q vs año anterior */
export function comparativaHTML(cmp) {
  const pct = (a, b) => b > 0 ? (a - b) / b * 100 : (a > 0 ? 100 : 0);
  const pctTxt = p => `<span class="tnd ${p > 1 ? 'up' : p < -1 ? 'down' : 'flat'}">${p > 0 ? '+' : ''}${p.toFixed(0)}%</span>`;
  const box = (t, imp, cant) => `<div class="b"><div class="t">${t}</div><div class="m"><span class="cu cu-imp">${money(imp)}</span><span class="cu cu-pz" style="display:none">${fmt(cant)} pzs</span></div></div>`;
  const vbox = (t, pi, pc) => `<div class="b"><div class="t">${t}</div><div class="m"><span class="cu cu-imp">${pctTxt(pi)}</span><span class="cu cu-pz" style="display:none">${pctTxt(pc)}</span></div></div>`;
  return `<div class="cmpcard">
    <div class="cmptoggle"><button class="seg on" onclick="__cmpMode(this,'imp')">💵 Importe</button><button class="seg" onclick="__cmpMode(this,'pz')">📦 Piezas</button></div>
    <div class="consu">
      ${box(esc(cmp.mesActLbl) + ' (mes actual)', cmp.mesAct.imp, cmp.mesAct.cant)}
      ${box(esc(cmp.mesAntLbl) + ' (año anterior)', cmp.mesAnt.imp, cmp.mesAnt.cant)}
      ${vbox('Variación mes', cmp.mesPct, pct(cmp.mesAct.cant, cmp.mesAnt.cant))}
    </div>
    <div class="consu" style="margin-top:8px">
      ${box('Q' + cmp.q + ' ' + cmp.cy + ' (actual)', cmp.qAct.imp, cmp.qAct.cant)}
      ${box('Q' + cmp.q + ' ' + (cmp.cy - 1) + ' (año anterior)', cmp.qAnt.imp, cmp.qAnt.cant)}
      ${vbox('Variación Q', cmp.qPct, pct(cmp.qAct.cant, cmp.qAnt.cant))}
    </div>
  </div>`;
}
window.__cmpMode = (btn, mode) => {
  const card = btn.closest('.cmpcard'); if (!card) return;
  card.querySelectorAll('.cmptoggle .seg').forEach(b => b.classList.remove('on')); btn.classList.add('on');
  card.querySelectorAll('.cu-imp').forEach(e => e.style.display = mode === 'imp' ? '' : 'none');
  card.querySelectorAll('.cu-pz').forEach(e => e.style.display = mode === 'pz' ? '' : 'none');
};

/* Comparativo con selector de periodo: corriente (hoy) vs periodo anterior (mes/Q previos).
   Usar en lugar de comparativaHTML(comparativa(serie)) para que el usuario alterne. */
export function comparativaDualHTML(serie) {
  const hoy = hoyMes(), prev = mesAnterior(hoy);
  const qOf = m => { const [mm, yy] = String(m).split('/').map(Number); return 'Q' + (Math.floor((mm - 1) / 3) + 1) + ' ' + yy; };
  return `<div class="cmpdual">
    <div class="cmptoggle" style="margin-bottom:8px"><button class="seg on" onclick="__cmpPer(this,'cur')">📅 Periodo corriente (${esc(mesLabel(hoy))} · ${esc(qOf(hoy))})</button><button class="seg" onclick="__cmpPer(this,'prev')">Periodo anterior (${esc(mesLabel(prev))} · ${esc(qOf(prev))})</button></div>
    <div data-per="cur">${comparativaHTML(comparativa(serie, hoy))}</div>
    <div data-per="prev" style="display:none">${comparativaHTML(comparativa(serie, prev))}</div>
  </div>`;
}
window.__cmpPer = (btn, per) => {
  const w = btn.closest('.cmpdual'); if (!w) return;
  btn.parentElement.querySelectorAll('.seg').forEach(b => b.classList.remove('on')); btn.classList.add('on');
  w.querySelectorAll('[data-per]').forEach(p => { p.style.display = p.dataset.per === per ? '' : 'none'; });
};

/* tabla de materiales facturados a un solic/dest, con su tendencia */
export function materialesTablaHTML(mats) {
  if (!mats.length) return '<p class="muted">Sin materiales facturados.</p>';
  const rows = mats.map(m => `<tr>
    <td>${esc(m.material)}</td><td>${esc(m.texto)}</td>
    <td>${m.ultimo ? esc(mesLabel(m.ultimo.mes)) : '—'}</td>
    <td class="num">${m.ultimo ? money(m.ultimo.imp) : '—'}</td>
    <td>${trendText(m.tend)}</td></tr>`).join('');
  return `<div class="tbl" style="max-height:260px"><table><thead><tr><th>Material</th><th>Descripción</th><th>Último mes</th><th class="num">Importe</th><th>Tendencia</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/* línea mensual importe + cantidad */
export function drawSerie(canvasId, serie, label, monthRange, onMonthClick) {
  const cv = document.getElementById(canvasId); if (!cv) return;
  const data = completarSerie(serie || [], monthRange);
  destroyChart(canvasId);
  if (!data.length) { cv.parentElement.innerHTML = '<p class="muted">Sin facturación para graficar.</p>'; return; }
  charts[canvasId] = new Chart(cv, {
    type: 'line',
    data: { labels: data.map(d => mesLabel(d.mes)), datasets: [
      { label: 'Importe',  data: data.map(d => d.imp),  borderColor: '#4da3ff', backgroundColor: '#4da3ff22', fill: true, tension: .25, yAxisID: 'y'  },
      { label: 'Cantidad', data: data.map(d => d.cant), borderColor: '#a371f7', backgroundColor: '#a371f700', tension: .25, yAxisID: 'y1' },
    ]},
    options: {
      responsive: true, maintainAspectRatio: false, interaction: { mode: 'index', intersect: false },
      onClick: onMonthClick ? (evt, els, chart) => {
        let idx = els && els.length ? els[0].index : null;
        if (idx == null) { const pts = chart.getElementsAtEventForMode(evt, 'index', { intersect: false }, false); if (pts && pts.length) idx = pts[0].index; }
        if (idx != null && data[idx]) onMonthClick(data[idx].mes);
      } : undefined,
      onHover: onMonthClick ? (e, els) => { e.native.target.style.cursor = els && els.length ? 'pointer' : 'default'; } : undefined,
      plugins: {
        legend: { labels: { color: '#e6edf3' } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + (c.dataset.label === 'Importe' ? money(c.parsed.y) : fmt(c.parsed.y)) + (onMonthClick ? '  · clic para ver clientes' : '') } },
      },
      scales: {
        x:  { ticks: { color: '#8b98a8' }, grid: { color: '#232c39' } },
        y:  { position: 'left',  ticks: { color: '#4da3ff', callback: v => '$' + (v / 1000).toFixed(0) + 'k' }, grid: { color: '#232c39' } },
        y1: { position: 'right', ticks: { color: '#a371f7' }, grid: { drawOnChartArea: false } },
      },
    },
  });
}

/* tabla de detalle por mes (reutilizable) */
export function serieTabla(serie) {
  if (!serie || !serie.length) return '<p class="muted">Sin datos.</p>';
  const r = [...serie].reverse().map(s =>
    `<tr><td>${esc(s.mes)}</td><td class="num">${fmt(s.cant)}</td><td class="num">${money(s.imp)}</td></tr>`).join('');
  return `<div class="tbl" style="max-height:240px"><table><thead><tr><th>Mes</th><th class="num">Cantidad</th><th class="num">Importe</th></tr></thead><tbody>${r}</tbody></table></div>`;
}

/* grid de inventario por almacén a partir de pares [etiqueta, valor] */
export function invGrid(pairs) {
  return `<div class="invgrid">${pairs.map(([c, v]) =>
    `<div class="invbox"><div class="c">${esc(c)}</div><div class="n">${fmt(v)}</div></div>`).join('')}</div>`;
}

/* ranking compacto: items = [{code, desc, val}] */
export function rankingHTML(items, { title = 'Ranking', money: asMoney = false } = {}) {
  const max = Math.max(1, ...items.map(i => i.val));
  const rows = items.map((i, idx) => `
    <div class="rkrow">
      <span class="rknum">${idx + 1}</span>
      <span class="rklbl"><b>${esc(i.code)}</b> <span class="muted">${esc(i.desc || '')}</span></span>
      <span class="rkbar"><span style="width:${Math.max(4, i.val / max * 100)}%"></span></span>
      <span class="rkval">${asMoney ? money(i.val) : fmt(i.val)}</span>
    </div>`).join('');
  return `<div class="ranking"><h3>${esc(title)}</h3>${rows || '<p class="muted" style="padding:8px">Sin datos.</p>'}</div>`;
}
