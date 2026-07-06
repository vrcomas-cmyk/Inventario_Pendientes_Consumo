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

/* ===========================================================================
   Archivos subidos al portal (Storage + tabla portal_uploads) para que se
   vean desde cualquier dispositivo. Todas devuelven null/false si no hay
   Supabase, de modo que el portal siga guardando localmente (IndexedDB).
   =========================================================================== */
const BUCKET = 'portal-uploads';

export async function uploadPortalFile(buf, meta) {
  const c = sb(); if (!c) return null;
  try {
    const safe = (meta.fileName || 'archivo').replace(/[^\w.\-]+/g, '_').slice(0, 60);
    const path = `${Date.now()}_${safe}.xlsx`;
    const up = await c.storage.from(BUCKET).upload(path, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), { upsert: true });
    if (up.error) return null;
    // desactivar el activo anterior y registrar el nuevo como activo
    await c.from('portal_uploads').update({ is_active: false }).eq('is_active', true);
    const ins = await c.from('portal_uploads').insert({
      name: meta.name || meta.fileName || 'Archivo',
      file_name: meta.fileName || null,
      storage_path: path,
      selected: meta.selected || [],
      roles: meta.roles || {},
      size_bytes: (buf && buf.byteLength) || null,
      uploaded_by: meta.uploadedBy || null,
      is_active: true,
    }).select('id').single();
    return ins.error ? null : (ins.data && ins.data.id);
  } catch (e) { return null; }
}

export async function latestPortalUpload() {
  const c = sb(); if (!c) return null;
  try {
    const { data, error } = await c.from('portal_uploads')
      .select('id,name,file_name,storage_path,selected,roles,size_bytes,uploaded_at')
      .eq('is_active', true).order('uploaded_at', { ascending: false }).limit(1);
    if (error || !data || !data.length) return null;
    return data[0];
  } catch (e) { return null; }
}

export async function downloadPortalFile(path) {
  const c = sb(); if (!c) return null;
  try {
    const { data, error } = await c.storage.from(BUCKET).download(path);
    if (error || !data) return null;
    return await data.arrayBuffer();
  } catch (e) { return null; }
}
