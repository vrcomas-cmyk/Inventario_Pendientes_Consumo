/* ===========================================================================
   sugTabla.js · tabla de sugerencias compartida (Inventario, Resumen Sin
   Sugerencias y cualquier otro detalle). Mismas columnas en todos lados:
   Pedido/OC · Fecha · Cliente · Grupo cliente · Ejecutivo · Centro/Alm ·
   Pendiente · Precio · Precio oferta · Bloqueado · Estado · Tendencia.
   El precio oferta se pasa como parámetro para evitar dependencias circulares.
   =========================================================================== */
import { norm, num, fmt, esc, moneyD } from './utils.js';
import { C } from './store.js';
import { pill, trendText } from './ui.js';
import { grupoCliente, ejecutivoNombre } from './enrich.js';

export function sugTablaHTML(list, pOferta = null, rowAttr = 'data-sug') {
  if (!list.length) return '<p class="muted">Sin pedidos de sugerencias.</p>';
  const rows = list.map((it, i) => { const b = it.bo; const bl = norm(b[C.bloq]); return `<tr class="click ${bl ? 'bloq' : ''}" ${rowAttr}="${i}">
    <td><span class="lnk" data-goped="${esc(b[C.pedido])}"><b>${esc(b[C.pedido])}</b></span><div class="sub">OC ${esc(b[C.oc]) || '—'}</div></td>
    <td>${esc(b[C.fecha]) || '—'}</td>
    <td>${esc(b[C.razon])}<div class="sub"><span class="lnk" data-gosolic="${esc(b[C.solic])}">Solic ${esc(b[C.solic])}</span> · <span class="lnk" data-godest="${esc(b[C.dest])}">Dest ${esc(b[C.dest])}</span></div></td>
    <td>${esc(grupoCliente(b[C.gpo]) || b[C.gpo]) || '—'}</td>
    <td>${esc(ejecutivoNombre(b[C.gpoV])) || '—'}</td>
    <td>${esc(b[C.centro])}${norm(b[C.alm]) ? ' / ' + esc(b[C.alm]) : ''}</td>
    <td class="num">${fmt(b[C.pend])}</td><td class="num">${moneyD(b[C.precio])}</td><td class="num">${pOferta != null ? moneyD(pOferta) : '—'}</td>
    <td>${bl ? `<span class="pill amb">${esc(bl)}</span>` : '—'}</td>
    <td>${pill(it.status.label, it.status.cls)}</td><td>${trendText(it.tend)}</td></tr>`; }).join('');
  return `<div class="tbl"><table><thead><tr><th>Pedido / OC</th><th>Fecha</th><th>Cliente</th><th>Grupo cliente</th><th>Ejecutivo</th><th>Centro/Alm</th><th class="num">Pendiente</th><th class="num">Precio</th><th class="num">Precio oferta</th><th>Bloqueado</th><th>Estado</th><th>Tendencia</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

export function sugExportRows(list, pOferta = null) {
  return (list || []).map(it => { const b = it.bo; return {
    'Pedido': norm(b[C.pedido]), 'OC': norm(b[C.oc]), 'Fecha': norm(b[C.fecha]),
    'Razón social': norm(b[C.razon]), 'Solicitante': norm(b[C.solic]), 'Destinatario': norm(b[C.dest]),
    'Grupo cliente': grupoCliente(b[C.gpo]) || norm(b[C.gpo]),
    'Ejecutivo': ejecutivoNombre(b[C.gpoV]), 'Centro': norm(b[C.centro]), 'Almacén': norm(b[C.alm]),
    'Material': norm(b[C.matBase]), 'Pendiente': num(b[C.pend]), 'Precio': num(b[C.precio]), 'Precio oferta': pOferta,
    'Bloqueado': norm(b[C.bloq]), 'Estado': it.status.label, 'Tendencia': it.tend.txt,
  }; });
}
