from __future__ import annotations

from datetime import datetime, timedelta, timezone

from backend.tests.conftest import auth_headers, dev_login


def _ad_payload(**overrides):
    now = datetime.now(timezone.utc)
    payload = {
        "advertiser": "Test Reklamachi",
        "title": "Sinov Banneri",
        "description": "Test reklama tavsifi",
        "image_url": "assets/backdrops/nur.png",
        "destination_url": "https://example.com/offer",
        "placement": "between_rows",
        "starts_at": (now - timedelta(hours=1)).isoformat(),
        "ends_at": (now + timedelta(days=2)).isoformat(),
        "is_active": True,
    }
    payload.update(overrides)
    return payload


def test_ad_crud_and_tracking(client, owner_headers):
    created = client.post("/api/admin/ads", json=_ad_payload(), headers=owner_headers)
    assert created.status_code == 201, created.text
    ad = created.json()
    ad_id = ad["id"]
    assert ad["impressions"] == 0 and ad["clicks"] == 0
    assert ad["status"] == "active"

    public = client.get("/api/ads", params={"placement": "between_rows"})
    assert public.status_code == 200
    public_ad = next(item for item in public.json() if item["id"] == ad_id)
    assert public_ad["sponsored"] is True
    assert public_ad["label"] == "Reklama"
    assert "destination_url" not in public_ad

    first = client.post(f"/api/ads/{ad_id}/impression")
    assert first.status_code == 200
    assert first.json()["counted"] is True
    second = client.post(f"/api/ads/{ad_id}/impression")
    assert second.status_code == 200
    assert second.json()["counted"] is False

    click = client.get(f"/api/ads/{ad_id}/click", follow_redirects=False)
    assert click.status_code == 302
    assert click.headers["location"] == "https://example.com/offer"

    admin_ad = client.get(f"/api/admin/ads/{ad_id}", headers=owner_headers).json()
    assert admin_ad["impressions"] == 1
    assert admin_ad["clicks"] == 1
    assert admin_ad["ctr"] == 100.0

    paused = client.patch(
        f"/api/admin/ads/{ad_id}", json={"is_active": False}, headers=owner_headers
    )
    assert paused.status_code == 200
    assert paused.json()["status"] == "paused"
    assert not any(item["id"] == ad_id for item in client.get("/api/ads").json())

    deleted = client.delete(
        f"/api/admin/ads/{ad_id}", params={"confirm": "true"}, headers=owner_headers
    )
    assert deleted.status_code == 200


def test_ad_validation_and_security(client, owner_headers):
    bad_dates = _ad_payload(
        starts_at=(datetime.now(timezone.utc) + timedelta(days=3)).isoformat(),
        ends_at=(datetime.now(timezone.utc) + timedelta(days=1)).isoformat(),
    )
    assert client.post("/api/admin/ads", json=bad_dates, headers=owner_headers).status_code == 422

    unsafe_url = _ad_payload(destination_url="javascript:alert(1)")
    assert client.post("/api/admin/ads", json=unsafe_url, headers=owner_headers).status_code == 422

    unsafe_image = _ad_payload(image_url="/uploads/../secret.png")
    assert client.post("/api/admin/ads", json=unsafe_image, headers=owner_headers).status_code == 422

    user = dev_login(client, 900000030, "Ad Viewer")
    assert (
        client.post("/api/admin/ads", json=_ad_payload(), headers=auth_headers(user["token"])).status_code
        == 403
    )


def test_ad_impression_does_not_count_paused_ads(client, owner_headers):
    created = client.post(
        "/api/admin/ads",
        json=_ad_payload(title="Paused Ad", is_active=False),
        headers=owner_headers,
    )
    ad_id = created.json()["id"]
    response = client.post(f"/api/ads/{ad_id}/impression")
    assert response.status_code == 404
    client.delete(f"/api/admin/ads/{ad_id}", params={"confirm": "true"}, headers=owner_headers)
