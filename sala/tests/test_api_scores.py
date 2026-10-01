"""The pontuações: posting a score, the placar of a jogo and the teacher's list.

Pong is the game of these tests: it is our own page, so it is playable with no
ROM and no emulator, and it is the only game whose score arrives on its own.
"""

from __future__ import annotations

import pytest

from app import scores
from app.auth import CSRF_HEADER

POST = "/api/scores"
SCOREBOARD = "/api/games/{game_id}/scoreboard"
ADMIN_SCORES = "/scores"

ANA = "Ana Teste"
BRUNO = "Bruno Teste"
CARLA = "Carla Teste"

# The aula the suite is on: TODAY is 2026-09-29, so the latest date wins.
CURRENT = 2


@pytest.fixture
def pong(client, add_lesson, set_game_mode) -> int:
    """A registered aula and Pong as the game of the day; returns the aula number."""
    add_lesson(1, "2026-09-01")
    add_lesson(CURRENT, "2026-09-20")
    set_game_mode(active="pong")
    return CURRENT


def scoreboard(client, game_id: str = "pong") -> dict:
    response = client.get(SCOREBOARD.format(game_id=game_id))
    assert response.status_code == 200
    return response.get_json()


def post(client, token: str, *, game_id: str = "pong", score: int, method: str = "auto"):
    return client.post(
        POST,
        json={"gameId": game_id, "score": score, "method": method},
        headers={CSRF_HEADER: token},
    )


def rows(db) -> list:
    return db.execute("SELECT * FROM scores ORDER BY id").fetchall()


# --- posting a score -------------------------------------------------------


def test_a_score_the_game_reported_is_approved_at_once(client, db, add_student, as_student, pong):
    student = add_student(ANA)
    token = as_student(client, student)

    response = post(client, token, score=7)

    assert response.status_code == 201
    assert response.get_json() == {"id": rows(db)[0]["id"], "score": 7, "approved": True}
    row = rows(db)[0]
    assert (row["game_id"], row["lesson_number"], row["student_id"]) == ("pong", pong, student)
    assert (row["method"], row["approved"]) == ("auto", 1)
    assert row["created_at"] == "2026-09-29 14:32:05"


def test_a_score_the_kid_typed_waits_for_the_teacher(client, db, add_student, as_student, pong):
    token = as_student(client, add_student(ANA))

    response = post(client, token, score=3, method="self")

    assert response.status_code == 201
    assert response.get_json()["approved"] is False
    assert (rows(db)[0]["method"], rows(db)[0]["approved"]) == ("self", 0)


def test_a_score_the_game_cannot_report_is_refused(
    client, db, add_student, as_student, install_games, add_lesson, set_game_mode
):
    # Sonic has no `score` block, so nobody can say where its score lives: an
    # `auto` report of it would be a number nobody counted, so it is refused and
    # nothing is stored.
    add_lesson(1, "2026-09-01")
    install_games("sonic")
    set_game_mode(active="sonic")
    token = as_student(client, add_student(ANA))

    response = post(client, token, game_id="sonic", score=5)

    assert response.status_code == 422
    assert response.get_json() == {"error": scores.AUTO_REFUSED_MESSAGE}
    assert rows(db) == []


@pytest.mark.parametrize(
    "game_id",
    [
        "enduro",
        "space-invaders",
        "river-raid",
        "pitfall",
        "frogger",
        "galaga",
        "ms-pac-man",
        "donkey-kong",
        "kaboom",
    ],
)
def test_a_score_an_emulated_game_reported_is_approved_at_once(
    client, db, add_student, as_student, install_games, add_lesson, set_game_mode, game_id
):
    # These games carry a `score` block (the play page reads their RAM), so
    # their auto report is taken like the one our own page sends.
    add_lesson(1, "2026-09-01")
    install_games(game_id)
    set_game_mode(active=game_id)
    token = as_student(client, add_student(ANA))

    response = post(client, token, game_id=game_id, score=1580)

    assert response.status_code == 201
    assert response.get_json()["approved"] is True
    assert (rows(db)[0]["game_id"], rows(db)[0]["method"], rows(db)[0]["approved"]) == (
        game_id,
        "auto",
        1,
    )


