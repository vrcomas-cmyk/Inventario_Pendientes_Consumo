/* ===========================================================================
   zoom.js · control de zoom por tabla (se ajusta a la pantalla), persistente
   =========================================================================== */
export const getZoom = key => {
  const v = parseInt(localStorage.getItem('zoom_' + key) || '100', 10);
  return isNaN(v) ? 100 : v;
};

export function zoomHTML(key) {
  const v = getZoom(key);
  return `<span class="zoomwrap" title="Zoom de la tabla">
    <span class="muted" style="font-size:11px">🔎 Zoom</span>
    <input type="range" class="zoom" min="50" max="170" step="10" value="${v}" data-zoom="${key}">
    <span data-zoomval style="font-size:11px;min-width:34px;display:inline-block">${v}%</span>
  </span>`;
}

export function wireZoom(container, key, tableSelector) {
  const sl = container.querySelector(`[data-zoom="${key}"]`);
  if (!sl) return;
  const apply = v => {
    const t = container.querySelector(tableSelector);
    if (t) t.style.zoom = (v / 100).toString();
    const lab = container.querySelector('[data-zoomval]');
    if (lab) lab.textContent = v + '%';
  };
  apply(parseInt(sl.value, 10));
  sl.oninput = e => { const v = parseInt(e.target.value, 10); localStorage.setItem('zoom_' + key, v); apply(v); };
}
