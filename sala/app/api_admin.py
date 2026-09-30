"""Admin API (`<admin>/api`): login, students, lessons, override, attendance, the
entregas (list, download, move between aulas, lesson zip) and the pontuações
(approve or remove a self-reported score).

Mounted at `config.admin_path + "/api"`; everything except `session` and `login`
needs the admin session (see `auth.admin_required`), and every non-GET request
needs the session's CSRF token (see `auth.guard`).
"""

from __future__ import annotations

import re
import sqlite3
from datetime import date

from flask import Blueprint, Response, current_app, jsonify, request, send_file

from . import auth, covers, games, scores, uploads
from .db import SETTING_LESSON_OVERRIDE, delete_setting, get_db, set_setting
from .lessons import current_lesson, get_lesson, lesson_override, today

bp = Blueprint("api_admin", __name__)

# Tables that keep a student/lesson from being deleted. Later tables that
# reference a student or a lesson add themselves here.
STUDENT_REFERENCES: tuple[tuple[str, str], ...] = (
    ("attendance", "student_id"),
    ("uploads", "student_id"),
    ("scores", "student_id"),
)
LESSON_REFERENCES: tuple[tuple[str, str], ...] = (
    ("attendance", "lesson_number"),
    ("uploads", "lesson_number"),
    ("scores", "lesson_number"),
)

MAX_NAME_LENGTH = 60
ISO_DATE = re.compile(r"\d{4}-\d{2}-\d{2}")

BAD_NAME_MESSAGE = "Escreva o nome do aluno."
BAD_NUMBER_MESSAGE = "Escreva o número da aula (1, 2, 3, …)."
BAD_DATE_MESSAGE = "Data inválida: use o formato AAAA-MM-DD."
BAD_STUDENT_MESSAGE = "Não conheço esse aluno."
BAD_FILTER_MESSAGE = "Filtro inválido."
UPLOAD_SELECT = (
    "SELECT u.*, s.name AS student_name FROM uploads u JOIN students s ON s.id = u.student_id"
)


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
        raise auth.ApiError(
            409,
            f"{student['name']} tem presença, entregas ou pontuações: desative em vez de excluir.",
        )
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
        raise auth.ApiError(
            409, f"A aula {number} tem presença, entregas ou pontuações: não dá para excluir."
        )
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


# --- entregas --------------------------------------------------------------


def _optional_id(name: str) -> int | None:
    """The `?lesson=`/`?student=` filter, or None when it was not sent."""
    raw = request.args.get(name)
    if raw is None or not raw.strip():
        return None
    try:
        value = int(raw)
    except ValueError as error:
        raise auth.ApiError(422, BAD_FILTER_MESSAGE) from error
    if value <= 0:
        raise auth.ApiError(422, BAD_FILTER_MESSAGE)
    return value


def _upload_or_404(connection: sqlite3.Connection, upload_id: int) -> sqlite3.Row:
    row = connection.execute(f"{UPLOAD_SELECT} WHERE u.id = ?", (upload_id,)).fetchone()
    if row is None:
        raise auth.ApiError(404, uploads.NOT_FOUND_MESSAGE)
    return row


@bp.get("/uploads")
@auth.admin_required
def uploads_list() -> Response:
    """The entregas, newest first, filtered by aula and/or aluno."""
    connection = get_db()
    conditions: list[str] = []
    parameters: list[int] = []
    lesson = _optional_id("lesson")
    student = _optional_id("student")
    if lesson is not None:
        conditions.append("u.lesson_number = ?")
        parameters.append(lesson)
    if student is not None:
        conditions.append("u.student_id = ?")
        parameters.append(student)
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = connection.execute(
        f"{UPLOAD_SELECT}{where} ORDER BY u.created_at DESC, u.id DESC", parameters
    ).fetchall()
    return jsonify([uploads.upload_payload(row) for row in rows])


@bp.get("/uploads/<int:upload_id>/download")
@auth.admin_required
def upload_download(upload_id: int) -> Response:
    """Any entrega, whatever the aula or the aluno."""
    return uploads.send_upload(
        current_app.config["SALA_CONFIG"].data_dir, _upload_or_404(get_db(), upload_id)
    )


