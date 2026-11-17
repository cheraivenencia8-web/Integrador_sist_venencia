const loginScreen = document.querySelector('#login-screen');
const application = document.querySelector('#application');
const loginMessage = document.querySelector('#login-message');
const appMessage = document.querySelector('#app-message');
const memberForm = document.querySelector('#member-form');
const categoryForm = document.querySelector('#category-form');
const userForm = document.querySelector('#user-form');

let currentUser = null;
let categories = [];
let editingMemberId = null;

async function api(url, options = {}) {
  const response = await fetch(`/api${url}`, {
    ...options,
    headers: { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers },
    credentials: 'same-origin',
  });
  const result = response.status === 204 ? null : await response.json();
  if (!response.ok) {
    if (response.status === 401 && currentUser) showLogin();
    throw new Error(result?.error || 'No se pudo completar la solicitud.');
  }
  return result;
}

function showMessage(target, text = '', success = false) {
  target.textContent = text;
  target.style.color = success ? '#35654d' : '#a53d32';
}

function showLogin() {
  currentUser = null;
  application.hidden = true;
  loginScreen.hidden = false;
}

function showApplication(user) {
  currentUser = user;
  loginScreen.hidden = true;
  application.hidden = false;
  document.querySelector('#current-user').textContent = user.username;
  document.querySelector('#current-role').textContent = user.rol;
  document.querySelectorAll('.admin-only').forEach((element) => {
    element.hidden = user.rol !== 'ADMIN';
  });
  document.querySelector('#member-state-field').hidden = true;
  refreshAll().catch((error) => showMessage(appMessage, error.message));
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function money(value) {
  return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(Number(value));
}

function dateLabel(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? escapeHtml(value) : date.toLocaleDateString('es-AR');
}

async function refreshDashboard() {
  const data = await api('/admin/dashboard');
  document.querySelector('#members-total').textContent = data.socios.total;
  document.querySelector('#members-active').textContent = data.socios.activos;
  document.querySelector('#categories-active').textContent = data.categorias.activas;
}

async function refreshCategories() {
  const data = await api('/categorias');
  categories = data.categories;
  const active = categories.filter((category) => category.estado === 'ACTIVA');
  document.querySelector('[name="id_categoria"]').innerHTML = active
    .map((category) => `<option value="${category.id_categoria}">${escapeHtml(category.nombre)}</option>`).join('');
  document.querySelector('#categories-table').innerHTML = categories.map((category) => `
    <tr>
      <td><b>${escapeHtml(category.nombre)}</b></td>
      <td>${money(category.cuota)}</td>
      <td><span class="badge ${category.estado === 'ACTIVA' ? '' : 'inactive'}">${category.estado}</span></td>
      <td>${currentUser.rol === 'ADMIN' ? `<div class="table-actions">
        ${category.estado === 'ACTIVA' ? `<button class="secondary-button" data-edit-category="${category.id_categoria}">Editar</button><button class="danger" data-disable-category="${category.id_categoria}">Desactivar</button>` : '—'}
      </div>` : '—'}</td>
    </tr>`).join('');
}

async function refreshMembers() {
  const query = new URLSearchParams();
  const search = document.querySelector('#member-search').value.trim();
  const state = document.querySelector('#member-state-filter').value;
  if (search) query.set('search', search);
  if (state) query.set('estado', state);
  const data = await api(`/socios${query.size ? `?${query}` : ''}`);
  const body = document.querySelector('#members-table');
  body.innerHTML = data.members.map((member) => `
    <tr>
      <td><b>${escapeHtml(member.nombre_apellido)}</b><small>${escapeHtml(member.email || 'Sin email')}</small></td>
      <td>${escapeHtml(member.dni)}</td>
      <td>${escapeHtml(member.categoria)}</td>
      <td>${dateLabel(member.fecha_alta)}</td>
      <td><span class="badge ${member.estado === 'ACTIVO' ? '' : 'inactive'}">${member.estado}</span></td>
      <td><div class="table-actions">
        <button class="secondary-button" data-edit-member="${member.id_socio}">Editar</button>
        ${currentUser.rol === 'ADMIN' && member.estado === 'ACTIVO' ? `<button class="danger" data-disable-member="${member.id_socio}">Baja</button>` : ''}
      </div></td>
    </tr>`).join('');
  document.querySelector('#empty-members').hidden = data.members.length > 0;
}

async function refreshUsers() {
  if (currentUser.rol !== 'ADMIN') return;
  const data = await api('/auth/users');
  document.querySelector('#users-table').innerHTML = data.users.map((user) => `
    <tr><td><b>${escapeHtml(user.username)}</b></td><td>${user.rol}</td>
      <td><span class="badge ${user.estado === 'ACTIVO' ? '' : 'inactive'}">${user.estado}</span></td>
      <td>${user.id_usuario === currentUser.id ? 'Tu cuenta' : `<button class="secondary-button" data-toggle-user="${user.id_usuario}" data-state="${user.estado}">${user.estado === 'ACTIVO' ? 'Desactivar' : 'Activar'}</button>`}</td>
    </tr>`).join('');
}

async function refreshAudit() {
  if (currentUser.rol !== 'ADMIN') return;
  const data = await api('/admin/audit');
  document.querySelector('#audit-table').innerHTML = data.audit.map((entry) => `
    <tr><td>${new Date(entry.fecha).toLocaleString('es-AR')}</td><td>${escapeHtml(entry.username)}</td>
      <td>${escapeHtml(entry.accion)}</td><td>${escapeHtml(entry.entidad)}</td>
      <td><span class="badge ${entry.resultado === 'OK' ? '' : 'inactive'}">${entry.resultado}</span></td></tr>`).join('');
}

async function refreshAll() {
  await Promise.all([refreshDashboard(), refreshCategories(), refreshMembers()]);
  if (currentUser.rol === 'ADMIN') await Promise.all([refreshUsers(), refreshAudit()]);
}

document.querySelector('#login-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  showMessage(loginMessage);
  const values = Object.fromEntries(new FormData(event.currentTarget));
  try {
    const data = await api('/auth/login', { method: 'POST', body: JSON.stringify(values) });
    event.currentTarget.reset();
    showApplication(data.user);
  } catch (error) {
    showMessage(loginMessage, error.message);
  }
});

