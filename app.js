(() => {
'use strict';

/* ================= helpers ================= */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const today = () => ymd(new Date());
const fmtDate = s => { const [y, m, d] = String(s).split('-').map(Number); return `${d} ${MONTHS[m - 1].slice(0, 3)} ${y}`; };
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));
const enc = encodeURIComponent;

const store = {
  get(k, d) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } }
};
const K = { cfg: 'cpb.cfg', cache: 'cpb.cache', demo: 'cpb.demo', ui: 'cpb.ui' };

let toastTimer;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}
const busy = on => $('#busy').classList.toggle('on', on);

/* ================= data ================= */
let cfg = store.get(K.cfg, { url: '', key: '' });
let ui = store.get(K.ui, { sortAsc: false, lastCat: '' });
let db = { categories: [], entries: [] };
let draft = null;     // form state
let bookSub = '';     // sub-category filter in notebook

const remote = () => !!cfg.url;
const catOf = name => db.categories.find(c => c.name === name);
const colorOf = name => (catOf(name) || {}).color || '#999';

async function api(action, payload = {}) {
  const res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ key: cfg.key, action, ...payload }) });
  if (!res.ok) throw new Error('HTTP ' + res.status);
  const j = await res.json();
  if (!j.ok) throw new Error(j.error || 'error');
  return j;
}

function persist() {
  const ok = store.set(remote() ? K.cache : K.demo, db);
  if (!ok && !remote()) toast('พื้นที่โหมดทดลองเต็มแล้ว — เชื่อม Google Sheets เพื่อเก็บรูปได้ไม่จำกัด');
}

function seedCats() {
  return [
    { name: 'LEARNING', color: '#7FB88A', subs: ['theory', 'knowledge', 'fact', 'vocabulary', 'information', 'food for thought', 'youtube summary'] },
    { name: 'BUSINESS', color: '#E2942E', subs: ['marketing', 'sales tip', 'business ideas', 'content'] },
    { name: 'INSPIRATION', color: '#6C8CC4', subs: ['quotes', 'mood board', 'compliments', 'copied text', 'photography', 'lyrics', 'poetry'] },
    { name: 'PERSONAL', color: '#D8749B', subs: ['thoughts', 'wishlist', 'recipe', 'things to search for later'] }
  ];
}

