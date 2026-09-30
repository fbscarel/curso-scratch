"""The app-wide rules, driven by the URL map instead of a test per route.

A route added later is covered the moment it is registered: under the admin API
it must answer 401 without a login, and any non-GET route anywhere in the app
must answer 400 without — or with a wrong — CSRF token. Every response, whatever
its status, refuses type sniffing.

The set of routes each rule covers is written out below rather than counted: a
floor ("at least ten were checked") passes on a smaller app, which is exactly
what a route that vanished produces, while a set that has to match the URL map
makes the removal — and the addition — a hard failure.
"""

from __future__ import annotations

import re

from app.auth import CSRF_ERROR_CODE, CSRF_HEADER

# `<int:student_id>` / `<path:path>` — whatever a route needs, "1" stands in.
CONVERTER = re.compile(r"<(?:\w+:)?\w+>")
LOGIN_FREE_ENDPOINTS = {"api_admin.session_info", "api_admin.login"}
WRONG_TOKEN = "token-que-nao-e-desta-sessao"

# Every method behind the login, relative to `<admin>/api` (the admin path comes
# from the config the app was built with).
EXPECTED_ADMIN_GUARDED = {
    ("POST", "/logout"),
    ("GET", "/students"),
    ("POST", "/students"),
    ("PATCH", "/students/1"),
    ("DELETE", "/students/1"),
    ("GET", "/lessons"),
    ("POST", "/lessons"),
    ("PATCH", "/lessons/1"),
    ("DELETE", "/lessons/1"),
    ("GET", "/override"),
    ("PUT", "/override"),
    ("GET", "/attendance/1"),
    ("PUT", "/attendance/1"),
    ("GET", "/uploads"),
    ("GET", "/uploads/1/download"),
    ("PATCH", "/uploads/1"),
    ("GET", "/uploads/lesson/1.zip"),
    ("GET", "/games"),
    ("PUT", "/games/mode"),
}

# Every non-GET method of the whole app, public and admin alike; the admin ones
# are written relative to `<admin>/api` like `EXPECTED_ADMIN_GUARDED` above.
EXPECTED_NON_GET = {
    ("PUT", "/api/identity"),
    ("DELETE", "/api/identity"),
    ("POST", "/login"),
    ("POST", "/logout"),
    ("POST", "/students"),
    ("PATCH", "/students/1"),
    ("DELETE", "/students/1"),
    ("POST", "/lessons"),
    ("PATCH", "/lessons/1"),
    ("DELETE", "/lessons/1"),
    ("PUT", "/override"),
    ("PUT", "/attendance/1"),
    ("POST", "/api/uploads"),
    ("PATCH", "/uploads/1"),
    ("PUT", "/games/mode"),
}


def _url(rule) -> str:
    return CONVERTER.sub("1", str(rule))


def _methods(rule) -> list[str]:
    return sorted(rule.methods - {"HEAD", "OPTIONS"})


def _admin_relative(url: str, admin_api: str) -> str:
    """`<admin>/api/x` as `/x`; a public URL is left as it is."""
    if url.startswith(admin_api + "/"):
        return url[len(admin_api) :]
    return url


def test_admin_api_without_a_login_is_401(app, client, csrf_of):
    admin_api = app.config["SALA_CONFIG"].admin_path + "/api"
    token = csrf_of(client, f"{admin_api}/session")
    checked = set()
    for rule in app.url_map.iter_rules():
        if not str(rule).startswith(f"{admin_api}/") or rule.endpoint in LOGIN_FREE_ENDPOINTS:
            continue
        for method in _methods(rule):
            response = client.open(_url(rule), method=method, headers={CSRF_HEADER: token})
            assert response.status_code == 401, f"{method} {rule} devia pedir login"
            assert "error" in response.get_json(), f"{method} {rule} devia ser um erro JSON"
            checked.add((method, _admin_relative(_url(rule), admin_api)))
    assert checked == EXPECTED_ADMIN_GUARDED


def test_every_non_get_route_needs_the_csrf_token(app, client, csrf_of):
    admin_api = app.config["SALA_CONFIG"].admin_path + "/api"
    # One token per session: the public and the admin routes hand out the same one.
    token = csrf_of(client, "/api/session")
    assert csrf_of(client, f"{admin_api}/session") == token

    checked = set()
    for rule in app.url_map.iter_rules():
        for method in (m for m in _methods(rule) if m != "GET"):
            url = _url(rule)
            without = client.open(url, method=method)
            assert without.status_code == 400, f"{method} {url} sem token"
            assert "error" in without.get_json(), f"{method} {url} devia ser um erro JSON"
            # The SPA tells a stale token from any other malformed request by
            # this code: it is what makes it read the session again and retry.
            assert without.get_json()["code"] == CSRF_ERROR_CODE, f"{method} {url} sem token"
            wrong = client.open(url, method=method, headers={CSRF_HEADER: WRONG_TOKEN})
            assert wrong.status_code == 400, f"{method} {url} com token errado"
            assert wrong.get_json()["code"] == CSRF_ERROR_CODE, f"{method} {url} com token errado"
            checked.add((method, _admin_relative(url, admin_api)))
    assert checked == EXPECTED_NON_GET


def test_every_response_refuses_to_be_sniffed(
    app, client, add_student, add_lesson, as_student, upload_file
):
    # A kid's upload is served as an attachment, but a browser that guesses a
    # type could still render it as this origin: the header is on every answer,
    # pages, JSON, assets and errors alike.
    admin_api = app.config["SALA_CONFIG"].admin_path + "/api"
    add_lesson(1, "2026-09-01")
    token = as_student(client, add_student("Ana Teste"))
    assert upload_file(client, token, "jogo.sb3", b"abc").headers[
        "X-Content-Type-Options"
    ] == "nosniff"
    upload_id = client.get("/api/my-uploads").get_json()[0]["id"]

    for url in (
        "/",
        "/assets/app.js",
        "/api/session",
        "/api/nao-existe",
        "/professor-teste",
        f"{admin_api}/session",
        f"{admin_api}/uploads",
        f"/api/uploads/{upload_id}/download",
        "/emulador/play",
        "/emulador/play.js",
    ):
        response = client.get(url)
        assert response.headers["X-Content-Type-Options"] == "nosniff", url
