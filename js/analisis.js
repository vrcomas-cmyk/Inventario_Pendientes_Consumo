/* ===========================================================================
   analisis.js · pestaña "📈 Análisis" — inteligencia comercial para ventas.
   Todo se calcula sobre las series mensuales de facturación (Resumen_Fac):
   riesgo de abandono, crecimiento/caída por cliente y material, concentración
   de cartera y oportunidades accionables desde Sugerencias.
   =========================================================================== */
import { norm, num, fmt, money, esc, mesKey } from './utils.js';
import { store, C } from './store.js';
import { hoyMes, mesAnterior, serieMaterial } from './resumenFac.js';
import { drawSerie, pill, comparativaDualHTML, openModal, closeModal, navOpen, backBtn } from './ui.js';
import { grupoCliente, ejecutivoNombre, matSector, matGrupo } from './enrich.js';

/* --------- helpers de periodo --------- */
const refK = () => mesKey(mesAnterior(hoyMes()));            // último mes COMPLETO
const sumRange = (serie, kIni, kFin) => {                     // suma imp en [kIni..kFin]
  let t = 0; for (const s of serie || []) { const k = mesKey(s.mes); if (k >= kIni && k <= kFin) t += s.imp; } return t;
};
const lastBuyK = serie => { let mx = 0; for (const s of serie || []) if (s.imp > 0) { const k = mesKey(s.mes); if (k > mx) mx = k; } return mx; };
const kToLbl = k => { const y = Math.floor((k - 1) / 12), m = ((k - 1) % 12) + 1; return String(m).padStart(2, '0') + '/' + y; };