function seed() {
  const tones = [['#c9b79c', '#8a7a62'], ['#a8b8a0', '#5f7560'], ['#d9c2b0', '#a67c68'], ['#b7c3cf', '#6d8296'], ['#e3d3b4', '#b89b63'], ['#cdb5bf', '#8d6a78']];
  const ph = i => {
    const [a, b] = tones[i % tones.length];
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="600" height="600" fill="url(#g)"/><circle cx="${150 + (i * 97) % 300}" cy="${180 + (i * 53) % 240}" r="90" fill="#fff" opacity=".3"/></svg>`;
    return 'data:image/svg+xml,' + enc(svg);
  };
  const phs = (n, o = 0) => Array.from({ length: n }, (_, i) => ph(i + o));
  const ago = n => { const d = new Date(); d.setDate(d.getDate() - n); return ymd(d); };
  const E = (days, category, subcategory, title, text, source, images) =>
    ({ id: uid(), date: ago(days), category, subcategory, title, text, source, images, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  return {
    categories: seedCats(),
    entries: [
      E(0, 'INSPIRATION', 'quotes', 'On starting small', 'เริ่มจากสิ่งเล็ก ๆ ที่ทำได้ทุกวัน ดีกว่ารอวันที่พร้อมทุกอย่าง\nSmall steps, repeated, become a path.', 'โน้ตตัวอย่าง', []),
      E(1, 'INSPIRATION', 'photography', 'Morning light', 'แสงเช้าช่วง 7 โมงนุ่มที่สุด ถ่ายย้อนแสงแล้วเงาจะยาวสวย ลองลด exposure ลงนิดหน่อยให้สีเข้มขึ้น', '', phs(3)),
      E(2, 'LEARNING', 'youtube summary', 'How memory works', '1. เราจำได้ดีขึ้นเมื่อทบทวนแบบเว้นช่วง (spaced repetition)\n2. การเขียนสรุปด้วยคำของตัวเองช่วยให้เข้าใจลึกกว่าการ highlight\n3. นอนให้พอ = สมองได้จัดระเบียบความจำ', 'YouTube — ตัวอย่าง', phs(2, 3)),
      E(2, 'BUSINESS', 'marketing', 'Hook 3 วินาทีแรก', 'เปิดคลิปด้วยปัญหาที่คนดูเจออยู่จริง ไม่ใช่ชื่อแบรนด์ แล้วค่อยเฉลยทางออกในช่วงกลาง', '', []),
      E(4, 'PERSONAL', 'recipe', 'Matcha latte ที่บ้าน', 'มัทฉะ 2 กรัม + น้ำอุ่น 30 ml ตีให้ขึ้นฟอง\nนมโอ๊ต 150 ml น้ำแข็งเต็มแก้ว\nหวานน้อย: น้ำผึ้ง 1 ช้อนชา', '', phs(4, 1)),
      E(6, 'INSPIRATION', 'mood board', 'Autumn palette', 'โทนสีที่ชอบช่วงนี้ — beige, olive, terracotta', 'Pinterest', phs(6)),
      E(9, 'PERSONAL', 'wishlist', 'Traveler’s notebook passport size', 'อยากได้สีน้ำตาล camel พร้อม kraft paper insert', '', phs(1, 4)),
      E(12, 'LEARNING', 'vocabulary', 'Commonplace (n.)', 'A notebook for collecting ideas, quotes and observations worth keeping.\nสมุดที่ใช้เก็บสิ่งที่ได้อ่าน ได้ฟัง แล้วอยากจำไว้', '', []),
      E(35, 'BUSINESS', 'content', 'Content ideas', 'รวมไอเดียคอนเทนต์เดือนหน้า: เบื้องหลังการทำงาน, รีวิวจากลูกค้า, Q&A', '', phs(5, 2))
    ]
  };
}

async function refresh() {
  busy(true);
  try {
    const r = await api('list');
    db = { categories: r.categories, entries: r.entries };
    persist();
    if (!['new', 'edit'].includes(route().name)) render();
  } catch (err) {
    toast('เชื่อมต่อ Google Sheets ไม่สำเร็จ: ' + err.message);
  } finally { busy(false); }
}

async function saveCategories() {
  persist();
  if (remote()) await api('saveCategories', { categories: db.categories });
}

/* ================= routing ================= */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [path, qs] = h.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  return { name: parts[0] || 'index', arg: parts[1], q: new URLSearchParams(qs || '') };
}
const go = hash => { if (location.hash === hash) render(); else location.hash = hash; };

function render() {
  const r = route();
  closeOverlay();
  const views = { index: viewIndex, book: viewBook, cal: viewCal, new: viewForm, edit: viewForm, settings: viewSettings };
  $('#app').innerHTML = (views[r.name] || viewIndex)(r);
  document.querySelectorAll('#nav a[data-nav]').forEach(a => a.classList.toggle('on', a.dataset.nav === r.name));

  if (r.name === 'book' && r.q.get('e')) {
    const el = document.getElementById('e-' + r.q.get('e'));
    if (el) { el.scrollIntoView({ block: 'start' }); el.classList.add('flash'); return; }
  }
  if (r.name === 'cal') {
    const el = document.getElementById('m-' + today().slice(0, 7));
    if (el) { el.scrollIntoView({ block: 'start' }); return; }
  }
  window.scrollTo(0, 0);
}

/* ================= views ================= */
function banner() {
  return remote() ? '' : `<div class="banner">โหมดทดลอง — ข้อมูลเก็บอยู่ในเครื่องนี้เท่านั้น <a href="#/settings">เชื่อม Google Sheets</a> เพื่อเก็บจริง</div>`;
}

function viewIndex() {
  const counts = {};
  db.entries.forEach(e => counts[e.category] = (counts[e.category] || 0) + 1);
  return `
    <p class="eyebrow">${esc(fmtDate(today()))}</p>
    <h1>Commonplace<br>Book</h1>
    ${banner()}
    <section class="index">
      ${db.categories.map(c => `
        <a class="cat" href="#/book/${enc(c.name)}">
          <span class="dot big" style="background:${esc(c.color)}"></span>
          <div>
            <div class="cat-name">${esc(c.name)}<span class="n">${counts[c.name] || 0} notes</span></div>
            <div class="cat-subs">${esc(c.subs.join(', '))}</div>
          </div>
        </a>`).join('')}
    </section>
    <button class="ghost" data-act="manage">+ เพิ่ม / แก้ไขหมวดหมู่</button>`;
}

function photosHTML(images) {
  if (!images || !images.length) return '';
  const list = images.slice(0, 6);
  return `<div class="photos n${list.length}">${list.map(u =>
    `<button class="ph" data-act="lightbox" data-full="${esc(u)}"><img loading="lazy" src="${esc(u)}" alt=""></button>`).join('')}</div>`;
}

function sourceHTML(s) {
  if (!s) return '';
  return /^https?:\/\//i.test(s)
    ? `<div class="source">— <a href="${esc(s)}" target="_blank" rel="noopener">${esc(s)}</a></div>`
    : `<div class="source">— ${esc(s)}</div>`;
}

function entryHTML(e) {
  return `
    <article class="entry" id="e-${esc(e.id)}">
      <div class="margin">
        <span class="dot" style="background:${esc(colorOf(e.category))}"></span>
        <div class="date">${esc(fmtDate(e.date))}</div>
        <div>${esc(e.subcategory || '')}</div>
        <button class="edit" data-act="edit" data-id="${esc(e.id)}">แก้ไข</button>
      </div>
      <div class="body">
        ${e.title ? `<h2>${esc(e.title)}</h2>` : ''}
        ${e.text ? `<p class="text">${esc(e.text)}</p>` : ''}
        ${sourceHTML(e.source)}
        ${photosHTML(e.images)}
      </div>
    </article>`;
}

function viewBook(r) {
  if (!db.categories.length) return `<div class="empty">ยังไม่มีหมวดหมู่</div>`;
  const cat = catOf(r.arg) || catOf(ui.lastCat) || db.categories[0];
  if (ui.lastCat !== cat.name) { ui.lastCat = cat.name; bookSub = ''; store.set(K.ui, ui); }
  if (r.q.get('e')) bookSub = '';
  const all = db.entries.filter(e => e.category === cat.name);
  const usedSubs = [...new Set([...cat.subs, ...all.map(e => e.subcategory).filter(Boolean)])];
  const list = all.filter(e => !bookSub || e.subcategory === bookSub)
    .sort((a, b) => (a.date + (a.created_at || '')).localeCompare(b.date + (b.created_at || '')) * (ui.sortAsc ? 1 : -1));
  return `
    <div class="tabs">${db.categories.map(c => `
      <a class="tab ${c.name === cat.name ? 'on' : ''}" href="#/book/${enc(c.name)}"><span class="dot sm" style="background:${esc(c.color)}"></span>${esc(c.name)}</a>`).join('')}
    </div>
    <div class="book-head">
      <span class="dot big" style="background:${esc(cat.color)}"></span>
      <h1>${esc(cat.name)}</h1>
      <button class="sort" data-act="sort">${ui.sortAsc ? 'OLDEST ↓' : 'NEWEST ↓'}</button>
    </div>
    <div class="chips">
      <button class="chip ${bookSub ? '' : 'on'}" data-act="sub" data-sub="">all</button>
      ${usedSubs.map(s => `<button class="chip ${bookSub === s ? 'on' : ''}" data-act="sub" data-sub="${esc(s)}">${esc(s)}</button>`).join('')}
    </div>
    ${list.length
      ? `<section class="pages">${list.map(entryHTML).join('')}</section>`
      : `<div class="empty">หน้านี้ยังว่างอยู่<br>กด + เพื่อเริ่มจดเรื่องแรก</div>`}`;
}

function viewCal() {
  const byDate = {};
  db.entries.forEach(e => (byDate[e.date] = byDate[e.date] || []).push(e));
  const dates = Object.keys(byDate).sort();
  const now = today(), nowM = now.slice(0, 7);
  let start = dates.length && dates[0].slice(0, 7) < nowM ? dates[0].slice(0, 7) : nowM;
  let end = dates.length && dates[dates.length - 1].slice(0, 7) > nowM ? dates[dates.length - 1].slice(0, 7) : nowM;
  const months = [];
  let [y, m] = start.split('-').map(Number);
  while (`${y}-${pad(m)}` <= end && months.length < 600) { months.push([y, m]); if (++m > 12) { m = 1; y++; } }

  const monthHTML = ([y, m]) => {
    const key = `${y}-${pad(m)}`;
    const offset = (new Date(y, m - 1, 1).getDay() + 6) % 7;
    const days = new Date(y, m, 0).getDate();
    let count = 0, cells = '';
    for (let i = 0; i < offset; i++) cells += `<div class="cell blank"></div>`;
    for (let d = 1; d <= days; d++) {
      const date = `${key}-${pad(d)}`;
      const es = byDate[date];
      const cls = date === now ? ' today' : '';
      if (!es) { cells += `<div class="cell${cls}"><span class="num">${d}</span></div>`; continue; }
      count += es.length;
      const img = (es.find(e => e.images && e.images.length) || {}).images;
      const cats = [...new Set(es.map(e => e.category))];
      cells += `
        <button class="cell${cls}" data-act="day" data-date="${date}">
          <span class="num">${d}</span>
          <div class="thumb ${img ? '' : 'noimg'}">
            ${img ? `<img loading="lazy" src="${esc(img[0])}" alt="">` : ''}
            <div class="cdots">${cats.map(c => `<span class="dot" style="background:${esc(colorOf(c))}"></span>`).join('')}</div>
          </div>
        </button>`;
    }
    return `
      <section class="month" id="m-${key}">
        <div class="mhead"><b>${pad(m)}.${y}</b><span>${MONTHS[m - 1]}</span><span>${count} notes</span></div>
        <div class="dow"><span>M</span><span>T</span><span>W</span><span>T</span><span>F</span><span>S</span><span>S</span></div>
        <div class="grid">${cells}</div>
      </section>`;
  };
  return `<p class="eyebrow">Monthly overview</p><h1>Calendar</h1>${months.map(monthHTML).join('')}`;
}

function subOptions(catName, selected) {
  const c = catOf(catName);
  const subs = c ? c.subs : [];
  return `<option value="">—</option>` +
    subs.map(s => `<option ${s === selected ? 'selected' : ''}>${esc(s)}</option>`).join('') +
    `<option value="__new">+ เพิ่มหมวดย่อยใหม่…</option>`;
}

function picksHTML() {
  const n = draft.images.length;
  return draft.images.map((im, i) => `
      <div class="pick"><img src="${esc(im.src)}" alt=""><button type="button" data-act="rm-img" data-i="${i}" aria-label="ลบรูป">×</button></div>`).join('') +
    (n < 6 ? `<label class="pick add"><input type="file" id="files" accept="image/*" multiple><span>+ รูป<br>${n}/6</span></label>` : '');
}

function viewForm(r) {
  const e = r.name === 'edit' ? db.entries.find(x => x.id === r.arg) : null;
  if (r.name === 'edit' && !e) return `<div class="empty">ไม่พบโน้ตนี้</div>`;
  if (!db.categories.length) return `<div class="empty">เพิ่มหมวดหมู่ก่อนนะคะ</div>`;
  draft = { id: e ? e.id : null, created_at: e ? e.created_at : null, images: (e ? e.images || [] : []).map(src => ({ src })) };
  const cat = (e && e.category) || (catOf(ui.lastCat) || db.categories[0]).name;
  return `
    <p class="eyebrow">${e ? 'Edit note' : 'New note'}</p>
    <h1>${e ? 'แก้ไขโน้ต' : 'จดบันทึก'}</h1>
    <form class="sheet-form" id="entry-form">
      <label><span class="lbl">วันที่</span><input type="date" name="date" value="${esc(e ? e.date : today())}" required></label>
      <div class="row2">
        <label><span class="lbl">Category</span>
          <select name="category" id="f-cat">${db.categories.map(c => `<option ${c.name === cat ? 'selected' : ''}>${esc(c.name)}</option>`).join('')}</select></label>
        <label><span class="lbl">Sub-category</span>
          <select name="subcategory" id="f-sub">${subOptions(cat, e ? e.subcategory : '')}</select></label>
      </div>
      <label><span class="lbl">หัวข้อ</span><input type="text" name="title" value="${esc(e ? e.title : '')}" placeholder="ตั้งชื่อสั้น ๆ (ไม่ใส่ก็ได้)"></label>
      <label><span class="lbl">ข้อความ</span><textarea name="text" placeholder="จดสิ่งที่ชอบ ได้ฟัง ได้อ่าน…">${esc(e ? e.text : '')}</textarea></label>
      <label><span class="lbl">ที่มา</span><input type="text" name="source" value="${esc(e ? e.source : '')}" placeholder="ชื่อหนังสือ คนพูด หรือวางลิงก์"></label>
      <div class="field"><span class="lbl">รูปภาพ (สูงสุด 6)</span><div class="picks" id="picks">${picksHTML()}</div></div>
      <div class="actions">
        <button class="solid" type="submit" id="save-btn">บันทึก</button>
        ${e ? `<button class="ghost danger" type="button" data-act="delete-entry" data-id="${esc(e.id)}" style="margin:0">ลบโน้ตนี้</button>` : ''}
      </div>
    </form>`;
}

function viewSettings() {
  return `
    <p class="eyebrow">Settings</p>
    <h1>ตั้งค่า</h1>
    <div class="banner">${remote()
      ? 'เชื่อมต่อกับ Google Sheets แล้ว — ข้อมูลทั้งหมดอยู่ในบัญชี Google ของคุณ'
      : 'ยังไม่ได้เชื่อม Google Sheets — ตอนนี้เป็นโหมดทดลอง ข้อมูลอยู่ในเครื่องนี้เท่านั้น'}</div>
    <form class="sheet-form" id="cfg-form">
      <label><span class="lbl">Web app URL (จาก Apps Script)</span><input type="url" name="url" value="${esc(cfg.url)}" placeholder="https://script.google.com/macros/s/…/exec"></label>
      <label><span class="lbl">รหัสลับ (SECRET)</span><input type="password" name="key" value="${esc(cfg.key)}" autocomplete="off"></label>
      <button class="solid" type="submit">${remote() ? 'บันทึกและโหลดข้อมูลใหม่' : 'เชื่อมต่อ'}</button>
      ${remote() ? `<button class="ghost" type="button" data-act="disconnect">ยกเลิกการเชื่อมต่อในเครื่องนี้</button>` : ''}
    </form>
    <h1 style="font-size:20px;margin-top:34px">Export</h1>
    <p class="hint">ดาวน์โหลดข้อมูลทั้งหมด (${db.entries.length} โน้ต) ไปใช้ต่อ — เปิด CSV ได้ใน Excel / Google Sheets</p>
    <button class="ghost" data-act="export-csv">ดาวน์โหลด CSV</button>
    <button class="ghost" data-act="export-json">ดาวน์โหลด JSON</button>
    ${remote() ? '' : `<button class="ghost danger" data-act="reset-demo">ล้างข้อมูลทดลองและเริ่มใหม่</button>`}`;
}

/* ================= overlay ================= */
function openSheet(html) {
  const o = $('#overlay'); o.className = 'show';
  o.innerHTML = `<div class="sheet">${html}</div>`;
}
function closeOverlay() { const o = $('#overlay'); o.className = ''; o.innerHTML = ''; }

function openDay(date) {
  const es = db.entries.filter(e => e.date === date).sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  openSheet(`
    <p class="eyebrow">${es.length} notes</p>
    <h3>${esc(fmtDate(date))}</h3>
    ${es.map(e => `
      <button class="day-item" data-act="open-entry" data-cat="${esc(e.category)}" data-id="${esc(e.id)}">
        ${e.images && e.images.length ? `<span class="pic"><img src="${esc(e.images[0])}" alt=""></span>` : ''}
        <span>
          <span class="meta"><span class="dot sm" style="background:${esc(colorOf(e.category))}"></span>${esc(e.category)}${e.subcategory ? ' · ' + esc(e.subcategory) : ''}</span>
          <span class="ttl">${esc(e.title || e.text || '(รูปภาพ)')}</span>
        </span>
        <span class="go">›</span>
      </button>`).join('')}`);
}

function openManage() {
  openSheet(`
    <h3>หมวดหมู่</h3>
    <form id="cat-form">
      ${db.categories.map((c, i) => `
        <div class="mcat">
          <div class="mcat-head"><input type="color" name="color-${i}" value="${esc(c.color)}" aria-label="สี">${esc(c.name)}</div>
          <div class="subs">${esc(c.subs.join(', ')) || '—'}</div>
          <input type="text" name="sub-${i}" placeholder="เพิ่มหมวดย่อยใหม่ใน ${esc(c.name)}">
        </div>`).join('')}
      <div class="mcat">
        <span class="lbl">หมวดใหม่</span>
        <div class="newcat"><input type="color" name="new-color" value="#9A8FC9" aria-label="สี"><input type="text" name="new-name" placeholder="ชื่อหมวด เช่น TRAVEL"></div>
      </div>
      <div class="actions"><button class="solid" type="submit">บันทึก</button></div>
    </form>`);
}

/* ================= actions ================= */
function compress(file, max) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const s = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
      const c = document.createElement('canvas');
      c.width = Math.round(img.naturalWidth * s); c.height = Math.round(img.naturalHeight * s);
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      resolve(c.toDataURL('image/jpeg', 0.82));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('เปิดรูปนี้ไม่ได้')); };
    img.src = url;
  });
}

async function addFiles(files) {
  const room = 6 - draft.images.length;
  if (files.length > room) toast('แนบได้สูงสุด 6 รูป');
  for (const f of [...files].slice(0, room)) {
    try { draft.images.push({ src: await compress(f, remote() ? 1600 : 900), isNew: true }); }
    catch (err) { toast(err.message); }
  }
  $('#picks').innerHTML = picksHTML();
}

async function submitEntry(form) {
  const f = new FormData(form);
  const val = k => String(f.get(k) || '').trim();
  const sub = val('subcategory') === '__new' ? '' : val('subcategory');
  if (!val('text') && !val('title') && !draft.images.length) return toast('ยังไม่ได้เขียนอะไรเลย');
  const btn = $('#save-btn'); btn.disabled = true; btn.textContent = 'กำลังบันทึก…'; busy(true);
  try {
    for (const im of draft.images) {
      if (im.isNew && remote()) {
        const r = await api('uploadImage', { data: im.src.split(',')[1], name: `${val('date')}-${uid().slice(0, 8)}.jpg` });
        im.src = r.url; im.isNew = false;
      }
    }
    const now = new Date().toISOString();
    const entry = {
      id: draft.id || uid(), date: val('date') || today(), category: val('category'), subcategory: sub,
      title: val('title'), source: val('source'), text: val('text'),
      images: draft.images.map(im => im.src), created_at: draft.created_at || now, updated_at: now
    };
    if (remote()) await api('saveEntry', { entry });
    const i = db.entries.findIndex(x => x.id === entry.id);
    if (i >= 0) db.entries[i] = entry; else db.entries.push(entry);
    persist();
    toast('บันทึกแล้ว');
    go(`#/book/${enc(entry.category)}?e=${enc(entry.id)}`);
  } catch (err) {
    toast('บันทึกไม่สำเร็จ: ' + err.message);
    btn.disabled = false; btn.textContent = 'บันทึก';
  } finally { busy(false); }
}

