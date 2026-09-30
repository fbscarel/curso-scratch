"""Folhas: the aula PDFs of the repo — the `ficha` and the `desafios`.

The PDFs live outside the data dir, in the checkout (`<repo>/aulas/pdf`, env
`SALA_PDFS`), and only two of the files there are ever reachable: the ficha and
the desafios of an aula that is registered and has already started. The roteiro,
the slides and the parent note are for the teacher, so they are not routes.

The URLs are `/folhas/aula<N>-<kind>.pdf`; the SPA's own `/folhas` screen is the
page that links to them, which is why the fallback in `spa.py` refuses every
other path under `/folhas/`.
"""

from __future__ import annotations

import os
import sqlite3
from pathlib import Path

from flask import Blueprint, Response, abort, send_file

from .config import SALA_DIR
from .db import get_db
from .lessons import current_lesson, get_lesson, today

bp = Blueprint("sheets", __name__)

FOLHAS_PREFIX = "/folhas"
PDF_DIR_PARTS = ("aulas", "pdf")
SHEET_KINDS = ("ficha", "desafios")
SHEET_TITLES = {"ficha": "Ficha", "desafios": "Desafios"}


def pdf_dir() -> Path:
    """Where the aula PDFs are: `SALA_PDFS`, else `<repo>/aulas/pdf`."""
    override = os.environ.get("SALA_PDFS")
    if override:
        return Path(override).expanduser()
    return SALA_DIR.parent.joinpath(*PDF_DIR_PARTS)


def sheet_url(number: int, kind: str) -> str:
    return f"{FOLHAS_PREFIX}/aula{number}-{kind}.pdf"


def sheet_path(number: int, kind: str) -> Path:
    return pdf_dir() / f"aula{number}-{kind}.pdf"


def sheets_payload(connection: sqlite3.Connection) -> list[dict]:
    """The folhas of every aula up to the current one, ascending.

    Only the kinds whose file exists are listed, and an aula with none is left
    out entirely. No current aula (or no aula at all) means no folhas.
    """
    current = current_lesson(connection, today())
    if current is None:
        return []
    rows = connection.execute(
        "SELECT number FROM lessons WHERE number <= ? ORDER BY number", (current["number"],)
    ).fetchall()
    payload = []
    for row in rows:
        sheets = [
            {"kind": kind, "title": SHEET_TITLES[kind], "url": sheet_url(row["number"], kind)}
            for kind in SHEET_KINDS
            if sheet_path(row["number"], kind).is_file()
        ]
        if sheets:
            payload.append({"lessonNumber": row["number"], "sheets": sheets})
    return payload


@bp.get(f"{FOLHAS_PREFIX}/aula<int:number>-<kind>.pdf")
def sheet(number: int, kind: str) -> Response:
    """One aula's ficha or desafios, inline; 404 for anything else."""
    if kind not in SHEET_KINDS:
        abort(404)
    connection = get_db()
    current = current_lesson(connection, today())
    if get_lesson(connection, number) is None or current is None or number > current["number"]:
        abort(404)
    path = sheet_path(number, kind)
    if not path.is_file():
        abort(404)
    return send_file(path, mimetype="application/pdf")
