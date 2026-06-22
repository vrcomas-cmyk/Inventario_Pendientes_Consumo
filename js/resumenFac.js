/* ===========================================================================
   resumenFac.js · índices de facturación mensual + clasificación de tendencia
   =========================================================================== */
import { norm, num, mesKey } from './utils.js';
import { store, RFC } from './store.js';

/* Construye series mensuales por material+destinatario, por solicitante y por
   destinatario. Devuelve también el mes corriente (máximo presente). */
export function buildRF(rows) {
  const matDest = new Map(), solic = new Map(), dest = new Map();
  const solicMats = new Map(), destMats = new Map(), matTexto = new Map();
  let maxk = 0, maxmes = '';

  const add = (map, key, mes, c, i) => {
    if (!map.has(key)) map.set(key, new Map());
    const mm = map.get(key);
    const cur = mm.get(mes) || { cant: 0, imp: 0 };
    cur.cant += c; cur.imp += i; mm.set(mes, cur);
  };
  const add2 = (map, k1, k2, mes, c, i) => {
    if (!map.has(k1)) map.set(k1, new Map());
    add(map.get(k1), k2, mes, c, i);
  };

  rows.forEach(r => {
    const mes = norm(r[RFC.mes]); if (!mes) return;
    const k = mesKey(mes); if (k > maxk) { maxk = k; maxmes = mes; }
    const c = num(r[RFC.cant]), i = num(r[RFC.imp]);
    const d = norm(r[RFC.dest]), s = norm(r[RFC.solic]), mat = norm(r[RFC.material]);
    add(matDest, d + '||' + mat, mes, c, i);
    add(solic, s, mes, c, i);
    add(dest, d, mes, c, i);
    add2(solicMats, s, mat, mes, c, i);
    add2(destMats, d, mat, mes, c, i);
    if (mat && !matTexto.has(mat)) matTexto.set(mat, norm(r[RFC.texto]));
  });

  const toSerie = mm => [...mm.entries()]
    .map(([mes, v]) => ({ mes, cant: v.cant, imp: v.imp }))
    .sort((a, b) => mesKey(a.mes) - mesKey(b.mes));
  const ser = map => { const o = new Map(); map.forEach((mm, k) => o.set(k, toSerie(mm))); return o; };
  const ser2 = map => { const o = new Map(); map.forEach((inner, k) => o.set(k, ser(inner))); return o; };

  store.CURMES = maxmes;
  return {
    matDest: ser(matDest), solic: ser(solic), dest: ser(dest),
    solicMats: ser2(solicMats), destMats: ser2(destMats), matTexto, curmes: maxmes,
  };
}

/* rankings globales (desde Resumen_Fac) */
export function rankingMaterialesAvg12() {
  if (!store.RF) return [];
  const cur = mesKey(store.CURMES), lo = cur - 11;
  const acc = new Map();
  store.RF.matDest.forEach((serie, key) => {
    const mat = key.split('||')[1];
    let sum = 0; serie.forEach(s => { const k = mesKey(s.mes); if (k >= lo && k <= cur) sum += s.imp; });
    if (sum) acc.set(mat, (acc.get(mat) || 0) + sum);
  });
  return [...acc.entries()].map(([mat, sum]) => ({ code: mat, desc: (store.RF.matTexto.get(mat) || '').slice(0, 40), val: sum / 12 }))
    .sort((a, b) => b.val - a.val).slice(0, 10);
}
export function rankingSolicitantes() {
  if (!store.RF) return [];
  const acc = [];
  store.RF.solic.forEach((serie, s) => { const sum = serie.reduce((a, x) => a + x.imp, 0); if (sum) acc.push({ code: s, desc: '', val: sum }); });
  return acc.sort((a, b) => b.val - a.val).slice(0, 10);
}

/* materiales facturados a un solicitante / destinatario, con su tendencia */
export function materialesDe(kind, key) {
  if (!store.RF) return [];
  const map = kind === 'solic' ? store.RF.solicMats : store.RF.destMats;
  const inner = map.get(norm(key)); if (!inner) return [];
  return [...inner.entries()].map(([mat, serie]) => ({
    material: mat,
    texto: store.RF.matTexto.get(mat) || '',
    serie,
    ultimo: serie[serie.length - 1],
    tend: tendenciaTexto(serie),
    estado: clasificarEstado(serie, false),
  })).sort((a, b) => (b.ultimo ? mesKey(b.ultimo.mes) : 0) - (a.ultimo ? mesKey(a.ultimo.mes) : 0));
}

