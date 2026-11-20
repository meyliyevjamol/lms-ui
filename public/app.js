'use strict';
/* Korporativ LMS — SPA (vanilla JS, hash routing) */

const $app = document.getElementById('app');
const state = { me: null, appName: 'Korporativ LMS' };
let cleanups = [];
const onCleanup = (fn) => cleanups.push(fn);

// ------------------------------------------------------------ utils
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const pad = (n) => String(n).padStart(2, '0');
function fmtDate(iso) {
  if (!iso) return '—';
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + 'T00:00:00') : new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}
function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return `${fmtDate(iso)} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function fmtSize(b) {
  if (!b) return '';
  if (b < 1024 * 1024) return Math.round(b / 1024) + ' KB';
  return (b / 1024 / 1024).toFixed(1) + ' MB';
}
const fmtPhone = (p) => {
  const d = String(p || '');
  return d.length === 12 ? `+${d.slice(0, 3)} ${d.slice(3, 5)} ${d.slice(5, 8)} ${d.slice(8, 10)} ${d.slice(10)}` : d;
};
const plural = (n, w) => `${n} ta ${w}`;
function daysLeft(deadline) {
  if (!deadline) return null;
  const end = new Date(deadline + 'T23:59:59').getTime();
  return Math.ceil((end - Date.now()) / 864e5);
}
function store(key, val) {
  try {
    if (val === undefined) return JSON.parse(sessionStorage.getItem(key) || 'null');
    if (val === null) sessionStorage.removeItem(key); else sessionStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
}
function lstore(key, val) {
  try {
    if (val === undefined) return JSON.parse(localStorage.getItem(key) || 'null');
    localStorage.setItem(key, JSON.stringify(val));
  } catch { return null; }
}

async function api(path, { method = 'GET', body } = {}) {
  const opt = { method, headers: {}, credentials: 'same-origin' };
  if (body !== undefined) { opt.headers['Content-Type'] = 'application/json'; opt.body = JSON.stringify(body); }
  const r = await fetch('/api' + path, opt);
  let data = null;
  try { data = await r.json(); } catch { /* empty */ }
  if (r.status === 401 && path !== '/auth/login') {
    state.me = null;
    location.hash = '#/login';
    throw new Error('Avval tizimga kiring');
  }
  if (!r.ok) throw new Error(data?.error || 'Xatolik yuz berdi');
  return data;
}
function uploadForm(path, form, onProgress) {
  return new Promise((resolve, reject) => {
    const x = new XMLHttpRequest();
    x.open('POST', '/api' + path);
    x.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    x.onload = () => {
      let data = null;
      try { data = JSON.parse(x.responseText); } catch { /* empty */ }
      if (x.status >= 200 && x.status < 300) resolve(data); else reject(new Error(data?.error || 'Yuklashda xatolik'));
    };
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

function openModal({ title, body, foot = '', wide = false, onMount }) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-close aria-label="Yopish">${I.x}</button></div>
    <div class="modal-body">${body}</div>${foot ? `<div class="modal-foot">${foot}</div>` : ''}</div>`;
  document.body.appendChild(back);
  const close = () => { back.remove(); document.removeEventListener('keydown', onKey); };
  const onKey = (e) => e.key === 'Escape' && close();
  document.addEventListener('keydown', onKey);
  back.addEventListener('mousedown', (e) => { if (e.target === back) close(); });
  $$('[data-close]', back).forEach((b) => b.addEventListener('click', close));
  onMount?.(back, close);
  onCleanup(close);
  const first = $('input, textarea, select', back);
  if (first) setTimeout(() => first.focus(), 30);
  return close;
}
function confirmBox(title, text, okText = 'Tasdiqlash', danger = false) {
  return new Promise((resolve) => {
    let done = false;
    openModal({
      title,
      body: `<p>${text}</p>`,
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
  catch {
    const ta = document.createElement('textarea'); ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Nusxa olindi', 'success'); } catch { toast("Nusxa olib bo'lmadi", 'error'); }
    ta.remove();
  }
}
function downloadCsv(name, rows) {
  const csv = '﻿' + rows.map((r) => r.map((c) => {
    const s = String(c ?? '');
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }).join(';')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
function loadScript(src) {
  return new Promise((resolve, reject) => {
    if ($(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = () => reject(new Error("Kutubxonani yuklab bo'lmadi"));
    document.head.appendChild(s);
  });
}

// ------------------------------------------------------------ icons
const svg = (p) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p}</svg>`;
const I = {
  logo: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"><path d="M3 9l9-5 9 5-9 5-9-5z"/><path d="M7 11.5V16c0 1.7 2.2 3 5 3s5-1.3 5-3v-4.5"/></svg>`,
  home: svg('<path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/>'),
  book: svg('<path d="M4 4.5A2.5 2.5 0 0 1 6.5 2H20v17H6.5A2.5 2.5 0 0 0 4 21.5z"/><path d="M4 19.5V4.5"/>'),
  users: svg('<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.5-3.5 3.2-5.5 6.5-5.5s6 2 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7"/><path d="M18 14.5c2 .6 3.3 2.6 3.5 5.5"/>'),
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
  test: svg('<path d="M9 11l3 3 8-8"/><path d="M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9"/>'),
  check: svg('<path d="M20 6L9 17l-5-5"/>'),
  lock: svg('<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'),
  back: svg('<path d="M15 18l-6-6 6-6"/>'),
  next: svg('<path d="M9 18l6-6-6-6"/>'),
  upload: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M17 8l-5-5-5 5"/><path d="M12 3v12"/>'),
  download: svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><path d="M7 10l5 5 5-5"/><path d="M12 15V3"/>'),
  award: svg('<circle cx="12" cy="8" r="6"/><path d="M8.2 13.2L7 22l5-3 5 3-1.2-8.8"/>'),
  info: svg('<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>'),
  clock: svg('<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>'),
  copy: svg('<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'),
  chart: svg('<path d="M3 3v18h18"/><path d="M7 15l4-4 3 3 5-6"/>'),
  playFill: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.14v13.72a1 1 0 0 0 1.5.86l11-6.86a1 1 0 0 0 0-1.72l-11-6.86A1 1 0 0 0 8 5.14z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4.5" width="4" height="15" rx="1"/><rect x="14" y="4.5" width="4" height="15" rx="1"/></svg>',
  volume: svg('<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M15.5 8.5a5 5 0 0 1 0 7M19 5a10 10 0 0 1 0 14"/>'),
  mute: svg('<path d="M11 5L6 9H2v6h4l5 4z"/><path d="M23 9l-6 6M17 9l6 6"/>'),
  expand: svg('<path d="M8 3H5a2 2 0 0 0-2 2v3M21 8V5a2 2 0 0 0-2-2h-3M3 16v3a2 2 0 0 0 2 2h3M16 21h3a2 2 0 0 0 2-2v-3"/>'),
  camera: svg('<path d="M23 7l-7 5 7 5z"/><rect x="1" y="5" width="15" height="14" rx="2"/>'),
  shield: svg('<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/>'),
  monitor: svg('<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>'),
  refresh: svg('<path d="M23 4v6h-6"/><path d="M20.5 15a9 9 0 1 1-2.1-9.4L23 10"/>'),
  target: svg('<circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>'),
  alert: svg('<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>'),
  play: svg('<circle cx="12" cy="12" r="10"/><path d="M10 8l6 4-6 4z"/>'),
  spark: svg('<path d="M12 3l1.9 5.8L20 10.7l-5.1 3.6L16.7 21 12 17.3 7.3 21l1.8-6.7L4 10.7l6.1-1.9z"/>'),
  layers: svg('<path d="M12 2l10 5-10 5L2 7z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>'),
  print: svg('<path d="M6 9V2h12v7"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>'),
};
const lessonIcon = (l) => (l.type === 'video' ? I.video : l.type === 'text' ? I.text : ['ppt', 'pptx', 'pps', 'ppsx', 'odp'].includes(l.sourceType) ? I.slides : I.file);
const lessonKind = (l) => (l.type === 'video' ? 'Video' : l.type === 'text' ? 'Matn' : l.sourceType ? `Taqdimot (${l.sourceType.toUpperCase()})` : 'PDF hujjat');

const lessonTone = (l) => (l.type === 'video' ? 'type-video' : l.type === 'text' ? 'type-text' : ['ppt', 'pptx', 'pps', 'ppsx', 'odp'].includes(l.sourceType) ? 'type-slides' : 'type-pdf');
const AV_COLORS = ['#5b4cf5', '#e3489b', '#10a56f', '#2f7cf6', '#c27806', '#9b5cf6', '#0e9aa7', '#e5484d'];
function avatar(name, size = '') {
  const parts = String(name || '?').trim().split(/\s+/);
  const ini = ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase();
  let h = 0; for (const ch of String(name)) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const c = AV_COLORS[h % AV_COLORS.length];
  return `<span class="avatar ${size}" style="background:linear-gradient(135deg,${c},${c}cc)">${esc(ini)}</span>`;
}
const statCard = (icon, label, value, sub = '', tone = 'indigo') => `<div class="card stat tone-${tone}"><div class="stat-ic">${icon}</div>
  <div style="min-width:0"><div class="stat-label">${label}</div><div class="stat-value">${value}</div>${sub ? `<div class="stat-sub">${sub}</div>` : ''}</div></div>`;
function ring(pct, label, size = 128, onDark = true) {
  const r = 52, C = 2 * Math.PI * r;
  return `<div class="ring" style="width:${size}px;height:${size}px"><svg viewBox="0 0 120 120">
    <circle cx="60" cy="60" r="${r}" stroke="${onDark ? 'rgba(255,255,255,.22)' : '#ecedf6'}" stroke-width="11" fill="none"/>
    <circle cx="60" cy="60" r="${r}" stroke="${onDark ? '#fff' : 'url(#rg)'}" stroke-width="11" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct / 100)}"/>
    </svg><div class="ring-in"><div><b>${pct}%</b><span>${label}</span></div></div></div>`;
}
const svgDefs = `<svg width="0" height="0" style="position:absolute"><defs><linearGradient id="rg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#2f5bff"/><stop offset="1" stop-color="#7aa0ff"/></linearGradient><linearGradient id="rgw" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#ffb27f"/></linearGradient></defs></svg>`;

const STATUS = {
  completed: ['badge-green', 'Tugatgan'],
  in_progress: ['badge-blue', 'Jarayonda'],
  not_started: ['badge-gray', 'Boshlanmagan'],
  failed: ['badge-red', "O'ta olmadi"],
};
const statusBadge = (s, overdue) => {
  const [cls, label] = STATUS[s] || STATUS.not_started;
  return `<span class="badge ${cls}">${label}</span>${overdue ? ' <span class="badge badge-red">Muddati o\'tgan</span>' : ''}`;
};
const progressBar = (p, green) => `<div class="progress ${green ? 'green' : ''}"><i style="width:${Math.max(0, Math.min(100, p))}%"></i></div>`;
const COVERS = [
  'radial-gradient(260px 160px at 100% 0%,rgba(77,123,255,.55),transparent 70%),linear-gradient(135deg,#0b1230 0%,#1d3bb8 100%)',
  'radial-gradient(260px 160px at 100% 0%,rgba(255,170,110,.5),transparent 70%),linear-gradient(135deg,#2a1206 0%,#e8641c 100%)',
  'radial-gradient(260px 160px at 100% 0%,rgba(80,230,200,.45),transparent 70%),linear-gradient(135deg,#06262a 0%,#0e8f8a 100%)',
  'radial-gradient(260px 160px at 100% 0%,rgba(170,150,255,.5),transparent 70%),linear-gradient(135deg,#140d38 0%,#5b45d6 100%)',
  'radial-gradient(260px 160px at 100% 0%,rgba(255,130,130,.45),transparent 70%),linear-gradient(135deg,#2c0a12 0%,#c9303a 100%)',
  'radial-gradient(260px 160px at 100% 0%,rgba(120,230,160,.45),transparent 70%),linear-gradient(135deg,#062417 0%,#128a57 100%)',
];
const CAT_STYLE = { onboarding: 0, sotuv: 1, servis: 2, "ko'nikmalar": 3, xavfsizlik: 4, majburiy: 5 };
const cover = (id, cat) => {
  const k = String(cat || '').toLowerCase();
  return COVERS[(k in CAT_STYLE ? CAT_STYLE[k] : id) % COVERS.length];
};
const catIcon = (cat) => ({ onboarding: I.spark, sotuv: I.chart, servis: I.users, xavfsizlik: I.shield, majburiy: I.alert, "ko'nikmalar": I.layers }[String(cat || '').toLowerCase()] || I.book);
const loading = () => '<div class="boot" style="height:50vh"><div class="spinner"></div></div>';
function deadlineText(c) {
  if (!c.deadline) return '<span class="faint">Muddatsiz</span>';
  const d = daysLeft(c.deadline);
  if (c.status === 'completed') return `Muddat: ${fmtDate(c.deadline)}`;
  if (d < 0) return `<span style="color:var(--red)">Muddat o'tgan: ${fmtDate(c.deadline)}</span>`;
  if (d <= 3) return `<span style="color:var(--amber)">${d === 0 ? 'Bugun' : d + ' kun'} qoldi</span>`;
  return `Muddat: ${fmtDate(c.deadline)}`;
}

// ------------------------------------------------------------ shells
function adminShell(active, inner) {
  const links = [
    ['dash', '#/admin', I.home, 'Bosh sahifa'],
    ['courses', '#/admin/courses', I.book, 'Kurslar'],
    ['users', '#/admin/users', I.users, 'Xodimlar'],
  ];
  const nav = links.map(([k, h, i, t]) => `<a class="nav-link ${active === k ? 'active' : ''}" href="${h}">${i}<span>${t}</span></a>`).join('');
  return `<div class="layout">
    <aside class="sidebar">
      <div class="brand"><div class="brand-logo">${I.logo}</div>${esc(state.appName)}</div>
      <div class="nav-label">Boshqaruv</div>
      ${nav}
      <div class="sidebar-promo"><b>${I.spark.replace('<svg', '<svg width="14" height="14" style="vertical-align:-2px;margin-right:4px"')}Maslahat</b><p>Savollarni Word'dan nusxa olib, «Matndan import» orqali bir zumda qo'shing.</p></div>
      <div class="sidebar-foot">
        <div class="who">${avatar(state.me.name, 'sm')}<div style="min-width:0"><b>${esc(state.me.name)}</b><span>Administrator</span></div></div>
        <a class="nav-link ${active === 'profile' ? 'active' : ''}" href="#/profile">${I.user}<span>Profil</span></a>
        <a class="nav-link" href="#" data-logout>${I.logout}<span>Chiqish</span></a>
      </div>
    </aside>
    <div style="min-width:0">
      <header class="m-top"><a class="brand" href="#/admin"><div class="brand-logo">${I.logo}</div>${esc(state.appName)}</a>
        <a href="#/profile" class="m-av">${avatar(state.me.name, 'sm')}</a></header>
      <main class="main">${inner}</main>
    </div>
  </div>
  ${tabbar([['dash', '#/admin', I.home, 'Asosiy'], ['courses', '#/admin/courses', I.book, 'Kurslar'], ['users', '#/admin/users', I.users, 'Xodimlar'], ['profile', '#/profile', I.user, 'Profil']], active)}`;
}
function tabbar(items, active) {
  return `<nav class="tabbar">${items.map(([k, h, i, t]) => `<a class="tb ${active === k ? 'on' : ''}" href="${h}">${i}<span>${t}</span></a>`).join('')}</nav>`;
}
function empShell(inner) {
  const isAdmin = state.me.role === 'admin';
  return `<header class="topbar"><div class="topbar-in">
      <a class="brand" href="${isAdmin ? '#/admin' : '#/'}"><div class="brand-logo">${I.logo}</div><span class="hide-sm">${esc(state.appName)}</span></a>
      ${isAdmin ? '<span class="badge badge-amber">Admin: xodim ko\'rinishi</span>' : ''}
      <div class="topbar-right">
        ${isAdmin ? `<a class="btn btn-sm" href="#/admin/courses">Admin panel</a>` : `<a class="btn btn-sm btn-ghost hide-sm" href="#/">Kurslarim</a>`}
        <a class="row" style="gap:8px;color:var(--text);font-weight:700" href="#/profile" title="Profil">${avatar(state.me.name, 'sm')}<span class="hide-sm">${esc(state.me.name.split(' ')[0])}</span></a>
        <button class="icon-btn hide-sm" data-logout title="Chiqish">${I.logout}</button>
      </div>
    </div></header>
    <div class="container">${inner}</div>
    ${isAdmin ? '' : tabbar([['home', '#/', I.home, 'Kurslarim'], ['profile', '#/profile', I.user, 'Profil']], location.hash.startsWith('#/profile') ? 'profile' : 'home')}`;
}
const shell = (active, inner) => (state.me.role === 'admin' ? adminShell(active, inner) : empShell(inner));
function bindShell() {
  $$('[data-logout]').forEach((b) => b.addEventListener('click', async (e) => {
    e.preventDefault();
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.me = null;
    location.hash = '#/login';
  }));
}
function render(html) { $app.innerHTML = svgDefs + html; bindShell(); window.scrollTo(0, 0); }

// ------------------------------------------------------------ login
function pageLogin() {
  $app.innerHTML = `<div class="login-wrap">
    <div class="login-art">
      <div class="orb o1"></div><div class="orb o2"></div><div class="orb o3"></div>
      <div class="brand" style="padding:0"><div class="brand-logo">${I.logo}</div>${esc(state.appName)}</div>
      <div>
        <h2>Jamoangizni <em>o'qiting</em>, bilimini <em>o'lchang</em></h2>
        <p class="sub">Video darslar, taqdimotlar va testlar — bitta platformada. Har bir xodimning natijasi real vaqtda ko'z oldingizda.</p>
        <div class="mock-stage">
          <div class="mock mock-1"><div class="t">Sotuv texnikasi asoslari</div><b>4 / 5 dars tugatildi</b><div class="bar"><i></i></div></div>
          <div class="mock mock-2"><div class="t">Test natijasi</div><div class="big">92%</div><div class="t">O'tdi ✓</div></div>
          <div class="mock mock-3"><div class="ic">${I.award}</div><div><b>Sertifikat berildi</b><div class="t">Aziza Karimova · bugun</div></div></div>
        </div>
      </div>
      <div class="login-feats"><span>${I.video}Video va PDF</span><span>${I.test}Testlar</span><span>${I.chart}Hisobotlar</span><span>${I.award}Sertifikatlar</span></div>
    </div>
    <div class="login-form"><form class="login-box stack" id="f" autocomplete="on">
      <div class="brand login-mobile-brand" style="padding:0;color:var(--text)"><div class="brand-logo">${I.logo}</div>${esc(state.appName)}</div>
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
      const phone = '998' + phoneDigits($('#ph').value);
      const r = await api('/auth/login', { method: 'POST', body: { phone, password: $('#pw').value } });
      state.me = r.user;
      location.hash = r.user.role === 'admin' ? '#/admin' : '#/';
    } catch (err) { toastErr(err); btn.disabled = false; }
  });
}

// ------------------------------------------------------------ employee: home
async function pageHome() {
  if (state.me.role === 'admin') { location.hash = '#/admin'; return; }
  render(empShell(loading()));
  const courses = await api('/my/courses');
  const done = courses.filter((c) => c.status === 'completed').length;
  const active = courses.filter((c) => c.status === 'in_progress').length;
  const overdue = courses.filter((c) => c.overdue).length;
  const sorted = [...courses].sort((a, b) => (a.status === 'completed') - (b.status === 'completed') || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const overall = courses.length ? Math.round(courses.reduce((s, c) => s + c.progress, 0) / courses.length) : 0;
  const nextC = sorted.find((c) => c.status === 'in_progress') || sorted.find((c) => c.status === 'not_started');
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Xayrli tong' : hour < 18 ? 'Xayrli kun' : 'Xayrli kech';
  render(empShell(`
    <section class="hero"><div class="hero-row">
      <div style="flex:1;min-width:240px">
        <span class="badge badge-white no-dot">${greet} 👋</span>
        <h1 style="margin-top:12px">${esc(state.me.name.split(' ')[0])}, bugun ham <em>bir qadam</em> oldinga!</h1>
        <p style="margin-top:8px">${nextC ? `Keyingi kurs: <b>${esc(nextC.title)}</b>` : courses.length ? 'Barcha kurslarni tugatdingiz — ajoyib natija!' : "Sizga kurs tayinlanganda shu yerda ko'rinadi"}</p>
        <div class="hero-stats">
          <div class="hero-stat"><b>${courses.length}</b><span>Kurslar</span></div>
          <div class="hero-stat"><b>${active}</b><span>Jarayonda</span></div>
          <div class="hero-stat"><b>${done}</b><span>Tugatilgan</span></div>
          ${overdue ? `<div class="hero-stat" style="background:rgba(229,72,77,.35)"><b>${overdue}</b><span>Muddati o'tgan</span></div>` : ''}
        </div>
        ${nextC ? `<a class="btn btn-white" style="margin-top:20px" href="#/course/${nextC.id}">${I.play}${nextC.status === 'in_progress' ? 'Davom ettirish' : "O'qishni boshlash"}</a>` : ''}
      </div>
      ${courses.length ? ring(overall, 'umumiy', 140) : ''}
    </div></section>
    ${courses.length ? `<div class="section-title"><h2>Mening kurslarim</h2><span class="small muted">${courses.length} ta kurs</span></div>
      <div class="grid grid-3">${sorted.map(courseCard).join('')}</div>`
    : `<div class="card empty">${I.book}<h3>Hozircha kurslar yo'q</h3><p>Sizga kurs tayinlanganda shu yerda ko'rinadi</p></div>`}
  `));
}
function courseCard(c) {
  return `<a class="card course-card" href="#/course/${c.id}">
    <div class="course-cover" style="background:${cover(c.id, c.category)}">
      <div class="cover-ic">${c.status === 'completed' ? I.award : catIcon(c.category)}</div>${c.category ? `<span class="cat">${esc(c.category)}</span>` : ''}<div class="big-ic">${catIcon(c.category)}</div>
      ${statusBadge(c.status, c.overdue).replace(/badge-(gray|blue|green|red)/, 'badge-white')}
      ${c.best !== null ? `<span class="badge badge-white no-dot">${I.target.replace('<svg', '<svg width="12" height="12"')} ${c.best}%</span>` : '<span></span>'}
    </div>
    <div class="course-body">
      <h3>${esc(c.title)}</h3>
      <div class="meta-chips"><span class="meta-chip">${I.layers}${plural(c.lessonsTotal, 'dars')}</span>${c.hasTest ? `<span class="meta-chip">${I.test}Test</span>` : ''}</div>
      <div><div class="row small" style="justify-content:space-between;margin-bottom:6px"><span class="muted">Jarayon</span><b>${c.progress}%</b></div>${progressBar(c.progress, c.status === 'completed')}</div>
      <div class="course-meta"><span>${deadlineText(c)}</span><span class="grad-text" style="font-weight:700">${c.status === 'completed' ? 'Ko\'rish' : c.status === 'not_started' ? 'Boshlash' : 'Davom etish'} →</span></div>
    </div>
  </a>`;
}

// ------------------------------------------------------------ employee: course
async function pageCourse(id) {
  render(shell('courses', loading()));
  const { course: c, state: st } = await api(`/my/courses/${id}`);
  const nextLesson = st.lessons.find((l) => !l.completed && !l.locked);
  const testLocked = st.lessonsDone < st.lessonsTotal;
  let cta = '';
  if (st.status === 'completed') cta = `<a class="btn btn-primary" href="#/certificate/${c.id}">${I.award}Sertifikat</a>`;
  else if (nextLesson) cta = `<a class="btn btn-primary" href="#/course/${c.id}/lesson/${nextLesson.id}">${st.lessonsDone ? 'Davom ettirish' : 'Boshlash'}${I.next}</a>`;
  else if (st.canStartTest) cta = `<button class="btn btn-primary" data-start>${st.openAttemptId ? 'Testni davom ettirish' : 'Testni boshlash'}</button>`;

  const testStep = st.hasTest ? (() => {
    const cls = st.passed ? 'done' : testLocked ? 'locked' : !nextLesson ? 'current' : '';
    const meta = [`${st.testQuestionCount} savol`, `o'tish bali ${c.passScore}%`, c.timeLimitMin ? `${c.timeLimitMin} daqiqa` : 'vaqt cheklanmagan',
      st.attemptsLeft === null ? 'urinishlar cheklanmagan' : `${st.attemptsLeft} urinish qoldi`].join(' · ');
    const right = st.passed ? `<span class="badge badge-green">${st.best}% · O'tdi</span>`
      : st.status === 'failed' ? `<span class="badge badge-red">Eng yaxshi: ${st.best}%</span>`
      : testLocked ? ''
      : `<button class="btn btn-primary btn-sm" data-start>${st.openAttemptId ? 'Davom ettirish' : 'Boshlash'}</button>`;
    return `<div class="step ${cls}"><div class="step-icon">${st.passed ? I.check : testLocked ? I.lock : I.test}</div>
      <div class="step-body"><b>Yakuniy test</b><span>${meta}${st.best !== null && !st.passed ? ` · eng yaxshi natija: ${st.best}%` : ''}</span></div>${right}</div>`;
  })() : '';

  render(shell('courses', `
    <a class="back" href="${state.me.role === 'admin' ? `#/admin/courses/${c.id}/lessons` : '#/'}">${I.back}Orqaga</a>
    <section class="course-hero" style="background:${cover(c.id, c.category)}">
      <div class="row">${statusBadge(st.status, st.overdue).replace(/badge-(gray|blue|green|red)/g, 'badge-white')}
        <span class="badge badge-white no-dot">${plural(st.lessonsTotal, 'dars')}${st.hasTest ? ' + test' : ''}</span>
        ${c.deadline ? `<span class="badge badge-white no-dot">Muddat: ${fmtDate(c.deadline)}</span>` : ''}</div>
      <h1 style="margin-top:14px">${esc(c.title)}</h1>
      ${c.description ? `<p class="desc">${esc(c.description)}</p>` : ''}
      <div class="course-hero-foot">
        <div class="pbox"><div class="row small" style="justify-content:space-between;margin-bottom:8px;font-weight:600"><span style="opacity:.85">Sizning jarayoningiz</span><b>${st.progress}%</b></div>
          <div class="progress on-dark" style="height:10px"><i style="width:${st.progress}%"></i></div></div>
        ${cta.replace('btn btn-primary', 'btn btn-white')}
      </div>
    </section>
    ${st.status === 'failed' ? `<div class="notice amber" style="margin-bottom:16px">${I.info}<div>Urinishlar soni tugadi. Qayta topshirish uchun administratorga murojaat qiling.</div></div>` : ''}
    <div class="card"><div class="card-head"><h2>Kurs tarkibi</h2><span class="small muted">${st.lessonsDone}/${st.lessonsTotal} dars</span></div>
      <div class="steps">
        ${st.lessons.map((l, i) => {
          const cur = l.id === nextLesson?.id;
          const cls = l.completed ? 'done' : l.locked ? 'locked' : cur ? 'current' : '';
          const inner = `<div class="step-icon">${l.completed ? I.check : l.locked ? I.lock : lessonIcon(l)}</div>
            <div class="step-body"><b>${i + 1}. ${esc(l.title)}</b><span>${lessonKind(l)}${l.completed ? ' · tugatilgan ✓' : cur ? ' · hozirgi dars' : ''}</span></div>
            ${l.locked ? '' : `<span class="go">${I.next}</span>`}`;
          return l.locked ? `<div class="step ${cls}" title="Avval oldingi darsni tugating">${inner}</div>`
            : `<a class="step ${cls}" href="#/course/${c.id}/lesson/${l.id}">${inner}</a>`;
        }).join('')}
        ${testStep}
        ${!st.lessons.length && !st.hasTest ? '<div class="empty">Bu kursda hali materiallar yo\'q</div>' : ''}
      </div>
    </div>
  `));
  $$('[data-start]').forEach((b) => b.addEventListener('click', async () => {
    if (st.openAttemptId || c.proctorCamera || c.proctorScreen) { location.hash = `#/course/${c.id}/test`; return; }
    const ok = await confirmBox('Testni boshlaysizmi?', `
      <div class="stack" style="gap:8px">
        <div>• Savollar soni: <b>${st.testQuestionCount}</b></div>
        <div>• O'tish bali: <b>${c.passScore}%</b></div>
        <div>• Vaqt: <b>${c.timeLimitMin ? c.timeLimitMin + ' daqiqa' : 'cheklanmagan'}</b>${c.timeLimitMin ? ' — vaqt tugasa, test avtomatik topshiriladi' : ''}</div>
        <div>• Qolgan urinishlar: <b>${st.attemptsLeft === null ? 'cheklanmagan' : st.attemptsLeft}</b></div>
      </div>`, 'Boshlash');
    if (ok) location.hash = `#/course/${c.id}/test`;
  }));
}

// ------------------------------------------------------------ employee: lesson
async function pageLesson(cid, lid) {
  render(shell('courses', loading()));
  const { course: c, state: st } = await api(`/my/courses/${cid}`);
  const idx = st.lessons.findIndex((l) => l.id === Number(lid));
  const l = st.lessons[idx];
  if (!l) throw new Error('Dars topilmadi');
  if (l.locked) {
    render(shell('courses', `<a class="back" href="#/course/${c.id}">${I.back}${esc(c.title)}</a>
      <div class="card empty">${I.lock}<h3>Bu dars hali yopiq</h3><p>Avval oldingi darslarni tugating</p></div>`));
    return;
  }
  const next = st.lessons[idx + 1];
  const prev = st.lessons[idx - 1];
  let viewer = '';
  if (l.type === 'video') viewer = `<div class="player" id="player" oncontextmenu="return false">
      <video playsinline preload="metadata" disablePictureInPicture controlsList="nodownload noplaybackrate" src="/api/files/${l.id}#t=0.1"></video>
      <button class="player-big" data-play aria-label="Ijro etish"></button>
      <div class="player-status"></div>
      <div class="player-bar">
        <button class="pbtn" data-play aria-label="Ijro/pauza"></button>
        <span class="ptime" id="pt">0:00 / 0:00</span>
        <div class="ptrack" id="ptrack"><div class="pwatched"></div><div class="pplayed"></div><div class="pthumb"></div></div>
        <button class="pbtn" data-mute aria-label="Ovoz"></button>
        <button class="pbtn" data-fs aria-label="To'liq ekran">${I.expand}</button>
      </div>
    </div>
    ${l.completed ? '' : `<div class="watch-meter"><div class="row small" style="justify-content:space-between;margin-bottom:6px"><span class="muted">${I.lock.replace('<svg', '<svg width="13" height="13" style="vertical-align:-2px"')} Keyingi dars video to'liq ko'rilgandan so'ng ochiladi</span><span>Ko'rildi: <b id="wpct">0%</b></span></div><div class="progress green"><i id="wbar" style="width:0"></i></div></div>`}`;
  else if (l.type === 'pdf') viewer = `<div class="pdf-pages" id="pdf" oncontextmenu="return false"><div class="boot" style="height:300px"><div class="spinner"></div></div></div>`;
  else viewer = `<div class="card text-lesson">${esc(l.content).split(/\n\s*\n/).map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`).join('')}</div>`;

  const hint = l.completed ? `<div class="notice green">${I.check}<div>Bu dars tugatilgan</div></div>`
    : l.type === 'video' ? ''
    : l.type === 'pdf' ? `<div class="notice" id="pdf-hint">${I.info}<div>Materialni oxirgi sahifagacha o'qing, so'ng «Tugatdim» tugmasini bosing.</div></div>` : '';

  const nextHref = next ? `#/course/${c.id}/lesson/${next.id}` : `#/course/${c.id}`;
  const nextLabel = next ? 'Keyingi dars' : st.hasTest ? 'Testga o\'tish' : 'Kursga qaytish';
  render(shell('courses', `
    <a class="back" href="#/course/${c.id}">${I.back}${esc(c.title)}</a>
    <div class="row" style="justify-content:space-between;margin-bottom:18px;align-items:flex-end">
      <div><span class="lesson-kicker">${lessonIcon(l)}${idx + 1}-dars / ${st.lessons.length} · ${lessonKind(l)}</span><h1 style="margin-top:10px">${esc(l.title)}</h1></div>
      <div style="min-width:200px" class="hide-sm"><div class="row small muted" style="justify-content:space-between;margin-bottom:6px"><span>Kurs jarayoni</span><b style="color:var(--text)">${st.progress}%</b></div>${progressBar(st.progress)}</div>
    </div>
    ${viewer}
    ${l.type !== 'text' && l.content ? `<div class="card card-pad" style="margin-top:16px;white-space:pre-wrap">${esc(l.content)}</div>` : ''}
    <div class="lesson-bar">
      ${prev ? `<a class="btn" href="#/course/${c.id}/lesson/${prev.id}">${I.back}Oldingi</a>` : ''}
      <div class="spacer">${hint}</div>
      <button class="btn btn-primary" id="done" ${l.completed || l.type === 'video' ? 'style="display:none"' : ''} ${l.type === 'video' || l.type === 'pdf' ? 'disabled' : ''}>${I.check}Tugatdim</button>
      <a class="btn ${l.completed ? 'btn-primary' : ''}" id="next" href="${nextHref}" ${l.completed ? '' : 'style="display:none"'}>${nextLabel}${I.next}</a>
    </div>
  `));

  let completed = l.completed;
  const btn = $('#done');
  const complete = async (auto) => {
    if (completed) return;
    completed = true;
    try {
      await api(`/my/lessons/${l.id}/complete`, { method: 'POST' });
      btn.style.display = 'none';
      const n = $('#next'); n.style.display = ''; n.classList.add('btn-primary');
      const h = $('.lesson-bar .notice'); if (h) { h.className = 'notice green'; h.innerHTML = `${I.check}<div>Dars tugatildi</div>`; }
      toast(auto ? 'Video oxirigacha ko\'rildi — dars tugatildi' : 'Dars tugatildi', 'success');
    } catch (e) { completed = false; toastErr(e); }
  };
  btn.addEventListener('click', () => complete(false));

  if (l.type === 'video') setupPlayer(l, () => {
    if (completed) return;
    completed = true;
    btn.style.display = 'none';
    const n = $('#next'); n.style.display = ''; n.classList.add('btn-primary');
    const h = $('.lesson-bar .notice'); if (h) { h.className = 'notice green'; h.innerHTML = `${I.check}<div>Video to'liq ko'rildi — dars tugatildi</div>`; }
    toast("Video to'liq ko'rildi — keyingi dars ochildi", 'success');
  });
  if (l.type === 'pdf') renderPdf(l, () => { if (!completed) btn.disabled = false; });
}

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