async function deleteEntry(id) {
  if (!confirm('ลบโน้ตนี้ใช่ไหม?')) return;
  const e = db.entries.find(x => x.id === id);
  busy(true);
  try {
    if (remote()) await api('deleteEntry', { id });
    db.entries = db.entries.filter(x => x.id !== id);
    persist(); toast('ลบแล้ว');
    go(`#/book/${enc(e ? e.category : '')}`);
  } catch (err) { toast('ลบไม่สำเร็จ: ' + err.message); }
  finally { busy(false); }
}

async function submitCats(form) {
  const f = new FormData(form);
  db.categories.forEach((c, i) => {
    c.color = f.get('color-' + i) || c.color;
    const s = String(f.get('sub-' + i) || '').trim();
    if (s && !c.subs.includes(s)) c.subs.push(s);
  });
  const name = String(f.get('new-name') || '').trim().toUpperCase();
  if (name && !catOf(name)) db.categories.push({ name, color: f.get('new-color') || '#999999', subs: [] });
  busy(true);
  try { await saveCategories(); toast('บันทึกหมวดหมู่แล้ว'); }
  catch (err) { toast('บันทึกไม่สำเร็จ: ' + err.message); }
  finally { busy(false); }
  render();
}

async function submitCfg(form) {
  const f = new FormData(form);
  const url = String(f.get('url') || '').trim(), key = String(f.get('key') || '');
  if (!url) return toast('วาง Web app URL ก่อนนะคะ');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(url))
    return toast('ลิงก์นี้ไม่ใช่ Web app URL จาก Apps Script — ต้องขึ้นต้นด้วย script.google.com และลงท้ายด้วย /exec');
  const prev = cfg;
  cfg = { url, key };
  busy(true);
  try {
    const r = await api('list');
    store.set(K.cfg, cfg);
    db = { categories: r.categories, entries: r.entries };
    persist(); toast('เชื่อมต่อสำเร็จ'); go('#/index');
  } catch (err) {
    cfg = prev;
    toast('เชื่อมต่อไม่สำเร็จ: ' + err.message);
  } finally { busy(false); }
}

