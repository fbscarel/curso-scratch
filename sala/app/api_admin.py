"""Admin API (`<admin>/api`): login, students, lessons, override and attendance.

Mounted at `config.admin_path + "/api"`; everything except `session` and `login`
needs the admin session (see `auth.admin_required`), and every non-GET request
needs the session's CSRF token (see `auth.guard`).
"""

from __future__ import annotations

import re
import sqlite3
from datetime import date

from flask import Blueprint, Response, jsonify

from . import auth
from .db import SETTING_LESSON_OVERRIDE, delete_setting, get_db, set_setting
from .lessons import current_lesson, get_lesson, lesson_override, today

bp = Blueprint("api_admin", __name__)

# Tables that keep a student/lesson from being deleted (S3/S5 add theirs here).
STUDENT_REFERENCES: tuple[tuple[str, str], ...] = (("attendance", "student_id"),)
LESSON_REFERENCES: tuple[tuple[str, str], ...] = (("attendance", "lesson_number"),)

MAX_NAME_LENGTH = 60
ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")

BAD_NAME_MESSAGE = "Escreva o nome do aluno."
BAD_NUMBER_MESSAGE = "Escreva o número da aula (1, 2, 3, …)."
BAD_DATE_MESSAGE = "Data inválida: use o formato AAAA-MM-DD."
BAD_STUDENT_MESSAGE = "Não conheço esse aluno."


# --- helpers ---------------------------------------------------------------


def _is_referenced(connection: sqlite3.Connection, references, value: int) -> bool:
    for table, column in references:
        row = connection.execute(f"SELECT 1 FROM {table} WHERE {column} = ? LIMIT 1", (value,)).fetchone()
        if row is not None:
            return True
    return False


def _student_or_404(connection: sqlite3.Connection, student_id: int) -> sqlite3.Row:
    row = connection.execute("SELECT * FROM students WHERE id = ?", (student_id,)).fetchone()
    if row is None:
        raise auth.ApiError(404, "Não encontrei esse aluno.")
    return row


def _lesson_or_404(connection: sqlite3.Connection, number: int) -> sqlite3.Row:
    row = get_lesson(connection, number)
    if row is None:
        raise auth.ApiError(404, "Não encontrei essa aula.")
    return row


def _student_payload(row: sqlite3.Row) -> dict:
    return {"id": row["id"], "name": row["name"], "active": bool(row["active"])}


def _lesson_payload(row: sqlite3.Row) -> dict:
    return {"number": row["number"], "date": row["date"]}


def _student_name(data: dict) -> str:
    """The `name` of the body, trimmed; 422 when it is empty or too long."""
    raw = data.get("name")
    if not isinstance(raw, str):
        raise auth.ApiError(422, BAD_NAME_MESSAGE)
    name = " ".join(raw.split())
    if not name:
        raise auth.ApiError(422, BAD_NAME_MESSAGE)
    if len(name) > MAX_NAME_LENGTH:
        raise auth.ApiError(422, f"O nome do aluno pode ter no máximo {MAX_NAME_LENGTH} letras.")
    return name


def _lesson_number(data: dict) -> int:
    """The `number` of the body; 422 when it is not a positive whole number."""
    raw = data.get("number")
    if isinstance(raw, bool) or not isinstance(raw, int) or raw <= 0:
        raise auth.ApiError(422, BAD_NUMBER_MESSAGE)
    return raw


def _lesson_date(data: dict, *, default_today: bool) -> str:
    """The `date` of the body as `YYYY-MM-DD`; empty means today on creation."""
    raw = data.get("date")
    if raw is None or (isinstance(raw, str) and not raw.strip()):
        if default_today:
            return today().isoformat()
        raise auth.ApiError(422, BAD_DATE_MESSAGE)
    if not isinstance(raw, str) or ISO_DATE.fullmatch(raw.strip()) is None:
        raise auth.ApiError(422, BAD_DATE_MESSAGE)
    try:
        return date.fromisoformat(raw.strip()).isoformat()
    except ValueError as error:
        raise auth.ApiError(422, BAD_DATE_MESSAGE) from error


