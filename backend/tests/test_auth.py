from __future__ import annotations

import time

from backend.auth import TelegramAuthError, validate_telegram_init_data
from backend.tests.conftest import TEST_BOT_TOKEN, make_init_data


def test_health(client):
    response = client.get("/api/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ok"
    assert data["database"] == "ok"
    assert TEST_BOT_TOKEN not in str(data)


def test_health_head(client):
    response = client.head("/api/health")
    assert response.status_code == 200


def test_telegram_init_data_validation_accepts_valid_signature():
    user = validate_telegram_init_data(make_init_data(1234567))
    assert user["id"] == 1234567


def test_telegram_init_data_rejects_tampered_hash():
    init_data = make_init_data(1234567)
    tampered = init_data.replace("hash=", "hash=00", 1)
    try:
        validate_telegram_init_data(tampered)
    except TelegramAuthError as exc:
        assert "signature" in str(exc).lower() or "invalid" in str(exc).lower()
    else:
        raise AssertionError("Tampered initData must fail")


def test_telegram_init_data_rejects_expired():
    old = int(time.time()) - 90000
    try:
        validate_telegram_init_data(make_init_data(1234567, auth_date=old))
    except TelegramAuthError as exc:
        assert "expired" in str(exc).lower()
    else:
        raise AssertionError("Expired initData must fail")


def test_telegram_login_endpoint(client):
    response = client.post(
        "/api/auth/telegram",
        json={"init_data": make_init_data(910000001, first_name="Telegram User"), "language": "uz"},
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert data["token"]
    assert data["user"]["telegram_id"] == 910000001
    assert data["user"]["role"] == "user"

    bad = client.post(
        "/api/auth/telegram",
        json={"init_data": make_init_data(910000001).replace("hash=", "hash=ff", 1)},
    )
    assert bad.status_code == 401


def test_owner_login_via_telegram_gets_owner_role(client):
    from backend.tests.conftest import TEST_OWNER_ID

    response = client.post(
        "/api/auth/telegram",
        json={"init_data": make_init_data(TEST_OWNER_ID, first_name="Owner TG")},
    )
    assert response.status_code == 200
    assert response.json()["user"]["role"] == "owner"


def test_me_requires_token(client):
    assert client.get("/api/me").status_code == 401
    assert client.get("/api/me", headers={"Authorization": "Bearer invalid"}).status_code == 401
