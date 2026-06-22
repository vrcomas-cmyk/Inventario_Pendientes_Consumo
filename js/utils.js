/* ===========================================================================
   utils.js · helpers puros (sin estado, sin DOM)
   =========================================================================== */
export const norm = v => (v == null ? '' : String(v)).trim();

export const num = v => {
  if (v == null || v === '') return 0;
  const n = parseFloat(String(v).replace(/[^0-9.\-]/g, ''));
  return isNaN(n) ? 0 : n;
};

export const fmt   = n => Math.round(num(n)).toLocaleString('es-MX');
export const money = n => num(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });

export const esc = s => norm(s).replace(/[&<>"]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;' }[c]));

/* mm/aaaa -> clave ordenable */
export const mesKey = m => { const x = norm(m).split('/'); return x.length === 2 ? (+x[1]) * 12 + (+x[0]) : 0; };

/* ---------------------------------------------------------------------------
   Búsqueda multi-token (punto 10):
   divide la consulta por espacios y exige que TODOS los tokens aparezcan en el
   texto, en cualquier orden y posición. "20 GASA" => contiene "20" Y "gasa".
   --------------------------------------------------------------------------- */
export function tokenMatch(text, query) {
  const q = norm(query).toLowerCase();
  if (!q) return true;
  const t = norm(text).toLowerCase();
  return q.split(/\s+/).filter(Boolean).every(tok => t.includes(tok));
}

/* construye el texto-base de una fila a partir de varias columnas */
export const rowText = (row, cols) => cols.map(c => norm(row[c])).join(' ');
