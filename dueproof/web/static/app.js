/* Dueproof — frontend. No framework, no build step; fetch + the DOM. */

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
// Every call carries X-Dueproof: the server refuses changes without it, which
// is what stops another site from making them on a signed-in user's behalf.
// `json` sends a JSON body. A 401 means the session ended: back to sign-in.
async function request(p, o = {}) {
  const headers = { 'X-Dueproof': '1', ...(o.json ? { 'Content-Type': 'application/json' } : {}) };
  const r = await fetch(p, { ...o, headers, body: o.json ? JSON.stringify(o.json) : o.body });
  if (r.status === 401 && !p.startsWith('/api/login')) { showSignIn(); throw new Error('Not signed in'); }
  if (!r.ok) {
    let detail = r.statusText;
    try { detail = (await r.json()).detail || detail; } catch { /* not JSON */ }
    throw new Error(`${r.status} ${typeof detail === 'string' ? detail : r.statusText}`);
  }
  return r;
}
const api = (p, o) => request(p, o).then(r => r.json());
// A list endpoint: the rows, plus the size of the whole list from X-Total-Count.
const apiPage = p => request(p).then(async r =>
  ({ rows: await r.json(), total: +r.headers.get('X-Total-Count') }));
const el = (cls, html) => Object.assign(document.createElement('div'),
  { className: cls, innerHTML: html });

const PAGE = 100;      // queue rows per request
const state = { docs: [], total: 0, doc: null, lang: 'en', role: '', channel: '', src: null,
                langNames: {}, roles: [], users: [], me: null, lineStatus: 'open',
                today: null, polls: new Map(), started: false };
const STATUSES = { open: 'Open', done: 'Done', dismissed: 'Not a duty' };

