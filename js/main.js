/* ===========================================================================
   main.js · arranque y router de pestañas
   =========================================================================== */
import { initUpload, openUploader } from './data.js';
import { renderInventario, ensureInvData } from './inventario.js';
import { renderSug } from './sugerencias.js';
import { renderConsumo } from './consumo.js';
import { closeModal } from './ui.js';
import { loadEnrich } from './enrich.js';

const TABS = [
  { id: 'inv',  label: '🏷️ Inventario (condición)' },   // 1° vista — tu HTML tal cual (AppScript)
  { id: 'sug',  label: '📋 Sugerencias' },
  { id: 'cons', label: '📊 Reporte de consumo' },
];

let current = 'inv';

function render() {
  ['inv', 'sug', 'cons'].forEach(id => document.querySelector('#view-' + id).classList.toggle('hidden', id !== current));
  if (current === 'inv')  renderInventario(document.querySelector('#view-inv'));
  if (current === 'sug')  renderSug(document.querySelector('#view-sug'));
  if (current === 'cons') renderConsumo(document.querySelector('#view-cons'));
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.id === current));
}

function switchTab(id) { current = id; render(); }

function boot() {
  // pestañas
  const tb = document.querySelector('#tabs');
  TABS.forEach(t => {
    const b = document.createElement('button');
    b.className = 'tab'; b.dataset.id = t.id; b.textContent = t.label;
    b.onclick = () => switchTab(t.id);
    tb.appendChild(b);
  });
  // cargar archivo
  document.querySelector('#btnUpload').addEventListener('click', openUploader);
  initUpload(() => { render(); }); // al terminar de cargar, refresca la vista activa
  // cerrar modal con fondo
  document.querySelector('#ov').addEventListener('click', e => { if (e.target.id === 'ov') closeModal(); });
  render();
  // datos maestros (Ejecutivos/Materiales) e inventario para precios en fuentes
  ensureInvData();
  loadEnrich(false).then(() => render());
}

boot();