/* --------- cálculo principal --------- */
export function analisisVentas() {
  if (!store.RF) return null;
  const R = refK();
  const hoyK = mesKey(hoyMes());
  const a3 = s => sumRange(s, R - 2, R), p3 = s => sumRange(s, R - 5, R - 3);
  const imp12 = s => sumRange(s, R - 11, R);

  /* serie total (para KPIs y gráfica global) */
  const tot = new Map();
  store.RF.mat.forEach(serie => serie.forEach(x => { const k = mesKey(x.mes); const o = tot.get(k) || { cant: 0, imp: 0 }; o.cant += x.cant; o.imp += x.imp; tot.set(k, o); }));
  const serieTotal = [...tot.entries()].sort((a, b) => a[0] - b[0]).map(([k, v]) => ({ mes: kToLbl(k), cant: v.cant, imp: v.imp }));

  /* clientes: crecimiento, caída y riesgo de abandono */
  const ejecDe = c => ejecutivoNombre(store.RF.solicGpoV.get(c) || '') || '';
  const grupoDe = c => grupoCliente(store.RF.solicGpoC.get(c) || '') || (store.RF.solicGpoC.get(c) || '');
  const clientes = [];
  store.RF.solic.forEach((serie, s) => {
    const i12 = imp12(serie); const last = lastBuyK(serie);
    if (!i12 && !last) return;
    const compras = (serie || []).filter(x => x.imp > 0).length;
    clientes.push({ code: s, razon: store.RF.solicRazon.get(s) || '', ejec: ejecDe(s), grupo: grupoDe(s),
      i12, a3: a3(serie), p3: p3(serie), last, compras, sinComprar: last ? (hoyK - last) : 999 });
  });
  const conBase = clientes.filter(c => c.p3 > 0 || c.a3 > 0);
  const crecen = conBase.filter(c => c.a3 > c.p3 * 1.15).sort((a, b) => (b.a3 - b.p3) - (a.a3 - a.p3)).slice(0, 12);
  const caen   = conBase.filter(c => c.p3 > 0 && c.a3 < c.p3 * 0.85).sort((a, b) => (b.p3 - b.a3) - (a.p3 - a.a3)).slice(0, 12);
  const riesgo = clientes.filter(c => c.compras >= 3 && c.sinComprar >= 3 && c.sinComprar <= 24)
    .map(c => ({ ...c, base: sumRange(store.RF.solic.get(c.code), c.last - 11, c.last) }))
    .sort((a, b) => b.base - a.base).slice(0, 12);

  /* materiales: crecimiento / caída */
  const mats = [];
  store.RF.mat.forEach((serie, m) => { const A = a3(serie), P = p3(serie); if (A || P) mats.push({ code: m, texto: store.RF.matTexto.get(m) || '', a3: A, p3: P, i12: imp12(serie) }); });
  const matSuben = mats.filter(x => x.a3 > x.p3 * 1.15).sort((a, b) => (b.a3 - b.p3) - (a.a3 - a.p3)).slice(0, 12);
  const matCaen  = mats.filter(x => x.p3 > 0 && x.a3 < x.p3 * 0.85).sort((a, b) => (b.p3 - b.a3) - (a.p3 - a.a3)).slice(0, 12);

  /* sectores y grupos de artículo (vía enriquecimiento) */
  const secMap = new Map();   // sector -> {a3,p3,i12, grupos: Map(grupo->{a3,p3,i12})}
  store.RF.mat.forEach((serie, m) => {
    const A = a3(serie), P = p3(serie), I = imp12(serie); if (!A && !P && !I) return;
    const sec = matSector(m) || '(sin sector)'; const gru = matGrupo(m) || '(sin grupo)';
    let so = secMap.get(sec); if (!so) { so = { sector: sec, a3: 0, p3: 0, i12: 0, grupos: new Map() }; secMap.set(sec, so); }
    so.a3 += A; so.p3 += P; so.i12 += I;
    let go = so.grupos.get(gru); if (!go) { go = { grupo: gru, a3: 0, p3: 0, i12: 0 }; so.grupos.set(gru, go); }
    go.a3 += A; go.p3 += P; go.i12 += I;
  });
  const sectores = [...secMap.values()].filter(s => s.i12 > 0).sort((a, b) => b.i12 - a.i12);

  /* concentración de cartera (12m) */
  const ordered = clientes.filter(c => c.i12 > 0).sort((a, b) => b.i12 - a.i12);
  const total12 = ordered.reduce((a, c) => a + c.i12, 0);
  const share = n => total12 ? ordered.slice(0, n).reduce((a, c) => a + c.i12, 0) / total12 : 0;

  /* oportunidades desde Sugerencias (pendiente surtible = tiene fuentes) */
  let opTotal = 0, opConFuente = 0, opBloq = 0; const opTop = [];
  (store.BO || []).forEach(it => {
    const b = it.bo; const impPend = num(b[C.pend]) * num(b[C.precio]);
    opTotal += impPend;
    if (norm(b[C.bloq])) opBloq += impPend;
    if (it.fuentes && it.fuentes.length) { opConFuente += impPend; opTop.push({ pedido: norm(b[C.pedido]), razon: norm(b[C.razon]), imp: impPend, mat: norm(b[C.matBase]) }); }
  });
  opTop.sort((a, b) => b.imp - a.imp);

  /* KPIs */
  const mesPrevImp = sumRange(serieTotal, R, R), mesPrevAnt = sumRange(serieTotal, R - 12, R - 12);
  const q0 = Math.floor(((hoyK - 1) % 12) / 3) * 3 + 1 + Math.floor((hoyK - 1) / 12) * 12; // inicio Q corriente en clave
  const qImp = sumRange(serieTotal, q0, hoyK), qAnt = sumRange(serieTotal, q0 - 12, hoyK - 12);
  const activos3m = clientes.filter(c => c.sinComprar <= 3).length;

  return { serieTotal, crecen, caen, riesgo, matSuben, matCaen, sectores,
    conc: { top5: share(5), top10: share(10), total12, nClientes: ordered.length },
    ops: { total: opTotal, conFuente: opConFuente, bloq: opBloq, top: opTop.slice(0, 10) },
    kpi: { mesPrevImp, mesPrevAnt, qImp, qAnt, activos3m, refLbl: mesAnterior(hoyMes()) } };
}

/* --------- render --------- */
const dPct = (a, b) => b ? ((a / b - 1) * 100) : (a ? 100 : 0);
const pctTxt = p => `<span class="tnd ${p >= 0 ? 'up' : 'down'}">${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}%</span>`;

