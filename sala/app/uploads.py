"""Entrega storage: where an upload lands, how it is named and moved.

Everything an "entrega" needs on disk lives here: the allowed types and the size
limit, the sanitizing of a name a kid typed, the folder per aula and aluno
(`aulas/aula-NN/<student-id>-<slug>/`), the never-overwrite rule and the lesson
zip. The routes that call it are `api_public` and `api_admin`.
"""

from __future__ import annotations

import itertools
import os
import re
import shutil
import sqlite3
import tempfile
import unicodedata
import zipfile
from collections.abc import Iterable
from datetime import datetime
from pathlib import Path
from typing import IO

from flask import Response, current_app, send_file

from .auth import ApiError

AULAS_DIRNAME = "aulas"
ALLOWED_EXTENSIONS = (".sb3", ".sprite3", ".png", ".jpg", ".jpeg", ".wav", ".mp3")
MAX_UPLOAD_BYTES = 20 * 1024 * 1024
# The multipart framing (boundaries, part headers) rides on top of the file
# itself, so the body limit Flask enforces is the file limit plus a little.
MULTIPART_OVERHEAD = 64 * 1024
MAX_CONTENT_LENGTH = MAX_UPLOAD_BYTES + MULTIPART_OVERHEAD
MAX_FILENAME_LENGTH = 120
# The filesystem counts bytes, not characters, and the name also carries the
# stamp prefix and possibly a ` (2)` suffix: a name of 120 emoji would be over
# 480 bytes and `link` would refuse it.
MAX_FILENAME_BYTES = 200
FALLBACK_STEM = "arquivo"
CHUNK_BYTES = 64 * 1024
# The partial file of an upload in progress: hidden, and in the target folder so
# the final move is a rename inside one filesystem.
TEMP_PREFIX = ".envio-"
TEMP_SUFFIX = ".parcial"
ZIP_PREFIX = "entregas-"

EMPTY_MESSAGE = "O arquivo está vazio. Escolha de novo."
TOO_LARGE_MESSAGE = f"Arquivo grande demais: o limite é {MAX_UPLOAD_BYTES // (1024 * 1024)} MB por arquivo."
BAD_TYPE_MESSAGE = "Tipo de arquivo não aceito. Pode enviar: " + ", ".join(ALLOWED_EXTENSIONS) + "."
NOT_FOUND_MESSAGE = "Não encontrei esse arquivo."


class EmptyUpload(Exception):
    """The uploaded file has no bytes; the API answers 422."""


class UploadTooLarge(Exception):
    """The uploaded file is over the limit; the API answers 413."""


def aulas_root(data_dir: Path) -> Path:
    return data_dir / AULAS_DIRNAME


def lesson_dirname(number: int) -> str:
    return f"aula-{number:02d}"


def student_dir(data_dir: Path, lesson_number: int, student_id: int, student_name: str) -> Path:
    """`<data>/aulas/aula-NN/<student-id>-<slug>/` — where that aluno's files land."""
    return aulas_root(data_dir) / lesson_dirname(lesson_number) / f"{student_id}-{slugify(student_name)}"


def slugify(name: str) -> str:
    """A folder-safe ASCII slug of a name; `aluno` when nothing is left."""
    folded = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r"[^a-z0-9]+", "-", folded.lower()).strip("-")
    return slug or "aluno"


def safe_zip_segment(name: str, fallback: str = "aluno") -> str:
    """The folder an aluno's files get inside the lesson zip.

    A zip entry is a path, and the name is the teacher's own text: a `/` or a
    `\\` in it would add a level (or a backslash) to the entry, and a leading
    dot or a `..` would let an extraction walk out of the folder it was given.
    Spaces and accents stay, so the teacher still reads the name; a name that
    leaves nothing behind becomes `aluno`.

    The folder is compared on the teacher's machine, not here: macOS normalizes
    to NFD and Windows drops a trailing dot or space, so `Ana` and `Ana.` — or
    the same `João` in either form — are one folder there. Normalizing and
    stripping here makes that collision visible to `_unique_segment`, which
    hands the second aluno its own folder instead of letting it land on the
    first one's files.
    """
    segment = "".join(character for character in name if character.isprintable())
    segment = segment.replace("/", " ").replace("\\", " ")
    segment = " ".join(segment.split())
    segment = segment.lstrip(". ")
    segment = unicodedata.normalize("NFC", segment).rstrip(". ")
    return segment or fallback


