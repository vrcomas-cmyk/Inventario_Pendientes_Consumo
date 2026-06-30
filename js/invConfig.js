/* ===========================================================================
   invConfig.js · parámetros del inventario (tomados de Html_Inventario/config.js)
   El inventario se alimenta de este AppScript (no del archivo subido).
   =========================================================================== */
export const INV_CFG = {
  apiUrl: 'https://script.google.com/macros/s/AKfycbz74169NY7gqzyW-y7K_WUQJuqMWNuZjmBS-TKfJMBa_f_nweEmDF47NuTcLlBkuAyKAg/exec',
  tabs: { detalle: 'InvDetalle', consolidado: 'InvConsolidado' },
  expiry: { mes1: 30, mes3: 91, mes6: 182 },  // rojo / naranja / ámbar
  lowStock: 50,
  cacheDays: 3,   // el inventario se actualiza 1-2 veces/semana → cachear y refrescar manual
};
