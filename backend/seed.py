"""Seed clearly-labelled demo catalog records.

Demo listings use original AI-generated artwork bundled with the frontend and
never include full copyrighted films. The single playable sample is the
CC BY 3.0 licensed "Big Buck Bunny" short from the Blender Foundation.
The database is only seeded once (tracked in settings).
"""
from __future__ import annotations

from datetime import datetime, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import SessionLocal
from .models import Ad, Content, Episode, Season, Setting, VipPlan
from .utils import now_utc

CC_SAMPLE = "https://test-videos.co.uk/vids/bigbuckbunny/mp4/h264/720/Big_Buck_Bunny_720_10s_1MB.mp4"

DEMO_CONTENT = [
    {
        "kind": "movie",
        "slug": "nur",
        "title": "Nur",
        "title_cyrl": "Нур",
        "original_title": "Nur",
        "year": 2024,
        "genres": ["drama"],
        "country": "O'zbekiston",
        "age_rating": "12+",
        "description": (
            "Cho'l chekkasidagi kichik qishloqda yashovchi Nur o'z oilasini saqlab qolish uchun "
            "shaharga yo'l oladi. Yo'lda u o'tmishdagi sirlarga va o'zining kuchiga duch keladi. "
            "Demo yozuv: bu sahifa namuna ma'lumotlari bilan to'ldirilgan."
        ),
        "description_cyrl": (
            "Чўл чеккасидаги кичик қишлоқда яшовчи Нур ўз оиласини сақлаб қолиш учун "
            "шаҳарга йўл олади. Йўлда у ўтмишдаги сирларга ва ўзининг кучига дуч келади. "
            "Демо ёзув: бу саҳифа намуна маълумотлари билан тўлдирилган."
        ),
        "poster_url": "assets/posters/nur.webp",
        "backdrop_url": "assets/backdrops/nur.webp",
        "duration_minutes": 112,
        "is_featured": True,
        "is_published": True,
        "is_demo": True,
        "license_note": "Demo yozuv. Asl video va trailer biriktirilmagan; tarqatish huquqi tekshirilishi kerak.",
    },
    {
        "kind": "movie",
        "slug": "oxirgi-reys",
        "title": "Oxirgi Reys",
        "title_cyrl": "Охирги Рейс",
        "original_title": "The Last Flight",
        "year": 2023,
        "genres": ["action", "thriller"],
        "country": "O'zbekiston",
        "age_rating": "16+",
        "description": (
            "Cho'l bo'yidagi tashlandiq aeroportda qolib ketgan ekipaj oxirgi reysni bajarishga majbur bo'ladi. "
            "Yuk ortidagi haqiqat esa ularni kutilmagan to'qnashuvga olib keladi. Demo yozuv."
        ),
        "description_cyrl": (
            "Чўл бўйидаги ташландиқ аэропортда қолиб кетган экипаж охирги рейсни бажаришга мажбур бўлади. "
            "Юк ортидаги ҳақиқат эса уларни кутилмаган тўқнашувга олиб келади. Демо ёзув."
        ),
        "poster_url": "assets/posters/oxirgi-reys.webp",
        "backdrop_url": "assets/backdrops/oxirgi-reys.webp",
        "duration_minutes": 128,
        "is_featured": True,
        "is_published": True,
        "is_demo": True,
        "license_note": "Demo yozuv. Asl video va trailer biriktirilmagan.",
    },
    {
        "kind": "movie",
        "slug": "shahar-chiroqlari",
        "title": "Shahar Chiroqlari",
        "title_cyrl": "Шаҳар Чироқлари",
        "original_title": "City Lights",
        "year": 2022,
        "genres": ["romance", "drama"],
        "country": "O'zbekiston",
        "age_rating": "12+",
        "description": (
            "Toshkentning tungi tomorqalarida ikki notanish inson tasodifan uchrashadi. "
            "Shahar yorug'ligi ostida ular o'z orzulari va qo'rquvlari bilan yuzlashadi. Demo yozuv."
        ),
        "description_cyrl": (
            "Тошкентнинг тунги томирқаларида икки нотаниш инсон тасодифан учрашади. "
            "Шаҳар ёруғлиги остида улар ўз орзулари ва қўрқувлари билан юзлашади. Демо ёзув."
        ),
        "poster_url": "assets/posters/shahar-chiroqlari.webp",
        "duration_minutes": 104,
        "is_featured": False,
        "is_published": True,
        "is_demo": True,
        "license_note": "Demo yozuv. Asl video va trailer biriktirilmagan.",
    },
    {
        "kind": "movie",
        "slug": "ovozsiz",
        "title": "Ovozsiz",
        "title_cyrl": "Овозсиз",
        "original_title": "Silent",
        "year": 2025,
        "genres": ["crime", "thriller", "mystery"],
        "country": "O'zbekiston",
        "age_rating": "18+",
        "description": (
            "Yomg'irli kechada shahar bo'ylab g'alati ish yuz beradi. Detektiv hech qanday guvohsiz "
            "qolgan ishni faqat eski arxiv va o'z sezgisi bilan ochishga urinadi. Demo yozuv."
        ),
        "description_cyrl": (
            "Ёмғирли кечада шаҳар бўйлаб ғалати иш юз беради. Детектив ҳеч қандай гувоҳсиз "
            "қолган ишни фақат эски архив ва ўз сезгиси билан очишга уринади. Демо ёзув."
        ),
        "poster_url": "assets/posters/ovozsiz.webp",
        "duration_minutes": 119,
        "is_featured": False,
        "is_published": True,
        "is_demo": True,
        "license_note": "Demo yozuv. Asl video va trailer biriktirilmagan.",
    },
    {
        "kind": "series",
        "slug": "chol-siri",
        "title": "Cho'l Siri",
        "title_cyrl": "Чўл Сири",
        "original_title": "Desert Secret",
        "year": 2024,
        "genres": ["adventure", "mystery", "history"],
        "country": "O'zbekiston",
        "age_rating": "12+",
        "description": (
            "Qizilqum cho'lidagi qadimiy qal'a ostidan topilgan eshik arxeologlar guruhini "
            "asrlar davomida yashirilgan sirga olib boradi. Demo serial, 2 mavsum."
        ),
        "description_cyrl": (
            "Қизилқум чўлидаги қадимий қалъа остидан топилган эшик археологлар гуруҳини "
            "асрлар давомида яширилган сирга олиб боради. Демо сериал, 2 мавсум."
        ),
        "poster_url": "assets/posters/chol-siri.webp",
        "is_featured": False,
        "is_published": True,
        "is_demo": True,
        "license_note": "Demo serial. Qismlar uchun video biriktirilmagan.",
    },
    {
        "kind": "series",
        "slug": "kosmos-2049",
        "title": "Kosmos 2049",
        "title_cyrl": "Космос 2049",
        "original_title": "Cosmos 2049",
        "year": 2025,
        "genres": ["sci-fi", "adventure", "drama"],
        "country": "O'zbekiston",
        "age_rating": "12+",
        "description": (
            "Yer bilan aloqa uzilgach, chekka sayyorada qolgan astronavt o'z missiyasining "
            "haqiqiy maqsadini aniqlashga majbur bo'ladi. Demo serial, 1 mavsum."
        ),
        "description_cyrl": (
            "Ер билан алоқа узилгач, чекка сайёрада қолган астронавт ўз миссиясининг "
            "ҳақиқий мақсадини аниқлашга мажбур бўлади. Демо сериал, 1 мавсум."
        ),
        "poster_url": "assets/posters/kosmos-2049.webp",
        "backdrop_url": "assets/backdrops/kosmos-2049.webp",
        "is_featured": True,
        "is_published": True,
        "is_demo": True,
        "license_note": "Demo serial. Qismlar uchun video biriktirilmagan.",
    },
    {
        "kind": "movie",
        "slug": "kinora-texnik-namuna",
        "title": "Kinora texnik namuna",
        "title_cyrl": "Кинора техник намуна",
        "original_title": "Kinora playback sample",
        "year": 2008,
        "genres": ["animation", "family", "comedy"],
        "country": "Niderlandiya",
        "age_rating": "0+",
        "description": (
            "Pleer va video oqimini tekshirish uchun Kinora'ga biriktirilgan ochiq litsenziyali qisqa namuna. "
            "Bu to'liq film emas. Big Buck Bunny © Blender Foundation, CC BY 3.0 litsenziyasi ostida."
        ),
        "description_cyrl": (
            "Плеер ва видео оқимини текшириш учун Kinora'га бириктирилган очиқ лицензияли қисқа намуна. "
            "Бу тўлиқ фильм эмас. Big Buck Bunny © Blender Foundation, CC BY 3.0 лицензияси остида."
        ),
        "poster_url": "assets/posters/kinora-namuna.webp",
        "duration_minutes": 1,
        "video_source": "url",
        "video_url": CC_SAMPLE,
        "is_featured": False,
        "is_published": True,
        "is_demo": True,
        "license_note": "Big Buck Bunny © Blender Foundation, CC BY 3.0 — https://peach.blender.org/",
    },
]