def _present_ids(connection: sqlite3.Connection, raw: list) -> list[int]:
    """The student ids of `present`, deduplicated; 422 for an unknown one."""
    ids: list[int] = []
    for value in raw:
        if isinstance(value, bool) or not isinstance(value, int):
            raise auth.ApiError(422, "A lista de presença tem um id que não é número.")
        if value not in ids:
            ids.append(value)
    known = {row["id"] for row in connection.execute("SELECT id FROM students")}
    if any(student_id not in known for student_id in ids):
        raise auth.ApiError(422, BAD_STUDENT_MESSAGE)
    return ids


# --- session and login -----------------------------------------------------


@bp.get("/session")
def session_info() -> Response:
    connection = get_db()
    lesson = current_lesson(connection, today())
    payload = None
    if lesson is not None:
        payload = {
            "number": lesson["number"],
            "date": lesson["date"],
            "override": lesson_override(connection) is not None,
        }
    return jsonify(admin=auth.admin_logged_in(), csrf=auth.csrf_token(), currentLesson=payload)


@bp.post("/login")
def login() -> Response:
    password = auth.json_body().get("password")
    if not auth.login(password if isinstance(password, str) else ""):
        raise auth.ApiError(401, "Senha errada. Tente de novo.")
    return Response(status=204)


@bp.post("/logout")
@auth.admin_required
def logout() -> Response:
    auth.logout()
    return Response(status=204)


# --- students --------------------------------------------------------------


@bp.get("/students")
@auth.admin_required
def students() -> Response:
    rows = get_db().execute("SELECT * FROM students ORDER BY name COLLATE NOCASE").fetchall()
    return jsonify([_student_payload(row) for row in rows])


@bp.post("/students")
@auth.admin_required
def student_add() -> Response:
    connection = get_db()
    name = _student_name(auth.json_body())
    try:
        cursor = connection.execute("INSERT INTO students (name) VALUES (?)", (name,))
        connection.commit()
    except sqlite3.IntegrityError as error:
        raise auth.ApiError(409, f"Já existe um aluno chamado {name}.") from error
    return jsonify(id=cursor.lastrowid, name=name, active=True), 201


@bp.patch("/students/<int:student_id>")
@auth.admin_required
def student_update(student_id: int) -> Response:
    connection = get_db()
    _student_or_404(connection, student_id)
    data = auth.json_body()
    # Both fields are read and validated BEFORE the first UPDATE: a request the
    # API refuses with 422 must leave the row exactly as it found it, and a
    # rename committed before `active` was checked would not.
    name = _student_name(data) if "name" in data else None
    active: bool | None = None
    if "active" in data:
        raw = data["active"]
        if not isinstance(raw, bool):
            raise auth.ApiError(422, "O campo 'active' precisa ser true ou false.")
        active = raw
    try:
        if name is not None:
            connection.execute("UPDATE students SET name = ? WHERE id = ?", (name, student_id))
        if active is not None:
            connection.execute(
                "UPDATE students SET active = ? WHERE id = ?", (1 if active else 0, student_id)
            )
        connection.commit()
    except sqlite3.IntegrityError as error:
        raise auth.ApiError(409, f"Já existe um aluno chamado {name}.") from error
    return jsonify(_student_payload(_student_or_404(connection, student_id)))


@bp.delete("/students/<int:student_id>")
@auth.admin_required
def student_delete(student_id: int) -> Response:
    connection = get_db()
    student = _student_or_404(connection, student_id)
    if _is_referenced(connection, STUDENT_REFERENCES, student_id):
        raise auth.ApiError(409, f"{student['name']} tem presença registrada: desative em vez de excluir.")
    connection.execute("DELETE FROM students WHERE id = ?", (student_id,))
    connection.commit()
    return Response(status=204)


# --- lessons ---------------------------------------------------------------


