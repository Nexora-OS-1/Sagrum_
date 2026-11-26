import * as tus from 'https://esm.sh/tus-js-client@4';
import { supabase, requireSupabase } from './supabase-client.js';
import { addClip, deleteClip, loadPublicContent, saveContent } from './supabase-data.js';

const $ = (selector) => document.querySelector(selector);
const loginView = $('#loginView');
const dashboardView = $('#dashboardView');

function showMessage(element, message, type = '') {
  if (!element) return;
  element.textContent = message || '';
  element.className = `form-message${type ? ` ${type}` : ''}`;
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

async function hasAdminAccess() {
  const client = requireSupabase();
  const { data, error } = await client.rpc('is_sagrum_admin');
  if (error) throw error;
  return data === true;
}

async function checkSession() {
  try {
    const client = requireSupabase();
    const { data: { session }, error } = await client.auth.getSession();
    if (error) throw error;
    if (!session) return showLogin();
    if (await hasAdminAccess()) showDashboard();
    else {
      await client.auth.signOut();
      showLogin();
      showMessage($('#loginMessage'), 'Tento účet nemá práva administrátora.', 'error');
    }
  } catch (error) {
    showLogin();
    showMessage($('#loginMessage'), error.message, 'error');
  }
}

async function loadAdminContent() {
  try {
    const content = await loadPublicContent();
    for (const field of ['heroText', 'portfolioText', 'clipsText', 'infoTitle', 'infoText', 'instagramUrl', 'tiktokUrl', 'discordUrl', 'bookingUrl']) {
      const input = document.getElementById(field);
      if (input) input.value = content[field] || '';
    }
    renderClipManager(content.clips);
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
    remove.addEventListener('click', () => deleteClipFromAdmin(clip.id, clip.title));
    row.append(info, remove);
    manager.append(row);
  });
}

async function deleteClipFromAdmin(id, title) {
  if (!window.confirm(`Naozaj chceš odstrániť klip „${title || 'Bez názvu'}“?`)) return;
  try {
    await deleteClip(id);
    await loadAdminContent();
  } catch (error) {
    showMessage($('#uploadMessage'), error.message, 'error');
  }
}

function uploadWithTus({ file, storagePath, accessToken, onProgress }) {
  const config = window.SAGRUM_SUPABASE_CONFIG;
  const projectRef = new URL(config.url).hostname.split('.')[0];
  const upload = new tus.Upload(file, {
    endpoint: `https://${projectRef}.storage.supabase.co/storage/v1/upload/resumable`,
    retryDelays: [0, 3000, 5000, 10000, 20000],
    headers: {
      authorization: `Bearer ${accessToken}`,
      apikey: config.publishableKey
    },
    uploadDataDuringCreation: true,
    removeFingerprintOnSuccess: true,
    chunkSize: 6 * 1024 * 1024,
    metadata: {
      bucketName: 'sagrum-clips',
      objectName: storagePath,
      contentType: file.type,
      cacheControl: '3600'
    },
    onError: (error) => onProgress(error),
    onProgress: (bytesUploaded, bytesTotal) => {
      onProgress(null, Math.round((bytesUploaded / bytesTotal) * 100));
    },
    onSuccess: () => onProgress(null, 100, true)
  });
  upload.start();
}

$('#loginForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  showMessage($('#loginMessage'), 'Prihlasujem...');
  try {
    const client = requireSupabase();
    const email = $('#email').value.trim();
    const password = $('#password').value;
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw error;
    if (!await hasAdminAccess()) {
      await client.auth.signOut();
      throw new Error('Tento účet nemá práva administrátora.');
    }
    $('#password').value = '';
    showDashboard();
  } catch (error) {
    showMessage($('#loginMessage'), error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

$('#logoutButton')?.addEventListener('click', async () => {
  try { await supabase?.auth.signOut(); } catch { /* The local view still returns to login. */ }
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
    await saveContent(payload);
    showMessage($('#contentMessage'), 'Zmeny boli uložené.', 'success');
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
    await saveContent(payload);
    showMessage($('#linksMessage'), 'Zmeny boli uložené.', 'success');
  } catch (error) {
    showMessage($('#linksMessage'), error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

$('#videoFile')?.addEventListener('change', (event) => {
  const file = event.target.files?.[0];
  $('#fileName').textContent = file ? file.name : 'MP4, WebM alebo MOV · max. 50 MB';
});

$('#uploadForm')?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const button = form.querySelector('button[type="submit"]');
  const file = $('#videoFile').files?.[0];
  if (!file) return showMessage($('#uploadMessage'), 'Najprv vyber video súbor.', 'error');
  button.disabled = true;
  showMessage($('#uploadMessage'), 'Pripravujem nahrávanie...');
  let completed = false;
  try {
    const title = $('#clipTitle').value;
    const description = $('#clipDescription').value;
    await addClip({
      title,
      description,
      file,
      uploadFile: (options) => new Promise((resolve, reject) => {
        uploadWithTus({
          ...options,
          onProgress: (error, percent, success) => {
            if (error) return reject(error);
            showMessage($('#uploadMessage'), `Nahrávam video... ${percent}%`);
            if (success && !completed) {
              completed = true;
              resolve();
            }
          }
        });
      })
    });
    form.reset();
    $('#fileName').textContent = 'MP4, WebM alebo MOV · max. 50 MB';
    showMessage($('#uploadMessage'), 'Klip bol nahratý.', 'success');
    await loadAdminContent();
  } catch (error) {
    showMessage($('#uploadMessage'), error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

document.addEventListener('DOMContentLoaded', checkSession);
