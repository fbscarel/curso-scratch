"""Sala — the course web server that runs on the teacher's laptop during class.

`create_app(config)` builds the Flask app: migrations on start, the JSON API the
SPA talks to (public under `/api`, admin under `config.admin_path + "/api"`) and
the built bundle in `static/dist`.
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import TYPE_CHECKING

from flask import Flask

from . import api_admin, api_public, auth, db, spa

if TYPE_CHECKING:  # kept out of the import at runtime so `python -m app.config` is clean
    from .config import Config

DEFAULT_DIST_DIR = Path(__file__).resolve().parent / "static" / "dist"


def default_dist_dir() -> Path:
    """Where the built SPA lives: `SALA_DIST` if set, else `app/static/dist`."""
    override = os.environ.get("SALA_DIST")
    if override:
        return Path(override).expanduser()
    return DEFAULT_DIST_DIR


def create_app(config: Config, *, dist_dir: Path | str | None = None) -> Flask:
    """Build the app; `dist_dir` points the SPA serving at another directory."""
    dist = Path(dist_dir) if dist_dir is not None else default_dist_dir()
    # No `static_folder`: Flask's built-in `/static/<path>` route would hand out
    # the whole bundle -- dotfiles and `index.html` with its own cache policy --
    # beside the rules `spa.py` enforces. The bundle is served from `SALA_DIST`
    # by `spa.bp` alone.
    app = Flask(__name__, static_folder=None)
    app.config["SALA_CONFIG"] = config
    app.config["SALA_DIST"] = dist
    app.secret_key = config.secret_key
    app.config.update(
        SESSION_COOKIE_HTTPONLY=True,
        SESSION_COOKIE_SAMESITE="Strict",
        # Non-permanent: the cookie dies when the browser closes.
        SESSION_PERMANENT=False,
    )

    db.init_app(app)
    auth.init_app(app)
    app.register_blueprint(api_public.bp)
    app.register_blueprint(api_admin.bp, url_prefix=f"{config.admin_path}/api")
    app.register_blueprint(spa.bp)
    return app
