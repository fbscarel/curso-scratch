"""Public API (`/api`): the session, the student list and "Quem é você?".

No authentication: the lab PCs only pick a name. Every non-GET request still
needs the session's CSRF token (see `auth.guard`).
"""

from __future__ import annotations

import sqlite3

from flask import Blueprint, Response, jsonify, session

from . import auth
from .db import get_db
from .lessons import current_lesson, today

bp = Blueprint("api_public", __name__, url_prefix="/api")

STUDENT_SESSION_KEY = "student_id"


def current_student(connection: sqlite3.Connection) -> sqlite3.Row | None:
    """The student picked in this session, if it still exists and is active."""
    student_id = session.get(STUDENT_SESSION_KEY)
    if not student_id:
        return None
    return connection.execute(
        "SELECT * FROM students WHERE id = ? AND active = 1", (student_id,)
    ).fetchone()


def lesson_payload(lesson: sqlite3.Row | None) -> dict | None:
    """`{number, date}` for the SPA, or None when no lesson has started."""
    if lesson is None:
        return None
    return {"number": lesson["number"], "date": lesson["date"]}


def _active_student(connection: sqlite3.Connection, student_id: int) -> sqlite3.Row | None:
    return connection.execute(
        "SELECT * FROM students WHERE id = ? AND active = 1", (student_id,)
    ).fetchone()


def _student_id(data: dict) -> int:
    """The `studentId` of the body; 422 when it is not a whole number."""
    raw = data.get("studentId")
    if isinstance(raw, bool) or not isinstance(raw, int):
        raise auth.ApiError(422, "Escolha o seu nome na lista.")
    return raw


@bp.get("/session")
def session_info() -> Response:
    connection = get_db()
    student = current_student(connection)
    return jsonify(
        csrf=auth.csrf_token(),
        student=None if student is None else {"id": student["id"], "name": student["name"]},
        currentLesson=lesson_payload(current_lesson(connection, today())),
    )


@bp.get("/students")
def students() -> Response:
    rows = get_db().execute(
        "SELECT id, name FROM students WHERE active = 1 ORDER BY name COLLATE NOCASE"
    ).fetchall()
    return jsonify([{"id": row["id"], "name": row["name"]} for row in rows])


@bp.put("/identity")
def set_identity() -> Response:
    connection = get_db()
    student_id = _student_id(auth.json_body())
    if _active_student(connection, student_id) is None:
        raise auth.ApiError(422, "Escolha o seu nome na lista.")
    session[STUDENT_SESSION_KEY] = student_id
    return Response(status=204)


@bp.delete("/identity")
def clear_identity() -> Response:
    session.pop(STUDENT_SESSION_KEY, None)
    return Response(status=204)
