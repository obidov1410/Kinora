"""Shared domain constants."""
GENRES = [
    "action",
    "adventure",
    "animation",
    "comedy",
    "crime",
    "documentary",
    "drama",
    "family",
    "fantasy",
    "history",
    "horror",
    "music",
    "mystery",
    "romance",
    "sci-fi",
    "sport",
    "thriller",
    "war",
    "western",
]

KINDS = ["movie", "series"]
PLACEMENTS = ["landing", "home_hero", "catalog_banner", "between_rows"]
ROLES = ["admin", "user"]
VIDEO_SOURCES = ["", "url", "telegram"]


def is_permitted_media_path(url: str | None) -> bool:
    if not url:
        return True
    if ".." in url:
        return False
    return url.startswith("/uploads/") or url.startswith("assets/")
