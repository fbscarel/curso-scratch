"""The game page: `/emulador/play`, its script and the EmulatorJS files.

The emulator runs inside an iframe of its own, not inside the SPA: EmulatorJS
takes over globals and the keyboard, and a page of its own is torn down when the
kid leaves. The HTML is a tracked template (`app/emulator/play.html`) with the
game's configuration injected as a JSON block, and everything the page does lives
in the external scripts it loads — `/emulador/score.js` (the savestate decoder)
and `/emulador/play.js` — because the page's CSP has no `'unsafe-inline'` for
scripts, and `'unsafe-eval'` is there only because emulator.min.js runs
`Function(...)`. Nothing in that policy points outside this laptop.

The data files come from the gitignored `vendor/emulatorjs/data` directory
(`just sala-emulador` fills it, checked against `emulador.sha256`). When the
emulator is not installed the page still answers 200: the kid (or the teacher who
typed the URL) reads the pt-BR message telling them to run the recipe -- the game
area is not rendered at all in that case, so the sentence is the whole page and
not a line under a black rectangle -- and the site receives `sala:error` instead
of a broken emulator.
"""

from __future__ import annotations

import html
import json
from pathlib import Path, PurePosixPath

from flask import Blueprint, Response, abort, request, send_from_directory

from . import emulatorjs, games
from .db import get_db

bp = Blueprint("emulator_page", __name__)

EMULADOR_PREFIX = "/emulador"
DATA_URL = f"{EMULADOR_PREFIX}/data/"
ASSETS_DIR = Path(__file__).resolve().parent / "emulator"
PLAY_HTML_FILENAME = "play.html"
PLAY_JS_FILENAME = "play.js"
SCORE_JS_FILENAME = "score.js"

GAME_NOT_FOUND_MESSAGE = "Não encontrei esse jogo."
MISSING_EMULATOR_MESSAGE = "Emulador não instalado: rode just sala-emulador"

# The policy EmulatorJS 4.2.3 needs when it is served from this laptop:
# `'unsafe-eval'` for emulator.min.js, blob:/data: for the workers and the ROM
# it unpacks in memory, and `'self'` for everything else — no CDN.
PLAY_CSP = " ".join(
    (
        "default-src 'self';",
        "script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:;",
        "worker-src 'self' blob:;",
        "connect-src 'self' blob: data:;",
        "img-src 'self' blob: data:;",
        "media-src 'self' blob:;",
        "style-src 'self' 'unsafe-inline';",
        "font-src 'self' data:",
    )
)

# The emulator's own buttons, all off: what is left is Pausar, Controles, Som,
# Ajustes and Tela cheia — no save states, no cheats, no netplay, no exit.
EJS_BUTTONS = {
    "saveState": False,
    "loadState": False,
    "cheat": False,
    "netplay": False,
    "cacheManager": False,
    "saveSavFiles": False,
    "loadSavFiles": False,
    "quickSave": False,
    "quickLoad": False,
    "screenRecord": False,
    "screenshot": False,
    "exitEmulation": False,
    "restart": False,
}

# The template's placeholders (see `app/emulator/play.html`).
CONFIG_MARKER = "__SALA_GAME_CONFIG__"
AVISO_MARKER = "__SALA_AVISO__"
AVISO_HIDDEN_MARKER = "__SALA_AVISO_HIDDEN__"
GAME_HIDDEN_MARKER = "__SALA_GAME_HIDDEN__"

DATA_MAX_AGE = 60 * 60 * 24 * 365


def play_config(jogo: games.Jogo, *, error: str | None = None) -> dict:
    """The JSON block of the play page: what `play.js` hands to EmulatorJS."""
    config: dict = {
        "core": jogo.core,
        "gameUrl": games.rom_url(jogo),
        "controlScheme": games.control_scheme(jogo.core),
        "language": "pt-BR",
        "pathtodata": DATA_URL,
        "defaultOptions": {"webgl2Enabled": "enabled"},
        "buttons": EJS_BUTTONS,
        # Where the game keeps its score in the savestate, or null for a game
        # that has no way of reporting one: `play.js` only follows the first.
        "score": None if jogo.score is None else jogo.score.payload(),
    }
    if error is not None:
        config["error"] = error
    return config