document.querySelector('#logout-button').addEventListener('click', async () => {
  try {
    await api('/auth/logout', { method: 'POST', body: '{}' });
  } catch (error) {
    showMessage(loginMessage, error.message);
  } finally {
    showLogin();
  }
});

document.querySelector('#navigation').addEventListener('click', (event) => {
  const button = event.target.closest('[data-view]');
  if (!button) return;
  document.querySelectorAll('.nav-link').forEach((item) => item.classList.toggle('active', item === button));
  document.querySelectorAll('.view').forEach((view) => { view.hidden = view.id !== button.dataset.view; });
  document.querySelector('#page-title').textContent = button.textContent.trim();
});

document.querySelector('#new-member-button').addEventListener('click', () => {
  editingMemberId = null;
  memberForm.reset();
  memberForm.elements.fecha_alta.value = new Date().toISOString().slice(0, 10);
  memberForm.elements.estado.value = 'ACTIVO';
  memberForm.elements.estado.closest('label').hidden = true;
  memberForm.elements.estado.disabled = true;
  memberForm.hidden = false;
  memberForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
});

memberForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(memberForm));
  const payload = {
    ...values,
    id_categoria: Number(values.id_categoria),
    email: values.email || '',
  };
  try {
    await api(editingMemberId ? `/socios/${editingMemberId}` : '/socios', {
      method: editingMemberId ? 'PATCH' : 'POST',
      body: JSON.stringify(payload),
    });
    memberForm.hidden = true;
    showMessage(appMessage, editingMemberId ? 'Socio actualizado.' : 'Socio registrado.', true);
    await Promise.all([refreshMembers(), refreshDashboard()]);
  } catch (error) {
    showMessage(appMessage, error.message);
  }
});

document.querySelector('#member-search').addEventListener('input', () => {
  clearTimeout(document.querySelector('#member-search').searchTimer);
  document.querySelector('#member-search').searchTimer = setTimeout(() => {
    refreshMembers().catch((error) => showMessage(appMessage, error.message));
  }, 250);
});
document.querySelector('#member-state-filter').addEventListener('change', () => {
  refreshMembers().catch((error) => showMessage(appMessage, error.message));
});

