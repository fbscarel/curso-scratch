"""The Groovie page: `/batidas/`, its files and the policy they run under.

Groovie is a document of its own, not a screen of the SPA: it is a plain page of
ES modules, it owns the keyboard and the audio context, and it must not be
handed the application shell. The files come from the gitignored `vendor/groovie`
directory (`just sala-groovie` fills it, checked against `groovie.sha256`), and
the one vendor-hosted call the published page makes was taken out of `main.js`
at download time (`groovie.patch_main_js`), so the policy below has no source
outside this laptop.

Every response of this blueprint carries that policy, whatever its status: a
file of the install, the redirect to the slash, the pt-BR sentence of an install
that is not ready, and the 404 of a typo under the prefix. The page itself
(`/batidas/`) is the only document, and it is never cached; `index.html` by name
is a redirect to it, so the relative files can only resolve from one URL.

When the page is not installed the route still answers 200 with a pt-BR sentence
telling the teacher to run the recipe: that is one command away from working,
not a broken address.
"""

from __future__ import annotations

from pathlib import Path, PurePosixPath

from flask import Blueprint, Response, abort, redirect, send_from_directory

from . import groovie

bp = Blueprint("groovie_page", __name__)

GROOVIE_PREFIX = "/batidas"
INDEX_URL = GROOVIE_PREFIX + "/"
MISSING_MESSAGE = "Batidas não está instalado: rode just sala-groovie"
DATA_MAX_AGE = 60 * 60 * 24 * 365

# What the page needs and nothing else: its own scripts and styles, the samples
# it fetches from this laptop, the audio graph it builds in memory. No inline
# script, no `eval`, no source outside this origin.
GROOVIE_CSP = " ".join(
    (
        "default-src 'self';",
        "script-src 'self';",
        "style-src 'self';",
        "img-src 'self' data:;",
        "media-src 'self' blob:;",
        "connect-src 'self';",
        "font-src 'self';",
        "object-src 'none';",
        "base-uri 'none';",
        "form-action 'none';",
        "frame-ancestors 'none'",
    )
)


@bp.after_request
def harden(response: Response) -> Response:
    """The page's policy on every answer of this blueprint, 302s and 404s too."""
    response.headers["Content-Security-Policy"] = GROOVIE_CSP
    return response


def _page(message: str, status: int) -> Response:
    """A short pt-BR HTML page (the shape the emulator page uses)."""
    body = (
        '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
        f"<title>{message}</title>\n</head>\n<body>\n<h1>{message}</h1>\n</body>\n</html>\n"
    )
    return Response(body, status=status, mimetype="text/html")


def _refuse_dotfile(path: str) -> None:
    """404 for a dot-prefixed segment (the rule `spa.py` applies to the bundle)."""
    if any(part.startswith(".") for part in PurePosixPath(path).parts):
        abort(404)


@bp.get(GROOVIE_PREFIX)
def bare() -> Response:
    """`/batidas` → `/batidas/`: the page's relative files resolve from the slash."""
    return redirect(INDEX_URL, code=302)


@bp.get(INDEX_URL)
def index() -> Response:
    if not groovie.installed():
        return _page(MISSING_MESSAGE, 200)
    response = send_from_directory(groovie.data_dir(), groovie.INDEX_FILENAME, mimetype="text/html")
    # The install is pinned, but the teacher may fetch it again: a kid has to get
    # the page that is on disk now, not one a cache remembers.
    response.headers["Cache-Control"] = "no-store"
    return response


@bp.get(GROOVIE_PREFIX + "/<path:filename>")
def file(filename: str) -> Response:
    """One file of the install; the pinned ones can be cached forever.

    `index.html` by name is not a second copy of the page: the page is served
    from `/batidas/` alone (the relative files resolve from there), so this is
    the same redirect `/batidas` gives. Any other document is never cached; the
    assets of the pinned install are.
    """
    _refuse_dotfile(filename)
    if PurePosixPath(filename).name.lower() == groovie.INDEX_FILENAME:
        return redirect(INDEX_URL, code=302)
    response = send_from_directory(groovie.data_dir(), filename, max_age=DATA_MAX_AGE)
    if Path(filename).suffix.lower() == ".html":
        response.headers["Cache-Control"] = "no-store"
    else:
        response.headers["Cache-Control"] = f"public, max-age={DATA_MAX_AGE}, immutable"
    return response


def is_groovie_path(url: str) -> bool:
    """True for `/batidas` and anything under it (the SPA fallback must not claim it)."""
    return url == GROOVIE_PREFIX or url.startswith(GROOVIE_PREFIX + "/")
