# KINORA — kinora.uz uslubidagi film va seriallar katalogi

KINORA — Telegram Mini App, GitHub Pages frontend va FastAPI backenddan iborat
to'liq ishlaydigan katalog platformasi. Interfeys o'zbek lotin va kirill
alifbolarida ishlaydi. Barcha statistikalar, kontent, reklama va foydalanuvchilar
haqiqiy ma'lumotlar bazasidan olinadi — soxta raqamlar yo'q.

> Muhim: ombordagi katalog — 7 ta aniq **DEMO** yozuv. Ularning aksariyatida
> video biriktirilmagan. Yagona o'ynaladigan namuna — Blender Foundation'ning
> CC BY 3.0 litsenziyali "Big Buck Bunny" qisqa filmi. To'liq mualliflik
> huquqiga ega filmlar yoki dublyajlar qo'shilmagan.

## Jonli deploy holati (2026-10-31)

- Frontend: <https://obidov1410.github.io/Kinora/> — GitHub Pages, `pages.yml`
  Actions workflow orqali deploy qilinadi.
- Backend: <https://kinora-api-k3c6.onrender.com> — Render, Frankfurt,
  **Free** instance (persistent disk yo'q).
- Tekshirilgan: `/api/health` → `"status": "ok"`, live sayt Render API'dan
  demo katalogni oladi, poster/backdrop fayllari 200 qaytaradi, console'da JS
  xatosi yo'q.
- Hali yoqilmagan: serverga `BOT_TOKEN` kiritilmagan (`telegram_configured:
  false`), shu sabab Telegram login va admin panel ishlamaydi. BotFather'dagi
  Menu Button ham hali sozlanmagan. Buni yoqish uchun quyidagi
  [Telegram Mini App](#telegram-mini-app-botfather) bo'limiga qarang.
- Free instance 15 daqiqa harakatsizlikdan keyin uxlaydi (birinchi so'rov
  ~50 soniya) va diskni saqlamaydi: redeploy/restartda SQLite bazasi va
  yuklamalar demo holatiga qaytadi. Doimiy ma'lumot uchun Starter + disk.

## Nima ishlaydi

- Landing: kinematik kolaj, til tanlash, Telegram orqali kirish.
- Katalog: bosh sahifa, film/serial bo'limlari, janr filtrlari, saralash,
  instant qidiruv va to'liq qidiruv natijalari, sahifalash, bo'sh holatlar.
- Kontent sahifasi: poster/backdrop, metadata, treyler, mavsum va qismlar,
  sevimlilar, ulashish, ko'rishlar hisobi, demo/ishonchli litsenziya izohlari.
- Telegram Mini App kirishi: frontend `initData`ni faqat ko'rsatish uchun
  ishlatadi, server esa uni `BOT_TOKEN` bilan HMAC orqali tekshiradi.
- Profil, VIP sahifasi, sevimlilar, tilni saqlash.
- Admin panel: haqiqiy dashboard, kontent CRUD, mavsum/qismlar, reklama CRUD va
  impression/click statistikasi, foydalanuvchilar, VIP tariflar, audit jurnali,
  sozlamalar, SQLite zaxira nusxalari (yaratish/yuklab olish/tiklash).
- Xavfsizlik: har bir admin so'rovida bazadagi rol tekshiriladi, egasi
  (`OWNER_ID`) override qilinadi, bloklangan foydalanuvchi rad etiladi,
  rate limit, xavfsizlik sarlavhalari, CORS ro'yxati, rasm validatsiyasi,
  imzolangan vaqtinchalik media tokenlari.

To'lov provayderi ataylab biriktirilmagan: `PAYMENT_PROVIDER=none` bo'lganda
xarid tugmasi faolsiz va checkout `503` qaytaradi. VIP faqat serverda
tasdiqlangan webhook yoki audit qilinadigan admin granti bilan beriladi.

## Texnologiyalar

- Backend: Python 3.12, FastAPI, SQLAlchemy 2, SQLite (WAL), Pydantic v2, PyJWT.
- Frontend: sof HTML/CSS/JavaScript ES modullari (build talab qilinmaydi).
- Deploy: Render (backend; hozir Free, persistent disk ixtiyoriy), GitHub Pages
  (frontend).

## Lokal ishga tushirish (Windows)

```bat
cd C:\Users\user\Documents\Qoder\2026-10-31\cab6af6b
python -m venv .venv
.venv\Scripts\activate
pip install -r backend\requirements.txt

set ENV=development
set ALLOW_DEV_LOGIN=true
set SECRET_KEY=local-dev-secret-change-me
set DATABASE_URL=sqlite:///backend/data/kinora.db
uvicorn backend.main:app --reload --port 8000
```

Ikkinchi terminalda frontend:

```bat
cd C:\Users\user\Documents\Qoder\2026-10-31\cab6af6b
python -m http.server 5500 --directory frontend
```

- Sayt: http://127.0.0.1:5500/
- API hujjatlari: http://127.0.0.1:8000/docs
- Health: http://127.0.0.1:8000/api/health

`frontend/config.js` localhostda avtomatik `http://127.0.0.1:8000` ga ulanadi.
Dev login faqat `ENV` production bo'lmaganda va `ALLOW_DEV_LOGIN=true` bo'lganda
ochiladi; productionda bu endpoint `404` qaytaradi.

Testlar:

```bat
.venv\Scripts\python.exe -m pytest -q
```

## Deploy: GitHub Pages (frontend)

1. GitHub'da `obidov1410/Kinora` nomli repozitoriy yarating (public).
2. Lokal papkada:

   ```bat
   git init
   git add .
   git commit -m "Kinora platform"
   git branch -M main
   git remote add origin https://github.com/obidov1410/Kinora.git
   git push -u origin main
   ```

3. Repozitoriy → **Settings → Pages → Build and deployment → Source:
   GitHub Actions** (hozir shunday sozlangan).
4. Repozitoriy → **Settings → Secrets and variables → Actions → Variables →
   New repository variable**:
   - nomi: `KINORA_API_BASE_URL`
   - qiymati: Render'dan olingan manzil, hozir
     `https://kinora-api-k3c6.onrender.com` (oxirida `/` bo'lmasin).
   Workflow shu qiymatni `frontend/config.js` dagi
   `https://YOUR-RENDER-SERVICE.onrender.com` placeholder'iga almashtiradi.
   Alternativa: `frontend/config.js` faylidagi shu qatorni qo'lda tahrirlang.
5. `main` branchga push qilinganda `.github/workflows/pages.yml` ishga tushadi.
   Sayt manzili: `https://obidov1410.github.io/Kinora/`.

Agar Render manzili hali yo'q bo'lsa, avval backendni deploy qiling, keyin
variable qiymatini kiriting va workflow'ni **Actions → Deploy frontend to
GitHub Pages → Run workflow** orqali qayta ishga tushiring.

## Deploy: Render (backend)

### Hozirgi servis (2026-10-31)

- Nom: `kinora-api`, region Frankfurt, instance **Free**.
- URL: <https://kinora-api-k3c6.onrender.com>
- Service ID: `srv-dbj2dbk9v7es738umnb0`.
- Build: `pip install -r backend/requirements.txt`; start:
  `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`.
- Kiritilgan env: `ENV=production`, `SECRET_KEY` (Render generate),
  `BOT_USERNAME`, `OWNER_ID`, `CORS_ORIGINS`, `FRONTEND_URL`, rate limit,
  sessiya/media TTL, `SEED_DEMO=true`, `PAYMENT_PROVIDER=none`.
- **Yetishmayotgan yagona muhim env — `BOT_TOKEN`.** Uni faqat Render
  dashboard orqali kiriting: service → **Environment → Add Environment
  Variable** → key `BOT_TOKEN`, value BotFather'dan olingan token → **Save**.
  Redeploy tugagach `/api/health` da `"telegram_configured": true` bo'ladi.
- Free instance diskni saqlamaydi. Doimiy baza va yuklamalar uchun
  **Settings → Instance** orqali Starter'ga o'ting, `/var/data` disk qo'shing
  va `DATABASE_URL=sqlite:////var/data/kinora.db`, `DATA_DIR=/var/data`,
  `UPLOADS_DIR=/var/data/uploads`, `BACKUPS_DIR=/var/data/backups` env'larini
  kiriting. Hozirgi bepul bazadagi ma'lumotlar bunday o'tishda ko'chmaydi —
  kerak bo'lsa avval admin panel orqali zaxira nusxa yuklab oling.

### Variant A — Blueprint (yangi, to'lovli instance uchun)

1. Repozitoriyni Render'ga ulang.
2. **New → Blueprint**, `obidov1410/Kinora` repozitoriysini tanlang.
3. `render.yaml` avtomatik o'qiladi: `kinora-api` web service, `/var/data`
   disk, health check `/api/health`.
4. `BOT_TOKEN` va `PAYMENT_WEBHOOK_SECRET` qiymatlarini kiriting
   (boshqalari blueprintda berilgan).
5. Deploy tugagach service URL'ini oling (masalan
   `https://kinora-api.onrender.com`).

### Variant B — qo'lda

> Hozirgi bepul servis quyidagi jadvaldan faqat disk bilan bog'liq
> (`DATABASE_URL`, `DATA_DIR`, `UPLOADS_DIR`, `BACKUPS_DIR`) qatorlarni
> kiritmagan — baza `backend/data/` ichida, ya'ni ephemeral. Qolgan qiymatlar
> bir xil.

- Runtime: Python 3.12
- Build: `pip install -r backend/requirements.txt`
- Start: `uvicorn backend.main:app --host 0.0.0.0 --port $PORT`
- Health check: `/api/health`
- Disk: mount path `/var/data`, 1 GB (Render'da disk uchun Starter plan kerak)
- Environment:

| Kalit | Qiymat |
| --- | --- |
| `ENV` | `production` |
| `SECRET_KEY` | Render'da generatsiya qilingan uzun tasodifiy qiymat |
| `BOT_TOKEN` | BotFather'dan olingan token (**faqat serverda**) |
| `BOT_USERNAME` | `KinoraTV_bot` |
| `OWNER_ID` | `7041471070` |
| `DATABASE_URL` | `sqlite:////var/data/kinora.db` |
| `DATA_DIR` | `/var/data` |
| `UPLOADS_DIR` | `/var/data/uploads` |
| `BACKUPS_DIR` | `/var/data/backups` |
| `CORS_ORIGINS` | `https://obidov1410.github.io` |
| `FRONTEND_URL` | `https://obidov1410.github.io/Kinora/` |
| `ALLOW_DEV_LOGIN` | `false` |
| `RATE_LIMIT_ENABLED` | `true` |
| `RATE_LIMIT_PER_MINUTE` | `120` |
| `SESSION_TTL_HOURS` | `168` |
| `TELEGRAM_AUTH_MAX_AGE` | `86400` |
| `MEDIA_TOKEN_TTL_HOURS` | `6` |
| `MAX_UPLOAD_MB` | `8` |
| `BACKUP_INTERVAL_HOURS` | `0` (qo'lda) yoki masalan `24` |
| `BACKUP_RETENTION` | `10` |
| `SEED_DEMO` | `true` |
| `PAYMENT_PROVIDER` | `none` |
| `PAYMENT_WEBHOOK_SECRET` | bo'sh (provayder ulanmaguncha) |

Deploydan keyin `https://<service>.onrender.com/api/health` ochib
`"status": "ok"` ekanini tekshiring. Loglarda migration va demo seed yozuvlari
ko'rinadi.

## Telegram Mini App (BotFather)

1. @BotFather → `/mybots` → `@KinoraTV_bot` → **Bot Settings → Menu Button →
   Configure menu button**.
2. URL: `https://obidov1410.github.io/Kinora/` (oxirida `/` bilan).
3. Button title: `Kinora`.
4. Muqobil: `/newapp` → botni tanlang → title, description, photo → Web App URL
   sifatida yuqoridagi manzilni kiriting.
5. `BOT_TOKEN`ni faqat Render Environment bo'limiga kiriting. Uni hech qachon
   `frontend/` ichiga yoki GitHub'ga qo'ymang — frontend faqat `initData`ni
   serverga yuboradi.

Production'da admin panelga faqat Telegram Mini App ichidan (yoki dev rejimda
dev login orqali) kiriladi. `7041471070` Telegram ID egasi sifatida birinchi
kirishda avtomatik `owner` rolini oladi.

## Admin panel

Manzil: `https://obidov1410.github.io/Kinora/admin.html` (Mini App ichida
avtomatik autentifikatsiya) yoki lokalda `http://127.0.0.1:5500/admin.html`
(dev login bilan).

- **Dashboard** — real user/kontent/ko'rish/reklama statistikasi va grafiklar.
- **Kontent** — yaratish/tahrirlash/o'chirish, poster/backdrop yuklash,
  treyler va video URL yoki Telegram `file_id`, nashr/tanlangan holati,
  mavsum va qismlar, qismlarni tartiblash, saytda ko'rish havolasi.
- **Reklamalar** — joylashuv, muddat, rasm, maqsad URL; ko'rsatish va bosish
  server orqali; public API maqsad URL'ni yashirmaydi.
- **Foydalanuvchilar** — qidiruv, bloklash, VIP berish, rol o'zgartirish
  (faqat egasi; o'zini va egalarini himoya qiladi).
- **VIP** — yoqish/o'chirish, tarif CRUD, tranzaksiyalar (provayder
  sozlanmaguncha bo'sh va halol izoh bilan).
- **Zaxira** — yaratish, yuklab olish, `RESTORE` tasdiqi bilan tiklash
  (avtomatik `pre-restore` xavfsizlik nusxasi yaratiladi).
- **Audit** — har bir admin amali yoziladi, action bo'yicha aniq filtr.
- **Sozlamalar** — sayt e'loni, VIP holati, server konfiguratsiyasi (maxfiy
  qiymatlar ko'rsatilmaydi).

## Xavfsizlik

- `initData` HMAC-SHA256 (`WebAppData` kaliti) bilan tekshiriladi va
  `auth_date` muddati (`TELEGRAM_AUTH_MAX_AGE`) nazorat qilinadi.
- Brauzerdan kelgan Telegram ID'ga ishonilmaydi.
- JWT sessiyasi + har so'rovda bazadagi rol; `OWNER_ID` override.
- `.env`, `BOT_TOKEN`, `SECRET_KEY`, to'lov sirlari repoga tushmaydi.
- Rasmlar MIME/extension/Pillow orqali tekshiriladi, WebP'ga aylantiriladi
  (maks. 2000 px, `MAX_UPLOAD_MB`).
- Zaxira fayllari faqat autentifikatsiya bilan yuklanadi; nomi regex bilan
  tekshiriladi; restore oldidan `PRAGMA integrity_check` va kerakli jadvallar
  tekshiriladi.

## Ma'lumotlar bazasi va zaxira

- SQLite WAL + versiyalangan migratsiyalar (`backend/migrations`).
- SQLite backup API orqali izchil nusxa; `kinora-YYYYMMDD-HHMMSS.db`.
- `BACKUP_INTERVAL_HOURS>0` bo'lsa fon rejimida avtomatik nusxa olinadi.
- Render'da `/var/data` persistent disk bo'lmasa, deployda baza yo'qoladi.
- Bir vaqtda bir nechta instance ishlatish SQLite uchun tavsiya etilmaydi.
  Katta yuklamada PostgreSQL'ga o'tish mumkin (SQLAlchemy URL), lekin zaxira
  moduli faqat SQLite uchun.

## Ma'lum cheklovlar (halol ro'yxat)

- To'lov tizimi biriktirilmagan; `PAYMENT_PROVIDER` uchun provayder klassi va
  webhook implementatsiyasi kerak. Checkout hozir `503`.
- Telegram Bot API orqali bot faqat 20 MB gacha fayl yuklab oladi. Kattaroq
  videolar uchun litsenziyalangan hosting/CDN URL ishlatilishi kerak.
- Videoni botga yuborib `file_id` ni avtomatik qabul qiladigan handler bu
  versiyada yo'q. `file_id` Bot API (`getUpdates`/`getFile`) orqali olinadi va
  admin formasiga qo'lda kiritiladi; oqim keyin imzolangan proxy orqali ketadi.
- URL orqali berilgan videoni yuklab olishni to'liq taqiqlab bo'lmaydi;
  Telegram proxy oqimida `Content-Disposition` va tokenlar qo'llanadi, DRM yo'q.
- Demo katalog 7 ta yozuvdan iborat; ko'pchiligida video yo'q va barchasi
  `DEMO` deb belgilangan. Kontent huquqlari admin tomonidan tekshirilishi shart.
- Rate limit jarayon xotirasida (bir instance uchun).
- Render free plan diskni qo'llab-quvvatlamaydi; persistent disk uchun Starter.
- GitHub Pages statik; API manzili `KINORA_API_BASE_URL` yoki `config.js`
  orqali berilishi shart.
- GitHub Pages va Render (Free) deploy qilindi va live tekshirildi. Telegram
  login/admin uchun `BOT_TOKEN` hali serverga kiritilmagan; BotFather Menu
  Button ham egasi tomonidan sozlanishi kerak. Bularni qo'shmasdan turib
  autentifikatsiya, sevimlilar, profil va admin panel ishlamaydi.
- Render Free instance uxlaydi va diskni saqlamaydi; doimiy ma'lumot uchun
  Starter + disk kerak (yuqoridagi Render bo'limiga qarang).

## Test natijalari (2026-10-31, lokal va live)

- `pytest`: **28 passed** (bitta Starlette/httpx deprecation warning).
- Qo'lda UI (Chromium, localhost): landing, bosh sahifa qatorlari, instant
  qidiruv va to'liq natijalar, janr filtri, saralash, 404, til almashtirish,
  dev login, sevimlilar, detallar (janr chiplari, mavsum/qismlar), VIP sahifasi.
- Admin: dashboard, kontent yaratish/tahrirlash/o'chirish (O'CHIRISH tasdiqi),
  mavsum/qism, reklama CRUD, foydalanuvchi detali, VIP tarif CRUD, audit filtri,
  sozlamalar, zaxira yaratish → yuklab olish → RESTORE tiklash.
- Console'da JS xatolari yo'q (faqat Telegram SDK'ning brauzerdagi zararsiz
  ogohlantirishlari).
- Live (2026-10-31): `https://kinora-api-k3c6.onrender.com/api/health` →
  `status: ok`, `database: ok`; `/api/config` va `/api/catalog` real demo
  ma'lumot qaytardi. `https://obidov1410.github.io/Kinora/`, `browse.html`,
  `detail.html?slug=kosmos-2049` 200; API so'rovlari CORS bilan muvaffaqiyatli,
  posterlar yuklandi. `telegram_configured: false` — BOT_TOKEN kutilmoqda.

## API

To'liq ro'yxat va misollar: [API.md](API.md). Interaktiv hujjat: `/docs`.

## Litsenziya va kontent

Kod — loyiha egasiga. Demo poster/backdrop rasmlari AI yordamida yaratilgan va
loyiha bilan birga keladi. Yagona o'ynaladigan video — CC BY 3.0 "Big Buck
Bunny" (Blender Foundation), manba `peach.blender.org`. Boshqa har qanday
kontent faqat huquq egasining yozma ruxsati bilan joylashtirilishi kerak.
Netflix brendi, logotipi yoki media fayllari ishlatilmagan.
