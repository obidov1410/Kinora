from __future__ import annotations

from backend.tests.conftest import TEST_OWNER_ID, auth_headers, dev_login


def test_owner_can_list_and_search_users(client, owner_headers):
    response = client.get(
        "/api/admin/users", params={"search": str(TEST_OWNER_ID)}, headers=owner_headers
    )
    assert response.status_code == 200
    data = response.json()
    assert data["total"] >= 1
    owner = next(item for item in data["items"] if item["telegram_id"] == TEST_OWNER_ID)
    assert owner["role"] == "owner"


def test_role_management_is_owner_only(client, owner_headers):
    admin_candidate = dev_login(client, 900000040, "Admin Candidate")
    target = dev_login(client, 900000041, "Role Target")

    promoted = client.post(
        f"/api/admin/users/{admin_candidate['user']['id']}/role",
        json={"role": "admin"},
        headers=owner_headers,
    )
    assert promoted.status_code == 200, promoted.text
    assert promoted.json()["role"] == "admin"

    admin_headers = auth_headers(admin_candidate["token"])
    assert client.get("/api/admin/stats", headers=admin_headers).status_code == 200

    forbidden = client.post(
        f"/api/admin/users/{target['user']['id']}/role",
        json={"role": "admin"},
        headers=admin_headers,
    )
    assert forbidden.status_code == 403

    owner_demote = client.post(
        f"/api/admin/users/{target['user']['id']}/role",
        json={"role": "admin"},
        headers=owner_headers,
    )
    assert owner_demote.status_code == 200

    revoke = client.post(
        f"/api/admin/users/{admin_candidate['user']['id']}/role",
        json={"role": "user"},
        headers=owner_headers,
    )
    assert revoke.status_code == 200


def test_owner_account_cannot_be_blocked_or_demoted(client, owner_headers, owner):
    response = client.patch(
        f"/api/admin/users/{owner['user']['id']}",
        json={"is_blocked": True},
        headers=owner_headers,
    )
    assert response.status_code == 400

    role = client.post(
        f"/api/admin/users/{owner['user']['id']}/role",
        json={"role": "user"},
        headers=owner_headers,
    )
    assert role.status_code == 400


def test_block_unblock_and_vip_grant(client, owner_headers):
    user = dev_login(client, 900000042, "Block Target")
    user_id = user["user"]["id"]
    headers = auth_headers(user["token"])
    assert client.get("/api/me", headers=headers).status_code == 200

    blocked = client.patch(
        f"/api/admin/users/{user_id}", json={"is_blocked": True}, headers=owner_headers
    )
    assert blocked.status_code == 200
    assert blocked.json()["is_blocked"] is True
    assert client.get("/api/me", headers=headers).status_code == 403

    unblocked = client.patch(
        f"/api/admin/users/{user_id}", json={"is_blocked": False}, headers=owner_headers
    )
    assert unblocked.status_code == 200
    assert client.get("/api/me", headers=headers).status_code == 200

    granted = client.patch(
        f"/api/admin/users/{user_id}", json={"vip_days": 30}, headers=owner_headers
    )
    assert granted.status_code == 200
    assert granted.json()["is_vip"] is True
    assert granted.json()["vip_until"]

    revoked = client.patch(
        f"/api/admin/users/{user_id}", json={"vip_days": -60}, headers=owner_headers
    )
    assert revoked.status_code == 200
    assert revoked.json()["is_vip"] is False