def test_a_self_report_is_taken_for_any_visible_game(
    client, db, add_student, as_student, install_games, add_lesson, set_game_mode
):
    add_lesson(1, "2026-09-01")
    install_games("enduro")
    set_game_mode(active="enduro")
    token = as_student(client, add_student(ANA))

    response = post(client, token, game_id="enduro", score=5, method="self")

    assert response.status_code == 201
    assert rows(db)[0]["game_id"] == "enduro"


@pytest.mark.parametrize("value", [-1, 10_000_000, "10", 10.5, True, False, None])
def test_a_score_out_of_range_or_not_a_whole_number_is_refused(
    client, db, add_student, as_student, pong, value
):
    token = as_student(client, add_student(ANA))

    response = post(client, token, score=value)

    assert response.status_code == 422
    assert response.get_json() == {"error": scores.BAD_SCORE_MESSAGE}
    assert rows(db) == []


@pytest.mark.parametrize("value", [0, scores.SCORE_MAX])
def test_the_ends_of_the_range_are_accepted(client, db, add_student, as_student, pong, value):
    token = as_student(client, add_student(ANA))

    assert post(client, token, score=value).status_code == 201


@pytest.mark.parametrize("value", ["manual", "AUTO", None, 5, ["auto"]])
def test_an_unknown_method_is_refused(client, db, add_student, as_student, pong, value):
    token = as_student(client, add_student(ANA))

    response = client.post(
        POST, json={"gameId": "pong", "score": 1, "method": value}, headers={CSRF_HEADER: token}
    )

    assert response.status_code == 422
    assert response.get_json() == {"error": scores.BAD_METHOD_MESSAGE}
    assert rows(db) == []


def test_a_score_without_a_name_is_409(client, db, pong, csrf_of):
    response = post(client, csrf_of(client), score=4)

    assert response.status_code == 409
    assert rows(db) == []


def test_a_score_without_an_aula_is_409(client, db, add_student, as_student, set_game_mode):
    set_game_mode(active="pong")
    token = as_student(client, add_student(ANA))

    response = post(client, token, score=4)

    assert response.status_code == 409
    assert "aula" in response.get_json()["error"]
    assert rows(db) == []


def test_a_score_of_a_game_the_mode_does_not_offer_is_404(
    client, db, add_student, as_student, install_games, add_lesson, set_game_mode
):
    add_lesson(1, "2026-09-01")
    install_games()
    set_game_mode(active="enduro")
    token = as_student(client, add_student(ANA))

    assert post(client, token, score=4).status_code == 404  # pong, not the active game
    assert post(client, token, game_id="nao-existe", score=4).status_code == 404
    assert rows(db) == []


def test_a_score_of_a_game_that_cannot_run_is_404(
    client, db, add_student, as_student, roms, add_lesson, set_game_mode
):
    # Free mode offers Enduro, but without its ROM there is nothing to play.
    add_lesson(1, "2026-09-01")
    set_game_mode(free=True)
    token = as_student(client, add_student(ANA))

    assert post(client, token, game_id="enduro", score=4).status_code == 404
    assert rows(db) == []


# --- the placar ------------------------------------------------------------


def test_the_placar_of_a_game_nobody_scored_in(client, add_student, as_student, pong):
    as_student(client, add_student(ANA))

    assert scoreboard(client) == {"record": None, "top": [], "myPending": []}


def test_the_top_is_the_aula_of_today_only_and_the_best_score_of_each_aluno(
    client, add_student, add_score, as_student, pong
):
    ana = add_student(ANA)
    bruno = add_student(BRUNO)
    add_score("pong", CURRENT, ana, 5, method="auto", approved=1)
    add_score("pong", CURRENT, ana, 9)  # waiting for the teacher: not in the top
    add_score("pong", 1, bruno, 99, method="auto", approved=1)  # another aula
    add_score("pong", CURRENT, bruno, 3, method="auto", approved=1)
    as_student(client, ana)

    assert scoreboard(client)["top"] == [
        {"rank": 1, "student": {"id": ana, "name": ANA}, "score": 5},
        {"rank": 2, "student": {"id": bruno, "name": BRUNO}, "score": 3},
    ]


