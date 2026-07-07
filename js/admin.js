/* ===========================================================================
   admin.js · módulo de Administración (solo admin). Vive aquí la configuración:
   gestión de usuarios/roles, parámetros del portal, e historial de archivos.
   Todo lee/escribe en Supabase (portal_users, portal_roles, portal_config,
   portal_uploads). Si no hay permiso, no se muestra.
   =========================================================================== */
import { sb } from './supabaseClient.js';
import { openModal, closeModal } from './ui.js';
import { esc } from './utils.js';
import { isAdmin, canConfig, canUsers, currentEmail, logout } from './authSupabase.js';

async function loadUsers() {
  const c = sb(); if (!c) return [];
  const { data } = await c.from('portal_users').select('user_id,email,role,active').order('email');
  return data || [];
}
async function loadRoles() {
  const c = sb(); if (!c) return [];
  const { data } = await c.from('portal_roles').select('role,descripcion').order('role');
  return data || [];
}
async function loadConfig() {
  const c = sb(); if (!c) return [];
  const { data } = await c.from('portal_config').select('key,value,descripcion').order('key');
  return data || [];
}
async function loadUploads() {
  const c = sb(); if (!c) return [];
  const { data } = await c.from('portal_uploads').select('id,name,file_name,size_bytes,is_active,uploaded_at').order('uploaded_at', { ascending: false }).limit(30);
  return data || [];
}

export async function openAdmin() {
  if (!isAdmin() && !canConfig() && !canUsers()) { openModal('<button class="x" onclick="closeModal()">×</button><h2>Administración</h2><p class="muted">No tienes permisos para ver esta sección.</p>'); return; }
  const [users, roles, config, uploads] = await Promise.all([loadUsers(), loadRoles(), loadConfig(), loadUploads()]);
  const roleOpts = roles.map(r => r.role);

  const usersRows = users.map(u => `<tr>
    <td>${esc(u.email)}</td>
    <td><select data-urole="${esc(u.user_id)}" ${canUsers() ? '' : 'disabled'}>${roleOpts.map(r => `<option ${r === u.role ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></td>
    <td style="text-align:center"><input type="checkbox" data-uactive="${esc(u.user_id)}" ${u.active ? 'checked' : ''} ${canUsers() ? '' : 'disabled'}></td>
  </tr>`).join('');

  const cfgRows = config.map(k => `<tr>
    <td><b>${esc(k.key)}</b><div class="sub">${esc(k.descripcion || '')}</div></td>
    <td><input data-cfg="${esc(k.key)}" value="${esc(typeof k.value === 'string' ? k.value : JSON.stringify(k.value))}" ${canConfig() ? '' : 'disabled'} style="width:120px"></td>
  </tr>`).join('');

  const upRows = uploads.map(u => `<tr>
    <td>${esc(u.file_name || u.name || '—')}</td>
    <td class="num">${u.size_bytes ? (u.size_bytes / 1e6).toFixed(1) + ' MB' : '—'}</td>
    <td>${new Date(u.uploaded_at).toLocaleString('es-MX')}</td>
    <td style="text-align:center">${u.is_active ? '<span class="pill vio">activo</span>' : `<button class="btn" data-activate="${esc(u.id)}">activar</button>`}</td>
  </tr>`).join('');

  openModal(`
    <button class="x" onclick="closeModal()">×</button>
    <h2>⚙️ Administración</h2>
    <p class="muted">Sesión: <b>${esc(currentEmail())}</b> · <span class="lnk" id="admLogout">cerrar sesión</span></p>

    ${canUsers() ? `<div class="card"><h3>👥 Usuarios y roles</h3>
      <div class="tbl"><table><thead><tr><th>Correo</th><th>Rol</th><th>Activo</th></tr></thead><tbody>${usersRows}</tbody></table></div>
      <div style="text-align:right;margin-top:8px"><button class="btn primary" id="admSaveUsers">Guardar usuarios</button></div></div>` : ''}

    ${canConfig() ? `<div class="card"><h3>🎛️ Parámetros</h3>
      <div class="tbl"><table><thead><tr><th>Parámetro</th><th>Valor</th></tr></thead><tbody>${cfgRows}</tbody></table></div>
      <div style="text-align:right;margin-top:8px"><button class="btn primary" id="admSaveCfg">Guardar parámetros</button></div></div>` : ''}

    <div class="card"><h3>📂 Archivos subidos <span class="hint">el activo es el que ven todos los dispositivos</span></h3>
      <div class="tbl"><table><thead><tr><th>Archivo</th><th class="num">Tamaño</th><th>Fecha</th><th>Estado</th></tr></thead><tbody>${upRows || '<tr><td colspan="4" class="muted">Sin archivos.</td></tr>'}</tbody></table></div>
    </div>
  `);

  document.getElementById('admLogout')?.addEventListener('click', async () => { await logout(); closeModal(); location.reload(); });

  document.getElementById('admSaveUsers')?.addEventListener('click', async () => {
    const c = sb(); if (!c) return;
    const btn = document.getElementById('admSaveUsers'); btn.disabled = true; btn.textContent = 'Guardando…';
    const ops = [];
    document.querySelectorAll('[data-urole]').forEach(sel => {
      const id = sel.dataset.urole; const role = sel.value;
      const active = document.querySelector(`[data-uactive="${id}"]`)?.checked;
      ops.push(c.from('portal_users').update({ role, active, updated_at: new Date().toISOString() }).eq('user_id', id));
    });
    try { await Promise.all(ops); btn.textContent = 'Guardado ✔'; } catch (e) { btn.textContent = 'Error'; }
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Guardar usuarios'; }, 1500);
  });

  document.getElementById('admSaveCfg')?.addEventListener('click', async () => {
    const c = sb(); if (!c) return;
    const btn = document.getElementById('admSaveCfg'); btn.disabled = true; btn.textContent = 'Guardando…';
    const ops = [];
    document.querySelectorAll('[data-cfg]').forEach(inp => {
      let v = inp.value.trim();
      try { v = JSON.parse(v); } catch (e) { v = JSON.stringify(v); } // guardar como jsonb
      ops.push(c.from('portal_config').update({ value: v, updated_at: new Date().toISOString() }).eq('key', inp.dataset.cfg));
    });
    try { await Promise.all(ops); btn.textContent = 'Guardado ✔'; } catch (e) { btn.textContent = 'Error'; }
    setTimeout(() => { btn.disabled = false; btn.textContent = 'Guardar parámetros'; }, 1500);
  });

  document.querySelectorAll('[data-activate]').forEach(b => b.addEventListener('click', async () => {
    const c = sb(); if (!c) return;
    const id = b.dataset.activate; b.disabled = true; b.textContent = '…';
    try {
      await c.from('portal_uploads').update({ is_active: false }).eq('is_active', true);
      await c.from('portal_uploads').update({ is_active: true }).eq('id', id);
      location.reload();
    } catch (e) { b.disabled = false; b.textContent = 'activar'; }
  }));
}
