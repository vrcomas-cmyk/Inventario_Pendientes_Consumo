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
  return f.list.every(flt => {
    const col = columns.find(c => c.key === flt.key);
    return col ? tokenMatch(norm(col.get(row)), flt.val) : true;
  });
}

export function toolbarHTML(columns, f, extra = '') {
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
        <input data-fval placeholder="valor…">
        <button class="btn" data-fadd>+ filtro</button>
      </span>
      ${f.list.length ? `<button class="btn" data-fclear>Limpiar todo (${f.list.length})</button>` : ''}
      ${extra}
    </div>
    ${chips ? `<div class="fchips">${chips}</div>` : ''}
  </div>`;
}

export function wireToolbar(container, f, rerender, onSearch) {
  const fs = container.querySelector('[data-fs]');
  // El buscador solo refresca resultados (onSearch); NO reconstruye la barra,
  // así el input conserva foco/cursor y admite espacios.
  if (fs) fs.oninput = e => { f.q = e.target.value; (onSearch || rerender)(); };
  const add = container.querySelector('[data-fadd]');
  if (add) add.onclick = () => {
    const k = container.querySelector('[data-fcol]').value;
    const v = container.querySelector('[data-fval]').value.trim();
    if (v) { f.list.push({ key: k, val: v }); rerender(); }
  };
  const fval = container.querySelector('[data-fval]');
  if (fval) fval.onkeydown = e => { if (e.key === 'Enter') add.onclick(); };
  const clr = container.querySelector('[data-fclear]');
  if (clr) clr.onclick = () => { f.list = []; rerender(); };
  container.querySelectorAll('[data-rm]').forEach(x => x.onclick = () => { f.list.splice(+x.dataset.rm, 1); rerender(); });
}

/* restaura foco y cursor al final tras el re-render (arregla el buscador) */
export function restoreFocus(container, f) {
  if (!f._focus) return;
  const el = container.querySelector(f._focus);
  if (el) { el.focus(); const v = el.value; el.value = ''; el.value = v; }
  f._focus = null;
}
