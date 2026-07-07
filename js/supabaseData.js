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
    const base = (meta.fileName || 'archivo').replace(/\.xlsx?$/i, '').replace(/[^\w.\-]+/g, '_').slice(0, 60);
    const path = `${Date.now()}_${base}.xlsx`;
    const up = await c.storage.from(BUCKET).upload(path, new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), { upsert: true });
    if (up.error) return null;
    // tipos de reporte presentes en el archivo (cada uno reemplaza SOLO su tipo)
    const types = (meta.types && meta.types.length) ? meta.types : ['multi'];
    try {
      for (const t of types) {
        await c.from('portal_uploads').update({ is_active: false }).eq('report_type', t).eq('is_active', true);
        await c.from('portal_uploads').insert({
          name: meta.name || meta.fileName || 'Archivo', file_name: meta.fileName || null,
          storage_path: path, report_type: t, selected: meta.selected || [], roles: meta.roles || {},
          size_bytes: (buf && buf.byteLength) || null, is_active: true,
        });
      }
      // los tipos específicos superan al archivo completo legado ('multi')
      if (!types.includes('multi')) await c.from('portal_uploads').update({ is_active: false }).eq('report_type', 'multi').eq('is_active', true);
    } catch (e) { /* el archivo sigue accesible por Storage */ }
    return path;
  } catch (e) { return null; }
}

/* Último archivo ACTIVO por cada tipo de reporte (sug, cons, fac, rss, multi). */
export async function latestActiveByType() {
  const c = sb(); if (!c) return null;
  try {
    const { data, error } = await c.from('portal_uploads')
      .select('report_type,storage_path,file_name,selected,uploaded_at,is_active')
      .eq('is_active', true).order('uploaded_at', { ascending: false });
    if (error || !data) return null;
    const byType = new Map();
    for (const r of data) { if (!byType.has(r.report_type)) byType.set(r.report_type, r); }
    return byType;                                   // Map(report_type -> fila)
  } catch (e) { return null; }
}

export async function latestPortalUpload() {
  const c = sb(); if (!c) return null;
  // 1) preferir la tabla de metadatos (trae hojas/roles/fecha)
  try {
    const { data, error } = await c.from('portal_uploads')
      .select('id,name,file_name,storage_path,selected,roles,size_bytes,uploaded_at')
      .eq('is_active', true).order('uploaded_at', { ascending: false }).limit(1);
    if (!error && data && data.length) return data[0];
  } catch (e) { /* sigue al respaldo */ }
  // 2) respaldo: listar el bucket y tomar el más reciente
  try {
    const { data, error } = await c.storage.from(BUCKET).list('', { limit: 1000 });
    if (error || !data || !data.length) return null;
    const files = data.filter(f => f.name && /\.xlsx$/i.test(f.name)).sort((a, b) => (a.name < b.name ? 1 : -1));
    if (!files.length) return null;
    return { storage_path: files[0].name, selected: [], roles: {}, file_name: files[0].name, uploaded_at: files[0].name.split('_')[0] };
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

/* ===========================================================================
   Ingesta de facturación mensual (Resumen_Fac → crm_facturacion_mensual) y
   lectura de vistas. Todo con la anon key + sesión admin (RLS).
   =========================================================================== */
const N = v => { const x = parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, '')); return isNaN(x) ? 0 : x; };
const S = v => (v == null ? '' : String(v).trim());

/* Reemplaza la tabla mensual con las filas de la hoja Resumen_Fac. Solo admin (RLS). */
export async function ingestFacturacion(rows, onProgress) {
  const c = sb(); if (!c) return { ok: false, error: 'Supabase no disponible' };
  if (!rows || !rows.length) return { ok: false, error: 'Sin filas' };
  try {
    const del = await c.from('crm_facturacion_mensual').delete().gte('id', 0);
    if (del.error) return { ok: false, error: 'No se pudo limpiar (¿sesión admin?): ' + del.error.message };
    const CH = 1000; let done = 0;
    for (let i = 0; i < rows.length; i += CH) {
      const batch = rows.slice(i, i + CH).map(r => {
        const my = S(r['Mes y año']); const p = my.split('/');
        return {
          solicitante: S(r['Solicitante']), razon_social: S(r['Razón Social']), destinatario: S(r['Destinatario']),
          material: S(r['Material']), texto_material: S(r['Texto de material']), mes_anio: my,
          mes: parseInt(p[0], 10) || null, anio: parseInt(p[1], 10) || null,
          cantidad: N(r['Cantidad facturada']), importe: N(r['Importe facturado']),
          gpo_cliente: S(r['Gpo. Cte.']), gpo_vendedor: S(r['Gpo. Vdor.']),
        };
      });
      const ins = await c.from('crm_facturacion_mensual').insert(batch);
      if (ins.error) return { ok: false, error: ins.error.message, done };
      done += batch.length; if (onProgress) onProgress(done, rows.length);
    }
    return { ok: true, done };
  } catch (e) { return { ok: false, error: String(e) }; }
}

/* Lee una vista completa (paginada) para alimentar los builds del portal. */
export async function readView(view) { return selectAll(view, '*'); }
export const VIEWS = {
  fac: 'v_facturacion_mensual', sug: 'v_sugerencias', cons: 'v_consumo',
  rss: 'v_rss', invCond: 'v_inventario_condicion', invLotes: 'v_inventario_lotes',
};

/* ===== Series/comparativo server-side (RPC) — no baja las 400k filas ===== */
export async function rpcSerieMaterial(material) {
  const c = sb(); if (!c) return null;
  const { data, error } = await c.rpc('rpc_serie_material', { p_material: String(material) });
  if (error) return null;
  return (data || []).map(r => ({ mes: r.mes, cant: +r.cant, imp: +r.imp }));
}
export async function rpcSerieSolicitante(solic, material) {
  const c = sb(); if (!c) return null;
  const { data, error } = await c.rpc('rpc_serie_solicitante', { p_solic: String(solic), p_material: material ? String(material) : null });
  if (error) return null;
  return (data || []).map(r => ({ mes: r.mes, cant: +r.cant, imp: +r.imp }));
}
export async function rpcSerieDestinatario(dest, material) {
  const c = sb(); if (!c) return null;
  const { data, error } = await c.rpc('rpc_serie_destinatario', { p_dest: String(dest), p_material: material ? String(material) : null });
  if (error) return null;
  return (data || []).map(r => ({ mes: r.mes, cant: +r.cant, imp: +r.imp }));
}
export async function rpcComparativoMaterial(material, mes, anio) {
  const c = sb(); if (!c) return null;
  const { data, error } = await c.rpc('rpc_comparativo_material', { p_material: String(material), p_mes: mes, p_anio: anio });
  if (error || !data || !data.length) return null;
  return data[0];
}