// ------------------------------------------------------------ employee: test
// ------------------------------------------------------------ proctoring (test nazorati)
const VIOLATION_TEXT = {
  tab_hidden: "Boshqa oyna yoki tabga o'tdingiz", blur: 'Test oynasidan chiqdingiz', fullscreen_exit: "To'liq ekran rejimidan chiqdingiz",
  printscreen: 'Skrinshot olishga urinish aniqlandi', copy: 'Nusxa olishga urinish aniqlandi', print: 'Chop etishga urinish aniqlandi',
  camera_off: "Kamera o'chirildi",
};
const fsSupported = () => !!(document.fullscreenEnabled && document.documentElement.requestFullscreen);

async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Brauzeringiz kamerani qo'llab-quvvatlamaydi");
  try {
    return await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' }, audio: false });
  } catch (e) {
    if (e.name === 'NotAllowedError') throw new Error("Kameraga ruxsat berilmadi. Brauzer manzil satridagi kamera belgisini bosib, ruxsat bering");
    if (e.name === 'NotFoundError') throw new Error('Kamera topilmadi. Kamera ulanganini tekshiring');
    throw new Error("Kamerani yoqib bo'lmadi: " + e.message);
  }
}

// Testdan oldingi tekshiruv ekrani. resolve(stream|null) — boshlashga tayyor
function precheck(c, st, resuming) {
  return new Promise((resolve) => {
    let stream = null;
    const needCam = c.proctorCamera, needScreen = c.proctorScreen;
    render(shell('courses', `
      <a class="back" href="#/course/${c.id}">${I.back}${esc(c.title)}</a>
      <div class="precheck">
        <div class="card precheck-main">
          <div class="pc-head">
            <div class="pc-badge">${I.shield}</div>
            <div><span class="lesson-kicker">${resuming ? 'Testni davom ettirish' : 'Yakuniy test'}</span>
            <h1 style="margin-top:10px">Nazorat ostidagi test</h1>
            <p class="muted" style="margin-top:6px">Boshlashdan oldin quyidagi shartlar bilan tanishing</p></div>
          </div>
          <div class="pc-facts">
            <div><b>${st.testQuestionCount}</b><span>savol</span></div>
            <div><b>${c.timeLimitMin ? c.timeLimitMin + ' daq' : '∞'}</b><span>vaqt</span></div>
            <div><b>${c.passScore}%</b><span>o'tish bali</span></div>
            <div><b>${st.attemptsLeft === null ? '∞' : st.attemptsLeft}</b><span>urinish qoldi</span></div>
          </div>
          <ul class="rules">
            ${needScreen ? `<li><span class="ri">${I.monitor}</span><div><b>To'liq ekran rejimi</b><p>Test to'liq ekranda o'tadi. Boshqa oyna yoki tabga o'tish, skrinshot va nusxa olish urinishlari qayd etiladi.</p></div></li>` : ''}
            ${needScreen && c.maxViolations ? `<li><span class="ri warn">${I.alert}</span><div><b>${c.maxViolations} ta qoidabuzarlik — test yakunlanadi</b><p>Har bir qoidabuzarlikda ogohlantirish beriladi. Limitga yetganda test javoblaringiz bilan avtomatik topshiriladi.</p></div></li>` : ''}
            ${needCam ? `<li><span class="ri">${I.camera}</span><div><b>Kamera yoqilgan bo'lishi shart</b><p>Test davomida kamerangizdan vaqti-vaqti bilan surat olinadi va faqat administratorga ko'rinadi.</p></div></li>` : ''}
            <li><span class="ri">${I.info}</span><div><b>Javoblar avtomatik saqlanadi</b><p>Internet uzilsa yoki sahifa yangilansa, javoblaringiz yo'qolmaydi.${c.timeLimitMin ? " Vaqt tugaganda test o'zi topshiriladi." : ''}</p></div></li>
          </ul>
          <label class="check consent"><input type="checkbox" id="agree"> <span>Shartlar bilan tanishdim${needCam ? ' va test davomida kamera orqali surat olinishiga roziman' : ''}</span></label>
          <button class="btn btn-primary btn-lg btn-block" id="go" disabled>${I.playFill}${resuming ? 'Davom ettirish' : 'Testni boshlash'}</button>
        </div>
        ${needCam ? `<div class="card cam-check">
          <div class="cam-view" id="camview"><div class="cam-empty">${I.camera}<span>Kamera o'chiq</span></div></div>
          <div class="card-pad stack" style="gap:12px">
            <div class="row" style="justify-content:space-between"><b>Kamera tekshiruvi</b><span class="badge badge-gray" id="camstate">Kutilmoqda</span></div>
            <p class="small muted">Yuzingiz kadrda aniq ko'rinsin, xona yorug' bo'lsin.</p>
            <button class="btn btn-block" id="camon">${I.camera}Kamerani yoqish</button>
          </div>
        </div>` : ''}
      </div>`));
    const go = $('#go'), agree = $('#agree');
    const update = () => { go.disabled = !(agree.checked && (!needCam || stream)); };
    agree.addEventListener('change', update);
    if (needCam) {
      $('#camon').addEventListener('click', async () => {
        try {
          stream = await startCamera();
          const vid = document.createElement('video');
          vid.autoplay = true; vid.muted = true; vid.playsInline = true; vid.srcObject = stream;
          $('#camview').innerHTML = ''; $('#camview').appendChild(vid);
          $('#camstate').className = 'badge badge-green'; $('#camstate').textContent = 'Ishlayapti';
          $('#camon').style.display = 'none';
          update();
        } catch (e) { toastErr(e); $('#camstate').className = 'badge badge-red'; $('#camstate').textContent = 'Xato'; }
      });
    }
    onCleanup(() => { if (stream && !go.dataset.used) stream.getTracks().forEach((t) => t.stop()); });
    go.addEventListener('click', async () => {
      go.dataset.used = '1';
      if (needScreen && fsSupported()) { try { await document.documentElement.requestFullscreen({ navigationUI: 'hide' }); } catch { /* ignore */ } }
      resolve(stream);
    });
  });
}

