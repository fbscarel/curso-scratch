"""O projeto da aula: the one .sb3 the teacher picks for the whole class.

The file lives in `<data>/projeto-da-aula/` (one slot, not one per aula) and the
`settings` table keeps the name it is stored under and the moment it arrived;
the size is read from the file. The routes that use this are `api_public` (the
kids' tile and the file) and `api_admin` (the teacher's card).
"""

from __future__ import annotations

import os
import sqlite3
import threading
import zipfile
from datetime import datetime
from pathlib import Path
from typing import IO

from flask import url_for

from . import uploads
from .db import delete_setting, get_setting, set_setting

DIRNAME = "projeto-da-aula"
EXTENSION = ".sb3"
# Every .sb3 is a zip with the project at its root; that is what tells a real
# project from a file somebody renamed.
PROJECT_ENTRY = "project.json"

SETTING_NAME = "starter_name"
SETTING_UPLOADED_AT = "starter_uploaded_at"

# One slot, one writer: waitress serves the routes in a single process, so a
# lock here covers every upload, every removal and every download. Without it two
# uploads at once both read the name the settings hold and each leaves a file
# behind, and a removal drops the settings an upload has just written.
SLOT_LOCK = threading.Lock()

# The type the lab image's Firefox hands to the system (TurboWarp Desktop) for
# a .sb3. It has to be this type: with application/octet-stream Firefox only
# ever saves the file, whatever its policy says. The route still sends it as an
# attachment, which keeps the kid on the sala page and gives the saved copy its
# real name.
MIME_TYPE = "application/x.scratch.sb3"

BAD_TYPE_MESSAGE = f"Escolha um projeto do Scratch ({EXTENSION})."
NOT_A_PROJECT_MESSAGE = "Esse arquivo não é um projeto do Scratch (.sb3)."
TOO_LARGE_MESSAGE = (
    f"Arquivo grande demais: o limite é {uploads.MAX_UPLOAD_BYTES // (1024 * 1024)} MB."
)
NOT_FOUND_MESSAGE = "Não encontrei o projeto da aula."


class NotAProject(Exception):
    """The upload is not an .sb3: not a zip, or a zip without `project.json`."""


class TooLarge(Exception):
    """The upload is over the limit; the API answers 413."""


def starter_dir(data_dir: Path) -> Path:
    return data_dir / DIRNAME


def project_name(filename: str) -> str | None:
    """The name a project is stored under, or None when it is not a `.sb3`."""
    stored = uploads.sanitize_filename(filename)
    return stored if stored.lower().endswith(EXTENSION) else None


def stored_path(data_dir: Path, name: str) -> Path:
    """Where a stored project lives; never a path outside the slot's folder."""
    directory = starter_dir(data_dir).resolve()
    path = (directory / name).resolve()
    if not path.is_relative_to(directory):
        raise RuntimeError(f"O caminho saiu de {directory}: {path}")
    return path


def _slot(connection: sqlite3.Connection, data_dir: Path) -> tuple[Path, str] | None:
    """The project's file and the moment it arrived, or None.

    Both settings keys are the slot: `replace` writes them in one transaction, so
    a name without a moment (only reachable by editing the database by hand) is
    not a project. A file that is gone is not one either.
    """
    name = get_setting(connection, SETTING_NAME)
    moment = get_setting(connection, SETTING_UPLOADED_AT)
    if not name or not moment:
        return None
    path = stored_path(data_dir, name)
    return (path, moment) if path.is_file() else None


def open_stored_file(
    connection: sqlite3.Connection, data_dir: Path
) -> tuple[IO[bytes], str] | None:
    """The project open for reading and the name it is stored under, or None.

    The name is resolved and the file opened under `SLOT_LOCK`, so a replacement
    that starts right after cannot take the file away from a response still
    reading it: the descriptor outlives the name, and with it the bytes.
    """
    with SLOT_LOCK:
        slot = _slot(connection, data_dir)
        if slot is None:
            return None
        path = slot[0]
        try:
            return path.open("rb"), path.name
        except OSError:
            # The file went between the check and the open: no project, not a 500.
            return None


