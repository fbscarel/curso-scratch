"""Public API: the session, the student list and the identity flow."""

from __future__ import annotations

import pytest

from app.auth import CSRF_HEADER

SESSION = "/api/session"
STUDENTS = "/api/students"
IDENTITY = "/api/identity"


def test_session_starts_without_a_student_and_hands_out_a_token(client):
    body = client.get(SESSION).get_json()
    assert body["csrf"]
    assert body["student"] is None
    assert body["currentLesson"] is None


def test_session_keeps_the_same_token(client):
    assert client.get(SESSION).get_json()["csrf"] == client.get(SESSION).get_json()["csrf"]


def test_the_session_cookie_is_httponly_strict_and_not_permanent(client):
    cookie = client.get(SESSION).headers["Set-Cookie"]

    assert "HttpOnly" in cookie
    assert "SameSite=Strict" in cookie
    assert "Expires=" not in cookie
    assert "Max-Age=" not in cookie


def test_students_is_empty_without_anyone(client):
    assert client.get(STUDENTS).get_json() == []


def test_students_lists_only_the_active_ones_sorted_by_name(client, add_student):
    add_student("Carla Teste")
    add_student("ana teste")
    add_student("Bruno Teste", active=0)

    body = client.get(STUDENTS).get_json()
    assert [student["name"] for student in body] == ["ana teste", "Carla Teste"]
    assert all(isinstance(student["id"], int) for student in body)


def test_session_reports_the_current_lesson(client, add_lesson):
    add_lesson(1, "2026-09-01")
    add_lesson(2, "2026-09-20")
    add_lesson(3, "2026-10-02")

    assert client.get(SESSION).get_json()["currentLesson"] == {"number": 2, "date": "2026-09-20"}


def test_identity_put_remembers_the_student(client, csrf_of, add_student):
    student = add_student("Ana Teste")
    response = client.put(
        IDENTITY, json={"studentId": student}, headers={CSRF_HEADER: csrf_of(client)}
    )

    assert response.status_code == 204
    assert client.get(SESSION).get_json()["student"] == {"id": student, "name": "Ana Teste"}


def test_identity_put_refuses_an_inactive_student(client, csrf_of, add_student):
    student = add_student("Ana Teste", active=0)
    response = client.put(
        IDENTITY, json={"studentId": student}, headers={CSRF_HEADER: csrf_of(client)}
    )

    assert response.status_code == 422
    assert "error" in response.get_json()
    assert client.get(SESSION).get_json()["student"] is None


@pytest.mark.parametrize(
    "payload",
    [{"studentId": 999}, {}, {"studentId": "1"}, {"studentId": None}, {"studentId": True}, {"studentId": 1.0}],
)
def test_identity_put_refuses_anything_that_is_not_a_student(client, csrf_of, add_student, payload):
    add_student("Ana Teste")
    response = client.put(IDENTITY, json=payload, headers={CSRF_HEADER: csrf_of(client)})
    assert response.status_code == 422


def test_identity_delete_forgets_the_student(client, csrf_of, add_student):
    student = add_student("Ana Teste")
    client.put(IDENTITY, json={"studentId": student}, headers={CSRF_HEADER: csrf_of(client)})

    response = client.delete(IDENTITY, headers={CSRF_HEADER: csrf_of(client)})

    assert response.status_code == 204
    assert client.get(SESSION).get_json()["student"] is None


def test_identity_delete_without_a_student_is_fine(client, csrf_of):
    assert client.delete(IDENTITY, headers={CSRF_HEADER: csrf_of(client)}).status_code == 204


def test_session_forgets_a_student_that_was_deactivated(client, csrf_of, add_student, db):
    student = add_student("Ana Teste")
    client.put(IDENTITY, json={"studentId": student}, headers={CSRF_HEADER: csrf_of(client)})

    db.execute("UPDATE students SET active = 0 WHERE id = ?", (student,))
    db.commit()

    assert client.get(SESSION).get_json()["student"] is None