async function pageTest(cid) {
  render(shell('courses', loading()));
  const { course: c, state: st } = await api(`/my/courses/${cid}`);
  if (!st.openAttemptId && !st.canStartTest) {
    toast(st.passed ? "Siz bu testdan allaqachon o'tgansiz" : st.lessonsDone < st.lessonsTotal ? 'Avval barcha darslarni tugating' : 'Urinishlar soni tugagan', 'error');
    location.hash = `#/course/${cid}`;
    return;
  }
  const proctored = c.proctorCamera || c.proctorScreen;
  let stream = null;
  if (proctored && state.me.role !== 'admin') stream = await precheck(c, st, !!st.openAttemptId);
  let a;
  try { a = await api(`/my/courses/${cid}/attempts`, { method: 'POST' }); }
  catch (e) {
    stream?.getTracks().forEach((t) => t.stop());
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    toastErr(e); location.hash = `#/course/${cid}`; return;
  }
  const P = a.proctor;
  const watchScreen = P.screen && state.me.role !== 'admin';
  const key = `att:${a.id}`;
  const answers = store(key) || {};
  const total = a.questions.length;
  const offset = Date.parse(a.serverNow) - Date.now();
  const stamp = `${state.me.name} · +${state.me.phone} · ${fmtDateTime(new Date().toISOString())}`;

  document.body.classList.add('exam-mode');
  render(shell('courses', `
    <div class="test-head"><div class="card test-card">
      <div class="row" style="justify-content:space-between">
        <div><div class="small muted">${esc(a.courseTitle)}</div><h1 style="font-size:20px">Yakuniy test</h1></div>
        <div class="row">
          ${watchScreen ? `<span class="badge badge-gray" id="vcount" title="Qoidabuzarliklar">${I.shield.replace('<svg', '<svg width="13" height="13"')} ${P.violations}${P.maxViolations ? ' / ' + P.maxViolations : ''}</span>` : ''}
          ${a.deadlineAt ? `<div class="timer">${I.clock}<span id="timer">--:--</span></div>` : ''}
          <button class="btn btn-primary" id="submit">Topshirish</button></div>
      </div>
      <div style="margin-top:12px" class="row"><div style="flex:1">${progressBar(0)}</div><span class="small muted" id="cnt" style="font-weight:700">0/${total}</span></div>
    </div></div>
    <div class="card card-pad" style="margin-bottom:16px"><div class="qnav">${a.questions.map((q, i) => `<a href="#q${q.id}" data-qn="${q.id}">${i + 1}</a>`).join('')}</div></div>
    <div class="exam-wrap">
      <div class="watermark" aria-hidden="true">${Array.from({ length: 40 }, () => `<span>${esc(stamp)}</span>`).join('')}</div>
      <form id="tf" class="stack">
        ${a.questions.map((q, i) => `<div class="card question" id="q${q.id}">
          <h3><span class="n">${i + 1}</span><span>${esc(q.text)}</span></h3>
          ${q.options.map((o, j) => `<label class="option"><input type="radio" name="q${q.id}" value="${j}" ${answers[q.id] === j ? 'checked' : ''}><span class="letter">${'ABCDEFGH'[j]}</span><span>${esc(o)}</span></label>`).join('')}
        </div>`).join('')}
        <button class="btn btn-primary btn-lg" type="submit">Testni topshirish</button>
      </form>
    </div>
    ${stream ? `<div class="cam-float" id="camfloat"><span class="rec">REC</span></div>` : ''}
    <div class="shield-screen" id="shield"><div>${I.shield}<b>Test himoyalangan</b><span>Davom etish uchun test oynasiga qayting</span></div></div>
    <div class="fs-lock" id="fslock"><div class="card card-pad stack" style="max-width:420px;text-align:center">
      <div class="pc-badge" style="margin:0 auto">${I.monitor}</div>
      <h2>To'liq ekran rejimiga qayting</h2><p class="muted">Test faqat to'liq ekranda davom etadi. Bu holat qoidabuzarlik sifatida qayd etildi.</p>
      <button class="btn btn-primary" id="fsback">To'liq ekranga qaytish</button></div></div>
  `));

  // --- kamera
  let camVid = null;
  if (stream) {
    camVid = document.createElement('video');
    camVid.autoplay = true; camVid.muted = true; camVid.playsInline = true; camVid.srcObject = stream;
    $('#camfloat').prepend(camVid);
  }
  const snap = (kind) => new Promise((resolve) => {
    if (!camVid || !camVid.videoWidth || stream?.getVideoTracks()[0]?.readyState !== 'live') return resolve();
    const cv = document.createElement('canvas');
    cv.width = 480; cv.height = Math.round(480 * camVid.videoHeight / camVid.videoWidth);
    const g = cv.getContext('2d');
    g.drawImage(camVid, 0, 0, cv.width, cv.height);
    g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(0, cv.height - 22, cv.width, 22);
    g.fillStyle = '#fff'; g.font = '12px sans-serif'; g.fillText(`${state.me.name} · ${new Date().toLocaleString('ru-RU')}`, 8, cv.height - 7);
    cv.toBlob((b) => {
      if (!b) return resolve();
      const fd = new FormData(); fd.append('kind', kind); fd.append('image', b, 'snap.jpg');
      uploadForm(`/my/attempts/${a.id}/snapshots`, fd).catch(() => {}).finally(resolve);
    }, 'image/jpeg', 0.72);
  });
  let snapTimer = null;
  if (stream) {
    const schedule = () => { snapTimer = setTimeout(() => { snap('periodic'); schedule(); }, 20000 + Math.random() * 20000); };
    camVid.addEventListener('loadeddata', () => setTimeout(() => snap('start'), 800), { once: true });
    schedule();
    stream.getVideoTracks().forEach((t) => t.addEventListener('ended', () => violation('camera_off')));
  }

  // --- javoblar
  $$('.qnav a').forEach((x) => x.addEventListener('click', (e) => {
    e.preventDefault();
    const t = document.getElementById('q' + x.dataset.qn);
    window.scrollTo({ top: t.getBoundingClientRect().top + window.scrollY - 170, behavior: 'smooth' });
  }));
  const refresh = () => {
    const n = Object.keys(answers).length;
    $('#cnt').textContent = `${n}/${total}`;
    $('.test-head .progress > i').style.width = `${total ? (n / total) * 100 : 0}%`;
    $$('.qnav a').forEach((x) => x.classList.toggle('ans', answers[x.dataset.qn] !== undefined));
  };
  refresh();
  $('#tf').addEventListener('change', (e) => {
    if (e.target.type !== 'radio') return;
    answers[e.target.name.slice(1)] = Number(e.target.value);
    store(key, answers);
    refresh();
  });

  let sent = false;
  const finish = () => {
    sent = true;
    document.body.classList.remove('exam-mode', 'shielded');
    clearTimeout(snapTimer);
    stream?.getTracks().forEach((t) => t.stop());
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
  };
  const submit = async (force, reason) => {
    if (sent) return;
    const left = total - Object.keys(answers).length;
    if (!force && !(await confirmBox('Testni topshirasizmi?', left ? `<b>${left} ta savolga</b> javob berilmagan. Ular noto'g'ri hisoblanadi.` : "Barcha savollarga javob berdingiz. Topshirgandan keyin javoblarni o'zgartirib bo'lmaydi.", 'Topshirish'))) return;
    sent = true;
    try {
      if (stream) await snap('finish');
      const r = await api(`/my/attempts/${a.id}/submit`, { method: 'POST', body: { answers, reason } });
      store(key, null);
      finish();
      location.hash = `#/attempt/${r.id}`;
    } catch (e) { sent = false; toastErr(e); }
  };
  $('#submit').addEventListener('click', () => submit(false));
  $('#tf').addEventListener('submit', (e) => { e.preventDefault(); submit(false); });

  // --- qoidabuzarliklar
  let lastV = 0;
  async function violation(type, detail = '') {
    if (sent || !watchScreen && type !== 'camera_off') return;
    const now = Date.now();
    if (now - lastV < 1500) return; // bitta harakat uchun bir nechta hodisa kelmasin
    lastV = now;
    if (stream && type !== 'camera_off') snap('violation');
    try {
      const r = await api(`/my/attempts/${a.id}/events`, { method: 'POST', body: { type, detail } });
      if (r.finished) return;
      const vc = $('#vcount');
      if (vc) { vc.className = 'badge badge-red'; vc.innerHTML = `${I.shield.replace('<svg', '<svg width="13" height="13"')} ${r.count}${r.max ? ' / ' + r.max : ''}`; }
      if (r.limitReached) { toast("Qoidabuzarliklar limiti tugadi — test avtomatik topshirildi", 'error'); submit(true, 'violations'); return; }
      openModal({
        title: 'Ogohlantirish',
        body: `<div class="warn-box">${I.alert}<div><b>${VIOLATION_TEXT[type] || 'Qoidabuzarlik'}</b><p>Bu holat qayd etildi va administratorga ko'rinadi.${r.max ? ` Qoidabuzarliklar: <b>${r.count} / ${r.max}</b>. Limitga yetganda test avtomatik yakunlanadi.` : ''}</p></div></div>`,
        foot: `<button class="btn btn-primary" data-close>Tushundim, davom etaman</button>`,
      });
    } catch { /* ignore */ }
  }
  const listeners = [];
  const on = (target, ev, fn, opt) => { target.addEventListener(ev, fn, opt); listeners.push(() => target.removeEventListener(ev, fn, opt)); };
  const shield = (onoff) => document.body.classList.toggle('shielded', onoff);
  // nusxa olish, belgilash, kontekst menyu — har doim bloklanadi
  on(document, 'contextmenu', (e) => e.preventDefault());
  on(document, 'selectstart', (e) => { if (!e.target.closest?.('input, textarea')) e.preventDefault(); });
  on(document, 'copy', (e) => { e.preventDefault(); violation('copy'); });
  on(document, 'cut', (e) => { e.preventDefault(); violation('copy'); });
  on(window, 'beforeprint', () => violation('print'));
  on(document, 'keydown', (e) => {
    const k = e.key;
    if (k === 'PrintScreen') { shield(true); violation('printscreen'); try { navigator.clipboard.writeText(' '); } catch { /* ignore */ } setTimeout(() => shield(false), 1500); }
    if (k === 'Meta' || k === 'OS') shield(true); // Win+Shift+S kabi kombinatsiyalardan oldin ekranni yopamiz
    const mod = e.ctrlKey || e.metaKey;
    if (mod && ['p', 's', 'c', 'u', 'a'].includes(k.toLowerCase())) { e.preventDefault(); if (k.toLowerCase() === 'p') violation('print'); if (k.toLowerCase() === 'c') violation('copy'); }
    if (k === 'F12' || (mod && e.shiftKey && ['i', 'j', 'c', 's'].includes(k.toLowerCase()))) { e.preventDefault(); if (k.toLowerCase() === 's') { shield(true); violation('printscreen', 'Win/Cmd+Shift+S'); } }
  }, true);
  on(document, 'keyup', (e) => {
    if (e.key === 'PrintScreen') { shield(true); violation('printscreen'); try { navigator.clipboard.writeText(' '); } catch { /* ignore */ } setTimeout(() => shield(false), 1500); }
    if (e.key === 'Meta' || e.key === 'OS') setTimeout(() => { if (document.hasFocus()) shield(false); }, 600);
  }, true);
  if (watchScreen) {
    on(document, 'visibilitychange', () => { if (document.hidden) { shield(true); violation('tab_hidden'); } });
    on(window, 'blur', () => { shield(true); setTimeout(() => { if (!document.hasFocus() && !sent) violation('blur'); }, 300); });
    on(window, 'focus', () => shield(false));
    if (fsSupported()) {
      const fsCheck = () => {
        const out = !document.fullscreenElement && !sent;
        $('#fslock').classList.toggle('on', out);
        if (out) violation('fullscreen_exit');
      };
      on(document, 'fullscreenchange', fsCheck);
      $('#fsback').addEventListener('click', () => document.documentElement.requestFullscreen().catch(() => {}));
      if (!document.fullscreenElement) $('#fslock').classList.add('on');
    }
  } else {
    on(window, 'blur', () => shield(true));
    on(window, 'focus', () => shield(false));
  }

  // --- taymer
  if (a.deadlineAt) {
    const end = Date.parse(a.deadlineAt);
    const tick = () => {
      const ms = end - (Date.now() + offset);
      const t = $('#timer');
      if (!t) return;
      const s = Math.max(0, Math.ceil(ms / 1000));
      t.textContent = `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
      t.parentElement.classList.toggle('warn', s <= 60);
      if (ms <= 0) { clearInterval(iv); toast('Vaqt tugadi — test topshirilmoqda'); submit(true, 'timeout'); }
    };
    const iv = setInterval(tick, 500);
    tick();
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

async function pageResult(id) {
  render(shell('courses', loading()));
  const r = await api(`/my/attempts/${id}`);
  if (r.open) { location.hash = `#/course/${r.courseId}/test`; return; }
  const color = r.passed ? '#10a56f' : '#e5484d';
  const C = 2 * Math.PI * 64;
  render(shell('courses', `
    <a class="back" href="#/course/${r.courseId}">${I.back}${esc(r.courseTitle)}</a>
    <div class="card result ${r.passed ? 'win' : 'lose'}" style="max-width:600px;margin:0 auto">
      <div class="score-ring">
        <svg viewBox="0 0 150 150"><circle cx="75" cy="75" r="64" stroke="#eceef4" stroke-width="12" fill="none"/>
        <circle cx="75" cy="75" r="64" stroke="${color}" stroke-width="12" fill="none" stroke-linecap="round" stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - r.score / 100)}"/></svg>
        <b style="color:${color}">${r.score}%</b>
      </div>
      <h1>${r.passed ? 'Tabriklaymiz! Testdan o\'tdingiz' : 'Afsuski, testdan o\'ta olmadingiz'}</h1>
      <p class="muted" style="margin-top:8px">${r.correct} / ${r.total} to'g'ri javob · o'tish bali ${r.passScore}%</p>
      ${!r.passed ? `<p class="muted" style="margin-top:4px">${r.attemptsLeft === null ? 'Qayta topshirishingiz mumkin' : r.attemptsLeft > 0 ? `Yana ${r.attemptsLeft} ta urinish qoldi` : 'Urinishlar tugadi — administratorga murojaat qiling'}</p>` : ''}
      <div class="row" style="justify-content:center;margin-top:24px">
        ${r.passed ? `<a class="btn btn-primary" href="#/certificate/${r.courseId}">${I.award}Sertifikatni ko'rish</a>` : ''}
        ${!r.passed && r.canRetry ? `<a class="btn btn-primary" href="#/course/${r.courseId}">Materiallarni takrorlash</a>` : ''}
        <a class="btn" href="${state.me.role === 'admin' ? '#/admin' : '#/'}">Bosh sahifa</a>
      </div>
    </div>
  `));
  if (r.passed) {
    const box = $('.result');
    const cols = ['#5b4cf5', '#c056f0', '#10a56f', '#f59e0b', '#2f7cf6', '#e3489b'];
    for (let i = 0; i < 40; i++) {
      const p = document.createElement('i');
      p.className = 'confetti';
      p.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-delay:${Math.random() * .8}s;animation-duration:${2.2 + Math.random() * 1.6}s`;
      box.appendChild(p);
    }
  }
}

async function pageCertificate(cid) {
  $app.innerHTML = loading();
  const c = await api(`/my/certificate/${cid}`);
  $app.innerHTML = `<div class="cert-wrap">
    <div class="cert-tools"><a class="btn" href="#/course/${cid}">${I.back}Orqaga</a><span class="spacer"></span><button class="btn btn-primary" onclick="window.print()">${I.print}Chop etish / PDF</button></div>
    <div class="cert">
      <div class="corner c1"></div><div class="corner c2"></div>
      <div class="cert-brand"><span class="brand-logo">${I.logo}</span>${esc(c.appName)}</div>
      <h1>SERTIFIKAT</h1>
      <div class="lead">Ushbu sertifikat shuni tasdiqlaydiki</div>
      <div class="name">${esc(c.name)}</div>
      <div class="lead">quyidagi o'quv kursini muvaffaqiyatli tamomladi:</div>
      <div class="course">«${esc(c.courseTitle)}»</div>
      <div class="cert-foot">
        <div style="text-align:left"><b>${fmtDate(c.completedAt)}</b>Sana${c.score !== null ? `<b style="margin-top:8px">${c.score}%</b>Natija` : ''}</div>
        <div class="seal">${I.award}</div>
        <div style="text-align:right"><b>№ ${esc(c.number)}</b>Sertifikat raqami</div>
      </div>
    </div>
  </div>`;
}

// ------------------------------------------------------------ profile
function pageProfile() {
  const u = state.me;
  render(shell('profile', `
    <div class="page-head"><div><h1>Profil</h1><p class="muted">${esc(u.name)} · ${fmtPhone(u.phone)}</p></div></div>
    <div class="grid grid-2">
      <div class="card profile-card">
        ${avatar(u.name, 'lg')}
        <h2>${esc(u.name)}</h2>
        <div style="margin-top:6px">${u.role === 'admin' ? '<span class="badge badge-amber">Administrator</span>' : '<span class="badge badge-indigo">Xodim</span>'}</div>
        <dl class="kv"><dt>Telefon</dt><dd>${fmtPhone(u.phone)}</dd><dt>Bo'lim</dt><dd>${esc(u.department) || '—'}</dd><dt>Lavozim</dt><dd>${esc(u.position) || '—'}</dd></dl>
      </div>
      <form class="card card-pad stack" id="pf">
        <h2>Parolni o'zgartirish</h2>
        <div class="field"><label>Joriy parol</label><input class="input" type="password" name="oldPassword" required autocomplete="current-password"></div>
        <div class="field"><label>Yangi parol</label><input class="input" type="password" name="newPassword" minlength="6" required autocomplete="new-password"><span class="hint">Kamida 6 belgi</span></div>
        <div><button class="btn btn-primary" type="submit">Saqlash</button></div>
      </form>
    </div>
    <button class="btn btn-danger btn-block btn-lg m-only" style="margin-top:18px" data-logout>${I.logout}Tizimdan chiqish</button>`));
  $('#pf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = Object.fromEntries(new FormData(e.target));
    try { await api('/me/password', { method: 'POST', body: fd }); toast("Parol o'zgartirildi", 'success'); e.target.reset(); }
    catch (err) { toastErr(err); }
  });
}

// ------------------------------------------------------------ admin: dashboard
async function adminDashboard() {
  render(adminShell('dash', loading()));
  const d = await api('/admin/dashboard');
  render(adminShell('dash', `
    <section class="hero"><div class="hero-row">
      <div style="flex:1;min-width:260px">
        <span class="badge badge-white no-dot">${I.spark.replace('<svg', '<svg width="13" height="13"')} Boshqaruv paneli</span>
        <h1 style="margin-top:12px">Salom, ${esc(state.me.name.split(' ')[0])}!</h1>
        <p style="margin-top:8px;max-width:520px">${d.assignments ? `Xodimlaringiz tayinlangan kurslarning <b>${d.completionRate}%</b> qismini tugatdi.${d.overdue ? ` <b>${d.overdue} ta</b> tayinlovning muddati o'tgan.` : ''}` : "Birinchi kursni yarating va xodimlarni o'qitishni boshlang."}</p>
        <div class="row" style="margin-top:20px"><a class="btn btn-white" href="#/admin/courses" data-new>${I.plus}Yangi kurs</a><a class="btn btn-glass" href="#/admin/users">${I.users}Xodimlar</a></div>
      </div>
      ${ring(d.completionRate, 'tugatildi', 140)}
    </div></section>
    <div class="grid grid-4" style="margin-bottom:20px">
      ${statCard(I.users, 'Xodimlar', d.employees, 'faol foydalanuvchilar', 'blue')}
      ${statCard(I.book, 'Faol kurslar', d.publishedCourses, `${d.draftCourses} ta qoralama`, 'indigo')}
      ${statCard(I.award, 'Tugatilgan', d.completed, `${d.assignments} ta tayinlovdan`, 'green')}
      ${statCard(I.alert, "Muddati o'tgan", d.overdue, `${d.inProgress} ta jarayonda`, d.overdue ? 'red' : 'amber')}
    </div>
    <div class="grid grid-2">
      <div class="stack" style="gap:18px">
      <div class="card"><div class="card-head"><h2>Kurslar bo'yicha</h2><a href="#/admin/courses" class="small">Barchasi</a></div>
        <div class="card-pad">${d.perCourse.length ? `<div class="bar-list">${d.perCourse.map((c) => {
          const p = c.assigned ? Math.round((c.completed / c.assigned) * 100) : 0;
          return `<a class="bar-item" href="#/admin/courses/${c.id}/results" style="color:inherit;text-decoration:none">
            <div class="row small" style="margin-bottom:6px"><span><b>${esc(c.title)}</b></span><span class="muted nowrap">${c.completed}/${c.assigned} · ${p}%</span></div>
            ${progressBar(p, true)}${c.overdue ? `<div class="small" style="color:var(--red);margin-top:4px">${c.overdue} ta xodim muddatni o'tkazib yubordi</div>` : ''}</a>`;
        }).join('')}</div>` : `<div class="empty" style="padding:24px">Faol kurslar yo'q. <a href="#/admin/courses">Kurs yarating</a></div>`}</div></div>
      ${d.perDepartment?.length ? `<div class="card"><div class="card-head"><h2>Bo'limlar reytingi</h2><span class="small muted">tugatish darajasi</span></div>
        <div class="dep-list">${d.perDepartment.map((x, i) => `<div class="dep-row"><span class="dep-rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
          <div style="flex:1;min-width:0"><div class="row small" style="justify-content:space-between;margin-bottom:6px;flex-wrap:nowrap"><b>${esc(x.department)}</b><span class="muted nowrap">${x.employees} xodim · <b style="color:var(--text)">${x.rate}%</b></span></div>${progressBar(x.rate, x.rate >= 70)}</div></div>`).join('')}</div></div>` : ''}
      </div>
      <div class="card"><div class="card-head"><h2>So'nggi test natijalari</h2></div>
        ${d.recent.length ? `<div class="table-wrap"><table class="table"><tbody>${d.recent.map((r) => `<tr>
          <td><div class="user-cell">${avatar(r.name, 'sm')}<div style="min-width:0"><b>${esc(r.name)}</b><span class="small muted recent-course">${esc(r.courseTitle)}</span></div></div></td>
          <td class="nowrap"><span class="badge ${r.passed ? 'badge-green' : 'badge-red'}">${r.score}%</span></td>
          <td class="small muted nowrap hide-sm">${fmtDateTime(r.finishedAt)}</td></tr>`).join('')}</tbody></table></div>`
        : `<div class="empty" style="padding:24px">Hali hech kim test topshirmagan</div>`}</div>
    </div>`));
  $('[data-new]').addEventListener('click', (e) => { e.preventDefault(); newCourseModal(); });
}

// ------------------------------------------------------------ admin: courses
function newCourseModal() {
  openModal({
    title: 'Yangi kurs',
    body: `<form id="nc" class="stack">
      <div class="field"><label>Kurs nomi</label><input class="input" name="title" required placeholder="Masalan: Sotuv texnikasi asoslari"></div>
      <div class="field"><label>Qisqacha tavsif</label><textarea class="input" name="description" placeholder="Kurs nima haqida va xodim nimani o'rganadi"></textarea></div>
    </form>`,
    foot: `<button class="btn" data-close>Bekor qilish</button><button class="btn btn-primary" form="nc" type="submit">Yaratish</button>`,
    onMount: (m, close) => $('#nc', m).addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        const c = await api('/admin/courses', { method: 'POST', body: Object.fromEntries(new FormData(e.target)) });
        close();
        toast('Kurs yaratildi. Endi materiallar qo\'shing', 'success');
        location.hash = `#/admin/courses/${c.id}/lessons`;
      } catch (err) { toastErr(err); }
    }),
  });
}
async function adminCourses() {
  render(adminShell('courses', loading()));
  const list = await api('/admin/courses');
  render(adminShell('courses', `
    <div class="page-head"><div><h1>Kurslar</h1><p class="muted">Materiallar, testlar va tayinlovlar</p></div><button class="btn btn-primary" data-new>${I.plus}Yangi kurs</button></div>
    ${list.length ? `<div class="grid grid-3">${list.map((c) => {
      const p = c.assigned ? Math.round((c.completed / c.assigned) * 100) : 0;
      return `<a class="card course-card" href="#/admin/courses/${c.id}">
        <div class="course-cover" style="background:${cover(c.id, c.category)}">
          <div class="cover-ic">${catIcon(c.category)}</div>${c.category ? `<span class="cat">${esc(c.category)}</span>` : ''}<div class="big-ic">${catIcon(c.category)}</div>
          <span class="badge badge-white">${c.published ? 'Faol' : 'Qoralama'}</span>
          <span class="badge badge-white no-dot">${c.departments.length ? esc(c.departments.join(', ')) : 'Barcha xodimlar'}</span>
        </div>
        <div class="course-body">
          <h3>${esc(c.title)}</h3>
          <div class="meta-chips"><span class="meta-chip">${I.layers}${plural(c.lessonCount, 'dars')}</span><span class="meta-chip">${I.test}${plural(c.questionTotal, 'savol')}</span>${c.deadline ? `<span class="meta-chip">${I.clock}${fmtDate(c.deadline)}</span>` : ''}</div>
          ${c.published ? `<div><div class="row small" style="justify-content:space-between;margin-bottom:6px"><span class="muted">${c.completed}/${c.assigned} xodim tugatdi</span><b>${p}%</b></div>${progressBar(p, true)}</div>`
          : `<div class="small muted">Nashr qilinmagan — xodimlar hali ko'rmaydi</div>`}
        </div>
      </a>`;
    }).join('')}</div>`
    : `<div class="card empty">${I.book}<h3>Hali kurslar yo'q</h3><p style="margin-bottom:16px">Birinchi kursni yarating: video, PDF yoki taqdimot yuklang va test qo'shing</p><button class="btn btn-primary" data-new>${I.plus}Yangi kurs</button></div>`}
  `));
  $$('[data-new]').forEach((b) => b.addEventListener('click', newCourseModal));
}

async function adminCourse(id, tab = 'settings') {
  render(adminShell('courses', loading()));
  const [data, deps] = await Promise.all([api(`/admin/courses/${id}`), api('/admin/departments')]);
  const c = data.course;
  const tabs = [['settings', 'Sozlamalar'], ['lessons', 'Materiallar', data.lessons.length], ['questions', 'Test savollari', data.questions.length], ['results', 'Natijalar']];
  const head = `
    <a class="back" href="#/admin/courses">${I.back}Kurslar</a>
    <div class="page-head"><div><div class="row"><h1>${esc(c.title)}</h1>${c.published ? '<span class="badge badge-green">Faol</span>' : '<span class="badge badge-gray">Qoralama</span>'}</div>
      <p class="muted">${c.departments.length ? 'Bo\'limlar: ' + esc(c.departments.join(', ')) : 'Barcha xodimlarga'}${c.deadline ? ' · muddat ' + fmtDate(c.deadline) : ''}</p></div>
      <div class="row"><a class="btn" href="#/course/${c.id}">${I.eye}Xodim ko'rinishi</a>
      ${c.published ? '' : `<button class="btn btn-primary" data-publish>Nashr qilish</button>`}</div></div>
    <nav class="tabs">${tabs.map(([k, t, n]) => `<a class="tab ${tab === k ? 'active' : ''}" href="#/admin/courses/${c.id}/${k}">${t}${n !== undefined ? `<span class="count">${n}</span>` : ''}</a>`).join('')}</nav>`;
  const body = tab === 'lessons' ? lessonsTab(data) : tab === 'questions' ? questionsTab(data) : tab === 'results' ? loading() : settingsTab(c, deps);
  render(adminShell('courses', head + `<div id="tabbody">${body}</div>`));
  const pub = $('[data-publish]');
  if (pub) pub.addEventListener('click', async () => {
    if (!data.lessons.length && !data.questions.length) { toast("Avval material yoki test qo'shing", 'error'); return; }
    try { await api(`/admin/courses/${c.id}`, { method: 'PUT', body: { published: true } }); toast('Kurs nashr qilindi — xodimlar endi ko\'radi', 'success'); router(); }
    catch (e) { toastErr(e); }
  });
  if (tab === 'lessons') bindLessons(data);
  else if (tab === 'questions') bindQuestions(data);
  else if (tab === 'results') await resultsTab(c);
  else bindSettings(c);
}

function settingsTab(c, deps) {
  const all = [...new Set([...deps, ...c.departments])].sort();
  return `<form class="card card-pad" id="cs" style="max-width:820px">
    <div class="form-grid">
      <div class="field full"><label>Kurs nomi</label><input class="input" name="title" value="${esc(c.title)}" required></div>
      <div class="field full"><label>Tavsif</label><textarea class="input" name="description">${esc(c.description)}</textarea></div>
      <div class="field full"><label>Kimga tayinlanadi</label>
        ${all.length ? `<div class="chips">${all.map((d) => `<label class="chip-check"><input type="checkbox" name="dep" value="${esc(d)}" ${c.departments.includes(d) ? 'checked' : ''}>${esc(d)}</label>`).join('')}</div>
        <span class="hint">Hech biri tanlanmasa — barcha xodimlarga tayinlanadi</span>`
        : '<span class="hint">Xodimlarga bo\'lim yozilmagan — kurs barcha xodimlarga tayinlanadi</span>'}
      </div>
      <div class="field"><label>Tugatish muddati</label><input class="input" type="date" name="deadline" value="${esc(c.deadline || '')}"><span class="hint">Ixtiyoriy</span></div>
      <div class="field"><label>O'tish bali, %</label><input class="input" type="number" name="passScore" min="1" max="100" value="${c.passScore}"></div>
      <div class="field"><label>Test vaqti, daqiqa</label><input class="input" type="number" name="timeLimitMin" min="0" max="600" value="${c.timeLimitMin}"><span class="hint">0 — cheklanmagan</span></div>
      <div class="field"><label>Urinishlar soni</label><input class="input" type="number" name="maxAttempts" min="0" max="100" value="${c.maxAttempts}"><span class="hint">0 — cheklanmagan</span></div>
      <div class="field"><label>Testdagi savollar soni</label><input class="input" type="number" name="questionCount" min="0" value="${c.questionCount}"><span class="hint">0 — banktagi barcha savollar. Aks holda har bir xodimga tasodifiy tanlanadi</span></div>
      <div class="field"><label>Kategoriya</label><input class="input" name="category" value="${esc(c.category || '')}" placeholder="Masalan: Sotuv, Onboarding"></div>
      <div class="field full"><label>Holat</label><label class="toggle-row"><input type="checkbox" name="published" ${c.published ? 'checked' : ''}><span class="tg"></span><div><b>Nashr qilingan</b><span>Xodimlarga ko'rinadi va ular o'qishni boshlay oladi</span></div></label></div>
    </div>
    <div class="settings-group">
      <div class="sg-head"><div class="pc-badge sm">${I.shield}</div><div><h3>Test nazorati (proktoring)</h3><p class="small muted">Testni halol topshirilishini ta'minlash sozlamalari</p></div></div>
      <div class="stack" style="gap:10px">
        <label class="toggle-row"><input type="checkbox" name="proctorScreen" ${c.proctorScreen ? 'checked' : ''}><span class="tg"></span><div><b>Ekran nazorati</b><span>To'liq ekran rejimi, boshqa oynaga o'tish, skrinshot (PrintScreen, Win+Shift+S) va nusxa olish urinishlarini qayd etish. Test sahifasida xodim ismi bilan suv belgisi chiqadi.</span></div></label>
        <label class="toggle-row"><input type="checkbox" name="proctorCamera" ${c.proctorCamera ? 'checked' : ''}><span class="tg"></span><div><b>Kamera nazorati</b><span>Test faqat kamera yoqilgan holda boshlanadi. Har 20–40 soniyada va har bir qoidabuzarlikda kameradan surat olinib, natijalarga biriktiriladi.</span></div></label>
        <div class="field" style="max-width:320px;margin-top:6px"><label>Qoidabuzarliklar limiti</label><input class="input" type="number" name="maxViolations" min="0" max="100" value="${c.maxViolations}"><span class="hint">Shu songa yetganda test avtomatik topshiriladi. 0 — faqat qayd etiladi</span></div>
      </div>
    </div>
    <div class="row" style="margin-top:22px"><button class="btn btn-primary" type="submit">Saqlash</button><span class="spacer"></span><button class="btn btn-danger" type="button" data-del>${I.trash}Kursni o'chirish</button></div>
  </form>`;
}
function bindSettings(c) {
  $('#cs').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target;
    const body = {
      title: f.title.value, description: f.description.value, deadline: f.deadline.value || null,
      passScore: f.passScore.value, timeLimitMin: f.timeLimitMin.value, maxAttempts: f.maxAttempts.value, questionCount: f.questionCount.value,
      published: f.published.checked, departments: $$('input[name=dep]:checked', f).map((x) => x.value),
      proctorScreen: f.proctorScreen.checked, proctorCamera: f.proctorCamera.checked, maxViolations: f.maxViolations.value, category: f.category.value,
    };
    try { await api(`/admin/courses/${c.id}`, { method: 'PUT', body }); toast('Saqlandi', 'success'); router(); } catch (err) { toastErr(err); }
  });
  $('[data-del]').addEventListener('click', async () => {
    if (!(await confirmBox("Kursni o'chirasizmi?", `«${esc(c.title)}» kursi, uning materiallari va barcha natijalar o'chiriladi. Bu amalni qaytarib bo'lmaydi.`, "O'chirish", true))) return;
    try { await api(`/admin/courses/${c.id}`, { method: 'DELETE' }); toast("Kurs o'chirildi"); location.hash = '#/admin/courses'; } catch (err) { toastErr(err); }
  });
}

function lessonsTab(data) {
  const ls = data.lessons;
  return `<div class="grid" style="grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);align-items:start" id="lgrid">
    <div class="card"><div class="card-head"><h2>Darslar ketma-ketligi</h2><span class="small muted">Xodim shu tartibda o'tadi</span></div>
      ${ls.length ? ls.map((l, i) => `<div class="lesson-row" data-id="${l.id}">
        <span class="num">${i + 1}</span>
        <div class="step-icon ${lessonTone(l)}">${lessonIcon(l)}</div>
        <div class="step-body" style="flex:1;min-width:0"><b>${esc(l.title)}</b><span class="small muted">${lessonKind(l)}${l.size ? ' · ' + fmtSize(l.size) : ''}${l.originalName ? ' · ' + esc(l.originalName) : ''}</span></div>
        <div class="nowrap">
          <button class="icon-btn" data-up ${i === 0 ? 'disabled' : ''} title="Yuqoriga">${I.up}</button>
          <button class="icon-btn" data-down ${i === ls.length - 1 ? 'disabled' : ''} title="Pastga">${I.down}</button>
          <a class="icon-btn" href="#/course/${data.course.id}/lesson/${l.id}" title="Ko'rish">${I.eye}</a>
          <button class="icon-btn" data-edit title="Tahrirlash">${I.edit}</button>
          <button class="icon-btn" data-del title="O'chirish">${I.trash}</button>
        </div></div>`).join('')
      : `<div class="empty">${I.upload}<h3>Materiallar yo'q</h3><p>O'ng tomondagi forma orqali video, PDF yoki taqdimot yuklang</p></div>`}
    </div>
    <form class="card card-pad stack" id="lf">
      <div class="row" style="justify-content:space-between"><h2>Material qo'shish</h2>
        <div class="seg"><button type="button" class="on" data-mode="file">Fayl</button><button type="button" data-mode="text">Matn</button></div></div>
      <div class="field"><label>Dars nomi</label><input class="input" name="title" placeholder="Fayl nomidan olinadi"></div>
      <div data-file>
        <label class="upload-zone" id="dz">
          <div class="uz-ic">${I.upload}</div>
          <div style="font-weight:700" id="fname">Faylni tanlang yoki shu yerga tashlang</div>
          <div class="hint">maksimal hajm 2 GB</div>
          <div class="file-types"><span class="type-video">MP4</span><span class="type-pdf">PDF</span><span class="type-slides">PPTX</span><span class="type-pdf">DOCX</span></div>
          <input type="file" name="file" hidden accept=".mp4,.webm,.m4v,.mov,.pdf,.ppt,.pptx,.pps,.ppsx,.odp,.doc,.docx,.odt,.rtf">
        </label>
      </div>
      <div class="field"><label data-ctitle>Izoh (ixtiyoriy)</label><textarea class="input" name="content" placeholder="Xodim uchun qisqa izoh"></textarea></div>
      <div id="up" style="display:none"><div class="row small muted" style="justify-content:space-between;margin-bottom:6px"><span id="upt">Yuklanmoqda...</span><span id="upp">0%</span></div>${progressBar(0)}</div>
      <button class="btn btn-primary" type="submit">${I.plus}Qo'shish</button>
      <div class="hint">PPTX va DOCX avtomatik PDF ko'rinishiga aylantiriladi — xodim brauzerda ko'radi, yuklab olmaydi.</div>
    </form>
  </div>`;
}
function bindLessons(data) {
  const cid = data.course.id;
  const grid = $('#lgrid');
  const mq = window.matchMedia('(max-width: 960px)');
  const fit = () => { grid.style.gridTemplateColumns = mq.matches ? '1fr' : 'minmax(0,1.4fr) minmax(0,1fr)'; };
  fit(); mq.addEventListener('change', fit); onCleanup(() => mq.removeEventListener('change', fit));

  const ids = data.lessons.map((l) => l.id);
  const move = async (id, dir) => {
    const i = ids.indexOf(id); const j = i + dir;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await api(`/admin/courses/${cid}/lessons/reorder`, { method: 'POST', body: { ids } }); router(); } catch (e) { toastErr(e); }
  };
  $$('.lesson-row').forEach((row) => {
    const id = Number(row.dataset.id);
    const l = data.lessons.find((x) => x.id === id);
    $('[data-up]', row).addEventListener('click', () => move(id, -1));
    $('[data-down]', row).addEventListener('click', () => move(id, 1));
    $('[data-del]', row).addEventListener('click', async () => {
      if (!(await confirmBox("Darsni o'chirasizmi?", `«${esc(l.title)}» va uning fayli o'chiriladi.`, "O'chirish", true))) return;
      try { await api(`/admin/lessons/${id}`, { method: 'DELETE' }); toast("O'chirildi"); router(); } catch (e) { toastErr(e); }
    });
    $('[data-edit]', row).addEventListener('click', () => openModal({
      title: 'Darsni tahrirlash',
      body: `<form id="le" class="stack"><div class="field"><label>Dars nomi</label><input class="input" name="title" value="${esc(l.title)}" required></div>
        <div class="field"><label>${l.type === 'text' ? 'Matn' : 'Izoh'}</label><textarea class="input" name="content" style="min-height:${l.type === 'text' ? 260 : 100}px">${esc(l.content)}</textarea></div></form>`,
      foot: `<button class="btn" data-close>Bekor qilish</button><button class="btn btn-primary" form="le" type="submit">Saqlash</button>`,
      wide: l.type === 'text',
      onMount: (m, close) => $('#le', m).addEventListener('submit', async (e) => {
        e.preventDefault();
        try { await api(`/admin/lessons/${id}`, { method: 'PUT', body: Object.fromEntries(new FormData(e.target)) }); close(); toast('Saqlandi', 'success'); router(); } catch (err) { toastErr(err); }
      }),
    }));
  });

  const f = $('#lf');
  let mode = 'file';
  const fileIn = $('input[type=file]', f);
  $$('[data-mode]', f).forEach((b) => b.addEventListener('click', () => {
    mode = b.dataset.mode;
    $$('[data-mode]', f).forEach((x) => x.classList.toggle('on', x === b));
    $('[data-file]', f).style.display = mode === 'file' ? '' : 'none';
    $('[data-ctitle]', f).textContent = mode === 'file' ? 'Izoh (ixtiyoriy)' : 'Dars matni';
    f.content.style.minHeight = mode === 'file' ? '96px' : '220px';
    f.title.placeholder = mode === 'file' ? 'Fayl nomidan olinadi' : 'Masalan: Ichki tartib qoidalari';
  }));
  const showName = () => { $('#fname').textContent = fileIn.files[0] ? `${fileIn.files[0].name} · ${fmtSize(fileIn.files[0].size)}` : 'Faylni tanlang yoki shu yerga tashlang'; };
  fileIn.addEventListener('change', showName);
  const dz = $('#dz');
  ['dragenter', 'dragover'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => dz.addEventListener(ev, (e) => { e.preventDefault(); dz.classList.remove('drag'); }));
  dz.addEventListener('drop', (e) => { if (e.dataTransfer.files.length) { fileIn.files = e.dataTransfer.files; showName(); } });

  f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const fd = new FormData();
    fd.append('title', f.title.value);
    fd.append('content', f.content.value);
    if (mode === 'file') {
      if (!fileIn.files[0]) { toast('Fayl tanlang', 'error'); return; }
      fd.append('file', fileIn.files[0]);
    } else if (!f.content.value.trim()) { toast('Dars matnini kiriting', 'error'); return; }
    const btn = $('button[type=submit]', f); btn.disabled = true;
    const up = $('#up'); up.style.display = mode === 'file' ? '' : 'none';
    const ext = mode === 'file' ? fileIn.files[0].name.split('.').pop().toLowerCase() : '';
    const converts = ['ppt', 'pptx', 'pps', 'ppsx', 'odp', 'doc', 'docx', 'odt', 'rtf'].includes(ext);
    try {
      await uploadForm(`/admin/courses/${cid}/lessons`, fd, (p) => {
        $('#upp').textContent = Math.round(p * 100) + '%';
        $('.progress > i', up).style.width = p * 100 + '%';
        if (p >= 1) $('#upt').textContent = converts ? 'PDF ko\'rinishiga aylantirilmoqda...' : 'Saqlanmoqda...';
      });
      toast("Material qo'shildi", 'success');
      router();
    } catch (err) { toastErr(err); btn.disabled = false; up.style.display = 'none'; }
  });
}

