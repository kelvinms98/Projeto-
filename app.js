const STORAGE_KEY = 'registro-entregas-v1';
const SETTINGS_KEY = 'registro-entregas-settings-v1';
const SUPABASE_URL = 'https://khimlcgwdhmuymqolzpu.supabase.co';
const SUPABASE_KEY = 'sb_publishable_CSq2WN8zOCErPR89hwckbQ_7YW6Aa4i';
const SUPABASE_TABLE = `${SUPABASE_URL}/rest/v1/project_entries`;
let entries = [];
const DEFAULT_SETTINGS = { email: 'k.monteiro.soares@uni9.edu.br', key: 'if4zrgh5gxkaWuYyG', service: 'service_dpv9z4r', template: 'template_3zqr5fj' };
let settings = { ...DEFAULT_SETTINGS, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}') };
let currentView = 'updates';
const $ = (selector) => document.querySelector(selector);
const formatDate = (value) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(value)).replace('.', '').toUpperCase();
const formatTime = (value) => new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date(value));
const escapeHtml = (value) => String(value).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const supabaseHeaders = () => ({ apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json' });

async function loadEntries() {
  try {
    const response = await fetch(`${SUPABASE_TABLE}?select=*&order=created_at.desc`, { headers: supabaseHeaders() });
    if (!response.ok) throw new Error('Supabase indisponível');
    entries = (await response.json()).map((entry) => ({ ...entry, createdAt: entry.created_at }));
    $('#connection-status').innerHTML = '<i></i> sincronizado com Supabase';
  } catch (error) {
    entries = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    $('#connection-status').innerHTML = '<i></i> modo local (configure o banco)';
  }
  render();
}

async function saveEntry(entry) {
  const response = await fetch(SUPABASE_TABLE, { method: 'POST', headers: { ...supabaseHeaders(), Prefer: 'return=minimal' }, body: JSON.stringify({ id: entry.id, type: entry.type, name: entry.name, ra: entry.ra, description: entry.description, status: entry.status, image: entry.image, created_at: entry.createdAt }) });
  if (!response.ok) throw new Error('Não foi possível salvar no Supabase');
}

async function deleteEntry(id) {
  const response = await fetch(`${SUPABASE_TABLE}?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE', headers: supabaseHeaders() });
  if (!response.ok) throw new Error('Não foi possível excluir no Supabase');
}

function compressImage(file) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const scale = Math.min(1, 1400 / image.width, 1000 / image.height);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(image.width * scale));
      canvas.height = Math.max(1, Math.round(image.height * scale));
      canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', 0.72));
      URL.revokeObjectURL(image.src);
    };
    image.onerror = () => reject(new Error('Não foi possível ler o print'));
    image.src = URL.createObjectURL(file);
  });
}

function render() {
  const list = entries.filter((entry) => entry.type === currentView).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const updates = entries.filter((entry) => entry.type === 'updates');
  $('#today').textContent = formatDate(new Date());
  $('#updates-count').textContent = updates.length;
  $('#docs-count').textContent = entries.filter((entry) => entry.type === 'docs').length;
  $('#working-count').textContent = updates.length ? `${Math.round(updates.filter((entry) => entry.status === 'working').length / updates.length * 100)}%` : '—';
  $('#last-entry').textContent = entries.length ? formatDate(entries.reduce((latest, entry) => new Date(entry.createdAt) > new Date(latest.createdAt) ? entry : latest).createdAt) : '—';
  $('#tab-updates').textContent = updates.length;
  $('#tab-docs').textContent = entries.filter((entry) => entry.type === 'docs').length;
  $('#view-title').textContent = currentView === 'updates' ? 'Atualizações de código' : 'Documentação';
  $('#view-kicker').textContent = currentView === 'updates' ? 'DIÁRIO TÉCNICO' : 'EVIDÊNCIAS DO PROJETO';
  $('#entries').innerHTML = list.map((entry) => `<article class="entry"><div class="entry-top"><div class="avatar">${escapeHtml(entry.name.charAt(0).toUpperCase())}</div><div class="entry-person"><strong>${escapeHtml(entry.name)}</strong><span>RA ${escapeHtml(entry.ra)} · ${formatDate(entry.createdAt)} às ${formatTime(entry.createdAt)}</span></div><span class="type-label ${entry.type}">${entry.type === 'updates' ? 'CÓDIGO' : 'DOCS'}</span></div><p class="entry-description">${escapeHtml(entry.description)}</p>${entry.type === 'updates' ? `<span class="result ${entry.status}">${entry.status === 'working' ? '● Funcionando' : '● Não funcionando'}</span>` : ''}<img class="entry-image" src="${entry.image}" alt="Print enviado por ${escapeHtml(entry.name)}"><button class="delete-entry" data-id="${entry.id}" title="Excluir registro" aria-label="Excluir registro">×</button></article>`).join('');
  $('#empty-state').hidden = list.length > 0;
}

function openEntry(type = currentView) {
  $('#entry-type').value = type;
  $('#dialog-title').textContent = type === 'updates' ? 'Atualização de código' : 'Documentação';
  $('#status-field').hidden = type !== 'updates';
  $('#entry-form').reset();
  $('#preview').hidden = true;
  $('#entry-dialog').hidden = false;
  $('#person-name').focus();
}
function closeDialog(id) { $(`#${id}`).hidden = true; }

async function notify(entry) {
  const status = entry.status === 'working' ? 'Funcionando' : 'Não funcionando';
  const body = `Nome: ${entry.name}\nRA: ${entry.ra}\nData: ${formatDate(entry.createdAt)}\nO que foi feito: ${entry.description}\nStatus: ${status}`;
  if (settings.key && settings.service && settings.template) {
    try {
      const response = await fetch('https://api.emailjs.com/api/v1.0/email/send', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ service_id: settings.service, template_id: settings.template, user_id: settings.key, template_params: { to_email: settings.email, from_name: entry.name, ra: entry.ra, description: entry.description, status, date: formatDate(entry.createdAt), screenshot: entry.image } }) });
      if (!response.ok) throw new Error('EmailJS rejeitou o envio');
      alert('Registro salvo e notificação enviada.');
      return;
    } catch (error) {
      alert('Registro salvo, mas o e-mail automático falhou. O aplicativo de e-mail será aberto.');
    }
  }
  location.href = `mailto:${settings.email || ''}?subject=${encodeURIComponent(`Novo registro no projeto: ${entry.name}`)}&body=${encodeURIComponent(body)}`;
}

$('#entry-form').addEventListener('submit', (event) => {
  event.preventDefault();
  const file = $('#screenshot').files[0];
  if (!file || file.size > 5 * 1024 * 1024) return alert('Selecione um print de imagem de até 5 MB.');
  compressImage(file).then(async (image) => {
    const entry = { id: crypto.randomUUID(), type: $('#entry-type').value, name: $('#person-name').value.trim(), ra: $('#person-ra').value.trim(), description: $('#description').value.trim(), status: document.querySelector('input[name="status"]:checked').value, image, createdAt: new Date().toISOString() };
    try {
      await saveEntry(entry);
      entries.push(entry);
    } catch (error) {
      entries.push(entry);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
      alert(`Não foi possível salvar no banco: ${error.message}. O registro ficou salvo apenas neste navegador.`);
    }
    closeDialog('entry-dialog');
    render();
    if (settings.email) notify(entry);
  }).catch((error) => alert(error.message));
});
$('#screenshot').addEventListener('change', () => { const file = $('#screenshot').files[0]; if (file) { $('#preview').src = URL.createObjectURL(file); $('#preview').hidden = false; } });
$('#settings-form').addEventListener('submit', (event) => { event.preventDefault(); settings = { email: $('#owner-email').value.trim(), key: $('#emailjs-key').value.trim(), service: $('#emailjs-service').value.trim(), template: $('#emailjs-template').value.trim() }; localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); closeDialog('settings-dialog'); });
document.addEventListener('click', (event) => {
  const tab = event.target.closest('.tab');
  if (tab) { currentView = tab.dataset.view; document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab)); render(); }
  const close = event.target.closest('[data-close]');
  if (close) closeDialog(close.dataset.close);
  if (event.target.id === 'new-entry-button' || event.target.id === 'empty-new-button') openEntry();
  if (event.target.id === 'settings-button') { $('#owner-email').value = settings.email || ''; $('#emailjs-key').value = settings.key || ''; $('#emailjs-service').value = settings.service || ''; $('#emailjs-template').value = settings.template || ''; $('#settings-dialog').hidden = false; }
  const deleteButton = event.target.closest('.delete-entry');
  if (deleteButton && confirm('Excluir este registro?')) { deleteEntry(deleteButton.dataset.id).then(() => { entries = entries.filter((entry) => entry.id !== deleteButton.dataset.id); render(); }).catch(() => alert('Não foi possível excluir o registro no banco.')); }
});
loadEntries();
