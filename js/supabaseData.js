/* ===========================================================================
   supabaseData.js · lecturas de solo lectura desde Supabase, paginadas.
   Devuelven null si Supabase no está disponible (para que el portal use Google).
   =========================================================================== */
import { sb } from './supabaseClient.js';

async function selectAll(table, cols, pageSize = 1000, maxPages = 60) {
  const c = sb(); if (!c) return null;
  let out = [], from = 0;
  try {
    for (let i = 0; i < maxPages; i++) {
      const { data, error } = await c.from(table).select(cols).range(from, from + pageSize - 1);
      if (error) return out.length ? out : null;
      out = out.concat(data || []);
      if (!data || data.length < pageSize) break;
      from += pageSize;
    }
  } catch (e) { return out.length ? out : null; }
  return out;
}

/* Enriquecimiento: sector / grupo de artículo por material (catalog_materials) */
export const fetchCatalogMaterials = () => selectAll('catalog_materials', 'material,descr_sector,descr_grupo_art,descripcion,condicion');
/* Precios por condición (crm_prices) */
export const fetchPrices = () => selectAll('crm_prices', 'material,precio_oferta,condicion,descripcion');
/* Inventario (crm_inventory) — para convivir con el AppScript */
export const fetchInventory = () => selectAll('crm_inventory',
  'material,descripcion,centro,almacen,lote,fecha_caducidad,meses_vigencia_lote,disponible,inv_1030,inv_1031,inv_1032,inv_1060,cant_transito,ped_pendientes,disponibilidad,fuente,um');
