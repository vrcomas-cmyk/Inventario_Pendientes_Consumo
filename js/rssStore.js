/* ===========================================================================
   rssStore.js · datos de "Resumen Sin Sugerencias" compartidos (sin ciclos).
   resumenSin.buildRSS() lo llena; inventario.js lo consulta para inyectar
   pendiente / en curso / advertencia en su vista principal.
   =========================================================================== */
import { norm, mesKey } from './utils.js';

let MATS = new Map(), CENTROS = [], CURMES = 0;

export function setRSS(mats, centros, curMes) { MATS = mats; CENTROS = centros; CURMES = curMes; }
export function rssReady() { return MATS.size > 0; }
export function rssMats() { return MATS; }
export function rssCentros() { return CENTROS; }
export function rssCurMes() { return CURMES; }
export function rssMaterial(material) { return MATS.get(norm(material)) || null; }
export function rssCentro(material, centro) { const mo = MATS.get(norm(material)); return mo ? (mo.centros.get(norm(centro)) || null) : null; }

/* pendiente y tránsito de un material sumando todos los centros, por almacén */
function sumByAlm(material, field) {
  const mo = MATS.get(norm(material)); const out = {};
  if (!mo) return out;
  mo.centros.forEach(co => co.alm.forEach(a => { const k = String(a.alm); out[k] = (out[k] || 0) + (a[field] || 0); }));
  return out;
}
export const rssPendPorAlm = material => sumByAlm(material, 'pend');
export const rssTransitoPorAlm = material => sumByAlm(material, 'transito');
export function rssPend1032(material) { return rssPendPorAlm(material)['1032'] || 0; }
export function rssTransito1032(material) { return rssTransitoPorAlm(material)['1032'] || 0; }

/* último mes de facturación del material (máximo entre centros) */
export function rssUltMesK(material) {
  const mo = MATS.get(norm(material)); if (!mo) return 0;
  let mx = 0; mo.centros.forEach(co => { if (co.ultMesK > mx) mx = co.ultMesK; });
  return mx;
}
/* material sin movimiento >= meses (a partir de la fecha de referencia del archivo RSS) */
export function rssLentoMaterial(material, meses = 6) {
  if (!rssReady()) return false;
  const uk = rssUltMesK(material);
  if (!uk) return false;                 // sin dato de consumo → no marcar (evita falsos)
  return (CURMES - uk) >= meses;
}
