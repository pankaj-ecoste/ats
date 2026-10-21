/* The public careers page. Reads the open roles from the database's public view and sends an application through its one door
   (the submit_application function). Plain scripts, no libraries; everything shown is put on the page as text, never as markup. */
(function () {
  "use strict";
  const CFG = globalThis.__APP_CONFIG_OVERRIDE || APP_CONFIG;
  const MAX_BYTES = 5 * 1024 * 1024;
  const FILE_TYPES = { pdf: 'application/pdf', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', txt: 'text/plain', md: 'text/markdown' };
  const EDUCATION = ['12th', 'Diploma', 'Graduate', 'B.A.', 'B.Com', 'B.Sc', 'BBA', 'BCA', 'B.Tech', 'B.E.', 'MBA', 'M.Sc', 'MCA', 'M.Tech', 'MA HR', 'Other'];
  const NOTICE = [['Immediate', 0], ['15 days', 15], ['30 days', 30], ['45 days', 45], ['60 days', 60], ['90 days', 90]];
  const main = document.getElementById('main');
  document.getElementById('logo').src = 'assets/img/logo.jpg';
  let jobs = [], company = '', filter = { q: '', dept: '', loc: '' };

  const headers = (extra) => ({ apikey: CFG.anonKey, Authorization: 'Bearer ' + CFG.anonKey, ...extra });
  const el = (tag, attrs, ...kids) => {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => { if (k === 'class') n.className = v; else if (k.startsWith('on')) n.addEventListener(k.slice(2), v); else if (v !== false && v != null) n.setAttribute(k, v === true ? '' : v); });
    kids.flat().forEach((c) => { if (c != null && c !== false) n.append(c.nodeType ? c : document.createTextNode(String(c))); });
    return n;
  };
  const show = (...nodes) => { main.replaceChildren(...nodes.flat()); window.scrollTo(0, 0); };
  const safeName = (n) => String(n || 'file').normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\w.\- ]+/g, '').trim().replace(/\s+/g, '_').slice(-80) || 'file';

  async function loadJobs() {
    const r = await fetch(`${CFG.supabaseUrl}/rest/v1/careers_openings?select=*&order=opened_on.desc`, { headers: headers() });
    if (!r.ok) throw new Error('The open roles could not be loaded.');
    jobs = await r.json();
    company = (jobs[0] && jobs[0].company) || '';
    document.title = company ? `Careers at ${company}` : 'Careers';
    document.getElementById('co').textContent = company || 'Careers';
  }

  /* ---------- the list ---------- */
  function list() {
    const uniq = (k) => [...new Set(jobs.map((j) => j[k]).filter(Boolean))].sort();
    const q = filter.q.toLowerCase();
    const shown = jobs.filter((j) => (!q || (j.title + ' ' + j.dept + ' ' + j.location + ' ' + (j.mandatory || []).join(' ')).toLowerCase().includes(q)) && (!filter.dept || j.dept === filter.dept) && (!filter.loc || j.location === filter.loc));
    const sel = (key, label, opts) => el('select', { 'aria-label': label, onchange: (e) => { filter[key] = e.target.value; list(); } }, el('option', { value: '' }, label), opts.map((o) => el('option', { value: o, selected: filter[key] === o }, o)));
    const search = el('input', { type: 'search', placeholder: 'Search roles, skills or cities', 'aria-label': 'Search', value: filter.q, oninput: (e) => { filter.q = e.target.value; const p = e.target.selectionStart; list(); const n = document.querySelector('input[type=search]'); n.focus(); n.setSelectionRange(p, p); } });
    show(el('h1', null, company ? `Open roles at ${company}` : 'Open roles'), el('p', { class: 'muted' }, `${jobs.length} ${jobs.length === 1 ? 'role' : 'roles'} open`),
      jobs.length ? el('div', { class: 'filters' }, search, sel('dept', 'All departments', uniq('dept')), sel('loc', 'All locations', uniq('location'))) : null,
      shown.length ? shown.map(card) : el('div', { class: 'empty' }, jobs.length ? 'No role matches your search.' : 'There are no open roles right now. Please check again soon.'));
  }
  function card(j) {
    return el('article', { class: 'card' }, el('div', { class: 'job' }, el('div', null, el('h2', null, j.title), el('div', { class: 'meta' }, [j.dept, j.location, j.mode, j.type, expText(j)].filter(Boolean).map((t) => el('span', null, t)))),
      el('button', { class: 'pri', onclick: () => detail(j.id) }, 'View and apply')),
      (j.mandatory || []).length ? el('div', { class: 'tags' }, j.mandatory.slice(0, 8).map((s) => el('span', { class: 'tag' }, s))) : null);
  }
  const expText = (j) => (+j.exp_max ? `${+j.exp_min}–${+j.exp_max} years` : +j.exp_min ? `${+j.exp_min}+ years` : '');

  /* ---------- one role ---------- */
  function detail(id) {
    const j = jobs.find((x) => x.id === id);
    if (!j) return list();
    history.replaceState(null, '', '#' + id);
    const part = (h, t) => (t ? [el('h3', null, h), el('p', null, t)] : []);
    show(el('button', { class: 'back', onclick: () => { history.replaceState(null, '', location.pathname); list(); } }, '← All roles'),
      el('article', { class: 'card detail' }, el('h1', null, j.title), el('div', { class: 'meta' }, [j.dept, j.location, j.mode, j.type, expText(j), j.education && j.education !== 'Graduate' ? j.education : ''].filter(Boolean).map((t) => el('span', null, t))),
        part('About the role', j.description), part('What you will do', j.responsibilities), part('What we look for', j.requirements),
        (j.mandatory || []).length ? [el('h3', null, 'Skills'), el('div', { class: 'tags' }, [...j.mandatory, ...(j.preferred || [])].map((s) => el('span', { class: 'tag' }, s)))] : null),
      form(j));
  }

  /* ---------- the application ---------- */
  function form(j) {
    const f = (name, label, attrs, hint) => el('label', null, label, hint ? el('span', { class: 'hint' }, ' ' + hint) : null, el('input', { name, required: true, ...attrs }));
    const msg = el('p', { class: 'err', role: 'alert' });
    const btn = el('button', { class: 'pri', type: 'submit' }, 'Submit application');
    const file = el('input', { type: 'file', name: 'resume', accept: '.pdf,.docx,.txt,.md' });
    const frm = el('form', { class: 'card', novalidate: false },
      el('h2', null, 'Apply for this role'),
      el('div', { class: 'grid' },
        f('name', 'Full name', { autocomplete: 'name', maxlength: 120 }), f('email', 'Email', { type: 'email', autocomplete: 'email', maxlength: 200 }),
        f('phone', 'Mobile number', { type: 'tel', autocomplete: 'tel', inputmode: 'tel', maxlength: 30 }), f('location', 'Current city', { autocomplete: 'address-level2', maxlength: 80 }),
        f('exp', 'Total experience', { type: 'number', min: 0, max: 60, step: '0.1' }, '(years, 0 if fresher)'),
        el('label', null, 'Notice period', el('select', { name: 'notice', required: true }, NOTICE.map(([t, d]) => el('option', { value: d, selected: d === 30 }, t)))),
        f('cur', 'Current salary', { type: 'number', min: 0, max: 1000, step: '0.1' }, '(lakh per year, 0 if not working)'), f('expected', 'Expected salary', { type: 'number', min: 0, max: 1000, step: '0.1' }, '(lakh per year)'),
        el('label', null, 'Highest qualification', el('select', { name: 'edu', required: true }, EDUCATION.map((e) => el('option', { value: e, selected: e === 'Graduate' }, e)))),
        el('label', { class: 'full' }, 'Key skills ', el('span', { class: 'hint' }, '(separated by commas)'), el('textarea', { name: 'skills', required: true, maxlength: 600, placeholder: (j.mandatory || []).slice(0, 4).join(', ') })),
        el('label', { class: 'full' }, 'Resume ', el('span', { class: 'hint' }, '(PDF or Word, up to 5 MB; optional but helps us)'), file)),
      el('div', { class: 'trap', 'aria-hidden': 'true' }, el('label', null, 'Website', el('input', { name: 'website', tabindex: '-1', autocomplete: 'off' }))),
      el('label', { class: 'check', style: 'margin-top:12px' }, el('input', { type: 'checkbox', name: 'consent', required: true }), `I agree that ${company || 'the company'} stores and uses my details and resume to consider my application and contact me about it.`),
      msg, el('div', { style: 'margin-top:12px' }, btn));
    frm.addEventListener('submit', async (e) => {
      e.preventDefault();
      msg.textContent = '';
      const d = new FormData(frm), pick = file.files[0];
      if (pick) {
        const ext = pick.name.toLowerCase().split('.').pop();
        if (!FILE_TYPES[ext]) { msg.textContent = 'Please attach a PDF, Word (.docx) or text file.'; return; }
        if (pick.size > MAX_BYTES) { msg.textContent = 'The resume is larger than 5 MB.'; return; }
      }
      btn.disabled = true; btn.textContent = 'Sending…';
      try {
        let path = null;
        if (pick) {
          path = `intake/${crypto.randomUUID()}/${safeName(pick.name)}`;
          const up = await fetch(`${CFG.supabaseUrl}/storage/v1/object/resumes/${path.split('/').map(encodeURIComponent).join('/')}`, { method: 'POST', headers: headers({ 'Content-Type': FILE_TYPES[pick.name.toLowerCase().split('.').pop()], 'x-upsert': 'false' }), body: pick });
          if (!up.ok) throw new Error('The resume could not be uploaded. Please try again, or apply without it.');
        }
        const skills = String(d.get('skills')).split(',').map((s) => s.trim()).filter(Boolean);
        const r = await fetch(`${CFG.supabaseUrl}/rest/v1/rpc/submit_application`, { method: 'POST', headers: headers({ 'Content-Type': 'application/json' }), body: JSON.stringify({
          p_opening: j.id, p_name: d.get('name'), p_email: d.get('email'), p_phone: d.get('phone'), p_location: d.get('location'), p_experience: +d.get('exp'), p_notice: +d.get('notice'),
          p_current_lpa: +d.get('cur'), p_expected_lpa: +d.get('expected'), p_skills: skills, p_education: d.get('edu'), p_resume_path: path, p_resume_name: pick ? pick.name : null,
          p_consent: d.get('consent') === 'on', p_website: d.get('website') || '' }) });
        if (!r.ok) throw new Error('Your application could not be sent. Please try again in a moment.');
        const out = await r.json();
        if (!out.ok) { msg.textContent = out.message; btn.disabled = false; btn.textContent = 'Submit application'; return; }
        show(el('article', { class: 'card' }, el('h1', { class: 'ok' }, out.message), el('p', null, `We will contact you at ${d.get('email')} if your profile fits.`), el('button', { onclick: () => { history.replaceState(null, '', location.pathname); list(); } }, 'See other roles')));
      } catch (err) {
        msg.textContent = /fetch|network/i.test(err.message) ? 'Cannot reach the server. Check your internet connection and try again.' : err.message;
        btn.disabled = false; btn.textContent = 'Submit application';
      }
    });
    return frm;
  }

  // a link to one role opened while the page is already showing
  window.addEventListener('hashchange', () => { if (!jobs.length) return; const id = decodeURIComponent(location.hash.slice(1)); jobs.some((x) => x.id === id) ? detail(id) : list(); });
  loadJobs().then(() => { const id = decodeURIComponent(location.hash.slice(1)); jobs.some((x) => x.id === id) ? detail(id) : list(); },
    (e) => show(el('div', { class: 'empty' }, e.message + ' Please try again later.')));
})();
