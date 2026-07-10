/* ===========================================================================
   invConfig.js · configuración ÚNICA del AppScript (libro "Ejecutivos y
   materiales(Sync)"). Todo el enriquecimiento e inventario se lee de este
   mismo endpoint por pestaña — ya no se usan gviz/opensheet ni un 2º libro.
   Libro Sync: 1AeDp_J7sC3PcM1duP3iXKd-VVtWm7g3d3HiSeoKdFTY
   =========================================================================== */
export const INV_CFG = {
  // URL del despliegue del AppScript apuntando al libro Sync (reemplázala tras redeploy si cambia)
  apiUrl: 'https://script.google.com/macros/s/AKfycbyKHV5B688DxpaPyly9Kr8W6Osnqrg7nceEma5cialZH4w5z3K0FhJsSzGpQbmq8cWY3Q/exec',
  tabs: { detalle: 'InvDetalle', consolidado: 'InvConsolidado', ejecutivos: 'Ejecutivos', materiales: 'Materiales' },
  expiry: { mes1: 30, mes3: 91, mes6: 182 },  // rojo / naranja / ámbar
  lowStock: 50,
  cacheDays: 3,   // el inventario se actualiza 1-2 veces/semana → cachear y refrescar manual
};

/* Lee una pestaña del AppScript como arreglo de objetos [{Encabezado: valor}]. */
export async function fetchAppScriptTab(tab, { nocache = false } = {}) {
  const url = `${INV_CFG.apiUrl}?tab=${encodeURIComponent(tab)}${nocache ? '&nocache=1' : ''}`;
  const data = await fetch(url).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' ' + tab); return r.json(); });
  if (data && data.error) throw new Error(data.error);
  return Array.isArray(data) ? data : [];
}