def allowed_extension(filename: str) -> str | None:
    """The lower-case extension of `filename` when it is one we accept, else None."""
    suffix = Path(filename).suffix.lower()
    return suffix if suffix in ALLOWED_EXTENSIONS else None


def _fit_bytes(text: str, limit: int) -> str:
    """`text` cut to at most `limit` bytes, never in the middle of a character."""
    encoded = text.encode("utf-8")
    if len(encoded) <= limit:
        return text
    return encoded[:limit].decode("utf-8", "ignore")


def sanitize_filename(name: str) -> str:
    """The name an upload is stored under.

    Basename only (`/` and `\\` parts are dropped), no control characters, runs
    of whitespace collapsed, no leading dots, at most `MAX_FILENAME_LENGTH`
    characters (and `MAX_FILENAME_BYTES` bytes) keeping the extension, and never
    empty: a name that leaves nothing behind becomes `arquivo<ext>`.
    """
    base = name.replace("\\", "/").rsplit("/", 1)[-1]
    base = "".join(character for character in base if character.isprintable())
    base = " ".join(base.split())
    base = base.lstrip(".")
    stem, extension = os.path.splitext(base)
    if not stem:
        stem = FALLBACK_STEM
    if len(stem) + len(extension) > MAX_FILENAME_LENGTH:
        stem = stem[: MAX_FILENAME_LENGTH - len(extension)]
    stem = _fit_bytes(stem, MAX_FILENAME_BYTES - len(extension.encode("utf-8")))
    return f"{stem}{extension}"


def now() -> datetime:
    """The moment an upload is stamped with, or the one the app config pins.

    Tests pin it (`SALA_NOW`) so the folder name, the file name and `createdAt`
    do not depend on the second the suite runs.
    """
    pinned = current_app.config.get("SALA_NOW")
    if pinned is None:
        return datetime.now()
    if isinstance(pinned, datetime):
        return pinned
    return datetime.fromisoformat(str(pinned))


def stamp(moment: datetime) -> str:
    """`YYYY-MM-DD HHhMM`: the prefix of a stored file and of its folder entry."""
    return moment.strftime("%Y-%m-%d %Hh%M")


def created_at(moment: datetime) -> str:
    """`YYYY-MM-DD HH:MM:SS`: the `createdAt` the API hands to the SPA."""
    return moment.strftime("%Y-%m-%d %H:%M:%S")


def _assert_inside_aulas(data_dir: Path, path: Path) -> None:
    """`path` must resolve inside `<data>/aulas/` — never anywhere else.

    Called with the target folder before a single byte is written and with the
    final file afterwards: a symlinked `aulas/aula-NN` must not be able to put
    an upload outside the data dir, and the second call is the backstop.
    """
    root = aulas_root(data_dir).resolve()
    if not path.resolve().is_relative_to(root):
        raise RuntimeError(f"O caminho saiu de {root}: {path}")


def _reserve(target: Path) -> None:
    """Claim `target` for us alone: FileExistsError when the name is taken.

    `O_EXCL` makes the check and the creation a single step, so two uploads
    racing for one name cannot both win — and it needs no hard link, which
    exFAT, SMB and sshfs refuse.
    """
    os.close(os.open(target, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600))


def _fill(target: Path, source: Path) -> None:
    """Write `source`'s bytes into the empty `target` a rename could not reach."""
    try:
        with target.open("wb") as writer, source.open("rb") as reader:
            shutil.copyfileobj(reader, writer)
    except BaseException:
        target.unlink(missing_ok=True)
        raise


def _move_onto(source: Path, target: Path) -> None:
    """Put `source` at `target` (already reserved) and drop `source`."""
    try:
        os.replace(source, target)
    except OSError:
        # Another mount point (EXDEV) or a filesystem without the rename: copy
        # into the reservation we hold instead.
        _fill(target, source)
        source.unlink()


def _move_reserved(source: Path, target: Path) -> None:
    """Put `source` at the reserved `target`; a failure drops the reservation.

    `target` is the final name, and the reservation is the only thing at it: an
    exception that is not an OSError — `_move_onto` and `_fill` already clean up
    after those — would leave the 0-byte file there taking that name from the
    kid's next upload, so it goes with the failure.
    """
    try:
        _move_onto(source, target)
    except BaseException:
        target.unlink(missing_ok=True)
        raise


