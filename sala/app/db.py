"""SQLite access: one connection per request and migrations applied on start.

Each migration is one entry of MIGRATIONS; `PRAGMA user_version` counts how many
have been applied, so starting twice is a no-op.
"""

from __future__ import annotations

import sqlite3
from pathlib import Path

from flask import Flask, current_app, g

MIGRATIONS: tuple[str, ...] = (
    # 1 — students
    """
    CREATE TABLE students (
        id INTEGER PRIMARY KEY,
        name TEXT NOT NULL COLLATE NOCASE UNIQUE,
        active INTEGER NOT NULL DEFAULT 1
    );
    """,
    # 2 — lessons ("Aula" in the UI)
    """
    CREATE TABLE lessons (
        number INTEGER PRIMARY KEY CHECK (number > 0),
        date TEXT NOT NULL
    );
    """,
    # 3 — attendance
    """
    CREATE TABLE attendance (
        lesson_number INTEGER NOT NULL REFERENCES lessons(number) ON DELETE CASCADE,
        student_id INTEGER NOT NULL REFERENCES students(id),
        PRIMARY KEY (lesson_number, student_id)
    );
    """,
    # 4 — settings (lesson_override; later active_game, free_mode)
    """
    CREATE TABLE settings (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    """,
    # 5 — uploads ("Entregas"): one row per file an aluno handed in
    """
    CREATE TABLE uploads (
        id INTEGER PRIMARY KEY,
        lesson_number INTEGER NOT NULL REFERENCES lessons(number),
        student_id INTEGER NOT NULL REFERENCES students(id),
        original_name TEXT NOT NULL,
        stored_path TEXT NOT NULL UNIQUE,
        size INTEGER NOT NULL,
        created_at TEXT NOT NULL
    );
    """,
    # 6 — scores ("Pontuações"): what an aluno scored in a jogo at an aula
    """
    CREATE TABLE scores (
        id INTEGER PRIMARY KEY,
        game_id TEXT NOT NULL,
        lesson_number INTEGER NOT NULL REFERENCES lessons(number),
        student_id INTEGER NOT NULL REFERENCES students(id),
        score INTEGER NOT NULL CHECK (score >= 0),
        method TEXT NOT NULL CHECK (method IN ('auto', 'self')),
        approved INTEGER NOT NULL CHECK (approved IN (0, 1)),
        created_at TEXT NOT NULL
    );
    """,
)

SETTING_LESSON_OVERRIDE = "lesson_override"


def connect(path: Path | str) -> sqlite3.Connection:
    """Open a connection with row access by name, WAL and foreign keys on."""
    connection = sqlite3.connect(path, timeout=10)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA journal_mode = WAL")
    connection.execute("PRAGMA foreign_keys = ON")
    return connection


def user_version(connection: sqlite3.Connection) -> int:
    return int(connection.execute("PRAGMA user_version").fetchone()[0])


def migrate(connection: sqlite3.Connection) -> int:
    """Apply the pending migrations; returns how many are applied in total."""
    applied = user_version(connection)
    for number, script in enumerate(MIGRATIONS[applied:], start=applied + 1):
        connection.executescript(script)
        connection.execute(f"PRAGMA user_version = {number}")
    connection.commit()
    return len(MIGRATIONS)


def get_db() -> sqlite3.Connection:
    """The connection of the current request (created on first use)."""
    if "sala_db" not in g:
        config = current_app.config["SALA_CONFIG"]
        config.data_dir.mkdir(parents=True, exist_ok=True)
        g.sala_db = connect(config.db_path)
    return g.sala_db


def close_db(exception: BaseException | None = None) -> None:
    connection = g.pop("sala_db", None)
    if connection is not None:
        connection.close()


def init_app(app: Flask) -> None:
    app.teardown_appcontext(close_db)
    with app.app_context():
        migrate(get_db())


def get_setting(connection: sqlite3.Connection, key: str) -> str | None:
    row = connection.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
    return None if row is None else row["value"]


def set_setting(connection: sqlite3.Connection, key: str, value: str) -> None:
    connection.execute(
        "INSERT INTO settings (key, value) VALUES (?, ?)"
        " ON CONFLICT(key) DO UPDATE SET value = excluded.value",
        (key, value),
    )


def delete_setting(connection: sqlite3.Connection, key: str) -> None:
    connection.execute("DELETE FROM settings WHERE key = ?", (key,))
