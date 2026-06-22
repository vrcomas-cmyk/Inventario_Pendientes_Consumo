/* ===========================================================================
   inventario.js · Vista por condición (nativa) — v3
   Búsqueda con refresco ligero (admite espacios). 2x2 + ranking, filtros
   Condición/Grupo/Sector + multi-filtro, zoom, admin (ocultar filas), drills.
   =========================================================================== */
import { norm, num, fmt, money, esc } from './utils.js';
import { openModal, pill, rankingHTML } from './ui.js';
import { toolbarHTML, wireToolbar, makeFilters, passes, makeSuggest } from './filters.js';
import { zoomHTML, wireZoom } from './zoom.js';
import { makeSort, cycleSort, applySort, th } from './sort.js';
import { INV_CFG } from './invConfig.js';

let CONS = null, DET = null, INVCODES = [], F = {}, loaded = false, loading = false, loadErr = '';
const flt = makeFilters();
flt.cond = ''; flt.grupo = ''; flt.sector = '';
let sort = makeSort();
const accessor = (r, k) => {
  if (k === 'mat') return r[F.material]; if (k === 'cond') return r[F.cond]; if (k === 'grupo') return r[F.grupo];
  if (k === 'precio') return num(r[F.precio]); if (k === 'disp1030') return num(r[F.disp1030]); if (k === 'disp1032') return num(r[F.disp1032]);
  if (k === 'invSuma') return num(r[F.invSuma]); if (k === 'importe') return num(r[F.importe]);
  if (k.startsWith('inv')) return num(r['Inv ' + k.slice(3)]);
  return '';
};

const admin = {
  on: () => localStorage.getItem('inv_admin') === '1',
  setOn: v => localStorage.setItem('inv_admin', v ? '1' : '0'),
  hidden: () => new Set(JSON.parse(localStorage.getItem('inv_hidden') || '[]')),
  toggle: key => { const s = admin.hidden(); s.has(key) ? s.delete(key) : s.add(key); localStorage.setItem('inv_hidden', JSON.stringify([...s])); },
};
const rowKey = r => norm(r[F.material]) + '||' + norm(r[F.cond]);

const normKey = k => String(k).replace(/\s+/g, ' ').trim();
const normalize = rows => !Array.isArray(rows) ? [] : rows.map(r => { const o = {}; for (const k in r) { let v = r[k]; if (typeof v === 'string') v = v.trim(); o[normKey(k)] = v; } return o; });
const findField = (keys, cands) => cands.find(c => keys.includes(c)) || null;

function detectFields(rows) {
  const keys = [...new Set(rows.flatMap(r => Object.keys(r)))];
  F = {
    material: findField(keys, ['Material']), texto: findField(keys, ['Texto breve de material']),
    cond: findField(keys, ['Condicion', 'Condición']),
    grupo: findField(keys, ['Grupo', 'Descr. Grupo de Art.', 'Descr Grupo de Art']),
    sector: findField(keys, ['Sector', 'Descr. Sector', 'Descr Sector']),
    precio: findField(keys, ['Precio Oferta', 'Precio oferta']),
    disp1030: findField(keys, ['Disponible 1031-1030']), disp1032: findField(keys, ['Disponible 1031-1032']),
    invSuma: findField(keys, ['Inv Suma']), importe: findField(keys, ['Importe Inventario $']),
  };
  INVCODES = [...new Set(keys.map(k => (k.match(/^Inv (\d+)$/) || [])[1]).filter(Boolean))].sort();
}

function parseFecha(v) {
  const s = norm(v); if (!s) return null;
  let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/); if (m) { let y = +m[3]; if (y < 100) y += 2000; return new Date(y, +m[2] - 1, +m[1]); }
  m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/); if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
  const d = new Date(s); return isNaN(d) ? null : d;
}
function diasCad(v) { const d = parseFecha(v); if (!d) return null; const h = new Date(); h.setHours(0, 0, 0, 0); return Math.floor((d - h) / 86400000); }
const cadCls = d => d == null ? 'gris' : d < 0 ? 'rojo' : d <= INV_CFG.expiry.mes1 ? 'rojo' : d <= INV_CFG.expiry.mes6 ? 'amb' : 'verde';
const estadoCad = d => d == null ? 'Sin fecha' : d < 0 ? 'Vencido' : d <= INV_CFG.expiry.mes3 ? 'Por vencer' : 'Vigente';

