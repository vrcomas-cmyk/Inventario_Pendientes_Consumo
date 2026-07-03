/* ===========================================================================
   filters.js · barra de filtros múltiple (chips) + buscador multi-token
   Resuelve: agregar varios filtros, quitarlos uno a uno o todos, y el bug de
   foco del buscador (restoreFocus tras re-render).
   columns: [{ key, label, get:(row)=>valor }]
   =========================================================================== */
import { norm, esc, tokenMatch } from './utils.js';

export function makeFilters() { return { q: '', list: [], _focus: null }; }

export const searchText = (row, columns) => columns.map(c => norm(c.get(row))).join(' ');

export function passes(row, columns, f) {
  if (!tokenMatch(searchText(row, columns), f.q)) return false;
  // Agrupar por campo: OR dentro del mismo campo, AND entre campos distintos
  const byKey = new Map();
  for (const flt of f.list) { if (!byKey.has(flt.key)) byKey.set(flt.key, []); byKey.get(flt.key).push(flt); }
  for (const [key, flts] of byKey) {
    const col = columns.find(c => c.key === key);
    if (!col) continue;
    const v = norm(col.get(row));
    const okAny = flts.some(flt => {
      if (flt.val === '(vacíos)') return v === '';
      if (flt.val === '(con valor)') return v !== '';
      return tokenMatch(v, flt.val);
    });
    if (!okAny) return false;
  }
  return true;
}

export function toolbarHTML(columns, f, extra = '', dlId = 'fsugg') {
  const colOpts = columns.map(c => `<option value="${esc(c.key)}">${esc(c.label)}</option>`).join('');
  const chips = f.list.map((flt, i) => {
    const lbl = (columns.find(c => c.key === flt.key) || {}).label || flt.key;
    return `<span class="fchip">${esc(lbl)}: <b>${esc(flt.val)}</b> <span class="fx" data-rm="${i}">×</span></span>`;
  }).join('');
  return `<div class="toolbar">
    <div class="trow"><input class="fsearch" data-fs placeholder="🔍 Buscar (cada palabra/número, en cualquier orden: ej. 20 GASA)" value="${esc(f.q)}"></div>
    <div class="trow">
      <span class="addf">
        <select data-fcol>${colOpts}</select>
        <input data-fval list="${esc(dlId)}" placeholder="valor… (vacío = filtra vacíos)">
        <datalist id="${esc(dlId)}"></datalist>
        <button class="btn" data-fadd>+ filtro</button>
      </span>
      ${f.list.length ? `<button class="btn" data-fclear>Limpiar todo (${f.list.length})</button>` : ''}
      ${extra}
    </div>
    ${chips ? `<div class="fchips">${chips}</div>` : ''}
  </div>`;
}

export function wireToolbar(container, f, rerender, onSearch, suggestFn) {
  const fs = container.querySelector('[data-fs]');
  // El buscador refresca resultados con un pequeño debounce (fluidez con muchos datos)
  if (fs) { let tmr; fs.oninput = e => { f.q = e.target.value; clearTimeout(tmr); tmr = setTimeout(() => (onSearch || rerender)(), 180); }; }
  const colSel = container.querySelector('[data-fcol]');
  const dl = container.querySelector('datalist');
  const fval = container.querySelector('[data-fval]');
  const fillSugg = () => {
    if (!suggestFn || !dl || !colSel) return;
    const vals = suggestFn(colSel.value, fval ? fval.value : '') || [];
    dl.innerHTML = ['(vacíos)', '(con valor)', ...vals].map(v => `<option value="${esc(v)}"></option>`).join('');
  };
  if (colSel) colSel.onchange = fillSugg;
  if (fval) fval.addEventListener('input', fillSugg);
  fillSugg();
  const add = container.querySelector('[data-fadd]');
  if (add) add.onclick = () => {
    const k = colSel.value;
    const v = fval.value.trim() || '(vacíos)';
    f.list.push({ key: k, val: v }); rerender();
  };
  if (fval) fval.onkeydown = e => { if (e.key === 'Enter') add.onclick(); };
  const clr = container.querySelector('[data-fclear]');
  if (clr) clr.onclick = () => { f.list = []; rerender(); };
  container.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { f.list.splice(+x.dataset.rm, 1); rerender(); });
}