def payload(connection: sqlite3.Connection, data_dir: Path) -> dict | None:
    """`{name, size, uploadedAt}` — the teacher's card — or None."""
    slot = _slot(connection, data_dir)
    if slot is None:
        return None
    path, moment = slot
    try:
        size = path.stat().st_size
    except OSError:
        # The file went between the check and the size: no project, not a 500.
        return None
    return {"name": path.name, "size": size, "uploadedAt": moment}


def public_payload(connection: sqlite3.Connection, data_dir: Path) -> dict | None:
    """`{name, uploadedAt, url}` — what the kids' tile needs — or None."""
    entry = payload(connection, data_dir)
    if entry is None:
        return None
    return {
        "name": entry["name"],
        "uploadedAt": entry["uploadedAt"],
        "url": url_for("api_public.starter_file"),
    }


def _is_project(path: Path) -> bool:
    """True when `path` is a zip carrying `project.json` at its root."""
    try:
        with zipfile.ZipFile(path) as archive:
            return PROJECT_ENTRY in archive.namelist()
    except (zipfile.BadZipFile, OSError):
        return False


def _same_file(left: Path, right: Path) -> bool:
    """True when both names are one file: a case-folding filesystem, a symlink.

    A name that is gone is not the other one, so the `OSError` answers False.
    """
    try:
        return os.path.samefile(left, right)
    except OSError:
        return False


def replace(
    connection: sqlite3.Connection,
    data_dir: Path,
    *,
    name: str,
    stream: IO[bytes],
    moment: datetime,
) -> None:
    """Store `stream` as the aula's project under `name`, replacing the old one.

    The bytes land in a temporary file beside the slot and are moved onto the
    final name with a single rename, so a download that starts mid-upload gets
    the old file whole or the new one whole. The old file is dropped only once
    the `settings` row points at the new one, and that whole swap runs under
    `SLOT_LOCK`: two uploads at once must not both read the same old name.

    An empty or non-project upload raises `NotAProject` and one over
    `MAX_UPLOAD_BYTES` raises `TooLarge` — both before the slot is touched.
    """
    directory = starter_dir(data_dir)
    temp, size = uploads.stream_to_temp(directory, stream)
    try:
        if size == 0 or not _is_project(temp):
            raise NotAProject(NOT_A_PROJECT_MESSAGE)
        if size > uploads.MAX_UPLOAD_BYTES:
            raise TooLarge(TOO_LARGE_MESSAGE)
        with SLOT_LOCK:
            _install(connection, data_dir, temp=temp, name=name, moment=moment)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise


def _install(
    connection: sqlite3.Connection,
    data_dir: Path,
    *,
    temp: Path,
    name: str,
    moment: datetime,
) -> None:
    """Move `temp` onto the slot, point the settings at it, drop the old file.

    Called with `SLOT_LOCK` held, and reads the old name under it: that name is
    what decides which file the new one replaces.
    """
    previous = get_setting(connection, SETTING_NAME)
    try:
        os.replace(temp, stored_path(data_dir, name))
    except BaseException:
        temp.unlink(missing_ok=True)
        raise
    try:
        set_setting(connection, SETTING_NAME, name)
        set_setting(connection, SETTING_UPLOADED_AT, uploads.created_at(moment))
        connection.commit()
    except BaseException:
        # The row still names the old file, so a new one under a new name is
        # litter. Under the SAME name the rename already took the slot over and
        # there is nothing to go back to, so the file stays.
        if name != previous:
            stored_path(data_dir, name).unlink(missing_ok=True)
        raise
    if previous is None or previous == name:
        return
    previous_path = stored_path(data_dir, previous)
    # Two names can be one file (a case-folding filesystem, a symlink): the
    # unlink would take the project the settings just named.
    if not _same_file(previous_path, stored_path(data_dir, name)):
        previous_path.unlink(missing_ok=True)


def remove(connection: sqlite3.Connection, data_dir: Path) -> None:
    """Take the aula's project out: the two settings keys and the file behind them.

    Runs under `SLOT_LOCK` like `replace`: a removal that read the name just
    before an upload took the slot over would drop the settings the upload wrote
    and leave its file behind — a project the kids cannot see, and litter in the
    slot the next upload would trip over.
    """
    with SLOT_LOCK:
        name = get_setting(connection, SETTING_NAME)
        delete_setting(connection, SETTING_NAME)
        delete_setting(connection, SETTING_UPLOADED_AT)
        connection.commit()
        if name:
            stored_path(data_dir, name).unlink(missing_ok=True)
