'use strict';

const $ = (s) => document.querySelector(s);
const FIELDS = ['name', 'email', 'url'];
const PAGE_SIZE = 6;
const TIMEOUT_MS = 8000;

let totalAll = 0;
let page = 1;
let current = null;
let opener = null;
let reqId = 0;

// Build DOM nodes with textContent only (never raw HTML strings), so server data cannot inject markup.
function el(tag, text, cls) {
  const n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}

/* ---------------- Talking to the API ---------------- */

// Never throws. Returns { ok, status, body, retryAfter }; status 0 means the server could not be reached.
async function request(path, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(path, {
      ...options,
      signal: controller.signal,
      headers: { Accept: 'application/json', ...(options.headers || {}) }
    });
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    return {
      ok: res.ok && !!body && body.status === 'success',
      status: res.status,
      body,
      retryAfter: Number(res.headers.get('Retry-After')) || null
    };
  } catch (e) {
    return { ok: false, status: 0, body: null, retryAfter: null, timedOut: e.name === 'AbortError' };
  } finally {
    clearTimeout(timer);
  }
}

function describeFailure(res) {
  if (res.status === 0) return res.timedOut ? 'The server took too long to respond.' : 'Could not reach the server. Check your connection.';
  if (res.status === 429) return 'Too many requests. Try again in ' + (res.retryAfter || 60) + ' seconds.';
  if (res.status >= 500) {
    const ref = res.body && res.body.error && res.body.error.requestId;
    return 'The server had a problem. Please try again.' + (ref ? ' (Reference ' + String(ref).slice(0, 8) + ')' : '');
  }
  return (res.body && res.body.error && res.body.error.message) || 'Something unexpected happened.';
}

/* ---------------- Shareable filter state in the address bar ---------------- */

const inputs = { q: $('#q'), domain: $('#domain'), mode: $('#mode') };

function readUrlState() {
  const p = new URLSearchParams(location.search);
  inputs.q.value = (p.get('q') || '').slice(0, 100);
  const n = Number(p.get('page'));
  page = Number.isInteger(n) && n >= 1 ? n : 1;
  return { domain: p.get('domain') || '', mode: p.get('mode') || '' };
}

function applyOption(select, value) {
  if (value && Array.from(select.options).some((o) => o.value === value)) select.value = value;
}

function writeUrlState() {
  const p = new URLSearchParams();
  if (inputs.q.value.trim()) p.set('q', inputs.q.value.trim());
  if (inputs.domain.value) p.set('domain', inputs.domain.value);
  if (inputs.mode.value) p.set('mode', inputs.mode.value);
  if (page > 1) p.set('page', String(page));
  const qs = p.toString();
  history.replaceState(null, '', qs ? '?' + qs : location.pathname);
}

/* ---------------- List, filters, pagination ---------------- */

const stateBox = $('#state');
const list = $('#list');
const count = $('#count');
const pager = $('#pager');

function showState(kind, text, actionLabel, action) {
  stateBox.replaceChildren();
  if (!kind) return;
  const box = el('div', undefined, 'state ' + kind);
  if (kind === 'error') box.setAttribute('role', 'alert');
  const p = el('p');
  if (kind === 'loading') p.append(el('span', undefined, 'spinner'));
  p.append(document.createTextNode(text));
  box.append(p);
  if (actionLabel) {
    const b = el('button', actionLabel, 'btn');
    b.type = 'button';
    b.addEventListener('click', action);
    box.append(b);
  }
  stateBox.append(box);
}

function showLoadError(res, retry) {
  list.replaceChildren();
  pager.hidden = true;
  count.textContent = 'Error: internships could not be loaded.';
  showState('error', describeFailure(res), 'Retry', retry);
}

function card(i) {
  const a = el('article', undefined, 'card');
  a.append(el('h3', i.title), el('p', i.domain, 'domain'));

  const meta = el('ul', undefined, 'meta');
  ['Mode: ' + i.mode, 'Location: ' + i.location, i.openings + (i.openings === 1 ? ' opening' : ' openings')]
    .forEach((t) => meta.append(el('li', t)));
  if (!i.applications_open) meta.append(el('li', 'Applications closed', 'closed-tag'));
  a.append(meta);

  const skills = el('ul', undefined, 'skills');
  skills.setAttribute('aria-label', 'Skills');
  i.skills.forEach((s) => skills.append(el('li', s)));
  a.append(skills);

  const label = i.applications_open ? 'View details and apply' : 'View details';
  const btn = el('button', label, 'btn');
  btn.type = 'button';
  btn.setAttribute('aria-label', label + ': ' + i.title);
  btn.addEventListener('click', () => openDialog(i, btn));
  a.append(btn);
  return a;
}

// First request: unfiltered, to build the filter options and the overall total.
async function start() {
  const saved = readUrlState();
  const id = ++reqId;
  list.replaceChildren();
  pager.hidden = true;
  showState('loading', 'Loading internships…');
  count.textContent = 'Loading internships…';
  const res = await request('/api/internships?limit=50');
  if (id !== reqId) return;
  if (!res.ok) return showLoadError(res, start);

  totalAll = res.body.pagination.total;
  [['domain', 'domain'], ['mode', 'mode']].forEach(([field, key]) => {
    Array.from(new Set(res.body.data.map((i) => i[key]))).sort().forEach((v) => {
      const o = el('option', v);
      o.value = v;
      inputs[field].append(o);
    });
  });
  applyOption(inputs.domain, saved.domain);
  applyOption(inputs.mode, saved.mode);
  load();
}