function download(name, text, type) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 5000);
}

function exportCSV() {
  const cols = ['id', 'date', 'category', 'subcategory', 'title', 'source', 'text', 'images', 'created_at', 'updated_at'];
  const q = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const hasData = u => u.startsWith('data:');
  const rows = db.entries.map(e => cols.map(c =>
    q(c === 'images' ? (e.images || []).map(u => hasData(u) ? '(local image)' : u).join(' ') : e[c])).join(','));
  download(`commonplace-${today()}.csv`, '﻿' + cols.join(',') + '\n' + rows.join('\n'), 'text/csv;charset=utf-8');
}

const actions = {
  manage: () => openManage(),
  lightbox: t => { const o = $('#overlay'); o.className = 'show lb'; o.innerHTML = `<img src="${esc(t.dataset.full)}" alt="">`; },
  edit: t => go('#/edit/' + enc(t.dataset.id)),
  sort: () => { ui.sortAsc = !ui.sortAsc; store.set(K.ui, ui); render(); },
  sub: t => { bookSub = t.dataset.sub; const y = window.scrollY; go('#/book/' + enc(ui.lastCat)); window.scrollTo(0, y); },
  day: t => openDay(t.dataset.date),
  'open-entry': t => go(`#/book/${enc(t.dataset.cat)}?e=${enc(t.dataset.id)}`),
  'rm-img': t => { draft.images.splice(+t.dataset.i, 1); $('#picks').innerHTML = picksHTML(); },
  'delete-entry': t => deleteEntry(t.dataset.id),
  disconnect: () => {
    if (!confirm('ยกเลิกการเชื่อมต่อในเครื่องนี้? (ข้อมูลใน Google Sheets ยังอยู่ครบ)')) return;
    cfg = { url: '', key: '' }; store.set(K.cfg, cfg);
    db = store.get(K.demo, null) || seed(); render();
  },
  'export-csv': exportCSV,
  'export-json': () => download(`commonplace-${today()}.json`, JSON.stringify(db, null, 2), 'application/json'),
  'reset-demo': () => { if (confirm('ล้างข้อมูลทดลองทั้งหมด?')) { db = seed(); persist(); go('#/index'); } }
};