@bp.patch("/uploads/<int:upload_id>")
@auth.admin_required
def upload_update(upload_id: int) -> Response:
    """Move one entrega to another aula: the file first, then the row.

    The row is written only once the file is in its new folder, and the file is
    put back where the row still says it is if that write fails: a failure never
    leaves the teacher with a row pointing at nothing.
    """
    connection = get_db()
    row = _upload_or_404(connection, upload_id)
    number = auth.json_body().get("lessonNumber")
    if isinstance(number, bool) or not isinstance(number, int) or number <= 0:
        raise auth.ApiError(422, BAD_NUMBER_MESSAGE)
    if get_lesson(connection, number) is None:
        raise auth.ApiError(422, f"A aula {number} não está cadastrada.")
    if number == row["lesson_number"]:
        return jsonify(uploads.upload_payload(row))
    data_dir = current_app.config["SALA_CONFIG"].data_dir
    source = data_dir / row["stored_path"]
    if not source.is_file():
        raise auth.ApiError(404, uploads.NOT_FOUND_MESSAGE)
    stored, old_path, new_path = uploads.move_into_lesson(
        data_dir,
        stored_path=row["stored_path"],
        lesson_number=number,
        student_id=row["student_id"],
        student_name=row["student_name"],
        original_name=row["original_name"],
        created=row["created_at"],
    )
    try:
        connection.execute(
            "UPDATE uploads SET lesson_number = ?, stored_path = ? WHERE id = ?",
            (number, stored, upload_id),
        )
        connection.commit()
    except BaseException:
        uploads.restore_file(new_path, old_path)
        # The folder the file left is empty now — and it is a folder the row
        # never mentions any more, so it goes with the move.
        try:
            new_path.parent.rmdir()
        except OSError:
            pass
        raise
    return jsonify(uploads.upload_payload(_upload_or_404(connection, upload_id)))


@bp.get("/uploads/lesson/<int:number>.zip")
@auth.admin_required
def uploads_zip(number: int) -> Response:
    """Every entrega of one aula, as `<student name>/<file>` inside the zip."""
    connection = get_db()
    _lesson_or_404(connection, number)
    archive = uploads.build_lesson_zip(
        connection, current_app.config["SALA_CONFIG"].data_dir, number
    )
    response = send_file(
        archive,
        as_attachment=True,
        download_name=f"entregas-aula-{number:02d}.zip",
        mimetype="application/zip",
    )
    # `send_file` opens the file now and streams from that descriptor, so the
    # name can go away before the response is sent: the zip never outlives the
    # request that built it, not even if the client drops mid-download.
    archive.unlink(missing_ok=True)
    return response


# --- games -----------------------------------------------------------------


@bp.get("/games")
@auth.admin_required
def games_list() -> Response:
    """The whole catalogue, with what is missing for each game to run."""
    connection = get_db()
    data = current_app.config["SALA_CONFIG"].data_dir
    return jsonify(
        activeGame=games.active_game(connection),
        freeMode=games.free_mode(connection),
        games=[
            games.admin_payload(jogo, cover=covers.cover_available(data, jogo))
            for jogo in games.catalogue()
        ],
    )


@bp.put("/games/mode")
@auth.admin_required
def games_mode() -> Response:
    """Switch between one game and free mode.

    Both fields are read and validated before anything is written: a request the
    API refuses with 422 leaves the settings exactly as it found them.
    """
    connection = get_db()
    data = auth.json_body()
    free: bool | None = None
    active_sent = False
    active: str | None = None
    if "freeMode" in data:
        raw = data["freeMode"]
        if not isinstance(raw, bool):
            raise auth.ApiError(422, "O campo 'freeMode' precisa ser true ou false.")
        free = raw
    if "activeGame" in data:
        active_sent = True
        raw = data["activeGame"]
        if raw is None:
            active = None
        elif not isinstance(raw, str):
            raise auth.ApiError(422, "O campo 'activeGame' precisa ser o id de um jogo (ou null).")
        else:
            jogo = games.by_id(raw)
            if jogo is None:
                raise auth.ApiError(422, f"Não conheço o jogo {raw}.")
            if not games.playable(jogo):
                raise auth.ApiError(422, games.not_ready_message(jogo))
            active = jogo.id
    if free is None and not active_sent:
        raise auth.ApiError(422, "Mande o modo: activeGame (um jogo ou null) ou freeMode.")
    if free is not None:
        if free:
            set_setting(connection, games.SETTING_FREE_MODE, games.FREE_MODE_VALUE)
        else:
            delete_setting(connection, games.SETTING_FREE_MODE)
    if active_sent:
        if active is None:
            delete_setting(connection, games.SETTING_ACTIVE_GAME)
        else:
            set_setting(connection, games.SETTING_ACTIVE_GAME, active)
    connection.commit()
    return Response(status=204)


