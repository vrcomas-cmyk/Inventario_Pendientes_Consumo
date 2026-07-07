/* ===========================================================================
   parseWorker.js · parsea el Excel FUERA del hilo principal (Web Worker
   clásico). Para reportes de 75k+ filas evita que la pestaña se congele.
   Devuelve las filas ya convertidas a JSON por hoja, parseadas UNA sola vez.
   =========================================================================== */
/* eslint-disable no-undef */
try { importScripts('https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js'); } catch (e) {}

function fixRange(ws) {
  const cells = Object.keys(ws).filter(k => k[0] !== '!');
  if (!cells.length) return;
  const r = { s: { r: 1e9, c: 1e9 }, e: { r: 0, c: 0 } };
  cells.forEach(k => { const a = XLSX.utils.decode_cell(k);
    if (a.r < r.s.r) r.s.r = a.r; if (a.c < r.s.c) r.s.c = a.c;
    if (a.r > r.e.r) r.e.r = a.r; if (a.c > r.e.c) r.e.c = a.c; });
  ws['!ref'] = XLSX.utils.encode_range(r);
}

self.onmessage = function (ev) {
  try {
    if (typeof XLSX === 'undefined') { self.postMessage({ ok: false, error: 'XLSX no disponible en worker' }); return; }
    const wb = XLSX.read(ev.data, { type: 'array', cellDates: false });
    const sheets = {}, grids = {};
    wb.SheetNames.forEach(n => { const ws = wb.Sheets[n]; fixRange(ws);
      sheets[n] = XLSX.utils.sheet_to_json(ws, { defval: '', raw: true });
      grids[n] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '', raw: true }); });
    self.postMessage({ ok: true, names: wb.SheetNames, sheets, grids });
  } catch (e) {
    self.postMessage({ ok: false, error: String((e && e.message) || e) });
  }
};