/* Tendencia numérica: compara importe del último mes vs el penúltimo. */
export function tendencia(serie) {
  if (!serie || serie.length < 2) return { dir: 'flat', pct: 0 };
  const a = serie[serie.length - 2].imp, b = serie[serie.length - 1].imp;
  if (a <= 0 && b <= 0) return { dir: 'flat', pct: 0 };
  const pct = a > 0 ? (b - a) / a * 100 : 100;
  if (pct >= 5)  return { dir: 'up', pct };
  if (pct <= -5) return { dir: 'down', pct };
  return { dir: 'flat', pct };
}

/* Clasificación pedida (punto 8): Sin compra / En aumento / Cayendo / Estable.
   Se calcula igual desde cualquier serie mensual (sirve para sugerencias y consumo). */
export function statusTrend(serie) {
  if (!serie || !serie.length) return { key: 'nada',  label: 'Sin compra', cls: 'gris', pct: 0 };
  const t = tendencia(serie);
  if (t.dir === 'up')   return { key: 'up',   label: 'En aumento', cls: 'verde', pct: t.pct };
  if (t.dir === 'down') return { key: 'down', label: 'Cayendo',    cls: 'rojo',  pct: t.pct };
  return { key: 'flat', label: 'Estable', cls: 'azul', pct: t.pct };
}

/* Mismo criterio pero a partir de dos cantidades sueltas (Reporte de Consumo,
   que ya trae cantidad última y penúltima). */
export function statusFromPair(ultima, penultima, hayCompra = true) {
  const u = num(ultima), p = num(penultima);
  if (!hayCompra && u === 0 && p === 0) return { key:'nada', label:'Sin compra', cls:'gris', pct:0 };
  if (p <= 0 && u <= 0) return { key:'nada', label:'Sin compra', cls:'gris', pct:0 };
  const pct = p > 0 ? (u - p) / p * 100 : 100;
  if (pct >= 5)  return { key:'up',   label:'En aumento', cls:'verde', pct };
  if (pct <= -5) return { key:'down', label:'Cayendo',    cls:'rojo',  pct };
  return { key:'flat', label:'Estable', cls:'azul', pct };
}

/* ---------------------------------------------------------------------------
   clasificarSerie · estado de negocio: RECENCIA + PERIODICIDAD + volumen.
     Sin compra · En riesgo · Revisar · En aumento · Cayendo · Estable · Recurrente
   --------------------------------------------------------------------------- */
export function clasificarSerie(serie) {
  if (!serie || !serie.length) return { key: 'nada', label: 'Sin compra', cls: 'gris', pct: 0, gap: null };
  const cur = mesKey(store.CURMES);
  const months = serie.map(s => mesKey(s.mes)).filter(Boolean).sort((a, b) => a - b);
  const last = months[months.length - 1];
  const gap = cur ? cur - last : 0;                 // meses desde la última compra

  let typical = 1;                                  // intervalo típico (mediana de huecos)
  if (months.length >= 2) {
    const diffs = [];
    for (let i = 1; i < months.length; i++) diffs.push(months[i] - months[i - 1]);
    diffs.sort((a, b) => a - b);
    typical = diffs[Math.floor(diffs.length / 2)] || 1;
  }

  const t = tendencia(serie);
  if (gap >= Math.max(3, typical + 2)) return { key: 'riesgo',  label: 'En riesgo', cls: 'rojo', pct: t.pct, gap };
  if (gap >= typical + 1 && gap >= 2)  return { key: 'revisar',  label: 'Revisar',   cls: 'amb',  pct: t.pct, gap };
  if (t.dir === 'up')                  return { key: 'up',       label: 'En aumento',cls: 'verde',pct: t.pct, gap };
  if (t.dir === 'down')                return { key: 'down',     label: 'Cayendo',   cls: 'amb',  pct: t.pct, gap };
  if (typical <= 1)                    return { key: 'estable',  label: 'Estable',   cls: 'azul', pct: t.pct, gap };
  return { key: 'recurrente', label: 'Recurrente', cls: 'verde', pct: t.pct, gap };
}

