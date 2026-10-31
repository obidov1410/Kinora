# KINORA API

Base URL: `https://<render-service>.onrender.com/api`
Interaktiv hujjat: `/docs` (OpenAPI: `/openapi.json`)

Autentifikatsiya sxemasi:

- `Authorization: Bearer <JWT>` — `/auth/telegram` yoki dev rejimda `/auth/dev`
  qaytargan token. JWT ichida foydalanuvchi ID bor, lekin rol har so'rovda
  bazadan qayta tekshiriladi.
- Admin endpointlari (`/admin/...`) `admin` yoki `owner` rolini talab qiladi.
  Rol o'zgartirish faqat `owner` uchun.
- Telegram Mini App login: `POST /auth/telegram` ga **xom `initData`** yuboriladi.
  Server `BOT_TOKEN` bilan HMAC-SHA256 tekshiradi va `auth_date` muddatini
  nazorat qiladi. Brauzerda ko'rsatilgan user ID hech qachon ishonch manbai
  emas.

## Public

| Metod | Yo'l | Tavsif |
| --- | --- | --- |
| GET | `/health` | Holat, DB, Telegram/to'lov konfiguratsiyasi |
| GET | `/config` | Janrlar, reklama joylashuvlari, bot username, sayt e'loni |
| GET | `/home` | Featured (maks. 5) + trending/new/movies/series qatorlari |
| GET | `/catalog` | `kind`, `genre`, `search`, `sort` (`newest/popular/year/title`), `page`, `page_size` (1–50) |
| GET | `/catalog/featured` | Tanlangan nashr etilgan kontent (maks. 6) |
| GET | `/catalog/{id yoki slug}` | Kontent detali; seriallarda mavsum/qismlar |
| POST | `/catalog/{content_id}/view` | Ko'rish hisobi (30 daqiqa dedupe) |
| GET | `/genres` | Janrlar va nashr etilgan kontent soni |
| GET | `/ads?placement=` | Faol reklamalar; maqsad URL yashiriladi |
| POST | `/ads/{ad_id}/impression` | Ko'rsatish (IP bo'yicha 24 soat dedupe) |
| GET | `/ads/{ad_id}/click` | Bosishni qayd etib, 302 bilan maqsad URL'ga yo'naltiradi |
| GET | `/vip/plans` | VIP yoqilgan bo'lsa faol tariflar |
| POST | `/vip/checkout/{plan_id}` | Provayder sozlanmagan bo'lsa `503` |

## Auth va profil

| Metod | Yo'l | Auth | Tavsif |
| --- | --- | --- | --- |
| POST | `/auth/telegram` | — | `{init_data, language?}` → `{token, user}` |
| POST | `/auth/dev` | — | Faqat development + `ALLOW_DEV_LOGIN=true` |
| GET | `/me` | JWT | Profil + sevimlilar soni |
| PATCH | `/me/language` | JWT | `{language: "uz" \| "uzc"}` |
| GET | `/me/favorites` | JWT | Sevimlilar ro'yxati |
| GET | `/me/favorites/ids` | JWT | ID ro'yxati |
| POST | `/me/favorites/{content_id}` | JWT | Qo'shish |
| DELETE | `/me/favorites/{content_id}` | JWT | O'chirish |
| GET | `/me/subscription` | JWT | VIP holati va tariflar |

## Media