def _place(directory: Path, name: str, source: Path) -> Path:
    """Move `source` into `directory` as `name`, never overwriting.

    `name` may already be taken (a second upload of the same file in the same
    minute): the first free ` (2)`, ` (3)`… wins. The target is created with
    `O_EXCL` first, so the check and the reservation are one step and two
    uploads racing for one name cannot land on each other.
    """
    stem, extension = os.path.splitext(name)
    for suffix in itertools.chain([""], (f" ({number})" for number in itertools.count(2))):
        target = directory / f"{stem}{suffix}{extension}"
        try:
            _reserve(target)
        except FileExistsError:
            continue
        _move_reserved(source, target)
        return target
    raise AssertionError("unreachable")  # pragma: no cover


def restore_file(source: Path, target: Path) -> None:
    """Put a moved file back where the row still says it is (a failed move).

    The caller has already dropped the name at `target`, so it is reserved
    again here: whatever took it in the meantime is never overwritten.
    """
    target.parent.mkdir(parents=True, exist_ok=True)
    _reserve(target)
    _move_reserved(source, target)


def remove_stored_file(data_dir: Path, stored_path: str) -> None:
    """Drop a file no row was ever written for, and its folder when it empties."""
    path = data_dir / stored_path
    path.unlink(missing_ok=True)
    try:
        path.parent.rmdir()
    except OSError:
        pass


def _stream_to_temp(directory: Path, stream: IO[bytes]) -> tuple[Path, int]:
    """Write the upload beside its final home; return the temp file and its size."""
    directory.mkdir(parents=True, exist_ok=True)
    handle_fd, temp_name = tempfile.mkstemp(dir=directory, prefix=TEMP_PREFIX, suffix=TEMP_SUFFIX)
    temp = Path(temp_name)
    size = 0
    try:
        with os.fdopen(handle_fd, "wb") as handle:
            while chunk := stream.read(CHUNK_BYTES):
                handle.write(chunk)
                size += len(chunk)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise
    return temp, size


def save_upload(
    data_dir: Path,
    *,
    moment: datetime,
    lesson_number: int,
    student_id: int,
    student_name: str,
    original_name: str,
    stream: IO[bytes],
) -> tuple[str, int]:
    """Store one entrega; return its `stored_path` (relative to `data_dir`) and size.

    The caller has already refused a name whose extension is not allowed, and
    `moment` is the same instant the row's `createdAt` is stamped with, so the
    file name and the row can never disagree about when it was handed in. An
    empty file raises `EmptyUpload` and one over `MAX_UPLOAD_BYTES` raises
    `UploadTooLarge` — both before anything is left behind in the folder.
    """
    directory = student_dir(data_dir, lesson_number, student_id, student_name)
    # Before the folder is even created: a symlinked `aulas/aula-NN` must not
    # take the upload with it.
    _assert_inside_aulas(data_dir, directory)
    name = f"{stamp(moment)} - {sanitize_filename(original_name)}"
    temp, size = _stream_to_temp(directory, stream)
    if size == 0:
        temp.unlink(missing_ok=True)
        raise EmptyUpload(EMPTY_MESSAGE)
    if size > MAX_UPLOAD_BYTES:
        temp.unlink(missing_ok=True)
        raise UploadTooLarge(TOO_LARGE_MESSAGE)
    try:
        target = _place(directory, name, temp)
    except BaseException:
        temp.unlink(missing_ok=True)
        raise
    _assert_inside_aulas(data_dir, target)
    stored = (Path(AULAS_DIRNAME) / directory.parent.name / directory.name / target.name).as_posix()
    return stored, size