function questionsTab(data) {
  const c = data.course;
  const qs = data.questions;
  return `<div class="notice" style="margin-bottom:16px">${I.info}<div>Test sozlamalari: o'tish bali <b>${c.passScore}%</b>, vaqt <b>${c.timeLimitMin ? c.timeLimitMin + ' daq.' : 'cheklanmagan'}</b>, urinishlar <b>${c.maxAttempts || 'cheklanmagan'}</b>, testda <b>${c.questionCount && c.questionCount < qs.length ? c.questionCount + ' ta tasodifiy savol' : 'barcha savollar'}</b>. Savollar va variantlar har bir xodimga aralashtirib beriladi. <a href="#/admin/courses/${c.id}/settings">O'zgartirish</a></div></div>
  <div class="card">
    <div class="card-head"><h2>Savollar banki <span class="muted" style="font-weight:500">· ${qs.length}</span></h2>
      <div class="row"><button class="btn btn-sm" data-import>${I.upload}Matndan import</button><button class="btn btn-sm btn-primary" data-add>${I.plus}Savol qo'shish</button></div></div>
    ${qs.length ? qs.map((q, i) => `<div class="q-item" data-id="${q.id}">
      <div class="row" style="flex-wrap:nowrap;align-items:flex-start"><span class="qn">${i + 1}</span><b style="flex:1;padding-top:3px">${esc(q.text)}</b>
        <span class="nowrap"><button class="icon-btn" data-edit title="Tahrirlash">${I.edit}</button><button class="icon-btn" data-del title="O'chirish">${I.trash}</button></span></div>
      <div class="q-opts">${q.options.map((o, j) => `<div class="${j === q.correct ? 'ok' : ''}">${j === q.correct ? '✓' : 'ABCDEFGH'[j] + ')'} ${esc(o)}</div>`).join('')}</div>
    </div>`).join('')
    : `<div class="empty">${I.test}<h3>Savollar yo'q</h3><p>Savollarni birma-bir qo'shing yoki Word/Excel'dan nusxa olib import qiling</p></div>`}
  </div>`;
}
function questionModal(cid, q) {
  const opts = q ? q.options : ['', '', '', ''];
  const correct = q ? q.correct : 0;
  openModal({
    title: q ? 'Savolni tahrirlash' : 'Yangi savol',
    body: `<form id="qf" class="stack">
      <div class="field"><label>Savol</label><textarea class="input" name="text" required style="min-height:70px">${esc(q?.text || '')}</textarea></div>
      <div class="field"><label>Javob variantlari <span class="hint" style="font-weight:400">— to'g'ri javobni belgilang</span></label><div id="opts"></div>
        <div><button type="button" class="btn btn-sm btn-ghost" id="addopt">${I.plus}Variant qo'shish</button></div></div>
    </form>`,
    foot: `<button class="btn" data-close>Bekor qilish</button><button class="btn btn-primary" form="qf" type="submit">Saqlash</button>`,
    onMount: (m, close) => {
      const box = $('#opts', m);
      const addRow = (val = '', checked = false) => {
        const r = document.createElement('div');
        r.className = 'opt-row';
        r.innerHTML = `<input type="radio" name="correct" ${checked ? 'checked' : ''} title="To'g'ri javob"><input class="input" value="${esc(val)}" placeholder="Variant"><button type="button" class="icon-btn" title="O'chirish">${I.x}</button>`;
        $('button', r).addEventListener('click', () => { if ($$('.opt-row', box).length > 2) r.remove(); });
        box.appendChild(r);
      };
      opts.forEach((o, i) => addRow(o, i === correct));
      $('#addopt', m).addEventListener('click', () => { if ($$('.opt-row', box).length < 8) addRow(); });
      $('#qf', m).addEventListener('submit', async (e) => {
        e.preventDefault();
        const rows = $$('.opt-row', box);
        const filled = rows.filter((r) => $('input.input', r).value.trim());
        const body = { text: e.target.text.value, options: filled.map((r) => $('input.input', r).value), correct: filled.findIndex((r) => $('input[type=radio]', r).checked) };
        try {
          await api(q ? `/admin/questions/${q.id}` : `/admin/courses/${cid}/questions`, { method: q ? 'PUT' : 'POST', body });
          close(); toast('Saqlandi', 'success'); router();
        } catch (err) { toastErr(err); }
      });
    },
  });
}
function bindQuestions(data) {
  const cid = data.course.id;
  $('[data-add]').addEventListener('click', () => questionModal(cid));
  $$('.q-item').forEach((row) => {
    const q = data.questions.find((x) => x.id === Number(row.dataset.id));
    $('[data-edit]', row).addEventListener('click', () => questionModal(cid, q));
    $('[data-del]', row).addEventListener('click', async () => {
      if (!(await confirmBox("Savolni o'chirasizmi?", esc(q.text), "O'chirish", true))) return;
      try { await api(`/admin/questions/${q.id}`, { method: 'DELETE' }); router(); } catch (e) { toastErr(e); }
    });
  });
  $('[data-import]').addEventListener('click', () => openModal({
    title: 'Savollarni import qilish', wide: true,
    body: `<div class="stack">
      <p class="muted">Har bir savolni bo'sh qator bilan ajrating. Birinchi qator — savol, keyingilari — variantlar. To'g'ri javob oldiga <b>*</b> qo'ying.</p>
      <pre class="code">1. Ish kuni soat nechada boshlanadi?
A) 08:00
*B) 09:00
C) 10:00

