"""Admin API: login/logout, students, lessons, the override and attendance."""

from __future__ import annotations

import dataclasses

import pytest

from app import auth, create_app
from app.auth import CSRF_HEADER


class Clock:
    """Stands in for the `time` module: the login delay is observed, not slept."""

    def __init__(self) -> None:
        self.waited: list[float] = []

    def sleep(self, seconds: float) -> None:
        self.waited.append(seconds)


def _names(body: list[dict]) -> list[str]:
    return [student["name"] for student in body]


# --- session and login -----------------------------------------------------


def test_admin_session_says_nobody_is_logged_in(client, admin_api):
    body = client.get(f"{admin_api}/session").get_json()

    assert body["admin"] is False
    assert body["csrf"]
    assert body["currentLesson"] is None


def test_admin_session_reports_the_current_lesson_and_the_override(admin_client, admin_api, add_lesson, set_override):
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-09-20")
    set_override(1)

    body = admin_client.get(f"{admin_api}/session").get_json()
    assert body["admin"] is True
    assert body["currentLesson"] == {"number": 1, "date": "2026-09-01", "override": True}


def test_login_with_the_right_password(client, csrf_of, admin_api, password):
    token = csrf_of(client, f"{admin_api}/session")

    response = client.post(
        f"{admin_api}/login", json={"password": password}, headers={CSRF_HEADER: token}
    )

    assert response.status_code == 204
    body = client.get(f"{admin_api}/session").get_json()
    assert body["admin"] is True
    assert body["csrf"] != token  # the session was replaced: a fresh token


def test_login_with_the_wrong_password_waits_and_refuses(config, dist_dir, csrf_of, admin_api, monkeypatch):
    slow = dataclasses.replace(config, login_delay=1.5)
    app = create_app(slow, dist_dir=dist_dir)
    app.config["TESTING"] = True
    client = app.test_client()
    clock = Clock()
    monkeypatch.setattr(auth, "time", clock)

    token = csrf_of(client, f"{admin_api}/session")
    response = client.post(
        f"{admin_api}/login", json={"password": "chute"}, headers={CSRF_HEADER: token}
    )

    assert response.status_code == 401
    assert "error" in response.get_json()
    assert clock.waited == [1.5]
    assert client.get(f"{admin_api}/session").get_json()["admin"] is False


def test_login_without_a_password_is_refused(client, csrf_of, admin_api):
    response = client.post(
        f"{admin_api}/login", json={}, headers={CSRF_HEADER: csrf_of(client, f"{admin_api}/session")}
    )
    assert response.status_code == 401


def test_logout_ends_the_admin_session(admin_client, admin_api, csrf_of):
    response = admin_client.post(
        f"{admin_api}/logout", headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")}
    )

    assert response.status_code == 204
    assert admin_client.get(f"{admin_api}/session").get_json()["admin"] is False


# --- students --------------------------------------------------------------


def test_students_lists_everyone_including_the_inactive(admin_client, admin_api, add_student):
    add_student("Carla Teste")
    add_student("ana teste", active=0)

    body = admin_client.get(f"{admin_api}/students").get_json()
    assert [(student["name"], student["active"]) for student in body] == [
        ("ana teste", False),
        ("Carla Teste", True),
    ]