export const ESTADOS = [
  ['nueva','Nueva compra'], ['corriente','Al corriente'], ['reactiva','Reactivación'],
  ['revisar','Revisar'], ['riesgo','En riesgo'], ['sinanio','Sin compra +1 año'], ['nada','Sin compra'],
];

/* días desde la última compra (a partir de la serie mensual mm/aaaa) */
export function diasDesdeUltimo(serie) {
  if (!serie || !serie.length) return null;
  const [mm, yy] = String(serie[serie.length - 1].mes).split('/').map(Number);
  if (!mm || !yy) return null;
  const lastDay = new Date(yy, mm, 0);            // último día de ese mes (lo más reciente posible)
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.floor((today - lastDay) / 86400000));
}

/* ---------------------------------------------------------------------------
   clasificarEstado (definitivo): por DÍAS reales desde la última compra.
   pedido = true si hay un pedido activo (pendiente>0) -> distingue
   "Nueva compra" / "Reactivación" de los inactivos sin pedido.
     Nueva compra · Reactivación · En aumento · Cayendo · Estable
     Revisar (90-150d) · En riesgo (>150d) · Sin compra +1 año (>365d) · Sin compra
   --------------------------------------------------------------------------- */
export function clasificarEstado(serie, pedido = false) {
  const t = tendencia(serie);
  if (!serie || !serie.length)
    return pedido ? { key: 'nueva', label: 'Nueva compra', cls: 'vio', pct: 0 }
                  : { key: 'nada',  label: 'Sin compra',   cls: 'gris', pct: 0 };
  const dias = diasDesdeUltimo(serie);
  if (dias > 365)
    return pedido ? { key: 'reactiva', label: 'Reactivación', cls: 'vio', pct: t.pct, dias }
                  : { key: 'sinanio',  label: 'Sin compra en más de un año', cls: 'gris', pct: t.pct, dias };
  if (serie.length === 1 && dias <= 90) return { key: 'nueva', label: 'Nueva compra', cls: 'vio', pct: t.pct, dias };
  if (dias > 150) return { key: 'riesgo',  label: 'En riesgo', cls: 'rojo', pct: t.pct, dias };
  if (dias >= 90) return { key: 'revisar', label: 'Revisar',   cls: 'amb',  pct: t.pct, dias };
  return { key: 'corriente', label: 'Al corriente', cls: 'verde', pct: t.pct, dias };
}

/* nombres de mes para mostrar mmmm/aaaa */
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

/* rellena los meses sin compra con 0 desde el primer mes hasta el mes corriente
   (para que la gráfica llegue completa hasta hoy) */
export function completarSerie(serie) {
  if (!serie || !serie.length) return serie || [];
  const byMes = new Map(serie.map(s => [s.mes, s]));
  let [mm, yy] = String(serie[0].mes).split('/').map(Number);
  const endK = Math.max(mesKey(serie[serie.length - 1].mes), mesKey(store.CURMES));
  const out = []; let guard = 0;
  while (guard++ < 600) {
    const mes = String(mm).padStart(2, '0') + '/' + yy;
    out.push(byMes.get(mes) || { mes, cant: 0, imp: 0 });
    if (yy * 12 + mm >= endK) break;
    mm++; if (mm > 12) { mm = 1; yy++; }
  }
  return out;
}
export function mesLabel(m) {
  const p = String(m == null ? '' : m).split('/'); if (p.length !== 2) return String(m || '');
  return (MESES[(+p[0]) - 1] || p[0]) + '/' + p[1];
}

/* ---------------------------------------------------------------------------
   tendenciaTexto · dirección CONSIDERANDO EL MES ACTUAL.
   - Si dejó de comprar (gap > ~2 meses) => En decremento, aunque sus dos
     últimas compras subieran (caso feb-2024).
   - Si está comprando: compara los últimos 3 meses (rellenando ceros hasta el
     mes corriente) contra los 3 previos.
   --------------------------------------------------------------------------- */