// Text in a non-Latin script gets the local-script face. The character ranges
// of the enabled languages come from the server; null means English only.
let localScript = null;
const mlClass = s => localScript?.test(s || '') ? ' is-local' : '';
const esc = s => (s ?? '').replace(/[&<>"]/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const fmtDate = iso => new Date(iso + 'T00:00:00')
  .toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
// "Today" is the server's date in Asia/Kolkata, not this browser's clock: a
// deadline must turn overdue at the same moment for everyone.
const daysFrom = iso => Math.round((Date.parse(iso) - Date.parse(state.today)) / 864e5);
const relative = iso => {
  const n = daysFrom(iso);
  return n < 0 ? `${-n} days overdue` : n === 0 ? 'due today' : n === 1 ? 'due tomorrow' : `in ${n} days`;
};
function toast(msg, isErr) {
  const t = el('toast' + (isErr ? ' err' : ''), esc(msg));
  document.body.append(t);
  setTimeout(() => t.remove(), 3600);
}

/* ── honest language labelling ───────────────────────────────────────────
   A finding is stored in the language it was written in. If the selected
   language isn't available we show the other one and tag it with its language;
   machine translation is tagged `translated`, never passed off as the
   document's own wording — the verbatim source is one click away. */
const TAGS = {
  en: ['English', 'Written in English; not available in the selected language'],
  translated: ['translated', 'Machine translation — open the source pill for the '
    + 'document’s own wording on the page'],
};
function pick(f) {
  const want = state.lang === 'en' ? f.text_en : f.text_local;
  // The only text that is ever a translation is English shown for a finding
  // that was written in the local language.
  if (want) return { text: want, tag: f.translated && state.lang === 'en' ? 'translated' : null };
  const other = f.text_en || f.text_local || '';
  return { text: other, tag: !other ? null : other === f.text_local ? 'local' : 'en' };
}
const termTag = (f, tag) => tag === 'translated' && f.term_flags?.length
  ? `<span class="lang-tag is-warn" title="The translation may have lost: ${
      esc(f.term_flags.join(', '))}. Read the original on the page.">check terminology</span>` : '';
const langName = code => code === 'en' ? 'English' : state.langNames[code] || code;
const langTag = (t, f) => t === 'local'
  ? `<span class="lang-tag is-local" title="Written in ${esc(langName(f.orig_lang))}; no English available">${
      esc(langName(f.orig_lang))}</span>`
  : t ? `<span class="lang-tag is-${t}" title="${TAGS[t][1]}">${TAGS[t][0]}</span>` : '';
const roleChips = roles => roles
  .map(r => `<span class="role${r === state.role ? ' is-you' : ''}">${esc(r)}</span>`).join('');

/* ── sign-in ──────────────────────────────────────────────────────────── */
function showSignIn(meta) {
  $('#signin').hidden = false;
  $('#topbar').hidden = $('#shell').hidden = true;
  if (meta) {
    $('#signin-org').textContent = meta.org || '';
    $('#signin-setup').hidden = !meta.needs_setup;
  }
  $('#signin-email').focus();
}

function wireSignIn() {
  $('#signin-form').onsubmit = async e => {
    e.preventDefault();
    $('#signin-error').textContent = '';
    try {
      await api('/api/login', { method: 'POST', json: {
        email: $('#signin-email').value.trim(), password: $('#signin-password').value } });
      $('#signin-password').value = '';
      $('#signin').hidden = true;
      $('#topbar').hidden = $('#shell').hidden = false;
      start();
    } catch (err) {
      $('#signin-error').textContent = err.message.replace(/^\d+ /, '');
    }
  };
  $('#signout').onclick = async () => {
    try { await api('/api/logout', { method: 'POST' }); } catch { /* already gone */ }
    location.reload();
  };
}

/* ── boot ─────────────────────────────────────────────────────────────── */
async function boot() {
  const meta = await api('/api/meta');
  wireSignIn();
  if (meta.auth !== 'none') {
    state.me = await api('/api/me');
    if (!state.me.signed_in) return showSignIn(meta);
  }
  state.meta = meta;
  start();
}

async function start() {
  if (state.started) return location.reload();          // a fresh sign-in: start clean
  state.started = true;
  const meta = state.meta || (state.meta = await api('/api/meta'));
  if (!state.me?.signed_in && meta.auth !== 'none') state.me = await api('/api/me');
  if (state.me?.email) {
    $('#me').hidden = false;
    $('#me-name').textContent = state.me.name || state.me.email;
    $('#signout').hidden = meta.auth !== 'local';
  }
  $('#engine').title += ` Dueproof ${meta.version}, profile ${meta.profile}.`;
  state.roles = meta.roles;
  try { state.users = await api('/api/users'); } catch { state.users = []; }
  state.today = meta.today;
  document.title = meta.org ? `${meta.product} — ${meta.org}` : meta.product;
  $('#brand-org').textContent = meta.org;
  state.langNames = Object.fromEntries(meta.locals.map(l => [l.code, l.name]));
  if (meta.locals.length) {
    localScript = new RegExp(`[${meta.locals.map(l => l.script).join('')}]`);
    const one = meta.locals.length === 1 && meta.locals[0];
    $('#lang-local').textContent = one ? one.name : 'Original';
    if (one) $('#lang-local').classList.add('is-local');
    $('#lang-toggle').hidden = false;
    $('#dz-hint').textContent = one ? `PDF or photo · ${one.name} or English`
      : `PDF or photo · English and ${meta.locals.length} more languages`;
  }
  const sel = $('#role-select');
  meta.roles.forEach(r => sel.add(new Option(r, r)));
  // Start where the person works: their desk, if their account names one.
  if (state.me?.desk && meta.roles.includes(state.me.desk)) sel.value = state.role = state.me.desk;
  sel.onchange = () => {
    state.role = sel.value;
    refreshList(); renderCard(); renderLine(); exportLinks(); dueBadge();
  };
  exportLinks();
  $('#search').onsubmit = e => { e.preventDefault(); runSearch($('#search-input').value.trim()); };
  $('#queue-more').onclick = () => loadDocs(state.docs.length);

  ['All sources', ...meta.channels].forEach((label, i) => {
    const b = Object.assign(document.createElement('button'),
      { className: 'chan' + (i ? '' : ' is-active'), textContent: label });
    b.onclick = () => {
      state.channel = i ? label : '';
      $$('.chan').forEach(c => c.classList.toggle('is-active', c === b));
      refreshList();
    };
    $('#channel-filter').append(b);
  });

  $$('.view-tab').forEach(b => b.onclick = () => setView(b.dataset.view));
  $$('#status-filter button').forEach(b => b.onclick = () => {
    state.lineStatus = b.dataset.status;
    $$('#status-filter button').forEach(x => x.classList.toggle('is-active', x === b));
    renderLine();
  });
  $$('.lang-toggle button').forEach(b => b.onclick = () => {
    state.lang = b.dataset.lang;
    $$('.lang-toggle button').forEach(x => x.classList.toggle('is-active', x === b));
    renderCard();
  });
  wireUpload();

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') $$('.zoomback').forEach(z => z.remove());
  });

  clearProof();
  dueBadge();
  await refreshList();
  if (state.docs.length) openDoc((state.docs.find(d => d.status === 'done') || state.docs[0]).id);
}

