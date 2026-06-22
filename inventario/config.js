/* =========================================================================
   CONFIGURACIÓN · Portal Inventario DEGASA
   Ajusta aquí los parámetros de negocio sin tocar la lógica (app.js).
   ========================================================================= */
const CONFIG = {
    // Hoja de Google Sheets publicada vía opensheet
    sheetId: "15IEM6iP2NiGObcnpYKznPtbsOv6LS78ER_xP7DxdHT4",
    apiUrl: "https://script.google.com/macros/s/AKfycbz74169NY7gqzyW-y7K_WUQJuqMWNuZjmBS-TKfJMBa_f_nweEmDF47NuTcLlBkuAyKAg/exec",
    tabs: {
        detalle:     "InvDetalle",      // pestaña de lotes
        consolidado: "InvConsolidado"   // pestaña de resumen
    },

    // Rankings del panel resumen
    topPrecioN: 5,   // nº de filas resaltadas por precio más alto
    topInvN:    5,   // tamaño del Top de inventarios

    // Reglas de negocio
    lowStock: 50,    // umbral para considerar "stock bajo" (barras y filtro rápido)
    expiry: {        // cortes de caducidad en días
        mes1: 30,    // ≤ 1 mes  (rojo)
        mes3: 91,    // ≤ 3 meses (naranja) — también define "por vencer"
        mes6: 182    // ≤ 6 meses (ámbar)
    },

    // Comportamiento de la app
    refreshMs:  15 * 60 * 1000,  // autorrecarga (15 min)
    persistUi:  true             // recordar pestaña, zoom y centros visibles (localStorage)
};
