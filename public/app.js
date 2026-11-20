'use strict';
/* O'quv markazi — xodimlarni o'qitish platformasi (vanilla JS SPA, hash routing) */

const $app = document.getElementById('app');
const state = { me: null, appName: "O'quv markazi", companyName: '', unread: 0 };
let cleanups = [];
const onCleanup = (fn) => cleanups.push(fn);

// ================================================================ utils
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (iso) => { if (!iso) return '—'; const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso + 'T00:00:00' : iso); return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`; };
const fmtTimeOfDay = (iso) => { const d = new Date(iso); return `${pad(d.getHours())}:${pad(d.getMinutes())}`; };
const fmtDateTime = (iso) => (iso ? `${fmtDate(iso)}, ${fmtTimeOfDay(iso)}` : '—');
const fmtDeadline = (iso) => (iso ? (/T/.test(iso) ? fmtDateTime(iso) : fmtDate(iso)) : 'Muddatsiz');
const fmtSize = (b) => (!b ? '' : b < 1048576 ? Math.round(b / 1024) + ' KB' : (b / 1048576).toFixed(1) + ' MB');
const fmtMin = (sec) => (sec === null || sec === undefined ? '—' : `${Math.max(1, Math.round(sec / 60))} daq`);
const fmtPhone = (p) => { const d = String(p || ''); return d.length === 12 ? `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}` : d; };
const plural = (n, w) => `${n} ta ${w}`;
const daysLeft = (iso) => (iso ? Math.ceil((Date.parse(iso) - Date.now()) / 864e5) : null);
const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(sessionStorage.getItem(key) || 'null');
    if (val === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
}
async function api(path, { method = 'GET', body } = {}) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch('/api' + path, opt);
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  if (r.status === 401 && path !== '/auth/login') { state.me = null; location.hash = '#/login'; throw new Error('Avval tizimga kiring'); }
  if (!r.ok) throw new Error(data?.error || 'Xatolik yuz berdi');
  return data;
}
function uploadForm(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api' + path);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => { let d = null; try { d = JSON.parse(x.responseText); } catch { /* empty */ } if (x.status >= 200 && x.status < 300) resolve(d); else reject(new Error(d?.error || 'Yuklashda xatolik')); };
    x.onerror = () => reject(new Error('Tarmoq xatoligi'));
    x.send(form);
  });
}
function toast(msg, type = '') {
  const t = document.createElement('div');
  t.className = 'toast ' + type;
  t.textContent = msg;
  $('#toasts').appendChild(t);
  setTimeout(() => t.remove(), 3800);
}
const toastErr = (e) => toast(e.message || String(e), 'error');
function openModal({ title, sub = '', body, foot = '', wide = false, onMount }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><div><h2>${esc(title)}</h2>${sub ? `<div class="sub">${sub}</div>` : ''}</div><button class="icon-btn" data-close aria-label="Yopish">${I.x}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  document.body.appendChild(back);
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  $$('[data-close]', back).forEach((b) => b.addEventListener('click', close));
  onMount?.(back, close);
  onCleanup(close);
  return close;
}
function confirmBox(title, text, okText = 'Tasdiqlash', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    openModal({
      title, body: `<p class="muted">${text}</p>`,
      foot: `<button class="btn" data-close>Bekor qilish</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok>${esc(okText)}</button>`,
      onMount: (m, close) => {
        $('[data-ok]', m).addEventListener('click', () => { done = true; close(); resolve(true); });
        new MutationObserver((_, o) => { if (!document.body.contains(m)) { o.disconnect(); if (!done) resolve(false); } }).observe(document.body, { childList: true });
      },
    });
  });
}
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); toast('Nusxa olindi', 'success'); }
  catch { toast("Nusxa olib bo'lmadi", 'error'); }
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ($(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Kutubxonani yuklab bo'lmadi"));
    document.head.appendChild(s);
  });
}
function popMenu(anchor, items) {
  $$('.menu').forEach((m) => m.remove());
  const m = document.createElement('div');
  m.className = 'menu';
  m.innerHTML = items.map((it, i) => (it.href ? `<a href="${it.href}" data-i="${i}">${it.icon || ''}${esc(it.label)}</a>` : `<button data-i="${i}" class="${it.danger ? 'danger' : ''}">${it.icon || ''}${esc(it.label)}</button>`)).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.top = `${r.bottom + window.scrollY + 4}px`;
  m.style.left = `${Math.max(8, Math.min(r.right + window.scrollX - m.offsetWidth, window.innerWidth - m.offsetWidth - 8))}px`;
  m.addEventListener('click', (e) => { const b = e.target.closest('[data-i]'); if (!b) return; m.remove(); items[b.dataset.i].onClick?.(); });
  setTimeout(() => document.addEventListener('click', () => m.remove(), { once: true }), 0);
  onCleanup(() => m.remove());
}

// ================================================================ icons
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  logo: svg('<path d="M3 9l9-5 9 5-9 5-9-5z"/><path d="M7 11.5V16c0 1.7 2.2 3 5 3s5-1.3 5-3v-4.5"/>'),
  home: svg('<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>'),
  homeAlt: svg('<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5c2 .6 3.3 2.6 3.5 5.5"/>'),
  book: svg('<path d="M2 4h7a3 3 0 0 1 3 3v13a2 2 0 0 0-2-2H2z"/><path d="M22 4h-7a3 3 0 0 0-3 3v13a2 2 0 0 1 2-2h8z"/>'),
  test: svg('<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3"/><path d="M9 12l2 2 4-4"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="M8 17v-5M12 17V8M16 17v-8"/>'),
  logout: svg('<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>'),
  user: svg('<circle cx="12" cy="8" r="4"/><path d="M4 21c.8-4 4-6 8-6s7.2 2 8 6"/>'),
  plus: svg('<path d="M12 5v14M5 12h14"/>'),
  x: svg('<path d="M18 6L6 18M6 6l12 12"/>'),
  edit: svg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>'),
  trash: svg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/>'),
  up: svg('<path d="M18 15l-6-6-6 6"/>'),
  down: svg('<path d="M6 9l6 6 6-6"/>'),
  eye: svg('<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>'),
  video: svg('<rect x="2" y="5" width="15" height="14" rx="2"/><path d="M17 10l5-3v10l-5-3z"/>'),
  file: svg('<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>'),
  slides: svg('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  text: svg('<path d="M4 6h16M4 12h16M4 18h10"/>'),
  check: svg('<path d="M20 6L9 17l-5-5"/>'),
  checkCircle: svg('<circle cx="12" cy="12" r="10"/><path d="M8 12l3 3 5-6"/>'),
  xCircle: svg('<circle cx="12" cy="12" r="10"/><path d="M15 9l-6 6M9 9l6 6"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  next: svg('<path d="M9 18l6-6-6-6"/>'),
  upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  award: svg('<circle cx="12" cy="8" r="6"/><path d="M8.2 13.2L7 22l5-3 5 3-1.2-8.8"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  calendar: svg('<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>'),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  print: svg('<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
  bell: svg('<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>'),
  search: svg('<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>'),
  more: svg('<circle cx="5" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="19" cy="12" r="1.5"/>'),
  userPlus: svg('<circle cx="9" cy="8" r="4"/><path d="M2 21c.7-3.8 3.6-6 7-6s6.3 2.2 7 6"/><path d="M19 8v6M16 11h6"/>'),
  send: svg('<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>'),
  refresh: svg('<path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>'),
  alert: svg('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>'),
  monitor: svg('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  camera: svg('<path d="M23 7l-7 5 7 5z"/><rect x="1" y="5" width="15" height="14" rx="2"/>'),
  database: svg('<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v14c0 1.7 3.6 3 8 3s8-1.3 8-3V5"/><path d="M4 12c0 1.7 3.6 3 8 3s8-1.3 8-3"/>'),
  telegram: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21.9 4.6l-3.1 14.6c-.2 1-.8 1.3-1.7.8l-4.7-3.5-2.3 2.2c-.3.3-.5.5-1 .5l.3-4.8 8.8-7.9c.4-.3-.1-.5-.6-.2L6.7 13.1 2 11.6c-1-.3-1-1 .2-1.5l18.3-7c.9-.3 1.6.2 1.4 1.5z"/></svg>',
  playFill: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>',
  volume: svg('<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  mute: svg('<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M23 9l-6 6M17 9l6 6"/>'),
  expand: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  arrowUp: svg('<path d="M12 19V5M5 12l7-7 7 7"/>'),
  arrowDown: svg('<path d="M12 5v14M19 12l-7 7-7-7"/>'),
};
const matType = (l) => (l.type === 'video' ? 'video' : l.type === 'text' ? 'text' : ['ppt', 'pptx', 'pps', 'ppsx', 'odp'].includes(l.sourceType) || /taqdimot/i.test(l.title) ? 'ppt' : 'pdf');
const MAT = {
  pdf: { icon: I.file, label: 'PDF', cls: 't-pdf' },
  ppt: { icon: I.slides, label: 'Taqdimot', cls: 't-ppt' },
  video: { icon: I.video, label: 'Video', cls: 't-video' },
  text: { icon: I.text, label: 'Matn', cls: 't-text' },
};
const matMeta = (l) => {
  const t = matType(l);
  const parts = [MAT[t].label];
  if (l.type === 'video' && l.duration) parts.push(fmtTime(l.duration));
  if (l.type === 'pdf' && l.pages) parts.push(`${l.pages} bet`);
  if (l.size) parts.push(fmtSize(l.size));
  return parts.join(' · ');
};
const matIcon = (l, extra = '') => { const m = MAT[matType(l)]; return `<span class="mat-ic ${m.cls} ${extra}">${m.icon}</span>`; };
function avatar(name, size = '') {
  const p = String(name || '?').trim().split(/\s+/);
  return `<span class="avatar ${size}">${esc(((p[0]?.[0] || '') + (p[1]?.[0] || '')).toUpperCase())}</span>`;
}
// Xodim uchun holat
function empStatus(c) {
  if (c.status === 'completed') return `<span class="badge badge-green">${I.check}Bajarildi${c.best !== null && c.best !== undefined ? ' · ' + c.best + '%' : ''}</span>`;
  if (c.status === 'failed') return `<span class="badge badge-red">O'tmadi${c.best !== null && c.best !== undefined ? ' · ' + c.best + '%' : ''}</span>`;
  if (c.overdue) return `<span class="badge badge-orange">${I.clock}Muddati o'tgan</span>`;
  if (c.status === 'in_progress') return `<span class="badge badge-blue">Jarayonda · ${c.lessonsDone}/${c.lessonsTotal} material</span>`;
  return '<span class="badge badge-gray">Boshlanmagan</span>';
}
// Admin uchun natija holati
function resStatus(r) {
  if (r.passed) return `<span class="badge badge-green">${I.check}O'tdi</span>`;
  if (r.submitted) return `<span class="badge badge-red">${I.x}O'tmadi</span>`;
  if (r.overdue) return `<span class="badge badge-orange">${I.clock}Muddati o'tgan</span>`;
  return `<span class="badge badge-amber">${I.clock}Topshirmagan</span>`;
}
const progressBar = (p, cls = '') => `<div class="progress ${cls}"><i style="width:${Math.max(0, Math.min(100, p || 0))}%"></i></div>`;
const loading = () => '<div class="boot" style="height:50vh"><div class="spinner"></div></div>';
const crumbs = (items) => `<div class="crumbs">${items.map(([t, h], i) => (h ? `<a href="${h}">${esc(t)}</a>` : `<span>${esc(t)}</span>`) + (i < items.length - 1 ? I.next : '')).join('')}</div>`;
function deadlineChip(iso, done) {
  if (!iso) return '';
  const d = daysLeft(iso);
  if (done || d > 3) return `<span class="pill">${I.calendar}Muddat: ${fmtDate(iso)}</span>`;
  if (d < 0) return `<span class="badge badge-red">${I.clock}Muddat o'tgan: ${fmtDate(iso)}</span>`;
  return `<span class="badge badge-amber">${I.clock}${d === 0 ? 'Bugun' : d + ' kun qoldi'} · ${fmtDate(iso)}</span>`;
}
const UZ_MONTHS_SHORT = ['yan', 'fev', 'mar', 'apr', 'may', 'iyn', 'iyl', 'avg', 'sen', 'okt', 'noy', 'dek'];

// ================================================================ charts (inline SVG)
function lineChart(series, labels, { min = 0, max = 100, threshold = null, height = 220 } = {}) {
  const W = 600, H = height, L = 30, R = 40, T = 10, B = 24;
  const n = labels.length;
  const x = (i) => L + (n <= 1 ? 0 : (i * (W - L - R)) / (n - 1));
  const y = (v) => T + (1 - (v - min) / (max - min)) * (H - T - B);
  const ticks = [];
  for (let v = min; v <= max; v += 10) ticks.push(v);
  let s = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img">`;
  s += ticks.map((v) => `<line class="grid-line" x1="${L}" x2="${W - R}" y1="${y(v)}" y2="${y(v)}"/><text x="${L - 6}" y="${y(v) + 3}" text-anchor="end">${v}</text>`).join('');
  if (threshold !== null) s += `<line x1="${L}" x2="${W - R}" y1="${y(threshold)}" y2="${y(threshold)}" stroke="#94a3b8" stroke-dasharray="4 4"/><text x="${L + 4}" y="${y(threshold) - 5}" style="fill:#64748b">O'tish bali ${threshold}%</text>`;
  const step = Math.ceil(n / 8);
  s += labels.map((lb, i) => (i % step === 0 || i === n - 1 ? `<text x="${x(i)}" y="${H - 6}" text-anchor="middle">${lb}</text>` : '')).join('');
  for (const se of series) {
    const pts = se.data.map((v, i) => (v === null || v === undefined ? null : [x(i), y(Math.max(min, Math.min(max, v)))]));
    const segs = []; let cur = [];
    pts.forEach((p) => { if (p) cur.push(p); else if (cur.length) { segs.push(cur); cur = []; } });
    if (cur.length) segs.push(cur);
    if (se.area) segs.forEach((sg) => { s += `<path d="M${sg.map((p) => p.join(',')).join('L')}L${sg[sg.length - 1][0]},${H - B}L${sg[0][0]},${H - B}Z" fill="${se.color}" opacity=".08"/>`; });
    segs.forEach((sg) => { s += `<path d="M${sg.map((p) => p.join(',')).join('L')}" fill="none" stroke="${se.color}" stroke-width="2.2" stroke-linejoin="round"/>`; });
    const last = [...pts].reverse().find(Boolean);
    const lastV = [...se.data].reverse().find((v) => v !== null && v !== undefined);
    if (last) s += `<circle cx="${last[0]}" cy="${last[1]}" r="4" fill="${se.color}" stroke="#fff" stroke-width="2"/><text x="${last[0] + 8}" y="${last[1] + 4}" style="fill:${se.color};font-weight:700;font-size:11.5px">${lastV}%</text>`;
  }
  return s + '</svg>';
}
function sparkline(data, color = '#2f5bff') {
  const v = data.filter((d) => d !== null && d !== undefined);
  if (v.length < 2) return '';
  const mn = Math.min(...v) - 2, mx = Math.max(...v) + 2;
  const pts = data.map((d, i) => (d === null || d === undefined ? null : [(i / (data.length - 1)) * 90, 26 - ((d - mn) / (mx - mn || 1)) * 24])).filter(Boolean);
  const l = pts[pts.length - 1];
  return `<svg class="spark" viewBox="0 0 92 28"><path d="M${pts.map((p) => p.join(',')).join('L')}" fill="none" stroke="${color}" stroke-width="1.6"/><circle cx="${l[0]}" cy="${l[1]}" r="2.5" fill="${color}"/></svg>`;
}
function histogramHtml(bins, passScore = 70) {
  const mx = Math.max(1, ...bins.map((b) => b.count));
  return `<div class="hist">${bins.map((b) => `<div><b>${b.count}</b><i class="${b.to < passScore ? 'low' : ''}" style="height:${(b.count / mx) * 100}%"></i><span>${b.label}</span></div>`).join('')}</div>`;
}
const deltaHtml = (d, suffix = "o'tgan oyga nisbatan") => (d === null || d === undefined ? `<span class="faint">${suffix}</span>`
  : `<span class="${d >= 0 ? 'delta-up' : 'delta-down'}">${d >= 0 ? '↑ +' : '↓ '}${d} p.p.</span> ${suffix}`);

// ================================================================ shells
const brandHtml = () => `<a class="brand" href="${state.me?.role === 'admin' ? '#/admin' : '#/'}"><span class="brand-logo">${I.logo}</span><div><b>${esc(state.appName)}</b>${state.companyName ? `<span>${esc(state.companyName)}</span>` : ''}</div></a>`;
const ADMIN_NAV = [['dash', '#/admin', I.home, 'Bosh sahifa'], ['users', '#/admin/users', I.users, 'Xodimlar'], ['trainings', '#/admin/trainings', I.book, 'Treninglar'], ['tests', '#/admin/tests', I.test, 'Testlar'], ['results', '#/admin/results', I.chart, 'Natijalar']];
function adminShell(active, inner) {
  return `<div class="layout">
    <aside class="sidebar">
      ${brandHtml()}
      ${ADMIN_NAV.map(([k, h, i, t]) => `<a class="nav-link ${active === k ? 'active' : ''}" href="${h}">${i}<span>${t}</span></a>`).join('')}
      <div class="sidebar-foot">
        <div class="who">${avatar(state.me.name, 'sm')}<div style="min-width:0"><b class="ellipsis">${esc(state.me.name)}</b><span>Administrator</span></div></div>
        <a class="nav-link ${active === 'profile' ? 'active' : ''}" href="#/profile">${I.user}<span>Profil</span></a>
        <a class="nav-link" href="#" data-logout>${I.logout}<span>Chiqish</span></a>
      </div>
    </aside>
    <div style="min-width:0">
      <header class="m-top">${brandHtml()}<a href="#/profile">${avatar(state.me.name, 'sm')}</a></header>
      <main class="main">${inner}</main>
    </div>
  </div>
  ${tabbar([['dash', '#/admin', I.home, 'Asosiy'], ['users', '#/admin/users', I.users, 'Xodimlar'], ['trainings', '#/admin/trainings', I.book, 'Treninglar'], ['tests', '#/admin/tests', I.test, 'Testlar'], ['results', '#/admin/results', I.chart, 'Natijalar']], active)}`;
}
const tabbar = (items, active) => `<nav class="tabbar">${items.map(([k, h, i, t]) => `<a class="tb ${active === k ? 'on' : ''}" href="${h}">${i}<span>${t}</span></a>`).join('')}</nav>`;
const EMP_NAV = [['home', '#/', I.homeAlt, 'Bosh sahifa'], ['trainings', '#/trainings', I.book, 'Treninglar'], ['tests', '#/tests', I.test, 'Testlar'], ['results', '#/results', I.chart, 'Natijalar']];
const bellBtn = () => `<button class="icon-btn bordered" data-bell aria-label="Bildirishnomalar">${I.bell}${state.unread ? '<span class="dot-badge"></span>' : ''}</button>`;
function empShell(active, inner) {
  const isAdmin = state.me.role === 'admin';
  const first = state.me.name.split(' ')[0];
  return `<header class="topbar"><div class="topbar-in">
      ${brandHtml()}
      <nav class="topnav">${isAdmin ? '' : EMP_NAV.map(([k, h, , t]) => `<a class="${active === k ? 'active' : ''}" href="${h}">${t}</a>`).join('')}</nav>
      <div class="topbar-right">
        ${isAdmin ? '<span class="badge badge-amber">Xodim ko\'rinishi</span><a class="btn btn-sm" href="#/admin">Admin panel</a>' : bellBtn()}
        <a href="#/profile" class="row" style="gap:8px;color:var(--text);font-weight:600">${avatar(state.me.name, 'sm')}<span class="hide-sm">${esc(first)}</span></a>
        <button class="icon-btn bordered" data-logout title="Chiqish" aria-label="Chiqish">${I.logout}</button>
      </div>
    </div></header>
    <div class="container">${inner}</div>
    ${isAdmin ? '' : tabbar(EMP_NAV, active)}`;
}
const shell = (active, inner) => (state.me.role === 'admin' ? adminShell(active, inner) : empShell(active, inner));
function bindShell() {
  $$('[data-logout]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.me = null;
    location.hash = '#/login';
  }));
  $$('[data-bell]').forEach((b) => b.addEventListener('click', openNotifications));
}
function render(html) { $app.innerHTML = svgDefs + html; bindShell(); window.scrollTo(0, 0); }

