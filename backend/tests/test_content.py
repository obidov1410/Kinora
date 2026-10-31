from __future__ import annotations

import io

from backend.tests.conftest import auth_headers, create_movie, dev_login


def test_regular_user_cannot_use_admin_endpoints(client, user_headers):
    assert client.get("/api/admin/stats", headers=user_headers).status_code == 403
    assert client.get("/api/admin/content", headers=user_headers).status_code == 403
    assert client.post("/api/admin/content", json={}, headers=user_headers).status_code == 403


def test_movie_crud_and_public_search(client, owner_headers):
    movie = create_movie(
        client,
        owner_headers,
        title="Kumush Yomg'ir",
        title_cyrl="Кумуш Ёмғир",
        year=2021,
        genres=["drama", "romance"],
        description="Sinov filmi tavsifi",
    )
    content_id = movie["id"]
    assert movie["slug"] == "kumush-yomgir"
    assert movie["is_published"] is True

    public = client.get(f"/api/catalog/{content_id}")
    assert public.status_code == 200
    assert public.json()["title"] == "Kumush Yomg'ir"

    search = client.get("/api/catalog", params={"search": "Kumush"})
    assert search.status_code == 200
    assert any(item["id"] == content_id for item in search.json()["items"])

    genre = client.get("/api/catalog", params={"genre": "romance", "kind": "movie"})
    assert any(item["id"] == content_id for item in genre.json()["items"])

    updated = client.patch(
        f"/api/admin/content/{content_id}",
        json={"title": "Kumush Yomg'ir 2", "year": 2025},
        headers=owner_headers,
    )
    assert updated.status_code == 200, updated.text
    assert updated.json()["title"] == "Kumush Yomg'ir 2"

    deleted = client.delete(
        f"/api/admin/content/{content_id}", params={"confirm": "true"}, headers=owner_headers
    )
    assert deleted.status_code == 200
    assert client.get(f"/api/catalog/{content_id}").status_code == 404


def test_draft_is_hidden_until_published(client, owner_headers):
    draft = create_movie(client, owner_headers, title="Yashirin Loyiha", is_published=False)
    assert client.get(f"/api/catalog/{draft['id']}").status_code == 404

    preview = client.get(f"/api/admin/content/{draft['id']}", headers=owner_headers)
    assert preview.status_code == 200
    assert preview.json()["is_published"] is False

    published = client.patch(
        f"/api/admin/content/{draft['id']}",
        json={"is_published": True, "is_featured": True},
        headers=owner_headers,
    )
    assert published.status_code == 200
    assert client.get(f"/api/catalog/{draft['id']}").status_code == 200
    featured = client.get("/api/catalog/featured").json()
    assert any(item["id"] == draft["id"] for item in featured)


def test_series_seasons_episodes_and_reorder(client, owner_headers):
    series = client.post(
        "/api/admin/content",
        json={
            "kind": "series",
            "title": "Sinov Seriali",
            "year": 2023,
            "genres": ["mystery"],
            "description": "Serial tavsifi",
            "is_published": True,
        },
        headers=owner_headers,
    )
    assert series.status_code == 201, series.text
    series_id = series.json()["id"]

    season = client.post(
        f"/api/admin/content/{series_id}/seasons",
        json={"number": 1, "title": "Birinchi mavsum"},
        headers=owner_headers,
    )
    assert season.status_code == 201, season.text
    season_id = season.json()["id"]

    duplicate = client.post(
        f"/api/admin/content/{series_id}/seasons",
        json={"number": 1},
        headers=owner_headers,
    )
    assert duplicate.status_code == 409

    episode_ids = []
    for index in (1, 2, 3):
        response = client.post(
            f"/api/admin/seasons/{season_id}/episodes",
            json={
                "number": index,
                "title": f"{index}-qism",
                "video_source": "url",
                "video_url": "https://example.com/sample.mp4",
            },
            headers=owner_headers,
        )
        assert response.status_code == 201, response.text
        episode_ids.append(response.json()["id"])

    duplicate_episode = client.post(
        f"/api/admin/seasons/{season_id}/episodes",
        json={"number": 2, "title": "Takror"},
        headers=owner_headers,
    )
    assert duplicate_episode.status_code == 409

    reordered = client.post(
        f"/api/admin/seasons/{season_id}/episodes/reorder",
        json={"episode_ids": [episode_ids[2], episode_ids[0], episode_ids[1]]},
        headers=owner_headers,
    )
    assert reordered.status_code == 200, reordered.text
    episodes = reordered.json()["episodes"]
    assert [ep["id"] for ep in episodes] == [episode_ids[2], episode_ids[0], episode_ids[1]]
    assert [ep["number"] for ep in episodes] == [1, 2, 3]

    detail = client.get(f"/api/catalog/{series_id}").json()
    assert len(detail["seasons"]) == 1
    assert len(detail["seasons"][0]["episodes"]) == 3
    assert detail["seasons"][0]["episodes"][0]["playback"]["type"] == "direct"

    deleted = client.delete(
        f"/api/admin/seasons/{season_id}", params={"confirm": "true"}, headers=owner_headers
    )
    assert deleted.status_code == 200


def test_invalid_content_payload_returns_field_errors(client, owner_headers):
    response = client.post(
        "/api/admin/content",
        json={"kind": "movie", "title": "X", "year": 1200, "genres": ["unknown"]},
        headers=owner_headers,
    )
    assert response.status_code == 422
    body = response.json()
    assert body["errors"]
    fields = {error["field"] for error in body["errors"]}
    assert "year" in fields and "genres" in fields


def test_upload_rejects_non_image(client, owner_headers):
    response = client.post(
        "/api/admin/upload",
        files={"file": ("evil.png", io.BytesIO(b"<script>alert(1)</script>"), "image/png")},
        data={"kind": "poster"},
        headers=owner_headers,
    )
    assert response.status_code == 400


def test_favorites_flow(client, owner_headers):
    user = dev_login(client, 900000020, "Sevimli Foydalanuvchi")
    headers = auth_headers(user["token"])
    content = create_movie(client, owner_headers, title="Sevimlilar Sinovi")

    favorite = client.post(f"/api/me/favorites/{content['id']}", headers=headers)
    assert favorite.status_code == 200
    assert favorite.json()["favorited"] is True

    listing = client.get("/api/me/favorites", headers=headers).json()
    assert any(item["id"] == content["id"] for item in listing)
    ids = client.get("/api/me/favorites/ids", headers=headers).json()["ids"]
    assert content["id"] in ids

    removed = client.delete(f"/api/me/favorites/{content['id']}", headers=headers)
    assert removed.status_code == 200
    assert client.get("/api/me/favorites/ids", headers=headers).json()["ids"] == []
