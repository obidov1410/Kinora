"""Test configuration. Environment must be set before importing the app."""
from __future__ import annotations

import hashlib
import hmac
import json
import os
import shutil
import tempfile
from urllib.parse import urlencode

TEST_BOT_TOKEN = "123456:TESTTOKEN-kinora-unit-tests"
TEST_OWNER_ID = 900000001

_TMP = tempfile.mkdtemp(prefix="kinora-tests-")
os.environ.update(
    {
        "ENV": "test",
        "BOT_TOKEN": TEST_BOT_TOKEN,
        "OWNER_ID": str(TEST_OWNER_ID),
        "SECRET_KEY": "test-secret-key-do-not-use-in-production-0123456789",
        "DATABASE_URL": f"sqlite:///{_TMP}/kinora-test.db",
        "DATA_DIR": f"{_TMP}/data",
        "ALLOW_DEV_LOGIN": "true",
        "SEED_DEMO": "false",
        "RATE_LIMIT_ENABLED": "false",
        "PAYMENT_PROVIDER": "none",
        "CORS_ORIGINS": "http://localhost:8000",
    }
)

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from backend.main import app  # noqa: E402


def make_init_data(
    telegram_id: int,
    *,
    auth_date: int | None = None,
    first_name: str = "Test",
    username: str = "tester",
    token: str = TEST_BOT_TOKEN,
) -> str:
    import time

    fields = {
        "auth_date": str(auth_date if auth_date is not None else int(time.time())),
        "query_id": "AAH-test-query",
        "user": json.dumps(
            {"id": telegram_id, "first_name": first_name, "username": username, "language_code": "uz"},
            separators=(",", ":"),
        ),
    }
    data_check_string = "\n".join(f"{key}={fields[key]}" for key in sorted(fields))
    secret = hmac.new(b"WebAppData", token.encode(), hashlib.sha256).digest()
    fields["hash"] = hmac.new(secret, data_check_string.encode(), hashlib.sha256).hexdigest()
    return urlencode(fields)


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as test_client:
        yield test_client
    shutil.rmtree(_TMP, ignore_errors=True)


def dev_login(client: TestClient, telegram_id: int, name: str = "Test User") -> dict:
    response = client.post(
        "/api/auth/dev",
        json={"telegram_id": telegram_id, "first_name": name, "username": f"user{telegram_id}"},
    )
    assert response.status_code == 200, response.text
    return response.json()


def auth_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture(scope="session")
def owner(client):
    return dev_login(client, TEST_OWNER_ID, "Kinora Owner")


@pytest.fixture(scope="session")
def owner_headers(owner):
    return auth_headers(owner["token"])


@pytest.fixture(scope="session")
def normal_user(client):
    return dev_login(client, 900000010, "Oddiy Foydalanuvchi")


@pytest.fixture(scope="session")
def user_headers(normal_user):
    return auth_headers(normal_user["token"])


def create_movie(client: TestClient, headers: dict, title: str = "Test Film", **overrides) -> dict:
    payload = {
        "kind": "movie",
        "title": title,
        "year": 2024,
        "genres": ["drama"],
        "description": "Test tavsifi",
        "is_published": True,
        "duration_minutes": 90,
    }
    payload.update(overrides)
    response = client.post("/api/admin/content", json=payload, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()