// ---- classic dizayn yordamchilari: banner halqasi, stat kartalar, kurs muqovalari
const svgDefs = `<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs><linearGradient id="rgw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffb27f"/></linearGradient></defs></svg>`;
function ring(p, label, size = 132) {
  const r = 52, C = 2 * Math.PI * r;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="${r}" stroke="rgba(255,255,255,.22)" stroke-width="11" fill="none"/>
    <circle cx="60" cy="60" r="${r}" stroke="#fff" stroke-width="11" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - (p || 0) / 100)}"/></svg>
    <div class="ring-in"><div><b>${p || 0}%</b><span>${label}</span></div></div></div>`;
}
const statCard = (icon, label, value, sub = '', tone = 'indigo', extra = '') => `<div class="card stat tone-${tone}"><div class="stat-ic">${icon}</div>
  <div style="min-width:0;flex:1"><div class="row between" style="flex-wrap:nowrap"><div class="stat-label">${label}</div>${extra}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div></div>`;
const COVERS = [
  'radial-gradient(260px 160px at 100% 0%,rgba(77,123,255,.55),transparent 70%),linear-gradient(135deg,#0b1230 0%,#1d3bb8 100%)',
  'radial-gradient(260px 160px at 100% 0%,rgba(255,170,110,.5),transparent 70%),linear-gradient(135deg,#2a1206 0%,#e8641c 100%)',
  'radial-gradient(260px 160px at 100% 0%,rgba(80,230,200,.45),transparent 70%),linear-gradient(135deg,#06262a 0%,#0e8f8a 100%)',
  'radial-gradient(260px 160px at 100% 0%,rgba(170,150,255,.5),transparent 70%),linear-gradient(135deg,#140d38 0%,#5b45d6 100%)',
  'radial-gradient(260px 160px at 100% 0%,rgba(255,130,130,.45),transparent 70%),linear-gradient(135deg,#2c0a12 0%,#c9303a 100%)',
  'radial-gradient(260px 160px at 100% 0%,rgba(120,230,160,.45),transparent 70%),linear-gradient(135deg,#062417 0%,#128a57 100%)',
];
const CAT_STYLE = { onboarding: 0, sotuv: 1, farmatsevtika: 2, "ko'nikmalar": 3, xavfsizlik: 4, majburiy: 5 };
const cover = (id, cat) => { const k = String(cat || '').toLowerCase(); return COVERS[(k in CAT_STYLE ? CAT_STYLE[k] : id) % COVERS.length]; };
const catIcon = (cat) => ({ onboarding: I.award, sotuv: I.chart, farmatsevtika: I.shield, xavfsizlik: I.shield, majburiy: I.alert, "ko'nikmalar": I.book }[String(cat || '').toLowerCase()] || I.book);
function courseCard(c) {
  return `<a class="card course-card" href="#/course/${c.id}">
    <div class="course-cover" style="background:${cover(c.id, c.category)}">
      <div class="cover-ic">${c.status === 'completed' ? I.award : catIcon(c.category)}</div>${c.category ? `<span class="cat">${esc(c.category)}</span>` : ''}<div class="big-ic">${catIcon(c.category)}</div>
      ${empStatus(c).replace(/badge-(gray|blue|green|red|orange)/, 'badge-white')}
    </div>
    <div class="course-body">
      <h3>${esc(c.title)}</h3>
      <div class="meta-chips"><span class="meta-chip">${I.book}${plural(c.lessonsTotal, 'material')}</span>${c.hasTest ? `<span class="meta-chip">${I.test}Test</span>` : ''}</div>
      <div><div class="row between small" style="margin-bottom:6px"><span class="muted">Jarayon</span><b>${c.progress}%</b></div>${progressBar(c.progress, c.status === 'completed' ? 'green' : '')}</div>
      <div class="course-meta"><span>${c.deadline ? (c.status !== 'completed' && daysLeft(c.deadline) < 0 ? `<span class="red">Muddat o'tgan: ${fmtDate(c.deadline)}</span>` : 'Muddat: ' + fmtDate(c.deadline)) : '<span class="faint">Muddatsiz</span>'}</span>
        <b style="color:var(--primary)">${c.status === 'completed' ? "Ko'rish" : c.status === 'not_started' ? 'Boshlash' : 'Davom etish'} →</b></div>
    </div></a>`;
}

async function openNotifications() {
  const list = await api('/my/notifications').catch(() => []);
  openModal({
    title: 'Bildirishnomalar',
    body: list.length ? `<div class="notif-list">${list.map((n) => `<div class="notif ${n.read ? 'read' : ''}"><i class="dot"></i><div>${esc(n.text)}<span>${fmtDateTime(n.createdAt)}</span></div></div>`).join('')}</div>`
      : `<div class="empty">${I.bell}<h3>Bildirishnomalar yo'q</h3></div>`,
    foot: `<a class="btn" href="#/profile" data-close>${I.telegram}Telegram orqali olish</a><button class="btn btn-primary" data-close>Yopish</button>`,
  });
  if (state.unread) { await api('/my/notifications/read', { method: 'POST' }).catch(() => {}); state.unread = 0; $$('.dot-badge').forEach((d) => d.remove()); }
}

// ================================================================ login
function pageLogin() {
  $app.innerHTML = `<div class="login-wrap">
    <div class="login-art">
      <div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>
      ${brandHtml()}
      <div>
        <h2>Jamoangizni <em>o'qiting</em>, bilimini <em>o'lchang</em></h2>
        <p class="sub">Video darslar, taqdimotlar va testlar — bitta platformada. Har bir xodimning natijasi real vaqtda ko'z oldingizda.</p>
        <div class="mock-stage">
          <div class="mock mock-1"><div class="t">Saqlash qoidalari</div><b>2 / 3 material ko'rildi</b><div class="bar"><i></i></div></div>
          <div class="mock mock-2"><div class="t">Test natijasi</div><div class="big">92%</div><div class="t">O'tdi ✓</div></div>
          <div class="mock mock-3"><div class="ic">${I.award}</div><div><b>Sertifikat berildi</b><div class="t">Dilnoza Karimova · bugun</div></div></div>
        </div>
      </div>
      <div class="login-feats"><span>${I.video}Video va PDF</span><span>${I.test}Testlar</span><span>${I.chart}Hisobotlar</span><span>${I.telegram}Telegram</span></div>
    </div>
    <div class="login-form"><form class="login-box stack" id="f" autocomplete="on">
      <div class="login-mobile-brand">${brandHtml()}</div>
      <div><h1>Xush kelibsiz 👋</h1><p class="muted" style="margin-top:8px">Telefon raqamingiz va parolingiz bilan kiring</p></div>
      <div class="field"><label for="ph">Telefon raqam</label>
        <div class="phone-in"><span>+998</span><input class="input" id="ph" name="phone" type="tel" inputmode="numeric" data-phone maxlength="12" placeholder="90 123 45 67" required autocomplete="tel-national"></div></div>
      <div class="field"><label for="pw">Parol</label><input class="input" id="pw" name="password" type="password" required autocomplete="current-password"></div>
      <button class="btn btn-primary btn-lg btn-block" type="submit">Kirish</button>
      <p class="hint" style="text-align:center">Parolni unutgan bo'lsangiz, administratorga murojaat qiling</p>
    </form></div>
  </div>`;
  $('#f').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!checkPhone($('#ph'))) return;
    const btn = $('button[type=submit]', e.target);
    btn.disabled = true;
    try {
      const r = await api('/auth/login', { method: 'POST', body: { phone: '998' + phoneDigits($('#ph').value), password: $('#pw').value } });
      state.me = r.user;
      location.hash = r.user.role === 'admin' ? '#/admin' : '#/';
    } catch (err) { toastErr(err); btn.disabled = false; }
  });
}

// ================================================================ xodim: bosh sahifa
function courseItem(c, href = `#/course/${c.id}`) {
  const icCls = c.status === 'completed' ? 'green' : c.status === 'failed' ? 'red' : '';
  return `<a class="list-card" href="${href}"><span class="list-ic ${icCls}">${c.status === 'completed' ? I.checkCircle : I.book}</span>
    <div class="list-body"><b>${esc(c.title)}</b><div class="small">${plural(c.lessonsTotal, 'material')}${c.hasTest ? ' · test bilan' : ''}${c.deadline && c.status !== 'completed' ? ' · muddat ' + fmtDate(c.deadline) : ''}</div>${empStatus(c)}</div>
    <span class="chev">${I.next}</span></a>`;
}
function dueAction(c) {
  if (c.hasTest && c.canStartTest && c.materialsOk) return ['Testni boshlash', `#/course/${c.id}/test`];
  return [c.lessonsDone ? 'Davom ettirish' : 'Treningni boshlash', `#/course/${c.id}`];
}
async function pageHome() {
  if (state.me.role === 'admin') { location.hash = '#/admin'; return; }
  render(empShell('home', loading()));
  const [h, tgs] = await Promise.all([api('/my/home'), api('/my/telegram').catch(() => null)]);
  state.unread = h.unread;
  const list = h.courses;
  const done = list.filter((c) => c.status === 'completed').length;
  const active = list.filter((c) => c.status === 'in_progress' || c.status === 'failed').length;
  const overdue = list.filter((c) => c.overdue).length;
  const overall = list.length ? Math.round(list.reduce((s, c) => s + c.progress, 0) / list.length) : 0;
  const sorted = [...list].sort((a, b) => (a.status === 'completed') - (b.status === 'completed') || (a.deadline || '9').localeCompare(b.deadline || '9'));
  const next = sorted.find((c) => c.status !== 'completed');
  const due = h.dueSoon[0];
  const [dueLabel, dueHref] = due ? dueAction(due) : [];
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Xayrli tong' : hour < 18 ? 'Xayrli kun' : 'Xayrli kech';
  const first = state.me.name.split(' ')[0];
  render(empShell('home', `
    <section class="hero"><div class="hero-row">
      <div style="flex:1;min-width:240px">
        <div class="row between" style="flex-wrap:nowrap"><span class="badge badge-white">${greet} 👋</span><span class="m-only">${bellBtn().replace('icon-btn bordered', 'icon-btn btn-glass')}</span></div>
        <h1 style="margin-top:12px">${esc(first)}, bugun ham <em>bir qadam</em> oldinga!</h1>
        <p style="margin-top:8px">${next ? `Keyingi trening: <b>${esc(next.title)}</b>` : list.length ? 'Barcha treninglarni tugatdingiz — ajoyib natija!' : "Sizga trening tayinlanganda shu yerda ko'rinadi"}</p>
        <div class="hero-stats">
          <div class="hero-stat"><b>${list.length}</b><span>Treninglar</span></div>
          <div class="hero-stat"><b>${active}</b><span>Jarayonda</span></div>
          <div class="hero-stat"><b>${done}</b><span>Bajarildi</span></div>
          ${overdue ? `<div class="hero-stat" style="background:rgba(229,72,77,.3)"><b>${overdue}</b><span>Muddati o'tgan</span></div>` : `<div class="hero-stat"><b>${h.avgScore ?? '—'}${h.avgScore !== null ? '%' : ''}</b><span>O'rtacha ball</span></div>`}
        </div>
        ${next ? `<a class="btn btn-white" style="margin-top:20px" href="#/course/${next.id}">${I.playFill.replace('<svg', '<svg width="15" height="15"')}${next.status === 'not_started' ? "O'qishni boshlash" : 'Davom ettirish'}</a>` : ''}
      </div>
      ${list.length ? ring(overall, 'umumiy', 140) : ''}
    </div></section>
    ${due || (tgs?.enabled && !tgs.linked) ? `<div class="grid grid-2" style="margin-bottom:6px">
      ${due ? `<div class="due-card"><div class="top"><span class="due-ic">${I.clock}</span><div style="min-width:0;flex:1"><div class="small" style="color:var(--amber);font-weight:700">Muddati yaqin</div><b>${esc(due.hasTest ? due.testTitle : due.title)}</b>
          <div class="meta"><span class="warn">${I.clock}${daysLeft(due.deadline) < 0 ? "Muddat o'tgan" : daysLeft(due.deadline) === 0 ? 'Bugun' : daysLeft(due.deadline) + ' kun qoldi'}</span><span>· ${fmtDate(due.deadline)}</span>${due.hasTest ? `<span>· ${due.testQuestionCount} savol${due.timeLimitMin ? ', ' + due.timeLimitMin + ' daqiqa' : ''}</span>` : ''}</div></div>
          <a class="btn btn-primary btn-sm" style="margin-top:0" href="${dueHref}">${dueLabel}</a></div></div>` : ''}
      ${tgs?.enabled && !tgs.linked ? `<div class="card card-pad row" style="gap:12px;flex-wrap:nowrap"><span class="list-ic" style="background:#e8f4fd;color:#229ed9">${I.telegram}</span><div style="flex:1;min-width:0"><b>Telegram orqali eslatmalar</b><div class="small muted">Muddatlar va yangi testlar haqida xabar oling</div></div><a class="btn btn-sm btn-soft" href="#/profile">Ulash</a></div>` : ''}
    </div>` : ''}
    ${list.length ? `<div class="section-title"><h2>Mening treninglarim</h2><span class="small muted">${list.length} ta</span></div><div class="grid grid-3">${sorted.map(courseCard).join('')}</div>`
      : `<div class="card empty">${I.book}<h3>Hozircha tayinlanmagan</h3><p>Sizga trening tayinlanganda shu yerda ko'rinadi</p></div>`}`));
}
async function pageTrainings() {
  render(empShell('trainings', loading()));
  const list = await api('/my/courses');
  render(empShell('trainings', `
    <div class="page-head"><div><h1>Treninglar</h1><p class="sub">Sizga tayinlangan o'quv materiallari</p></div></div>
    ${list.length ? `<div class="grid grid-3">${list.map(courseCard).join('')}</div>` : `<div class="card empty">${I.book}<h3>Treninglar yo'q</h3></div>`}`));
}
async function pageTests() {
  render(empShell('tests', loading()));
  const list = (await api('/my/courses')).filter((c) => c.hasTest);
  render(empShell('tests', `
    <div class="page-head"><div><h1>Testlar</h1><p class="sub">Test trening materiallari to'liq ko'rilgandan keyin ochiladi</p></div></div>
    <div class="card">${list.length ? list.map((c) => {
      let right;
      if (c.status === 'completed') right = `<span class="badge badge-green">${I.check}O'tdi${c.best !== null ? ' · ' + c.best + '%' : ''}</span>`;
      else if (c.canStartTest && c.materialsOk) right = `<a class="btn btn-sm btn-primary" href="#/course/${c.id}/test">${c.status === 'failed' ? 'Qayta topshirish' : 'Boshlash'}</a>`;
      else if (c.status === 'failed') right = `<span class="badge badge-red">O'tmadi${c.best !== null ? ' · ' + c.best + '%' : ''}</span>`;
      else right = `<span class="badge badge-gray">${I.lock}Yopiq</span>`;
      return `<div class="list-card"><span class="list-ic ${c.status === 'completed' ? 'green' : c.materialsOk ? '' : 'gray'}">${c.materialsOk || c.status === 'completed' ? I.test : I.lock}</span>
        <div class="list-body"><b>${esc(c.testTitle)}</b><div class="small">${c.testQuestionCount} savol${c.timeLimitMin ? ' · ' + c.timeLimitMin + ' daqiqa' : ''} · o'tish bali ${c.passScore}%${c.deadline ? ' · muddat ' + fmtDate(c.deadline) : ''}</div>
        ${!c.materialsOk && c.status !== 'completed' ? `<div class="small" style="margin-top:4px"><a href="#/course/${c.id}">Avval treningni tugating (${c.lessonsDone}/${c.lessonsTotal}) →</a></div>` : ''}</div>${right}</div>`;
    }).join('') : `<div class="empty">${I.test}<h3>Testlar yo'q</h3></div>`}</div>`));
}
async function pageMyResults() {
  render(empShell('results', loading()));
  const [rows, courses] = await Promise.all([api('/my/results'), api('/my/courses')]);
  const shown = rows.filter((r) => r.score !== null);
  const done = courses.filter((c) => c.status === 'completed');
  render(empShell('results', `
    <div class="page-head"><div><h1>Natijalar</h1><p class="sub">Topshirilgan testlar tarixi</p></div></div>
    <div class="grid grid-3" style="margin-bottom:16px">
      <div class="card kpi"><div class="kpi-label">Topshirilgan testlar</div><div class="kpi-value">${rows.length}</div></div>
      <div class="card kpi"><div class="kpi-label">O'rtacha ball</div><div class="kpi-value">${shown.length ? Math.round(shown.reduce((a, r) => a + r.score, 0) / shown.length) + '%' : '—'}</div></div>
      <div class="card kpi"><div class="kpi-label">Bajarilgan treninglar</div><div class="kpi-value">${done.length}<small> / ${courses.length}</small></div></div>
    </div>
    <div class="card">${rows.length ? rows.map((r) => `<a class="list-card" href="#/attempt/${r.id}"><span class="list-ic ${r.passed === true ? 'green' : r.passed === false ? 'red' : ''}">${r.passed === false ? I.xCircle : I.checkCircle}</span>
      <div class="list-body"><b>${esc(r.testTitle)}</b><div class="small">${fmtDateTime(r.finishedAt)} · ${r.attemptNumber}-urinish · ${fmtMin(r.durationSec)}</div></div>
      ${r.score !== null ? `<span class="badge ${r.passed ? 'badge-green' : 'badge-red'}">${r.score}%</span>` : '<span class="badge badge-gray">Tekshirilmoqda</span>'}<span class="chev">${I.next}</span></a>`).join('')
      : `<div class="empty">${I.chart}<h3>Hali test topshirmagansiz</h3></div>`}</div>
    ${done.length ? `<div class="section-title"><h2>Sertifikatlar</h2></div><div class="card">${done.map((c) => `<a class="list-card" href="#/certificate/${c.id}"><span class="list-ic green">${I.award}</span><div class="list-body"><b>${esc(c.title)}</b><div class="small">${fmtDate(c.completedAt)}</div></div><span class="chev">${I.next}</span></a>`).join('')}</div>` : ''}`));
}

// ================================================================ xodim: trening sahifasi
async function pageCourse(id) {
  render(shell('trainings', loading()));
  const { course: c, state: st } = await api(`/my/courses/${id}`);
  const next = st.lessons.find((l) => !l.completed && !l.locked);
  const totalMin = Math.round(st.lessons.reduce((a, l) => a + (l.duration || 0) / 60 + (l.pages || (l.type === 'text' ? 2 : 0)) * 1.5, 0));
  const testLabel = st.openAttemptId ? 'Testni davom ettirish' : st.submitted ? 'Qayta topshirish' : 'Testni boshlash';
  let cta = '';
  if (st.status === 'completed') cta = `<a class="btn btn-white" href="#/certificate/${c.id}">${I.award}Sertifikat</a>`;
  else if (next) cta = `<a class="btn btn-white" href="#/course/${c.id}/lesson/${next.id}">${st.lessonsDone ? 'Davom ettirish' : 'Boshlash'}${I.next}</a>`;
  else if (st.canStartTest) cta = `<a class="btn btn-white" href="#/course/${c.id}/test">${testLabel}${I.next}</a>`;
  const stBadge = empStatus({ ...c, ...st, status: st.status, best: c.showResult ? st.best : null, lessonsDone: st.lessonsDone, lessonsTotal: st.lessonsTotal }).replace(/badge-(gray|blue|green|red|orange)/, 'badge-white');
  const testLocked = !st.materialsOk;
  render(shell('trainings', `
    <a class="back" href="${state.me.role === 'admin' ? `#/admin/trainings/${c.id}` : '#/trainings'}">${I.back}Treninglar</a>
    <section class="course-hero" style="background:${cover(c.id, c.category)}">
      <div class="row">${stBadge}<span class="badge badge-white">${plural(st.lessonsTotal, 'material')}${st.hasTest ? ' + test' : ''}</span>${totalMin ? `<span class="badge badge-white">~${totalMin} daqiqa</span>` : ''}${c.deadline ? `<span class="badge badge-white">Muddat: ${fmtDeadline(c.deadline)}</span>` : ''}</div>
      <h1 style="margin-top:14px">${esc(c.title)}</h1>
      ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ''}
      <div class="course-hero-foot">
        <div class="pbox"><div class="row between small" style="margin-bottom:8px;font-weight:600"><span style="opacity:.85">Sizning jarayoningiz</span><b>${st.progress}%</b></div>
          <div class="progress" style="height:10px;background:rgba(255,255,255,.22)"><i style="width:${st.progress}%;background:#fff"></i></div></div>
        ${cta}
      </div>
    </section>
    ${st.status === 'failed' && !st.canStartTest ? `<div class="notice amber" style="margin-bottom:16px">${I.info}<div>Urinishlar soni tugadi. Qayta topshirish uchun administratorga murojaat qiling.</div></div>` : ''}
    <div class="card"><div class="card-head"><h2>Trening tarkibi</h2><span class="small muted">${st.lessonsDone}/${st.lessonsTotal} material</span></div>
      <div class="steps">
        ${st.lessons.map((l, i) => {
          const cur = next && l.id === next.id;
          const cls = l.completed ? 'done' : l.locked ? 'locked' : cur ? 'current' : '';
          const icon = l.completed ? I.check : l.locked ? I.lock : MAT[matType(l)].icon;
          const meta = `${matMeta(l)}${l.completed ? ' · ko\'rildi ✓' : cur ? (l.watchedPos ? ' · davom ettiring' : ' · navbatdagi') : ''}`;
          const act = l.locked ? '' : `<div class="act">${c.allowDownload && l.type === 'pdf' ? `<a class="btn btn-sm hide-sm" href="/api/files/${l.id}/download" title="Asl faylni yuklab olish">${I.download}</a>` : ''}<a class="btn btn-sm ${cur ? 'btn-primary' : ''}" href="#/course/${c.id}/lesson/${l.id}">Ko'rish</a></div>`;
          return `<div class="step ${cls}"><div class="step-icon">${icon}</div><div class="step-body"><b>${i + 1}. ${esc(l.title)}</b><span>${meta}</span></div>${act}</div>`;
        }).join('')}
        ${st.hasTest ? (() => {
          const cls = st.passed ? 'done' : testLocked ? 'locked' : !next ? 'current' : '';
          const meta = [`${st.testQuestionCount} savol`, `o'tish bali ${c.passScore}%`, c.timeLimitMin ? `${c.timeLimitMin} daqiqa` : 'vaqt cheklanmagan', st.attemptsLeft === null ? 'urinishlar cheklanmagan' : `${st.attemptsLeft} urinish qoldi`].join(' · ');
          const right = st.passed ? `<a class="badge badge-green" href="#/attempt/${st.bestAttemptId}">${st.best !== null && c.showResult ? st.best + '% · ' : ''}O'tdi</a>`
            : testLocked ? '' : st.canStartTest ? `<div class="act"><a class="btn btn-sm btn-primary" href="#/course/${c.id}/test">${testLabel}</a></div>`
            : st.status === 'failed' ? `<span class="badge badge-red">${st.best !== null && c.showResult ? st.best + '% · ' : ''}O'tmadi</span>` : '';
          return `<div class="step ${cls}"><div class="step-icon">${st.passed ? I.check : testLocked ? I.lock : I.test}</div>
            <div class="step-body"><b>${esc(c.testTitle)}</b><span>${testLocked ? "Materiallarni to'liq ko'rgandan keyin ochiladi · " : ''}${meta}</span></div>${right}</div>`;
        })() : ''}
        ${!st.lessons.length && !st.hasTest ? '<div class="empty">Bu treningda hali materiallar yo\'q</div>' : ''}
      </div>
    </div>`));
}

// ================================================================ xodim: material
async function pageLesson(cid, lid) {
  render(shell('trainings', loading()));
  const { course: c, state: st } = await api(`/my/courses/${cid}`);
  const idx = st.lessons.findIndex((l) => l.id === Number(lid));
  const l = st.lessons[idx];
  if (!l) throw new Error('Material topilmadi');
  if (l.locked) {
    render(shell('trainings', `<a class="back" href="#/course/${c.id}">${I.back}${esc(c.title)}</a><div class="card empty">${I.lock}<h3>Bu material hali yopiq</h3><p>Avval oldingi materiallarni ko'rib chiqing</p></div>`));
    return;
  }
  const next = st.lessons[idx + 1];
  const prev = st.lessons[idx - 1];
  let viewer;
  if (l.type === 'video') viewer = `<div class="player" id="player" oncontextmenu="return false">
      <video playsinline preload="metadata" disablePictureInPicture controlsList="nodownload noplaybackrate" src="/api/files/${l.id}#t=0.1"></video>
      <button class="player-big" data-play aria-label="Ijro etish"></button>
      <div class="player-status"></div>
      <div class="player-bar"><button class="pbtn" data-play aria-label="Ijro/pauza"></button><span class="ptime" id="pt">0:00 / 0:00</span>
        <div class="ptrack" id="ptrack"><div class="pwatched"></div><div class="pplayed"></div><div class="pthumb"></div></div>
        <button class="pbtn" data-mute aria-label="Ovoz"></button><button class="pbtn" data-fs aria-label="To'liq ekran">${I.expand}</button></div>
    </div>
    ${l.completed ? '' : `<div class="card watch-meter"><div class="row between small" style="margin-bottom:6px"><span class="muted">${I.lock.replace('<svg', '<svg width="12" height="12" style="vertical-align:-1px"')} Keyingi material video to'liq ko'rilgandan so'ng ochiladi</span><span>Ko'rildi: <b id="wpct">0%</b></span></div><div class="progress green"><i id="wbar" style="width:0"></i></div></div>`}`;
  else if (l.type === 'pdf') viewer = `<div class="pdf-pages" id="pdf" oncontextmenu="return false"><div class="boot" style="height:300px"><div class="spinner"></div></div></div>`;
  else viewer = `<div class="card text-lesson">${esc(l.content).split(/\n\s*\n/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}</div>`;
  const hint = l.completed ? `<div class="notice green">${I.check}<div>Bu material ko'rib chiqilgan</div></div>`
    : l.type === 'pdf' ? `<div class="notice">${I.info}<div>Hujjatni oxirgi sahifagacha o'qing, so'ng «Tanishdim» tugmasini bosing</div></div>` : '';
  const nextHref = next ? `#/course/${c.id}/lesson/${next.id}` : st.hasTest ? `#/course/${c.id}` : `#/course/${c.id}`;
  const nextLabel = next ? 'Keyingi material' : st.hasTest ? "Testga o'tish" : 'Treningga qaytish';
  render(shell('trainings', `
    ${crumbs([['Treninglar', state.me.role === 'admin' ? '#/admin/trainings' : '#/trainings'], [c.title, `#/course/${c.id}`], [`${idx + 1}-material`]])}
    <div class="row between" style="margin-bottom:14px;align-items:flex-end"><div style="min-width:0"><div class="small muted">${matMeta(l)}</div><h1 style="margin-top:2px">${esc(l.title)}</h1></div>
      ${c.allowDownload && l.type === 'pdf' ? `<a class="btn btn-sm" href="/api/files/${l.id}/download">${I.download}Asl faylni yuklab olish</a>` : ''}</div>
    ${viewer}
    ${l.type !== 'text' && l.content ? `<div class="card card-pad" style="margin-top:12px;white-space:pre-wrap">${esc(l.content)}</div>` : ''}
    <div class="lesson-bar">
      ${prev ? `<a class="btn" href="#/course/${c.id}/lesson/${prev.id}">${I.back}Oldingi</a>` : ''}
      <div class="spacer">${hint}</div>
      <button class="btn btn-primary" id="done" ${l.completed || l.type === 'video' ? 'style="display:none"' : ''} ${l.type === 'pdf' ? 'disabled' : ''}>${I.check}Tanishdim</button>
      <a class="btn ${l.completed ? 'btn-primary' : ''}" id="next" href="${nextHref}" ${l.completed ? '' : 'style="display:none"'}>${nextLabel}${I.next}</a>
    </div>`));
  let completed = l.completed;
  const btn = $('#done');
  const markDone = (msg) => {
    btn.style.display = 'none';
    const n = $('#next'); n.style.display = ''; n.classList.add('btn-primary');
    const h = $('.lesson-bar .notice'); if (h) { h.className = 'notice green'; h.innerHTML = `${I.check}<div>${msg}</div>`; }
  };
  btn.addEventListener('click', async () => {
    if (completed) return;
    try { await api(`/my/lessons/${l.id}/complete`, { method: 'POST' }); completed = true; markDone("Material ko'rib chiqildi"); toast("Material ko'rib chiqildi", 'success'); }
    catch (e) { toastErr(e); }
  });
  if (l.type === 'video') setupPlayer(l, () => {
    if (completed) return;
    completed = true;
    markDone("Video to'liq ko'rildi");
    toast("Video to'liq ko'rildi — keyingi material ochildi", 'success');
  });
  if (l.type === 'pdf') renderPdf(l, () => { if (!completed) btn.disabled = false; });
}

// ================================================================ video pleyer + PDF
const fmtTime = (s) => { s = Math.max(0, Math.floor(s || 0)); return `${Math.floor(s / 60)}:${pad(s % 60)}`; };
function setupPlayer(l, onDone) {
  const box = $('#player');
  const v = $('video', box);
  const track = $('#ptrack');
  const free = l.completed || state.me.role === 'admin';
  let maxT = l.completed ? Infinity : l.watchedPos || 0;
  let done = l.completed;
  let lastSent = 0;
  const dur = () => v.duration || l.duration || 0;
  const setIcons = () => {
    box.classList.toggle('playing', !v.paused);
    $$('[data-play]', box).forEach((b) => { b.innerHTML = v.paused ? I.playFill : I.pause; });
    $('[data-mute]', box).innerHTML = v.muted ? I.mute : I.volume;
  };
  const paint = () => {
    const d = dur(); if (!d || !box.isConnected) return;
    const watched = Math.min(1, (Number.isFinite(maxT) ? maxT : d) / d);
    $('.pwatched', track).style.width = `${watched * 100}%`;
    $('.pplayed', track).style.width = `${(v.currentTime / d) * 100}%`;
    $('.pthumb', track).style.left = `${(v.currentTime / d) * 100}%`;
    $('#pt').textContent = `${fmtTime(v.currentTime)} / ${fmtTime(d)}`;
    const wp = Math.round(watched * 100);
    const wpct = $('#wpct'), wbar = $('#wbar');
    if (wpct) wpct.textContent = `${wp}%`;
    if (wbar) wbar.style.width = `${wp}%`;
  };
  const send = async (force) => {
    if (done || state.me.role === 'admin') return;
    if (!force && Date.now() - lastSent < 4500) return;
    lastSent = Date.now();
    try {
      const r = await api(`/my/lessons/${l.id}/progress`, { method: 'POST', body: { pos: Math.min(maxT, dur()), duration: dur() } });
      if (r.completed && !done) { done = true; maxT = Infinity; paint(); onDone(); }
    } catch { /* tarmoq xatosi — keyingi safar */ }
  };
  v.addEventListener('loadedmetadata', () => {
    if (!free && maxT > 2 && maxT < v.duration - 2) v.currentTime = maxT;
    paint();
  });
  v.addEventListener('timeupdate', () => {
    if (!free && !done) {
      if (v.currentTime > maxT + 2) { v.currentTime = maxT; toast("Videoni oldinga o'tkazib bo'lmaydi"); }
      else if (v.currentTime > maxT) maxT = v.currentTime;
    }
    paint();
    if (!v.paused) send(false);
  });
  v.addEventListener('ratechange', () => { if (!free && !done && v.playbackRate !== 1) v.playbackRate = 1; });
  v.addEventListener('play', setIcons);
  v.addEventListener('pause', () => { setIcons(); send(true); });
  v.addEventListener('ended', () => { maxT = Math.max(maxT, dur()); send(true); setIcons(); });
  v.addEventListener('volumechange', setIcons);
  // tarmoq uzilsa yoki server qayta ishga tushsa — avtomatik qayta ulanish
  let retries = 0;
  const status = (html) => { const s = $('.player-status', box); s.innerHTML = html || ''; s.classList.toggle('on', !!html); };
  const reload = () => {
    const at = v.currentTime || (Number.isFinite(maxT) ? maxT : 0);
    const wasPlaying = !v.paused || box.dataset.want === '1';
    v.src = `/api/files/${l.id}?r=${Date.now()}`;
    v.load();
    v.addEventListener('loadedmetadata', () => { v.currentTime = Math.min(at, free || done ? at : maxT); if (wasPlaying) v.play().catch(() => {}); }, { once: true });
  };
  v.addEventListener('error', () => {
    if (!box.isConnected) return;
    if (retries < 4) {
      retries++;
      status(`<div class="spinner"></div><span>Ulanish tiklanmoqda...</span>`);
      setTimeout(reload, 1200 * retries);
    } else {
      status(`<span>Videoni yuklab bo'lmadi. Internet aloqasini tekshiring.</span><button class="btn btn-sm btn-white" data-retry>Qayta urinish</button>`);
      $('[data-retry]', box).addEventListener('click', () => { retries = 0; status(`<div class="spinner"></div>`); reload(); });
    }
  });
  v.addEventListener('waiting', () => status(`<div class="spinner"></div>`));
  v.addEventListener('playing', () => { retries = 0; status(''); });
  v.addEventListener('canplay', () => { if (!v.error) status(''); });
  const toggle = () => {
    if (v.paused) {
      box.dataset.want = '1';
      v.play().catch((e) => { if (e.name !== 'AbortError') toast("Videoni ijro etib bo'lmadi: " + e.message, 'error'); });
    } else { box.dataset.want = ''; v.pause(); }
  };
  $$('[data-play]', box).forEach((b) => b.addEventListener('click', toggle));
  v.addEventListener('click', toggle);
  $('[data-mute]', box).addEventListener('click', () => { v.muted = !v.muted; });
  $('[data-fs]', box).addEventListener('click', () => {
    if (document.fullscreenElement) return document.exitFullscreen();
    if (box.requestFullscreen) return box.requestFullscreen().catch(() => v.webkitEnterFullscreen?.());
    v.webkitEnterFullscreen?.(); // iPhone Safari
  });
  track.addEventListener('click', (e) => {
    const r = track.getBoundingClientRect();
    const t = ((e.clientX - r.left) / r.width) * dur();
    if (free || done || t <= maxT + 0.5) v.currentTime = t;
    else toast("Faqat ko'rilgan qismga qaytish mumkin");
  });
  const onKey = (e) => {
    if (e.target.closest('input, textarea')) return;
    if (e.code === 'Space') { e.preventDefault(); toggle(); }
    if (e.code === 'ArrowRight' && !free && !done) e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  const onVis = () => { if (document.hidden && !v.paused && !done) v.pause(); };
  document.addEventListener('visibilitychange', onVis);
  setIcons(); paint();
  onCleanup(() => {
    send(true);
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('visibilitychange', onVis);
    v.pause(); v.removeAttribute('src'); v.load();
  });
}

async function renderPdf(l, onEnd) {
  const box = $('#pdf');
  let alive = true;
  onCleanup(() => { alive = false; });
  try {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
    const lib = window.pdfjsLib;
    lib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
    const doc = await lib.getDocument({ url: `/api/files/${l.id}`, withCredentials: true }).promise;
    if (!alive) return;
    box.innerHTML = '';
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.min(box.clientWidth - 32, 1100);
    const holders = [];
    for (let p = 1; p <= doc.numPages; p++) {
      const h = document.createElement('div'); h.className = 'pg'; h.dataset.p = p;
      h.innerHTML = `<div style="height:${Math.round(width * 0.7)}px"></div>`;
      box.appendChild(h); holders.push(h);
    }
    const counter = document.createElement('div');
    counter.className = 'small muted';
    counter.textContent = `${doc.numPages} sahifa`;
    box.before(counter);
    counter.style.marginBottom = '8px';
    const rendered = new Set();
    const draw = async (h) => {
      const p = Number(h.dataset.p);
      if (rendered.has(p) || !alive) return;
      rendered.add(p);
      const page = await doc.getPage(p);
      const base = page.getViewport({ scale: 1 });
      const scale = (width / base.width) * dpr;
      const vp = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = vp.width; canvas.height = vp.height;
      canvas.style.width = `${vp.width / dpr}px`;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
      if (!alive) return;
      h.innerHTML = ''; h.appendChild(canvas);
    };
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        const h = e.target; draw(h);
        const n = Number(h.dataset.p);
        if (holders[n]) draw(holders[n]);
        counter.textContent = `${n} / ${doc.numPages} sahifa`;
        if (n === doc.numPages) onEnd();
      }
    }, { root: box, threshold: 0.15 });
    holders.forEach((h) => io.observe(h));
    onCleanup(() => io.disconnect());
    if (doc.numPages === 1) onEnd();
  } catch (e) {
    if (!alive) return;
    box.innerHTML = `<div class="empty">${I.file}<h3>Hujjatni ko'rsatib bo'lmadi</h3><p><a href="/api/files/${l.id}" target="_blank">Yangi oynada ochish</a></p></div>`;
    onEnd();
  }
}


