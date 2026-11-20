# lms-ui

**O‘quv markazi** — korporativ LMS (xodimlarni o'qitish va test qilish) uchun frontend.

Backend va API hujjati: **lms-backend** repozitoriysi → `API.md`.

Jonli demo: https://lms.194-163-139-167.sslip.io

## 1 daqiqada ishga tushirish

Faqat **Node.js 18+** kerak. `npm install` shart emas — tashqi kutubxona yo'q.

```bash
git clone <lms-ui url>
cd lms-ui
npm run dev
```

http://localhost:5173 ni oching. Dev-server `/api/*` so'rovlarini **jonli demo serverga** proksi qiladi, shuning uchun backend'ni lokal ko'tarish shart emas — demo ma'lumotlar (kurslar, videolar, natijalar) darhol ko'rinadi.

Kod o'zgartirilgandan keyin brauzerda **F5** — build bosqichi yo'q.

### Lokal backend bilan

```bash
# lms-backend repozitoriysida: docker compose up -d  (yoki npm run dev)
npm run dev:local          # API → http://localhost:3000
# yoki istalgan manzil:
API_URL=https://boshqa-server.uz npm run dev
```

## Demo akkauntlar

| Rol | Telefon | Parol |
|---|---|---|
| Xodim (jarayonda, Dilnoza) | 90 111 00 01 | demo123 |
| Xodim (toza, Jasur) | 90 111 00 02 | demo123 |
| Admin | — | jamoa rahbaridan so'rang |

## Stack

Vanilla JS SPA — framework yo'q, build yo'q. Hash routing (`#/course/2`), API bilan `fetch` + cookie sessiya.
Shriftlar: Google Fonts (Poppins + Inter). PDF ko'rish: pdf.js (cdnjs, kerak bo'lganda yuklanadi).

## Tuzilma

```
public/
  index.html    — kirish nuqtasi (?v=N — kesh versiyasi, deploy'da oshiriladi)
  app.css       — dizayn tizimi: :root tokenlari → komponentlar → "BRAND LAYER" → "MOBILE" (≤760px)
  app.js        — butun ilova
dev-server.js   — statik fayllar + /api proksi
```

### `app.js` xaritasi

| Bo'lim | Nima bor |
|---|---|
| utils | `api()` (fetch o'rami, 401 → login), `uploadForm()` (progress bilan), `toast`, `openModal`, `confirmBox`, `downloadCsv` |
| icons | `I` — inline SVG ikonkalar, `avatar()`, `statCard()`, `ring()` |
| shells | `adminShell` (sidebar + mobil tab bar), `empShell` (topbar + mobil tab bar), `render()` |
| login | Telefon maskasi (`maskPhone`, `phoneDigits`, `checkPhone` — fayl oxirida) |
| employee | `pageHome`, `pageCourse`, `pageLesson`, `setupPlayer` (oldinga o'tkazib bo'lmaydigan video pleyer, serverga heartbeat, uzilishda avtoqayta ulanish), `renderPdf` (pdf.js) |
| test | `precheck` (qoidalar + kamera), `pageTest` (to'liq ekran, qoidabuzarliklar, suv belgisi, kamera suratlari), `pageResult`, `pageCertificate` |
| admin | `adminDashboard`, `adminCourses`, `adminCourse` (tablar: sozlamalar / materiallar / savollar / natijalar), `adminUsers`, `adminUser`, `adminAttempt` (kamera suratlari, hodisalar xronologiyasi) |
| router | `routes` jadvali — yangi sahifa qo'shish: regex + funksiya |

### Konventsiyalar

- Sahifa = `async function pageX(params)`: `render(shell(...))` → event'larni bog'lash.
- Foydalanuvchi matni har doim `esc()` orqali HTML'ga qo'yiladi.
- Sahifadan chiqqanda tozalash kerak bo'lsa (taymer, listener, kamera) — `onCleanup(fn)`.
- Mobil jadvallar: `<table class="table cards">` — telefonda avtomatik kartochkaga aylanadi (`labelTables`).
- Ranglar va o'lchamlar faqat CSS o'zgaruvchilari orqali (`--primary`, `--ink`, `--green` ...).

## Production

`public/` papkasi backend konteyneriga ulanadi (`lms-backend/docker-compose.yml` → `UI_DIR`), backend uni o'zi beradi — frontend va API bitta domenda. Deploy'dan oldin `index.html` dagi `?v=` raqamini oshiring.

## Avtomatik deploy

`main`'ga push yoki PR merge → GitHub Actions: `node --check` → `index.html`dagi `?v=` commit hash'ga almashtiriladi → `public/` serverga yuboriladi. Qayta build kerak emas, o'zgarish darhol ko'rinadi.

Kerakli secret'lar: `DEPLOY_SSH_KEY`, `DEPLOY_HOST`, `DEPLOY_KNOWN_HOSTS`.