def test_tied_scores_share_a_rank_and_the_earlier_one_comes_first(
    client, add_student, add_score, as_student, pong
):
    ana = add_student(ANA)
    bruno = add_student(BRUNO)
    carla = add_student(CARLA)
    add_score("pong", CURRENT, bruno, 4, created_at="2026-09-29 09:00:00", method="auto", approved=1)
    add_score("pong", CURRENT, ana, 4, created_at="2026-09-29 08:00:00", method="auto", approved=1)
    add_score("pong", CURRENT, carla, 6, created_at="2026-09-29 10:00:00", method="auto", approved=1)

    top = scoreboard(client)["top"]

    assert [(row["rank"], row["student"]["name"], row["score"]) for row in top] == [
        (1, CARLA, 6),
        (2, ANA, 4),
        (2, BRUNO, 4),
    ]


def test_the_tie_break_is_the_moment_the_best_score_was_reached(
    client, add_student, add_score, as_student, pong
):
    # Ana reached 6 later than Bruno, although she was already playing before
    # him: what the placar orders is the score that counts, not the first game.
    ana = add_student(ANA)
    bruno = add_student(BRUNO)
    add_score("pong", CURRENT, ana, 2, created_at="2026-09-29 08:00:00", method="auto", approved=1)
    add_score("pong", CURRENT, bruno, 6, created_at="2026-09-29 09:00:00", method="auto", approved=1)
    add_score("pong", CURRENT, ana, 6, created_at="2026-09-29 10:00:00", method="auto", approved=1)

    top = scoreboard(client)["top"]

    assert [(row["student"]["name"], row["score"]) for row in top] == [(BRUNO, 6), (ANA, 6)]


def test_the_top_stops_at_ten_alunos(client, add_student, add_score, as_student, pong):
    for position in range(12):
        student = add_student(f"{ANA} {position}")
        add_score("pong", CURRENT, student, position, method="auto", approved=1)
    as_student(client, add_student(ANA))

    top = scoreboard(client)["top"]

    assert len(top) == scores.TOP_SIZE
    assert [row["score"] for row in top] == list(range(11, 1, -1))
    assert [row["rank"] for row in top] == list(range(1, 11))


def test_the_record_is_the_best_score_ever_and_the_earliest_wins_a_tie(
    client, add_student, add_score, as_student, pong
):
    ana = add_student(ANA)
    bruno = add_student(BRUNO)
    add_score("pong", 1, ana, 50, created_at="2026-09-01 10:00:00", method="auto", approved=1)
    add_score("pong", CURRENT, bruno, 50, created_at="2026-09-20 10:00:00", method="auto", approved=1)
    add_score("pong", CURRENT, bruno, 999)  # waiting for the teacher
    as_student(client, bruno)

    assert scoreboard(client)["record"] == {
        "score": 50,
        "student": {"id": ana, "name": ANA},
        "lessonNumber": 1,
    }


def test_my_pending_is_only_mine_and_only_this_aula(
    client, add_student, add_score, as_student, pong
):
    ana = add_student(ANA)
    bruno = add_student(BRUNO)
    older = add_score("pong", CURRENT, ana, 4, created_at="2026-09-29 09:00:00")
    newer = add_score("pong", CURRENT, ana, 7, created_at="2026-09-29 10:00:00")
    add_score("pong", 1, ana, 8)
    add_score("pong", CURRENT, ana, 3, method="auto", approved=1)  # already approved
    add_score("pong", CURRENT, bruno, 6)
    as_student(client, ana)

    assert scoreboard(client)["myPending"] == [
        {"id": newer, "score": 7, "createdAt": "2026-09-29 10:00:00"},
        {"id": older, "score": 4, "createdAt": "2026-09-29 09:00:00"},
    ]


def test_my_pending_is_empty_without_a_name(client, add_student, add_score, pong):
    add_score("pong", CURRENT, add_student(ANA), 4)

    assert scoreboard(client)["myPending"] == []