function setView(v) {
  $$('.view-tab').forEach(b => b.classList.toggle('is-active', b.dataset.view === v));
  ['documents', 'deadlines', 'search'].forEach(n => $('#view-' + n).hidden = v !== n);
  if (v === 'deadlines') renderLine();
}

// How many open obligations fall due in the next seven days, on this desk.
async function dueBadge() {
  const qs = new URLSearchParams({ days: 7, limit: 1, ...(state.role ? { role: state.role } : {}) });
  try {
    const { total } = await apiPage('/api/deadlines?' + qs);
    $('#due-badge').hidden = !total;
    $('#due-badge').textContent = total;
    $('#due-badge').title = `${total} open obligation${total === 1 ? '' : 's'} due within a week, or overdue`;
  } catch { /* the badge is a convenience */ }
}

function exportLinks() {
  const params = { ...(state.role ? { role: state.role } : {}),
                   ...(state.lineStatus !== 'open' ? { status: state.lineStatus } : {}) };
  const qs = Object.keys(params).length ? '?' + new URLSearchParams(params) : '';
  $('#export-pdf').href = '/api/export/deadlines.html' + qs;
  $('#export-csv').href = '/api/export/deadlines.csv' + qs;
}

/* ── queue ────────────────────────────────────────────────────────────── */
const refreshList = () => loadDocs(0);

// Reload from the top, keeping as many rows as are already showing — or fetch
// the next page when `offset` is where the list currently ends.
async function loadDocs(offset) {
  const qs = new URLSearchParams({ offset, limit: offset ? PAGE : Math.max(PAGE, state.docs.length) });
  if (state.role) qs.set('role', state.role);
  if (state.channel) qs.set('channel', state.channel);
  const { rows, total } = await apiPage('/api/documents?' + qs);
  state.docs = offset ? [...state.docs, ...rows] : rows;
  state.total = total;
  renderList();
}

