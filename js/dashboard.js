/* ===========================================================================
   dashboard.js · 🏠 Inicio — resumen ejecutivo al abrir el portal.
   Reutiliza los cálculos existentes (analisisVentas, rssStore, BO) sin
   duplicar lógica de negocio. Degrada con elegancia si faltan datos.
   =========================================================================== */
import { norm, num, fmt, money, esc, mesKey } from './utils.js';
import { store, C } from './store.js';
import { drawSerie } from './ui.js';
import { rssReady, rssMats, rssLentoMaterial } from './rssStore.js';

const kpi = (label, value, sub = '', tone = '') => `
  <div class="kpi ${tone}"><div class="l">${label}</div><div class="v">${value}</div>${sub ? `<div class="sub">${sub}</div>` : ''}</div>`;

export async function renderDashboard(container) {
  // análisis (facturación) es opcional: puede no haber Resumen_Fac aún
  let A = null;
  try { const m = await import('./analisis.js'); A = m.analisisVentas(); } catch (e) {}

  /* --- sugerencias / oportunidades --- */
  const bo = store.BO || [];
  let pendImp = 0, pendPz = 0, bloqImp = 0, surtible = 0;
  bo.forEach(it => { const b = it.bo; const imp = num(b[C.pend]) * num(b[C.precio]);
    pendImp += imp; pendPz += num(b[C.pend]);
    if (norm(b[C.bloq])) bloqImp += imp;
    if (it.fuentes && it.fuentes.length) surtible += imp; });

  /* --- inventario / RSS: materiales, sin movimiento, pendientes --- */
  let mats = 0, lentos = 0, matsPend = 0;
  if (rssReady()) {
    const M = rssMats(); mats = M.size;
    M.forEach((mo, key) => {
      let pend = 0; mo.centros.forEach(co => co.alm.forEach(a => { pend += a.pend || 0; }));
      if (pend > 0) matsPend++;
      if (rssLentoMaterial(key)) lentos++;
    });
  }

  const hayDatos = !!(A || bo.length || mats);
  container.innerHTML = `
    <div class="detail-head">🏠 Inicio</div>
    ${!hayDatos ? `<div class="empty"><p>Aún no hay datos cargados. ${'Sube los reportes desde “📂 Cargar archivo” o espera la sincronización.'}</p></div>` : `
    <div class="kpis">
      ${A ? kpi('Facturación ' + esc(A.kpi.refLbl), money(A.kpi.mesPrevImp), (A.kpi.mesPrevAnt ? ((A.kpi.mesPrevImp / A.kpi.mesPrevAnt - 1) * 100).toFixed(1) + '% vs año ant.' : '')) : ''}
      ${A ? kpi('Q corriente (a la fecha)', money(A.kpi.qImp), A.kpi.qAnt ? ((A.kpi.qImp / A.kpi.qAnt - 1) * 100).toFixed(1) + '% vs año ant.' : '') : ''}
      ${bo.length ? kpi('Pendiente en sugerencias', money(pendImp), fmt(pendPz) + ' pzas · ' + fmt(bo.length) + ' líneas') : ''}
      ${bo.length ? kpi('Surtible (con fuentes)', money(surtible), bloqImp ? money(bloqImp) + ' bloqueado' : '', 'ok') : ''}
      ${mats ? kpi('Materiales en RSS', fmt(mats), fmt(matsPend) + ' con pendiente') : ''}
      ${mats ? kpi('Sin movimiento ⚠️', fmt(lentos), '≥6 meses sin facturar', lentos ? 'warn' : '') : ''}
      ${A ? kpi('Clientes activos', fmt(A.kpi.activos3m), 'compra en ≤3 meses') : ''}
      ${A ? kpi('Riesgo de abandono', fmt(A.riesgo.length), 'clientes por recuperar', A.riesgo.length ? 'warn' : '') : ''}
    </div>

    ${A ? `<div class="tablecard"><h3>📈 Facturación mensual</h3><div class="chartbox" style="height:210px;padding:10px"><canvas id="cDash"></canvas></div></div>` : ''}

    <div class="dashgrid">
      ${A && A.riesgo.length ? `<div class="tablecard"><h3>🚨 Recuperar primero <span class="hint">clientes en riesgo</span></h3>
        <div class="tbl"><table><tbody>${A.riesgo.slice(0, 5).map(c => `<tr class="click" data-dash-solic="${esc(c.code)}"><td>${esc(c.razon)}<div class="sub">👤 ${esc(c.ejec) || '—'}</div></td><td class="num">${money(c.base)}</td><td><span class="pill amb">${c.sinComprar}m</span></td></tr>`).join('')}</tbody></table></div>
        <div class="qlink" data-go="ana">Ver análisis completo →</div></div>` : ''}
      ${A && A.matCaen.length ? `<div class="tablecard"><h3>📉 Materiales a la baja</h3>
        <div class="tbl"><table><tbody>${A.matCaen.slice(0, 5).map(m => `<tr class="click" data-dash-mat="${esc(m.code)}"><td>${esc(m.code)}<div class="sub">${esc(m.texto)}</div></td><td class="num">${money(m.a3)}</td></tr>`).join('')}</tbody></table></div>
        <div class="qlink" data-go="ana">Ver análisis completo →</div></div>` : ''}
      ${bo.length ? `<div class="tablecard"><h3>💰 Top pendiente por surtir</h3>
        <div class="tbl"><table><tbody>${bo.map(it => ({ it, imp: num(it.bo[C.pend]) * num(it.bo[C.precio]) })).sort((a, b) => b.imp - a.imp).slice(0, 5).map(x => `<tr class="click" data-dash-ped="${esc(x.it.bo[C.pedido])}"><td>${esc(x.it.bo[C.razon])}<div class="sub">${esc(x.it.bo[C.matBase])} · Pedido ${esc(x.it.bo[C.pedido])}</div></td><td class="num">${money(x.imp)}</td></tr>`).join('')}</tbody></table></div>
        <div class="qlink" data-go="sug">Ir a Sugerencias →</div></div>` : ''}
    </div>`}
  `;

  if (A && document.getElementById('cDash')) drawSerie('cDash', A.serieTotal, 'Importe facturado');
  container.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', () => window.__goTab && window.__goTab(el.dataset.go)));
  container.querySelectorAll('[data-dash-solic]').forEach(el => el.addEventListener('click', () => window.__openSolicEvol && window.__openSolicEvol(el.dataset.dashSolic)));
  container.querySelectorAll('[data-dash-mat]').forEach(el => el.addEventListener('click', () => window.__openMaterialInv && window.__openMaterialInv(el.dataset.dashMat)));
  container.querySelectorAll('[data-dash-ped]').forEach(el => el.addEventListener('click', () => window.__openPedidoG && window.__openPedidoG(el.dataset.dashPed)));
}
