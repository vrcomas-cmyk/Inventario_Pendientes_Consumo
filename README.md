# Portal DEGASA · Inventario + Sugerencias + Facturación

Portal modular (sin framework, ES Modules). Tres vistas:

1. **Inventario (condición)** — vista **nativa** (mismos colores, tablas, modal y búsqueda
   que el resto), alimentada del **AppScript** configurado en `js/invConfig.js`.
   Es la primera vista. Tabla por condición con columnas `Inv {centro}` dinámicas;
   clic en la cantidad de un centro → modal de lotes (lote, caducidad, días, cantidad)
   con el mismo coloreado de caducidad (rojo ≤30d · ámbar ≤182d).
2. **Sugerencias** — "Todas las Sugerencias" agrupada por BO. Columnas: Grupo, OC, Pedido,
   Fecha, Cliente (+ chips Solic/Dest), Centro/Alm, Material base, Cant. ped., Pendiente,
   Precio, Consumo, **Inv 1030/1031/1032/1060**, **Estado** (En aumento / Cayendo / Estable /
   Sin compra), Fuentes, Tendencia (%). Se alimenta del archivo que subes.
3. **Reporte de consumo** — con el mismo **Estado** de tendencia. Se alimenta del archivo.

## Fuentes de datos
- **Inventario** → AppScript (no usa el archivo).
- **Sugerencias / Reporte de consumo / Resumen_Fac** → archivo `.xlsx` que subes con
  el botón "📂 Cargar reporte" (lectura en el navegador con SheetJS; eliges qué pestañas cargar).

## Drill-downs (Sugerencias)
- Clic en **Material** o **Fuentes** → detalle: consumo (mes corriente o último+penúltimo),
  evolución mensual material+destinatario, fuentes, e **inventario completo**
  (1030/1031/1032/1060 + 1001–1036 + Disponible 1031-1030 / 1031-1032).
- Clic en **Solic** → evolución mensual general del solicitante.
- Clic en **Dest** → evolución mensual general del destinatario.

## Estructura
```
index.html            · shell + pestañas + iframe de inventario
config (inventario)   · inventario/config.js  (URL del AppScript)
css/portal.css        · estilos del portal
js/utils.js           · formato + búsqueda multi-token (AND, sin importar orden)
js/store.js           · estado compartido + mapas de columnas
js/ui.js              · modal + gráficas (Chart.js) + renderers
js/invConfig.js       · URL del AppScript + cortes de caducidad del inventario
js/inventario.js      · vista por condición + lotes por centro (NATIVA)
js/resumenFac.js      · índices de Resumen_Fac + consumo + clasificación de tendencia
js/data.js            · carga de archivo + detección/selección de pestañas
js/sugerencias.js     · vista Sugerencias + drill-downs
js/consumo.js         · vista Reporte de consumo
js/main.js            · arranque y router de pestañas
```

## Despliegue
Servir la carpeta por HTTP (Vercel, Netlify, o `npx serve`). Los ES Modules y el iframe
requieren http(s); no funciona abriendo `index.html` con doble clic (file://).

## Búsqueda (todos los filtros)
Cada palabra/número/símbolo se busca por separado y deben aparecer **todos**, en cualquier
orden o posición. Ej.: `20 GASA` trae lo que contenga "20" **y** "gasa".

## Escalar
Para una pestaña nueva: crea `js/<vista>.js` con un `render(container)`, regístrala en
`TABS` dentro de `js/main.js` y agrega su `<div id="view-<id>">` en `index.html`.
