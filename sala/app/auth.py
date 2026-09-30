"""The JSON protocol of the API: CSRF, the admin session and the error bodies.

Every non-GET request of the whole app (public and admin) must carry the header
`X-CSRF-Token` with the token of its session — handed out by `GET /api/session`
and `GET <admin>/api/session` and created on first use — else 400. The admin
session is opened by `login` and required by `admin_required`, which answers 401.

Errors are `{"error": "<pt-BR message>"}`: `ApiError` carries the message of
everything the API itself refuses; Flask's own errors (a 405, say) are turned
into the same shape for the API paths. A refusal the client has to act on rather
than show also carries a `code` (see `CSRF_ERROR_CODE`), and an error on a page
outside the API is a short pt-BR text/html body instead of Flask's English one.
"""

from __future__ import annotations

import functools
import hmac
import secrets
import time
from collections.abc import Callable
from typing import Any

from flask import Flask, Response, current_app, jsonify, request, session
from werkzeug.exceptions import HTTPException

CSRF_SESSION_KEY = "csrf_token"
CSRF_HEADER = "X-CSRF-Token"
ADMIN_SESSION_KEY = "admin"

# The `code` a refused CSRF token carries. It is what the SPA reads to tell a
# stale token (its own session changed under it, so the answer is a new token)
# from a request that was malformed for any other reason.
CSRF_ERROR_CODE = "csrf"

MISSING_CSRF_MESSAGE = "Requisição inválida: falta o token do formulário (X-CSRF-Token)."
WRONG_CSRF_MESSAGE = "Requisição inválida: token do formulário errado."
MALFORMED_BODY_MESSAGE = "Requisição inválida: corpo JSON ausente ou malformado."
NOT_ADMIN_MESSAGE = "Entre como professor para fazer isso."

# pt-BR messages for the errors Flask raises by itself (405, …) under the API.
DEFAULT_ERRORS: dict[int, str] = {
    400: "Requisição inválida.",
    401: "Entre como professor para fazer isso.",
    403: "Você não pode fazer isso.",
    404: "Não encontrei isso.",
    405: "Esse endereço não aceita esse tipo de pedido.",
    409: "Isso já existe ou está em uso.",
    413: "Arquivo grande demais.",
    422: "Dados inválidos.",
    500: "Algo deu errado no servidor.",
}

# pt-BR messages for the same errors on a page (see `handle_http_error`). The
# statuses named here have wording of their own; any other 4xx/5xx falls back to
# `GENERIC_PAGE_ERROR`, because a kid or the teacher still has to read it.
PAGE_ERRORS: dict[int, str] = {
    400: "Pedido inválido.",
    403: "Você não pode fazer isso.",
    404: "Não encontrei essa página.",
    405: "Esse endereço não aceita esse tipo de pedido.",
    413: "Arquivo grande demais.",
    500: "Algo deu errado no servidor.",
}
GENERIC_PAGE_ERROR = "Algo deu errado (erro {code})."


class ApiError(Exception):
    """A refusal of the JSON API: the HTTP status, the pt-BR message and a code.

    `code` is the machine-readable half of the refusal, sent beside the message
    when the client has to act on the KIND of refusal rather than show the text
    (the SPA re-reads its CSRF token on `code: "csrf"`). Everything else leaves
    it None and the body is `{"error": …}` alone.
    """

    def __init__(self, status: int, message: str, code: str | None = None) -> None:
        super().__init__(message)
        self.status = status
        self.message = message
        self.code = code


def csrf_token() -> str:
    """The CSRF token of this session, created on first use."""
    token = session.get(CSRF_SESSION_KEY)
    if not token:
        token = secrets.token_urlsafe(32)
        session[CSRF_SESSION_KEY] = token
    return str(token)


