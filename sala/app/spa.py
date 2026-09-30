"""SPA serving: the built bundle in `static/dist`, the fallback and the admin meta.

`GET /assets/*` serves the hashed files of `static/dist/assets` with an immutable
cache; `index.html` is served `no-store` however it is asked for, and any other
file the build put at the root of `static/dist` (the favicon, say) is served as
the file it is -- except the build's own dotfiles, which are refused under
`/assets/` as well. Any other GET without a file extension and outside the APIs
is the SPA: the public routes, and the whole admin tree, where
`<meta name="sala-admin-base">` is what tells the bundle to show the admin app
(the admin path itself is never in the bundle).
"""

from __future__ import annotations

import html
import re
from pathlib import Path, PurePosixPath

from flask import Blueprint, Response, abort, current_app, send_from_directory
from werkzeug.exceptions import NotFound

from . import auth

bp = Blueprint("spa", __name__)

INDEX_FILENAME = "index.html"
ASSETS_DIRNAME = "assets"
ADMIN_BASE_META = "sala-admin-base"
MISSING_BUNDLE_MESSAGE = "Interface não compilada: rode just web-build"
# Vite's asset names carry a content hash, so they can be cached forever.
ASSET_MAX_AGE = 60 * 60 * 24 * 365
HEAD_TAG = re.compile(r"<head[^>]*>", re.IGNORECASE)


def _dist_dir() -> Path:
    return Path(current_app.config["SALA_DIST"])


def _index_document() -> str | None:
    try:
        return (_dist_dir() / INDEX_FILENAME).read_text(encoding="utf-8")
    except OSError:
        return None


def _missing_bundle() -> Response:
    return Response(MISSING_BUNDLE_MESSAGE, status=503, mimetype="text/plain")


def inject_admin_base(document: str, admin_path: str) -> str:
    """Insert the admin marker into the head of `document`."""
    meta = f'<meta name="{ADMIN_BASE_META}" content="{html.escape(admin_path, quote=True)}">'
    head = HEAD_TAG.search(document)
    if head is None:
        return meta + document
    return document[: head.end()] + meta + document[head.end() :]


def _index_response(*, admin: bool) -> Response:
    document = _index_document()
    if document is None:
        return _missing_bundle()
    if admin:
        document = inject_admin_base(document, current_app.config["SALA_CONFIG"].admin_path)
    response = Response(document, mimetype="text/html")
    response.headers["Cache-Control"] = "no-store"
    return response


@bp.get("/")
def index() -> Response:
    return _index_response(admin=False)


def _refuse_dotfile(path: str) -> None:
    """404 for a path with a dot-prefixed segment: the build's own dotfiles.

    `send_from_directory` would hand out `.vite/manifest.json` or `.secret.txt`
    like any other file, at the root of dist and under `/assets/` alike, so
    both branches ask here first.
    """
    if any(part.startswith(".") for part in PurePosixPath(path).parts):
        abort(404)


@bp.get("/assets/<path:filename>")
def asset(filename: str) -> Response:
    _refuse_dotfile(filename)
    response = send_from_directory(_dist_dir() / ASSETS_DIRNAME, filename, max_age=ASSET_MAX_AGE)
    response.headers["Cache-Control"] = f"public, max-age={ASSET_MAX_AGE}, immutable"
    return response


@bp.get("/<path:path>")
def fallback(path: str) -> Response:
    """Everything a GET can be that no other rule claimed."""
    admin_path = current_app.config["SALA_CONFIG"].admin_path
    url = "/" + path
    if auth.is_api_path(url):
        raise auth.ApiError(404, "Não encontrei essa rota da API.")
    if url == admin_path or url.startswith(admin_path + "/"):
        return _index_response(admin=True)
    if path == INDEX_FILENAME:
        # `index.html` is the index by name as well as by `/`: it must not be a
        # second path to the shell with send_file's weaker cache policy.
        return _index_response(admin=False)
    if Path(path).suffix:
        # A file of the build that is not under /assets/ (favicon.svg, say) is
        # served like any other file; anything else with an extension is not a
        # route, so it is not the index either.
        return _dist_file(path)
    return _index_response(admin=False)


def _dist_file(path: str) -> Response:
    """A root-level file of the built bundle, or a 404 for the rest."""
    _refuse_dotfile(path)
    try:
        return send_from_directory(_dist_dir(), path)
    except NotFound:
        abort(404)
