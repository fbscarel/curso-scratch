"""SQLite access: schema, connection pragmas and the migrations behind PRAGMA user_version."""

from __future__ import annotations

import sqlite3

import pytest

from app import create_app
from app.db import (
    MIGRATIONS,
    connect,
    delete_setting,
    get_db,
    get_setting,
    migrate,
    set_setting,
    user_version,
)


def _columns(connection: sqlite3.Connection, table: str) -> dict[str, sqlite3.Row]:
    return {row["name"]: row for row in connection.execute(f"PRAGMA table_info({table})")}


def test_connect_turns_on_wal_and_foreign_keys(config):
    config.data_dir.mkdir(parents=True, exist_ok=True)
    connection = connect(config.db_path)
    try:
        assert connection.execute("PRAGMA journal_mode").fetchone()[0].lower() == "wal"
        assert connection.execute("PRAGMA foreign_keys").fetchone()[0] == 1
        assert connection.row_factory is sqlite3.Row
    finally:
        connection.close()


def test_schema_matches_the_spec(db):
    students = _columns(db, "students")
    assert list(students) == ["id", "name", "active"]
    assert students["id"]["pk"] == 1
    assert students["name"]["notnull"] == 1
    assert students["active"]["notnull"] == 1 and students["active"]["dflt_value"] == "1"

    lessons = _columns(db, "lessons")
    assert list(lessons) == ["number", "date"]
    assert lessons["number"]["pk"] == 1
    assert lessons["date"]["notnull"] == 1

    attendance = _columns(db, "attendance")
    assert list(attendance) == ["lesson_number", "student_id"]
    assert attendance["lesson_number"]["pk"] == 1 and attendance["student_id"]["pk"] == 2
    assert attendance["lesson_number"]["notnull"] == 1 and attendance["student_id"]["notnull"] == 1

    settings = _columns(db, "settings")
    assert list(settings) == ["key", "value"]
    assert settings["key"]["pk"] == 1


def test_user_version_counts_the_applied_migrations(db):
    assert user_version(db) == len(MIGRATIONS) > 0


def test_migrations_are_idempotent_across_starts(config):
    first = create_app(config)
    with first.app_context():
        connection = get_db()
        assert user_version(connection) == len(MIGRATIONS)
        connection.execute("INSERT INTO students (name) VALUES ('Ana Teste')")
        connection.commit()

    second = create_app(config)
    with second.app_context():
        connection = get_db()
        assert user_version(connection) == len(MIGRATIONS)
        assert connection.execute("SELECT COUNT(*) FROM students").fetchone()[0] == 1


def test_migrate_twice_on_the_same_connection_keeps_the_data(db):
    assert migrate(db) == len(MIGRATIONS)
    db.execute("INSERT INTO lessons (number, date) VALUES (1, '2026-09-29')")
    db.commit()
    assert migrate(db) == len(MIGRATIONS)
    assert db.execute("SELECT COUNT(*) FROM lessons").fetchone()[0] == 1


def test_student_names_are_unique_ignoring_case(db, add_student):
    add_student("Ana Teste")
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO students (name) VALUES ('ana teste')")
    db.rollback()
    assert db.execute("SELECT COUNT(*) FROM students").fetchone()[0] == 1


def test_lesson_number_must_be_positive(db):
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO lessons (number, date) VALUES (0, '2026-09-29')")
    db.rollback()
    assert db.execute("SELECT COUNT(*) FROM lessons").fetchone()[0] == 0


def test_deleting_a_lesson_cascades_its_attendance(db, add_student, add_lesson, add_attendance):
    student = add_student("Ana Teste")
    add_lesson(1, "2026-09-29")
    add_attendance(1, student)
    db.execute("DELETE FROM lessons WHERE number = 1")
    db.commit()
    assert db.execute("SELECT COUNT(*) FROM attendance").fetchone()[0] == 0


def test_attendance_needs_an_existing_lesson_and_student(db, add_student):
    student = add_student("Ana Teste")
    with pytest.raises(sqlite3.IntegrityError):
        db.execute("INSERT INTO attendance (lesson_number, student_id) VALUES (1, ?)", (student,))
    db.rollback()


def test_settings_round_trip(db):
    assert get_setting(db, "lesson_override") is None
    set_setting(db, "lesson_override", "2")
    db.commit()
    assert get_setting(db, "lesson_override") == "2"
    set_setting(db, "lesson_override", "3")
    db.commit()
    assert get_setting(db, "lesson_override") == "3"
    delete_setting(db, "lesson_override")
    db.commit()
    assert get_setting(db, "lesson_override") is None