function tablaClientes(list, title, hint, kind) {
  const rows = list.map(c => `<tr class="click" data-ana-solic="${esc(c.code)}">
    <td>${esc(c.razon) || '—'}<div class="sub">Solic ${esc(c.code)}</div>
        <div class="sub">👤 ${esc(c.ejec) || '—'}</div><div class="sub">🏷️ ${esc(c.grupo) || '—'}</div></td>
    <td class="num">${money(kind === 'riesgo' ? c.base : c.p3)}</td>
    <td class="num">${money(kind === 'riesgo' ? 0 : c.a3)}</td>
    <td>${kind === 'riesgo' ? `<span class="pill amb">${c.sinComprar} meses sin comprar</span><div class="sub">últ. compra ${kToLbl(c.last)}</div>` : pctTxt(dPct(c.a3, c.p3))}</td></tr>`).join('');
  return `<div class="tablecard"><h3>${title} <span class="hint">${hint}</span></h3>
    <div class="tbl"><table><thead><tr><th>Cliente · Ejecutivo · Grupo</th><th class="num">${kind === 'riesgo' ? 'Imp. 12m (base)' : '3m previos'}</th><th class="num">${kind === 'riesgo' ? '—' : 'Últ. 3m'}</th><th>${kind === 'riesgo' ? 'Situación' : 'Variación'}</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" class="muted" style="text-align:center;padding:10px">Sin registros.</td></tr>`}</tbody></table></div></div>`;
}
function tablaMats(list, title, hint) {
  const rows = list.map(m => `<tr class="click" data-ana-mat="${esc(m.code)}">
    <td><span class="lnk">${esc(m.code)}</span><div class="sub">${esc(m.texto) || '—'}</div></td>
    <td class="num">${money(m.p3)}</td><td class="num">${money(m.a3)}</td><td>${pctTxt(dPct(m.a3, m.p3))}</td></tr>`).join('');
  return `<div class="tablecard"><h3>${title} <span class="hint">${hint}</span></h3>
    <div class="tbl"><table><thead><tr><th>Material · Descripción</th><th class="num">3m previos</th><th class="num">Últ. 3m</th><th>Variación</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="4" class="muted" style="text-align:center;padding:10px">Sin registros.</td></tr>`}</tbody></table></div></div>`;
}
function tablaSectores(list) {
  const rows = list.map(s => `<tr class="click" data-ana-sec="${esc(s.sector)}">
    <td><span class="lnk">${esc(s.sector)}</span><div class="sub">${s.grupos.size} grupo(s) de artículo</div></td>
    <td class="num">${money(s.p3)}</td><td class="num">${money(s.a3)}</td><td class="num">${money(s.i12)}</td><td>${pctTxt(dPct(s.a3, s.p3))}</td></tr>`).join('');
  return `<div class="tablecard"><h3>🧭 Sectores — alza / baja <span class="hint">clic para ver el detalle por grupo de artículo</span></h3>
    <div class="tbl"><table><thead><tr><th>Sector</th><th class="num">3m previos</th><th class="num">Últ. 3m</th><th class="num">Imp. 12m</th><th>Variación</th></tr></thead>
    <tbody>${rows || `<tr><td colspan="5" class="muted" style="text-align:center;padding:10px">Sin sector (revisa enriquecimiento).</td></tr>`}</tbody></table></div></div>`;
}