2. Mijoz murojaatiga qancha vaqtda javob beriladi?
1 soat
*24 soat
3 kun</pre>
      <textarea class="input" id="imp" style="min-height:220px" placeholder="Savollarni shu yerga joylashtiring"></textarea>
      <div id="impres"></div></div>`,
    foot: `<button class="btn" data-close>Yopish</button><button class="btn btn-primary" id="dimp">Import qilish</button>`,
    onMount: (m) => $('#dimp', m).addEventListener('click', async () => {
      try {
        const r = await api(`/admin/courses/${cid}/questions/import`, { method: 'POST', body: { text: $('#imp', m).value } });
        $('#impres', m).innerHTML = `<div class="notice ${r.errors.length ? 'amber' : 'green'}">${I.info}<div><b>${r.added} ta savol qo'shildi.</b>${r.errors.length ? `<br>${r.errors.length} ta xato: ${r.errors.map((x) => `${x.block}-blok («${esc(x.text.slice(0, 40))}») — ${esc(x.error)}`).join('; ')}` : ''}</div></div>`;
        if (r.added) { $('#imp', m).value = ''; const tb = $('#tabbody'); const nd = await api(`/admin/courses/${cid}`); tb.innerHTML = questionsTab(nd); bindQuestions(nd); $$('.tab .count')[1].textContent = nd.questions.length; }
      } catch (e) { toastErr(e); }
    }),
  }));
}