| Metod | Yo'l | Tavsif |
| --- | --- | --- |
| GET | `/media/stream/{content\|episode}/{id}?token=` | Telegram `file_id` uchun imzolangan, muddati cheklangan proxy (Range qo'llanadi) |

Media tokeni admin API orqali kontent/qism javobida beriladi. Telegram Bot API
bot yuklab olishi 20 MB bilan cheklangan.

## Admin — kontent

Barchasi JWT + admin/owner.

| Metod | Yo'l | Tavsif |
| --- | --- | --- |
| GET | `/admin/content` | `page`, `page_size`, `kind`, `status`, `search` |
| GET | `/admin/content/{id}` | To'liq detal (mavsum/qismlar bilan) |
| POST | `/admin/content` | Kontent yaratish |
| PATCH | `/admin/content/{id}` | Qisman yangilash |
| DELETE | `/admin/content/{id}` | O'chirish (mavsum/qismlar bilan) |
| POST | `/admin/content/{id}/seasons` | Mavsum qo'shish |
| PATCH | `/admin/seasons/{id}` | Mavsumni yangilash |
| DELETE | `/admin/seasons/{id}` | Mavsumni o'chirish |
| POST | `/admin/seasons/{id}/episodes` | Qism qo'shish |
| PATCH | `/admin/episodes/{id}` | Qismni yangilash |
| DELETE | `/admin/episodes/{id}` | Qismni o'chirish |
| POST | `/admin/seasons/{id}/episodes/reorder` | `{episode_ids: [...]}` tartiblash |
| POST | `/admin/upload` | Multipart rasm: `file`, `kind` = poster/backdrop/ad |

Kontent maydonlari: `kind`, `title`, `title_cyrl`, `original_title`, `year`,
`genres[]`, `country`, `age_rating`, `description`, `description_cyrl`,
`poster_url`, `backdrop_url`, `trailer_url`, `duration_minutes`,
`video_source` (`url`/`telegram`), `video_url`, `telegram_file_id`,
`is_featured`, `is_published`, `is_demo`, `license_note`.

## Admin — reklama

| Metod | Yo'l | Tavsif |
| --- | --- | --- |
| GET | `/admin/ads` | Filtrlar: `placement`, `status` |
| GET | `/admin/ads/{id}` | Bitta reklama |
| POST | `/admin/ads` | Yaratish |
| PATCH | `/admin/ads/{id}` | Yangilash |
| DELETE | `/admin/ads/{id}` | O'chirish |

Maydonlar: `advertiser`, `title`, `description`, `image_url`,
`placement` (`landing`, `home_hero`, `catalog_banner`, `between_rows`),
`destination_url` (faqat http/https), `is_active`, `is_demo`,
`starts_at`, `ends_at`. Holat serverda hisoblanadi: active, paused, scheduled,
expired.

## Admin — foydalanuvchilar, VIP, statistika, sozlamalar, zaxira

| Metod | Yo'l | Tavsif |
| --- | --- | --- |
| GET | `/admin/users` | `search`, `role`, `blocked`, sahifalash |
| GET | `/admin/users/{id}` | Profil, to'lovlar, audit harakatlari |
| PATCH | `/admin/users/{id}` | Bloklash/ochish |
| POST | `/admin/users/{id}/role` | `{role}` — faqat owner |
| GET | `/admin/stats?days=14` | Kartalar, kunlik grafiklar, oxirgi audit |
| GET | `/admin/audit` | `action` (aniq moslik), `page`, `page_size` |
| GET | `/admin/settings` | Sayt e'loni, VIP holati, runtime (sirsiz) |
| PATCH | `/admin/settings` | `site_notice`, `vip_enabled` |
| GET | `/admin/vip/plans` | Barcha tariflar |
| POST | `/admin/vip/plans` | Tarif yaratish |
| PATCH | `/admin/vip/plans/{id}` | Yangilash |
| DELETE | `/admin/vip/plans/{id}` | O'chirish |
| GET | `/admin/transactions` | To'lovlar (provayder sozlanmaguncha bo'sh) |
| GET | `/admin/backups` | Zaxira fayllari ro'yxati |
| POST | `/admin/backups` | Yangi SQLite zaxira |
| GET | `/admin/backups/{name}/download` | Autentifikatsiyalangan yuklab olish |
| DELETE | `/admin/backups/{name}?confirm=true` | O'chirish |
| POST | `/admin/backups/{name}/restore` | `{confirm:"RESTORE"}` — tiklash, `pre-restore` nusxasi bilan |

## Xatolar

- `400` — validatsiya/noto'g'ri fayl yoki rasm.
- `401` — token yo'q yoki yaroqsiz; Telegram initData xato.
- `403` — ruxsat yo'q (admin emas, bloklangan, media token yaroqsiz).
- `404` — kontent/endpoint topilmadi (productionda dev login ham).
- `413` — rasm hajmi limitdan katta.
- `422` — maydonlar xatosi; javobda `errors[]` ro'yxati.
- `429` — rate limit.
- `503` — BOT_TOKEN yoki to'lov provayderi sozlanmagan.

Xato javobi odatda `{"detail": "..."}` ko'rinishida; validatsiyada
`{"detail": "...", "errors": [{"field": "...", "message": "..."}]}`.