def test_the_override_picks_the_aula_of_the_top(
    client, add_student, add_score, as_student, set_override, pong
):
    ana = add_student(ANA)
    bruno = add_student(BRUNO)
    add_score("pong", 1, ana, 8, method="auto", approved=1)
    add_score("pong", CURRENT, bruno, 5, method="auto", approved=1)
    set_override(1)

    top = scoreboard(client)["top"]

    assert [(row["student"]["name"], row["score"]) for row in top] == [(ANA, 8)]
    assert scoreboard(client)["record"]["score"] == 8


def test_without_an_aula_of_today_the_top_is_empty_but_the_record_is_there(
    client, add_student, add_score, as_student, add_lesson, set_game_mode
):
    add_lesson(1, "2026-12-01")  # a aula that has not happened yet
    set_game_mode(active="pong")
    ana = add_student(ANA)
    add_score("pong", 1, ana, 12, method="auto", approved=1)
    as_student(client, ana)

    assert scoreboard(client) == {
        "record": {"score": 12, "student": {"id": ana, "name": ANA}, "lessonNumber": 1},
        "top": [],
        "myPending": [],
    }


def test_the_placar_of_a_game_the_mode_does_not_offer_is_404(
    client, add_lesson, set_game_mode, install_games
):
    add_lesson(1, "2026-09-01")
    install_games()
    set_game_mode(active="enduro")

    assert client.get(SCOREBOARD.format(game_id="pong")).status_code == 404
    assert client.get(SCOREBOARD.format(game_id="nao-existe")).status_code == 404


# --- the teacher's list, approval and removal ------------------------------