def test_student_add_returns_the_new_student(admin_client, admin_api, csrf_of):
    response = admin_client.post(
        f"{admin_api}/students",
        json={"name": "  Ana   Teste "},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 201
    student = response.get_json()
    assert student["name"] == "Ana Teste"
    assert student["active"] is True
    assert student["id"] > 0
    assert admin_client.get(f"{admin_api}/students").get_json() == [student]


def test_student_add_refuses_a_duplicate_name_ignoring_case(admin_client, admin_api, csrf_of, add_student):
    add_student("Ana Teste")

    response = admin_client.post(
        f"{admin_api}/students",
        json={"name": "ana teste"},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 409
    assert "error" in response.get_json()


@pytest.mark.parametrize("name", ["", "   ", None, 7, "a" * 61])
def test_student_add_refuses_a_bad_name(admin_client, admin_api, csrf_of, name):
    response = admin_client.post(
        f"{admin_api}/students",
        json={"name": name},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )
    assert response.status_code == 422


def test_student_rename(admin_client, admin_api, csrf_of, add_student):
    student = add_student("Ana Teste")

    response = admin_client.patch(
        f"{admin_api}/students/{student}",
        json={"name": "Ana Beatriz Teste"},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 200
    assert response.get_json() == {"id": student, "name": "Ana Beatriz Teste", "active": True}


def test_student_rename_to_a_taken_name_is_409(admin_client, admin_api, csrf_of, add_student):
    add_student("Ana Teste")
    other = add_student("Bruno Teste")

    response = admin_client.patch(
        f"{admin_api}/students/{other}",
        json={"name": "ana teste"},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 409


def test_student_deactivate_hides_it_from_the_public_list(admin_client, client, admin_api, csrf_of, add_student):
    student = add_student("Ana Teste")

    response = admin_client.patch(
        f"{admin_api}/students/{student}",
        json={"active": False},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 200
    assert response.get_json()["active"] is False
    assert client.get("/api/students").get_json() == []
    assert admin_client.get(f"{admin_api}/students").get_json()[0]["active"] is False


def test_student_patch_refuses_a_non_boolean_active(admin_client, admin_api, csrf_of, add_student):
    student = add_student("Ana Teste")

    response = admin_client.patch(
        f"{admin_api}/students/{student}",
        json={"active": 1},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 422


def test_student_patch_that_is_refused_changes_nothing(
    admin_client, admin_api, csrf_of, add_student, db
):
    # Both fields in one request: the 422 is about `active`, and the rename
    # beside it must not have been written before that was noticed.
    student = add_student("Ana Teste")

    response = admin_client.patch(
        f"{admin_api}/students/{student}",
        json={"name": "Zeca Renomeado", "active": 1},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 422
    row = db.execute("SELECT name, active FROM students WHERE id = ?", (student,)).fetchone()
    assert (row["name"], row["active"]) == ("Ana Teste", 1)


def test_student_patch_of_an_unknown_student_is_404(admin_client, admin_api, csrf_of):
    response = admin_client.patch(
        f"{admin_api}/students/999",
        json={"name": "Ana Teste"},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )
    assert response.status_code == 404


def test_student_delete(admin_client, admin_api, csrf_of, add_student):
    student = add_student("Ana Teste")

    response = admin_client.delete(
        f"{admin_api}/students/{student}",
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 204
    assert admin_client.get(f"{admin_api}/students").get_json() == []


def test_student_delete_refuses_one_with_attendance(
    admin_client, admin_api, csrf_of, add_student, add_lesson, add_attendance
):
    student = add_student("Ana Teste")
    add_lesson(1, "2026-09-01")
    add_attendance(1, student)

    response = admin_client.delete(
        f"{admin_api}/students/{student}",
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 409
    assert _names(admin_client.get(f"{admin_api}/students").get_json()) == ["Ana Teste"]


# --- lessons ---------------------------------------------------------------


def test_lessons_are_sorted_by_number(admin_client, admin_api, add_lesson):
    add_lesson(2, "2026-09-20")
    add_lesson(1, "2026-09-01")

    assert admin_client.get(f"{admin_api}/lessons").get_json() == [
        {"number": 1, "date": "2026-09-01"},
        {"number": 2, "date": "2026-09-20"},
    ]


def test_lesson_add_defaults_the_date_to_today(admin_client, admin_api, csrf_of):
    response = admin_client.post(
        f"{admin_api}/lessons",
        json={"number": 3},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 201
    assert response.get_json() == {"number": 3, "date": "2026-09-29"}
    assert admin_client.get(f"{admin_api}/lessons").get_json() == [{"number": 3, "date": "2026-09-29"}]


def test_lesson_add_with_a_date(admin_client, admin_api, csrf_of):
    response = admin_client.post(
        f"{admin_api}/lessons",
        json={"number": 4, "date": "2026-10-05"},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 201
    assert response.get_json() == {"number": 4, "date": "2026-10-05"}


def test_lesson_add_refuses_a_duplicate_number(admin_client, admin_api, csrf_of, add_lesson):
    add_lesson(1, "2026-09-01")

    response = admin_client.post(
        f"{admin_api}/lessons",
        json={"number": 1, "date": "2026-09-02"},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 409
    assert "error" in response.get_json()


@pytest.mark.parametrize("number", [0, -1, "3", 3.0, None, True])
def test_lesson_add_refuses_a_bad_number(admin_client, admin_api, csrf_of, number):
    response = admin_client.post(
        f"{admin_api}/lessons",
        json={"number": number},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )
    assert response.status_code == 422


@pytest.mark.parametrize("day", ["29/09/2026", "2026-13-01", "2026-02-30", "20260929", 7])
def test_lesson_add_refuses_a_bad_date(admin_client, admin_api, csrf_of, day):
    response = admin_client.post(
        f"{admin_api}/lessons",
        json={"number": 1, "date": day},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )
    assert response.status_code == 422


def test_lesson_patch_changes_the_date(admin_client, admin_api, csrf_of, add_lesson):
    add_lesson(1, "2026-09-01")

    response = admin_client.patch(
        f"{admin_api}/lessons/1",
        json={"date": "2026-10-05"},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 200
    assert response.get_json() == {"number": 1, "date": "2026-10-05"}


@pytest.mark.parametrize("payload", [{"date": "29/09/2026"}, {"date": "2026-02-30"}, {}, {"date": None}, {"date": ""}])
def test_lesson_patch_needs_a_good_date(admin_client, admin_api, csrf_of, add_lesson, payload):
    add_lesson(1, "2026-09-01")

    response = admin_client.patch(
        f"{admin_api}/lessons/1",
        json=payload,
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 422
    assert admin_client.get(f"{admin_api}/lessons").get_json() == [{"number": 1, "date": "2026-09-01"}]


def test_lesson_patch_of_an_unknown_lesson_is_404(admin_client, admin_api, csrf_of):
    response = admin_client.patch(
        f"{admin_api}/lessons/9",
        json={"date": "2026-10-05"},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )
    assert response.status_code == 404


def test_lesson_delete(admin_client, admin_api, csrf_of, add_lesson):
    add_lesson(1, "2026-09-01")

    response = admin_client.delete(
        f"{admin_api}/lessons/1", headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")}
    )

    assert response.status_code == 204
    assert admin_client.get(f"{admin_api}/lessons").get_json() == []


def test_lesson_delete_refuses_one_with_attendance(
    admin_client, admin_api, csrf_of, add_student, add_lesson, add_attendance
):
    add_lesson(1, "2026-09-01")
    add_attendance(1, add_student("Ana Teste"))

    response = admin_client.delete(
        f"{admin_api}/lessons/1", headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")}
    )

    assert response.status_code == 409
    assert admin_client.get(f"{admin_api}/lessons").get_json() == [{"number": 1, "date": "2026-09-01"}]


# --- current lesson override -----------------------------------------------


def test_override_is_clear_at_first(admin_client, admin_api):
    assert admin_client.get(f"{admin_api}/override").get_json() == {"lesson": None}


def test_override_wins_over_the_date_and_can_be_cleared(admin_client, admin_api, csrf_of, add_lesson):
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-09-20")
    token = csrf_of(admin_client, f"{admin_api}/session")

    response = admin_client.put(f"{admin_api}/override", json={"lesson": 1}, headers={CSRF_HEADER: token})
    assert response.status_code == 204
    assert admin_client.get(f"{admin_api}/override").get_json() == {"lesson": 1}
    assert admin_client.get("/api/session").get_json()["currentLesson"] == {
        "number": 1,
        "date": "2026-09-01",
    }
    assert admin_client.get(f"{admin_api}/session").get_json()["currentLesson"] == {
        "number": 1,
        "date": "2026-09-01",
        "override": True,
    }

    response = admin_client.put(f"{admin_api}/override", json={"lesson": None}, headers={CSRF_HEADER: token})
    assert response.status_code == 204
    assert admin_client.get(f"{admin_api}/override").get_json() == {"lesson": None}
    assert admin_client.get("/api/session").get_json()["currentLesson"] == {
        "number": 2,
        "date": "2026-09-20",
    }
    assert admin_client.get(f"{admin_api}/session").get_json()["currentLesson"] == {
        "number": 2,
        "date": "2026-09-20",
        "override": False,
    }


def test_override_refuses_a_lesson_that_is_not_registered(admin_client, admin_api, csrf_of, add_lesson):
    add_lesson(1, "2026-09-01")

    response = admin_client.put(
        f"{admin_api}/override",
        json={"lesson": 9},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 422
    assert admin_client.get(f"{admin_api}/override").get_json() == {"lesson": None}


@pytest.mark.parametrize("payload", [{}, {"lesson": "1"}, {"lesson": True}])
def test_override_refuses_a_malformed_body(admin_client, admin_api, csrf_of, add_lesson, payload):
    add_lesson(1, "2026-09-01")

    response = admin_client.put(
        f"{admin_api}/override",
        json=payload,
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 422


# --- attendance ------------------------------------------------------------


def test_attendance_round_trip_with_an_inactive_student_present(
    admin_client, admin_api, csrf_of, add_student, add_lesson
):
    ana = add_student("Ana Teste")
    bruno = add_student("Bruno Teste", active=0)
    add_student("Carla Teste")
    add_lesson(1, "2026-09-01")
    token = csrf_of(admin_client, f"{admin_api}/session")

    response = admin_client.put(
        f"{admin_api}/attendance/1", json={"present": [ana, bruno]}, headers={CSRF_HEADER: token}
    )
    assert response.status_code == 204

    body = admin_client.get(f"{admin_api}/attendance/1").get_json()
    assert body["lesson"] == {"number": 1, "date": "2026-09-01"}
    assert [(student["name"], student["present"]) for student in body["students"]] == [
        ("Ana Teste", True),
        ("Bruno Teste", True),
        ("Carla Teste", False),
    ]

    # Saving again replaces the list: the inactive student is no longer there.
    response = admin_client.put(
        f"{admin_api}/attendance/1", json={"present": [ana, ana]}, headers={CSRF_HEADER: token}
    )
    assert response.status_code == 204

    body = admin_client.get(f"{admin_api}/attendance/1").get_json()
    assert [(student["name"], student["present"]) for student in body["students"]] == [
        ("Ana Teste", True),
        ("Carla Teste", False),
    ]


def test_attendance_put_refuses_an_unknown_student(admin_client, admin_api, csrf_of, add_lesson):
    add_lesson(1, "2026-09-01")

    response = admin_client.put(
        f"{admin_api}/attendance/1",
        json={"present": [999]},
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 422


@pytest.mark.parametrize("payload", [{}, {"present": "Ana"}, {"present": [None]}, {"present": ["1"]}])
def test_attendance_put_refuses_a_malformed_list(admin_client, admin_api, csrf_of, add_lesson, payload):
    add_lesson(1, "2026-09-01")

    response = admin_client.put(
        f"{admin_api}/attendance/1",
        json=payload,
        headers={CSRF_HEADER: csrf_of(admin_client, f"{admin_api}/session")},
    )

    assert response.status_code == 422


def test_attendance_of_an_unknown_lesson_is_404(admin_client, admin_api, csrf_of):
    token = csrf_of(admin_client, f"{admin_api}/session")

    assert admin_client.get(f"{admin_api}/attendance/9").status_code == 404
    assert (
        admin_client.put(f"{admin_api}/attendance/9", json={"present": []}, headers={CSRF_HEADER: token}).status_code
        == 404
    )
