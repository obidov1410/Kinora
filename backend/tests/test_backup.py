from __future__ import annotations

from backend.tests.conftest import create_movie


def test_backup_requires_admin(client, user_headers):
    assert client.post("/api/admin/backups").status_code == 401
    assert client.get("/api/admin/backups", headers=user_headers).status_code == 403


def test_backup_create_download_and_restore(client, owner_headers):
    marker = create_movie(client, owner_headers, title="Backup Marker Film")

    created = client.post("/api/admin/backups", headers=owner_headers)
    assert created.status_code == 201, created.text
    backup = created.json()
    assert backup["name"].startswith("kinora-")
    assert backup["bytes"] > 0

    listing = client.get("/api/admin/backups", headers=owner_headers)
    assert listing.status_code == 200
    names = [item["name"] for item in listing.json()["items"]]
    assert backup["name"] in names

    download = client.get(f"/api/admin/backups/{backup['name']}/download", headers=owner_headers)
    assert download.status_code == 200
    assert download.content[:16] == b"SQLite format 3\x00"

    traversal = client.get("/api/admin/backups/..%2Fkinora.db/download", headers=owner_headers)
    assert traversal.status_code in {400, 404}

    deleted = client.delete(
        f"/api/admin/content/{marker['id']}", params={"confirm": "true"}, headers=owner_headers
    )
    assert deleted.status_code == 200
    assert client.get(f"/api/catalog/{marker['id']}").status_code == 404

    bad_restore = client.post(
        f"/api/admin/backups/{backup['name']}/restore",
        json={"confirm": "no"},
        headers=owner_headers,
    )
    assert bad_restore.status_code == 422

    restored = client.post(
        f"/api/admin/backups/{backup['name']}/restore",
        json={"confirm": "RESTORE"},
        headers=owner_headers,
    )
    assert restored.status_code == 200, restored.text
    assert restored.json()["restored"] is True
    assert restored.json()["safety_backup"].startswith("pre-restore-")

    assert client.get("/api/health").json()["status"] == "ok"
    assert client.get(f"/api/catalog/{marker['id']}").status_code == 200

    audit = client.get("/api/admin/audit", headers=owner_headers).json()
    assert any(item["action"] == "backup.restore" for item in audit["items"])
