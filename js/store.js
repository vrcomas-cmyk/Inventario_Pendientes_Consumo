/* ===========================================================================
   store.js · estado compartido (singleton) y mapas de columnas
   =========================================================================== */
export const store = {
  fileName: '',
  WB: {},        // { hoja: [filas...] }
  ROLE: {},      // { sug, fac, cons, ... : nombreHoja }
  RF: null,      // índices de Resumen_Fac
  BO: [],        // sugerencias agrupadas
  CURMES: '',    // mes corriente (máx de Resumen_Fac)
};

/* Columnas de "Todas las Sugerencias" */
export const C = {
  gpo:'Gpo. Cte.', fecha:'Fecha', oc:'OC', pedido:'Pedido', gpoV:'Gpo.Vdor.',
  solic:'Solicitante', dest:'Destinatario', razon:'Razón Social',
  centro:'Centro pedido', alm:'Almacén',
  matSol:'Material solicitado', matBase:'Material base', descSol:'Descripción solicitada',
  cantPed:'Cantidad pedido', pend:'Cantidad pendiente', cantOf:'Cantidad a Ofertar',
  precio:'Precio', consumo:'Consumo promedio',
  fuente:'Fuente', matSug:'Material sugerido', descSug:'Descripción sugerida',
  cenSug:'Centro sugerido', almSug:'Almacén sugerido', disp:'Disponible',
  lote:'Lote', cad:'Fecha de Caducidad', bloq:'Bloqueado',
  // inventario por almacén
  inv1030:'Inv 1030', inv1031:'Inv 1031', inv1032:'Inv 1032', inv1060:'Inv 1060',
  inv1001:'Inv 1001', inv1003:'Inv 1003', inv1004:'Inv 1004', inv1017:'Inv 1017',
  inv1018:'Inv 1018', inv1022:'Inv 1022', inv1036:'Inv 1036',
  disp31_30:'Disponible 1031-1030', disp31_32:'Disponible 1031-1032',
  transito:'Cant. en Tránsito', tr1030:'Cant. en Tránsito 1030',
  tr1031:'Cant. en Tránsito 1031', tr1032:'Cant. en Tránsito 1032',
};

/* Columnas de "Resumen_Fac" */
export const RFC = {
  solic:'Solicitante', razon:'Razón Social', dest:'Destinatario', material:'Material',
  texto:'Texto de material', mes:'Mes y año', cant:'Cantidad facturada', imp:'Importe facturado',
  centro:'Centro',
};

/* Columnas de "Reporte de Consumo" */
export const RC = {
  centro:'Centro', gpo:'Grp. Cliente', solic:'Solicitante', dest:'Destinatario', razon:'Razón Social',
  material:'Material', texto:'Texto Material', consumoAct:'Consumo_actual', promedio:'Consumo_promedio_mensual',
  tendencia:'Tendencia', ultMes:'Ultimo mes facturacion', cantUlt:'Cantidad ultima', impUlt:'Importe ultima',
  penFecha:'Penultima_fecha', cantPen:'Cantidad_penultima', impPen:'Importe_penultima',
  ultFacDest:'Ultima_facturacion_destinatario',
  precioMin:'precio_min', precioMax:'precio_max', precioProm:'precio_prom',
  precioUltUni:'Precio_unitario_ultima', precioPenUni:'Precio_unitario_penultima',
};