def move_into_lesson(
    data_dir: Path,
    *,
    stored_path: str,
    lesson_number: int,
    student_id: int,
    student_name: str,
    original_name: str,
    created: str,
) -> tuple[str, Path, Path]:
    """Move a stored file into another aula's folder; return `(stored_path, from, to)`.

    The name keeps the moment the file was handed in (`created`), so moving an
    entrega does not rename it beyond the ` (2)` a collision forces. The file
    goes to its new folder before the row is written, so the caller has to put
    it back at `from` (see `restore_file`) when that write fails: a failure
    leaves the row and the file agreeing, never a row pointing at nothing.
    """
    source = data_dir / stored_path
    directory = student_dir(data_dir, lesson_number, student_id, student_name)
    _assert_inside_aulas(data_dir, directory)
    directory.mkdir(parents=True, exist_ok=True)
    name = f"{stamp(datetime.fromisoformat(created))} - {sanitize_filename(original_name)}"
    target = _place(directory, name, source)
    _assert_inside_aulas(data_dir, target)
    # The move may have emptied the folder the file came from: it is not a home
    # for anything any more, and an empty `aula-NN/<aluno>` is noise.
    try:
        source.parent.rmdir()
    except OSError:
        pass
    moved = (Path(AULAS_DIRNAME) / directory.parent.name / directory.name / target.name).as_posix()
    return moved, source, target


def _unique_segment(base: str, student_id: int, taken: set[str]) -> str:
    """`base`; when another aluno already took it, `base (id)`, then `base (id-N)`."""
    segment = base
    number = 1
    while segment.casefold() in taken:
        number += 1
        segment = f"{base} ({student_id})" if number == 2 else f"{base} ({student_id}-{number})"
    return segment


def _zip_segments(rows: Iterable[sqlite3.Row]) -> dict[int, str]:
    """The zip folder of each aluno: its name, told apart when two names clash.

    `Ana/Bruno` and `Ana Bruno` are two different kids whose segment comes out
    the same: the id keeps their files from landing in one folder.
    """
    segments: dict[int, str] = {}
    taken: set[str] = set()
    for row in rows:
        student_id = row["student_id"]
        if student_id in segments:
            continue
        segment = _unique_segment(safe_zip_segment(row["student_name"]), student_id, taken)
        taken.add(segment.casefold())
        segments[student_id] = segment
    return segments


def build_lesson_zip(connection: sqlite3.Connection, data_dir: Path, number: int) -> Path:
    """Zip one aula's entregas as `<student name>/<file>`; return the temp file.

    Built in a file under the data dir rather than in memory: a class' worth of
    Scratch projects is not something to hold twice. A row whose file is gone is
    skipped instead of failing the whole download. The aluno's segment is
    sanitized: the teacher extracts this zip on their own machine, and a name
    like `..` or `Ana/Bruno` must not steer that extraction.
    """
    rows = connection.execute(
        "SELECT u.*, s.name AS student_name FROM uploads u"
        " JOIN students s ON s.id = u.student_id"
        " WHERE u.lesson_number = ?"
        " ORDER BY s.name COLLATE NOCASE, u.created_at, u.id",
        (number,),
    ).fetchall()
    segments = _zip_segments(rows)
    handle_fd, temp_name = tempfile.mkstemp(dir=data_dir, prefix=ZIP_PREFIX, suffix=".zip")
    os.close(handle_fd)
    temp = Path(temp_name)
    try:
        with zipfile.ZipFile(temp, "w", zipfile.ZIP_DEFLATED) as archive:
            for row in rows:
                path = data_dir / row["stored_path"]
                if not path.is_file():
                    continue
                archive.write(path, arcname=f"{segments[row['student_id']]}/{path.name}")
    except BaseException:
        temp.unlink(missing_ok=True)
        raise
    return temp


def send_upload(data_dir: Path, row: sqlite3.Row) -> Response:
    """The file as a download named as the kid named it; 404 when it is gone."""
    path = data_dir / row["stored_path"]
    if not path.is_file():
        raise ApiError(404, NOT_FOUND_MESSAGE)
    return send_file(
        path,
        as_attachment=True,
        download_name=row["original_name"],
        mimetype="application/octet-stream",
    )


def upload_payload(row: sqlite3.Row) -> dict:
    """`{id, lessonNumber, name, size, createdAt}` — plus the aluno on a joined row."""
    payload = {
        "id": row["id"],
        "lessonNumber": row["lesson_number"],
        "name": row["original_name"],
        "size": row["size"],
        "createdAt": row["created_at"],
    }
    if "student_name" in row.keys():
        payload["student"] = {"id": row["student_id"], "name": row["student_name"]}
    return payload
