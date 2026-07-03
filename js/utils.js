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
export const moneyD = n => num(n).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2, maximumFractionDigits: 4 });

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

/* parsea una fecha (dd/mm/aaaa, mm/aaaa, yyyy-mm-dd) -> Date | null */
export function parseFecha(v) {
  const s = norm(v); if (!s) return null;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s); if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]); }
  m = /^(\d{1,2})\/(\d{4})$/.exec(s); if (m) return new Date(+m[2], +m[1] - 1, 1);
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s); return isNaN(d) ? null : d;
}
/* vigencia restante hasta una caducidad: {dias, meses, txt, cls} */
export function vigencia(fecha) {
  const exp = parseFecha(fecha); if (!exp) return null;
  const now = new Date(); now.setHours(0, 0, 0, 0); exp.setHours(0, 0, 0, 0);
  const dias = Math.round((exp - now) / 86400000);
  const meses = dias / 30.44;
  let txt, cls;
  if (dias < 0) { txt = 'Vencido'; cls = 'rojo'; }
  else if (dias <= 31) { txt = `${dias} d`; cls = 'rojo'; }
  else if (dias <= 182) { txt = `${meses.toFixed(1)} meses`; cls = 'amb'; }
  else { txt = `${meses.toFixed(1)} meses`; cls = 'verde'; }
  return { dias, meses, txt, cls };
}

/* primer campo no vacío entre varios encabezados candidatos */
export const pickField = (r, names) => { for (const n of names) { const v = norm(r[n]); if (v) return v; } return ''; };