def render_play(jogo: games.Jogo, *, error: str | None = None) -> str:
    """The play page for a game, with its configuration filled in.

    With an error there is no emulator to show, and the game area would be a
    black rectangle the message sits below: the area is left out of the layout
    instead, so the pt-BR sentence is what the teacher sees.
    """
    config = json.dumps(play_config(jogo, error=error), ensure_ascii=False)
    template = (ASSETS_DIR / PLAY_HTML_FILENAME).read_text(encoding="utf-8")
    return (
        template.replace(CONFIG_MARKER, config)
        .replace(AVISO_MARKER, html.escape(error or ""))
        .replace(AVISO_HIDDEN_MARKER, "" if error else " hidden")
        .replace(GAME_HIDDEN_MARKER, " hidden" if error else "")
    )


def _page(message: str, status: int) -> Response:
    """A short pt-BR HTML page (the shape the API errors use outside the API)."""
    body = (
        '<!doctype html>\n<html lang="pt-BR">\n<head>\n<meta charset="utf-8">\n'
        f"<title>{message}</title>\n</head>\n<body>\n<h1>{message}</h1>\n</body>\n</html>\n"
    )
    return Response(body, status=status, mimetype="text/html")


def _refuse_dotfile(path: str) -> None:
    """404 for a dot-prefixed segment (the rule `spa.py` applies to the bundle).

    Nothing in the EmulatorJS install starts with a dot, but a file dropped into
    the data directory must not become reachable just for being hidden.
    """
    if any(part.startswith(".") for part in PurePosixPath(path).parts):
        abort(404)


@bp.get(f"{EMULADOR_PREFIX}/play")
def play() -> Response:
    """The iframe page of one game.

    A 404 for a game the mode does not offer, one that is not emulated, or one
    whose ROM is not on disk: those are not "a game that failed to start", they
    are not this game at all. A missing emulator install is different — it is one
    teacher command away from working — so the page says so in pt-BR.
    """
    connection = get_db()
    jogo = games.by_id(request.args.get("game", ""))
    if jogo is None or jogo.type != games.TYPE_EMULATED:
        return _page(GAME_NOT_FOUND_MESSAGE, 404)
    if not games.is_offered(connection, jogo) or not games.rom_present(jogo):
        return _page(GAME_NOT_FOUND_MESSAGE, 404)
    error = None if games.core_installed(jogo) else MISSING_EMULATOR_MESSAGE
    response = Response(render_play(jogo, error=error), mimetype="text/html")
    response.headers["Content-Security-Policy"] = PLAY_CSP
    response.headers["Cache-Control"] = "no-store"
    return response


@bp.get(f"{EMULADOR_PREFIX}/play.js")
def play_js() -> Response:
    response = send_from_directory(ASSETS_DIR, PLAY_JS_FILENAME, mimetype="text/javascript")
    response.headers["Cache-Control"] = "no-store"
    return response


@bp.get(f"{EMULADOR_PREFIX}/score.js")
def score_js() -> Response:
    """The savestate decoder of `play.js`, kept apart so it is one small file."""
    response = send_from_directory(ASSETS_DIR, SCORE_JS_FILENAME, mimetype="text/javascript")
    response.headers["Cache-Control"] = "no-store"
    return response


@bp.get(f"{EMULADOR_PREFIX}/data/<path:filename>")
def data(filename: str) -> Response:
    """One EmulatorJS file; the release is pinned, so it can be cached forever."""
    _refuse_dotfile(filename)
    response = send_from_directory(emulatorjs.data_dir(), filename, max_age=DATA_MAX_AGE)
    response.headers["Cache-Control"] = f"public, max-age={DATA_MAX_AGE}, immutable"
    return response