def test_approving_a_self_report_puts_it_on_the_placar(
    client, admin_client, admin_api, csrf_of, add_student, add_score, as_student, pong
):
    ana = add_student(ANA)
    pending = add_score("pong", CURRENT, ana, 6)
    as_student(client, ana)
    assert scoreboard(client)["top"] == []

    response = admin_client.put(
        f"{admin_api}{ADMIN_SCORES}/{pending}/approval",
        json={"approved": True},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 204
    assert scoreboard(client)["top"] == [
        {"rank": 1, "student": {"id": ana, "name": ANA}, "score": 6}
    ]


def test_the_teacher_can_take_an_approval_back(
    client, admin_client, admin_api, csrf_of, add_student, add_score, as_student, pong
):
    ana = add_student(ANA)
    approved = add_score("pong", CURRENT, ana, 6, method="auto", approved=1)
    as_student(client, ana)

    response = admin_client.put(
        f"{admin_api}{ADMIN_SCORES}/{approved}/approval",
        json={"approved": False},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 204
    assert scoreboard(client)["top"] == []
    assert scoreboard(client)["myPending"] == [
        {"id": approved, "score": 6, "createdAt": "2026-09-29 10:00:00"}
    ]


def test_the_teacher_removes_a_score(
    client, db, admin_client, admin_api, csrf_of, add_student, add_score, as_student, pong
):
    ana = add_student(ANA)
    pending = add_score("pong", CURRENT, ana, 6)
    as_student(client, ana)
    token = csrf_of(admin_client, f"{admin_api}/session")

    response = admin_client.delete(f"{admin_api}{ADMIN_SCORES}/{pending}", headers={CSRF_HEADER: token})

    assert response.status_code == 204
    assert rows(db) == []
    assert scoreboard(client) == {"record": None, "top": [], "myPending": []}
    again = admin_client.delete(f"{admin_api}{ADMIN_SCORES}/{pending}", headers={CSRF_HEADER: token})
    assert again.status_code == 404


@pytest.mark.parametrize("value", [1, "true", None])
def test_an_approval_that_is_not_a_boolean_is_refused(
    admin_client, admin_api, csrf_of, db, add_student, add_score, pong, value
):
    pending = add_score("pong", CURRENT, add_student(ANA), 6)

    response = admin_client.put(
        f"{admin_api}{ADMIN_SCORES}/{pending}/approval",
        json={"approved": value},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 422
    assert rows(db)[0]["approved"] == 0


def test_approving_an_unknown_score_is_404(admin_client, admin_api, csrf_of):
    response = admin_client.put(
        f"{admin_api}{ADMIN_SCORES}/999/approval",
        json={"approved": True},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 404
    assert response.get_json() == {"error": scores.NOT_FOUND_MESSAGE}


def test_the_teacher_list_has_the_jogo_the_aluno_and_the_method(
    admin_client, admin_api, add_student, add_score, pong
):
    ana = add_student(ANA)
    add_score("pong", CURRENT, ana, 6, method="auto", approved=1, created_at="2026-09-29 09:00:00")
    add_score("pong", CURRENT, ana, 4, created_at="2026-09-29 10:00:00")

    body = admin_client.get(f"{admin_api}{ADMIN_SCORES}").get_json()

    assert [row["score"] for row in body] == [4, 6]  # newest first
    assert body[0] == {
        "id": body[0]["id"],
        "game": {"id": "pong", "title": "Pong"},
        "student": {"id": ana, "name": ANA},
        "lessonNumber": CURRENT,
        "score": 4,
        "method": "self",
        "approved": False,
        "createdAt": "2026-09-29 10:00:00",
    }
    assert body[1]["approved"] is True and body[1]["method"] == "auto"


def test_the_teacher_list_filters(admin_client, admin_api, add_student, add_score, pong):
    ana = add_student(ANA)
    bruno = add_student(BRUNO)
    add_score("pong", CURRENT, ana, 6, method="auto", approved=1)
    add_score("pong", CURRENT, ana, 4)
    add_score("pong", 1, bruno, 9)
    add_score("enduro", CURRENT, bruno, 2)
    url = f"{admin_api}{ADMIN_SCORES}"

    def scores_of(query: str) -> list[tuple]:
        body = admin_client.get(f"{url}?{query}").get_json()
        return [(row["game"]["id"], row["student"]["name"], row["score"]) for row in body]

    assert len(admin_client.get(url).get_json()) == 4
    assert scores_of("status=pending") == [("enduro", BRUNO, 2), ("pong", BRUNO, 9), ("pong", ANA, 4)]
    assert scores_of("status=approved") == [("pong", ANA, 6)]
    assert scores_of(f"lesson={CURRENT}") == [("enduro", BRUNO, 2), ("pong", ANA, 4), ("pong", ANA, 6)]
    assert scores_of("game=enduro") == [("enduro", BRUNO, 2)]
    assert scores_of("game=pong&status=approved") == [("pong", ANA, 6)]


@pytest.mark.parametrize("query", ["status=nada", "status=1", "lesson=0", "lesson=x"])
def test_the_teacher_list_refuses_a_bad_filter(admin_client, admin_api, query):
    response = admin_client.get(f"{admin_api}{ADMIN_SCORES}?{query}")

    assert response.status_code == 422
    assert "error" in response.get_json()


def test_a_score_of_a_game_that_left_the_catalogue_keeps_its_id(
    admin_client, admin_api, add_student, add_score, pong
):
    add_score("jogo-que-saiu", CURRENT, add_student(ANA), 6, method="auto", approved=1)

    body = admin_client.get(f"{admin_api}{ADMIN_SCORES}").get_json()

    assert body[0]["game"] == {"id": "jogo-que-saiu", "title": "jogo-que-saiu"}


# --- the rows a student or an aula cannot be deleted with ------------------


def test_a_student_with_a_pontuacao_cannot_be_deleted(
    admin_client, admin_api, csrf_of, add_student, add_score, pong
):
    ana = add_student(ANA)
    add_score("pong", CURRENT, ana, 6)

    response = admin_client.delete(
        f"{admin_api}/students/{ana}", headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")}
    )

    assert response.status_code == 409
    assert "pontuaç" in response.get_json()["error"]


def test_an_aula_with_a_pontuacao_cannot_be_deleted(
    admin_client, admin_api, csrf_of, add_student, add_score, pong
):
    add_score("pong", CURRENT, add_student(ANA), 6)

    response = admin_client.delete(
        f"{admin_api}/lessons/{CURRENT}",
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 409
    assert "pontuaç" in response.get_json()["error"]