async function resultsTab(c) {
  const r = await api(`/admin/courses/${c.id}/results`);
  const s = r.summary;
  const deps = [...new Set(r.rows.map((x) => x.user.department).filter(Boolean))].sort();
  $('#tabbody').innerHTML = `
    <div class="grid grid-4" style="margin-bottom:18px">
      ${statCard(I.users, 'Tayinlangan', s.assigned, 'xodim', 'blue')}
      ${statCard(I.award, 'Tugatgan', s.completed, `${s.assigned ? Math.round((s.completed / s.assigned) * 100) : 0}% xodim`, 'green')}
      ${statCard(I.layers, 'Jarayonda / boshlamagan', `${s.inProgress} / ${s.notStarted}`, `${s.failed} ta o'ta olmadi`, 'amber')}
      ${statCard(I.target, "O'rtacha ball", s.avgScore !== null ? s.avgScore + '%' : '—', `${s.overdue} ta muddati o'tgan`, 'pink')}
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="card-head" style="flex-wrap:wrap">
        <div class="row"><input class="input" id="rs" placeholder="Ism bo'yicha qidirish" style="width:220px;height:36px">
          <select class="input" id="rst" style="width:auto;height:36px"><option value="">Barcha holatlar</option>${Object.entries(STATUS).map(([k, [, t]]) => `<option value="${k}">${t}</option>`).join('')}<option value="overdue">Muddati o'tgan</option></select>
          ${deps.length > 1 ? `<select class="input" id="rd" style="width:auto;height:36px"><option value="">Barcha bo'limlar</option>${deps.map((d) => `<option>${esc(d)}</option>`).join('')}</select>` : ''}</div>
        <button class="btn btn-sm" id="csv">${I.download}Excel (CSV)</button>
      </div>
      <div class="table-wrap"><table class="table cards"><thead><tr><th>Xodim</th><th class="hide-sm">Bo'lim</th><th>Holat</th><th>Jarayon</th><th>Eng yaxshi ball</th><th class="hide-sm">Urinish</th><th class="hide-sm">Nazorat</th><th class="hide-sm">Tugatgan sana</th><th></th></tr></thead><tbody id="rb"></tbody></table></div>
    </div>
    <div class="card"><div class="card-head"><h2>Eng qiyin savollar</h2><span class="small muted">Xato javoblar ulushi — qaysi mavzuni yaxshiroq tushuntirish kerakligini ko'rsatadi</span></div>
      ${r.hardest.length ? `<div class="card-pad bar-list">${r.hardest.map((h) => `<div class="bar-item"><div class="row small" style="margin-bottom:6px"><span>${esc(h.text)}</span><span class="muted nowrap">${h.wrong}/${h.shown} xato · <b style="color:${h.wrongRate >= 50 ? 'var(--red)' : 'var(--text)'}">${h.wrongRate}%</b></span></div>
        <div class="progress"><i style="width:${h.wrongRate}%;background:${h.wrongRate >= 50 ? 'var(--red)' : '#f59e0b'}"></i></div></div>`).join('')}</div>`
      : '<div class="empty" style="padding:24px">Hali test topshirilmagan</div>'}
    </div>`;
  const filtered = () => {
    const sq = $('#rs').value.trim().toLowerCase(), st = $('#rst').value, dp = $('#rd')?.value || '';
    return r.rows.filter((x) => (!sq || x.user.name.toLowerCase().includes(sq)) && (!st || (st === 'overdue' ? x.overdue : x.status === st)) && (!dp || x.user.department === dp));
  };
  const draw = () => {
    const rows = filtered();
    $('#rb').innerHTML = rows.length ? rows.map((x) => `<tr>
      <td><a class="user-cell" href="#/admin/users/${x.user.id}">${avatar(x.user.name, 'sm')}<div><b>${esc(x.user.name)}</b><div class="small muted">${esc(x.user.position)}</div></div></a></td>
      <td class="hide-sm">${esc(x.user.department) || '—'}</td>
      <td>${statusBadge(x.status, x.overdue)}</td>
      <td style="min-width:120px"><div class="small muted" style="margin-bottom:4px">${x.progress}% · ${x.lessonsDone}/${x.lessonsTotal} dars</div>${progressBar(x.progress, x.status === 'completed')}</td>
      <td>${x.best !== null ? `<b style="color:${x.passed ? 'var(--green)' : 'var(--red)'}">${x.best}%</b>` : '<span class="faint">—</span>'}</td>
      <td class="hide-sm">${x.attemptsUsed}${c.maxAttempts ? ' / ' + c.maxAttempts : ''}</td>
      <td class="hide-sm">${x.lastAttemptId ? `${x.violations ? `<span class="badge badge-red">${x.violations} ta</span>` : '<span class="badge badge-green">Toza</span>'}${x.snapshots ? ` <span class="badge badge-gray no-dot" title="Kamera suratlari">${I.camera.replace('<svg', '<svg width="12" height="12"')} ${x.snapshots}</span>` : ''}` : '<span class="faint">—</span>'}</td>
      <td class="hide-sm small">${fmtDate(x.completedAt)}</td>
      <td class="actions">${x.lastAttemptId ? `<a class="icon-btn" href="#/admin/attempts/${x.lastAttemptId}" title="Urinish tafsiloti">${I.eye}</a>` : ''}${x.attemptsUsed ? `<button class="icon-btn" data-reset="${x.user.id}" title="Urinishlarni qayta tiklash">${I.refresh}</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="9"><div class="empty" style="padding:20px">${r.rows.length ? 'Filtr bo\'yicha hech kim topilmadi' : 'Bu kursga hech kim tayinlanmagan. Xodimlar qo\'shing yoki bo\'limlarni tekshiring'}</div></td></tr>`;
  };
  ['input', 'change'].forEach((ev) => $('#tabbody').addEventListener(ev, (e) => { if (['rs', 'rst', 'rd'].includes(e.target.id)) draw(); }));
  $('#rb').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-reset]');
    if (!b) return;
    const row = r.rows.find((x) => x.user.id === Number(b.dataset.reset));
    if (!(await confirmBox('Urinishlarni qayta tiklaysizmi?', `${esc(row.user.name)}ning bu kursdagi barcha test urinishlari va kamera suratlari o'chiriladi. Xodim testni qaytadan topshira oladi.`, 'Qayta tiklash', true))) return;
    try { await api(`/admin/courses/${c.id}/users/${row.user.id}/reset`, { method: 'POST' }); toast('Urinishlar tiklandi', 'success'); router(); } catch (err) { toastErr(err); }
  });
  draw();
  $('#csv').addEventListener('click', () => {
    const label = (x) => (STATUS[x.status] || STATUS.not_started)[1];
    downloadCsv(`natijalar-${c.title.replace(/[^\p{L}\p{N}]+/gu, '-').slice(0, 40)}.csv`, [
      ['Xodim', 'Telefon', "Bo'lim", 'Lavozim', 'Holat', "Muddati o'tgan", 'Jarayon %', 'Darslar', 'Eng yaxshi ball %', 'Urinishlar', 'Tugatgan sana'],
      ...filtered().map((x) => [x.user.name, '+' + x.user.phone, x.user.department, x.user.position, label(x), x.overdue ? 'Ha' : 'Yo\'q', x.progress, `${x.lessonsDone}/${x.lessonsTotal}`, x.best ?? '', x.attemptsUsed, x.completedAt ? fmtDate(x.completedAt) : '']),
    ]);
  });
}

