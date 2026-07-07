/* ===========================================================================
   cotizador.js · 🧾 Cotizador — arma cotizaciones reutilizando los datos del
   portal: cliente (info de centros/destinatarios/ejecutivo), materiales con
   inventario del centro elegido + disponible 1031 (alm 1030/1032), último
   precio facturado, precio en pedido y condiciones con precio oferta.
   Exporta la cotización a Excel para compartir.
   =========================================================================== */
import { norm, num, fmt, money, moneyD, esc, mesKey } from './utils.js';
import { store, C, RFC } from './store.js';
import { hoyMes, serieMaterial, precioMinAnioMaterial } from './resumenFac.js';
import { rssReady, rssCentros, rssCentro, rssMaterial } from './rssStore.js';
import { condicionesMaterial, precioInvMat, ensureInvData } from './inventario.js';
import { grupoCliente, ejecutivoNombre, matSector, matGrupo } from './enrich.js';
import { exportXlsx, stamp } from './exportx.js';
import { parseArrayBuffer } from './data.js';
import { openModal, closeModal } from './ui.js';

/* aviso flotante breve */
function toast(msg, kind) {
  const el = document.createElement('div');
  el.style.cssText = `position:fixed;left:50%;bottom:20px;transform:translateX(-50%);z-index:300;background:var(--panel);border:1px solid ${kind === 'err' ? '#e66' : 'var(--bd2)'};border-radius:10px;padding:10px 16px;font-size:13px;box-shadow:0 6px 20px #0007;max-width:90vw`;
  el.textContent = msg; document.body.appendChild(el);
  setTimeout(() => el.remove(), kind === 'err' ? 7000 : 4500);
}

/* ------------ estado de la cotización ------------ */
let COT = { solic: '', centro: '', lineas: [] };

/* ------------ datos del cliente ------------ */
function clienteInfo(solic) {
  const s = norm(solic); if (!s || !store.RF) return null;
  const razon = store.RF.solicRazon.get(s) || '';
  const ejec = ejecutivoNombre(store.RF.solicGpoV?.get(s) || '') || '';
  const grupo = grupoCliente(store.RF.solicGpoC?.get(s) || '') || (store.RF.solicGpoC?.get(s) || '');
  // destinatarios y centros observados (facturación + sugerencias + consumo)
  const dests = new Map(); const centros = new Set();
  (store.FACROWS || []).forEach(r => { if (norm(r[RFC.solic]) === s) { const d = norm(r[RFC.dest]); if (d) dests.set(d, norm(r[RFC.razon])); const c = norm(r[RFC.centro]); if (c) centros.add(c); } });
  (store.BO || []).forEach(it => { const b = it.bo; if (norm(b[C.solic]) === s) { const d = norm(b[C.dest]); if (d && !dests.has(d)) dests.set(d, norm(b[C.razon])); const c = norm(b[C.centro]); if (c) centros.add(c); } });
  return { solic: s, razon, ejec, grupo, dests, centros: [...centros].sort() };
}

/* ------------ precios ------------ */
export function ultPrecioFacturado(material, solic) {
  const m = norm(material), s = norm(solic); let best = null;
  (store.FACROWS || []).forEach(r => {
    if (norm(r[RFC.material]) !== m) return;
    if (s && norm(r[RFC.solic]) !== s) return;
    const k = mesKey(norm(r[RFC.mes])); const c = num(r[RFC.cant]), i = num(r[RFC.imp]);
    if (c > 0 && i > 0 && (!best || k > best.k)) best = { k, precio: i / c, mes: norm(r[RFC.mes]) };
  });
  return best;                                     // {precio, mes} | null
}
export function precioEnPedido(material, solic) {
  const m = norm(material), s = norm(solic); let best = null;
  (store.BO || []).forEach(it => { const b = it.bo;
    if (norm(b[C.matBase]) !== m) return;
    if (s && norm(b[C.solic]) !== s) return;
    const p = num(b[C.precio]); if (p > 0 && (!best || norm(b[C.fecha]) > best.fecha)) best = { precio: p, fecha: norm(b[C.fecha]), pedido: norm(b[C.pedido]) };
  });
  return best;                                     // {precio, fecha, pedido} | null
}

