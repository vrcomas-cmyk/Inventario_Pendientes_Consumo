/* ===========================================================================
   sort.js · orden multi-columna para las tablas
   estado: [{key, dir:'asc'|'desc'}]  (el orden del array = prioridad)
   clic = orden por esa columna; Shift+clic = agrega columna secundaria.
   =========================================================================== */
export const makeSort = () => [];

export function cycleSort(arr, key, additive) {
  const ex = arr.find(s => s.key === key);
  if (!additive) {
    if (ex && arr.length === 1) {                 // misma única col: asc -> desc -> quitar
      if (ex.dir === 'asc') return [{ key, dir: 'desc' }];
      return [];
    }
    return [{ key, dir: 'asc' }];
  }
  // additive (Shift)
  if (ex) {
    if (ex.dir === 'asc') { ex.dir = 'desc'; return [...arr]; }
    return arr.filter(s => s.key !== key);
  }
  return [...arr, { key, dir: 'asc' }];
}

const toNum = v => {
  if (typeof v === 'number') return v;
  const s = String(v == null ? '' : v).replace(/[^0-9.\-]/g, '');
  if (s === '' || s === '-' || s === '.') return null;
  const n = parseFloat(s); return isNaN(n) ? null : n;
};
function cmp(a, b) {
  const na = toNum(a), nb = toNum(b);
  if (na != null && nb != null) return na - nb;
  if (na != null) return -1; if (nb != null) return 1;
  return String(a ?? '').localeCompare(String(b ?? ''), 'es', { numeric: true, sensitivity: 'base' });
}

export function applySort(list, arr, accessor) {
  if (!arr.length) return list;
  const out = [...list];
  out.sort((x, y) => {
    for (const s of arr) {
      const c = cmp(accessor(x, s.key), accessor(y, s.key));
      if (c !== 0) return s.dir === 'asc' ? c : -c;
    }
    return 0;
  });
  return out;
}

/* th class + indicador (▲/▼ y número de prioridad si hay varias) */
export function th(label, key, arr, opts = '') {
  const i = arr.findIndex(s => s.key === key);
  let ind = '';
  if (i >= 0) { const ar = arr[i].dir === 'asc' ? '▲' : '▼'; ind = ` <span class="sorti">${ar}${arr.length > 1 ? (i + 1) : ''}</span>`; }
  return `<th class="sortable ${opts}" data-sort="${key}">${label}${ind}</th>`;
}