// ================================================================ test: proktoring
const VIOLATION_TEXT = {
  tab_hidden: "Boshqa oyna yoki tabga o'tdingiz", blur: 'Test oynasidan chiqdingiz', fullscreen_exit: "To'liq ekran rejimidan chiqdingiz",
  printscreen: 'Skrinshot olishga urinish aniqlandi', copy: 'Nusxa olishga urinish aniqlandi', print: 'Chop etishga urinish aniqlandi', camera_off: "Kamera o'chirildi",
};
const fsSupported = () => !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Brauzeringiz kamerani qo'llab-quvvatlamaydi");
  try { return await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false }); }
  catch (e) {
    if (e.name === 'NotAllowedError') throw new Error('Kameraga ruxsat berilmadi. Manzil satridagi kamera belgisini bosib, ruxsat bering');
    if (e.name === 'NotFoundError') throw new Error('Kamera topilmadi');
    throw new Error("Kamerani yoqib bo'lmadi: " + e.message);
  }
}
function precheck(c, st, resuming) {
  return new Promise((resolve) => {
    let stream = null;
    const needCam = c.proctorCamera, needScreen = c.proctorScreen;
    render(shell('tests', `
      ${crumbs([['Testlar', '#/tests'], [c.testTitle]])}
      <div class="precheck">
        <div class="card card-pad stack">
          <div><span class="badge badge-blue">${resuming ? 'Testni davom ettirish' : 'Testdan oldin'}</span><h1 style="margin-top:10px">${esc(c.testTitle)}</h1><p class="muted" style="margin-top:4px">Boshlashdan oldin shartlar bilan tanishing</p></div>
          <div class="pc-facts"><div><b>${st.testQuestionCount}</b><span>savol</span></div><div><b>${c.timeLimitMin ? c.timeLimitMin + ' daq' : '∞'}</b><span>vaqt</span></div><div><b>${c.passScore}%</b><span>o'tish bali</span></div><div><b>${st.attemptsLeft === null ? '∞' : st.attemptsLeft}</b><span>urinish qoldi</span></div></div>
          <ul class="rules">
            ${needScreen ? `<li><span class="ri">${I.monitor}</span><div><b>To'liq ekran rejimi</b><p>Boshqa oyna yoki tabga o'tish, skrinshot va nusxa olish urinishlari qayd etiladi.</p></div></li>` : ''}
            ${needScreen && c.maxViolations ? `<li><span class="ri warn">${I.alert}</span><div><b>${c.maxViolations} ta qoidabuzarlik — test yakunlanadi</b><p>Limitga yetganda test javoblaringiz bilan avtomatik topshiriladi.</p></div></li>` : ''}
            ${needCam ? `<li><span class="ri">${I.camera}</span><div><b>Kamera yoqilgan bo'lishi shart</b><p>Test davomida vaqti-vaqti bilan surat olinadi va faqat administratorga ko'rinadi.</p></div></li>` : ''}
            <li><span class="ri">${I.info}</span><div><b>Javoblar avtomatik saqlanadi</b><p>Internet uzilsa ham davom ettirishingiz mumkin.${c.timeLimitMin ? " Vaqt tugaganda test o'zi topshiriladi." : ''}</p></div></li>
          </ul>
          <label class="check notice" style="background:var(--surface-2);color:var(--text-2)"><input type="checkbox" id="agree"><span>Shartlar bilan tanishdim${needCam ? ' va kamera orqali surat olinishiga roziman' : ''}</span></label>
          <button class="btn btn-primary btn-lg btn-block" id="go" disabled>${resuming ? 'Davom ettirish' : 'Testni boshlash'}</button>
        </div>
        ${needCam ? `<div class="card"><div class="cam-view" id="camview"><div class="cam-empty">${I.camera}<span>Kamera o'chiq</span></div></div>
          <div class="card-pad stack" style="gap:10px"><div class="row between"><b>Kamera tekshiruvi</b><span class="badge badge-gray" id="camstate">Kutilmoqda</span></div>
          <p class="small muted">Yuzingiz kadrda aniq ko'rinsin, xona yorug' bo'lsin.</p><button class="btn btn-block" id="camon">${I.camera}Kamerani yoqish</button></div></div>` : ''}
      </div>`));
    const go = $('#go'), agree = $('#agree');
    const update = () => { go.disabled = !(agree.checked && (!needCam || stream)); };
    agree.addEventListener('change', update);
    if (needCam) $('#camon').addEventListener('click', async () => {
      try {
        stream = await startCamera();
        const vid = Object.assign(document.createElement('video'), { autoplay: true, muted: true, playsInline: true, srcObject: stream });
        $('#camview').innerHTML = ''; $('#camview').appendChild(vid);
        $('#camstate').className = 'badge badge-green'; $('#camstate').textContent = 'Ishlayapti';
        $('#camon').style.display = 'none';
        update();
      } catch (e) { toastErr(e); $('#camstate').className = 'badge badge-red'; $('#camstate').textContent = 'Xato'; }
    });
    onCleanup(() => { if (stream && !go.dataset.used) stream.getTracks().forEach((t) => t.stop()); });
    go.addEventListener('click', async () => {
      go.dataset.used = '1';
      if (needScreen && fsSupported()) { try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { /* ignore */ } }
      resolve(stream);
    });
  });
}

// ================================================================ test: topshirish (bitta savol — bitta ekran)
async function pageTest(cid) {
  render(shell('tests', loading()));
  const { course: c, state: st } = await api(`/my/courses/${cid}`);
  if (!st.openAttemptId && !st.canStartTest) {
    toast(st.passed ? "Siz bu testdan allaqachon o'tgansiz" : !st.materialsOk ? "Avval trening materiallarini to'liq ko'rib chiqing" : 'Urinishlar soni tugagan', 'error');
    location.hash = `#/course/${cid}`;
    return;
  }
  let stream = null;
  if ((c.proctorCamera || c.proctorScreen) && state.me.role !== 'admin') stream = await precheck(c, st, !!st.openAttemptId);
  let a;
  try { a = await api(`/my/courses/${cid}/attempts`, { method: 'POST' }); }
  catch (e) { stream?.getTracks().forEach((t) => t.stop()); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); toastErr(e); location.hash = `#/course/${cid}`; return; }
  const P = a.proctor;
  const watchScreen = P.screen && state.me.role !== 'admin';
  const key = `att:${a.id}`;
  const saved = store(key) || {};
  const answers = saved.answers || {};
  let idx = Math.min(saved.idx || 0, a.questions.length - 1);
  const total = a.questions.length;
  const offset = Date.parse(a.serverNow) - Date.now();
  const stamp = `${state.me.name} · +${state.me.phone} · ${fmtDateTime(new Date().toISOString())}`;
  const answered = () => Object.values(answers).filter((v) => v.length).length;
  const persist = () => store(key, { answers, idx });

  document.body.classList.add('exam-mode');
  render(shell('tests', `
    <div class="exam">
      <div class="exam-top">
        <div class="bar1"><button class="icon-btn bordered" id="quit" aria-label="Chiqish">${I.x}</button><div class="ttl ellipsis">${esc(a.testTitle)}</div>
          ${watchScreen ? `<span class="badge badge-gray" id="vcount" title="Qoidabuzarliklar">${I.shield} ${P.violations}${P.maxViolations ? '/' + P.maxViolations : ''}</span>` : ''}
          ${a.deadlineAt ? `<span class="timer">${I.clock}<span id="timer">--:--</span></span>` : ''}</div>
        <div class="bar2"><button id="qpos"></button><span id="qcnt"></span></div>
        ${progressBar(0)}
      </div>
      <div class="exam-wrap">
        <div class="watermark" aria-hidden="true">${Array.from({ length: 30 }, () => `<span>${esc(stamp)}</span>`).join('')}</div>
        <div class="card q-card" id="qbox"></div>
      </div>
      <div class="exam-note">${I.info}<span>Javoblar avtomatik saqlanadi. Internet uzilsa ham davom ettirishingiz mumkin.</span></div>
      <div class="exam-nav"><button class="btn" id="prev">${I.back}Oldingi</button><button class="btn btn-primary" id="nextq"></button></div>
    </div>
    ${stream ? `<div class="cam-float" id="camfloat"><span class="rec">REC</span></div>` : ''}
    <div class="shield-screen" id="shield"><div>${I.shield}<b>Test himoyalangan</b><span>Davom etish uchun test oynasiga qayting</span></div></div>
    <div class="fs-lock" id="fslock"><div class="card card-pad stack" style="max-width:400px;text-align:center"><h2>To'liq ekran rejimiga qayting</h2><p class="muted">Test faqat to'liq ekranda davom etadi. Bu holat qayd etildi.</p><button class="btn btn-primary" id="fsback">To'liq ekranga qaytish</button></div></div>`));

  const draw = () => {
    const q = a.questions[idx];
    const sel = answers[q.id] || [];
    $('#qbox').innerHTML = `<span class="qn">${idx + 1}</span><h2>${esc(q.text)}</h2><p class="hint">${q.multi ? 'Bir nechta javobni tanlang' : 'Bitta javobni tanlang'}</p>
      ${q.options.map((o, j) => `<label class="option"><input type="${q.multi ? 'checkbox' : 'radio'}" name="opt" value="${j}" ${sel.includes(j) ? 'checked' : ''}><span class="letter">${'ABCDEFGH'[j]}</span><span>${esc(o)}</span></label>`).join('')}`;
    $('#qpos').textContent = `${idx + 1}-savol / ${total}`;
    $('#qcnt').textContent = `${answered()} ta javob berildi`;
    $('.exam-top .progress > i').style.width = `${((idx + 1) / total) * 100}%`;
    $('#prev').disabled = idx === 0;
    $('#nextq').innerHTML = idx === total - 1 ? `${I.check}Testni yakunlash` : `Keyingi savol${I.next}`;
  };
  $('#qbox').addEventListener('change', () => {
    const q = a.questions[idx];
    answers[q.id] = $$('#qbox input:checked').map((x) => Number(x.value));
    persist();
    $('#qcnt').textContent = `${answered()} ta javob berildi`;
  });
  const go = (i) => { idx = Math.max(0, Math.min(total - 1, i)); persist(); draw(); window.scrollTo(0, 0); };
  $('#prev').addEventListener('click', () => go(idx - 1));
  $('#nextq').addEventListener('click', () => (idx === total - 1 ? submit(false) : go(idx + 1)));
  $('#qpos').addEventListener('click', () => openModal({
    title: 'Savollar', sub: `${answered()} / ${total} ta javob berildi`,
    body: `<div class="qgrid">${a.questions.map((q, i) => `<button class="${(answers[q.id] || []).length ? 'ans' : ''} ${i === idx ? 'cur' : ''}" data-i="${i}">${i + 1}</button>`).join('')}</div>`,
    onMount: (m, close) => $$('[data-i]', m).forEach((b) => b.addEventListener('click', () => { close(); go(Number(b.dataset.i)); })),
  }));
  $('#quit').addEventListener('click', async () => {
    if (await confirmBox('Testdan chiqasizmi?', "Javoblaringiz saqlanadi, lekin vaqt to'xtamaydi. Keyinroq davom ettirishingiz mumkin.", 'Chiqish')) location.hash = `#/course/${cid}`;
  });
  draw();

  // kamera
  let camVid = null, snapTimer = null;
  const snap = (kind) => new Promise((resolve) => {
    if (!camVid || !camVid.videoWidth || stream?.getVideoTracks()[0]?.readyState !== 'live') return resolve();
    const cv = document.createElement('canvas');
    cv.width = 480; cv.height = Math.round(480 * camVid.videoHeight / camVid.videoWidth);
    const g = cv.getContext('2d');
    g.drawImage(camVid, 0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, cv.height - 22, cv.width, 22);
    g.fillStyle = '#fff'; g.font = '12px sans-serif'; g.fillText(`${state.me.name} · ${new Date().toLocaleString('ru-RU')}`, 8, cv.height - 7);
    cv.toBlob((b) => { if (!b) return resolve(); const fd = new FormData(); fd.append('kind', kind); fd.append('image', b, 'snap.jpg'); uploadForm(`/my/attempts/${a.id}/snapshots`, fd).catch(() => {}).finally(resolve); }, 'image/jpeg', 0.72);
  });
  if (stream) {
    camVid = Object.assign(document.createElement('video'), { autoplay: true, muted: true, playsInline: true, srcObject: stream });
    $('#camfloat').prepend(camVid);
    const schedule = () => { snapTimer = setTimeout(() => { snap('periodic'); schedule(); }, 20000 + Math.random() * 20000); };
    camVid.addEventListener('loadeddata', () => setTimeout(() => snap('start'), 800), { once: true });
    schedule();
    stream.getVideoTracks().forEach((t) => t.addEventListener('ended', () => violation('camera_off')));
  }

  let sent = false;
  const finish = () => {
    sent = true;
    document.body.classList.remove('exam-mode', 'shielded');
    clearTimeout(snapTimer);
    stream?.getTracks().forEach((t) => t.stop());
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  async function submit(force, reason) {
    if (sent) return;
    const left = total - answered();
    if (!force && !(await confirmBox('Testni yakunlaysizmi?', left ? `<b>${left} ta savolga</b> javob berilmagan — ular noto'g'ri hisoblanadi.` : "Barcha savollarga javob berdingiz. Yakunlagandan keyin javoblarni o'zgartirib bo'lmaydi.", 'Yakunlash'))) return;
    sent = true;
    try {
      if (stream) await snap('finish');
      const r = await api(`/my/attempts/${a.id}/submit`, { method: 'POST', body: { answers, reason } });
      store(key, null);
      finish();
      location.hash = `#/attempt/${r.id}`;
    } catch (e) { sent = false; toastErr(e); }
  }

  // qoidabuzarliklar
  let lastV = 0;
  async function violation(type, detail = '') {
    if (sent || (!watchScreen && type !== 'camera_off')) return;
    if (Date.now() - lastV < 1500) return;
    lastV = Date.now();
    if (stream && type !== 'camera_off') snap('violation');
    try {
      const r = await api(`/my/attempts/${a.id}/events`, { method: 'POST', body: { type, detail } });
      if (r.finished) return;
      const vc = $('#vcount');
      if (vc) { vc.className = 'badge badge-red'; vc.innerHTML = `${I.shield} ${r.count}${r.max ? '/' + r.max : ''}`; }
      if (r.limitReached) { toast('Qoidabuzarliklar limiti tugadi — test avtomatik topshirildi', 'error'); submit(true, 'violations'); return; }
      openModal({
        title: 'Ogohlantirish',
        body: `<div class="warn-box">${I.alert}<div><b>${VIOLATION_TEXT[type] || 'Qoidabuzarlik'}</b><p>Bu holat qayd etildi va administratorga ko'rinadi.${r.max ? ` Qoidabuzarliklar: <b>${r.count} / ${r.max}</b>. Limitga yetganda test avtomatik yakunlanadi.` : ''}</p></div></div>`,
        foot: '<button class="btn btn-primary" data-close>Tushundim, davom etaman</button>',
      });
    } catch { /* ignore */ }
  }
  const listeners = [];
  const on = (t, ev, fn, opt) => { t.addEventListener(ev, fn, opt); listeners.push(() => t.removeEventListener(ev, fn, opt)); };
  const shield = (v) => document.body.classList.toggle('shielded', v);
  on(document, 'contextmenu', (e) => e.preventDefault());
  on(document, 'selectstart', (e) => { if (!e.target.closest?.('input, textarea')) e.preventDefault(); });
  on(document, 'copy', (e) => { e.preventDefault(); violation('copy'); });
  on(document, 'cut', (e) => { e.preventDefault(); violation('copy'); });
  on(window, 'beforeprint', () => violation('print'));
  const prtsc = () => { shield(true); violation('printscreen'); try { navigator.clipboard.writeText(' '); } catch { /* ignore */ } setTimeout(() => shield(false), 1500); };
  on(document, 'keydown', (e) => {
    const k = e.key || '';
    if (k === 'PrintScreen') prtsc();
    if (k === 'Meta' || k === 'OS') shield(true);
    const mod = e.ctrlKey || e.metaKey;
    if (mod && ['p', 's', 'c', 'u', 'a'].includes(k.toLowerCase())) { e.preventDefault(); if (k.toLowerCase() === 'p') violation('print'); if (k.toLowerCase() === 'c') violation('copy'); }
    if (k === 'F12' || (mod && e.shiftKey && ['i', 'j', 'c', 's'].includes(k.toLowerCase()))) { e.preventDefault(); if (k.toLowerCase() === 's') { shield(true); violation('printscreen', 'Win/Cmd+Shift+S'); } }
  }, true);
  on(document, 'keyup', (e) => {
    if (e.key === 'PrintScreen') prtsc();
    if (e.key === 'Meta' || e.key === 'OS') setTimeout(() => { if (document.hasFocus()) shield(false); }, 600);
  }, true);
  if (watchScreen) {
    on(document, 'visibilitychange', () => { if (document.hidden) { shield(true); violation('tab_hidden'); } });
    on(window, 'blur', () => { shield(true); setTimeout(() => { if (!document.hasFocus() && !sent) violation('blur'); }, 300); });
    on(window, 'focus', () => shield(false));
    if (fsSupported()) {
      on(document, 'fullscreenchange', () => { const out = !document.fullscreenElement && !sent; $('#fslock').classList.toggle('on', out); if (out) violation('fullscreen_exit'); });
      $('#fsback').addEventListener('click', () => document.documentElement.requestFullscreen().catch(() => {}));
      if (!document.fullscreenElement) $('#fslock').classList.add('on');
    }
  } else { on(window, 'blur', () => shield(true)); on(window, 'focus', () => shield(false)); }

  if (a.deadlineAt) {
    const end = Date.parse(a.deadlineAt);
    const tick = () => {
      const ms = end - (Date.now() + offset);
      const t = $('#timer'); if (!t) return;
      const s = Math.max(0, Math.ceil(ms / 1000));
      t.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
      t.parentElement.classList.toggle('warn', s <= 60);
      if (ms <= 0) { clearInterval(iv); toast('Vaqt tugadi — test topshirilmoqda'); submit(true, 'timeout'); }
    };
    const iv = setInterval(tick, 500); tick();
    onCleanup(() => clearInterval(iv));
  }
  const beforeUnload = (e) => { if (!sent) { e.preventDefault(); e.returnValue = ''; } };
  window.addEventListener('beforeunload', beforeUnload);
  onCleanup(() => {
    window.removeEventListener('beforeunload', beforeUnload);
    listeners.forEach((off) => off());
    if (!sent) { clearTimeout(snapTimer); stream?.getTracks().forEach((t) => t.stop()); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); }
    document.body.classList.remove('exam-mode', 'shielded');
  });
}

// ================================================================ natija
function reviewHtml(review, { onlyWrong = false, labels = ['Sizning javobingiz', "To'g'ri javob"] } = {}) {
  return review.filter((x) => !onlyWrong || !x.isCorrect).map((x) => `<div class="rv">
    <div class="rv-head">${x.n}-savol ${x.isCorrect ? `<span class="badge badge-green">${I.check}To'g'ri</span>` : `<span class="badge badge-red">${I.x}Noto'g'ri</span>`}${x.multi ? '<span class="badge badge-gray">bir nechta javob</span>' : ''}</div>
    <h3>${esc(x.text)}</h3>
    ${x.options.map((o, i) => {
      const isC = x.correct.includes(i), ch = x.chosen.includes(i);
      const cls = isC ? 'ok' : ch ? 'bad' : 'none';
      const tag = isC && ch ? `${labels[0]} · to'g'ri` : isC ? labels[1] : ch ? labels[0] : '';
      return `<div class="rv-opt ${cls}">${isC ? I.check : ch ? I.x : I.check}<span>${esc(o)}</span>${tag ? `<span class="tag">${tag}</span>` : ''}</div>`;
    }).join('')}
    ${!x.chosen.length ? '<div class="small muted" style="margin-top:6px">Javob berilmagan</div>' : ''}
  </div>`).join('');
}
async function pageResult(id) {
  render(shell('results', loading()));
  const r = await api(`/my/attempts/${id}`);
  if (r.open) { location.hash = `#/course/${r.courseId}/test`; return; }
  const first = state.me.name.split(' ')[0];
  if (!r.showResult) {
    render(shell('results', `<div class="card result"><div class="list-ic" style="margin:0 auto;width:56px;height:56px">${I.checkCircle}</div><h1>Test topshirildi</h1>
      <p class="lead">«${esc(r.testTitle)}» javoblaringiz administratorga yuborildi. Natija keyinroq e'lon qilinadi.</p>
      <div class="stack" style="gap:8px;margin-top:20px"><a class="btn btn-block" href="#/results">Mening natijalarim</a><a class="btn btn-primary btn-block" href="#/">Bosh sahifaga qaytish</a></div></div>`));
    return;
  }
  const color = r.passed ? '#10a56f' : '#e5484d';
  const C = 2 * Math.PI * 64;
  render(shell('results', `
    <div class="card result">
      <div class="score-ring"><svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="64" stroke="#e8edf5" stroke-width="11" fill="none"/>
        <circle cx="75" cy="75" r="64" stroke="${color}" stroke-width="11" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - r.score / 100)}"/></svg>
        <div class="in"><b>${r.score}%</b><span>${r.correct} / ${r.total} to'g'ri</span></div></div>
      ${r.passed ? `<span class="badge badge-green">${I.check}Testdan o'tdingiz</span>` : `<span class="badge badge-red">${I.x}O'tmadingiz (kerak: ${r.passScore}%)</span>`}
      <h1>${r.passed ? `Tabriklaymiz, ${esc(first)}!` : `${esc(first)}, bu safar o'xshamadi`}</h1>
      <p class="lead">«${esc(r.testTitle)}» ${r.passed ? 'muvaffaqiyatli yakunlandi' : 'yakunlandi'}. Natijangiz administratorga yuborildi.${r.autoSubmitted ? ` <br><b>Test avtomatik topshirildi: ${r.autoSubmitted === 'violations' ? 'qoidabuzarliklar limiti' : 'vaqt tugadi'}.</b>` : ''}</p>
      <div class="result-stats"><div><span>O'tish bali</span><b>${r.passScore}%</b></div><div><span>Vaqt</span><b>${fmtMin(r.durationSec)}</b></div><div><span>Urinish</span><b>${r.attemptNumber}${r.attemptsLimit ? ' / ' + r.attemptsLimit : ''}</b></div></div>
      ${!r.passed ? `<p class="small muted" style="margin-bottom:12px">${r.canRetry ? `Yana ${r.attemptsLeft ?? ''} ta urinish bor — materiallarni takrorlab, qayta topshiring.` : 'Urinishlar tugadi. Qayta topshirish uchun administratorga murojaat qiling.'}</p>` : ''}
      <div class="stack" style="gap:8px">
        ${r.passed ? `<a class="btn btn-soft btn-block" href="#/certificate/${r.courseId}">${I.award}Sertifikatni ko'rish</a>` : r.canRetry ? `<a class="btn btn-soft btn-block" href="#/course/${r.courseId}">Materiallarni takrorlash</a>` : ''}
        <a class="btn btn-block" href="#/results">Mening natijalarim</a>
        <a class="btn btn-primary btn-block" href="${state.me.role === 'admin' ? '#/admin' : '#/'}">Bosh sahifaga qaytish</a>
      </div>
    </div>
    ${r.review ? `<div class="section-title" style="max-width:760px;margin-left:auto;margin-right:auto"><h2>Javoblaringiz</h2></div><div class="card" style="max-width:760px;margin:0 auto">${reviewHtml(r.review)}</div>` : ''}`));
}
async function pageCertificate(cid) {
  $app.innerHTML = loading();
  const c = await api(`/my/certificate/${cid}`);
  $app.innerHTML = `<div class="cert-wrap">
    <div class="cert-tools"><a class="btn" href="#/results">${I.back}Orqaga</a><span class="spacer"></span><button class="btn btn-primary" onclick="window.print()">${I.print}Chop etish / PDF</button></div>
    <div class="cert">
      <div class="cert-brand"><span class="brand-logo">${I.logo}</span>${esc(c.appName)}${c.companyName ? ' · ' + esc(c.companyName) : ''}</div>
      <h1>SERTIFIKAT</h1><div class="lead">Ushbu sertifikat shuni tasdiqlaydiki</div>
      <div class="name">${esc(c.name)}</div><div class="lead">quyidagi o'quv treningini muvaffaqiyatli tamomladi:</div>
      <div class="course">«${esc(c.courseTitle)}»</div>
      <div class="cert-foot"><div style="text-align:left"><b>${fmtDate(c.completedAt)}</b>Sana${c.score !== null ? `<b style="margin-top:8px">${c.score}%</b>Natija` : ''}</div>
        <div class="seal">${I.award}</div><div style="text-align:right"><b>№ ${esc(c.number)}</b>Sertifikat raqami</div></div>
    </div></div>`;
}

// ================================================================ profil + Telegram
async function pageProfile() {
  render(shell('profile', loading()));
  const tgs = await api('/my/telegram').catch(() => null);
  const u = state.me;
  render(shell('profile', `
    <div class="page-head"><div><h1>Profil</h1></div></div>
    <div class="grid grid-2" style="align-items:start">
      <div class="stack">
        <div class="card card-pad"><div class="user-cell">${avatar(u.name, 'lg')}<div><b style="font-size:16px">${esc(u.name)}</b><div class="small muted">${fmtPhone(u.phone)}</div></div></div>
          <div class="grid grid-2" style="margin-top:16px;gap:10px"><div><div class="label">Bo'lim</div><div>${esc(u.department) || '—'}</div></div><div><div class="label">Lavozim</div><div>${esc(u.position) || '—'}</div></div></div></div>
        ${tgs ? `<div class="card card-pad stack" style="gap:12px" id="tgcard">
          <div class="row" style="flex-wrap:nowrap"><span class="list-ic" style="background:#e8f4fd;color:#229ed9">${I.telegram}</span><div style="flex:1"><b>Telegram bildirishnomalar</b>
            <div class="small muted">${tgs.linked ? `Ulangan: <b class="green">${esc(tgs.username ? '@' + tgs.username.replace(/^@/, '') : 'Telegram')}</b>` : 'Yangi treninglar, muddatlar va natijalar haqida xabar oling'}</div></div></div>
          ${!tgs.enabled ? '<div class="notice amber">' + I.info + '<div>Telegram bot hozircha sozlanmagan</div></div>'
            : tgs.linked ? `<div class="row"><a class="btn btn-sm" href="https://t.me/${esc(tgs.botUsername)}" target="_blank" rel="noopener">${I.telegram}Botni ochish</a><button class="btn btn-sm btn-danger" id="tgoff">Uzish</button><button class="btn btn-sm btn-ghost" id="tgon">Boshqa raqamga ulash</button></div>`
            : `<button class="btn btn-primary" id="tgon" style="background:#229ed9;border-color:#229ed9">${I.telegram}Telegramni ulash</button><p class="hint">Bot ochiladi — «Start» tugmasini bosing. Istalgan raqamdagi Telegram akkauntingizni ulashingiz mumkin.</p>`}
        </div>` : ''}
      </div>
      <form class="card card-pad stack" id="pf">
        <h2>Parolni o'zgartirish</h2>
        <div class="field"><label>Joriy parol</label><input class="input" type="password" name="oldPassword" required autocomplete="current-password"></div>
        <div class="field"><label>Yangi parol</label><input class="input" type="password" name="newPassword" minlength="6" required autocomplete="new-password"><span class="hint">Kamida 6 belgi</span></div>
        <div><button class="btn btn-primary" type="submit">Saqlash</button></div>
      </form>
    </div>
    <button class="btn btn-danger btn-lg" style="margin-top:16px;width:100%;max-width:420px" data-logout>${I.logout}Tizimdan chiqish</button>`));
  $('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await api('/me/password', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); toast("Parol o'zgartirildi", 'success'); e.target.reset(); } catch (err) { toastErr(err); }
  });
  $('#tgon')?.addEventListener('click', async () => {
    try {
      const r = await api('/my/telegram/link', { method: 'POST' });
      window.open(r.url, '_blank', 'noopener');
      openModal({
        title: 'Telegramni ulash',
        body: `<div class="stack" style="gap:12px"><p class="muted">Telegram'da <b>@${esc(r.botUsername)}</b> boti ochildi. «Start» tugmasini bosing — ulanish avtomatik bo'ladi.</p>
          <a class="btn btn-primary btn-block" href="${esc(r.url)}" target="_blank" rel="noopener" style="background:#229ed9;border-color:#229ed9">${I.telegram}Botni ochish</a>
          <p class="hint">Havola 24 soat amal qiladi. Telefoningizda ochilmasa, havolani nusxalab Telegram'ga yuboring.</p>
          <button class="btn btn-sm" id="cp">${I.copy}Havolani nusxalash</button></div>`,
        foot: '<button class="btn btn-primary" data-close id="tgdone">Uladim</button>',
        onMount: (m) => { $('#cp', m).addEventListener('click', () => copyText(r.url)); $('#tgdone', m).addEventListener('click', () => router()); },
      });
    } catch (e) { toastErr(e); }
  });
  $('#tgoff')?.addEventListener('click', async () => {
    if (!(await confirmBox('Telegramni uzasizmi?', 'Bildirishnomalar Telegram orqali kelmay qoladi.', 'Uzish', true))) return;
    await api('/my/telegram', { method: 'DELETE' }); toast('Telegram uzildi'); router();
  });
}

// ================================================================ admin: bosh sahifa
const dashFilters = { weeks: 12, department: '', courseId: 0 };
async function adminDashboard() {
  render(adminShell('dash', loading()));
  const qs = new URLSearchParams({ weeks: dashFilters.weeks, department: dashFilters.department, courseId: dashFilters.courseId }).toString();
  const [d, deps] = await Promise.all([api('/admin/dashboard?' + qs), api('/admin/departments')]);
  const allCourses = await api('/admin/courses');
  const tests = allCourses.filter((c) => c.questionTotal > 0 && c.published);
  const seg = [['O\'tdi', d.passed, '#10a56f', I.check], ['Hali topshirilmagan', d.pending, '#64748b', ''], ["Muddati o'tgan", d.overdue, '#ea580c', I.clock], ["O'tmadi", d.failed, '#e5484d', I.x]];
  const labels = d.weekly.map((w) => { const t = new Date(w.weekStart); t.setDate(t.getDate() + 7); return `${pad(t.getDate())}.${pad(t.getMonth() + 1)}`; });
  const passScore = dashFilters.courseId ? (allCourses.find((c) => c.id === dashFilters.courseId)?.passScore || 70) : 70;
  const low = d.histogram.filter((b) => b.to < passScore).reduce((a, b) => a + b.count, 0);
  const near = d.histogram.filter((b) => b.from >= passScore - 10 && b.to < passScore).reduce((a, b) => a + b.count, 0);
  const minY = Math.max(0, Math.min(60, ...d.weekly.flatMap((w) => [w.avgScore, w.passRate]).filter((v) => v !== null).map((v) => Math.floor(v / 10) * 10 - 10)));
  render(adminShell('dash', `
    <section class="hero"><div class="hero-row">
      <div style="flex:1;min-width:260px">
        <span class="badge badge-white">Boshqaruv paneli · ${fmtDateTime(d.updatedAt)} holatiga</span>
        <h1 style="margin-top:12px">Salom, ${esc(state.me.name.split(' ')[0])}!</h1>
        <p style="margin-top:8px;max-width:560px">${d.assignments ? `Tayinlangan testlarning <b>${d.completionRate}%</b> qismi topshirildi: ${d.assignments} ta tayinlovdan ${d.submitted} tasi.${d.overdue ? ` <b>${d.overdue} ta</b> tayinlovning muddati o'tgan.` : ''}` : "Birinchi treningni yarating va xodimlarga tayinlang."}</p>
        <div class="row" style="margin-top:20px"><button class="btn btn-white" data-assign>${I.userPlus}Test tayinlash</button><a class="btn btn-glass" href="/api/admin/report.xlsx?${qs}">${I.download}Hisobot (Excel)</a></div>
      </div>
      ${ring(d.completionRate, 'bajarildi', 140)}
    </div></section>
    <div class="row" style="margin-bottom:16px">
      <select class="input" id="fw" style="width:auto">${[[4, 'Oxirgi 4 hafta'], [12, 'Oxirgi 12 hafta'], [26, 'Oxirgi 26 hafta'], [0, 'Butun davr']].map(([v, t]) => `<option value="${v}" ${dashFilters.weeks === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
      <select class="input" id="fd" style="width:auto"><option value="">Barcha bo'limlar</option>${deps.map((x) => `<option ${dashFilters.department === x.name ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select>
      <select class="input" id="fc" style="width:auto;max-width:280px"><option value="0">Barcha faol testlar</option>${tests.map((c) => `<option value="${c.id}" ${dashFilters.courseId === c.id ? 'selected' : ''}>${esc(c.testTitle)}</option>`).join('')}</select>
    </div>
    <div class="grid grid-4" style="margin-bottom:16px">
      ${statCard(I.chart, "O'rtacha ball", `${d.avgScore ?? '—'}${d.avgScore !== null ? '%' : ''}`, deltaHtml(d.deltaAvg), 'indigo', sparkline(d.weekly.map((w) => w.avgScore), '#2f5bff'))}
      ${statCard(I.checkCircle, "O'tish ko'rsatkichi", `${d.passRate ?? '—'}${d.passRate !== null ? '%' : ''}`, `${d.submitted} tadan ${d.passed} tasi o'tdi · ${deltaHtml(d.deltaPass, '')}`, 'green')}
      ${statCard(I.users, 'Faol xodimlar', `${d.activeEmployees}<small style="font-size:15px;color:var(--muted);font-weight:600"> / ${d.employees}</small>`, d.inactiveEmployees ? `${d.inactiveEmployees} nafari 14 kundan beri kirmagan` : 'Hammasi faol', 'blue')}
      ${statCard(I.clock, "Muddati o'tgan", d.overdue, d.overdueThisWeek ? `<span class="delta-down">+${d.overdueThisWeek}</span> shu haftada` : "shu hafta yangi kechikish yo'q", d.overdue ? 'red' : 'amber')}
    </div>
    <div style="margin-bottom:16px" id="g1">
      <div class="card card-pad">
        <div class="row between"><h2>Tayinlovlar holati</h2><span class="small muted">${d.assignments} ta tayinlov</span></div>
        <div class="stackbar" style="margin-top:14px">${seg.map(([, v, col]) => (v ? `<i style="width:${pct(v, d.assignments)}%;background:${col}"></i>` : '')).join('')}</div>
        <div class="legend legend4">${seg.map(([t, v, col, ic]) => `<div><i style="background:${col}"></i><span>${ic}${t}</span><b>${v}</b><em>${pct(v, d.assignments)}%</em></div>`).join('')}</div>
      </div>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);margin-bottom:16px" id="g2">
      <div class="card card-pad"><div class="row between" style="margin-bottom:8px"><div><h2>Natijalar dinamikasi</h2><div class="small muted">Haftalik o'rtacha ball va o'tish ko'rsatkichi, %</div></div>
        <div class="chart-legend"><span><i style="background:#2f5bff"></i>O'rtacha ball</span><span><i style="background:#ea580c"></i>O'tish ko'rsatkichi</span></div></div>
        ${lineChart([{ data: d.weekly.map((w) => w.avgScore), color: '#2f5bff', area: true }, { data: d.weekly.map((w) => w.passRate), color: '#ea580c' }], labels, { min: minY, max: 100, threshold: passScore })}</div>
      <div class="card card-pad"><h2>Ballar taqsimoti</h2><div class="small muted">${d.submitted} ta topshirilgan test, ball oralig'i bo'yicha</div>
        <div class="chart-legend" style="margin-top:8px"><span><i style="background:#2f5bff;height:8px;width:8px"></i>O'tdi (≥${passScore}%)</span><span><i style="background:#f1a3a3;height:8px;width:8px"></i>O'tmadi (&lt;${passScore}%)</span></div>
        ${histogramHtml(d.histogram, passScore)}
        ${low ? `<p class="small muted" style="margin-top:12px">${low} ta natija o'tish balidan past.${near ? ` Ulardan ${near} tasi ${passScore - 10}–${passScore - 1}% oralig'ida — qayta topshirsa o'tishi mumkin.` : ''}</p>` : ''}</div>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)" id="g3">
      <div class="card"><div class="card-head"><h2>Bo'limlar kesimida</h2></div>
        <div class="table-wrap"><table class="table cards"><thead><tr><th>Bo'lim</th><th>Bajarilish</th><th>O'tish</th><th>O'rtacha</th></tr></thead><tbody>
        ${d.departments.map((x) => `<tr><td><b>${esc(x.department)}</b><div class="small muted">${x.employees} xodim</div></td><td><div class="score-cell"><b>${x.completionRate}%</b>${progressBar(x.completionRate)}</div></td><td>${x.passRate ?? '—'}${x.passRate !== null ? '%' : ''}</td><td>${x.avgScore ?? '—'}${x.avgScore !== null ? '%' : ''}</td></tr>`).join('') || '<tr><td colspan="4"><div class="empty">Ma\'lumot yo\'q</div></td></tr>'}
        </tbody></table></div></div>
      <div class="card"><div class="card-head"><h2>Testlar bo'yicha</h2><a class="small" href="#/admin/results">Barcha natijalar</a></div>
        ${d.courses.map((c) => `<a class="list-card" href="#/admin/results/${c.id}"><div class="list-body"><b class="ellipsis">${esc(c.testTitle)}</b><div class="small">${c.submitted}/${c.assigned} topshirdi · o'rtacha ${c.avgScore ?? '—'}${c.avgScore !== null ? '%' : ''}${c.overdue ? ` · <span class="red">${c.overdue} ta muddati o'tgan</span>` : ''}</div><div style="margin-top:6px">${progressBar(pct(c.submitted, c.assigned))}</div></div><span class="chev">${I.next}</span></a>`).join('') || `<div class="empty">Faol testlar yo'q</div>`}
      </div>
    </div>`));
  const fit = () => { const m = window.matchMedia('(max-width: 1000px)').matches; ['g2', 'g3'].forEach((id) => { const g = $('#' + id); if (g) g.style.gridTemplateColumns = m ? 'minmax(0,1fr)' : id === 'g1' ? 'minmax(0,1.25fr) minmax(0,1fr)' : id === 'g2' ? 'minmax(0,1.4fr) minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)'; }); };
  fit(); window.addEventListener('resize', fit); onCleanup(() => window.removeEventListener('resize', fit));
  $('#fw').addEventListener('change', (e) => { dashFilters.weeks = Number(e.target.value); router(); });
  $('#fd').addEventListener('change', (e) => { dashFilters.department = e.target.value; router(); });
  $('#fc').addEventListener('change', (e) => { dashFilters.courseId = Number(e.target.value); router(); });
  $('[data-assign]').addEventListener('click', () => pickTestThenAssign(tests));
}
function pickTestThenAssign(tests) {
  if (!tests.length) { toast("Avval test yarating", 'error'); return; }
  openModal({
    title: 'Test tayinlash', sub: 'Qaysi testni tayinlaymiz?',
    body: `<div class="assign-list">${tests.map((c) => `<div class="assign-row" data-id="${c.id}"><span class="list-ic" style="width:32px;height:32px">${I.test}</span><div style="min-width:0"><b class="ellipsis" style="display:block">${esc(c.testTitle)}</b><span class="small muted">${c.questionTotal} savol · ${c.assigned} xodimga tayinlangan</span></div><span class="cnt">${I.next}</span></div>`).join('')}</div>`,
    onMount: (m, close) => $$('[data-id]', m).forEach((r) => r.addEventListener('click', () => { close(); assignModal(Number(r.dataset.id)); })),
  });
}

// ================================================================ admin: tayinlash oynasi
async function assignModal(courseId, onDone) {
  const [{ course: c }, users] = await Promise.all([api(`/admin/courses/${courseId}`), api('/admin/users')]);
  const emps = users.filter((u) => u.role === 'employee');
  const deps = [...new Set(emps.map((u) => u.department).filter(Boolean))].sort();
  const sel = { all: c.assignAll, deps: new Set(c.departments), users: new Set(c.assignedUsers) };
  let tab = c.assignAll ? 'all' : 'deps';
  const expanded = new Set();
  const dl = c.deadline ? new Date(c.deadline) : new Date(Date.now() + 7 * 864e5);
  const dDate = `${dl.getFullYear()}-${pad(dl.getMonth() + 1)}-${pad(dl.getDate())}`;
  const dTime = c.deadline ? fmtTimeOfDay(c.deadline) : '18:00';
  const selected = () => (sel.all ? emps : emps.filter((u) => sel.deps.has(u.department) || sel.users.has(u.id)));
  openModal({
    title: 'Testni tayinlash', sub: `${esc(c.testTitle)} · ${c.questionTotal} savol${c.timeLimitMin ? ' · ' + c.timeLimitMin + ' daq' : ''}`,
    body: `<div class="stack" style="gap:14px">
      <div class="seg" id="atabs"><button data-t="users">Xodimlar</button><button data-t="deps">Bo'limlar</button><button data-t="all">Hammaga (${emps.length})</button></div>
      <div id="abody"></div>
      <div class="form-grid"><div class="field"><label>Topshirish muddati</label><input class="input" type="date" id="ad" value="${dDate}"></div><div class="field"><label>Soat</label><input class="input" type="time" id="at" value="${dTime}"></div></div>
      <div class="notice">${I.info}<div>Bog'langan trening ham avtomatik tayinlanadi. Xodim avval treningni ko'radi, keyin test ochiladi.${'' }</div></div>
    </div>`,
    foot: `<span class="small" style="margin-right:auto"><b id="acnt">0</b> xodim tanlandi</span><button class="btn" data-close>Bekor qilish</button><button class="btn btn-primary" id="ago">Tayinlash</button>`,
    wide: true,
    onMount: (m, close) => {
      const drawBody = () => {
        $$('#atabs button', m).forEach((b) => b.classList.toggle('on', b.dataset.t === tab));
        const box = $('#abody', m);
        if (tab === 'all') box.innerHTML = `<label class="assign-row" style="border:1px solid var(--border);border-radius:12px"><input type="checkbox" id="aall" ${sel.all ? 'checked' : ''}><b>Barcha xodimlarga tayinlash</b><span class="cnt">${emps.length} xodim</span></label><p class="hint" style="margin-top:8px">Keyin qo'shiladigan xodimlarga ham avtomatik tayinlanadi.</p>`;
        else if (tab === 'deps') box.innerHTML = `<div class="assign-list">${deps.map((dp) => {
          const us = emps.filter((u) => u.department === dp);
          const open = expanded.has(dp) ? us : us.slice(0, 3);
          return `<label class="assign-row"><input type="checkbox" data-dep="${esc(dp)}" ${sel.all || sel.deps.has(dp) ? 'checked' : ''} ${sel.all ? 'disabled' : ''}><b>${esc(dp)}</b><span class="cnt">${us.length} xodim</span></label>
            ${sel.deps.has(dp) && !sel.all ? open.map((u) => `<div class="assign-row sub">${I.check.replace('<svg', '<svg width="14" height="14" style="color:var(--primary)"')}<span>${esc(u.name)}</span><span class="cnt">${esc(u.position)}</span></div>`).join('') + (us.length > 3 && !expanded.has(dp) ? `<div class="assign-more"><button data-exp="${esc(dp)}">Yana ${us.length - 3} ta xodimni ko'rsatish</button></div>` : '') : ''}`;
        }).join('')}</div>`;
        else box.innerHTML = `<div class="input-icon" style="margin-bottom:8px">${I.search}<input class="input" id="aq" placeholder="Ism yoki bo'lim bo'yicha qidirish"></div><div class="assign-list" id="alist"></div>`;
        if (tab === 'users') {
          const drawList = () => {
            const qv = ($('#aq', m).value || '').toLowerCase();
            $('#alist', m).innerHTML = emps.filter((u) => !qv || u.name.toLowerCase().includes(qv) || u.department.toLowerCase().includes(qv)).map((u) => {
              const viaDep = sel.all || sel.deps.has(u.department);
              return `<label class="assign-row"><input type="checkbox" data-u="${u.id}" ${viaDep || sel.users.has(u.id) ? 'checked' : ''} ${viaDep ? 'disabled' : ''}>${avatar(u.name, 'sm')}<div style="min-width:0"><b style="display:block">${esc(u.name)}</b><span class="small muted">${esc(u.department)} · ${esc(u.position)}</span></div>${viaDep ? '<span class="cnt">bo\'lim orqali</span>' : ''}</label>`;
            }).join('');
          };
          $('#aq', m).addEventListener('input', drawList);
          drawList();
        }
        $('#acnt', m).textContent = selected().length;
        $('#ago', m).textContent = `${selected().length} xodimga tayinlash`;
      };
      $('#atabs', m).addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (b) { tab = b.dataset.t; drawBody(); } });
      $('#abody', m).addEventListener('change', (e) => {
        const t = e.target;
        if (t.id === 'aall') sel.all = t.checked;
        if (t.dataset.dep) t.checked ? sel.deps.add(t.dataset.dep) : sel.deps.delete(t.dataset.dep);
        if (t.dataset.u) t.checked ? sel.users.add(Number(t.dataset.u)) : sel.users.delete(Number(t.dataset.u));
        if (tab !== 'users') drawBody(); else { $('#acnt', m).textContent = selected().length; $('#ago', m).textContent = `${selected().length} xodimga tayinlash`; }
      });
      $('#abody', m).addEventListener('click', (e) => { const b = e.target.closest('[data-exp]'); if (b) { e.preventDefault(); expanded.add(b.dataset.exp); drawBody(); } });
      $('#ago', m).addEventListener('click', async () => {
        if (!selected().length) { toast('Kamida bitta xodim yoki bo\'limni tanlang', 'error'); return; }
        const date = $('#ad', m).value, time = $('#at', m).value || '18:00';
        try {
          const r = await api(`/admin/courses/${courseId}/assign`, { method: 'PUT', body: { all: sel.all, departments: [...sel.deps], users: [...sel.users], deadline: date ? new Date(`${date}T${time}`).toISOString() : null } });
          close();
          toast(`${r.assigned} xodimga tayinlandi${r.added ? ` (${r.added} ta yangi — bildirishnoma yuborildi)` : ''}`, 'success');
          onDone ? onDone() : router();
        } catch (e) { toastErr(e); }
      });
      drawBody();
    },
  });
}

// ================================================================ admin: xodimlar
const userFilters = { q: '', dep: '', status: '', page: 1 };
async function adminUsers() {
  render(adminShell('users', loading()));
  const users = (await api('/admin/users')).filter((u) => u.role === 'employee' || u.id === state.me.id);
  const deps = [...new Set(users.map((u) => u.department).filter(Boolean))].sort();
  const emps = users.filter((u) => u.role === 'employee');
  render(adminShell('users', `
    <div class="page-head"><div><h1>Xodimlar</h1><p class="sub">Jami ${emps.length} ta · ${deps.length} ta bo'lim</p></div>
      <div class="row"><button class="btn" data-import>${I.upload}Excel'dan import</button><button class="btn btn-primary" data-add>${I.plus}Xodim qo'shish</button></div></div>
    <div class="card">
      <div class="card-head"><div class="row" style="flex:1">
        <div class="input-icon" style="flex:1;min-width:200px">${I.search}<input class="input" id="us" placeholder="Ism yoki telefon bo'yicha qidirish" value="${esc(userFilters.q)}"></div>
        <select class="input" id="ud" style="width:auto"><option value="">Barcha bo'limlar</option>${deps.map((d) => `<option ${userFilters.dep === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select>
        <select class="input" id="ust" style="width:auto"><option value="">Barcha holatlar</option><option value="active" ${userFilters.status === 'active' ? 'selected' : ''}>Faol</option><option value="inactive" ${userFilters.status === 'inactive' ? 'selected' : ''}>Nofaol</option><option value="tg" ${userFilters.status === 'tg' ? 'selected' : ''}>Telegram ulangan</option></select>
      </div></div>
      <div class="table-wrap"><table class="table cards"><thead><tr><th>Xodim</th><th>Bo'lim</th><th class="hide-sm">Lavozim</th><th>Bajarildi</th><th>O'rtacha</th><th>Holat</th><th></th></tr></thead><tbody id="ub"></tbody></table></div>
      <div class="pager" id="upg"></div>
    </div>`));
  const PER = 10;
  const draw = () => {
    const sq = userFilters.q.trim().toLowerCase(), digits = sq.replace(/\D/g, '');
    const rows = emps.filter((u) => (!sq || u.name.toLowerCase().includes(sq) || (digits && u.phone.includes(digits))) && (!userFilters.dep || u.department === userFilters.dep)
      && (!userFilters.status || (userFilters.status === 'active' ? u.active : userFilters.status === 'inactive' ? !u.active : u.telegram)));
    const pages = Math.max(1, Math.ceil(rows.length / PER));
    userFilters.page = Math.min(userFilters.page, pages);
    const slice = rows.slice((userFilters.page - 1) * PER, userFilters.page * PER);
    $('#ub').innerHTML = slice.length ? slice.map((u) => `<tr data-id="${u.id}">
      <td><a class="user-cell" href="#/admin/users/${u.id}">${avatar(u.name, 'sm')}<div><b>${esc(u.name)} ${u.telegram ? `<span title="Telegram ulangan" style="color:#229ed9;vertical-align:-2px">${I.telegram.replace('<svg', '<svg width="13" height="13"')}</span>` : ''}</b><span class="small">${fmtPhone(u.phone)}</span></div></a></td>
      <td>${esc(u.department) || '—'}</td><td class="hide-sm">${esc(u.position) || '—'}</td>
      <td><div class="score-cell" style="min-width:110px"><b style="width:auto" class="small">${u.completed} / ${u.assigned}</b>${progressBar(pct(u.completed, u.assigned))}</div></td>
      <td><b>${u.avgScore !== null ? u.avgScore + '%' : '—'}</b></td>
      <td>${u.active ? '<span class="badge badge-blue">Faol</span>' : '<span class="badge badge-gray">Nofaol</span>'}</td>
      <td class="actions"><button class="icon-btn" data-menu aria-label="Amallar">${I.more}</button></td></tr>`).join('')
      : `<tr><td colspan="7"><div class="empty">Hech kim topilmadi</div></td></tr>`;
    const from = rows.length ? (userFilters.page - 1) * PER + 1 : 0;
    $('#upg').innerHTML = `<span>${from}–${Math.min(rows.length, userFilters.page * PER)} / ${rows.length} ta xodim</span><div class="pages"><button data-p="${userFilters.page - 1}" ${userFilters.page === 1 ? 'disabled' : ''}>‹</button>${Array.from({ length: pages }, (_, i) => `<button data-p="${i + 1}" class="${i + 1 === userFilters.page ? 'on' : ''}">${i + 1}</button>`).join('')}<button data-p="${userFilters.page + 1}" ${userFilters.page === pages ? 'disabled' : ''}>›</button></div>`;
  };
  $('#upg').addEventListener('click', (e) => { const b = e.target.closest('[data-p]'); if (b && !b.disabled) { userFilters.page = Number(b.dataset.p); draw(); } });
  $('#us').addEventListener('input', (e) => { userFilters.q = e.target.value; userFilters.page = 1; draw(); });
  $('#ud').addEventListener('change', (e) => { userFilters.dep = e.target.value; userFilters.page = 1; draw(); });
  $('#ust').addEventListener('change', (e) => { userFilters.status = e.target.value; userFilters.page = 1; draw(); });
  $('#ub').addEventListener('click', (e) => {
    const b = e.target.closest('[data-menu]'); if (!b) return;
    e.stopPropagation();
    const u = emps.find((x) => x.id === Number(b.closest('tr').dataset.id));
    popMenu(b, [
      { label: 'Natijalari', icon: I.chart, href: `#/admin/users/${u.id}` },
      { label: 'Tahrirlash', icon: I.edit, onClick: () => userModal(u, deps) },
      { label: "O'chirish", icon: I.trash, danger: true, onClick: async () => {
        if (!(await confirmBox("Xodimni o'chirasizmi?", `${esc(u.name)} va uning barcha natijalari o'chiriladi.`, "O'chirish", true))) return;
        try { await api(`/admin/users/${u.id}`, { method: 'DELETE' }); toast("O'chirildi"); router(); } catch (err) { toastErr(err); }
      } },
    ]);
  });
  draw();
  $('[data-add]').addEventListener('click', () => userModal(null, deps));
  $('[data-import]').addEventListener('click', importUsersModal);
}
function credentialsModal(list) {
  const text = list.map((x) => `${x.name}: login +${x.phone}, parol ${x.password}`).join('\n');
  openModal({
    title: "Kirish ma'lumotlari",
    body: `<div class="stack" style="gap:12px"><div class="notice amber">${I.info}<div>Parollarni hozir nusxalab oling — keyin ular ko'rsatilmaydi.</div></div><div><div class="label">Sayt manzili</div><div>${esc(location.origin)}</div></div>
      <pre style="background:var(--surface-2);border:1px solid var(--border);border-radius:10px;padding:12px;white-space:pre-wrap;margin:0;font-size:12.5px">${esc(text)}</pre></div>`,
    foot: `<button class="btn" data-close>Yopish</button><button class="btn btn-primary" data-copy>${I.copy}Nusxa olish</button>`,
    onMount: (m) => $('[data-copy]', m).addEventListener('click', () => copyText(`${location.origin}\n\n${text}`)),
  });
}
function userModal(u, deps = []) {
  openModal({
    title: u ? 'Xodimni tahrirlash' : 'Yangi xodim',
    body: `<form id="uf" class="form-grid">
      <div class="field full"><label>Ism familiya</label><input class="input" name="name" value="${esc(u?.name || '')}" required></div>
      <div class="field"><label>Telefon</label><div class="phone-in"><span>+998</span><input class="input" name="phone" type="tel" inputmode="numeric" data-phone maxlength="12" value="${u ? maskPhone(u.phone) : ''}" required placeholder="90 123 45 67"></div></div>
      <div class="field"><label>Rol</label><select class="input" name="role"><option value="employee">Xodim</option><option value="admin" ${u?.role === 'admin' ? 'selected' : ''}>Administrator</option></select></div>
      <div class="field"><label>Bo'lim</label><input class="input" name="department" list="deplist" value="${esc(u?.department || '')}"><datalist id="deplist">${deps.map((d) => `<option value="${esc(d)}">`).join('')}</datalist></div>
      <div class="field"><label>Lavozim</label><input class="input" name="position" value="${esc(u?.position || '')}"></div>
      <div class="field full"><label>${u ? 'Yangi parol' : 'Parol'}</label><input class="input" name="password" minlength="6" placeholder="${u ? "O'zgartirmaslik uchun bo'sh qoldiring" : "Bo'sh qoldirsangiz, avtomatik yaratiladi"}"></div>
    </form>`,
    foot: `<button class="btn" data-close>Bekor qilish</button><button class="btn btn-primary" form="uf" type="submit">Saqlash</button>`,
    onMount: (m, close) => $('#uf', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!checkPhone(e.target.phone)) return;
      const body = Object.fromEntries(new FormData(e.target));
      body.phone = '998' + phoneDigits(body.phone);
      try {
        const r = await api(u ? `/admin/users/${u.id}` : '/admin/users', { method: u ? 'PUT' : 'POST', body });
        close();
        await router();
        if (!u) credentialsModal([{ name: r.user.name, phone: r.user.phone, password: r.password }]);
        else if (body.password) credentialsModal([{ name: r.user.name, phone: r.user.phone, password: body.password }]);
        else toast('Saqlandi', 'success');
      } catch (err) { toastErr(err); }
    }),
  });
}
function importUsersModal() {
  let mode = 'file';
  openModal({
    title: "Xodimlarni import qilish", wide: true,
    body: `<div class="stack" style="gap:14px">
      <div class="seg" id="imode"><button data-m="file" class="on">Excel fayl</button><button data-m="text">Matn (nusxa olib qo'yish)</button></div>
      <div id="ifile"><label class="upload-zone"><div class="uz-ic">${I.upload}</div><b id="ifname">Excel faylni shu yerga tashlang yoki <u>kompyuterdan tanlang</u></b><div class="hint">Ustunlar: Ism familiya · Telefon · Bo'lim · Lavozim · Parol (ixtiyoriy)</div><input type="file" accept=".xlsx" hidden id="ifin"></label>
        <a class="btn btn-sm btn-ghost" style="margin-top:8px" href="/api/admin/templates/users.xlsx">${I.download}Shablonni yuklab olish</a></div>
      <div id="itext" style="display:none"><textarea class="input" id="ui" style="min-height:180px" placeholder="Dilnoza Karimova; 901234567; Dorixona filiallari; Farmatsevt"></textarea><p class="hint" style="margin-top:6px">Har qatorda: Ism; telefon; bo'lim; lavozim; parol. Excel'dan nusxa olib qo'yish ham mumkin.</p></div>
      <div id="ires"></div></div>`,
    foot: `<button class="btn" data-close>Yopish</button><button class="btn btn-primary" id="igo">Import qilish</button>`,
    onMount: (m, close) => {
      $('#imode', m).addEventListener('click', (e) => { const b = e.target.closest('[data-m]'); if (!b) return; mode = b.dataset.m; $$('#imode button', m).forEach((x) => x.classList.toggle('on', x === b)); $('#ifile', m).style.display = mode === 'file' ? '' : 'none'; $('#itext', m).style.display = mode === 'text' ? '' : 'none'; });
      const fin = $('#ifin', m);
      fin.addEventListener('change', () => { $('#ifname', m).textContent = fin.files[0]?.name || ''; });
      const zone = $('.upload-zone', m);
      ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
      ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
      zone.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { fin.files = e.dataTransfer.files; $('#ifname', m).textContent = fin.files[0].name; } });
      $('#igo', m).addEventListener('click', async () => {
        try {
          let r;
          if (mode === 'file') {
            if (!fin.files[0]) { toast('Fayl tanlang', 'error'); return; }
            const fd = new FormData(); fd.append('file', fin.files[0]);
            r = await uploadForm('/admin/users/import-file', fd);
          } else r = await api('/admin/users/import', { method: 'POST', body: { text: $('#ui', m).value } });
          if (r.errors.length) $('#ires', m).innerHTML = `<div class="notice amber">${I.info}<div><b>${r.created.length} ta qo'shildi, ${r.errors.length} ta xato:</b><br>${r.errors.map((x) => `${x.line}-qator (${esc(x.text)}): ${esc(x.error)}`).join('<br>')}</div></div>`;
          else close();
          if (r.created.length) { await router(); credentialsModal(r.created); }
          else if (!r.errors.length) toast("Faylda xodimlar topilmadi", 'error');
        } catch (e) { toastErr(e); }
      });
    },
  });
}
async function adminUser(id) {
  render(adminShell('users', loading()));
  const d = await api(`/admin/users/${id}/progress`);
  const u = d.user;
  render(adminShell('users', `
    ${crumbs([['Xodimlar', '#/admin/users'], [u.name]])}
    <div class="card card-pad row between" style="margin-bottom:16px"><div class="user-cell">${avatar(u.name, 'lg')}<div><h1 style="font-size:20px">${esc(u.name)}</h1><div class="small muted">${fmtPhone(u.phone)} · ${esc(u.department)} · ${esc(u.position)}</div></div></div>
      <div class="row">${u.active ? '<span class="badge badge-blue">Faol</span>' : '<span class="badge badge-gray">Nofaol</span>'}${u.telegram ? `<span class="badge badge-blue">${I.telegram}Telegram ulangan</span>` : ''}<span class="small muted">Oxirgi kirish: ${fmtDateTime(u.lastLoginAt)}</span></div></div>
    <div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Treninglar</h2></div>
      <div class="table-wrap"><table class="table cards"><thead><tr><th>Trening</th><th>Holat</th><th>Jarayon</th><th>Ball</th><th>Muddat</th></tr></thead><tbody>
      ${d.courses.map((c) => `<tr><td><a href="#/admin/results/${c.id}"><b>${esc(c.title)}</b></a></td><td>${empStatus(c)}</td><td><div class="score-cell"><b class="small">${c.progress}%</b>${progressBar(c.progress)}</div></td><td>${c.best !== null ? c.best + '%' : '—'}</td><td>${fmtDeadline(c.deadline)}</td></tr>`).join('') || '<tr><td colspan="5"><div class="empty">Tayinlanmagan</div></td></tr>'}
      </tbody></table></div></div>
    <div class="card"><div class="card-head"><h2>Test urinishlari</h2></div>
      <div class="table-wrap"><table class="table cards"><thead><tr><th>Test</th><th>Ball</th><th>To'g'ri</th><th>Vaqt</th><th>Nazorat</th><th>Sana</th><th></th></tr></thead><tbody>
      ${d.attempts.map((a) => `<tr><td><b>${esc(a.testTitle || a.courseTitle)}</b></td><td><span class="badge ${a.passed ? 'badge-green' : 'badge-red'}">${a.score}%</span></td><td>${a.correct}/${a.total}</td><td>${fmtMin(a.durationSec)}</td><td>${a.violations ? `<span class="badge badge-red">${a.violations} ta</span>` : '<span class="badge badge-green">Toza</span>'}</td><td>${fmtDateTime(a.finishedAt)}</td><td class="actions"><a class="btn btn-xs btn-soft" href="#/admin/attempts/${a.id}">Javoblar</a></td></tr>`).join('') || '<tr><td colspan="7"><div class="empty">Hali test topshirmagan</div></td></tr>'}
      </tbody></table></div></div>`));
}

