/* ===========================================================================
   exportx.js · exporta a Excel las filas (ya filtradas/ordenadas) que se ven.
   Recibe un arreglo de objetos planos { Columna: valor }.
   =========================================================================== */
export function exportXlsx(filename, rows, sheetName = 'Datos') {
  if (!rows || !rows.length) { alert('No hay filas para exportar.'); return; }
  const ws = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  XLSX.writeFile(wb, filename);
}
export const stamp = () => new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-');