document.querySelector('#members-table').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-member]');
  const disable = event.target.closest('[data-disable-member]');
  try {
    if (edit) {
      const { member } = await api(`/socios/${edit.dataset.editMember}`);
      editingMemberId = member.id_socio;
      memberForm.elements.nombre_apellido.value = member.nombre_apellido;
      memberForm.elements.dni.value = member.dni;
      memberForm.elements.email.value = member.email || '';
      memberForm.elements.id_categoria.value = member.id_categoria;
      memberForm.elements.fecha_alta.value = String(member.fecha_alta).slice(0, 10);
      memberForm.elements.estado.value = member.estado;
      memberForm.elements.estado.closest('label').hidden = currentUser.rol !== 'ADMIN';
      memberForm.elements.estado.disabled = currentUser.rol !== 'ADMIN';
      memberForm.hidden = false;
      memberForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else if (disable && confirm('¿Dar de baja a este socio? La información se conservará en el sistema.')) {
      await api(`/socios/${disable.dataset.disableMember}`, { method: 'DELETE' });
      showMessage(appMessage, 'Socio dado de baja.', true);
      await Promise.all([refreshMembers(), refreshDashboard()]);
    }
  } catch (error) {
    showMessage(appMessage, error.message);
  }
});

document.querySelector('[data-cancel="member-form"]').addEventListener('click', () => { memberForm.hidden = true; });

categoryForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(categoryForm));
  try {
    await api('/categorias', {
      method: 'POST',
      body: JSON.stringify({ nombre: values.nombre, cuota: Number(values.cuota) }),
    });
    categoryForm.reset();
    categoryForm.elements.cuota.value = '0';
    showMessage(appMessage, 'Categoría creada.', true);
    await Promise.all([refreshCategories(), refreshDashboard()]);
  } catch (error) {
    showMessage(appMessage, error.message);
  }
});

document.querySelector('#categories-table').addEventListener('click', async (event) => {
  const edit = event.target.closest('[data-edit-category]');
  const disable = event.target.closest('[data-disable-category]');
  try {
    if (edit) {
      const category = categories.find((item) => item.id_categoria === Number(edit.dataset.editCategory));
      const nombre = prompt('Nombre de la categoría:', category.nombre);
      if (nombre === null) return;
      const cuotaValue = prompt('Cuota mensual:', category.cuota);
      if (cuotaValue === null) return;
      const cuota = Number(cuotaValue);
      if (!Number.isFinite(cuota) || cuota < 0) throw new Error('La cuota debe ser un número igual o mayor a cero.');
      await api(`/categorias/${category.id_categoria}`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre: nombre.trim(), cuota }),
      });
      showMessage(appMessage, 'Categoría actualizada.', true);
      await refreshCategories();
    } else if (disable && confirm('¿Desactivar esta categoría?')) {
      await api(`/categorias/${disable.dataset.disableCategory}`, { method: 'DELETE' });
      showMessage(appMessage, 'Categoría desactivada.', true);
      await Promise.all([refreshCategories(), refreshDashboard()]);
    }
  } catch (error) {
    showMessage(appMessage, error.message);
  }
});

userForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const values = Object.fromEntries(new FormData(userForm));
  try {
    await api('/auth/users', { method: 'POST', body: JSON.stringify(values) });
    userForm.reset();
    showMessage(appMessage, 'Usuario creado.', true);
    await refreshUsers();
  } catch (error) {
    showMessage(appMessage, error.message);
  }
});

document.querySelector('#users-table').addEventListener('click', async (event) => {
  const button = event.target.closest('[data-toggle-user]');
  if (!button) return;
  const estado = button.dataset.state === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO';
  try {
    await api(`/auth/users/${button.dataset.toggleUser}/status`, {
      method: 'PATCH', body: JSON.stringify({ estado }),
    });
    showMessage(appMessage, `Usuario ${estado === 'ACTIVO' ? 'activado' : 'desactivado'}.`, true);
    await refreshUsers();
  } catch (error) {
    showMessage(appMessage, error.message);
  }
});

document.querySelector('#export-button').addEventListener('click', async () => {
  try {
    const result = await api('/socios/export?encrypted=true');
    document.querySelector('#export-result').value = JSON.stringify(result, null, 2);
    document.querySelector('#export-dialog').showModal();
  } catch (error) {
    showMessage(appMessage, error.message);
  }
});

document.querySelector('#download-export').addEventListener('click', () => {
  const blob = new Blob([document.querySelector('#export-result').value], { type: 'application/json' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = `socios-cifrado-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
});

api('/auth/me').then(({ user }) => showApplication(user)).catch(() => showLogin());