async function load() {
  const id = ++reqId;
  writeUrlState();
  list.replaceChildren();
  pager.hidden = true;
  showState('loading', 'Loading internships…');
  count.textContent = 'Loading internships…';

  const params = new URLSearchParams({ page: String(page), limit: String(PAGE_SIZE) });
  const q = inputs.q.value.trim();
  if (q) params.set('q', q);
  if (inputs.domain.value) params.set('domain', inputs.domain.value);
  if (inputs.mode.value) params.set('mode', inputs.mode.value);

  const res = await request('/api/internships?' + params.toString());
  if (id !== reqId) return; // a newer request replaced this one
  if (!res.ok) return showLoadError(res, load);

  const { data, pagination } = res.body;
  if (pagination.total === 0) {
    count.textContent = 'No internships match your filters.';
    showState('empty', 'No internships match. Try a different search or clear the filters.', 'Clear filters', clearFilters);
    return;
  }
  if (data.length === 0 && page > pagination.totalPages) { // e.g. an old link to a page that no longer exists
    page = pagination.totalPages;
    return load();
  }
  showState(null);
  data.forEach((i) => { const li = el('li'); li.append(card(i)); list.append(li); });
  count.textContent = 'Showing ' + data.length + ' of ' + pagination.total + ' matching internships' +
    (pagination.total !== totalAll ? ' (' + totalAll + ' in total)' : '') + '.';

  if (pagination.totalPages > 1) {
    pager.hidden = false;
    $('#page-info').textContent = 'Page ' + pagination.page + ' of ' + pagination.totalPages;
    $('#prev').disabled = pagination.page <= 1;
    $('#next').disabled = pagination.page >= pagination.totalPages;
  }
}

function refilter() { page = 1; load(); }

function clearFilters() {
  inputs.q.value = '';
  inputs.domain.value = '';
  inputs.mode.value = '';
  refilter();
  inputs.q.focus();
}

async function changePage(delta) {
  page += delta;
  await load();
  $('#results').focus();
}

let timer;
inputs.q.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(refilter, 250); });
inputs.domain.addEventListener('change', refilter);
inputs.mode.addEventListener('change', refilter);
$('#clear').addEventListener('click', clearFilters);
$('#filters').addEventListener('submit', (e) => e.preventDefault());
$('#prev').addEventListener('click', () => changePage(-1));
$('#next').addEventListener('click', () => changePage(1));

/* ---------------- Details dialog and application form ---------------- */

const dlg = $('#dlg');
const form = $('#apply');
const msg = $('#form-msg');

function setError(field, text) {
  const input = $('#' + field);
  $('#' + field + '-err').textContent = text ? 'Error: ' + text : '';
  if (text) input.setAttribute('aria-invalid', 'true');
  else input.removeAttribute('aria-invalid');
}

function setMessage(kind, text) {
  msg.className = kind ? 'msg ' + kind : 'msg';
  msg.textContent = text;
}

function resetForm() {
  form.reset();
  setMessage('', '');
  FIELDS.forEach((f) => setError(f, ''));
}

function openDialog(i, btn) {
  current = i;
  opener = btn;
  $('#dlg-title').textContent = i.title;
  const dl = $('#dlg-details');
  dl.replaceChildren();
  [['Domain', i.domain], ['Work mode', i.mode], ['Location', i.location],
   ['Openings', String(i.openings)], ['Skills', i.skills.join(', ')], ['Reference', i.id]]
    .forEach(([k, v]) => dl.append(el('dt', k), el('dd', v)));
  resetForm();
  form.hidden = !i.applications_open;
  $('#closed-note').hidden = i.applications_open;
  dlg.showModal();
}

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  const values = { name: $('#name').value, email: $('#email').value, url: $('#url').value };

  // 1. Client-side check: instant feedback, no request sent when something is clearly wrong.
  const problems = window.Rules.validateApplicationForm(values);
  FIELDS.forEach((f) => setError(f, problems[f] || ''));
  const firstBad = FIELDS.find((f) => problems[f]);
  if (firstBad) {
    setMessage('bad', 'Error: fix the fields marked with errors.');
    $('#' + firstBad).focus();
    return;
  }

  // 2. Send to the server, which validates again and is the real gatekeeper.
  const submit = form.querySelector('button[type="submit"]');
  submit.disabled = true;
  setMessage('', 'Sending your application…');
  const payload = { name: values.name.trim(), email: values.email.trim() };
  if (values.url.trim()) payload.portfolio_url = values.url.trim();

  const res = await request('/api/internships/' + encodeURIComponent(current.id) + '/applications', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  submit.disabled = false;

  if (res.ok) {
    form.reset();
    FIELDS.forEach((f) => setError(f, ''));
    setMessage('ok', 'Application for ' + current.title + ' received. Your reference number is APP-' + res.body.data.id + '. Thank you!');
    msg.focus();
    return;
  }

  // Server said no (or could not be reached): show why, keep what the user typed, allow another try.
  const details = (res.body && res.body.error && res.body.error.details) || [];
  FIELDS.forEach((f) => setError(f, ''));
  details.forEach((d) => {
    const field = d.field === 'portfolio_url' ? 'url' : d.field;
    if (FIELDS.includes(field)) setError(field, d.message);
  });
  const retryHint = res.status === 0 || res.status >= 500 ? ' Your answers are still here. Press Submit to try again.' : '';
  setMessage('bad', 'Error: ' + describeFailure(res) + retryHint);
  const bad = FIELDS.find((f) => $('#' + f).hasAttribute('aria-invalid'));
  if (bad) $('#' + bad).focus(); else msg.focus();
});

$('#dlg-close').addEventListener('click', () => dlg.close());
dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
dlg.addEventListener('close', () => { if (opener) opener.focus(); });

start();