/* ------------ inventario por centro (RSS) ------------ */
function invCentro(material, centro) {
  const co = rssCentro(material, centro); if (!co) return null;
  let inv = 0, pend = 0, transito = 0; const alm = [];
  co.alm.forEach(a => { inv += (a.inv || 0); pend += (a.pend || 0); transito += (a.transito || 0); alm.push({ alm: a.alm, inv: a.inv || 0, pend: a.pend || 0, tr: a.transito || 0 }); });
  return { inv, pend, transito, alm };
}
function disp1031(material) {
  const mo = rssMaterial(material); if (!mo) return { d1030: 0, d1032: 0 };
  return { d1030: mo.disp1030 || 0, d1032: mo.disp1032 || 0 };
}

/* ------------ importar Excel a la cotización ------------ */
/* sinónimos de columnas (normaliza encabezados variados) */
const COL_SYN = {
  material: ['material', 'codigo', 'código', 'cod', 'sku', 'clave', 'articulo', 'artículo', 'no. material', 'num material', 'no material', 'mat'],
  desc: ['descripcion', 'descripción', 'texto breve del material', 'texto breve', 'texto material', 'desc', 'descr', 'nombre', 'producto'],
  cant: ['cantidad', 'cant', 'qty', 'piezas', 'pzas', 'pz', 'unidades'],
  precio: ['precio', 'precio oferta', 'precio unitario', 'p.u.', 'pu', 'costo', 'importe unitario'],
  cond: ['condicion', 'condición', 'fuente', 'cond', 'estado material'],
};
const canon = s => norm(s).toLowerCase().replace(/\s+/g, ' ').replace(/[._]/g, ' ').trim();
function detectCols(headers) {
  const out = {}; const H = headers.map(h => ({ raw: h, c: canon(h) }));
  for (const [key, syns] of Object.entries(COL_SYN)) {
    let hit = H.find(h => syns.includes(h.c));                    // match exacto
    if (!hit) hit = H.find(h => syns.some(sy => h.c.includes(sy)));// match parcial
    if (hit) out[key] = hit.raw;
  }
  return out;
}

/* índice del catálogo por código y por descripción (para el match) */
let CAT_IDX = null;
function catalogo() {
  if (CAT_IDX) return CAT_IDX;
  const byCode = new Map(), byDesc = [];
  const add = (code, desc) => { const c = norm(code); if (!c) return; if (!byCode.has(c)) byCode.set(c, desc || ''); if (desc) byDesc.push({ code: c, d: canon(desc) }); };
  if (store.RF) store.RF.matTexto.forEach((t, m) => add(m, t));
  condicionesMaterial && 0; // (silencia linter)
  CAT_IDX = { byCode, byDesc };
  return CAT_IDX;
}
/* resuelve una fila del Excel a un código de material (por código o descripción) */
function matchMaterial(codeRaw, descRaw) {
  const cat = catalogo();
  const code = norm(codeRaw);
  if (code && cat.byCode.has(code)) return { code, via: 'código' };
  // por código aunque no esté en catálogo (se cotiza igual)
  if (code) return { code, via: 'código' };
  // por descripción: exacta, luego por inclusión de tokens
  const d = canon(descRaw);
  if (d) {
    const ex = cat.byDesc.find(x => x.d === d); if (ex) return { code: ex.code, via: 'descripción' };
    const toks = d.split(' ').filter(t => t.length > 2);
    let best = null, bestScore = 0;
    for (const x of cat.byDesc) { let sc = 0; for (const t of toks) if (x.d.includes(t)) sc++; if (sc > bestScore) { bestScore = sc; best = x; } }
    if (best && bestScore >= Math.max(2, Math.ceil(toks.length * 0.5))) return { code: best.code, via: 'descripción~' };
  }
  return null;
}