export function renderAnalisis(container) {
  const A = analisisVentas();
  if (!A) { container.innerHTML = '<div class="empty"><p>Para el análisis carga (o espera a que sincronice) el archivo <b>Resumen_Fac</b>.</p></div>'; return; }
  const k = A.kpi;
  container.innerHTML = `
    <div class="kpis">
      <div class="kpi"><div class="l">Facturación ${esc(k.refLbl)} (último mes completo)</div><div class="v">${money(k.mesPrevImp)}</div><div class="sub">${pctTxt(dPct(k.mesPrevImp, k.mesPrevAnt))} vs año anterior</div></div>
      <div class="kpi"><div class="l">Q corriente (a la fecha)</div><div class="v">${money(k.qImp)}</div><div class="sub">${pctTxt(dPct(k.qImp, k.qAnt))} vs mismo periodo año ant.</div></div>
      <div class="kpi"><div class="l">Clientes activos (≤3 meses)</div><div class="v">${fmt(k.activos3m)}</div><div class="sub">de ${fmt(A.conc.nClientes)} con compra en 12m</div></div>
      <div class="kpi"><div class="l">Concentración cartera 12m</div><div class="v">${(A.conc.top5 * 100).toFixed(0)}% top 5</div><div class="sub">${(A.conc.top10 * 100).toFixed(0)}% top 10 · total ${money(A.conc.total12)}</div></div>
    </div>

    <div class="tablecard"><h3>📈 Facturación mensual total <span class="hint">todos los materiales</span></h3>
      <div class="chartbox" style="height:230px;padding:10px"><canvas id="cAnaTot"></canvas></div>
      ${comparativaDualHTML(A.serieTotal)}
    </div>

    <div class="tablecard"><h3>💰 Oportunidades en Sugerencias <span class="hint">pendiente × precio</span></h3>
      <div class="kpis" style="margin:0 0 8px">
        <div class="kpi"><div class="l">Importe pendiente total</div><div class="v">${money(A.ops.total)}</div></div>
        <div class="kpi"><div class="l">Surtible (con fuentes de inventario)</div><div class="v">${money(A.ops.conFuente)}</div></div>
        <div class="kpi"><div class="l">Detenido por bloqueo</div><div class="v">${money(A.ops.bloq)}</div></div>
      </div>
      <div class="tbl"><table><thead><tr><th>Pedido</th><th>Cliente</th><th>Material</th><th class="num">Importe pendiente</th></tr></thead>
      <tbody>${A.ops.top.map(o => `<tr class="click" data-ana-ped="${esc(o.pedido)}"><td><span class="lnk">${esc(o.pedido)}</span></td><td>${esc(o.razon)}</td><td>${esc(o.mat)}</td><td class="num">${money(o.imp)}</td></tr>`).join('') || '<tr><td colspan="4" class="muted" style="text-align:center;padding:10px">Sin sugerencias cargadas.</td></tr>'}</tbody></table></div></div>

    ${tablaSectores(A.sectores)}
    ${tablaClientes(A.riesgo, '🚨 Clientes en riesgo de abandono', 'compraban y llevan ≥3 meses sin hacerlo — priorizados por su facturación previa', 'riesgo')}
    ${tablaClientes(A.caen, '📉 Clientes a la baja', 'últimos 3 meses completos vs los 3 anteriores', 'var')}
    ${tablaClientes(A.crecen, '🚀 Clientes en crecimiento', 'últimos 3 meses completos vs los 3 anteriores', 'var')}
    ${tablaMats(A.matCaen, '📦📉 Materiales a la baja', 'para revisar precio/cobertura', )}
    ${tablaMats(A.matSuben, '📦🚀 Materiales en crecimiento', 'para asegurar inventario', )}
  `;
  if (document.getElementById('cAnaTot')) drawSerie('cAnaTot', A.serieTotal, 'Importe facturado');
  container.querySelectorAll('[data-ana-solic]').forEach(el => el.addEventListener('click', () => window.__openSolicEvol && window.__openSolicEvol(el.dataset.anaSolic)));
  container.querySelectorAll('[data-ana-mat]').forEach(el => el.addEventListener('click', () => window.__openMaterialInv && window.__openMaterialInv(el.dataset.anaMat)));
  container.querySelectorAll('[data-ana-ped]').forEach(el => el.addEventListener('click', () => window.__openPedidoG && window.__openPedidoG(el.dataset.anaPed)));
  container.querySelectorAll('[data-ana-sec]').forEach(el => el.addEventListener('click', () => openSectorDetalle(el.dataset.anaSec)));
}

/* Detalle de un sector: grupos de artículo con su alza/baja. */
function openSectorDetalle(sector) {
  const A = analisisVentas(); if (!A) return;
  const so = A.sectores.find(s => s.sector === sector); if (!so) return;
  const grupos = [...so.grupos.values()].sort((a, b) => b.i12 - a.i12);
  const rows = grupos.map(g => `<tr><td>${esc(g.grupo)}</td><td class="num">${money(g.p3)}</td><td class="num">${money(g.a3)}</td><td class="num">${money(g.i12)}</td><td>${pctTxt(dPct(g.a3, g.p3))}</td></tr>`).join('');
  navOpen(() => openModal(`
    <button class="x" onclick="closeModal()">×</button>
    ${backBtn()}
    <div class="detail-head">🧭 Detalle del sector · <b>${esc(sector)}</b></div>
    <p class="muted">Grupos de artículo del sector · alza/baja (últimos 3 meses completos vs los 3 anteriores) · importe 12 meses.</p>
    <div class="kpis" style="margin:0 0 10px">
      <div class="kpi"><div class="l">Últ. 3 meses</div><div class="v">${money(so.a3)}</div><div class="sub">${pctTxt(dPct(so.a3, so.p3))} vs 3m previos</div></div>
      <div class="kpi"><div class="l">Importe 12 meses</div><div class="v">${money(so.i12)}</div></div>
      <div class="kpi"><div class="l">Grupos de artículo</div><div class="v">${so.grupos.size}</div></div>
    </div>
    <div class="tbl"><table><thead><tr><th>Grupo de artículo</th><th class="num">3m previos</th><th class="num">Últ. 3m</th><th class="num">Imp. 12m</th><th>Variación</th></tr></thead><tbody>${rows}</tbody></table></div>`));
}