// ------------------------------------------------------------ admin: users
async function adminUsers() {
  render(adminShell('users', loading()));
  const users = await api('/admin/users');
  const deps = [...new Set(users.map((u) => u.department).filter(Boolean))].sort();
  render(adminShell('users', `
    <div class="page-head"><div><h1>Xodimlar</h1><p class="muted">${users.filter((u) => u.role === 'employee').length} ta xodim · ${deps.length} ta bo'lim</p></div>
      <div class="row"><button class="btn" data-import>${I.upload}Ro'yxatdan import</button><button class="btn btn-primary" data-add>${I.plus}Xodim qo'shish</button></div></div>
    <div class="card">
      <div class="card-head"><div class="row"><input class="input" id="us" placeholder="Ism yoki telefon" style="width:240px;height:36px">
        ${deps.length ? `<select class="input" id="ud" style="width:auto;height:36px"><option value="">Barcha bo'limlar</option>${deps.map((d) => `<option>${esc(d)}</option>`).join('')}</select>` : ''}</div></div>
      <div class="table-wrap"><table class="table cards"><thead><tr><th>F.I.Sh.</th><th>Telefon</th><th class="hide-sm">Bo'lim</th><th class="hide-sm">Lavozim</th><th></th></tr></thead><tbody id="ub"></tbody></table></div>
    </div>
    <datalist id="deplist">${deps.map((d) => `<option value="${esc(d)}">`).join('')}</datalist>`));
  const draw = () => {
    const sq = $('#us').value.trim().toLowerCase(), dp = $('#ud')?.value || '';
    const rows = users.filter((u) => (!sq || u.name.toLowerCase().includes(sq) || u.phone.includes(sq.replace(/\D/g, '') || '~')) && (!dp || u.department === dp));
    $('#ub').innerHTML = rows.length ? rows.map((u) => `<tr data-id="${u.id}">
      <td><a class="user-cell" href="#/admin/users/${u.id}">${avatar(u.name, 'sm')}<b>${esc(u.name)}</b>${u.role === 'admin' ? '<span class="badge badge-amber">Admin</span>' : ''}</a></td>
      <td class="nowrap">${fmtPhone(u.phone)}</td><td class="hide-sm">${esc(u.department) || '—'}</td><td class="hide-sm">${esc(u.position) || '—'}</td>
      <td class="actions"><button class="icon-btn" data-edit title="Tahrirlash">${I.edit}</button>${u.id !== state.me.id ? `<button class="icon-btn" data-del title="O'chirish">${I.trash}</button>` : ''}</td></tr>`).join('')
      : `<tr><td colspan="5"><div class="empty" style="padding:20px">Hech kim topilmadi</div></td></tr>`;
    $$('#ub tr[data-id]').forEach((tr) => {
      const u = users.find((x) => x.id === Number(tr.dataset.id));
      $('[data-edit]', tr).addEventListener('click', () => userModal(u));
      $('[data-del]', tr)?.addEventListener('click', async () => {
        if (!(await confirmBox("Xodimni o'chirasizmi?", `${esc(u.name)} va uning barcha natijalari o'chiriladi.`, "O'chirish", true))) return;
        try { await api(`/admin/users/${u.id}`, { method: 'DELETE' }); toast("O'chirildi"); router(); } catch (e) { toastErr(e); }
      });
    });
  };
  $('#us').addEventListener('input', draw);
  $('#ud')?.addEventListener('change', draw);
  draw();
  $('[data-add]').addEventListener('click', () => userModal());
  $('[data-import]').addEventListener('click', importUsersModal);
}
function credentialsModal(list) {
  const text = list.map((x) => `${x.name}: login +${x.phone}, parol ${x.password}`).join('\n');
  openModal({
    title: 'Kirish ma\'lumotlari',
    body: `<div class="stack"><div class="notice amber">${I.info}<div>Parollarni hozir nusxalab oling — keyin ular ko'rsatilmaydi. Xodimlarga Telegram orqali yuborishingiz mumkin.</div></div>
      <div class="field"><label>Sayt manzili</label><div>${esc(location.origin)}</div></div>
      <pre class="code">${esc(text)}</pre></div>`,
    foot: `<button class="btn" data-close>Yopish</button><button class="btn btn-primary" data-copy>${I.copy}Nusxa olish</button>`,
    onMount: (m) => $('[data-copy]', m).addEventListener('click', () => copyText(`${location.origin}\n\n${text}`)),
  });
}
function userModal(u) {
  openModal({
    title: u ? 'Xodimni tahrirlash' : 'Yangi xodim',
    body: `<form id="uf" class="form-grid">
      <div class="field full"><label>F.I.Sh.</label><input class="input" name="name" value="${esc(u?.name || '')}" required></div>
      <div class="field"><label>Telefon</label><div class="phone-in"><span>+998</span><input class="input" name="phone" type="tel" inputmode="numeric" data-phone maxlength="12" value="${u ? maskPhone(u.phone) : ''}" required placeholder="90 123 45 67"></div></div>
      <div class="field"><label>Rol</label><select class="input" name="role"><option value="employee">Xodim</option><option value="admin" ${u?.role === 'admin' ? 'selected' : ''}>Administrator</option></select></div>
      <div class="field"><label>Bo'lim</label><input class="input" name="department" list="deplist" value="${esc(u?.department || '')}" placeholder="Masalan: Sotuv"></div>
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
        if (u && u.id === state.me.id) state.me = r.user;
        await router();
        if (!u) credentialsModal([{ name: r.user.name, phone: r.user.phone, password: r.password }]);
        else if (body.password) credentialsModal([{ name: r.user.name, phone: r.user.phone, password: body.password }]);
        else toast('Saqlandi', 'success');
      } catch (err) { toastErr(err); }
    }),
  });
}
function importUsersModal() {
  openModal({
    title: "Xodimlarni ro'yxatdan qo'shish", wide: true,
    body: `<div class="stack">
      <p class="muted">Excel'dan ustunlarni nusxa olib joylashtiring yoki har bir qatorga nuqtali vergul bilan yozing. Tartib: <b>F.I.Sh. ; telefon ; bo'lim ; lavozim ; parol</b>. Parol ixtiyoriy — bo'sh bo'lsa avtomatik yaratiladi.</p>
      <pre class="code">Aziza Karimova; 901234567; Sotuv; Menejer
Jasur Toshmatov; 935554433; Sotuv; Katta menejer
Dilnoza Rahimova; 977778899; Call-markaz; Operator</pre>
      <textarea class="input" id="ui" style="min-height:200px" placeholder="Ro'yxatni shu yerga joylashtiring"></textarea>
      <div id="uires"></div></div>`,
    foot: `<button class="btn" data-close>Yopish</button><button class="btn btn-primary" id="duimp">Qo'shish</button>`,
    onMount: (m, close) => $('#duimp', m).addEventListener('click', async () => {
      try {
        const r = await api('/admin/users/import', { method: 'POST', body: { text: $('#ui', m).value } });
        if (r.errors.length) {
          $('#uires', m).innerHTML = `<div class="notice amber">${I.info}<div><b>${r.created.length} ta qo'shildi, ${r.errors.length} ta xato:</b><br>${r.errors.map((x) => `${x.line}-qator: ${esc(x.error)}`).join('<br>')}</div></div>`;
          $('#ui', m).value = r.errors.map((x) => x.text).join('\n');
        } else close();
        if (r.created.length) { await router(); credentialsModal(r.created); }
      } catch (e) { toastErr(e); }
    }),
  });
}
async function adminUser(id) {
  render(adminShell('users', loading()));
  const d = await api(`/admin/users/${id}/progress`);
  const u = d.user;
  render(adminShell('users', `
    <a class="back" href="#/admin/users">${I.back}Xodimlar</a>
    <div class="page-head"><div class="row" style="gap:16px">${avatar(u.name, 'lg')}<div><h1>${esc(u.name)}</h1><p class="muted">${fmtPhone(u.phone)}${u.department ? ' · ' + esc(u.department) : ''}${u.position ? ' · ' + esc(u.position) : ''}</p></div></div></div>
    <div class="card" style="margin-bottom:16px"><div class="card-head"><h2>Kurslar</h2></div>
      <div class="table-wrap"><table class="table cards"><thead><tr><th>Kurs</th><th>Holat</th><th>Jarayon</th><th>Ball</th><th class="hide-sm">Muddat</th></tr></thead><tbody>
      ${d.courses.length ? d.courses.map((c) => `<tr><td><a href="#/admin/courses/${c.id}/results"><b>${esc(c.title)}</b></a></td><td>${statusBadge(c.status, c.overdue)}</td>
        <td style="min-width:120px">${progressBar(c.progress, c.status === 'completed')}<div class="small muted">${c.progress}%</div></td><td>${c.best !== null ? c.best + '%' : '—'}</td><td class="hide-sm">${fmtDate(c.deadline)}</td></tr>`).join('')
      : '<tr><td colspan="5"><div class="empty" style="padding:20px">Tayinlangan kurslar yo\'q</div></td></tr>'}
      </tbody></table></div></div>
    <div class="card"><div class="card-head"><h2>Test urinishlari</h2></div>
      <div class="table-wrap"><table class="table cards"><thead><tr><th>Kurs</th><th>Natija</th><th>To'g'ri</th><th>Nazorat</th><th>Sana</th><th></th></tr></thead><tbody>
      ${d.attempts.length ? d.attempts.map((a) => `<tr><td><a href="#/admin/attempts/${a.id}"><b>${esc(a.courseTitle)}</b></a></td><td><span class="badge ${a.passed ? 'badge-green' : 'badge-red'}">${a.score}% · ${a.passed ? "O'tdi" : "O'tmadi"}</span></td><td>${a.correct}/${a.total}</td><td>${a.violations ? `<span class="badge badge-red">${a.violations} ta</span>` : '<span class="badge badge-green">Toza</span>'}</td><td class="small">${fmtDateTime(a.finishedAt)}</td><td class="actions"><a class="icon-btn" href="#/admin/attempts/${a.id}">${I.eye}</a></td></tr>`).join('')
      : '<tr><td colspan="6"><div class="empty" style="padding:20px">Hali test topshirmagan</div></td></tr>'}
      </tbody></table></div></div>`));
}

