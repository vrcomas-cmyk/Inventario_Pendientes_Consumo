/* ===========================================================================
   sheetsConfig.js · (OPCIONAL) hasta 2 Google Sheets extra para traer campos
   y mostrarlos en las tablas, SIN AppScript (vía el endpoint gviz de Sheets).

   Requisito: cada hoja debe estar compartida como "cualquiera con el enlace
   puede ver". El id es el de la URL: docs.google.com/spreadsheets/d/<ID>/edit

   Cada entrada:
     id      : ID del libro
     sheet   : nombre de la pestaña
     keyCol  : columna llave para cruzar (ej. 'Material' o 'Destinatario')
     joinOn  : cómo se cruza con la fila destino: 'matBase' | 'dest' | 'solic'
     fields  : [{ col:'NombreEnLaHoja', as:'EtiquetaAMostrar' }]
   Déjalo vacío ([]) si no lo usas; el portal funciona igual.
   =========================================================================== */
export const EXTRA_SHEETS = [
  // {
  //   id: '1AbCdEf...', sheet: 'Maestro', keyCol: 'Material', joinOn: 'matBase',
  //   fields: [ { col: 'Línea', as: 'Línea' }, { col: 'Responsable', as: 'Responsable' } ],
  // },
  // {
  //   id: '1GhIjKl...', sheet: 'Clientes', keyCol: 'Destinatario', joinOn: 'dest',
  //   fields: [ { col: 'Región', as: 'Región' }, { col: 'Ejecutivo', as: 'Ejecutivo' } ],
  // },
];