async function load() {
  loading = true; loadErr = '';
  try {
    const u1 = `${INV_CFG.apiUrl}?tab=${encodeURIComponent(INV_CFG.tabs.detalle)}`;
    const u2 = `${INV_CFG.apiUrl}?tab=${encodeURIComponent(INV_CFG.tabs.consolidado)}`;
    const [d, c] = await Promise.all([
      fetch(u1).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' InvDetalle'); return r.json(); }),
      fetch(u2).then(r => { if (!r.ok) throw new Error('HTTP ' + r.status + ' InvConsolidado'); return r.json(); }),
    ]);
    DET = normalize(d); CONS = normalize(c); detectFields(CONS); loaded = true;
  } catch (e) { loadErr = e.message || String(e); }
  finally { loading = false; }
}

const cols = () => [
  { key: 'mat', label: 'Material', get: r => r[F.material] },
  { key: 'desc', label: 'Descripción', get: r => r[F.texto] },
  { key: 'cond', label: 'Condición', get: r => r[F.cond] },
  { key: 'grupo', label: 'Grupo', get: r => r[F.grupo] },
  { key: 'sector', label: 'Sector', get: r => r[F.sector] },
];
function filtered() {
  const C = cols();
  return (CONS || []).filter(r => {
    if (flt.cond && norm(r[F.cond]) !== flt.cond) return false;
    if (flt.grupo && norm(r[F.grupo]) !== flt.grupo) return false;
    if (flt.sector && norm(r[F.sector]) !== flt.sector) return false;
    return passes(r, C, flt);
  });
}