/* procesa filas de un Excel importado y agrega líneas a la cotización.
   explicitCols (opcional) fuerza el mapeo {material,desc,cant,precio,cond}. */
export function importarFilas(rows, explicitCols) {
  if (!rows || !rows.length) return { added: 0, nomatch: 0 };
  const cols = explicitCols || detectCols(Object.keys(rows[0]));
  if (!cols.material && !cols.desc) return { added: 0, nomatch: rows.length, needMap: true, err: 'No encontré columna de Código ni Descripción.' };
  let added = 0, nomatch = 0;
  for (const r of rows) {
    const mm = matchMaterial(cols.material ? r[cols.material] : '', cols.desc ? r[cols.desc] : '');
    if (!mm) { nomatch++; continue; }
    if (COT.lineas.some(l => l.material === mm.code)) {           // si ya está, suma cantidad
      const ex = COT.lineas.find(l => l.material === mm.code);
      if (cols.cant && num(r[cols.cant]) > 0) ex.cant += Math.round(num(r[cols.cant]));
      added++; continue;
    }
    const l = nuevaLinea(mm.code);
    if (cols.cant && num(r[cols.cant]) > 0) l.cant = Math.max(1, Math.round(num(r[cols.cant])));   // cantidad manual del Excel
    if (cols.precio && num(r[cols.precio]) > 0) l.precio = num(r[cols.precio]);                     // precio manual del Excel
    if (cols.cond && norm(r[cols.cond])) {                                                          // condición si coincide
      const cc = norm(r[cols.cond]); const hit = l.conds.find(c => canon(c.cond) === canon(cc) || canon(c.cond).includes(canon(cc)));
      if (hit) { l.cond = hit.cond; if (hit.precio != null && !(cols.precio && num(r[cols.precio]) > 0)) l.precio = hit.precio; }
    }
    COT.lineas.push(l); added++;
  }
  return { added, nomatch, cols };
}

/* ---- mapeo manual: el usuario elige hojas y columnas ---- */
let IMP = null;   // { names, grids, sel:Set(hojas), preview, headerRow, map:{campo->label} }

const guessHeaderRow = grid => {
  let best = 0, bestScore = -1;
  const syn = Object.values(COL_SYN).flat();
  (grid || []).slice(0, 15).forEach((row, i) => {
    const cells = row.map(canon).filter(Boolean);
    const textCells = cells.filter(c => /[a-z]/.test(c)).length;
    const hits = cells.filter(c => syn.some(sy => c.includes(sy))).length;
    const score = hits * 5 + textCells;
    if (score > bestScore) { bestScore = score; best = i; }
  });
  return best;
};
const sheetsConDatos = imp => imp.names.filter(n => (imp.grids[n] || []).length > 1);

export function openMapeoManual(imp, onDone) {
  IMP = imp;
  const conDatos = sheetsConDatos(IMP);
  // por defecto la hoja MÁS GRANDE (suele ser la consolidada, p. ej. "General")
  IMP.preview = conDatos.slice().sort((a, b) => (IMP.grids[b] || []).length - (IMP.grids[a] || []).length)[0] || IMP.names[0];
  IMP.sel = new Set([IMP.preview]);                       // solo esa hoja; el usuario decide el resto
  IMP.headerRow = guessHeaderRow(IMP.grids[IMP.preview] || []);
  IMP.map = null;
  renderMapeo(onDone);
}

function headerLabels(sheet, hr) {
  const grid = IMP.grids[sheet] || []; const row = grid[hr] || [];
  return row.map((v, i) => ({ i, label: norm(v) || `Columna ${i + 1}` }));
}
function autoLabel(cells, key) {
  const syns = COL_SYN[key];
  let hit = cells.find(c => syns.includes(canon(c.label))); if (!hit) hit = cells.find(c => syns.some(sy => canon(c.label).includes(sy)));
  return hit ? hit.label : '';
}