def check_csrf() -> None:
    """Refuse a non-GET request that does not carry this session's token."""
    expected = session.get(CSRF_SESSION_KEY)
    given = request.headers.get(CSRF_HEADER, "")
    if not expected or not given:
        raise ApiError(400, MISSING_CSRF_MESSAGE, CSRF_ERROR_CODE)
    # As bytes: `hmac.compare_digest` refuses a str that is not ASCII (it raises
    # TypeError), and a header is whatever the client sent -- a token with an
    # accent in it is a wrong token, which is a 400, not a 500.
    if not hmac.compare_digest(str(expected).encode("utf-8"), given.encode("utf-8")):
        raise ApiError(400, WRONG_CSRF_MESSAGE, CSRF_ERROR_CODE)


def guard() -> None:
    """before_request hook: the CSRF token on every non-GET request of the app."""
    if request.method not in ("GET", "HEAD", "OPTIONS"):
        check_csrf()


def admin_logged_in() -> bool:
    return bool(session.get(ADMIN_SESSION_KEY))


def admin_required(view: Callable[..., Any]) -> Callable[..., Any]:
    """Admin routes: 401 JSON when nobody is logged in."""

    @functools.wraps(view)
    def wrapper(*args: Any, **kwargs: Any) -> Any:
        if not admin_logged_in():
            raise ApiError(401, NOT_ADMIN_MESSAGE)
        return view(*args, **kwargs)

    return wrapper


def json_body() -> dict[str, Any]:
    """The JSON object of the request body; 400 when it is not one."""
    data = request.get_json(silent=True)
    if not isinstance(data, dict):
        raise ApiError(400, MALFORMED_BODY_MESSAGE)
    return data


def login(password: str) -> bool:
    """Check the password; a wrong one waits `config.login_delay` seconds."""
    config = current_app.config["SALA_CONFIG"]
    if config.check_password(password):
        session.clear()
        session[ADMIN_SESSION_KEY] = True
        csrf_token()  # the old session is gone: hand out a fresh token
        return True
    time.sleep(config.login_delay)
    return False


def logout() -> None:
    session.clear()


def is_api_path(path: str) -> bool:
    """True for `/api/...` and for `<admin>/api/...`."""
    config = current_app.config.get("SALA_CONFIG")
    admin_api = f"{config.admin_path}/api" if config is not None else "/api"
    return _is_under(path, "/api") or _is_under(path, admin_api)


def _is_under(path: str, prefix: str) -> bool:
    prefix = "/" + prefix.strip("/")
    return path == prefix or path.startswith(prefix + "/")


def handle_api_error(error: ApiError) -> tuple[Response, int]:
    if error.code is None:
        return jsonify(error=error.message), error.status
    return jsonify(error=error.message, code=error.code), error.status


def handle_http_error(error: HTTPException) -> Response | HTTPException:
    """Flask's own errors: the JSON shape on the API paths, a pt-BR page elsewhere.

    A page this app did not author (a 404 for a file the bundle does not have, a
    405 for the wrong method on a page, a 413 for a body over the limit, a 500
    from a view that blew up) is still read by a kid or by the teacher, so it is
    Brazilian Portuguese like every other string they see: the wording of
    `PAGE_ERRORS` where there is one, the generic `GENERIC_PAGE_ERROR` for any
    other 4xx/5xx. A status outside the error range (a redirect, say) is not a
    page this app should rewrite, so Flask's own response goes out unchanged.
    """
    code = error.code or 500
    if is_api_path(request.path):
        return jsonify(error=DEFAULT_ERRORS.get(code, "Algo deu errado no servidor.")), code
    if not 400 <= code < 600:
        return error
    message = PAGE_ERRORS.get(code) or GENERIC_PAGE_ERROR.format(code=code)
    body = (
        '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
        f"<title>{message}</title>\n</head>\n<body>\n<h1>{message}</h1>\n</body>\n</html>\n"
    )
    return Response(body, status=code, mimetype="text/html")


def init_app(app: Flask) -> None:
    app.before_request(guard)
    app.register_error_handler(ApiError, handle_api_error)
    app.register_error_handler(HTTPException, handle_http_error)