function renderList() {
  const n = state.docs.length, more = state.total > n;
  $('#queue-count').textContent = more ? `${n} of ${state.total}` : `${n} doc${n === 1 ? '' : 's'}`;
  $('#queue-more').hidden = !more;
  if (!state.docs.length) {
    $('#doclist').innerHTML = `<li class="empty"><p>Nothing matches this filter.</p></li>`;
    return;
  }
  $('#doclist').replaceChildren(...state.docs.map(d => {
    const li = document.createElement('li');
    li.className = 'doc' + (state.doc?.id === d.id ? ' is-active' : '');
    li.tabIndex = 0;
    li.innerHTML = `
      <div class="doc-top"><span class="doc-chan">${esc(d.source_channel)}</span>
        ${d.doc_type ? `<span class="doc-type">${esc(d.doc_type)}</span>` : ''}</div>
      <div class="doc-title${mlClass(d.title)}">${esc(d.title)}</div>
      ${d.status === 'processing' ? `<div class="doc-progress">
          <div class="doc-stage">${esc(d.stage)}</div>
          <div class="bar"><i data-percent="${Number(d.percent) || 0}"></i></div></div>`
      : d.status === 'error' ? `<div class="doc-stage is-err">Failed</div>`
      : `<div class="doc-meta"><span>${d.page_count} pp</span>
          <span>${d.text_source === 'ocr'
            ? `OCR ${Math.round((d.ocr_confidence || 0) * 100)}%` : 'native text'}</span>
          ${d.deadline_count ? `<span class="due">${d.deadline_count} due</span>` : ''}</div>`}`;
    const bar = li.querySelector('.bar i');
    if (bar) bar.style.width = bar.dataset.percent + '%';     // CSSOM: allowed under the CSP
    li.onclick = () => openDoc(d.id);
    li.onkeydown = e => { if (e.key === 'Enter') openDoc(d.id); };
    return li;
  }));
}

/* ── upload ───────────────────────────────────────────────────────────── */
function wireUpload() {
  const dz = $('#dropzone'), input = $('#file-input');
  dz.onclick = () => input.click();
  dz.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); input.click(); } };
  input.onchange = () => { if (input.files[0]) upload(input.files[0]); input.value = ''; };
  ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => {
    e.preventDefault();
    dz.classList.toggle('is-over', ev === 'dragenter' || ev === 'dragover');
  }));
  dz.addEventListener('drop', e => { if (e.dataTransfer.files[0]) upload(e.dataTransfer.files[0]); });
}

async function upload(file) {
  if (!/\.(pdf|jpe?g|png|tiff?)$/i.test(file.name)) return toast('Dueproof reads PDFs and photos (JPEG, PNG, TIFF).', true);
  const fd = new FormData();
  fd.append('file', file);
    try {
    const { doc_id, duplicate } = await api('/api/upload', { method: 'POST', body: fd });
    if (duplicate) toast('Already in the corpus — opening the copy on file.');
    await refreshList();
    openDoc(doc_id);
  } catch (e) { toast(`Upload failed — ${e.message}`, true); }
}

// Poll while a document processes, so the queue shows live stage and percent.
function poll(id) {
  if (state.polls.has(id)) return;
  const t = setInterval(async () => {
    let s;
    try { s = await api(`/api/status/${id}`); }
    catch { clearInterval(t); state.polls.delete(id); return; }
    const doc = state.docs.find(d => d.id === id);
    if (doc) { Object.assign(doc, s); renderList(); }
    if (!s.done) return;
    clearInterval(t);
    state.polls.delete(id);
    await refreshList();
    if (s.status === 'error') toast(`Processing failed — ${s.error || 'unknown'}`, true);
    else if (!state.doc || state.doc.id === id) openDoc(id);
  }, 500);
  state.polls.set(id, t);
}

/* ── the intelligence card ────────────────────────────────────────────── */
async function openDoc(id) {
  try { state.doc = await api(`/api/document/${id}`); }
  catch (e) { return toast(`Could not open document — ${e.message}`, true); }
  setView('documents');
  renderList();
  renderCard();
  clearProof();
  if (state.doc.status === 'processing') poll(id);
}