@bp.get("/games/<game_id>/capa")
@auth.admin_required
def game_cover(game_id: str) -> Response:
    """The cover of any catalogue game, whatever the kids may see right now.

    The teacher's table lists the WHOLE catalogue -- including the entries that
    are turned off or cannot run -- so it cannot use the public route, which
    answers 404 for a game that is not visible. Any known game's file is handed
    out; an unknown id is a 404. Private caching: this answer is behind the
    login, so a shared proxy must not keep it for a logged-out reader.
    """
    jogo = games.by_id(game_id)
    if jogo is None:
        raise auth.ApiError(404, games.NOT_FOUND_MESSAGE)
    path = covers.cover_file(current_app.config["SALA_CONFIG"].data_dir, jogo)
    if path is None:
        raise auth.ApiError(404, games.NOT_FOUND_MESSAGE)
    response = send_file(path, mimetype=covers.content_type(path))
    response.headers["Cache-Control"] = f"private, max-age={covers.CACHE_SECONDS}"
    return response


# --- pontuações ------------------------------------------------------------


def _score_status() -> str | None:
    """The `?status=` filter, or None when it was not sent; 422 when unknown."""
    raw = request.args.get("status")
    if raw is None or not raw.strip():
        return None
    if raw not in scores.STATUSES:
        raise auth.ApiError(422, BAD_FILTER_MESSAGE)
    return raw


def _score_or_404(connection: sqlite3.Connection, score_id: int) -> sqlite3.Row:
    row = connection.execute(f"{scores.SCORE_SELECT} WHERE s.id = ?", (score_id,)).fetchone()
    if row is None:
        raise auth.ApiError(404, scores.NOT_FOUND_MESSAGE)
    return row


@bp.get("/scores")
@auth.admin_required
def scores_list() -> Response:
    """The pontuações, newest first, filtered by status, aula and jogo."""
    connection = get_db()
    conditions: list[str] = []
    parameters: list[object] = []
    status = _score_status()
    if status is not None:
        conditions.append("s.approved = ?")
        parameters.append(1 if status == scores.STATUS_APPROVED else 0)
    lesson = _optional_id("lesson")
    if lesson is not None:
        conditions.append("s.lesson_number = ?")
        parameters.append(lesson)
    game = request.args.get("game")
    if game is not None and game.strip():
        conditions.append("s.game_id = ?")
        parameters.append(game.strip())
    where = f" WHERE {' AND '.join(conditions)}" if conditions else ""
    rows = connection.execute(
        f"{scores.SCORE_SELECT}{where} ORDER BY s.created_at DESC, s.id DESC", parameters
    ).fetchall()
    return jsonify([scores.admin_payload(row) for row in rows])


@bp.put("/scores/<int:score_id>/approval")
@auth.admin_required
def score_approval(score_id: int) -> Response:
    """Approve a self-reported pontuação — or take the approval back."""
    connection = get_db()
    _score_or_404(connection, score_id)
    approved = auth.json_body().get("approved")
    if not isinstance(approved, bool):
        raise auth.ApiError(422, "O campo 'approved' precisa ser true ou false.")
    connection.execute(
        "UPDATE scores SET approved = ? WHERE id = ?", (1 if approved else 0, score_id)
    )
    connection.commit()
    return Response(status=204)


@bp.delete("/scores/<int:score_id>")
@auth.admin_required
def score_delete(score_id: int) -> Response:
    """Remove one pontuação: a self-report the teacher refused, or a wrong one."""
    connection = get_db()
    _score_or_404(connection, score_id)
    connection.execute("DELETE FROM scores WHERE id = ?", (score_id,))
    connection.commit()
    return Response(status=204)