/* ---- filtro por periodo (presets relativos al mes corriente) ---- */
export const PERIODOS = [
  ['', 'Periodo: todo'], ['cur', 'Mes corriente'], ['3', 'Últimos 3 meses'], ['6', 'Últimos 6 meses'],
  ['12', 'Últimos 12 meses'], ['q', 'Trimestre corriente'], ['y', 'Año en curso'], ['y1', 'Año anterior'],
];
export function periodoRange(key, curmes) {
  const [cm, cy] = String(curmes || '').split('/').map(Number);
  if (!cm) return null;
  const cur = cy * 12 + cm;
  switch (key) {
    case 'cur': return [cur, cur];
    case '3':   return [cur - 2, cur];
    case '6':   return [cur - 5, cur];
    case '12':  return [cur - 11, cur];
    case 'q':   { const qs = cy * 12 + (Math.floor((cm - 1) / 3) * 3 + 1); return [qs, qs + 2]; }
    case 'y':   return [cy * 12 + 1, cy * 12 + 12];
    case 'y1':  return [(cy - 1) * 12 + 1, (cy - 1) * 12 + 12];
    default:    return null;
  }
}
/* preset -> [desdeISO, hastaISO] (para rellenar los date inputs) */
export function periodoISO(key, curmes) {
  const r = periodoRange(key, curmes); if (!r) return ['', ''];
  const fk = k => ({ y: Math.floor((k - 1) / 12), m: ((k - 1) % 12) + 1 });
  const a = fk(r[0]), b = fk(r[1]); const last = new Date(b.y, b.m, 0).getDate(); const p = n => String(n).padStart(2, '0');
  return [`${a.y}-${p(a.m)}-01`, `${b.y}-${p(b.m)}-${p(last)}`];
}
/* parseo de fechas de celda -> número yyyymmdd */
export function dayNum(v) {
  const s = String(v == null ? '' : v).trim(); if (!s) return null;
  let m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s); if (m) { let y = +m[3]; if (y < 100) y += 2000; return y * 10000 + (+m[2]) * 100 + (+m[1]); }
  m = /^(\d{1,2})\/(\d{4})$/.exec(s); if (m) return (+m[2]) * 10000 + (+m[1]) * 100 + 1;
  m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s); if (m) return (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]);
  return null;
}
const isoNum = s => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || ''); return m ? (+m[1]) * 10000 + (+m[2]) * 100 + (+m[3]) : null; };
export function dateRange(desde, hasta) { const d0 = isoNum(desde), d1 = isoNum(hasta); if (d0 == null && d1 == null) return null; return [d0 ?? 0, d1 ?? 99999999]; }
export function inRangeDay(value, range) { if (!range) return true; const d = dayNum(value); if (d == null) return false; return d >= range[0] && d <= range[1]; }
export function inRangeMonth(value, range) { if (!range) return true; const d = dayNum(value); if (d == null) return false; const mk = Math.floor(d / 100); return mk >= Math.floor(range[0] / 100) && mk <= Math.floor(range[1] / 100); }

export function periodoSelectHTML(val) {
  return `<select data-periodo>${PERIODOS.map(([k, l]) => `<option value="${k}" ${val === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`;
}
/* control de periodo: presets + rango de fechas personalizado */
export function periodoControlHTML(flt) {
  return `<span class="periodo">
    <select data-pre>${PERIODOS.map(([k, l]) => `<option value="${k}" ${(!flt.desde && !flt.hasta && flt.periodo === k) ? 'selected' : ''}>${l}</option>`).join('')}<option value="custom" ${(flt.desde || flt.hasta) ? 'selected' : ''}>Rango personalizado</option></select>
    <label>Desde <input type="date" data-d0 value="${flt.desde || ''}"></label>
    <label>Hasta <input type="date" data-d1 value="${flt.hasta || ''}"></label>
  </span>`;
}
/* cablea el control de periodo; rerender() repinta la vista */
export function wirePeriodo(container, flt, curmes, rerender) {
  const pre = container.querySelector('[data-pre]'), d0 = container.querySelector('[data-d0]'), d1 = container.querySelector('[data-d1]');
  if (pre) pre.onchange = e => {
    const v = e.target.value;
    if (v === 'custom') { flt.periodo = ''; rerender(); return; }
    flt.periodo = v; const [a, b] = periodoISO(v, curmes); flt.desde = a; flt.hasta = b; rerender();
  };
  if (d0) d0.onchange = e => { flt.desde = e.target.value; flt.periodo = ''; rerender(); };
  if (d1) d1.onchange = e => { flt.hasta = e.target.value; flt.periodo = ''; rerender(); };
}

/* genera sugerencias (valores distintos) por columna a partir de las filas */
export function makeSuggest(rows, columns, limit = 80) {
  return (colKey, query = '') => {
    const col = columns.find(c => c.key === colKey); if (!col) return [];
    const q = String(query || '').toLowerCase().trim();
    const set = new Set(); let scanned = 0;
    for (const r of rows) {
      const v = norm(col.get(r));
      if (v && (!q || v.toLowerCase().includes(q))) set.add(v);
      if (++scanned >= 40000 || set.size >= 600) break;
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'es', { numeric: true })).slice(0, limit);
  };
}

/* restaura foco y cursor al final tras el re-render (arregla el buscador) */
export function restoreFocus(container, f) {
  if (!f._focus) return;
  const el = container.querySelector(f._focus);
  if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
  f._focus = null;
}

/* clic en una celda con data-addf="campo|valor" agrega ese filtro a la vista */
export function wireAddfClicks(container, f, rerender) {
  container.querySelectorAll('.result [data-addf]').forEach(el => el.addEventListener('click', ev => {
    ev.stopPropagation();
    const [k, v] = el.dataset.addf.split('|');
    if (!f.list.some(x => x.key === k && x.val === v)) { f.list.push({ key: k, val: v }); rerender(); }
  }));
}