function renderCard() {
  const d = state.doc;
  if (!d) return;
  $('#doc-empty').hidden = true;
  $('#card').hidden = false;
  $('#card-ref').textContent = [d.source_channel, d.sender, d.doc_date && fmtDate(d.doc_date)]
    .filter(Boolean).join('  ·  ');
  $('#card-title').textContent = d.title;
  $('#card-title').className = mlClass(d.title).trim();

  $('#card-chips').innerHTML = [
    d.doc_type && `<span class="chip accent">${esc(d.doc_type)}</span>`,
    `<span class="chip">${(d.languages || []).map(langName).map(esc).join(' + ')}</span>`,
    `<span class="chip">${d.page_count} pages</span>`,
    d.text_source === 'ocr'
      ? `<span class="chip warn">OCR ${Math.round((d.ocr_confidence || 0) * 100)}% confidence</span>`
      : `<span class="chip">Native text layer</span>`,
    d.obligations.length && `<span class="chip">${d.obligations.length} obligations</span>`,
  ].filter(Boolean).join('');

  renderFacts(d);

  const dupe = $('#card-dupe'), x = d.duplicates[0];
  dupe.hidden = !x;
  if (x) {
    dupe.innerHTML = `Same document already arrived via <b>${esc(x.source_channel)}</b>
      — ${Math.round(x.score)}% text match. <button class="linklike">Open that copy</button>`;
    dupe.querySelector('button').onclick = () => openDoc(x.id);
  }

  $('#bullets').replaceChildren(...d.bullets.map(b => {
    const { text, tag } = pick(b);
    const li = document.createElement('li');
    li.className = 'bullet';
    li.innerHTML = `<span class="bullet-dot"></span><div class="bullet-body">
      <div class="bullet-text${mlClass(text)}">${esc(text)}${langTag(tag, b)}${termTag(b, tag)}</div></div>`;
    li.querySelector('.bullet-body').append(srcPill(b));
    return li;
  }));

  $('#oblig-note').textContent = state.role ? `filtered to ${state.role}` : '';
  $('#obligations').replaceChildren(...d.obligations.map(obligationBox));
}

const money = n => '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

// What a notice desk files a document under, and when it arrived — the date
// "within N days of receipt" counts from, so it can be corrected here.
function renderFacts(d) {
  const facts = [
    d.reference && ['Reference', esc(d.reference)],
    d.authority && ['Issued by', esc(d.authority)],
    d.amount && ['Amount demanded', `${money(d.amount)}${d.amount_text ? ` <span class="faint">(“${esc(d.amount_text)}”)</span>` : ''}`],
    d.sections?.length && ['Provisions', d.sections.map(esc).join(', ')],
    ['Received', `<span id="received-show">${d.received_on ? fmtDate(d.received_on) : '—'}</span>
      <button class="linklike" id="received-edit">change</button>`],
  ].filter(Boolean);
  $('#card-facts').innerHTML = facts.map(([k, v]) => `<div><dt>${k}</dt><dd>${v}</dd></div>`).join('');
  $('#received-edit').onclick = () => {
    const input = Object.assign(document.createElement('input'),
      { type: 'date', value: d.received_on || '', max: state.today, className: 'inline-date' });
    $('#received-show').replaceWith(input);
    $('#received-edit').hidden = true;
    input.focus();
    input.onchange = async () => {
      try {
        await api(`/api/documents/${d.id}`, { method: 'PATCH', json: { received_on: input.value } });
        toast('Received date changed — deadlines that run from receipt have moved.');
        openDoc(d.id);
      } catch (e) { toast(`Could not change it — ${e.message}`, true); }
    };
  };
}

