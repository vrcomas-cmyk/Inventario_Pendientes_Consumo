
(function() {
    "use strict";


    let rawDetalleData = []; // Caché global de lotes para las consultas del modal

    // =====================================================================
    // Utilidades
    // =====================================================================
    function $(id) { return document.getElementById(id); }

    function waitForTabulator(cb) {
        if (typeof Tabulator !== 'undefined') cb();
        else setTimeout(() => waitForTabulator(cb), 50);
    }

    function escapeHtml(str) {
        if (str === undefined || str === null) return '';
        return String(str)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    }

    function toNum(val) {
        if (val === undefined || val === null) return NaN;
        if (typeof val === 'number') return isNaN(val) ? NaN : val;
        let s = String(val).trim();
        if (s === '' || s === '-' || s === '–' || s === '—') return NaN;
        s = s.replace(/[$€£¥]/g, '').replace(/\s+/g, '').replace(/,/g, '');
        const n = parseFloat(s);
        return isNaN(n) ? NaN : n;
    }

    function normalizeKey(k) {
        return String(k).replace(/\s+/g, ' ').trim();
    }

    function normalizeData(rows) {
        if (!Array.isArray(rows)) return [];
        return rows.map(row => {
            const out = {};
            for (const k in row) {
                let v = row[k];
                if (typeof v === 'string') {
                    v = v.trim();
                }
                out[normalizeKey(k)] = v;
            }
            return out;
        });
    }

    function findField(allKeys, candidates) {
        for (const c of candidates) {
            if (allKeys.indexOf(c) !== -1) return c;
        }
        const lowMap = {};
        allKeys.forEach(k => { lowMap[k.toLowerCase()] = k; });
        for (const c of candidates) {
            const m = lowMap[c.toLowerCase()];
            if (m) return m;
        }
        return null;
    }

    const fmtMXN = new Intl.NumberFormat('es-MX', {
        style: 'currency', currency: 'MXN', maximumFractionDigits: 2
    });

    // ---- Helpers de visualización de tabla ----
    // Orden numérico real sobre celdas que vienen como texto ("1,234.00")
    function numSorter(a, b) {
        const x = toNum(a), y = toNum(b);
        const xn = isNaN(x) ? -Infinity : x;
        const yn = isNaN(y) ? -Infinity : y;
        return xn - yn;
    }
    // Suma para fila de totales (bottomCalc) ignorando texto/no-numéricos
    function sumCalc(values) {
        let s = 0;
        values.forEach(v => { const n = toNum(v); if (!isNaN(n)) s += n; });
        return s;
    }
    const calcInt = (cell) => {
        const v = cell.getValue();
        return (typeof v === 'number' && !isNaN(v)) ? v.toLocaleString('es-MX', { maximumFractionDigits: 0 }) : '';
    };
    const calcMXN = (cell) => {
        const v = cell.getValue();
        return (typeof v === 'number' && !isNaN(v)) ? fmtMXN.format(v) : '';
    };

    // Barra de magnitud proporcional al máximo de la columna (factory con closure)
    function makeBarFormatter(maxVal, lowThreshold) {
        return function (cell) {
            const v = toNum(cell.getValue());
            const n = isNaN(v) ? 0 : v;
            if (n <= 0) {
                return `<div class="bar-cell"><span class="bar-val is-zero">0</span></div>`;
            }
            const pct = maxVal > 0 ? Math.max(4, Math.round((n / maxVal) * 100)) : 4;
            const tier = n < lowThreshold ? 'bar-low' : (n < lowThreshold * 6 ? 'bar-mid' : 'bar-ok');
            return `<div class="bar-cell">
                        <div class="bar-fill ${tier}" style="width:${pct}%"></div>
                        <span class="bar-val">${n.toLocaleString('es-MX')}</span>
                    </div>`;
        };
    }

    // Parseo flexible de fechas (ISO, dd/mm/yyyy, dd-mm-yyyy)
    function parseFecha(val) {
        if (!val) return null;
        const s = String(val).trim();
        let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3]);
        m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
        if (m) return new Date(+m[3], +m[2] - 1, +m[1]);
        const d = new Date(s);
        return isNaN(d.getTime()) ? null : d;
    }
    // Caducidad con color por meses: vencido / ≤1m / ≤3m / ≤6m / >6m. Muestra meses y días.
    function caducidadFormatter(cell) {
        const raw = cell.getValue();
        const d = parseFecha(raw);
        if (!d) return escapeHtml(raw == null ? '' : String(raw));
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const dias = Math.floor((d - hoy) / 86400000);
        const txt = d.toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });

        if (dias < 0) {
            return `<span class="exp-badge exp-vencido">${escapeHtml(txt)} · vencido (${Math.abs(dias)}d)</span>`;
        }
        const meses = Math.floor(dias / 30.44);
        const restante = meses >= 1
            ? `${meses} ${meses === 1 ? 'mes' : 'meses'} · ${dias}d`
            : `${dias}d`;
        let cls = 'exp-ok';
        if (dias <= CONFIG.expiry.mes1) cls = 'exp-1m';
        else if (dias <= CONFIG.expiry.mes3) cls = 'exp-3m';
        else if (dias <= CONFIG.expiry.mes6) cls = 'exp-6m';
        return `<span class="exp-badge ${cls}">${escapeHtml(txt)} · ${restante}</span>`;
    }

    // ---- Persistencia ligera de estado de UI ----
    const store = {
        get(k, d) { try { if (!CONFIG.persistUi) return d; const v = localStorage.getItem('degasa.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
        set(k, v) { try { if (CONFIG.persistUi) localStorage.setItem('degasa.' + k, JSON.stringify(v)); } catch (e) {} }
    };

    // ---- Clasificación para filtros rápidos ----
    function classifyCaducidad(rows) {
        const c = { vencido: 0, porVencer: 0, vigente: 0, sinFecha: 0 };
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        rows.forEach(r => {
            const d = parseFecha(r.FechaCaducidad);
            if (!d) { r._estado_cad = 'SIN FECHA'; c.sinFecha++; return; }
            const dias = Math.floor((d - hoy) / 86400000);
            if (dias < 0) { r._estado_cad = 'VENCIDO'; c.vencido++; }
            else if (dias <= CONFIG.expiry.mes3) { r._estado_cad = 'POR VENCER'; c.porVencer++; }
            else { r._estado_cad = 'VIGENTE'; c.vigente++; }
        });
        return c;
    }
    function classifyStock(rows, fields) {
        const c = { agotado: 0, bajo: 0, ok: 0 };
        const f = fields.invSuma;
        rows.forEach(r => {
            const v = f ? toNum(r[f]) : NaN;
            const n = isNaN(v) ? 0 : v;
            if (n <= 0) { r._estado_stock = 'AGOTADO'; c.agotado++; }
            else if (n < CONFIG.lowStock) { r._estado_stock = 'BAJO'; c.bajo++; }
            else { r._estado_stock = 'OK'; c.ok++; }
        });
        return c;
    }
    function renderCaducidadControls(c) {
        const el = document.getElementById('cadControls'); if (!el) return;
        el.innerHTML = `
            <span class="qf-label"><i class="fas fa-clock"></i> Filtro rápido:</span>
            <button class="qf-btn qf-danger" data-qf="VENCIDO"><i class="fas fa-triangle-exclamation"></i> Vencidos <b>${c.vencido}</b></button>
            <button class="qf-btn qf-warn" data-qf="POR VENCER"><i class="fas fa-hourglass-half"></i> Por vencer ≤${CONFIG.expiry.mes3}d <b>${c.porVencer}</b></button>
            <button class="qf-btn" data-qf=""><i class="fas fa-list"></i> Todos</button>`;
    }
    function renderStockControls(c) {
        const el = document.getElementById('stkControls'); if (!el) return;
        el.innerHTML = `
            <span class="qf-label"><i class="fas fa-cubes"></i> Filtro rápido:</span>
            <button class="qf-btn qf-danger" data-qf="AGOTADO"><i class="fas fa-ban"></i> Agotados <b>${c.agotado}</b></button>
            <button class="qf-btn qf-warn" data-qf="BAJO"><i class="fas fa-arrow-down-9-1"></i> Bajos &lt;${CONFIG.lowStock} <b>${c.bajo}</b></button>
            <button class="qf-btn" data-qf=""><i class="fas fa-list"></i> Todos</button>`;
    }
    function wireQuickFilters(containerId, fb, field, title) {
        const el = document.getElementById(containerId); if (!el || !fb) return;
        el.querySelectorAll('.qf-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                el.querySelectorAll('.qf-btn').forEach(b => b.classList.remove('qf-active'));
                const val = btn.getAttribute('data-qf');
                fb.clearAll();
                if (val) { btn.classList.add('qf-active'); fb.addValue(field, title, val, true); }
            });
        });
    }

    // =====================================================================
    // Constructor de filtros multi-columna con Autocomplete
    // =====================================================================
    function setupFilterBuilder(table, columns, els) {
        let active = [];
        const filterableCols = columns.filter(c => c.field && c.title);

        els.col.innerHTML = filterableCols
            .map(c => `<option value="${escapeHtml(c.field)}">${escapeHtml(c.title)}</option>`)
            .join('');

        const autoWrap = document.createElement("div");
        autoWrap.style.position = "relative";
        autoWrap.style.flex = "1";
        autoWrap.style.minWidth = "220px";
        autoWrap.style.maxWidth = "320px";

        els.val.parentNode.insertBefore(autoWrap, els.val);
        autoWrap.appendChild(els.val);
        els.val.style.width = "100%";

        const suggestionBox = document.createElement("div");
        suggestionBox.style.position = "absolute";
        suggestionBox.style.top = "100%";
        suggestionBox.style.left = "0";
        suggestionBox.style.right = "0";
        suggestionBox.style.background = "white";
        suggestionBox.style.border = "1px solid #cbd5e1";
        suggestionBox.style.borderTop = "none";
        suggestionBox.style.borderRadius = "0 0 10px 10px";
        suggestionBox.style.maxHeight = "260px";
        suggestionBox.style.overflowY = "auto";
        suggestionBox.style.zIndex = "999";
        suggestionBox.style.display = "none";
        suggestionBox.style.boxShadow = "0 10px 15px rgba(0,0,0,0.08)";
        autoWrap.appendChild(suggestionBox);

        function getUniqueValues(field) {
            const values = new Set();
            table.getData().forEach(r => {
                let v = r[field];
                if (v === undefined || v === null) return;
                v = String(v).trim();
                if (v !== "") values.add(v);
            });
            return [...values].sort((a, b) => a.localeCompare(b, 'es'));
        }

        function renderSuggestions() {
            const field = els.col.value;
            const search = els.val.value.trim().toLowerCase();
            const values = getUniqueValues(field);
            let filtered = values;

            if (search !== "") {
                filtered = values.filter(v => v.toLowerCase().includes(search));
            }

            filtered = filtered.slice(0, 50);

            if (filtered.length === 0) {
                suggestionBox.style.display = "none";
                return;
            }

            suggestionBox.innerHTML = filtered.map(v => `
                <div class="autocomplete-item"
                    style="padding:10px 12px; cursor:pointer; border-bottom:1px solid #f1f5f9; font-size:0.85rem;"
                    data-value="${escapeHtml(v)}">
                    ${escapeHtml(v)}
                </div>
            `).join("");

            suggestionBox.style.display = "block";

            suggestionBox.querySelectorAll(".autocomplete-item").forEach(item => {
                item.addEventListener("mouseenter", () => { item.style.background = "#eff6ff"; });
                item.addEventListener("mouseleave", () => { item.style.background = "white"; });
                item.addEventListener("click", () => {
                    els.val.value = item.getAttribute("data-value");
                    suggestionBox.style.display = "none";
                    addFilter();
                });
            });
        }

        function apply() {
            try {
                // Sincronización: limpia la búsqueda global si se usan chips de filtrado
                if (els.col.id === 'filterCol2' && $('globalSearchCons')) {
                    $('globalSearchCons').value = '';
                }

                if (active.length === 0) {
                    table.clearFilter();
                } else {
                    const grouped = {};
                    active.forEach(f => {
                        if (!grouped[f.field]) grouped[f.field] = [];
                        grouped[f.field].push(f);
                    });
                    const finalFilters = [];
                    Object.keys(grouped).forEach(field => {
                        const arr = grouped[field];
                        if (arr.length === 1) {
                            finalFilters.push({ field: field, type: "like", value: arr[0].value });
                        } else {
                            finalFilters.push(arr.map(f => ({ field: field, type: "like", value: f.value })));
                        }
                    });
                    table.setFilter(finalFilters);
                }
            } catch (e) {
                console.error("Filter apply error:", e);
            }
            renderChips();
        }

        function renderChips() {
            if (active.length === 0) {
                els.chips.innerHTML = `<span class="filter-empty"><i class="fas fa-info-circle"></i> Sin filtros activos</span>`;
                els.clear.classList.add("hidden");
                return;
            }
            els.chips.innerHTML = active.map((f, i) => `
                <div class="filter-chip">
                    <strong>${escapeHtml(f.title)}:</strong> ${escapeHtml(f.value)}
                    <button class="filter-chip-x" data-idx="${i}">×</button>
                </div>
            `).join("");

            els.chips.querySelectorAll(".filter-chip-x").forEach(btn => {
                btn.addEventListener("click", () => {
                    active.splice(parseInt(btn.getAttribute("data-idx")), 1);
                    apply();
                });
            });
            els.clear.classList.remove("hidden");
        }

        function addFilter() {
            const val = els.val.value.trim();
            if (!val) { els.val.focus(); return; }
            const field = els.col.value;
            const title = els.col.options[els.col.selectedIndex].text;

            active.push({ field, title, value: val });
            els.val.value = "";
            suggestionBox.style.display = "none";
            apply();
            els.val.focus();
        }

        els.add.addEventListener("click", addFilter);
        els.val.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); addFilter(); } });
        els.val.addEventListener("input", renderSuggestions);
        els.col.addEventListener("change", () => { els.val.value = ""; renderSuggestions(); });
        els.val.addEventListener("focus", renderSuggestions);

        document.addEventListener("click", (e) => {
            if (!autoWrap.contains(e.target)) suggestionBox.style.display = "none";
        });

        els.clear.addEventListener("click", () => { active = []; apply(); });
        renderChips();

        // API pública para filtros rápidos programáticos (botones de caducidad/stock)
        return {
            addValue(field, title, value, replace = false) {
                if (replace) active = active.filter(f => f.field !== field);
                active.push({ field, title, value });
                apply();
            },
            clearAll() { active = []; apply(); },
            count() { return active.length; }
        };
    }

    // =====================================================================
    // Estructuración Dinámica de Columnas Consolidado (Descubrimiento)
    // =====================================================================
    function buildColumnsConsolidado(data) {
        if (!data || data.length === 0) {
            return { cols: [], invCodes: [], fields: {} };
        }

        const keySet = new Set();
        data.forEach(r => Object.keys(r).forEach(k => keySet.add(k)));
        const allKeys = [...keySet];

        const fields = {
            sector:      findField(allKeys, ['Sector', 'Descr Sector', 'Descr. Sector']),
            grupo:       findField(allKeys, ['Grupo', 'Descr Grupo de Art', 'Descr. Grupo de Art.']),
            condicion:   findField(allKeys, ['Condicion']),
            material:    findField(allKeys, ['Material']),
            texto:       findField(allKeys, ['Texto breve de material']),
            precio:      findField(allKeys, ['Precio Oferta', 'Precio oferta']),
            disp1030:    findField(allKeys, ['Disponible 1031-1030']),
            disp1032:    findField(allKeys, ['Disponible 1031-1032']),
            invSuma:     findField(allKeys, ['Inv Suma']),
            importe:     findField(allKeys, ['Importe Inventario $'])
        };

        // Descubrimiento por Regex de todos los códigos de centros presentes en el archivo
        let invCodes = [];
        allKeys.forEach(k => {
            let mInv = k.match(/^Inv (\d+)$/);
            if (mInv) invCodes.push(mInv[1]);
            let mTra = k.match(/^Transito_INV_(\d+)$/);
            if (mTra && !invCodes.includes(mTra[1])) invCodes.push(mTra[1]);
        });
        invCodes = [...new Set(invCodes)].sort();

        // Mutar y mapear campos compuestos para optimizar búsquedas globales rápidas
        data.forEach(row => {
            let mat = row[fields.material] || '';
            let txt = row[fields.texto] || '';
            row['_material_desc'] = (mat + ' · ' + txt).trim();
            row['_raw_material'] = mat;
        });

        // Máximos por columna para escalar las barras de magnitud
        const LOW = CONFIG.lowStock; // umbral de "stock bajo"
        function colMax(field) {
            let mx = 0;
            if (!field) return 0;
            data.forEach(r => { const n = toNum(r[field]); if (!isNaN(n) && n > mx) mx = n; });
            return mx;
        }
        const max1030 = colMax(fields.disp1030);
        const max1032 = colMax(fields.disp1032);
        const maxByCode = {};
        invCodes.forEach(code => { maxByCode[code] = colMax(`Inv ${code}`); });

        const cols = [
            { title: 'Material + Descripción', field: '_material_desc', minWidth: 320, frozen: true,
              headerFilter: 'input', headerFilterPlaceholder: 'filtrar…', tooltip: true },
            { title: 'Sector', field: fields.sector, minWidth: 140, visible: false },
            { title: 'Grupo', field: fields.grupo, minWidth: 170, visible: false },
            { title: 'Condicion', field: fields.condicion, minWidth: 120, headerFilter: 'input', headerFilterPlaceholder: 'filtrar…' },
            { title: 'Estado Stock', field: '_estado_stock', visible: false },
            { 
                title: 'Precio Oferta', 
                field: fields.precio, 
                minWidth: 130, 
                hozAlign: 'right',
                sorter: numSorter,
                formatter: (c) => { let v = toNum(c.getValue()); return isNaN(v) ? '' : fmtMXN.format(v); }
            },
            { 
                title: 'Disponible C.1031 · Alm.1030', 
                field: fields.disp1030, 
                minWidth: 150, 
                hozAlign: 'right',
                sorter: numSorter,
                bottomCalc: sumCalc, bottomCalcFormatter: calcInt,
                formatter: makeBarFormatter(max1030, LOW),
                cellClick: (e, cell) => {
                    let material = cell.getRow().getData()._raw_material;
                    if (material) showLotesModal(material, '1031', '1030');
                }
            },
            { 
                title: 'Disponible C.1031 · Alm.1032', 
                field: fields.disp1032, 
                minWidth: 150, 
                hozAlign: 'right',
                sorter: numSorter,
                bottomCalc: sumCalc, bottomCalcFormatter: calcInt,
                formatter: makeBarFormatter(max1032, LOW),
                cellClick: (e, cell) => {
                    let material = cell.getRow().getData()._raw_material;
                    if (material) showLotesModal(material, '1031', '1032');
                }
            }
        ];

        // Añadir pares de columnas de Inventario / Tránsito por centro descubierto de forma iterativa
        invCodes.forEach(code => {
            cols.push({
                title: `Inv ${code}`,
                field: `Inv ${code}`,
                minWidth: 110,
                hozAlign: 'right',
                sorter: numSorter,
                bottomCalc: sumCalc, bottomCalcFormatter: calcInt,
                formatter: makeBarFormatter(maxByCode[code] || 0, LOW),
                cellClick: (e, cell) => {
                    let material = cell.getRow().getData()._raw_material;
                    if (material) showLotesModal(material, code);
                }
            });
            cols.push({
                title: `Transito_INV_${code}`,
                field: `Transito_INV_${code}`,
                minWidth: 150,
                hozAlign: 'right',
                sorter: numSorter,
                bottomCalc: sumCalc, bottomCalcFormatter: calcInt,
                formatter: (cell) => {
                    let v = toNum(cell.getValue());
                    return `<span class="clickable-cell">${isNaN(v) ? '0' : v.toLocaleString('es-MX')}</span>`;
                },
                cellClick: (e, cell) => {
                    let material = cell.getRow().getData()._raw_material;
                    if (material) showLotesModal(material, code);
                }
            });
        });

        cols.push(
            { 
                title: 'Inv Suma', 
                field: fields.invSuma, 
                minWidth: 120, 
                hozAlign: 'right',
                sorter: numSorter,
                bottomCalc: sumCalc, bottomCalcFormatter: calcInt,
                formatter: (c) => { let v = toNum(c.getValue()); return isNaN(v) ? '' : v.toLocaleString('es-MX'); }
            },
            { 
                title: 'Importe Inventario $', 
                field: fields.importe, 
                minWidth: 170, 
                hozAlign: 'right',
                sorter: numSorter,
                bottomCalc: sumCalc, bottomCalcFormatter: calcMXN,
                formatter: (c) => { let v = toNum(c.getValue()); return isNaN(v) ? '' : fmtMXN.format(v); }
            }
        );

        return { cols, invCodes, fields };
    }

    function buildColumnsDetalle() {
        return [
            { title: 'Material', field: 'Material', minWidth: 120, frozen: true, headerFilter: 'input', headerFilterPlaceholder: 'filtrar…' },
            { title: 'Estado Caducidad', field: '_estado_cad', visible: false },
            { title: 'Texto breve de material', field: 'Texto breve de material', minWidth: 280, headerFilter: 'input', headerFilterPlaceholder: 'filtrar…' },
            { title: 'Centro', field: 'Centro', minWidth: 100, headerFilter: 'input' },
            { title: 'Almacén', field: 'Almacén', minWidth: 100, headerFilter: 'input' },
            { title: 'Lote', field: 'Lote', minWidth: 140 },
            { title: 'FechaCaducidad', field: 'FechaCaducidad', minWidth: 230, formatter: caducidadFormatter },
            { 
                title: 'CantidadDisp', 
                field: 'CantidadDisp', 
                minWidth: 120, 
                hozAlign: 'right',
                sorter: numSorter,
                bottomCalc: sumCalc, bottomCalcFormatter: calcInt,
                formatter: (c) => { let v = toNum(c.getValue()); return isNaN(v) ? '0' : v.toLocaleString('es-MX'); }
            },
            { 
                title: 'Precio oferta', 
                field: 'Precio oferta', 
                minWidth: 130, 
                hozAlign: 'right',
                sorter: numSorter,
                formatter: (c) => { let v = toNum(c.getValue()); return isNaN(v) ? '' : fmtMXN.format(v); }
            }
        ];
    }

    // =====================================================================
    // Selectores de Columnas de Inventario (Chips de Control Superior)
    // =====================================================================
    function renderInvSelector(invCodes, t2, fieldByCode) {
        const container = $('invSelector');
        const hidden = new Set(store.get('invHidden', []));

        const setCol = (code, show) => {
            const colInv = fieldByCode.inv[code] ? t2.getColumn(fieldByCode.inv[code]) : null;
            const colTra = fieldByCode.tra[code] ? t2.getColumn(fieldByCode.tra[code]) : null;
            if (colInv) show ? colInv.show() : colInv.hide();
            if (colTra) show ? colTra.show() : colTra.hide();
        };
        const persist = () => {
            const h = [];
            container.querySelectorAll('.inv-chip[data-inv]').forEach(c => {
                if (!c.classList.contains('active')) h.push(c.getAttribute('data-inv'));
            });
            store.set('invHidden', h);
        };

        const labelHtml = `<span class="inv-selector-label"><i class="fas fa-sliders"></i> Mostrar inventarios:</span>`;
        const chipsHtml = invCodes.map(code => {
            const active = hidden.has(code) ? '' : ' active';
            return `<button class="inv-chip${active}" data-inv="${escapeHtml(code)}">${escapeHtml(code)}</button>`;
        }).join('');
        const clearHtml = `<button class="inv-chip inv-chip-clear" id="invChipClear"><i class="fas fa-eye-slash"></i> Ocultar todos</button>`;
        container.innerHTML = labelHtml + chipsHtml + clearHtml;

        // Estado inicial según lo persistido
        invCodes.forEach(code => setCol(code, !hidden.has(code)));

        container.querySelectorAll('.inv-chip[data-inv]').forEach(chip => {
            chip.addEventListener('click', () => {
                const code = chip.getAttribute('data-inv');
                const willBeActive = !chip.classList.contains('active');
                chip.classList.toggle('active');
                setCol(code, willBeActive);
                persist();
            });
        });

        $('invChipClear').addEventListener('click', () => {
            container.querySelectorAll('.inv-chip[data-inv]').forEach(chip => {
                chip.classList.remove('active');
                setCol(chip.getAttribute('data-inv'), false);
            });
            persist();
        });
    }

    // =====================================================================
    // Mostrar Modal de Desglose de Lotes
    // =====================================================================
    function showLotesModal(material, centro = null, almacen = null) {
        if (!rawDetalleData || !rawDetalleData.length) { 
            alert("Los datos detallados de lotes se están sincronizando. Intente de nuevo."); 
            return; 
        }
        const filtered = rawDetalleData.filter(row => {
            const mat = row.Material || '';
            if (mat !== material) return false;
            if (centro && String(row.Centro || '').trim() !== String(centro).trim()) return false;
            if (almacen && String(row.Almacén || '').trim() !== String(almacen).trim()) return false;
            return true;
        });
        if (!filtered.length) { 
            const ubic = centro ? ` en el centro ${centro}${almacen ? ` / almacén ${almacen}` : ''}` : '';
            alert(`No existen lotes registrados para el material "${material}"${ubic}.`); 
            return; 
        }
        
        let title = `Lotes · ${material} (Todos los centros)`;
        if (centro && almacen) title = `Lotes · ${material} (Centro ${centro} · Almacén ${almacen})`;
        else if (centro) title = `Lotes · ${material} (Centro ${centro})`;
        $('modalTitle').innerText = title;
        
        if (window.modalTabulator) {
            window.modalTabulator.destroy();
        }
        
        const modalCols = [
            { title: 'Centro', field: 'Centro', minWidth: 80 },
            { title: 'Almacén', field: 'Almacén', minWidth: 90 },
            { title: 'Lote', field: 'Lote', minWidth: 130 },
            { title: 'Caducidad', field: 'FechaCaducidad', minWidth: 200, formatter: caducidadFormatter },
            { 
                title: 'Cantidad', 
                field: 'CantidadDisp', 
                hozAlign: 'right', 
                sorter: numSorter,
                bottomCalc: sumCalc, bottomCalcFormatter: calcInt,
                formatter: (c) => { let v = toNum(c.getValue()); return isNaN(v) ? '0' : v.toLocaleString('es-MX'); } 
            },
            { 
                title: 'Precio Oferta', 
                field: 'Precio oferta', 
                hozAlign: 'right', 
                formatter: (c) => { let v = toNum(c.getValue()); return isNaN(v) ? '' : fmtMXN.format(v); } 
            }
        ];
        
        window.modalTabulator = new Tabulator("#modalTabla", { 
            data: filtered, 
            layout: "fitColumns", 
            columns: modalCols, 
            pagination: "local", 
            paginationSize: 10 
        });
        
        $('loteModal').style.display = "flex";
    }

    // =====================================================================
    // Generar Widget de Clasificación del Ranking Top 5
    // =====================================================================
    function renderTopInventarios(data, fields) {
        const titleEl    = $('topInvTitle');
        const subtitleEl = $('topInvSubtitle');
        const listEl     = $('topInvList');

        let metricField = fields.importe;
        let metricLabel = 'Importe Inventario $';
        let isCurrency = true;
        if (!metricField) {
            metricField = fields.invSuma;
            metricLabel = 'Inv Suma';
            isCurrency = false;
        }
        if (!metricField) {
            titleEl.textContent = 'Top 5 Inventarios';
            subtitleEl.textContent = 'Métrica de cálculo ausente en la fuente de datos';
            listEl.innerHTML = '<div style="color:#94a3b8; padding:12px;">Esperando columnas compatibles de Importe o Sumatoria</div>';
            return;
        }

        titleEl.textContent = `Top ${CONFIG.topInvN} Inventarios (por ${metricLabel})`;
        subtitleEl.textContent = `Ranking dinámico de un universo de ${data.length.toLocaleString('es-MX')} registros`;

        const matField  = fields.material  || 'Material';
        const descField = fields.texto || 'Texto breve de material';

        const ranked = data
            .map(r => ({ row: r, val: toNum(r[metricField]) }))
            .filter(x => !isNaN(x.val) && x.val > 0)
            .sort((a, b) => b.val - a.val)
            .slice(0, CONFIG.topInvN);

        if (ranked.length === 0) {
            listEl.innerHTML = '<div style="color:#94a3b8; padding:12px;">Data insuficiente para estructurar el ranking</div>';
            return;
        }

        listEl.innerHTML = ranked.map((item, i) => {
            const rankClass = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
            const valShown = isCurrency
                ? fmtMXN.format(item.val)
                : item.val.toLocaleString('es-MX', { maximumFractionDigits: 0 });
            return `
                <div class="top-inv-item">
                    <div class="top-inv-rank ${rankClass}">${i + 1}</div>
                    <div class="top-inv-info">
                        <div class="top-inv-mat">${escapeHtml(item.row[matField])}</div>
                        <div class="top-inv-desc">${escapeHtml(item.row[descField])}</div>
                    </div>
                    <div class="top-inv-qty">
                        ${valShown}
                        <small>${escapeHtml(metricLabel)}</small>
                    </div>
                </div>`;
        }).join('');
    }

    // =====================================================================
    // Inicialización de Flujos e Inyección de Datos
    // =====================================================================
    function initApp() {
        const url1 = `${CONFIG.apiUrl}?tab=${encodeURIComponent(CONFIG.tabs.detalle)}`;
        const url2 = `${CONFIG.apiUrl}?tab=${encodeURIComponent(CONFIG.tabs.consolidado)}`;

        let t1 = null, t2 = null;
        let topPrecioThreshold = Infinity;

        function updateTimestamp() {
            const now = new Date();
            $("lastUpdateTime").textContent =
                `${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')} hrs`;
        }

        // ====== PROCESAR TABLA 1: InvDetalle ======
        fetch(url1)
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(rawData => {
                try {
                    const data = normalizeData(rawData);
                    rawDetalleData = data;
                    renderCaducidadControls(classifyCaducidad(data));

                    $("totalRegistros").textContent = data.length.toLocaleString('es-MX');
                    const matsUnicos = new Set(data.map(x => x.Material).filter(m => m && String(m).trim() !== ""));
                    $("materialesUnicos").textContent = matsUnicos.size.toLocaleString('es-MX');

                    let totalUnidades = 0;
                    data.forEach(r => {
                        const n = toNum(r.CantidadDisp);
                        if (!isNaN(n)) totalUnidades += n;
                    });
                    $("totalUnidades").textContent = totalUnidades.toLocaleString('es-MX', { maximumFractionDigits: 0 });
                    updateTimestamp();

                    const cols1 = buildColumnsDetalle();

                    t1 = new Tabulator("#tabla1", {
                        data,
                        layout: "fitData",
                        height: "100%",
                        rowHeight: 38,
                        pagination: "local",
                        paginationSize: 15,
                        paginationSizeSelector: [15, 30, 50, 100, 200, true],
                        paginationCounter: "rows",
                        placeholder: "No se encontraron registros de lotes disponibles",
                        movableColumns: true,
                        resizableColumns: true,
                        downloadConfig:{ columnGroups:false, rowGroups:false },
                        columns: cols1
                    });

                    const fb1 = setupFilterBuilder(t1, cols1, {
                        col: $("filterCol1"), val: $("filterVal1"), add: $("filterAdd1"),
                        chips: $("filterChips1"), clear: $("filterClear1")
                    });
                    wireQuickFilters('cadControls', fb1, '_estado_cad', 'Caducidad');
                } catch (e) {
                    console.error('Error procesando InvDetalle:', e);
                    $("tabla1").innerHTML = `<div class="error-message"><i class="fas fa-triangle-exclamation"></i> Error procesando datos: ${escapeHtml(e.message)}</div>`;
                }
            })
            .catch(err => {
                console.error('Fetch InvDetalle:', err);
                $("tabla1").innerHTML = `<div class="error-message"><i class="fas fa-triangle-exclamation"></i> Error al conectar con InvDetalle: ${escapeHtml(err.message)}</div>`;
            });

        // ====== PROCESAR TABLA 2: InvConsolidado ======
        fetch(url2)
            .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
            .then(rawData => {
                try {
                    const data = normalizeData(rawData);
                    const { cols: cols2, invCodes, fields } = buildColumnsConsolidado(data);

                    renderStockControls(classifyStock(data, fields));
                    renderTopInventarios(data, fields);

                    if (fields.precio) {
                        const precios = data
                            .map(r => toNum(r[fields.precio]))
                            .filter(p => !isNaN(p) && p > 0)
                            .sort((a, b) => b - a);
                        if (precios.length > 0) {
                            const idx = Math.min(CONFIG.topPrecioN - 1, precios.length - 1);
                            topPrecioThreshold = precios[idx];
                        }
                    }

                    t2 = new Tabulator("#tabla2", {
                        data,
                        layout: "fitData",
                        height: "100%",
                        rowHeight: 38,
                        pagination: "local",
                        paginationSize: 15,
                        paginationSizeSelector: [15, 30, 50, 100, 200, true],
                        paginationCounter: "rows",
                        placeholder: "No hay registros consolidados",
                        movableColumns: true,
                        resizableColumns: true,
                        downloadConfig:{ columnGroups:false, rowGroups:false },
                        columns: cols2,
                        rowFormatter: function(row) {
                            const d = row.getData();
                            const precio = fields.precio ? toNum(d[fields.precio]) : NaN;
                            const el = row.getElement();
                            if (!isNaN(precio) && precio > 0 && precio >= topPrecioThreshold) {
                                el.classList.add('row-top-price');
                            } else {
                                el.classList.remove('row-top-price');
                            }
                        }
                    });

                    const fb2 = setupFilterBuilder(t2, cols2, {
                        col: $("filterCol2"), val: $("filterVal2"), add: $("filterAdd2"),
                        chips: $("filterChips2"), clear: $("filterClear2")
                    });
                    wireQuickFilters('stkControls', fb2, '_estado_stock', 'Stock');

                    const fieldByCode = { inv: {}, tra: {} };
                    invCodes.forEach(code => {
                        const colInv = cols2.find(c => c.field === `Inv ${code}`);
                        const colTra = cols2.find(c => c.field === `Transito_INV_${code}`);
                        if (colInv) fieldByCode.inv[code] = colInv.field;
                        if (colTra) fieldByCode.tra[code] = colTra.field;
                    });

                    renderInvSelector(invCodes, t2, fieldByCode);

                    // Motor de Búsqueda Global sobre la columna unificada Material + Descripción
                    const globalSearch = $('globalSearchCons');
                    globalSearch.addEventListener('input', (e) => {
                        const raw = e.target.value.trim();
                        if (raw === "") {
                            t2.clearFilter();
                            return;
                        }
                        // Cada palabra es un término; deben aparecer TODAS (en cualquier orden)
                        const tokens = raw.toUpperCase().split(/\s+/).filter(Boolean);
                        t2.setFilter((data) => {
                            const hay = String(data._material_desc || '').toUpperCase();
                            return tokens.every(tok => hay.includes(tok));
                        });
                    });

                    // Mecanismo Toggle para Ocultar/Mostrar Grupo y Sector
                    let extraVisible = false;
                    $('toggleExtraCols').addEventListener('click', () => {
                        extraVisible = !extraVisible;
                        const grupoCol = t2.getColumn(fields.grupo);
                        const sectorCol = t2.getColumn(fields.sector);
                        if (grupoCol) grupoCol.toggle();
                        if (sectorCol) sectorCol.toggle();
                        $('toggleExtraCols').innerHTML = extraVisible 
                            ? '<i class="fas fa-eye"></i> Ocultar Grupo/Sector' 
                            : '<i class="fas fa-eye-slash"></i> Mostrar Grupo/Sector';
                    });

                    // Controles de Exportaciones y Zoom Computados
                    $('exportExcel1').addEventListener('click', () => { if (t1) t1.download("xlsx", "Inventario_Lotes.xlsx", { sheetName: "Lotes" }); });
                    $('exportCSV1').addEventListener('click', () => { if (t1) t1.download("csv", "Inventario_Lotes.csv"); });
                    $('exportExcel2').addEventListener('click', () => { if (t2) t2.download("xlsx", "Resumen_Inventario.xlsx", { sheetName: "Resumen" }); });
                    $('exportCSV2').addEventListener('click', () => { if (t2) t2.download("csv", "Resumen_Inventario.csv"); });

                    $('zoom1').addEventListener('input', function () {
                        const zoom = this.value;
                        $('zoomWrap1').style.zoom = `${zoom}%`;
                        $('zoomValue1').textContent = `${zoom}%`;
                        store.set('zoom1', zoom);
                        if (t1) t1.redraw(true);
                    });

                    $('zoom2').addEventListener('input', function () {
                        const zoom = this.value;
                        $('zoomWrap2').style.zoom = `${zoom}%`;
                        $('zoomValue2').textContent = `${zoom}%`;
                        store.set('zoom2', zoom);
                        if (t2) t2.redraw(true);
                    });

                    // Restaurar zoom previo de ambas tablas
                    [['zoom1', 'zoomWrap1', 'zoomValue1'], ['zoom2', 'zoomWrap2', 'zoomValue2']].forEach(([id, wrap, val]) => {
                        const z = store.get(id, null);
                        if (z) { $(id).value = z; $(wrap).style.zoom = `${z}%`; $(val).textContent = `${z}%`; }
                    });
                    if (t1) t1.redraw(true);
                    if (t2) t2.redraw(true);

                } catch (e) {
                    console.error('Error procesando InvConsolidado:', e);
                    $("tabla2").innerHTML = `<div class="error-message"><i class="fas fa-triangle-exclamation"></i> Error procesando datos: ${escapeHtml(e.message)}</div>`;
                }
            })
            .catch(err => {
                console.error('Fetch InvConsolidado:', err);
                $("tabla2").innerHTML = `<div class="error-message"><i class="fas fa-triangle-exclamation"></i> Error al conectar con InvConsolidado: ${escapeHtml(err.message)}</div>`;
            });

        // ====== Toggles de KPIs / Filtros (estilo Gmail) y recarga ======
        function redrawTables() { if (t1) t1.redraw(true); if (t2) t2.redraw(true); }

        const kpiBtn = $('toggleKpis');
        if (kpiBtn) {
            const applyKpi = (hidden) => {
                document.body.classList.toggle('kpis-hidden', hidden);
                kpiBtn.classList.toggle('active', !hidden);
                store.set('kpisHidden', hidden);
                redrawTables();
            };
            kpiBtn.addEventListener('click', () => applyKpi(!document.body.classList.contains('kpis-hidden')));
            applyKpi(store.get('kpisHidden', false));
        }

        const filBtn = $('toggleFilters');
        if (filBtn) {
            const applyFil = (hidden) => {
                document.body.classList.toggle('filters-hidden', hidden);
                filBtn.classList.toggle('active', !hidden);
                store.set('filtersHidden', hidden);
                redrawTables();
            };
            filBtn.addEventListener('click', () => applyFil(!document.body.classList.contains('filters-hidden')));
            applyFil(store.get('filtersHidden', false));
        }

        const reloadBtn = $('railReload');
        if (reloadBtn) reloadBtn.addEventListener('click', () => window.location.reload());

        // Mide el alto real de la barra superior y lo expone como --topbar-h, para que
        // la tabla/filtros sticky calcen exacto y el paginador quede siempre visible.
        const topbarEl = document.querySelector('.topbar');
        function syncTopbarVar() {
            if (!topbarEl) return;
            const h = Math.round(topbarEl.getBoundingClientRect().height);
            document.documentElement.style.setProperty('--topbar-h', h + 'px');
            redrawTables();
        }
        syncTopbarVar();
        window.addEventListener('resize', syncTopbarVar);

        // Colapso compacto de la sección "Filtrar" (chevron)
        document.querySelectorAll('.filter-toggle').forEach(btn => {
            btn.addEventListener('click', () => {
                const fb = btn.closest('.filter-builder');
                if (!fb) return;
                const collapsed = fb.classList.toggle('collapsed');
                btn.setAttribute('aria-expanded', String(!collapsed));
                setTimeout(redrawTables, 60);
            });
        });

        // ====== Control de Pestañas ======
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
                btn.classList.add('active');
                const panelId = btn.getAttribute('data-panel');
                $(panelId).classList.remove('hidden');
                store.set('tab', panelId);
                if (panelId === 'panel-lotes'   && t1) t1.redraw(true);
                if (panelId === 'panel-resumen' && t2) t2.redraw(true);
            });
        });
        // La vista por defecto al entrar/recargar es "Resumen General" (definida en el HTML);
        // por eso no se restaura la última pestaña.

        // Controladores de cierre del Modal
        const modal = $('loteModal');
        modal.querySelector('.close-modal').onclick = () => { modal.style.display = 'none'; };
        window.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

        setInterval(() => window.location.reload(), CONFIG.refreshMs); // Autorrecarga configurable
        $("lastUpdateBadge").onclick = () => window.location.reload();
    }

    // Ejecución controlada tras asegurar la carga de librerías en DOM
    waitForTabulator(() => {
        try { initApp(); }
        catch (e) {
            console.error('Error fatal en el flujo:', e);
            document.body.insertAdjacentHTML('beforeend',
                `<div class="error-message"><i class="fas fa-triangle-exclamation"></i> Error crítico del aplicativo: ${escapeHtml(e.message)}</div>`);
        }
    });
})();