document.addEventListener('click', ev => {
  if (ev.target.id === 'overlay' || (ev.target.closest('#overlay.lb'))) return closeOverlay();
  const t = ev.target.closest('[data-act]');
  if (t && actions[t.dataset.act]) { ev.preventDefault(); actions[t.dataset.act](t); }
});

document.addEventListener('submit', ev => {
  ev.preventDefault();
  const id = ev.target.id;
  if (id === 'entry-form') submitEntry(ev.target);
  else if (id === 'cat-form') submitCats(ev.target);
  else if (id === 'cfg-form') submitCfg(ev.target);
});

document.addEventListener('change', async ev => {
  const t = ev.target;
  if (t.id === 'files') return addFiles(t.files);
  if (t.id === 'f-cat') { $('#f-sub').innerHTML = subOptions(t.value, ''); return; }
  if (t.id === 'f-sub' && t.value === '__new') {
    const name = (prompt('ชื่อหมวดย่อยใหม่') || '').trim();
    const c = catOf($('#f-cat').value);
    if (name && c) {
      if (!c.subs.includes(name)) c.subs.push(name);
      t.innerHTML = subOptions(c.name, name);
      try { await saveCategories(); } catch (err) { toast('บันทึกหมวดย่อยไม่สำเร็จ: ' + err.message); }
    } else t.value = '';
  }
});

window.addEventListener('hashchange', render);

/* ================= start ================= */
if (remote()) {
  db = store.get(K.cache, null) || { categories: seedCats(), entries: [] };
  render(); refresh();
} else {
  db = store.get(K.demo, null) || seed();
  persist(); render();
}
})();
