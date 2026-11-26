'use strict';

const $ = (selector) => document.querySelector(selector);
const loginView = $('#loginView');
const dashboardView = $('#dashboardView');

function showMessage(element, message, type = '') {
  if (!element) return;
  element.textContent = message || '';
  element.className = `form-message${type ? ` ${type}` : ''}`;
}

async function api(url, options = {}) {
  const response = await fetch(url, {
    credentials: 'same-origin',
    ...options,
    headers: {
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      Accept: 'application/json',
      ...(options.headers || {})
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Požiadavka sa nepodarila.');
  return data;
}

function showDashboard() {
  loginView.classList.add('hidden');
  dashboardView.classList.remove('hidden');
  loadAdminContent();
}

function showLogin() {
  dashboardView.classList.add('hidden');
  loginView.classList.remove('hidden');
}

async function checkSession() {
  try {
    const data = await api('/api/admin/session');
    if (data.authenticated) showDashboard();
    else showLogin();
  } catch {
    showLogin();
  }
}

async function loadAdminContent() {
  try {
    const content = await api('/api/content');
    for (const field of ['heroText', 'portfolioText', 'clipsText', 'infoTitle', 'infoText', 'instagramUrl', 'tiktokUrl', 'discordUrl', 'bookingUrl']) {
      const input = document.getElementById(field);
      if (input) input.value = content[field] || '';
    }
    renderClipManager(Array.isArray(content.clips) ? content.clips : []);
  } catch (error) {
    showMessage($('#contentMessage'), error.message, 'error');
  }
}

function renderClipManager(clips) {
  const manager = $('#clipManager');
  const count = $('#clipCount');
  if (!manager || !count) return;
  count.textContent = `${clips.length} ${clips.length === 1 ? 'klip' : clips.length >= 2 && clips.length <= 4 ? 'klipy' : 'klipov'}`;
  manager.replaceChildren();
  if (!clips.length) {
    const empty = document.createElement('p');
    empty.className = 'empty-manager';
    empty.textContent = 'Zatiaľ si nenahral žiadny klip.';
    manager.append(empty);
    return;
  }
  clips.forEach((clip) => {
    const row = document.createElement('div');
    row.className = 'managed-clip';
    const info = document.createElement('div');
    info.style.minWidth = '0';
    const title = document.createElement('strong');
    title.textContent = clip.title || 'Bez názvu';
    const detail = document.createElement('small');
    detail.textContent = clip.description || 'Bez popisu';
    info.append(title, detail);

    const remove = document.createElement('button');
    remove.className = 'delete-clip';
    remove.type = 'button';
    remove.textContent = 'Odstrániť';
    remove.addEventListener('click', () => deleteClip(clip.id, clip.title));
    row.append(info, remove);
    manager.append(row);
  });
}

async function deleteClip(id, title) {
  if (!window.confirm(`Naozaj chceš odstrániť klip „${title || 'Bez názvu'}“?`)) return;
  try {
    await api(`/api/admin/clips/${encodeURIComponent(id)}`, { method: 'DELETE' });
    await loadAdminContent();
  } catch (error) {
    showMessage($('#uploadMessage'), error.message, 'error');
  }
}

$('#loginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage($('#loginMessage'), 'Prihlasujem...');
  try {
    const username = $('#username').value;
    const password = $('#password').value;
    await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ username, password }) });
    $('#password').value = '';
    showDashboard();
  } catch (error) {
    showMessage($('#loginMessage'), error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

$('#logoutButton')?.addEventListener('click', async () => {
  try { await api('/api/admin/logout', { method: 'POST', body: '{}' }); } catch { /* Expired sessions are already logged out. */ }
  showLogin();
});

$('#contentForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage($('#contentMessage'), 'Ukladám...');
  const fields = ['heroText', 'portfolioText', 'clipsText', 'infoTitle', 'infoText'];
  const payload = Object.fromEntries(fields.map((field) => [field, document.getElementById(field).value]));
  try {
    const result = await api('/api/admin/content', { method: 'PUT', body: JSON.stringify(payload) });
    showMessage($('#contentMessage'), result.message, 'success');
  } catch (error) {
    showMessage($('#contentMessage'), error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

$('#linksForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage($('#linksMessage'), 'Ukladám...');
  const fields = ['instagramUrl', 'tiktokUrl', 'discordUrl', 'bookingUrl'];
  const payload = Object.fromEntries(fields.map((field) => [field, document.getElementById(field).value]));
  try {
    const result = await api('/api/admin/content', { method: 'PUT', body: JSON.stringify(payload) });
    showMessage($('#linksMessage'), result.message, 'success');
  } catch (error) {
    showMessage($('#linksMessage'), error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

$('#videoFile')?.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  $('#fileName').textContent = file ? file.name : 'MP4, WebM alebo MOV · max. 120 MB';
});

$('#uploadForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  const file = $('#videoFile').files?.[0];
  if (!file) return showMessage($('#uploadMessage'), 'Najprv vyber video súbor.', 'error');
  button.disabled = true;
  showMessage($('#uploadMessage'), 'Nahrávam video...');
  try {
    await api('/api/admin/clips', { method: 'POST', body: new FormData(event.currentTarget) });
    event.currentTarget.reset();
    $('#fileName').textContent = 'MP4, WebM alebo MOV · max. 120 MB';
    showMessage($('#uploadMessage'), 'Clip bol nahratý.', 'success');
    await loadAdminContent();
  } catch (error) {
    showMessage($('#uploadMessage'), error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

document.addEventListener('DOMContentLoaded', checkSession);