// ================================================================ admin: treninglar
const matIcons = (types) => {
  const cnt = types.reduce((a, t) => ({ ...a, [t]: (a[t] || 0) + 1 }), {});
  return Object.entries(cnt).map(([t, n]) => `<span class="row" style="gap:4px;flex-wrap:nowrap" title="${MAT[t].label}"><span class="mat-ic ${MAT[t].cls}" style="width:24px;height:24px;border-radius:6px">${MAT[t].icon.replace('<svg', '<svg width="12" height="12"')}</span><span class="small">${n}</span></span>`).join('') || '<span class="faint small">—</span>';
};
async function adminTrainings() {
  render(adminShell('trainings', loading()));
  const list = await api('/admin/courses');
  render(adminShell('trainings', `
    <div class="page-head"><div><h1>Treninglar</h1><p class="sub">${list.length} ta trening · PDF, taqdimot va video materiallar</p></div><button class="btn btn-primary" data-new>${I.plus}Yangi trening</button></div>
    <div class="card"><div class="table-wrap"><table class="table cards"><thead><tr><th>Trening</th><th>Materiallar</th><th>Bog'langan test</th><th>Tayinlangan</th><th>Holat</th><th></th></tr></thead><tbody>
    ${list.map((c) => `<tr><td><a href="#/admin/trainings/${c.id}"><b>${esc(c.title)}</b></a><div class="small muted">${esc(c.category || '—')}</div></td>
      <td><div class="row" style="gap:10px">${matIcons(c.lessonTypes)}</div></td>
      <td>${c.questionTotal ? `<a href="#/admin/tests/${c.id}">${esc(c.testTitle)}</a><div class="small muted">${c.questionTotal} savol</div>` : `<a class="small" href="#/admin/tests/${c.id}">+ Test yaratish</a>`}</td>
      <td>${c.assigned ? `${c.assigned} xodim` : '<span class="faint">—</span>'}</td>
      <td>${c.published ? '<span class="badge badge-green">Nashr qilingan</span>' : '<span class="badge badge-gray">Qoralama</span>'}</td>
      <td class="actions"><a class="btn btn-xs" href="#/admin/trainings/${c.id}">Tahrirlash</a> <button class="btn btn-xs btn-soft" data-assign="${c.id}">Tayinlash</button></td></tr>`).join('') || `<tr><td colspan="6"><div class="empty">${I.book}<h3>Treninglar yo'q</h3></div></td></tr>`}
    </tbody></table></div></div>`));
  $('[data-new]').addEventListener('click', newTrainingModal);
  $$('[data-assign]').forEach((b) => b.addEventListener('click', () => assignModal(Number(b.dataset.assign))));
}
function newTrainingModal() {
  openModal({
    title: 'Yangi trening',
    body: `<form id="nt" class="stack" style="gap:12px"><div class="field"><label>Trening nomi</label><input class="input" name="title" required placeholder="Masalan: Dori vositalarini saqlash qoidalari"></div>
      <div class="field"><label>Tavsif</label><textarea class="input" name="description" placeholder="Xodim trening sahifasida shu matnni ko'radi"></textarea></div></form>`,
    foot: `<button class="btn" data-close>Bekor qilish</button><button class="btn btn-primary" form="nt" type="submit">Yaratish</button>`,
    onMount: (m, close) => $('#nt', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      try { const c = await api('/admin/courses', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) }); close(); location.hash = `#/admin/trainings/${c.id}`; } catch (err) { toastErr(err); }
    }),
  });
}
async function adminTraining(id) {
  render(adminShell('trainings', loading()));
  const d = await api(`/admin/courses/${id}`);
  const c = d.course;
  render(adminShell('trainings', `
    ${crumbs([['Treninglar', '#/admin/trainings'], [c.title]])}
    <div class="page-head"><div><h1>${esc(c.title)}</h1><p class="sub">${c.published ? 'Nashr qilingan' : 'Qoralama'} · ${d.lessons.length} ta material${c.assigned ? ` · ${c.assigned} xodimga tayinlangan` : ''}</p></div>
      <div class="row"><a class="btn" href="#/course/${c.id}">${I.eye}Xodim ko'rinishi</a>${c.published ? `<button class="btn" data-save>Saqlash</button><button class="btn btn-primary" data-assign>${I.userPlus}Tayinlash</button>` : `<button class="btn" data-save>Qoralama saqlash</button><button class="btn btn-primary" data-publish>Nashr qilish</button>`}</div></div>
    <div class="editor">
      <div class="stack">
        <form class="card card-pad stack" id="tf" style="gap:12px"><h2>Asosiy ma'lumot</h2>
          <div class="field"><label>Trening nomi</label><input class="input" name="title" value="${esc(c.title)}" required></div>
          <div class="field"><label>Tavsif</label><textarea class="input" name="description">${esc(c.description)}</textarea><span class="hint">Xodim uni trening sahifasida ko'radi</span></div>
          <div class="field"><label>Kategoriya</label><input class="input" name="category" value="${esc(c.category)}" placeholder="Masalan: Farmatsevtika, Majburiy"></div>
        </form>
        <div class="card"><div class="card-head"><h2>Materiallar</h2><span class="small muted">Xodim ularni shu tartibda ko'radi</span></div>
          <div class="card-pad">
            <label class="upload-zone" id="dz"><div class="uz-ic">${I.upload}</div><b id="fname">Faylni shu yerga tashlang yoki <u>kompyuterdan tanlang</u></b><div class="hint">PDF, PPT, PPTX, DOCX, MP4 · bitta fayl 2 GB gacha</div>
              <input type="file" hidden accept=".mp4,.webm,.m4v,.mov,.pdf,.ppt,.pptx,.pps,.ppsx,.odp,.doc,.docx,.odt,.rtf"></label>
            <div id="up" style="display:none;margin-top:10px"><div class="row between small" style="margin-bottom:6px"><span id="upt">Yuklanmoqda...</span><span id="upp">0%</span></div>${progressBar(0)}</div>
            <div style="margin-top:10px"><button class="btn btn-sm btn-ghost" data-addtext>${I.text}Matnli material qo'shish</button></div>
            <div style="margin-top:12px" id="mats">${d.lessons.map((l, i) => `<div class="mat-row" data-id="${l.id}"><span class="n">${i + 1}</span>${matIcon(l)}<div class="mat-body" style="flex:1;min-width:0"><b class="ellipsis">${esc(l.title)}</b><span>${matMeta(l)}</span></div>
              <span class="badge badge-green hide-sm">${I.check}Tayyor</span>
              <div class="row" style="gap:0;flex-wrap:nowrap"><button class="icon-btn" data-up ${i === 0 ? 'disabled' : ''} title="Yuqoriga">${I.up}</button><button class="icon-btn" data-down ${i === d.lessons.length - 1 ? 'disabled' : ''} title="Pastga">${I.down}</button>
              <a class="icon-btn" href="#/course/${c.id}/lesson/${l.id}" title="Ko'rish">${I.eye}</a><button class="icon-btn" data-edit title="Tahrirlash">${I.edit}</button><button class="icon-btn" data-del title="O'chirish">${I.trash}</button></div></div>`).join('') || '<p class="small muted" style="text-align:center">Hali material yuklanmagan</p>'}</div>
          </div></div>
      </div>
      <div class="side stack">
        <div class="card card-pad stack" style="gap:14px"><h2>Sozlamalar</h2>
          <div><div class="label" style="margin-bottom:6px">Bog'langan test</div>
            ${d.questions.length ? `<div class="mat-row"><span class="list-ic" style="width:32px;height:32px">${I.test}</span><div class="mat-body" style="flex:1;min-width:0"><b class="ellipsis">${esc(c.testTitle)}</b><span>${d.questions.length} savol · o'tish bali ${c.passScore}%</span></div></div><a class="small" href="#/admin/tests/${c.id}" style="display:inline-block;margin-top:6px">Testni tahrirlash →</a>`
              : `<a class="btn btn-sm btn-soft btn-block" href="#/admin/tests/${c.id}">${I.plus}Yangi test yaratish</a>`}</div>
          <label class="check"><input type="checkbox" form="tf" name="requireMaterials" ${c.requireMaterials ? 'checked' : ''}>Test faqat barcha materiallar ko'rilgandan keyin ochiladi</label>
          <label class="check"><input type="checkbox" form="tf" name="allowDownload" ${c.allowDownload ? 'checked' : ''}>Xodim PPT va PDF asl faylini yuklab olishi mumkin</label>
          <div class="notice" style="background:var(--surface-2);color:var(--text-2)"><div><div class="label">Holat</div><span class="badge ${c.published ? 'badge-green' : 'badge-gray'}" style="margin:4px 0">${c.published ? 'Nashr qilingan' : 'Qoralama'}</span><div class="hint">${c.published ? 'Xodimlarga tayinlash mumkin' : "Nashr qilingach, xodimlarga tayinlash mumkin bo'ladi"}</div></div></div>
        </div>
        <button class="btn btn-danger btn-sm" data-delc>${I.trash}Treningni o'chirish</button>
      </div>
    </div>`));
  const save = async (extra = {}) => {
    const f = $('#tf');
    const body = { title: f.title.value, description: f.description.value, category: f.category.value, requireMaterials: $('[name=requireMaterials]').checked, allowDownload: $('[name=allowDownload]').checked, ...extra };
    await api(`/admin/courses/${c.id}`, { method: 'PUT', body });
  };
  $('[data-save]').addEventListener('click', async () => { try { await save(); toast('Saqlandi', 'success'); router(); } catch (e) { toastErr(e); } });
  $('[data-publish]')?.addEventListener('click', async () => {
    if (!d.lessons.length) { toast("Avval material yuklang", 'error'); return; }
    try { await save({ published: true }); toast('Nashr qilindi — endi xodimlarga tayinlang', 'success'); assignModal(c.id); } catch (e) { toastErr(e); }
  });
  $('[data-assign]')?.addEventListener('click', async () => { try { await save(); assignModal(c.id); } catch (e) { toastErr(e); } });
  $('[data-delc]').addEventListener('click', async () => {
    if (!(await confirmBox("Treningni o'chirasizmi?", `«${esc(c.title)}», uning testi va barcha natijalar o'chiriladi.`, "O'chirish", true))) return;
    try { await api(`/admin/courses/${c.id}`, { method: 'DELETE' }); toast("O'chirildi"); location.hash = '#/admin/trainings'; } catch (e) { toastErr(e); }
  });
  // materiallar
  const ids = d.lessons.map((l) => l.id);
  $$('.mat-row[data-id]').forEach((row) => {
    const lid = Number(row.dataset.id);
    const l = d.lessons.find((x) => x.id === lid);
    const move = async (dir) => { const i = ids.indexOf(lid), j = i + dir; [ids[i], ids[j]] = [ids[j], ids[i]]; await api(`/admin/courses/${c.id}/lessons/reorder`, { method: 'POST', body: { ids } }); router(); };
    $('[data-up]', row).addEventListener('click', () => move(-1));
    $('[data-down]', row).addEventListener('click', () => move(1));
    $('[data-del]', row).addEventListener('click', async () => {
      if (!(await confirmBox("Materialni o'chirasizmi?", `«${esc(l.title)}» va uning fayli o'chiriladi.`, "O'chirish", true))) return;
      await api(`/admin/lessons/${lid}`, { method: 'DELETE' }); router();
    });
    $('[data-edit]', row).addEventListener('click', () => lessonModal(c.id, l));
  });
  $('[data-addtext]').addEventListener('click', () => lessonModal(c.id, null));
  const fin = $('#dz input');
  const dz = $('#dz');
  const doUpload = async (file) => {
    const fd = new FormData(); fd.append('file', file); fd.append('title', '');
    const up = $('#up'); up.style.display = '';
    const conv = /\.(pptx?|ppsx?|odp|docx?|odt|rtf)$/i.test(file.name);
    $('#fname').textContent = `${file.name} · ${fmtSize(file.size)}`;
    try {
      await uploadForm(`/admin/courses/${c.id}/lessons`, fd, (p) => { $('#upp').textContent = Math.round(p * 100) + '%'; $('#up .progress > i').style.width = p * 100 + '%'; if (p >= 1) $('#upt').textContent = conv ? "PDF'ga o'girilmoqda..." : 'Saqlanmoqda...'; });
      toast("Material qo'shildi", 'success'); router();
    } catch (e) { toastErr(e); up.style.display = 'none'; }
  };
  fin.addEventListener('change', () => fin.files[0] && doUpload(fin.files[0]));
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => e.dataTransfer.files[0] && doUpload(e.dataTransfer.files[0]));
}
function lessonModal(cid, l) {
  const isText = !l || l.type === 'text';
  openModal({
    title: l ? 'Materialni tahrirlash' : 'Matnli material', wide: isText,
    body: `<form id="lf" class="stack" style="gap:12px"><div class="field"><label>Nomi</label><input class="input" name="title" value="${esc(l?.title || '')}" required></div>
      <div class="field"><label>${isText ? 'Matn' : 'Izoh (ixtiyoriy)'}</label><textarea class="input" name="content" style="min-height:${isText ? 240 : 90}px">${esc(l?.content || '')}</textarea></div></form>`,
    foot: `<button class="btn" data-close>Bekor qilish</button><button class="btn btn-primary" form="lf" type="submit">Saqlash</button>`,
    onMount: (m, close) => $('#lf', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      try {
        if (l) await api(`/admin/lessons/${l.id}`, { method: 'PUT', body });
        else { const fd = new FormData(); fd.append('title', body.title); fd.append('content', body.content); await uploadForm(`/admin/courses/${cid}/lessons`, fd); }
        close(); toast('Saqlandi', 'success'); router();
      } catch (err) { toastErr(err); }
    }),
  });
}