function renderMapeo(onDone) {
  const conDatos = sheetsConDatos(IMP);
  const grid = IMP.grids[IMP.preview] || [];
  const cells = headerLabels(IMP.preview, IMP.headerRow);
  if (!IMP.map) IMP.map = { material: autoLabel(cells, 'material'), desc: autoLabel(cells, 'desc'), cant: autoLabel(cells, 'cant'), precio: autoLabel(cells, 'precio'), cond: autoLabel(cells, 'cond') };
  const opts = sel => `<option value="">— ninguna —</option>` + cells.map(c => `<option ${sel === c.label ? 'selected' : ''}>${esc(c.label)}</option>`).join('');
  const preview = [grid[IMP.headerRow] || [], ...grid.slice(IMP.headerRow + 1, IMP.headerRow + 4)];
  const prevHTML = `<div class="tbl" style="max-height:170px"><table><tbody>${preview.map((row, ri) => `<tr>${(row || []).map(c => `<td style="${ri === 0 ? 'font-weight:600;background:var(--panel2)' : ''}">${esc(String(c ?? ''))}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;

  openModal(`
    <button class="x" onclick="closeModal()">×</button>
    <div class="detail-head">🗂️ Importar cotización — tú eliges hojas y columnas</div>
    <div class="card"><h3>1) ¿Qué hojas incluir?</h3>
      <div style="display:flex;flex-wrap:wrap;gap:8px 16px">
        ${conDatos.map(n => `<label class="shrow" style="margin:0"><input type="checkbox" data-mp-sheet="${esc(n)}" ${IMP.sel.has(n) ? 'checked' : ''}> ${esc(n)} <span class="muted">(${(IMP.grids[n] || []).length - 1} filas)</span></label>`).join('')}
      </div>
      <p class="muted" style="font-size:11px">El mapeo de columnas se hace por nombre, así que aplica a todas las hojas marcadas (cada hoja detecta su propia fila de encabezado). Si marcas varias hojas que comparten materiales (p. ej. una consolidada y otra por color), las líneas idénticas <b>no se duplican</b>.</p>
    </div>
    <div class="toolbar" style="align-items:flex-end">
      <div><label class="lbl">Hoja para configurar/previsualizar</label><br><select id="mpPrev">${conDatos.map(n => `<option ${n === IMP.preview ? 'selected' : ''}>${esc(n)}</option>`).join('')}</select></div>
      <div><label class="lbl">Fila de encabezado</label><br><select id="mpHdr">${grid.slice(0, 15).map((r, i) => `<option value="${i}" ${i === IMP.headerRow ? 'selected' : ''}>Fila ${i + 1}: ${esc((r || []).map(x => norm(x)).filter(Boolean).slice(0, 4).join(' | ')).slice(0, 55)}</option>`).join('')}</select></div>
    </div>
    <div class="card"><h3>Vista previa</h3>${prevHTML}</div>
    <div class="card"><h3>2) ¿Qué columnas considerar?</h3>
      <div class="mkpis">
        <div class="stat"><div class="l">Material / Código *</div><select id="mpMaterial">${opts(IMP.map.material)}</select></div>
        <div class="stat"><div class="l">Descripción</div><select id="mpDesc">${opts(IMP.map.desc)}</select></div>
        <div class="stat"><div class="l">Cantidad</div><select id="mpCant">${opts(IMP.map.cant)}</select></div>
        <div class="stat"><div class="l">Precio</div><select id="mpPrecio">${opts(IMP.map.precio)}</select></div>
        <div class="stat"><div class="l">Condición</div><select id="mpCond">${opts(IMP.map.cond)}</select></div>
      </div>
      <p class="muted" style="font-size:11px">* Obligatorio Material o Descripción. Cantidad, Precio y Condición son opcionales y quedan editables después.</p>
      <div style="text-align:right;margin-top:8px"><button class="btn primary" id="mpGo">Importar ▶</button></div>
    </div>`);

  const saveMap = () => { IMP.map = { material: v('mpMaterial'), desc: v('mpDesc'), cant: v('mpCant'), precio: v('mpPrecio'), cond: v('mpCond') }; };
  const v = id => document.getElementById(id).value;
  document.querySelectorAll('[data-mp-sheet]').forEach(ch => ch.addEventListener('change', () => { ch.checked ? IMP.sel.add(ch.dataset.mpSheet) : IMP.sel.delete(ch.dataset.mpSheet); }));
  document.getElementById('mpPrev').addEventListener('change', e => { saveMap(); IMP.preview = e.target.value; IMP.headerRow = guessHeaderRow(IMP.grids[IMP.preview] || []); IMP.map = null; renderMapeo(onDone); });
  document.getElementById('mpHdr').addEventListener('change', e => { saveMap(); IMP.headerRow = +e.target.value; IMP.map = null; renderMapeo(onDone); });
  document.getElementById('mpGo').addEventListener('click', () => {
    saveMap();
    if (!IMP.map.material && !IMP.map.desc) { toast('Asigna al menos Material o Descripción', 'err'); return; }
    if (!IMP.sel.size) { toast('Marca al menos una hoja', 'err'); return; }
    const explicit = {}; for (const k of ['material', 'desc', 'cant', 'precio', 'cond']) if (IMP.map[k]) explicit[k] = '__' + k;
    let dataRows = []; const vistos = new Set();
    for (const sheet of IMP.sel) {
      const g = IMP.grids[sheet] || []; const hr = sheet === IMP.preview ? IMP.headerRow : guessHeaderRow(g);
      const hdr = (g[hr] || []).map(norm);
      const idxOf = label => hdr.findIndex(h => canon(h) === canon(label));
      const colIdx = {}; for (const k of ['material', 'desc', 'cant', 'precio', 'cond']) if (IMP.map[k]) colIdx[k] = idxOf(IMP.map[k]);
      g.slice(hr + 1).forEach(row => {
        const o = {}; let any = false;
        for (const [k, idx] of Object.entries(colIdx)) if (idx >= 0) { o['__' + k] = row[idx]; if (k === 'material' || k === 'desc') any = any || norm(row[idx]); }
        if (!any) return;
        // evitar duplicar la MISMA línea presente en varias hojas (p. ej. color + consolidada)
        const sig = [norm(o.__material), norm(o.__desc), norm(o.__cant), norm(o.__cond), norm(o.__precio)].join('¦');
        if (vistos.has(sig)) return; vistos.add(sig);
        dataRows.push(o);
      });
    }
    closeModal();
    onDone(importarFilas(dataRows, explicit));
  });
}

/* ------------ construir línea ------------ */
function nuevaLinea(material) {
  const m = norm(material);
  const conds = condicionesMaterial(m) || [];
  const upf = ultPrecioFacturado(m, COT.solic);
  const ped = precioEnPedido(m, COT.solic);
  const condSel = conds.length ? conds[0].cond : '';
  const pSel = conds.length && conds[0].precio != null ? conds[0].precio : (precioInvMat(m) ?? (upf ? +upf.precio.toFixed(2) : 0));
  return { material: m, texto: store.RF?.matTexto.get(m) || (conds[0] && conds[0].descripcion) || '',
    centro: COT.centro || '', conds, cond: condSel, precio: pSel, cant: 1, upf, ped };
}

/* ------------ render ------------ */
export function renderCotizador(container) {
  ensureInvData().catch(() => {});
  CAT_IDX = null;                                   // refrescar índice del catálogo
  const info = clienteInfo(COT.solic);
  const clientes = store.RF ? [...store.RF.solicRazon.entries()].map(([code, r]) => ({ code, r })) : [];
  const materiales = store.RF ? [...store.RF.matTexto.entries()] : [];
  const centros = rssReady() ? rssCentros() : [];

  container.innerHTML = `
    <div class="detail-head">🧾 Cotizador</div>
    <div class="toolbar" style="align-items:flex-end">
      <div><label class="lbl">Cliente (solicitante)</label><br>
        <input id="cotCli" list="dlCotCli" placeholder="código o razón social" value="${esc(COT.solic)}" style="min-width:230px">
        <datalist id="dlCotCli">${clientes.slice(0, 4000).map(c => `<option value="${esc(c.code)}">${esc(c.r)}</option>`).join('')}</datalist></div>
      <div><label class="lbl">Centro a cotizar</label><br>
        <input id="cotCen" list="dlCotCen" placeholder="p. ej. 1018" value="${esc(COT.centro)}" style="width:110px">
        <datalist id="dlCotCen">${centros.map(c => `<option value="${esc(c)}">`).join('')}</datalist></div>
      <div style="flex:1"><label class="lbl">Agregar material</label><br>
        <input id="cotMat" list="dlCotMat" placeholder="código o descripción…" style="width:100%">
        <datalist id="dlCotMat">${materiales.slice(0, 6000).map(([m, t]) => `<option value="${esc(m)}">${esc(t)}</option>`).join('')}</datalist></div>
      <button class="btn primary" id="cotAdd">➕ Agregar</button>
      <button class="btn" id="cotImp">📥 Importar Excel</button>
      <input type="file" id="cotFile" accept=".xlsx,.xls,.csv" style="display:none">
      <button class="btn" id="cotXls" ${COT.lineas.length ? '' : 'disabled'}>⬇️ Excel cotización</button>
      <button class="btn" id="cotClear" ${COT.lineas.length ? '' : 'disabled'}>🗑️ Vaciar</button>
    </div>

    ${info ? `<div class="factbar">
      <span><b>Cliente</b> ${esc(info.razon) || '—'} (${esc(info.solic)})</span>
      <span><b>Ejecutivo</b> ${esc(info.ejec) || '—'}</span>
      <span><b>Grupo cliente</b> ${esc(info.grupo) || '—'}</span>
      <span><b>Centros del cliente</b> ${info.centros.join(', ') || '—'}</span>
      <span><b>Destinatarios</b> ${info.dests.size ? [...info.dests.entries()].slice(0, 6).map(([d, r]) => `${esc(d)}${r && r !== info.razon ? ' (' + esc(r) + ')' : ''}`).join(', ') + (info.dests.size > 6 ? ` +${info.dests.size - 6}` : '') : '—'}</span>
    </div>` : (COT.solic ? '<p class="muted">Cliente no encontrado en la facturación cargada.</p>' : '')}

    ${COT.lineas.length ? lineasHTML() : '<div class="empty"><p>Elige el cliente y el centro, y agrega materiales. Verás inventario del centro, disponible 1031 (alm. 1030/1032), último precio facturado, precio en pedido y las condiciones con su precio oferta.</p></div>'}
    ${COT.lineas.length ? `<div class="card"><h3>Total</h3><div class="v" style="font-size:20px"><b>${money(totalCot())}</b> · ${fmt(COT.lineas.reduce((a, l) => a + num(l.cant), 0))} pieza(s)</div></div>` : ''}
  `;
  wire(container);
}

const totalCot = () => COT.lineas.reduce((a, l) => a + num(l.cant) * num(l.precio), 0);

function lineasHTML() {
  const centros = rssReady() ? rssCentros() : [];
  const rows = COT.lineas.map((l, i) => {
    const ic = l.centro ? invCentro(l.material, l.centro) : null;
    const d = disp1031(l.material);
    const condOpts = l.conds.length
      ? l.conds.map(c => `<option value="${esc(c.cond)}" data-precio="${c.precio ?? ''}" ${c.cond === l.cond ? 'selected' : ''}>${esc(c.cond)}${c.precio != null ? ' · ' + moneyD(c.precio) : ''}${c.stock ? ' · stock ' + fmt(c.stock) : ''}</option>`).join('')
      : '<option value="">(sin condición)</option>';
    return `<tr>
      <td><span class="lnk" data-cot-inv="${esc(l.material)}"><b>${esc(l.material)}</b></span><div class="sub">${esc(l.texto)}</div>
          <div class="sub">${esc(matSector(l.material)) || ''}${matGrupo(l.material) ? ' · ' + esc(matGrupo(l.material)) : ''}</div></td>
      <td><select data-cot-cen="${i}" title="Ver inventario de otro centro"><option value="">— centro —</option>${centros.map(c => `<option ${c === l.centro ? 'selected' : ''}>${esc(c)}</option>`).join('')}</select>
          <div class="sub">${ic ? `Inv <b>${fmt(ic.inv)}</b> · Pend ${fmt(ic.pend)}${ic.transito ? ' · <span class="tnd up">+' + fmt(ic.transito) + '</span> en curso' : ''}` : (l.centro ? 'sin datos del centro' : '')}</div>
          <div class="sub">${ic && ic.alm.length ? ic.alm.map(a => `${esc(a.alm)}: ${fmt(a.inv)}`).join(' · ') : ''}</div></td>
      <td class="num">${fmt(d.d1030)}<div class="sub">alm 1030</div></td>
      <td class="num">${fmt(d.d1032)}<div class="sub">alm 1032</div></td>
      <td class="num">${l.upf ? `${moneyD(l.upf.precio)}<div class="sub">${esc(l.upf.mes)}</div>` : '—'}</td>
      <td class="num">${l.ped ? `${moneyD(l.ped.precio)}<div class="sub">${esc(l.ped.fecha) || 'pedido ' + esc(l.ped.pedido)}</div>` : '—'}</td>
      <td><select data-cot-cond="${i}">${condOpts}</select></td>
      <td class="num"><input type="number" step="0.0001" min="0" value="${l.precio}" data-cot-precio="${i}" style="width:96px;text-align:right"></td>
      <td class="num"><input type="number" step="1" min="1" value="${l.cant}" data-cot-cant="${i}" style="width:70px;text-align:right"></td>
      <td class="num"><b>${money(num(l.cant) * num(l.precio))}</b></td>
      <td><span class="lnk" data-cot-del="${i}" title="Quitar">✖</span></td></tr>`;
  }).join('');
  return `<div class="tablecard"><h3>Materiales cotizados <span class="hint">clic al material para ver su detalle completo · cambia el centro para ver otro inventario</span></h3>
    <div class="tbl"><table><thead><tr>
      <th>Material</th><th>Inventario del centro</th><th class="num">Disp. 1031</th><th class="num">Disp. 1031</th>
      <th class="num">Últ. precio fact.</th><th class="num">Precio en pedido</th><th>Condición</th>
      <th class="num">Precio oferta</th><th class="num">Cantidad</th><th class="num">Importe</th><th></th>
    </tr></thead><tbody>${rows}</tbody></table></div></div>`;
}

function wire(container) {
  const rerender = () => renderCotizador(container);
  container.querySelector('#cotCli')?.addEventListener('change', e => { COT.solic = norm(e.target.value); rerender(); });
  container.querySelector('#cotCen')?.addEventListener('change', e => { COT.centro = norm(e.target.value); COT.lineas.forEach(l => { if (!l.centroManual) l.centro = COT.centro; }); rerender(); });
  const add = () => {
    const inp = container.querySelector('#cotMat'); const m = norm(inp && inp.value); if (!m) return;
    if (COT.lineas.some(l => l.material === m)) { inp.value = ''; return; }
    ensureInvData().finally(() => { COT.lineas.push(nuevaLinea(m)); rerender(); });
  };
  container.querySelector('#cotAdd')?.addEventListener('click', add);
  container.querySelector('#cotMat')?.addEventListener('keydown', e => { if (e.key === 'Enter') add(); });
  container.querySelector('#cotClear')?.addEventListener('click', () => { COT.lineas = []; rerender(); });
  container.querySelector('#cotXls')?.addEventListener('click', exportCotizacion);
  // importar Excel
  const fileInp = container.querySelector('#cotFile');
  container.querySelector('#cotImp')?.addEventListener('click', () => fileInp && fileInp.click());
  fileInp?.addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; if (!f) return;
    const btn = container.querySelector('#cotImp'); if (btn) { btn.disabled = true; btn.textContent = '⏳ Leyendo…'; }
    try {
      const buf = await f.arrayBuffer();
      const parsed = await parseArrayBuffer(buf);
      await ensureInvData().catch(() => {});
      // SIEMPRE dejar que el usuario elija hojas y columnas
      openMapeoManual({ names: parsed.names, grids: parsed.grids || {} }, res => {
        rerender();
        toast(res.err && !res.added ? '⚠️ ' + res.err : `✔ ${res.added} material(es) importado(s)${res.nomatch ? ` · ${res.nomatch} sin coincidencia` : ''}`, (res.err && !res.added) ? 'err' : 'ok');
      });
    } catch (err) { toast('⚠️ No se pudo leer el archivo', 'err'); }
    finally { const b2 = document.querySelector('#cotImp'); if (b2) { b2.disabled = false; b2.textContent = '📥 Importar Excel'; } if (fileInp) fileInp.value = ''; }
  });
  container.querySelectorAll('[data-cot-del]').forEach(el => el.addEventListener('click', () => { COT.lineas.splice(+el.dataset.cotDel, 1); rerender(); }));
  container.querySelectorAll('[data-cot-cen]').forEach(el => el.addEventListener('change', () => { const l = COT.lineas[+el.dataset.cotCen]; l.centro = norm(el.value); l.centroManual = true; rerender(); }));
  container.querySelectorAll('[data-cot-cond]').forEach(el => el.addEventListener('change', () => {
    const l = COT.lineas[+el.dataset.cotCond]; l.cond = el.value;
    const opt = el.selectedOptions[0]; const p = opt && opt.dataset.precio; if (p !== '' && p != null) l.precio = +p;
    rerender();
  }));
  container.querySelectorAll('[data-cot-precio]').forEach(el => el.addEventListener('change', () => { COT.lineas[+el.dataset.cotPrecio].precio = num(el.value); rerender(); }));
  container.querySelectorAll('[data-cot-cant]').forEach(el => el.addEventListener('change', () => { COT.lineas[+el.dataset.cotCant].cant = Math.max(1, Math.round(num(el.value))); rerender(); }));
  container.querySelectorAll('[data-cot-inv]').forEach(el => el.addEventListener('click', () => window.__openMaterialInv && window.__openMaterialInv(el.dataset.cotInv)));
}

/* ------------ exportar ------------ */
function exportCotizacion() {
  const info = clienteInfo(COT.solic) || { razon: '', ejec: '', grupo: '' };
  const rows = COT.lineas.map(l => {
    const ic = l.centro ? invCentro(l.material, l.centro) : null; const d = disp1031(l.material);
    return {
      'Fecha': new Date().toLocaleDateString('es-MX'),
      'Cliente (solicitante)': COT.solic, 'Razón social': info.razon, 'Ejecutivo': info.ejec, 'Grupo cliente': info.grupo,
      'Centro': l.centro || COT.centro || '',
      'Material': l.material, 'Descripción': l.texto,
      'Sector': matSector(l.material) || '', 'Grupo art.': matGrupo(l.material) || '',
      'Condición': l.cond || '', 'Precio oferta': num(l.precio), 'Cantidad': num(l.cant), 'Importe': num(l.cant) * num(l.precio),
      'Inv centro': ic ? ic.inv : '', 'Pend centro': ic ? ic.pend : '',
      'Disp 1031-1030': d.d1030, 'Disp 1031-1032': d.d1032,
      'Últ. precio facturado': l.upf ? +l.upf.precio.toFixed(4) : '', 'Mes últ. fact.': l.upf ? l.upf.mes : '',
      'Precio en pedido': l.ped ? l.ped.precio : '', 'Pedido ref.': l.ped ? l.ped.pedido : '',
    };
  });
  rows.push({ 'Material': 'TOTAL', 'Importe': totalCot(), 'Cantidad': COT.lineas.reduce((a, l) => a + num(l.cant), 0) });
  exportXlsx(`cotizacion_${norm(COT.solic) || 'cliente'}_${stamp()}.xlsx`, rows, 'Cotización');
}