// One obligation: what it says, when, whose, and the controls to work it.
function obligationBox(o) {
  const { text, tag } = pick(o);
  // An obligation routed to another desk dims rather than disappearing —
  // knowing it exists is not the same as owning it.
  const mine = !state.role || o.roles.includes(state.role);
  const corrected = o.due_date && o.found_due_date && o.due_date !== o.found_due_date;
  const box = el(`oblig${mine ? '' : ' is-dimmed'} is-${o.status}`, `
    <div class="oblig-top">
      <span class="oblig-due${o.due_date ? '' : ' none'}">${o.due_date
        ? fmtDate(o.due_date) : 'No date stated'}</span>
      ${o.due_date && o.status === 'open' ? `<span class="oblig-when${daysFrom(o.due_date) < 0 ? ' overdue' : ''}"
        >${relative(o.due_date)}</span>` : ''}
      ${o.tag === 'hearing' ? '<span class="chip accent">hearing</span>' : ''}
      ${o.due_basis?.startsWith('receipt:') ? `<span class="chip" title="Counted from the received date">${
        o.due_basis.split(':')[1]} days from receipt</span>` : ''}
      ${corrected ? `<span class="chip" title="The document says ${fmtDate(o.found_due_date)}">corrected</span>` : ''}
      ${o.section ? `<span class="chip">${esc(o.section)}</span>` : ''}
      <span class="chip oblig-sev${o.severity === 'high' ? ' warn' : ''}">${esc(o.severity)}</span>
    </div>
    <div class="oblig-duty${mlClass(text)}">${esc(text)}${langTag(tag, o)}${termTag(o, tag)}</div>
    <div class="oblig-foot">${roleChips(o.roles)}</div>
    <div class="work">
      <label>State <select data-field="status">${Object.entries(STATUSES).map(([v, l]) =>
        `<option value="${v}"${v === o.status ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
      <label>Owner <select data-field="assignee"><option value="">Unassigned</option>${
        [...new Set([...state.users.map(u => u.email), o.assignee].filter(Boolean))].map(e =>
          `<option value="${esc(e)}"${e === o.assignee ? ' selected' : ''}>${esc(
            state.users.find(u => u.email === e)?.name || e)}</option>`).join('')}</select></label>
      <label>Due <input type="date" data-field="due_date" value="${o.due_date || ''}"></label>
      <label>Desk <select data-field="roles"><option value="">${esc(o.roles.join(', '))}</option>${
        state.roles.filter(r => !(o.roles.length === 1 && o.roles[0] === r)).map(r =>
          `<option value="${esc(r)}">${esc(r)}</option>`).join('')}</select></label>
      <button class="linklike" data-history>History</button>
    </div>
    ${o.note ? `<p class="note">${esc(o.note)}</p>` : ''}
    <button class="linklike add-note">${o.note ? 'Edit note' : 'Add note'}</button>`);
  box.querySelector('.oblig-foot').append(srcPill(o));
  $$('[data-field]', box).forEach(input => input.onchange = () => {
    const v = input.value;
    const body = input.dataset.field === 'roles' ? { roles: v ? [v] : null }
      : input.dataset.field === 'due_date' ? { due_date: v || null }
      : { [input.dataset.field]: v };
    saveFinding(o, body);
  });
  box.querySelector('.add-note').onclick = e => {
    const form = el('note-form', `<textarea maxlength="2000" rows="3"
      placeholder="Who is handling it, what was filed, what is pending"></textarea>
      <button class="linklike">Save note</button>`);
    const area = form.querySelector('textarea');
    area.value = o.note || '';
    form.querySelector('button').onclick = () => saveFinding(o, { note: area.value });
    e.target.replaceWith(form);
    area.focus();
  };
  box.querySelector('[data-history]').onclick = async e => {
    const h = await api(`/api/findings/${o.id}/history`);
    const list = el('history', h.length ? h.map(x => `<div><b>${esc(x.field.replace('_override', ''))}</b>
      ${esc(x.old ?? '—')} → ${esc(x.new ?? '—')} <span class="faint">${esc(x.actor || '')} · ${
      esc(x.at.slice(0, 16).replace('T', ' '))}</span></div>`).join('') : '<div class="faint">No changes yet.</div>');
    e.target.replaceWith(list);
  };
  return box;
}

async function saveFinding(o, body) {
  try {
    const updated = await api(`/api/findings/${o.id}`, { method: 'PATCH', json: body });
    Object.assign(o, updated);
    renderCard();
    dueBadge();
    refreshList();
  } catch (e) { toast(`Could not save — ${e.message}`, true); }
}

/* The source pill — the affordance the whole thing turns on. */
function srcPill(f) {
  const b = document.createElement('button');
  b.className = 'src';
  b.dataset.confidence = f.confidence;
  b.dataset.id = f.id;
  b.innerHTML = `<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h10M4 18h13"
    stroke-linecap="round"/></svg>` + (f.confidence === 'none' ? 'not located'
      : f.confidence === 'approximate' ? `page ${f.page} · approximate` : `page ${f.page}`);
  b.title = f.confidence === 'none' ? 'The supporting passage could not be located'
    : `Match confidence ${Math.round(f.match_score)}%`;
  b.onclick = () => showProof(f);
  return b;
}

/* ── the proof panel ──────────────────────────────────────────────────── */
function clearProof() {
  state.src = null;
  $('#proof-page').textContent = '';
  $('#proof-body').innerHTML = `<div class="empty">
    <span class="eyebrow">Nothing selected</span>
    <p>Click a <span class="pill-demo">source</span> pill on any finding.
       The page opens here with the passage outlined.</p></div>`;
}

function showProof(f) {
  state.src = f;
  $$('.src').forEach(s => s.classList.toggle('is-active', s.dataset.id === f.id));
  const d = state.doc;
  $('#proof-page').textContent = `Page ${f.page} of ${d.page_count}`;
  // Opening the proof is the act worth a line in the audit trail; a search hit
  // (no finding id) is already recorded as the search itself.
  if (f.id) request(`/api/audit/proof/${encodeURIComponent(f.id)}`, { method: 'POST' }).catch(() => {});
  const places = `${f.rects.length} ${f.id ? 'line' : 'place'}${f.rects.length === 1 ? '' : 's'}`;
  const cap = el('proof-caption', `
    <div class="proof-quote${mlClass(f.evidence_quote)}">${esc(f.evidence_quote)}</div>
    <div class="proof-conf"><span>${f.id ? f.confidence + ' match' : 'search match'}</span>
      ${f.id ? `<span>${Math.round(f.match_score)}%</span>` : ''}<span>${places}</span></div>`);
  $('#proof-body').replaceChildren(pageView(d.id, f.page, f.rects), cap, pageNav(d, f));
  $('#proof-body').scrollTop = 0;
}

/* Image + overlay. Rects arrive normalised 0-1 and are positioned in percent,
   so they track the image at any rendered size — including whatever a
   projector does to the layout. */
function pageView(docId, page, rects, zoomed) {
  const wrap = el('pagewrap', '');
  const img = new Image();
  img.src = `/api/page/${docId}/${page}.jpg`;
  img.alt = `Page ${page}`;
  // Zoom opens a copy inside a backdrop rather than resizing this element: the
  // highlights are positioned in percent of .pagewrap, so .pagewrap has to keep
  // a box the image's own height or every box lands in the wrong place.
  if (!zoomed) img.onclick = () => {
    const back = el('zoomback', '');
    back.append(pageView(docId, page, rects, true));
    back.onclick = () => back.remove();
    document.body.append(back);
  };
  wrap.append(img);
  (rects || []).forEach((r, i) => {
    const box = el('hl', '');
    Object.assign(box.style, {
      left: r[0] * 100 + '%', top: r[1] * 100 + '%', width: (r[2] - r[0]) * 100 + '%',
      height: (r[3] - r[1]) * 100 + '%', transitionDelay: i * 55 + 'ms',
    });
    wrap.append(box);
  });
  const reveal = () => requestAnimationFrame(() => {
    $$('.hl', wrap).forEach(b => b.classList.add('show'));
    if (!zoomed && rects?.length) wrap.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });
  img.complete ? reveal() : (img.onload = reveal);
  return wrap;
}

function pageNav(d, f) {
  const nav = el('pagenav', '');
  for (let p = 1; p <= d.page_count; p++) {
    const b = Object.assign(document.createElement('button'),
      { textContent: p, className: p === f.page ? 'is-active' : '' });
    b.onclick = () => {
      // Only the finding's own page carries the highlight.
      $('.pagewrap', $('#proof-body')).replaceWith(pageView(d.id, p, p === f.page ? f.rects : []));
      $('#proof-page').textContent = `Page ${p} of ${d.page_count}`;
      $$('button', nav).forEach(x => x.classList.toggle('is-active', x === b));
    };
    nav.append(b);
  }
  return nav;
}

/* ── compliance line ──────────────────────────────────────────────────── */
async function renderLine() {
  let items;
  exportLinks();
  const qs = new URLSearchParams({ status: state.lineStatus, ...(state.role ? { role: state.role } : {}) });
  try { items = await api('/api/deadlines?' + qs); }
  catch (e) { return toast(`Could not load deadlines — ${e.message}`, true); }
  if (!items.length) {
    $('#metroline').innerHTML = `<p class="lede">Nothing ${state.lineStatus === 'open' ? 'open ' : ''}for this filter.</p>`;
    return;
  }
  let prev = null;
  $('#metroline').replaceChildren(...items.map(it => {
    const { text } = pick(it);
    const gap = prev ? daysFrom(it.due_date) - daysFrom(prev) : null;
    prev = it.due_date;
    const soon = it.days_left >= 0 && it.days_left <= 21;
    const stop = el('stop' + (it.overdue ? ' is-overdue' : soon && it.status === 'open' ? ' is-soon' : '') + (it.status !== 'open' ? ' is-closed' : ''), `
      <div><span class="stop-date">${fmtDate(it.due_date)}</span>
        <span class="stop-gap">${gap === null || it.overdue ? relative(it.due_date) : `+${gap} days`}</span></div>
      <div class="stop-duty${mlClass(text)}">${esc(text)}</div>
      <div class="stop-meta">${roleChips(it.roles)}
        ${it.assignee ? `<span class="stop-doc">owner ${esc(state.users.find(u => u.email === it.assignee)?.name || it.assignee)}</span>` : ''}
        ${it.status !== 'open' ? `<span class="chip">${esc(STATUSES[it.status])}</span>` : ''}
        <span class="stop-doc">${esc(it.source_channel)} · ${esc(it.doc_type || '')}</span>
        <button class="linklike">Open document</button></div>`);
    // Jumping straight to the proof is the point: a deadline is a claim until
    // you can see the sentence it came from.
    stop.querySelector('button').onclick = async () => {
      await openDoc(it.doc_id);
      const pill = $(`.src[data-id="${it.id}"]`);
      if (pill) { pill.click(); pill.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
    };
    return stop;
  }));
}

/* ── search ───────────────────────────────────────────────────────────── */
async function runSearch(q) {
  if (!q) return;
  // The index is trigram-based; ask the server only for what it can answer.
  if (!q.split(/\s+/).some(t => t.length >= 3)) return toast('Search needs at least three characters.', true);
  let res;
  try { res = await api('/api/search?' + new URLSearchParams({ q })); }
  catch (e) {
    return toast(e.message.startsWith('400') ? 'Search needs at least three characters.'
      : `Search failed — ${e.message}`, true);
  }
  setView('search');
  const n = res.hits.length;
  $('#search-title').textContent = `${n || 'No'} page${n === 1 ? '' : 's'} matching “${q}”`;
  // Escape first, then mark: the snippet is document text and must stay text.
  const rx = new RegExp(res.terms.map(t => esc(t).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
  $('#hits').replaceChildren(...res.hits.map(h => {
    const b = Object.assign(document.createElement('button'), { className: 'hit' });
    b.innerHTML = `<div class="hit-top"><span class="doc-chan">${esc(h.source_channel)}</span>
        <span class="hit-title${mlClass(h.title)}">${esc(h.title)}</span>
        <span class="hit-page">${h.finding_id ? 'translated finding · ' : ''}page ${h.page}</span></div>
      <div class="hit-snippet${mlClass(h.snippet)}">${esc(h.snippet).replace(rx, '<mark>$&</mark>')}</div>`;
    b.onclick = async () => {
      await openDoc(h.doc_id);
      const pill = h.finding_id && $(`.src[data-id="${h.finding_id}"]`);
      if (pill) { pill.click(); pill.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
      else showProof({ page: h.page, rects: h.rects, evidence_quote: h.snippet });
    };
    return b;
  }));
}

boot().catch(e => { if (e.message !== 'Not signed in') toast(`Dueproof could not start — ${e.message}`, true); });
