"""Public API (`/api`): the session, the student list, "Quem é você?", the
entregas of the student of this session and the games of the day.

No authentication: the lab PCs only pick a name. Every non-GET request still
needs the session's CSRF token (see `auth.guard`).
"""

from __future__ import annotations

import sqlite3

from flask import Blueprint, Response, current_app, jsonify, request, send_file, session

from . import auth, games, uploads
from .db import get_db
from .lessons import current_lesson, today
from .sheets import sheets_payload

bp = Blueprint("api_public", __name__, url_prefix="/api")

STUDENT_SESSION_KEY = "student_id"

NO_IDENTITY_MESSAGE = "Escolha seu nome primeiro."
NO_LESSON_MESSAGE = "Nenhuma aula começou ainda."
NO_FILE_MESSAGE = "Escolha um arquivo para entregar."
UPLOAD_NOT_FOUND_MESSAGE = "Não encontrei esse arquivo."


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


def _require_student(connection: sqlite3.Connection) -> sqlite3.Row:
    """The session's student, or 409 — every entrega route needs a name first."""
    student = current_student(connection)
    if student is None:
        raise auth.ApiError(409, NO_IDENTITY_MESSAGE)
    return student


@bp.post("/uploads")
def upload_create() -> Response:
    """Take one file from the kid and file it under the current aula."""
    connection = get_db()
    student = _require_student(connection)
    lesson = current_lesson(connection, today())
    if lesson is None:
        raise auth.ApiError(409, NO_LESSON_MESSAGE)
    file = request.files.get("file")
    if file is None or not file.filename:
        raise auth.ApiError(422, NO_FILE_MESSAGE)
    name = uploads.sanitize_filename(file.filename)
    # The type is read from the name the file is stored under: a trailing space
    # (`jogo.sb3 `) is part of the raw suffix but not of the stored name, and a
    # name like `.sb3` has no stem left to store at all.
    if uploads.allowed_extension(name) is None:
        raise auth.ApiError(422, uploads.BAD_TYPE_MESSAGE)
    moment = uploads.now()
    try:
        stored, size = uploads.save_upload(
            current_app.config["SALA_CONFIG"].data_dir,
            moment=moment,
            lesson_number=lesson["number"],
            student_id=student["id"],
            student_name=student["name"],
            original_name=name,
            stream=file.stream,
        )
    except uploads.EmptyUpload as error:
        raise auth.ApiError(422, str(error)) from error
    except uploads.UploadTooLarge as error:
        raise auth.ApiError(413, str(error)) from error
    try:
        cursor = connection.execute(
            "INSERT INTO uploads (lesson_number, student_id, original_name, stored_path, size,"
            " created_at) VALUES (?, ?, ?, ?, ?, ?)",
            (lesson["number"], student["id"], name, stored, size, uploads.created_at(moment)),
        )
        connection.commit()
    except BaseException:
        # The row is what makes the file an entrega: a file nobody can list is
        # litter that would push the kid's next upload into ` (2)`.
        uploads.remove_stored_file(current_app.config["SALA_CONFIG"].data_dir, stored)
        raise
    row = connection.execute("SELECT * FROM uploads WHERE id = ?", (cursor.lastrowid,)).fetchone()
    return jsonify(uploads.upload_payload(row)), 201


@bp.get("/my-uploads")
def my_uploads() -> Response:
    """Everything this kid handed in, all aulas, newest first."""
    connection = get_db()
    student = _require_student(connection)
    rows = connection.execute(
        "SELECT * FROM uploads WHERE student_id = ? ORDER BY created_at DESC, id DESC",
        (student["id"],),
    ).fetchall()
    return jsonify([uploads.upload_payload(row) for row in rows])


@bp.get("/uploads/<int:upload_id>/download")
def upload_download(upload_id: int) -> Response:
    """One of this kid's own files as an attachment; anyone else's is a 404."""
    connection = get_db()
    student = current_student(connection)
    row = connection.execute("SELECT * FROM uploads WHERE id = ?", (upload_id,)).fetchone()
    if row is None or student is None or row["student_id"] != student["id"]:
        raise auth.ApiError(404, UPLOAD_NOT_FOUND_MESSAGE)
    return uploads.send_upload(current_app.config["SALA_CONFIG"].data_dir, row)


@bp.get("/sheets")
def sheets_list() -> Response:
    """The folhas of every aula up to the current one."""
    return jsonify(sheets_payload(get_db()))


# --- games -----------------------------------------------------------------


def _visible_game(connection: sqlite3.Connection, game_id: str) -> games.Jogo:
    """One game a kid may see right now, or 404."""
    jogo = games.by_id(game_id)
    if jogo is None or jogo not in games.visible_games(connection):
        raise auth.ApiError(404, games.NOT_FOUND_MESSAGE)
    return jogo


@bp.get("/games")
def games_list() -> Response:
    """The games of the day: all playable ones in free mode, else the active one."""
    connection = get_db()
    return jsonify(
        mode="free" if games.free_mode(connection) else "single",
        games=[games.game_payload(jogo) for jogo in games.visible_games(connection)],
    )


@bp.get("/games/<game_id>")
def game_one(game_id: str) -> Response:
    return jsonify(games.game_payload(_visible_game(get_db(), game_id)))


@bp.get("/games/<game_id>/rom")
@bp.get("/games/<game_id>/rom/<path:filename>")
def game_rom(game_id: str, filename: str | None = None) -> Response:
    """The ROM bytes of a visible game.

    The path never comes from the request: it is the catalogue's own `rom`, and
    `games.rom_file` refuses anything that does not resolve inside `SALA_ROMS`.
    The second rule exists for the emulator, which names the file inside its
    virtual filesystem after the URL's last segment (`games.rom_url`); whatever
    a client puts there is only decoration.
    """
    jogo = _visible_game(get_db(), game_id)
    path = games.rom_file(jogo)
    if jogo.type != games.TYPE_EMULATED or path is None:
        raise auth.ApiError(404, games.NOT_FOUND_MESSAGE)
    response = send_file(path, mimetype="application/octet-stream")
    # A ROM is not something to keep in the browser cache: the teacher may swap
    # the file, and the kid must get what is on disk now.
    response.headers["Cache-Control"] = "no-store"
    return response