export function tendenciaTexto(serie) {
  if (!serie || !serie.length) return { dir: 'flat', txt: 'Sin datos' };
  const dias = diasDesdeUltimo(serie);
  if (dias > 60) return { dir: 'down', txt: 'En decremento' };   // dejó de comprar
  const cur = mesKey(store.CURMES);
  const valAt = k => { const f = serie.find(s => mesKey(s.mes) === k); return f ? f.imp : 0; };
  const actual = valAt(cur);
  const avgPrev = (valAt(cur - 1) + valAt(cur - 2) + valAt(cur - 3)) / 3;
  if (avgPrev === 0) return actual > 0 ? { dir: 'up', txt: 'En aumento' } : { dir: 'flat', txt: 'Estable' };
  if (actual > avgPrev * 1.1) return { dir: 'up',   txt: 'En aumento' };
  if (actual < avgPrev * 0.9) return { dir: 'down', txt: 'En decremento' };
  return { dir: 'flat', txt: 'Estable' };
}

/* ---------------------------------------------------------------------------
   comparativa · mes actual vs mismo mes año anterior, y Q actual vs Q año ant.
   --------------------------------------------------------------------------- */
export function comparativa(serie) {
  const list = serie || [];
  const val = (mm, yy) => {
    const key = String(mm).padStart(2, '0') + '/' + yy;
    const f = list.find(s => s.mes === key);
    return f ? { cant: f.cant, imp: f.imp } : { cant: 0, imp: 0 };
  };
  const [cm, cy] = String(store.CURMES).split('/').map(Number);
  const q = Math.floor((cm - 1) / 3);
  const qMonths = [q * 3 + 1, q * 3 + 2, q * 3 + 3];
  const sumQ = yy => qMonths.reduce((a, mm) => { const v = val(mm, yy); return { cant: a.cant + v.cant, imp: a.imp + v.imp }; }, { cant: 0, imp: 0 });
  const pct = (act, ant) => ant > 0 ? (act - ant) / ant * 100 : (act > 0 ? 100 : 0);
  const mesAct = val(cm, cy), mesAnt = val(cm, cy - 1);
  const qAct = sumQ(cy), qAnt = sumQ(cy - 1);
  return {
    cm, cy, q: q + 1,
    mesAct, mesAnt, mesPct: pct(mesAct.imp, mesAnt.imp),
    qAct, qAnt, qPct: pct(qAct.imp, qAnt.imp),
    mesActLbl: mesLabel(String(cm).padStart(2, '0') + '/' + cy),
    mesAntLbl: mesLabel(String(cm).padStart(2, '0') + '/' + (cy - 1)),
  };
}

/* fecha/"mm/aaaa" -> "mm/aaaa" */
export function aMesAnio(v) {
  const s = String(v == null ? '' : v).trim(); if (!s) return '';
  let m = s.match(/^(\d{1,2})\/(\d{4})$/); if (m) return s;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return String(m[2]).padStart(2,'0') + '/' + y; }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return String(m[2]).padStart(2,'0') + '/' + m[1];
  return '';
}

/* serie mínima a partir de una fila de "Reporte de Consumo" (fallback) */
export function serieDeConsumo(r, RC) {
  const arr = [];
  const pm = aMesAnio(r[RC.penFecha]); if (pm) arr.push({ mes: pm, cant: num(r[RC.cantPen]), imp: num(r[RC.impPen]) });
  const um = aMesAnio(r[RC.ultMes]);  if (um) arr.push({ mes: um, cant: num(r[RC.cantUlt]), imp: num(r[RC.impUlt]) });
  return arr.sort((a, b) => mesKey(a.mes) - mesKey(b.mes));
}

/* Consumo del mes corriente, o último + penúltimo si no facturó el mes corriente. */
export function consumoDe(serie) {
  const tnd = clasificarEstado(serie, false);
  if (!serie || !serie.length) return { tipo: 'nada', tnd };
  const cur = serie.find(s => s.mes === store.CURMES);
  if (cur && (cur.cant > 0 || cur.imp > 0)) return { tipo: 'actual', mes: store.CURMES, ...cur, tnd };
  return { tipo: 'previo', ultimo: serie[serie.length - 1], penultimo: serie[serie.length - 2] || null, tnd };
}

/* atajos de acceso a series */
export const serieMatDest = (dest, mat) => store.RF ? store.RF.matDest.get(norm(dest) + '||' + norm(mat)) : null;
export const serieSolic    = s => store.RF ? store.RF.solic.get(norm(s)) : null;
export const serieDest      = d => store.RF ? store.RF.dest.get(norm(d)) : null;
