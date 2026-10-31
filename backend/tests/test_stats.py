from __future__ import annotations

from backend.tests.conftest import TEST_BOT_TOKEN


def test_dashboard_stats_are_real_and_do_not_leak_secrets(client, owner_headers, user_headers):
    response = client.get("/api/admin/stats", headers=owner_headers)
    assert response.status_code == 200
    data = response.json()
    cards = data["cards"]
    assert cards["total_users"] >= 3
    assert cards["total_movies"] >= 0
    assert cards["total_views"] >= 0
    assert len(data["daily"]["labels"]) == 14
    assert len(data["daily"]["users"]) == 14
    assert len(data["monthly"]["labels"]) == 12
    assert data["recent_users"]
    assert TEST_BOT_TOKEN not in response.text
    assert "bot_token" not in response.text

    forbidden = client.get("/api/admin/stats", headers=user_headers)
    assert forbidden.status_code == 403


def test_audit_log_records_admin_actions(client, owner_headers):
    response = client.get("/api/admin/audit", headers=owner_headers)
    assert response.status_code == 200
    actions = {item["action"] for item in response.json()["items"]}
    assert "content.create" in actions or "ad.create" in actions or "user.role" in actions


def test_settings_update_and_runtime_flags(client, owner_headers):
    settings = client.get("/api/admin/settings", headers=owner_headers)
    assert settings.status_code == 200
    data = settings.json()
    assert data["runtime"]["telegram_configured"] is True
    assert "bot_token" not in str(data)

    updated = client.patch(
        "/api/admin/settings",
        json={"site_notice": "Sinov e'loni", "vip_enabled": True},
        headers=owner_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["vip_enabled"] is True

    public = client.get("/api/config").json()
    assert public["vip_enabled"] is True
    assert public["site_notice"] == "Sinov e'loni"

    client.patch(
        "/api/admin/settings",
        json={"site_notice": "", "vip_enabled": False},
        headers=owner_headers,
    )