export function renderInventario(container) {
  if (!loaded) {
    container.innerHTML = `<div class="drop"><h2>🏷️ Inventario por condición</h2>
      <p class="muted">${loadErr ? '⚠️ ' + esc(loadErr) : (loading ? 'Conectando con el AppScript…' : 'Cargando…')}</p>
      ${loadErr ? '<p><button class="btn primary" id="re">Reintentar</button></p>' : ''}</div>`;
    container.querySelector('#re')?.addEventListener('click', () => { loaded = false; loadErr = ''; renderInventario(container); });
    if (!loading && !loadErr) load().then(() => renderInventario(container));
    return;
  }
  const isAdmin = admin.on();
  const distinct = field => [...new Set((CONS || []).map(r => norm(r[field])).filter(Boolean))].sort();
  const sel = (id, val, opts, lbl) => `<select data-cat="${id}"><option value="">${lbl}</option>${opts.map(o => `<option ${val === o ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
  const cats = `${sel('cond', flt.cond, distinct(F.cond), 'Condición (todas)')}
                ${F.grupo ? sel('grupo', flt.grupo, distinct(F.grupo), 'Grupo (todos)') : ''}
                ${F.sector ? sel('sector', flt.sector, distinct(F.sector), 'Sector (todos)') : ''}`;
  const adminBtn = `<button class="btn ${isAdmin ? 'primary' : ''}" data-admin>${isAdmin ? '🔓 Admin ON' : '🔒 Admin'}</button>`;

  container.innerHTML = `${toolbarHTML(cols(), flt, `${cats}${zoomHTML('inv')}${adminBtn}`)}<div class="result"></div>`;
  wireToolbar(container, flt, () => renderInventario(container), () => paint(container), makeSuggest(CONS || [], cols()));
  container.querySelectorAll('[data-cat]').forEach(s => s.onchange = e => { flt[e.target.dataset.cat] = e.target.value; paint(container); });
  container.querySelector('[data-admin]').onclick = () => { admin.setOn(!isAdmin); renderInventario(container); };
  paint(container);
}

function paint(container) {
  const isAdmin = admin.on(), hidden = admin.hidden();
  let list = filtered();
  if (!isAdmin) list = list.filter(r => !hidden.has(rowKey(r)));
  list = applySort(list, sort, accessor);

  const totMat = new Set((DET || []).map(r => norm(r.Material)).filter(Boolean)).size;
  const totLotes = (DET || []).length;
  const totUni = (DET || []).reduce((s, r) => s + num(r.CantidadDisp), 0);
  const totImp = F.importe ? list.reduce((s, r) => s + num(r[F.importe]), 0) : 0;

  const rk = F.importe ? [...list].map(r => ({ code: norm(r[F.material]), desc: norm(r[F.texto]).slice(0, 40), val: num(r[F.importe]) }))
    .filter(x => x.val > 0).sort((a, b) => b.val - a.val).slice(0, 10) : [];

  const head = `${isAdmin ? '<th></th>' : ''}
    ${th('Material + Descripción', 'mat', sort)}${th('Condición', 'cond', sort)}${F.grupo ? th('Grupo', 'grupo', sort) : ''}${th('Precio', 'precio', sort, 'num')}
    ${th('Disp 1031·1030', 'disp1030', sort, 'num')}${th('Disp 1031·1032', 'disp1032', sort, 'num')}
    ${INVCODES.map(c => th('Inv ' + c, 'inv' + c, sort, 'num')).join('')}${th('Inv Suma', 'invSuma', sort, 'num')}${th('Importe $', 'importe', sort, 'num')}`;

  const body = list.slice(0, 1000).map(r => {
    const mat = norm(r[F.material]), k = rowKey(r), isH = hidden.has(k);
    const inv = INVCODES.map(c => `<td class="num"><span class="lnk" data-mat="${esc(mat)}" data-cen="${c}">${fmt(r['Inv ' + c])}</span></td>`).join('');
    return `<tr class="${isAdmin && isH ? 'hidden-admin' : ''}">
      ${isAdmin ? `<td><span class="rowhide" data-hk="${esc(k)}" title="${isH ? 'Mostrar' : 'Ocultar'}">${isH ? '↩' : '🚫'}</span></td>` : ''}
      <td><div><span class="lnk" data-mat="${esc(mat)}" data-all="1">${esc(r[F.material])}</span></div><div class="muted" style="font-size:11px">${esc(r[F.texto])}</div></td>
      <td>${pill(norm(r[F.cond]) || '—', 'gris')}</td>
      ${F.grupo ? `<td>${esc(r[F.grupo])}</td>` : ''}
      <td class="num">${F.precio ? money(r[F.precio]) : '—'}</td>
      <td class="num"><span class="lnk" data-mat="${esc(mat)}" data-cen="1031" data-alm="1030">${fmt(r[F.disp1030])}</span></td>
      <td class="num"><span class="lnk" data-mat="${esc(mat)}" data-cen="1031" data-alm="1032">${fmt(r[F.disp1032])}</span></td>
      ${inv}
      <td class="num"><span class="lnk" data-mat="${esc(mat)}" data-all="1">${fmt(r[F.invSuma])}</span></td>
      <td class="num">${F.importe ? money(r[F.importe]) : '—'}</td></tr>`;
  }).join('');

  const colspan = (isAdmin ? 1 : 0) + 6 + (F.grupo ? 1 : 0) + INVCODES.length;
  container.querySelector('.result').innerHTML = `
    <div class="invtop">
      <div class="kpis2x2">
        <div class="kpi sm"><div class="lbl">Materiales</div><div class="val">${fmt(totMat)}</div></div>
        <div class="kpi sm"><div class="lbl">Lotes</div><div class="val">${fmt(totLotes)}</div></div>
        <div class="kpi sm"><div class="lbl">Stock global</div><div class="val">${fmt(totUni)}</div></div>
        <div class="kpi sm"><div class="lbl">Importe (filtro)</div><div class="val" style="font-size:18px">${money(totImp)}</div></div>
      </div>
      ${rankingHTML(rk, { title: '🏆 Top 10 por Importe $', money: true })}
    </div>
    <div class="tablecard">
      <h3>🏷️ Inventario por condición <span class="hint">clic en cantidad de centro = lotes · clic en Material/Inv Suma = todo el material${isAdmin ? ' · 🚫 oculta la fila' : ''}</span></h3>
      <div class="tbl"><table>
        <thead><tr>${head}</tr></thead>
        <tbody>${body || `<tr><td colspan="${colspan}" class="muted" style="padding:20px;text-align:center">Sin resultados</td></tr>`}</tbody>
      </table>${list.length > 1000 ? `<p class="muted" style="padding:8px">Mostrando 1000 de ${list.length}.</p>` : ''}</div>
    </div>`;

  wireZoom(container, 'inv', '.result .tbl table');
  container.querySelectorAll('.result th.sortable').forEach(thEl => thEl.addEventListener('click', e => {
    sort = cycleSort(sort, thEl.dataset.sort, e.shiftKey); paint(container);
  }));
  container.querySelectorAll('.result [data-hk]').forEach(x => x.onclick = () => { admin.toggle(x.dataset.hk); paint(container); });
  container.querySelectorAll('.result [data-mat]').forEach(el => el.addEventListener('click', () =>
    showLotes(el.dataset.mat, el.dataset.cen || null, el.dataset.alm || null)));
}

/* ---- API para otras vistas (Sugerencias) ---- */
export async function ensureInvData() { if (!loaded && !loading) await load(); return loaded; }
export function precioInv(material, condText) {
  if (!CONS || !F.material) return null;
  const m = norm(material), ct = norm(condText).toLowerCase();
  const rows = CONS.filter(r => norm(r[F.material]) === m);
  if (!rows.length) return null;
  const row = rows.find(r => {
    const c = norm(r[F.cond]).toLowerCase();
    return c && (ct.includes(c) || c.includes(ct) || (/corta/.test(c) && /corta/.test(ct)));
  });
  return row && F.precio ? num(row[F.precio]) : null;
}

function showLotes(material, centro, almacen) {
  const lotes = (DET || []).filter(r => {
    if (norm(r.Material) !== norm(material)) return false;
    if (centro && norm(r.Centro) !== norm(centro)) return false;
    if (almacen && norm(r['Almacén']) !== norm(almacen)) return false;
    return true;
  });
  let titulo = `Lotes · ${esc(material)}`;
  if (centro && almacen) titulo += ` (Centro ${esc(centro)} · Almacén ${esc(almacen)})`;
  else if (centro) titulo += ` (Centro ${esc(centro)})`;
  else titulo += ` (todos los centros)`;
  const total = lotes.reduce((s, r) => s + num(r.CantidadDisp), 0);
  const body = lotes.map(r => ({ r, d: diasCad(r.FechaCaducidad) }))
    .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9))
    .map(({ r, d }) => `<tr>
      <td>${esc(r.Centro)}</td><td>${esc(r['Almacén'])}</td><td>${esc(r.Lote)}</td><td>${esc(r.FechaCaducidad)}</td>
      <td class="num"><span class="tnd ${d != null && d <= INV_CFG.expiry.mes1 ? 'down' : ''}">${d == null ? '—' : d}</span></td>
      <td>${pill(estadoCad(d), cadCls(d))}</td><td class="num">${fmt(r.CantidadDisp)}</td></tr>`).join('');
  openModal(`
    <button class="x" onclick="closeModal()">×</button>
    <h2>${titulo}</h2>
    <p class="muted">${lotes.length} lote(s) · ${fmt(total)} unidades · rojo ≤${INV_CFG.expiry.mes1}d · ámbar ≤${INV_CFG.expiry.mes6}d</p>
    <div class="tablecard"><div class="tbl">
      <table><thead><tr><th>Centro</th><th>Almacén</th><th>Lote</th><th>Caducidad</th><th class="num">Días</th><th>Estado</th><th class="num">Cantidad</th></tr></thead>
      <tbody>${body || '<tr><td colspan="7" class="muted" style="padding:16px;text-align:center">Sin lotes.</td></tr>'}</tbody></table>
    </div></div>`);
}
