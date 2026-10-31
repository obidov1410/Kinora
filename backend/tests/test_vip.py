from __future__ import annotations

from backend.tests.conftest import auth_headers, dev_login


def test_vip_disabled_hides_plans_and_checkout(client, user_headers):
    disabled = client.get("/api/vip/plans")
    assert disabled.status_code == 200
    assert disabled.json()["enabled"] is False
    assert disabled.json()["plans"] == []

    checkout = client.post("/api/vip/checkout/1", headers=user_headers)
    assert checkout.status_code == 404


def test_vip_plans_crud_and_unconfigured_payment_gate(client, owner_headers, user_headers):
    enabled = client.patch(
        "/api/admin/settings", json={"vip_enabled": True}, headers=owner_headers
    )
    assert enabled.status_code == 200

    plan = client.post(
        "/api/admin/vip/plans",
        json={
            "name": "Test VIP",
            "days": 30,
            "price": 29000,
            "currency": "UZS",
            "benefits": "Reklamasiz",
            "is_active": True,
        },
        headers=owner_headers,
    )
    assert plan.status_code == 201, plan.text
    plan_id = plan.json()["id"]

    public = client.get("/api/vip/plans").json()
    assert public["enabled"] is True
    assert any(item["id"] == plan_id for item in public["plans"])
    assert public["payment_configured"] is False

    checkout = client.post(f"/api/vip/checkout/{plan_id}", headers=user_headers)
    assert checkout.status_code == 503
    assert "ulanmagan" in checkout.json()["detail"]

    updated = client.patch(
        f"/api/admin/vip/plans/{plan_id}",
        json={
            "name": "Test VIP 2",
            "days": 90,
            "price": 79000,
            "currency": "UZS",
            "benefits": "Reklamasiz",
            "is_active": True,
            "sort_order": 3,
        },
        headers=owner_headers,
    )
    assert updated.status_code == 200
    assert updated.json()["days"] == 90

    transactions = client.get("/api/admin/transactions", headers=owner_headers)
    assert transactions.status_code == 200
    assert transactions.json()["paid_total"] == 0
    assert transactions.json()["items"] == []

    other = dev_login(client, 900000050, "Plan Viewer")
    assert (
        client.post("/api/admin/vip/plans", json={"name": "X", "days": 1, "price": 0}, headers=auth_headers(other["token"])).status_code
        == 403
    )

    deleted = client.delete(
        f"/api/admin/vip/plans/{plan_id}", params={"confirm": "true"}, headers=owner_headers
    )
    assert deleted.status_code == 200

    client.patch("/api/admin/settings", json={"vip_enabled": False}, headers=owner_headers)