// ------------------------------------------------------------ admin: attempt detail
async function adminAttempt(id) {
  render(adminShell('courses', loading()));
  const a = await api(`/admin/attempts/${id}`);
  const dur = a.finishedAt ? Math.round((Date.parse(a.finishedAt) - Date.parse(a.startedAt)) / 1000) : null;
  const viol = a.violations.filter((v) => v.type !== 'info');
  const kindLabel = { start: 'Boshlanish', periodic: 'Rejali', violation: 'Qoidabuzarlik', finish: 'Yakun' };
  const color = a.passed ? '#10a56f' : '#e5484d';
  render(adminShell('courses', `
    <a class="back" href="#/admin/courses/${a.course.id}/results">${I.back}${esc(a.course.title)} — natijalar</a>
    <div class="attempt-head card">
      <div class="user-cell">${avatar(a.user.name, 'lg')}<div><h1 style="font-size:24px">${esc(a.user.name)}</h1>
        <p class="muted">${esc(a.user.department || '')}${a.user.position ? ' · ' + esc(a.user.position) : ''} · ${fmtPhone(a.user.phone)}</p></div></div>
      <div class="attempt-kpis">
        <div><span>Natija</span><b style="color:${a.finishedAt ? color : 'inherit'}">${a.finishedAt ? a.score + '%' : 'Jarayonda'}</b></div>
        <div><span>To'g'ri javob</span><b>${a.finishedAt ? `${a.correct}/${a.total}` : '—'}</b></div>
        <div><span>Davomiyligi</span><b>${dur !== null ? fmtTime(dur) : '—'}</b></div>
        <div><span>Qoidabuzarlik</span><b style="color:${viol.length ? 'var(--red)' : 'var(--green)'}">${viol.length}</b></div>
      </div>
    </div>
    ${a.autoSubmitted ? `<div class="notice amber" style="margin:16px 0">${I.alert}<div>Test avtomatik topshirilgan: <b>${a.autoSubmitted === 'violations' ? 'qoidabuzarliklar limiti tugadi' : 'vaqt tugadi'}</b></div></div>` : ''}
    <div class="grid" style="grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);align-items:start;margin-top:18px" id="agrid">
      <div class="stack">
        <div class="card"><div class="card-head"><h2>${I.camera.replace('<svg', '<svg width="18" height="18" style="vertical-align:-3px;margin-right:6px;color:var(--primary)"')}Kamera suratlari</h2><span class="small muted">${a.snapshots.length} ta</span></div>
          ${a.snapshots.length ? `<div class="snap-grid">${a.snapshots.map((s) => `<button class="snap ${s.kind === 'violation' ? 'bad' : ''}" data-src="/api/admin/snapshots/${s.id}" data-cap="${esc(kindLabel[s.kind] || s.kind)} · ${fmtDateTime(s.createdAt)}">
            <img loading="lazy" src="/api/admin/snapshots/${s.id}" alt=""><span>${kindLabel[s.kind] || s.kind} · ${new Date(s.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span></button>`).join('')}</div>`
          : `<div class="empty" style="padding:28px">${I.camera}<h3>Suratlar yo'q</h3><p>${a.course.proctorCamera ? 'Bu urinishda kamera suratlari saqlanmagan' : 'Bu kursda kamera nazorati yoqilmagan'}</p></div>`}
        </div>
        <div class="card"><div class="card-head"><h2>Javoblar</h2><span class="small muted">${a.answers.filter((x) => x.isCorrect).length} / ${a.answers.length} to'g'ri</span></div>
          ${a.answers.map((x, i) => `<div class="ans-row ${x.isCorrect ? 'ok' : 'bad'}"><span class="ans-ic">${x.isCorrect ? I.check : I.x}</span><div style="min-width:0">
            <b>${i + 1}. ${esc(x.text)}</b>
            <div class="small">${x.chosen === null ? '<span class="faint">Javob berilmagan</span>' : `Javob: <span style="color:${x.isCorrect ? 'var(--green)' : 'var(--red)'};font-weight:600">${esc(x.chosen)}</span>`}${!x.isCorrect ? ` · To'g'ri: <b>${esc(x.correctAnswer)}</b>` : ''}</div></div></div>`).join('')}
        </div>
      </div>
      <div class="card"><div class="card-head"><h2>Hodisalar xronologiyasi</h2></div>
        <div class="timeline">
          <div class="tl ok"><i></i><div><b>Test boshlandi</b><span>${fmtDateTime(a.startedAt)}</span></div></div>
          ${a.violations.map((v) => `<div class="tl bad"><i></i><div><b>${esc(v.label)}</b><span>${fmtDateTime(v.at)} · ${fmtTime((Date.parse(v.at) - Date.parse(a.startedAt)) / 1000)} daqiqada</span></div></div>`).join('')}
          ${a.finishedAt ? `<div class="tl ${a.passed ? 'ok' : 'bad'}"><i></i><div><b>Test yakunlandi — ${a.score}%</b><span>${fmtDateTime(a.finishedAt)}</span></div></div>` : ''}
        </div>
        ${!viol.length ? `<div class="notice green" style="margin:0 20px 20px">${I.shield}<div>Qoidabuzarliklar aniqlanmadi</div></div>` : ''}
      </div>
    </div>`));
  const grid = $('#agrid');
  const mq = window.matchMedia('(max-width: 1000px)');
  const fit = () => { grid.style.gridTemplateColumns = mq.matches ? '1fr' : 'minmax(0,1.3fr) minmax(0,1fr)'; };
  fit(); mq.addEventListener('change', fit); onCleanup(() => mq.removeEventListener('change', fit));
  $$('.snap').forEach((s) => s.addEventListener('click', () => openModal({
    title: s.dataset.cap, wide: true,
    body: `<img src="${s.dataset.src}" alt="" style="width:100%;border-radius:14px;display:block">`,
  })));
}

// ------------------------------------------------------------ router
const routes = [
  [/^\/login$/, pageLogin, 'public'],
  [/^\/$/, pageHome],
  [/^\/profile$/, pageProfile],
  [/^\/course\/(\d+)$/, pageCourse],
  [/^\/course\/(\d+)\/lesson\/(\d+)$/, pageLesson],
  [/^\/course\/(\d+)\/test$/, pageTest],
  [/^\/attempt\/(\d+)$/, pageResult],
  [/^\/certificate\/(\d+)$/, pageCertificate],
  [/^\/admin$/, adminDashboard, 'admin'],
  [/^\/admin\/courses$/, adminCourses, 'admin'],
  [/^\/admin\/courses\/(\d+)(?:\/(settings|lessons|questions|results))?$/, adminCourse, 'admin'],
  [/^\/admin\/users$/, adminUsers, 'admin'],
  [/^\/admin\/users\/(\d+)$/, adminUser, 'admin'],
  [/^\/admin\/attempts\/(\d+)$/, adminAttempt, 'admin'],
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
    try { await fn(...m.slice(1)); }
    catch (e) {
      if (seq !== routeSeq || !state.me) return;
      render(shell('', `<div class="card empty">${I.info}<h3>Xatolik</h3><p style="margin-bottom:16px">${esc(e.message)}</p><a class="btn" href="${state.me.role === 'admin' ? '#/admin' : '#/'}">Bosh sahifa</a></div>`));
    }
    return;
  }
  location.hash = state.me.role === 'admin' ? '#/admin' : '#/';
}

// Telefon raqam maskasi: +998 | 90 123 45 67
function phoneDigits(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length > 9 && d.startsWith('998')) d = d.slice(3);
  return d.slice(0, 9);
}
function maskPhone(v) {
  const d = phoneDigits(v);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean).join(' ');
}
document.addEventListener('input', (e) => {
  const el = e.target;
  if (!el.matches?.('input[data-phone]')) return;
  // kursor joyini raqamlar soni bo'yicha saqlaymiz
  const digitsBefore = phoneDigits(el.value.slice(0, el.selectionStart ?? el.value.length)).length;
  el.value = maskPhone(el.value);
  let pos = 0, seen = 0;
  while (pos < el.value.length && seen < digitsBefore) { if (/\d/.test(el.value[pos])) seen++; pos++; }
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

// Telefonda jadval kartochkaga aylanadi: har bir katakka ustun nomini yozib qo'yamiz
function labelTables() {
  $$('table.table.cards').forEach((t) => {
    const hs = $$('thead th', t).map((th) => th.textContent.trim());
    $$('tbody tr', t).forEach((tr) => [...tr.children].forEach((td, i) => {
      if (td.colSpan > 1 || td.dataset.label !== undefined) return;
      td.dataset.label = hs[i] || '';
    }));
  });
}
new MutationObserver(labelTables).observe($app, { childList: true, subtree: true });

(async function boot() {
  try {
    const r = await api('/me');
    state.me = r.user;
    state.appName = r.appName || state.appName;
    document.title = state.appName;
  } catch { /* offline */ }
  window.addEventListener('hashchange', router);
  router();
})();
