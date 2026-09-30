"""Fixtures shared by the backend tests: a temporary data directory, a Config, a
DB and a stand-in for the built SPA.

Every test runs against its own `dados/` (pytest's tmp_path) and its own bundle
(`dist_dir`), so nothing touches the real data directory or the real build.
"""

from __future__ import annotations

from collections.abc import Callable, Iterator
from datetime import date
from pathlib import Path
from typing import Any

import pytest

from app import create_app
from app.config import Config, hash_password
from app.db import SETTING_LESSON_OVERRIDE, connect, migrate, set_setting

PASSWORD = "senha-do-professor"
ADMIN_PATH = "/professor-teste"
ADMIN_API = ADMIN_PATH + "/api"
SECRET_KEY = "ab" * 32
PASSWORD_HASH = hash_password(PASSWORD)

# The day the suite pretends to be: `create_app` pins it through SALA_TODAY, so
# "the current lesson" and the default date of a new lesson never move.
TODAY = date(2026, 9, 29)

# A stand-in for the Vite output: what spa.py reads, injects into and serves.
INDEX_HTML = (
    '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
    "<title>Sala</title>\n</head>\n<body>\n<div id=\"root\"></div>\n"
    '<script type="module" src="/assets/app.js"></script>\n</body>\n</html>\n'
)
ASSET_JS = "console.log('sala');\n"


@pytest.fixture
def data_dir(tmp_path: Path) -> Path:
    return tmp_path / "dados"


@pytest.fixture
def config(data_dir: Path) -> Config:
    return Config(
        admin_path=ADMIN_PATH,
        password_hash=PASSWORD_HASH,
        secret_key=SECRET_KEY,
        data_dir=data_dir,
        login_delay=0.0,
    )


@pytest.fixture
def password() -> str:
    return PASSWORD


@pytest.fixture
def admin_api() -> str:
    return ADMIN_API


@pytest.fixture
def today() -> date:
    return TODAY


@pytest.fixture
def dist_dir(tmp_path: Path) -> Path:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text(INDEX_HTML, encoding="utf-8")
    (dist / "assets" / "app.js").write_text(ASSET_JS, encoding="utf-8")
    return dist


@pytest.fixture
def app(config: Config, dist_dir: Path, today: date):
    application = create_app(config, dist_dir=dist_dir)
    application.config["TESTING"] = True
    application.config["SALA_TODAY"] = today
    return application


@pytest.fixture
def client(app):
    return app.test_client()


@pytest.fixture
def csrf_of() -> Callable[..., str]:
    """Read the CSRF token of a client's session from an API session route."""

    def token(client: Any, session_path: str = "/api/session") -> str:
        response = client.get(session_path)
        assert response.status_code == 200
        return response.get_json()["csrf"]

    return token


@pytest.fixture
def admin_client(app):
    """A client that has logged in through the admin API."""
    client = app.test_client()
    token = client.get(f"{ADMIN_API}/session").get_json()["csrf"]
    response = client.post(
        f"{ADMIN_API}/login", json={"password": PASSWORD}, headers={"X-CSRF-Token": token}
    )
    assert response.status_code == 204
    return client


@pytest.fixture
def db(app, config: Config) -> Iterator:
    connection = connect(config.db_path)
    migrate(connection)
    yield connection
    connection.close()


@pytest.fixture
def add_student(db) -> Callable[..., int]:
    def add(name: str, active: int = 1) -> int:
        cursor = db.execute("INSERT INTO students (name, active) VALUES (?, ?)", (name, active))
        db.commit()
        return int(cursor.lastrowid)

    return add


@pytest.fixture
def add_lesson(db) -> Callable[..., int]:
    def add(number: int, day: str) -> int:
        db.execute("INSERT INTO lessons (number, date) VALUES (?, ?)", (number, day))
        db.commit()
        return number

    return add


@pytest.fixture
def add_attendance(db) -> Callable[..., None]:
    def add(lesson_number: int, student_id: int) -> None:
        db.execute(
            "INSERT INTO attendance (lesson_number, student_id) VALUES (?, ?)",
            (lesson_number, student_id),
        )
        db.commit()

    return add


@pytest.fixture
def set_override(db) -> Callable[[int], None]:
    def set_it(number: int) -> None:
        set_setting(db, SETTING_LESSON_OVERRIDE, str(number))
        db.commit()

    return set_it