// ================================================================ admin: testlar
async function adminTests() {
  render(adminShell('tests', loading()));
  const list = await api('/admin/courses');
  const tests = list.filter((c) => c.questionTotal > 0);
  render(adminShell('tests', `
    <div class="page-head"><div><h1>Testlar</h1><p class="sub">${tests.length} ta test · har bir test treningga bog'langan</p></div><button class="btn btn-primary" data-new>${I.plus}Yangi test</button></div>
    <div class="card"><div class="table-wrap"><table class="table cards"><thead><tr><th>Test</th><th>Savollar</th><th>O'tish bali</th><th>Vaqt</th><th>Topshirdi</th><th>Muddat</th><th></th></tr></thead><tbody>
    ${tests.map((c) => `<tr><td><a href="#/admin/tests/${c.id}"><b>${esc(c.testTitle)}</b></a><div class="small muted">Trening: ${esc(c.title)}</div></td><td>${c.questionTotal}${c.questionCount ? ` <span class="small muted">(${c.questionCount} tasodifiy)</span>` : ''}</td><td>${c.passScore}%</td><td>${c.timeLimitMin ? c.timeLimitMin + ' daq' : '—'}</td>
      <td><div class="score-cell" style="min-width:110px"><b class="small" style="width:auto">${c.submitted}/${c.assigned}</b>${progressBar(pct(c.submitted, c.assigned))}</div></td><td>${fmtDeadline(c.deadline)}</td>
      <td class="actions"><a class="btn btn-xs" href="#/admin/tests/${c.id}">Tahrirlash</a> <a class="btn btn-xs" href="#/admin/results/${c.id}">Natijalar</a> <button class="btn btn-xs btn-soft" data-assign="${c.id}">Tayinlash</button></td></tr>`).join('') || `<tr><td colspan="7"><div class="empty">${I.test}<h3>Testlar yo'q</h3></div></td></tr>`}
    </tbody></table></div></div>`));
  $$('[data-assign]').forEach((b) => b.addEventListener('click', () => assignModal(Number(b.dataset.assign))));
  $('[data-new]').addEventListener('click', () => {
    const free = list.filter((c) => !c.questionTotal);
    openModal({
      title: 'Yangi test', sub: 'Test qaysi treningga bog\'lanadi?',
      body: `<div class="assign-list">${free.map((c) => `<a class="assign-row" href="#/admin/tests/${c.id}" data-close><span class="list-ic" style="width:32px;height:32px">${I.book}</span><b>${esc(c.title)}</b><span class="cnt">${I.next}</span></a>`).join('') || '<div class="assign-row muted">Barcha treninglarda test bor</div>'}</div>
        <button class="btn btn-sm btn-ghost" style="margin-top:10px" id="ntr">${I.plus}Avval yangi trening yaratish</button>`,
      onMount: (m, close) => $('#ntr', m).addEventListener('click', () => { close(); newTrainingModal(); }),
    });
  });
}
async function adminTest(id) {
  render(adminShell('tests', loading()));
  const d = await api(`/admin/courses/${id}`);
  const c = d.course;
  render(adminShell('tests', `
    ${crumbs([['Testlar', '#/admin/tests'], [d.questions.length ? c.testTitle : 'Yangi test']])}
    <div class="page-head"><div><h1>${d.questions.length ? 'Testni tahrirlash' : 'Test yaratish'}</h1><p class="sub">Trening: <a href="#/admin/trainings/${c.id}">${esc(c.title)}</a></p></div>
      <div class="row"><button class="btn" data-preview>${I.eye}Oldindan ko'rish</button><button class="btn" data-assign>${I.userPlus}Tayinlash</button><button class="btn btn-primary" data-save>Saqlash</button></div></div>
    <form class="card card-pad stack" id="sf" style="gap:14px;margin-bottom:16px"><h2>Test sozlamalari</h2>
      <div class="field"><label>Test nomi</label><input class="input" name="testTitle" value="${esc(c.testTitle)}"></div>
      <div class="form-grid-4">
        <div class="field"><label>Bog'langan trening</label><input class="input" value="${esc(c.title)}" disabled></div>
        <div class="field"><label>O'tish bali, %</label><input class="input" type="number" name="passScore" min="1" max="100" value="${c.passScore}"></div>
        <div class="field"><label>Vaqt limiti, daqiqa</label><input class="input" type="number" name="timeLimitMin" min="0" value="${c.timeLimitMin}"><span class="hint">0 — cheklanmagan</span></div>
        <div class="field"><label>Urinishlar soni</label><input class="input" type="number" name="maxAttempts" min="0" value="${c.maxAttempts}"><span class="hint">Qo'shimcha urinishga admin alohida ruxsat beradi</span></div>
      </div>
      <div class="row" style="gap:18px">
        <label class="check"><input type="checkbox" name="shuffle" ${c.shuffle ? 'checked' : ''}>Savollar va javoblar tartibini aralashtirish</label>
        <label class="check"><input type="checkbox" name="showResult" ${c.showResult ? 'checked' : ''}>Natijani xodimga darhol ko'rsatish</label>
        <label class="check"><input type="checkbox" name="showCorrect" ${c.showCorrect ? 'checked' : ''}>To'g'ri javoblarni xodimga ko'rsatish</label>
      </div>
      <div class="field" style="max-width:360px"><label>Har bir xodimga beriladigan savollar soni</label><input class="input" type="number" name="questionCount" min="0" value="${c.questionCount}"><span class="hint">0 — barcha savollar. Aks holda savollar bankidan tasodifiy tanlanadi</span></div>
      <details><summary class="label" style="cursor:pointer">Proktoring (nazorat) sozlamalari</summary>
        <div class="stack" style="gap:10px;margin-top:12px">
          <label class="check"><input type="checkbox" name="proctorScreen" ${c.proctorScreen ? 'checked' : ''}>Ekran nazorati: to'liq ekran, boshqa oynaga o'tish va skrinshot urinishlarini qayd etish, suv belgisi</label>
          <label class="check"><input type="checkbox" name="proctorCamera" ${c.proctorCamera ? 'checked' : ''}>Kamera nazorati: test kamera yoqilgan holda o'tadi, vaqti-vaqti bilan surat olinadi</label>
          <div class="field" style="max-width:260px"><label>Qoidabuzarliklar limiti</label><input class="input" type="number" name="maxViolations" min="0" value="${c.maxViolations}"><span class="hint">0 — faqat qayd etiladi</span></div>
        </div></details>
    </form>
    <div class="row between" style="margin-bottom:10px"><h2>Savollar <span class="muted" style="font-weight:400" id="qn">(${d.questions.length})</span></h2>
      <div class="row"><a class="btn btn-sm btn-ghost" href="/api/admin/templates/questions.xlsx">${I.download}Shablon</a><button class="btn btn-sm" data-xl>${I.upload}Savollarni Excel'dan import</button><button class="btn btn-sm" data-txt>${I.text}Matndan import</button></div></div>
    <div id="qlist"></div>
    <button class="btn btn-block" style="margin-top:12px;border-style:dashed" data-addq>${I.plus}Savol qo'shish</button>`));
  const readSettings = () => {
    const f = $('#sf');
    return { testTitle: f.testTitle.value, passScore: f.passScore.value, timeLimitMin: f.timeLimitMin.value, maxAttempts: f.maxAttempts.value, questionCount: f.questionCount.value,
      shuffle: f.shuffle.checked, showResult: f.showResult.checked, showCorrect: f.showCorrect.checked, proctorScreen: f.proctorScreen.checked, proctorCamera: f.proctorCamera.checked, maxViolations: f.maxViolations.value };
  };
  const saveSettings = () => api(`/admin/courses/${c.id}`, { method: 'PUT', body: readSettings() });
  $('[data-save]').addEventListener('click', async () => { try { await saveSettings(); toast('Saqlandi', 'success'); } catch (e) { toastErr(e); } });
  $('[data-assign]').addEventListener('click', async () => { try { await saveSettings(); assignModal(c.id); } catch (e) { toastErr(e); } });
  const questions = d.questions.map((x) => ({ ...x }));
  const qlist = $('#qlist');
  const count = () => { $('#qn').textContent = `(${questions.filter((x) => x.id).length})`; };
  function qCard(x, n) {
    const el = document.createElement('div');
    el.className = 'qed';
    const drawOpts = () => {
      $('.opts', el).innerHTML = x.options.map((o, i) => { const ok = x.correct.includes(i); return `<div class="opt ${ok ? 'ok' : ''}"><input type="${x.multi ? 'checkbox' : 'radio'}" name="c${n}" data-c="${i}" ${ok ? 'checked' : ''} title="To'g'ri javob"><input class="input" data-o="${i}" value="${esc(o)}" placeholder="Javob varianti">${ok ? "<span class=\"tag\">To'g'ri javob</span>" : ''}<button class="icon-btn" data-rm="${i}" title="O'chirish">${I.x}</button></div>`; }).join('');
    };
    el.innerHTML = `<div class="qed-head"><b>${n}-savol</b><select class="input" data-type><option value="0">Bitta to'g'ri javob</option><option value="1" ${x.multi ? 'selected' : ''}>Bir nechta to'g'ri javob</option></select><span class="save-state"></span><button class="icon-btn" data-delq title="Savolni o'chirish">${I.trash}</button></div>
      <textarea class="input" data-text style="min-height:60px" placeholder="Savol matni">${esc(x.text)}</textarea>
      <div class="hint" style="margin:8px 0 2px">To'g'ri javobni belgilang</div><div class="opts"></div>
      <button class="btn btn-xs btn-ghost" style="margin-top:6px" data-addo>${I.plus}Variant qo'shish</button>`;
    drawOpts();
    let timer = null;
    const ss = $('.save-state', el);
    const save = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        const body = { text: x.text, options: x.options.filter((o) => o.trim()), correct: x.correct.filter((i) => x.options[i]?.trim()).map((i) => x.options.filter((o, j) => j < i && o.trim()).length), multi: x.multi };
        if (!body.text.trim() || body.options.length < 2 || !body.correct.length) { ss.innerHTML = `<span class="faint">${!body.text.trim() ? 'Savol matnini kiriting' : body.options.length < 2 ? 'Kamida 2 ta variant' : "To'g'ri javobni belgilang"}</span>`; return; }
        ss.textContent = 'Saqlanmoqda...';
        try {
          const r = await api(x.id ? `/admin/questions/${x.id}` : `/admin/courses/${c.id}/questions`, { method: x.id ? 'PUT' : 'POST', body });
          x.id = r.id; count();
          ss.innerHTML = `<span class="green">${I.check.replace('<svg', '<svg width="12" height="12" style="vertical-align:-1px"')} Saqlandi</span>`;
        } catch (e) { ss.innerHTML = `<span class="red">${esc(e.message)}</span>`; }
      }, 700);
    };
    el.addEventListener('input', (e) => {
      if (e.target.matches('[data-text]')) x.text = e.target.value;
      if (e.target.dataset.o !== undefined) x.options[Number(e.target.dataset.o)] = e.target.value;
      save();
    });
    el.addEventListener('change', (e) => {
      const t = e.target;
      if (t.matches('[data-type]')) { x.multi = t.value === '1'; if (!x.multi) x.correct = x.correct.slice(0, 1); drawOpts(); save(); }
      if (t.dataset.c !== undefined) { const i = Number(t.dataset.c); x.correct = x.multi ? (t.checked ? [...new Set([...x.correct, i])] : x.correct.filter((k) => k !== i)) : [i]; drawOpts(); save(); }
    });
    el.addEventListener('click', async (e) => {
      const rm = e.target.closest('[data-rm]');
      if (rm) { e.preventDefault(); if (x.options.length <= 2) return; const i = Number(rm.dataset.rm); x.options.splice(i, 1); x.correct = x.correct.filter((k) => k !== i).map((k) => (k > i ? k - 1 : k)); drawOpts(); save(); }
      if (e.target.closest('[data-addo]')) { e.preventDefault(); if (x.options.length < 8) { x.options.push(''); drawOpts(); $$('[data-o]', el).pop().focus(); } }
      if (e.target.closest('[data-delq]')) {
        e.preventDefault();
        if (x.id && !(await confirmBox("Savolni o'chirasizmi?", esc(x.text), "O'chirish", true))) return;
        if (x.id) await api(`/admin/questions/${x.id}`, { method: 'DELETE' });
        questions.splice(questions.indexOf(x), 1); drawAll();
      }
    });
    return el;
  }
  const drawAll = () => { qlist.innerHTML = ''; questions.forEach((x, i) => qlist.appendChild(qCard(x, i + 1))); count(); if (!questions.length) qlist.innerHTML = `<div class="card empty">${I.test}<h3>Savollar yo'q</h3><p>Savol qo'shing yoki Excel'dan import qiling</p></div>`; };
  drawAll();
  $('[data-addq]').addEventListener('click', () => { if (!questions.length) qlist.innerHTML = ''; const x = { id: null, text: '', options: ['', '', '', ''], correct: [], multi: false }; questions.push(x); const el = qCard(x, questions.length); qlist.appendChild(el); $('[data-text]', el).focus(); });
  $('[data-xl]').addEventListener('click', () => {
    const inp = Object.assign(document.createElement('input'), { type: 'file', accept: '.xlsx' });
    inp.onchange = async () => {
      if (!inp.files[0]) return;
      const fd = new FormData(); fd.append('file', inp.files[0]);
      try { const r = await uploadForm(`/admin/courses/${c.id}/questions/import-file`, fd); toast(`${r.added} ta savol qo'shildi${r.errors.length ? `, ${r.errors.length} ta xato` : ''}`, r.errors.length ? 'error' : 'success'); if (r.errors.length) console.warn(r.errors); router(); } catch (e) { toastErr(e); }
    };
    inp.click();
  });
  $('[data-txt]').addEventListener('click', () => openModal({
    title: 'Matndan import', wide: true,
    body: `<p class="muted" style="margin-bottom:10px">Har bir savolni bo'sh qator bilan ajrating. Birinchi qator — savol, keyingilari — variantlar. To'g'ri javob(lar) oldiga <b>*</b> qo'ying.</p>
      <textarea class="input" id="imp" style="min-height:220px" placeholder="Insulin qaysi haroratda saqlanadi?&#10;+15 °C dan +25 °C gacha&#10;*+2 °C dan +8 °C gacha&#10;0 °C dan past"></textarea><div id="impres" style="margin-top:10px"></div>`,
    foot: `<button class="btn" data-close>Yopish</button><button class="btn btn-primary" id="dimp">Import qilish</button>`,
    onMount: (m) => $('#dimp', m).addEventListener('click', async () => {
      try { const r = await api(`/admin/courses/${c.id}/questions/import`, { method: 'POST', body: { text: $('#imp', m).value } });
        $('#impres', m).innerHTML = `<div class="notice ${r.errors.length ? 'amber' : 'green'}">${I.info}<div><b>${r.added} ta savol qo'shildi.</b>${r.errors.map((x) => `<br>${x.block}-blok: ${esc(x.error)}`).join('')}</div></div>`;
        if (r.added) setTimeout(() => router(), 900);
      } catch (e) { toastErr(e); }
    }),
  }));
  $('[data-preview]').addEventListener('click', () => openModal({
    title: "Oldindan ko'rish", sub: `${esc(c.testTitle)} · xodim shunday ko'radi`, wide: true,
    body: questions.filter((x) => x.id).map((x, i) => `<div class="rv"><div class="rv-head">${i + 1}-savol · ${x.multi ? 'bir nechta javob' : 'bitta javob'}</div><h3>${esc(x.text)}</h3>${x.options.map((o) => `<label class="option"><input type="${x.multi ? 'checkbox' : 'radio'}" name="p${i}"><span>${esc(o)}</span></label>`).join('')}</div>`).join('') || '<div class="empty">Savollar yo\'q</div>',
  }));
}

