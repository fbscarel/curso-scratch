"""Pontuações (the placar): the score rows, the ranking and the payloads.

A pontuação belongs to one aluno, one aula and one catalogue jogo. How it got
there is the `method`: `auto` is a score our own code reported -- our Pong -- and
is shown at once; `self` is a score the kid typed and waits for the teacher's
approval. Only approved scores count for the placar.

The placar of a jogo answers two questions over the same rows: the top of the
aula atual (the best score of each aluno, best ten) and the all-time record. Both
order ties by the moment the score was reached, so the kid who got there first
keeps the place, and tied kids read the same rank.
"""

from __future__ import annotations

import sqlite3

from . import games
from .auth import ApiError

METHOD_AUTO = "auto"
METHOD_SELF = "self"
METHODS = (METHOD_AUTO, METHOD_SELF)

# The `status` filter of the teacher's list.
STATUS_PENDING = "pending"
STATUS_APPROVED = "approved"
STATUSES = (STATUS_PENDING, STATUS_APPROVED)

SCORE_MIN = 0
SCORE_MAX = 9_999_999
# The limit the way a message writes it in Portuguese: "9.999.999".
SCORE_MAX_TEXT = f"{SCORE_MAX:,}".replace(",", ".")

# How many rows the top of an aula has.
TOP_SIZE = 10

BAD_SCORE_MESSAGE = f"A pontuação precisa ser um número inteiro de 0 a {SCORE_MAX_TEXT}."
BAD_METHOD_MESSAGE = "O campo 'method' precisa ser 'auto' ou 'self'."
AUTO_REFUSED_MESSAGE = "Esse jogo não manda a pontuação sozinho: anote a sua pontuação."
NOT_FOUND_MESSAGE = "Não encontrei essa pontuação."

# The best approved row per aluno, best first: the first row of an aluno is
# therefore their best, and the first of two equal scores is the earlier one.
TOP_SELECT = (
    "SELECT s.student_id, s.score, st.name AS student_name"
    " FROM scores s JOIN students st ON st.id = s.student_id"
    " WHERE s.game_id = ? AND s.lesson_number = ? AND s.approved = 1"
    " ORDER BY s.score DESC, s.created_at ASC, s.id ASC"
)

RECORD_SELECT = (
    "SELECT s.score, s.lesson_number, st.id AS student_id, st.name AS student_name"
    " FROM scores s JOIN students st ON st.id = s.student_id"
    " WHERE s.game_id = ? AND s.approved = 1"
    " ORDER BY s.score DESC, s.created_at ASC, s.id ASC LIMIT 1"
)

PENDING_SELECT = (
    "SELECT id, score, created_at FROM scores"
    " WHERE game_id = ? AND lesson_number = ? AND student_id = ? AND approved = 0"
    " ORDER BY created_at DESC, id DESC"
)

SCORE_SELECT = "SELECT s.*, st.name AS student_name FROM scores s JOIN students st ON st.id = s.student_id"


def check_score(value: object) -> int:
    """The `score` of a request body; 422 when it is not a whole number in range.

    `True` is refused although it is an `int` in Python: a boolean is not a
    pontuação, and the SPA's number input never sends one.
    """
    if isinstance(value, bool) or not isinstance(value, int) or not SCORE_MIN <= value <= SCORE_MAX:
        raise ApiError(422, BAD_SCORE_MESSAGE)
    return value


def check_method(value: object) -> str:
    """The `method` of a request body; 422 when it is neither 'auto' nor 'self'."""
    if value not in METHODS:
        raise ApiError(422, BAD_METHOD_MESSAGE)
    return str(value)


def insert(
    connection: sqlite3.Connection,
    *,
    game_id: str,
    lesson_number: int,
    student_id: int,
    score: int,
    method: str,
    created_at: str,
) -> int:
    """Store one pontuação and return its id.

    The method is also the approval: a score that arrives on its own is shown at
    once, and one the kid typed waits for the teacher.
    """
    cursor = connection.execute(
        "INSERT INTO scores (game_id, lesson_number, student_id, score, method, approved, created_at)"
        " VALUES (?, ?, ?, ?, ?, ?, ?)",
        (
            game_id,
            lesson_number,
            student_id,
            score,
            method,
            1 if method == METHOD_AUTO else 0,
            created_at,
        ),
    )
    return int(cursor.lastrowid)


def top(
    connection: sqlite3.Connection, game_id: str, lesson_number: int, limit: int = TOP_SIZE
) -> list[dict]:
    """The best approved score of each aluno of one aula, best first, best `limit`."""
    best: list[sqlite3.Row] = []
    seen: set[int] = set()
    for row in connection.execute(TOP_SELECT, (game_id, lesson_number)):
        if row["student_id"] not in seen:
            seen.add(row["student_id"])
            best.append(row)
    # A rank counts the alunos ahead, not the row: two kids with the same score
    # share a place, and the next one skips the places the tie used.
    return [
        {
            "rank": 1 + sum(1 for other in best if other["score"] > row["score"]),
            "student": {"id": row["student_id"], "name": row["student_name"]},
            "score": row["score"],
        }
        for row in best[:limit]
    ]


def record(connection: sqlite3.Connection, game_id: str) -> dict | None:
    """The best approved score of a jogo, ever, or None when nobody scored yet."""
    row = connection.execute(RECORD_SELECT, (game_id,)).fetchone()
    if row is None:
        return None
    return {
        "score": row["score"],
        "student": {"id": row["student_id"], "name": row["student_name"]},
        "lessonNumber": row["lesson_number"],
    }


def my_pending(
    connection: sqlite3.Connection, game_id: str, lesson_number: int, student_id: int
) -> list[dict]:
    """The pontuações this aluno is still waiting for the teacher to approve."""
    rows = connection.execute(PENDING_SELECT, (game_id, lesson_number, student_id)).fetchall()
    return [{"id": row["id"], "score": row["score"], "createdAt": row["created_at"]} for row in rows]


def scoreboard(
    connection: sqlite3.Connection,
    *,
    game_id: str,
    lesson_number: int | None,
    student_id: int | None,
) -> dict:
    """The placar of one jogo: the record, the top of the aula and my waiting ones.

    Without an aula atual there is no top of the aula and nothing to wait for;
    the record is the one line that does not belong to an aula.
    """
    return {
        "record": record(connection, game_id),
        "top": [] if lesson_number is None else top(connection, game_id, lesson_number),
        "myPending": (
            []
            if lesson_number is None or student_id is None
            else my_pending(connection, game_id, lesson_number, student_id)
        ),
    }


def admin_payload(row: sqlite3.Row) -> dict:
    """The teacher's shape of one pontuação, with the jogo and the aluno on it."""
    jogo = games.by_id(row["game_id"])
    return {
        "id": row["id"],
        # A pontuação outlives the catalogue entry it was made in (a jogo the
        # teacher drops from jogos.yml): the id is all there is left to show.
        "game": {
            "id": row["game_id"],
            "title": jogo.title if jogo is not None else row["game_id"],
        },
        "student": {"id": row["student_id"], "name": row["student_name"]},
        "lessonNumber": row["lesson_number"],
        "score": row["score"],
        "method": row["method"],
        "approved": bool(row["approved"]),
        "createdAt": row["created_at"],
    }