@bp.get("/lessons")
@auth.admin_required
def lessons() -> Response:
    rows = get_db().execute("SELECT * FROM lessons ORDER BY number").fetchall()
    return jsonify([_lesson_payload(row) for row in rows])


@bp.post("/lessons")
@auth.admin_required
def lesson_add() -> Response:
    connection = get_db()
    data = auth.json_body()
    number = _lesson_number(data)
    day = _lesson_date(data, default_today=True)
    try:
        connection.execute("INSERT INTO lessons (number, date) VALUES (?, ?)", (number, day))
        connection.commit()
    except sqlite3.IntegrityError as error:
        raise auth.ApiError(409, f"A aula {number} já está cadastrada.") from error
    return jsonify(number=number, date=day), 201


@bp.patch("/lessons/<int:number>")
@auth.admin_required
def lesson_update(number: int) -> Response:
    connection = get_db()
    _lesson_or_404(connection, number)
    day = _lesson_date(auth.json_body(), default_today=False)
    connection.execute("UPDATE lessons SET date = ? WHERE number = ?", (day, number))
    connection.commit()
    return jsonify(number=number, date=day)


@bp.delete("/lessons/<int:number>")
@auth.admin_required
def lesson_delete(number: int) -> Response:
    connection = get_db()
    _lesson_or_404(connection, number)
    if _is_referenced(connection, LESSON_REFERENCES, number):
        raise auth.ApiError(409, f"A aula {number} tem presença registrada: não dá para excluir.")
    connection.execute("DELETE FROM lessons WHERE number = ?", (number,))
    connection.commit()
    return Response(status=204)


# --- current lesson override -----------------------------------------------


@bp.get("/override")
@auth.admin_required
def override_get() -> Response:
    return jsonify(lesson=lesson_override(get_db()))


@bp.put("/override")
@auth.admin_required
def override_put() -> Response:
    connection = get_db()
    data = auth.json_body()
    if "lesson" not in data:
        raise auth.ApiError(422, "Mande a aula escolhida (ou null para voltar ao automático).")
    number = data["lesson"]
    if number is None:
        delete_setting(connection, SETTING_LESSON_OVERRIDE)
    else:
        if isinstance(number, bool) or not isinstance(number, int):
            raise auth.ApiError(422, "A aula escolhida precisa ser um número.")
        if get_lesson(connection, number) is None:
            raise auth.ApiError(422, f"A aula {number} não está cadastrada.")
        set_setting(connection, SETTING_LESSON_OVERRIDE, str(number))
    connection.commit()
    return Response(status=204)


# --- attendance ------------------------------------------------------------


@bp.get("/attendance/<int:number>")
@auth.admin_required
def attendance_get(number: int) -> Response:
    connection = get_db()
    lesson = _lesson_or_404(connection, number)
    present = {
        row["student_id"]
        for row in connection.execute(
            "SELECT student_id FROM attendance WHERE lesson_number = ?", (number,)
        )
    }
    rows = connection.execute(
        "SELECT * FROM students"
        " WHERE active = 1 OR id IN (SELECT student_id FROM attendance WHERE lesson_number = ?)"
        " ORDER BY name COLLATE NOCASE",
        (number,),
    ).fetchall()
    return jsonify(
        lesson=_lesson_payload(lesson),
        students=[
            {"id": row["id"], "name": row["name"], "present": row["id"] in present} for row in rows
        ],
    )


@bp.put("/attendance/<int:number>")
@auth.admin_required
def attendance_put(number: int) -> Response:
    connection = get_db()
    _lesson_or_404(connection, number)
    raw = auth.json_body().get("present")
    if not isinstance(raw, list):
        raise auth.ApiError(422, "Mande a lista de presença em 'present'.")
    ids = _present_ids(connection, raw)
    connection.execute("DELETE FROM attendance WHERE lesson_number = ?", (number,))
    connection.executemany(
        "INSERT INTO attendance (lesson_number, student_id) VALUES (?, ?)",
        [(number, student_id) for student_id in ids],
    )
    connection.commit()
    return Response(status=204)
