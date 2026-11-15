/**
 * COMMONPLACE BOOK — ตัวเชื่อมระหว่างแอปกับ Google Sheets + Google Drive
 *
 * วิธีใช้ (ทำครั้งเดียว):
 * 1. เปลี่ยนรหัสลับในบรรทัด SECRET ด้านล่างเป็นรหัสของคุณเอง
 * 2. เลือกฟังก์ชัน setup จากเมนูด้านบน แล้วกด Run (กดอนุญาตสิทธิ์เมื่อระบบถาม)
 * 3. Deploy > New deployment > Web app > Execute as: Me, Who has access: Anyone
 * 4. คัดลอก Web app URL ไปวางในหน้า Settings ของแอป พร้อมรหัสลับเดียวกัน
 */

const SECRET = 'เปลี่ยนรหัสตรงนี้';

const ENTRY_COLS = ['id', 'date', 'category', 'subcategory', 'title', 'source', 'text', 'images', 'created_at', 'updated_at'];
const CAT_COLS = ['category', 'color', 'subcategories'];
const FOLDER_NAME = 'Commonplace Book Images';

const DEFAULT_CATS = [
  ['LEARNING', '#7FB88A', 'theory, knowledge, fact, vocabulary, information, food for thought, youtube summary'],
  ['BUSINESS', '#E2942E', 'marketing, sales tip, business ideas, content'],
  ['INSPIRATION', '#6C8CC4', 'quotes, mood board, compliments, copied text, photography, lyrics, poetry'],
  ['PERSONAL', '#D8749B', 'thoughts, wishlist, recipe, things to search for later']
];

/* ---------- ตั้งค่าครั้งแรก ---------- */
function setup() {
  const entries = sheet_('Entries', ENTRY_COLS);
  const cats = sheet_('Categories', CAT_COLS);
  if (cats.getLastRow() < 2) {
    cats.getRange(2, 1, DEFAULT_CATS.length, CAT_COLS.length).setValues(DEFAULT_CATS);
  }
  entries.setFrozenRows(1);
  cats.setFrozenRows(1);
  const folder = folder_();
  Logger.log('พร้อมใช้งาน โฟลเดอร์รูป: ' + folder.getUrl());
}

/* ---------- จุดรับคำสั่งจากแอป ---------- */
function doGet() {
  return ContentService.createTextOutput('Commonplace Book API is running.');
}

function doPost(e) {
  let out;
  try {
    const req = JSON.parse(e.postData.contents);
    if (req.key !== SECRET) throw new Error('Wrong secret');
    out = handle_(req);
    out.ok = true;
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(req) {
  if (req.action === 'list') {
    return { categories: readCats_(), entries: readEntries_() };
  }
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    switch (req.action) {
      case 'saveEntry': return saveEntry_(req.entry);
      case 'deleteEntry': return deleteEntry_(req.id);
      case 'saveCategories': return saveCats_(req.categories);
      case 'uploadImage': return uploadImage_(req.data, req.name);
      default: throw new Error('unknown action: ' + req.action);
    }
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Entries ---------- */
function readEntries_() {
  const sh = sheet_('Entries', ENTRY_COLS);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, ENTRY_COLS.length).getValues()
    .filter(function (r) { return r[0] !== ''; })
    .map(function (r) {
      const o = {};
      ENTRY_COLS.forEach(function (c, i) { o[c] = cell_(r[i]); });
      o.images = o.images ? o.images.split(/\s+/).filter(String) : [];
      return o;
    });
}

function saveEntry_(entry) {
  if (!entry || !entry.id) throw new Error('missing entry');
  const sh = sheet_('Entries', ENTRY_COLS);
  const row = ENTRY_COLS.map(function (c) {
    if (c === 'images') return (entry.images || []).join('\n');
    return entry[c] == null ? '' : String(entry[c]);
  });
  const at = findRow_(sh, entry.id);
  const target = at || sh.getLastRow() + 1;
  sh.getRange(target, 1, 1, ENTRY_COLS.length).setNumberFormat('@').setValues([row]);
  return {};
}

function deleteEntry_(id) {
  const sh = sheet_('Entries', ENTRY_COLS);
  const at = findRow_(sh, id);
  if (!at) return {};
  const images = String(sh.getRange(at, ENTRY_COLS.indexOf('images') + 1).getValue());
  images.split(/\s+/).forEach(function (u) {
    const m = u.match(/[?&]id=([\w-]+)/);
    if (m) { try { DriveApp.getFileById(m[1]).setTrashed(true); } catch (err) { } }
  });
  sh.deleteRow(at);
  return {};
}

function findRow_(sh, id) {
  if (sh.getLastRow() < 2) return 0;
  const ids = sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues();
  for (let i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return 0;
}

/* ---------- Categories ---------- */
function readCats_() {
  const sh = sheet_('Categories', CAT_COLS);
  if (sh.getLastRow() < 2) return [];
  return sh.getRange(2, 1, sh.getLastRow() - 1, CAT_COLS.length).getValues()
    .filter(function (r) { return r[0] !== ''; })
    .map(function (r) {
      return {
        name: String(r[0]),
        color: String(r[1] || '#999999'),
        subs: String(r[2] || '').split(',').map(function (s) { return s.trim(); }).filter(String)
      };
    });
}

function saveCats_(categories) {
  const sh = sheet_('Categories', CAT_COLS);
  if (sh.getLastRow() > 1) sh.getRange(2, 1, sh.getLastRow() - 1, CAT_COLS.length).clearContent();
  const rows = (categories || []).map(function (c) { return [c.name, c.color, (c.subs || []).join(', ')]; });
  if (rows.length) sh.getRange(2, 1, rows.length, CAT_COLS.length).setNumberFormat('@').setValues(rows);
  return {};
}

/* ---------- Images ---------- */
function uploadImage_(data, name) {
  const blob = Utilities.newBlob(Utilities.base64Decode(data), 'image/jpeg', name || 'image.jpg');
  const file = folder_().createFile(blob);
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  return { url: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1600' };
}

function folder_() {
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (err) { } }
  const folder = DriveApp.createFolder(FOLDER_NAME);
  props.setProperty('FOLDER_ID', folder.getId());
  return folder;
}

/* ---------- helpers ---------- */
function sheet_(name, cols) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, cols.length).setValues([cols]).setFontWeight('bold');
    sh.getRange(1, 1, sh.getMaxRows(), cols.length).setNumberFormat('@');
  }
  return sh;
}

function cell_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return v == null ? '' : String(v);
}
