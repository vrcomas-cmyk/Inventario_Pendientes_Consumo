/* ===========================================================================
   ui.js · modal, gráficas y pequeños renderers compartidos
   =========================================================================== */
import { esc, fmt, money } from './utils.js';
import { mesLabel, completarSerie } from './resumenFac.js';

let chartRef = null;
const charts = {};

export function openModal(html) {
  document.querySelector('#modal').innerHTML = html;
  document.querySelector('#ov').classList.add('show');
}
export function closeModal() {
  document.querySelector('#ov').classList.remove('show');
  ['cD', 'cG', 'cC'].forEach(destroyChart);     // gráficas de modal
}
export function destroyChart(id) { if (charts[id]) { try { charts[id].destroy(); } catch (e) {} delete charts[id]; } }
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
  const pctTxt = p => `<span class="tnd ${p > 1 ? 'up' : p < -1 ? 'down' : 'flat'}">${p > 0 ? '+' : ''}${p.toFixed(0)}%</span>`;
  return `<div class="consu">
    <div class="b"><div class="t">${esc(cmp.mesActLbl)} (mes actual)</div><div class="m">${money(cmp.mesAct.imp)}</div><div class="muted" style="font-size:11px">${fmt(cmp.mesAct.cant)} pzs</div></div>
    <div class="b"><div class="t">${esc(cmp.mesAntLbl)} (año anterior)</div><div class="m">${money(cmp.mesAnt.imp)}</div><div class="muted" style="font-size:11px">${fmt(cmp.mesAnt.cant)} pzs</div></div>
    <div class="b"><div class="t">Variación mes</div><div class="m">${pctTxt(cmp.mesPct)}</div></div>
  </div>
  <div class="consu" style="margin-top:8px">
    <div class="b"><div class="t">Q${cmp.q} ${cmp.cy} (actual)</div><div class="m">${money(cmp.qAct.imp)}</div><div class="muted" style="font-size:11px">${fmt(cmp.qAct.cant)} pzs</div></div>
    <div class="b"><div class="t">Q${cmp.q} ${cmp.cy - 1} (año anterior)</div><div class="m">${money(cmp.qAnt.imp)}</div><div class="muted" style="font-size:11px">${fmt(cmp.qAnt.cant)} pzs</div></div>
    <div class="b"><div class="t">Variación Q</div><div class="m">${pctTxt(cmp.qPct)}</div></div>
  </div>`;
}

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
export function drawSerie(canvasId, serie, label) {
  const cv = document.getElementById(canvasId); if (!cv) return;
  const data = completarSerie(serie || []);
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
      plugins: {
        legend: { labels: { color: '#e6edf3' } },
        tooltip: { callbacks: { label: c => c.dataset.label + ': ' + (c.dataset.label === 'Importe' ? money(c.parsed.y) : fmt(c.parsed.y)) } },
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