// ================================================================ admin: natijalar
async function adminResultsList() {
  render(adminShell('results', loading()));
  const list = (await api('/admin/courses')).filter((c) => c.questionTotal > 0 && c.published);
  render(adminShell('results', `
    <div class="page-head"><div><h1>Natijalar</h1><p class="sub">Testlar bo'yicha natijalar</p></div><a class="btn" href="/api/admin/report.xlsx?weeks=0">${I.download}Umumiy hisobot (Excel)</a></div>
    <div class="grid grid-3">${list.map((c) => `<a class="card card-pad" href="#/admin/results/${c.id}" style="color:inherit">
      <b style="display:block">${esc(c.testTitle)}</b><div class="small muted" style="margin-top:2px">${esc(c.title)} · muddat ${fmtDeadline(c.deadline)}</div>
      <div class="row" style="margin:14px 0 8px;gap:18px"><div><div class="kpi-value" style="font-size:22px">${pct(c.submitted, c.assigned)}%</div><div class="small muted">topshirdi</div></div><div><div class="kpi-value green" style="font-size:22px">${c.passed}</div><div class="small muted">o'tdi</div></div><div><div class="kpi-value" style="font-size:22px">${c.avgScore ?? '—'}${c.avgScore !== null ? '%' : ''}</div><div class="small muted">o'rtacha</div></div></div>
      ${progressBar(pct(c.submitted, c.assigned))}<div class="small muted" style="margin-top:6px">${c.submitted} / ${c.assigned} xodim topshirdi</div></a>`).join('') || `<div class="card empty">${I.chart}<h3>Faol testlar yo'q</h3></div>`}</div>`));
}
const resState = { tab: 'all', dep: '' };
async function adminResults(id) {
  render(adminShell('results', loading()));
  const r = await api(`/admin/courses/${id}/results`);
  const c = r.course, s = r.summary;
  const deps = [...new Set(r.rows.map((x) => x.user.department).filter(Boolean))].sort();
  render(adminShell('results', `
    ${crumbs([['Testlar', '#/admin/tests'], ['Natijalar', '#/admin/results'], [c.testTitle]])}
    <div class="page-head"><div><h1>${esc(c.testTitle)}</h1><p class="sub">O'tish bali ${c.passScore}% · Muddat ${fmtDeadline(c.deadline)}</p></div>
      <div class="row"><button class="btn" data-assign>${I.userPlus}Tayinlash</button><a class="btn btn-primary" href="/api/admin/courses/${c.id}/results.xlsx">${I.download}Excel'ga yuklab olish</a></div></div>
    <div class="grid" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr);margin-bottom:16px" id="rg">
      <div class="grid grid-3" style="gap:10px">
        <div class="card kpi"><div class="kpi-label">Tayinlangan</div><div class="kpi-value">${s.assigned}</div></div>
        <div class="card kpi"><div class="kpi-label">Topshirdi</div><div class="kpi-value">${s.submitted} <small>${pct(s.submitted, s.assigned)}%</small></div></div>
        <div class="card kpi green"><div class="kpi-label">O'tdi</div><div class="kpi-value">${s.passed}</div></div>
        <div class="card kpi red"><div class="kpi-label">O'tmadi</div><div class="kpi-value">${s.failed}</div></div>
        <div class="card kpi"><div class="kpi-label">O'rtacha ball</div><div class="kpi-value">${s.avgScore ?? '—'}${s.avgScore !== null ? '%' : ''}</div></div>
        <div class="card kpi warn"><div class="kpi-label">${I.clock}Muddati o'tgan</div><div class="kpi-value">${s.overdue}</div></div>
      </div>
      <div class="card card-pad"><h2>Ballar taqsimoti <span class="muted" style="font-weight:400;font-size:13px">(${s.submitted} ta natija)</span></h2>${histogramHtml(r.histogram, c.passScore)}</div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="row between" style="padding:0 16px;border-bottom:1px solid var(--border)">
        <div class="tabs" style="border:0" id="rtabs">${[['all', `Hammasi (${s.assigned})`], ['passed', `O'tdi (${s.passed})`], ['failed', `O'tmadi (${s.failed})`], ['pending', `Topshirmagan (${s.notSubmitted})`]].map(([k, t]) => `<button class="tab ${resState.tab === k ? 'active' : ''}" data-t="${k}">${t}</button>`).join('')}</div>
        <div class="row" style="padding:8px 0"><button class="btn btn-sm" id="remindAll" style="${resState.tab === 'pending' && s.notSubmitted ? '' : 'display:none'}">${I.send}Hammasiga eslatish</button>
          <select class="input" id="rdep" style="width:auto;height:34px"><option value="">Barcha bo'limlar</option>${deps.map((d) => `<option ${resState.dep === d ? 'selected' : ''}>${esc(d)}</option>`).join('')}</select></div>
      </div>
      <div class="table-wrap"><table class="table cards"><thead><tr><th>Xodim</th><th>Bo'lim</th><th>Ball</th><th>Holat</th><th>Vaqt</th><th>Sana</th><th class="hide-sm">Nazorat</th><th></th></tr></thead><tbody id="rb"></tbody></table></div>
    </div>
    ${r.hardest.length ? `<div class="card"><div class="card-head"><div><h2>Eng ko'p xato qilingan savollar</h2><div class="sub">Qaysi mavzuni yaxshiroq tushuntirish kerakligini ko'rsatadi</div></div></div>
      <div class="card-pad stack" style="gap:12px">${r.hardest.slice(0, 6).map((h) => `<div><div class="row between small" style="flex-wrap:nowrap;margin-bottom:5px"><span class="ellipsis">${esc(h.text)}</span><span class="nowrap muted">${h.wrong}/${h.shown} xato · <b class="${h.wrongRate >= 50 ? 'red' : ''}">${h.wrongRate}%</b></span></div>${progressBar(h.wrongRate, h.wrongRate >= 50 ? 'red' : '')}</div>`).join('')}</div></div>` : ''}`));
  const fit = () => { $('#rg').style.gridTemplateColumns = window.matchMedia('(max-width: 1000px)').matches ? 'minmax(0,1fr)' : 'minmax(0,1fr) minmax(0,1fr)'; };
  fit(); window.addEventListener('resize', fit); onCleanup(() => window.removeEventListener('resize', fit));
  const draw = () => {
    const rows = r.rows.filter((x) => (resState.tab === 'all' || (resState.tab === 'passed' && x.passed) || (resState.tab === 'failed' && x.submitted && !x.passed) || (resState.tab === 'pending' && !x.submitted)) && (!resState.dep || x.user.department === resState.dep))
      .sort((a, b) => (b.lastFinishedAt || '').localeCompare(a.lastFinishedAt || ''));
    $('#rb').innerHTML = rows.map((x) => `<tr data-u="${x.user.id}">
      <td><a class="user-cell" href="#/admin/users/${x.user.id}">${avatar(x.user.name, 'sm')}<div><b>${esc(x.user.name)}</b><span class="small">${esc(x.user.position)}</span></div></a></td>
      <td>${esc(x.user.department) || '—'}</td>
      <td>${x.submitted ? `<div class="score-cell"><b class="${x.passed ? '' : 'red'}">${x.best}%</b>${progressBar(x.best, x.passed ? '' : 'red')}</div>` : '<span class="faint">—</span>'}</td>
      <td>${resStatus(x)}</td>
      <td>${x.submitted ? fmtMin(x.durationSec) : '—'}</td>
      <td>${x.submitted ? fmtDate(x.lastFinishedAt) : '—'}</td>
      <td class="hide-sm">${x.submitted ? (x.violations ? `<span class="badge badge-red">${x.violations} ta</span>` : '<span class="badge badge-green">Toza</span>') : '—'}</td>
      <td class="actions">${x.submitted ? `<a class="btn btn-xs btn-soft" href="#/admin/attempts/${x.lastAttemptId}">Javoblar</a>` : ''}
        ${x.submitted && !x.passed ? ` <button class="btn btn-xs" data-grant>${x.attemptsLeft ? `Ruxsat (+${x.attemptsLeft})` : 'Qayta ruxsat'}</button>` : ''}
        ${!x.submitted ? `<button class="btn btn-xs" data-remind>${I.send}Eslatish</button>` : ''}</td></tr>`).join('') || `<tr><td colspan="8"><div class="empty">Bu bo'limda hech kim yo'q</div></td></tr>`;
  };
  $('#rtabs').addEventListener('click', (e) => { const b = e.target.closest('[data-t]'); if (!b) return; resState.tab = b.dataset.t; $$('#rtabs .tab').forEach((t) => t.classList.toggle('active', t === b)); $('#remindAll').style.display = resState.tab === 'pending' && s.notSubmitted ? '' : 'none'; draw(); });
  $('#rdep').addEventListener('change', (e) => { resState.dep = e.target.value; draw(); });
  $('[data-assign]').addEventListener('click', () => assignModal(c.id));
  $('#remindAll').addEventListener('click', async () => { try { const x = await api(`/admin/courses/${c.id}/remind`, { method: 'POST', body: {} }); toast(`${x.sent} ta xodimga eslatma yuborildi`, 'success'); } catch (e) { toastErr(e); } });
  $('#rb').addEventListener('click', async (e) => {
    const tr = e.target.closest('tr[data-u]'); if (!tr) return;
    const uid = Number(tr.dataset.u);
    const row = r.rows.find((x) => x.user.id === uid);
    if (e.target.closest('[data-remind]')) { try { await api(`/admin/courses/${c.id}/remind`, { method: 'POST', body: { userIds: [uid] } }); toast(`${row.user.name}ga eslatma yuborildi`, 'success'); } catch (err) { toastErr(err); } }
    if (e.target.closest('[data-grant]')) {
      if (!(await confirmBox('Qayta topshirishga ruxsat berasizmi?', `${esc(row.user.name)}ga «${esc(c.testTitle)}» testi uchun yana 1 ta urinish beriladi va xabar yuboriladi.`, 'Ruxsat berish'))) return;
      try { await api(`/admin/courses/${c.id}/users/${uid}/grant`, { method: 'POST' }); toast('Ruxsat berildi', 'success'); router(); } catch (err) { toastErr(err); }
    }
  });
  draw();
}

// ================================================================ admin: xodim javoblari
async function adminAttempt(id) {
  render(adminShell('results', loading()));
  const a = await api(`/admin/attempts/${id}`);
  const c = a.course;
  const wrong = a.review.filter((x) => !x.isCorrect).length;
  const viol = a.violations.filter((v) => v.type !== 'info');
  const kindLabel = { start: 'Boshlanish', periodic: 'Rejali', violation: 'Qoidabuzarlik', finish: 'Yakun' };
  let onlyWrong = false;
  render(adminShell('results', `
    ${crumbs([['Testlar', '#/admin/tests'], [`${c.testTitle}: natijalar`, `#/admin/results/${c.id}`], [a.user.name]])}
    <div class="card" style="margin-bottom:16px">
      <div class="card-pad row between" style="gap:18px">
        <div class="user-cell">${avatar(a.user.name, 'lg')}<div><b style="font-size:16px">${esc(a.user.name)}</b><span class="small">${esc(a.user.department)} · ${esc(a.user.position)}</span></div></div>
        <div class="row" style="gap:22px">
          <div><div class="small muted">Ball</div><div class="kpi-value ${a.passed ? 'green' : 'red'}" style="margin:0">${a.score ?? '—'}%</div></div>
          <div><div class="small muted">To'g'ri javoblar</div><div class="kpi-value" style="margin:0">${a.correct} / ${a.total}</div></div>
          <div><div class="small muted">Sarflangan vaqt</div><div class="kpi-value" style="margin:0">${fmtMin(a.durationSec)}</div></div>
          <div><div class="small muted">Holat</div>${a.passed ? `<span class="badge badge-green">${I.check}O'tdi</span>` : `<span class="badge badge-red">${I.x}O'tmadi (kerak: ${c.passScore}%)</span>`}</div>
        </div>
      </div>
      <div class="row between" style="padding:12px 20px;border-top:1px solid var(--border);background:var(--surface-2);border-radius:0 0 14px 14px">
        <span class="small muted">${a.attemptNumber}-urinish · ${fmtDateTime(a.finishedAt)} · ${a.attemptsLeft === 0 ? `Urinishlar tugadi (${a.attemptsUsed}/${a.attemptsLimit})` : a.attemptsLimit ? `${a.attemptsUsed}/${a.attemptsLimit} urinish` : `${a.attemptsUsed} urinish`}${a.autoSubmitted ? ` · <b class="red">avtomatik topshirilgan (${a.autoSubmitted === 'violations' ? 'qoidabuzarlik' : 'vaqt tugadi'})</b>` : ''}</span>
        <div class="row">${a.attempts.length > 1 ? `<select class="input" id="asw" style="width:auto;height:32px">${a.attempts.map((x) => `<option value="${x.id}" ${x.id === a.id ? 'selected' : ''}>${x.n}-urinish · ${x.score}%</option>`).join('')}</select>` : ''}
          <button class="btn btn-sm" data-reset>Treningni qayta tayinlash</button>${!a.passed ? '<button class="btn btn-sm btn-primary" data-grant>Qayta topshirishga ruxsat berish</button>' : ''}</div>
      </div>
    </div>
    <div class="grid" style="grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);align-items:start" id="ag">
      <div class="card"><div class="card-head"><h2>Javoblar</h2><div class="chips" id="rvf"><button class="chip on" data-f="all">Hammasi (${a.review.length})</button><button class="chip" data-f="wrong">Faqat xatolar (${wrong})</button></div></div><div id="rvl">${reviewHtml(a.review, { labels: ['Xodim javobi', "To'g'ri javob"] })}</div></div>
      <div class="stack">
        <div class="card"><div class="card-head"><h2>Nazorat</h2>${viol.length ? `<span class="badge badge-red">${viol.length} ta qoidabuzarlik</span>` : '<span class="badge badge-green">Toza</span>'}</div>
          <div class="timeline"><div class="tl ok"><i></i><div><b>Test boshlandi</b><span>${fmtDateTime(a.startedAt)}</span></div></div>
            ${a.violations.map((v) => `<div class="tl bad"><i></i><div><b>${esc(v.label)}</b><span>${fmtDateTime(v.at)}</span></div></div>`).join('')}
            ${a.finishedAt ? `<div class="tl ${a.passed ? 'ok' : 'bad'}"><i></i><div><b>Yakunlandi — ${a.score}%</b><span>${fmtDateTime(a.finishedAt)}</span></div></div>` : ''}</div></div>
        ${c.proctorCamera || a.snapshots.length ? `<div class="card"><div class="card-head"><h2>Kamera suratlari</h2><span class="small muted">${a.snapshots.length} ta</span></div>
          ${a.snapshots.length ? `<div class="snap-grid">${a.snapshots.map((s) => `<button class="snap ${s.kind === 'violation' ? 'bad' : ''}" data-src="/api/admin/snapshots/${s.id}" data-cap="${esc(kindLabel[s.kind] || s.kind)} · ${fmtDateTime(s.createdAt)}"><img loading="lazy" src="/api/admin/snapshots/${s.id}" alt=""><span>${kindLabel[s.kind] || s.kind} · ${fmtTimeOfDay(s.createdAt)}</span></button>`).join('')}</div>` : '<div class="empty">Suratlar yo\'q</div>'}</div>` : ''}
      </div>
    </div>`));
  const fit = () => { $('#ag').style.gridTemplateColumns = window.matchMedia('(max-width: 1000px)').matches ? 'minmax(0,1fr)' : 'minmax(0,1.5fr) minmax(0,1fr)'; };
  fit(); window.addEventListener('resize', fit); onCleanup(() => window.removeEventListener('resize', fit));
  $('#rvf').addEventListener('click', (e) => { const b = e.target.closest('[data-f]'); if (!b) return; onlyWrong = b.dataset.f === 'wrong'; $$('#rvf .chip').forEach((x) => x.classList.toggle('on', x === b)); $('#rvl').innerHTML = reviewHtml(a.review, { onlyWrong, labels: ['Xodim javobi', "To'g'ri javob"] }) || '<div class="empty">Xato yo\'q</div>'; });
  $('#asw')?.addEventListener('change', (e) => { location.hash = `#/admin/attempts/${e.target.value}`; });
  $('[data-grant]')?.addEventListener('click', async () => {
    if (!(await confirmBox('Qayta topshirishga ruxsat berasizmi?', `${esc(a.user.name)}ga yana 1 ta urinish beriladi va xabar yuboriladi.`, 'Ruxsat berish'))) return;
    try { await api(`/admin/courses/${c.id}/users/${a.user.id}/grant`, { method: 'POST' }); toast('Ruxsat berildi', 'success'); router(); } catch (e) { toastErr(e); }
  });
  $('[data-reset]').addEventListener('click', async () => {
    if (!(await confirmBox('Treningni qayta tayinlaysizmi?', `${esc(a.user.name)}ning materiallar bo'yicha jarayoni va barcha urinishlari o'chiriladi — trening boshidan o'tiladi.`, 'Qayta tayinlash', true))) return;
    try { await api(`/admin/courses/${c.id}/users/${a.user.id}/reset`, { method: 'POST', body: { materials: true } }); toast('Trening qayta tayinlandi', 'success'); location.hash = `#/admin/results/${c.id}`; } catch (e) { toastErr(e); }
  });
  $$('.snap').forEach((s) => s.addEventListener('click', () => openModal({ title: s.dataset.cap, wide: true, body: `<img src="${s.dataset.src}" alt="" style="width:100%;border-radius:12px;display:block">` })));
}

// ================================================================ router
const routes = [
  [/^\/login$/, pageLogin, 'public'],
  [/^\/$/, pageHome],
  [/^\/trainings$/, pageTrainings],
  [/^\/tests$/, pageTests],
  [/^\/results$/, pageMyResults],
  [/^\/profile$/, pageProfile],
  [/^\/course\/(\d+)$/, pageCourse],
  [/^\/course\/(\d+)\/lesson\/(\d+)$/, pageLesson],
  [/^\/course\/(\d+)\/test$/, pageTest],
  [/^\/attempt\/(\d+)$/, pageResult],
  [/^\/certificate\/(\d+)$/, pageCertificate],
  [/^\/admin$/, adminDashboard, 'admin'],
  [/^\/admin\/users$/, adminUsers, 'admin'],
  [/^\/admin\/users\/(\d+)$/, adminUser, 'admin'],
  [/^\/admin\/trainings$/, adminTrainings, 'admin'],
  [/^\/admin\/trainings\/(\d+)$/, adminTraining, 'admin'],
  [/^\/admin\/tests$/, adminTests, 'admin'],
  [/^\/admin\/tests\/(\d+)$/, adminTest, 'admin'],
  [/^\/admin\/results$/, adminResultsList, 'admin'],
  [/^\/admin\/results\/(\d+)$/, adminResults, 'admin'],
  [/^\/admin\/attempts\/(\d+)$/, adminAttempt, 'admin'],
  // eski havolalar
  [/^\/admin\/courses(?:\/(\d+))?(?:\/\w+)?$/, (id) => { location.hash = id ? `#/admin/trainings/${id}` : '#/admin/trainings'; }, 'admin'],
];
let routeSeq = 0;
async function router() {
  cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  cleanups = [];
  const seq = ++routeSeq;
  const path = (location.hash.replace(/^#/, '') || '/').split('?')[0];
  if (!state.me && path !== '/login') { location.hash = '#/login'; return; }
  if (state.me && path === '/login') { location.hash = state.me.role === 'admin' ? '#/admin' : '#/'; return; }
  for (const [re, fn, kind] of routes) {
    const m = path.match(re);
    if (!m) continue;
    if (kind === 'admin' && state.me.role !== 'admin') { location.hash = '#/'; return; }
    try { await fn(...m.slice(1).map((x) => (x === undefined ? x : x))); }
    catch (e) {
      if (seq !== routeSeq || !state.me) return;
      render(shell('', `<div class="card empty">${I.info}<h3>Xatolik</h3><p style="margin-bottom:16px">${esc(e.message)}</p><a class="btn" href="${state.me.role === 'admin' ? '#/admin' : '#/'}">Bosh sahifa</a></div>`));
    }
    return;
  }
  location.hash = state.me.role === 'admin' ? '#/admin' : '#/';
}

// ================================================================ telefon maskasi
function phoneDigits(v) { let d = String(v || '').replace(/\D/g, ''); if (d.length > 9 && d.startsWith('998')) d = d.slice(3); return d.slice(0, 9); }
function maskPhone(v) { const d = phoneDigits(v); return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' '); }
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches?.('input[data-phone]')) return;
  const before = phoneDigits(el.value.slice(0, el.selectionStart ?? el.value.length)).length;
  el.value = maskPhone(el.value);
  let pos = 0, seen = 0;
  while (pos < el.value.length && seen < before) { if (/\d/.test(el.value[pos])) seen++; pos++; }
  try { el.setSelectionRange(pos, pos); } catch { /* ignore */ }
  el.closest('.phone-in')?.classList.remove('bad');
});
document.addEventListener('paste', (e) => {
  const el = e.target;
  if (!el.matches?.('input[data-phone]')) return;
  e.preventDefault();
  el.value = maskPhone((e.clipboardData || window.clipboardData).getData('text'));
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
function checkPhone(input) {
  const ok = phoneDigits(input.value).length === 9;
  input.closest('.phone-in')?.classList.toggle('bad', !ok);
  if (!ok) { toast("Telefon raqamni to'liq kiriting: 90 123 45 67", 'error'); input.focus(); }
  return ok;
}

// ================================================================ mobil jadvallar + o'zbekcha apostroflar
function labelTables() {
  $$('table.table.cards').forEach((t) => {
    const hs = $$('thead th', t).map((th) => th.textContent.trim());
    $$('tbody tr', t).forEach((tr) => [...tr.children].forEach((td, i) => { if (td.colSpan > 1 || td.dataset.label !== undefined) return; td.dataset.label = hs[i] || ''; }));
  });
}
// o' g' → o‘ g‘ ; boshqa harf'harf → ’ (faqat matn tugunlarida, inputlarga tegmaydi)
const uzq = (s) => s.replace(/([OoGg])['`ʻ]/g, '$1‘').replace(/(\p{L})['`](\p{L})/gu, '$1’$2');
function fixQuotes(root) {
  if (root.nodeType === 3) { if (/['`ʻ]/.test(root.nodeValue) && !root.parentElement?.closest('textarea,script,style,[data-raw]')) { const v = uzq(root.nodeValue); if (v !== root.nodeValue) root.nodeValue = v; } return; }
  if (root.nodeType !== 1 || root.closest?.('textarea,script,style,[data-raw]')) return;
  const w = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let n;
  while ((n = w.nextNode())) { if (/['`ʻ]/.test(n.nodeValue) && !n.parentElement.closest('textarea,script,style,[data-raw]')) { const v = uzq(n.nodeValue); if (v !== n.nodeValue) n.nodeValue = v; } }
  root.querySelectorAll?.('[placeholder]').forEach((el) => { const v = uzq(el.placeholder); if (v !== el.placeholder) el.placeholder = v; });
}
new MutationObserver((muts) => {
  for (const m of muts) {
    if (m.type === 'characterData') fixQuotes(m.target);
    else m.addedNodes.forEach(fixQuotes);
  }
  labelTables();
}).observe(document.body, { childList: true, subtree: true, characterData: true });

(async function boot() {
  try {
    const r = await api('/me');
    state.me = r.user;
    state.appName = r.appName || state.appName;
    state.companyName = r.companyName || '';
    document.title = uzq(state.appName);
  } catch { /* offline */ }
  window.addEventListener('hashchange', router);
  router();
})();