DEMO_EPISODES = {
    "chol-siri": {
        1: [
            "1-qism: Qumdagi belgi",
            "2-qism: Qal'a devori",
            "3-qism: Yashirin xarita",
            "4-qism: Birinchi eshik",
        ],
        2: [
            "1-qism: Qaytish",
            "2-qism: Ikkinchi qavat ostida",
            "3-qism: Cho'lning ovozi",
        ],
    },
    "kosmos-2049": {
        1: [
            "1-qism: Aloqa uzildi",
            "2-qism: Qizil gorizont",
            "3-qism: Orbita soyasi",
            "4-qism: Uyga qaytish yo'li",
        ]
    },
}


def _seed_episodes(db: Session, content: Content, seasons: dict[int, list[str]]) -> None:
    for number, episode_titles in seasons.items():
        season = Season(content_id=content.id, number=number, title=f"{number}-mavsum")
        db.add(season)
        db.flush()
        for index, title in enumerate(episode_titles, start=1):
            db.add(
                Episode(
                    season_id=season.id,
                    number=index,
                    title=title,
                    description="Demo qism. Video biriktirilmagan.",
                )
            )


def seed_demo_data() -> bool:
    db = SessionLocal()
    try:
        if db.get(Setting, "demo_seeded") is not None:
            return False
        if db.scalar(select(Content.id).limit(1)) is not None:
            db.add(Setting(key="demo_seeded", value='"existing-data"'))
            db.commit()
            return False

        for item in DEMO_CONTENT:
            content = Content(**item)
            db.add(content)
            db.flush()
            if item["slug"] in DEMO_EPISODES:
                _seed_episodes(db, content, DEMO_EPISODES[item["slug"]])

        now = now_utc()
        db.add_all(
            [
                Ad(
                    advertiser="Kinora",
                    title="Kinora Telegram kanali",
                    description="Yangi qo'shilgan filmlar va seriallar haqida birinchi bo'lib xabar oling.",
                    image_url="assets/backdrops/nur.webp",
                    destination_url="https://t.me/KinoraTV_bot",
                    placement="landing",
                    starts_at=now - timedelta(days=1),
                    is_active=True,
                    is_demo=True,
                ),
                Ad(
                    advertiser="Kinora",
                    title="Bot orqali qulayroq tomosha",
                    description="Telegram Mini App'da sevimlilarni saqlang va davomiy tomosha qiling.",
                    image_url="assets/backdrops/oxirgi-reys.webp",
                    destination_url="https://t.me/KinoraTV_bot",
                    placement="between_rows",
                    starts_at=now - timedelta(days=1),
                    is_active=True,
                    is_demo=True,
                ),
            ]
        )

        db.add_all(
            [
                VipPlan(
                    name="1 oylik VIP",
                    name_cyrl="1 ойлик VIP",
                    days=30,
                    price=29000,
                    currency="UZS",
                    benefits="Reklamasiz tomosha\nErta kirish\nSevimli qurilmalar",
                    sort_order=1,
                ),
                VipPlan(
                    name="3 oylik VIP",
                    name_cyrl="3 ойлик VIP",
                    days=90,
                    price=79000,
                    currency="UZS",
                    benefits="Reklamasiz tomosha\nErta kirish\nSevimli qurilmalar\nTejamkor narx",
                    sort_order=2,
                ),
            ]
        )

        db.add_all(
            [
                Setting(key="vip_enabled", value="false"),
                Setting(key="site_notice", value='""'),
                Setting(key="demo_seeded", value=f'"{now.isoformat()}"'),
            ]
        )
        db.commit()
        return True
    finally:
        db.close()
