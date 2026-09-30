"""Game covers: the libretro-thumbnails name of a catalogue entry, the covers
that live in the data directory, and the download that fills it
(`just sala-capas` → `python -m app.cover_download`).

The repository carries ROM *names* and never an image: a cover is downloaded
once per laptop from libretro-thumbnails into `<SALA_DADOS>/capas/<id>.png`,
which is gitignored like the rest of the data directory. A file the teacher put
there -- a better scan, or a picture of their own -- is never overwritten: the
recipe skips it, and deleting the file is how the teacher asks for the download
again.

A cover is decoration: a game without one is shown with the icon of its console,
so a download that fails is reported and the run goes on.
"""

from __future__ import annotations

import http.client
import os
import shutil
import sys
import tempfile
import urllib.error
import urllib.request
from collections.abc import Callable, Iterable
from pathlib import Path, PurePosixPath
from typing import IO
from urllib.parse import quote

from . import config, emulatorjs, games

THUMBNAILS_BASE = "https://thumbnails.libretro.com"
BOXARTS_DIRNAME = "Named_Boxarts"

# The libretro-thumbnails directory of each system the catalogue knows. The
# names are libretro's own and are what the URL is built from.
SYSTEM_DIRS: dict[str, str] = {
    "atari2600": "Atari - 2600",
    "arcade": "MAME",
    "nes": "Nintendo - Nintendo Entertainment System",
    "snes": "Nintendo - Super Nintendo Entertainment System",
    "genesis": "Sega - Mega Drive - Genesis",
}

# libretro writes these characters as `_` in the file name of a thumbnail; a ROM
# stem that carries one (`Ms. Pac-Man/Galaga`) would otherwise 404.
REPLACED_CHARACTERS = '&*/:`<>?\\|"'

COVERS_DIRNAME = "capas"
# The formats a cover may have, in the order the server looks for them.
COVER_EXTENSIONS = ("png", "jpg", "jpeg", "webp")
# What the download writes for each kind of image: the extension follows the
# bytes, so a JPEG is stored as `.jpg` and served as `image/jpeg` rather than
# under a `.png` name that would lie about the content type.
DOWNLOAD_EXTENSIONS = {"png": "png", "jpeg": "jpg"}
CONTENT_TYPES = {
    "png": "image/png",
    "jpg": "image/jpeg",
    "jpeg": "image/jpeg",
    "webp": "image/webp",
}
DEFAULT_CONTENT_TYPE = "application/octet-stream"

# A cover is a picture: anything past this is not one, and a download that big
# is a mistake (a server answering with a page, say) rather than a thumbnail.
MAX_COVER_BYTES = 5 * 1024 * 1024
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"
JPEG_MAGIC = b"\xff\xd8\xff"
# The end of an image, which is what tells a whole download from one that
# stopped early: the PNG IEND chunk (length 0, type, CRC) and the JPEG EOI
# marker. A body that carries only the magic bytes is not a picture.
PNG_END = b"\x00\x00\x00\x00IEND\xaeB`\x82"
JPEG_END = b"\xff\xd9"

# The browser may keep a cover for a day: it is a file on the teacher's laptop,
# and it changes only when the teacher changes it.
CACHE_SECONDS = 60 * 60 * 24

USER_AGENT = "Sala (servidor local da sala de aula)"
TIMEOUT_SECONDS = 30
# The download lands in a temporary file under this suffix and is published
# under the target name only once it is whole, so a dropped connection never
# leaves a half image to be served.
PART_SUFFIX = ".parcial"
CHUNK_SIZE = 64 * 1024


class CoverTooLarge(Exception):
    """The response was bigger than a cover may be."""


# --- the thumbnail of a catalogue entry ------------------------------------


def _libretro_name(name: str) -> str:
    """The name as libretro writes it: each of `REPLACED_CHARACTERS` becomes `_`."""
    return "".join("_" if character in REPLACED_CHARACTERS else character for character in name)


def thumbnail_name(jogo: games.Jogo) -> str | None:
    """The libretro-thumbnails name of a game, or None when it has no cover.

    An emulated game is named after its ROM file, which is the No-Intro name for
    a console and the MAME set name for an arcade machine -- and a set name is
    not what is written on the cabinet, so the catalogue overrides it with
    `capa`. A game of our own has no thumbnail at all: its cover ships inside
    the SPA.
    """
    if jogo.type != games.TYPE_EMULATED:
        return None
    if jogo.capa:
        return _libretro_name(jogo.capa)
    if jogo.rom:
        return _libretro_name(PurePosixPath(jogo.rom).stem)
    return None


def thumbnail_url(jogo: games.Jogo) -> str | None:
    """Where the cover of a game is downloaded from, or None when it has none."""
    name = thumbnail_name(jogo)
    directory = SYSTEM_DIRS.get(jogo.system or "")
    if name is None or directory is None:
        return None
    return (
        f"{THUMBNAILS_BASE}/{quote(directory, safe='')}"
        f"/{BOXARTS_DIRNAME}/{quote(name, safe='')}.png"
    )


# --- the covers on the laptop ----------------------------------------------


def covers_dir(data: Path) -> Path:
    """Where the covers of a data directory live (`<SALA_DADOS>/capas`)."""
    return data / COVERS_DIRNAME


def cover_file(data: Path, jogo: games.Jogo) -> Path | None:
    """The image to show for a game: the first extension that is there, or None.

    The candidate is resolved (symlinks and all) and refused unless the result
    is still inside the covers directory, so a symlink planted there cannot hand
    out a file from anywhere else -- `dados/config.toml`, say. The same check
    `games.rom_file` makes, for the same reason.
    """
    try:
        base = covers_dir(data).resolve()
    except (OSError, ValueError):
        # ValueError is the path itself being unusable (a NUL in the name, say):
        # there is no cover to look for, which is the same answer as none.
        return None
    for extension in COVER_EXTENSIONS:
        try:
            resolved = (base / f"{jogo.id}.{extension}").resolve()
        except (OSError, ValueError):
            continue
        if resolved.is_relative_to(base) and resolved.is_file():
            return resolved
    return None


def cover_available(data: Path, jogo: games.Jogo) -> bool:
    """True when there is an image to show for a game.

    A game of our own always has one: its cover is a screenshot of our Pong and
    travels inside the SPA bundle, where this server cannot see it. An emulated
    game has one when a file for it is in `capas/` -- downloaded by
    `just sala-capas`, or put there by the teacher.
    """
    if jogo.type == games.TYPE_BUILTIN:
        return True
    return cover_file(data, jogo) is not None


def content_type(path: Path) -> str:
    """The media type of a cover file, from its extension."""
    return CONTENT_TYPES.get(path.suffix.lstrip(".").lower(), DEFAULT_CONTENT_TYPE)


# --- the download ----------------------------------------------------------


def image_kind(data: bytes) -> str | None:
    """`png` or `jpeg` for bytes that are one of those, else None.

    The magic bytes are the check: a page served with a 200 (a captive portal, a
    thumbnail that moved) is not an image, and storing it would put a broken
    picture on the screen of every kid.
    """
    if data.startswith(PNG_MAGIC):
        return "png"
    if data.startswith(JPEG_MAGIC):
        return "jpeg"
    return None


def image_complete(kind: str, data: bytes) -> bool:
    """True when the bytes carry the end of an image of that kind.

    The signature alone says nothing about the body: a download that stopped
    early has the magic bytes of a real image and nothing else, and storing it
    would leave a broken cover that the next run skips. A PNG ends with its IEND
    chunk and a JPEG with its EOI marker.
    """
    if kind == "png":
        return data.endswith(PNG_END)
    return data.endswith(JPEG_END)


def open_url(url: str) -> IO[bytes]:
    """The default opener: libretro-thumbnails over HTTPS, saying who we are."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS)


def _advertised_length(stream: IO[bytes]) -> int | None:
    """The byte count the response promised, or None when it did not say.

    A stand-in and a chunked answer have no `Content-Length`; the real response
    does, and it is what turns a silently short body into the failure it is.
    """
    headers = getattr(stream, "headers", None)
    if headers is None:
        return None
    try:
        length = int(headers.get("Content-Length"))
    except (TypeError, ValueError):
        return None
    return length if length >= 0 else None


def _read_at_most(stream: IO[bytes], limit: int) -> bytes:
    """Read the stream, refusing anything over `limit` (raises CoverTooLarge).

    A body that stops before the length it advertised is the same thing as one
    that dies mid-stream: `IncompleteRead`, which the caller reports and does not
    store.
    """
    blocks: list[bytes] = []
    total = 0
    while total <= limit:
        block = stream.read(CHUNK_SIZE)
        if not block:
            break
        blocks.append(block)
        total += len(block)
    data = b"".join(blocks)
    if len(data) > limit:
        raise CoverTooLarge
    advertised = _advertised_length(stream)
    if advertised is not None and len(data) < advertised:
        raise http.client.IncompleteRead(data, advertised - len(data))
    return data


def _discard(path: Path) -> None:
    """Remove a temporary file, whatever happens.

    The error worth reporting is the one that left it behind, and a cleanup that
    itself raises must not hide it.
    """
    try:
        path.unlink(missing_ok=True)
    except OSError:
        pass


def _write_temporary(directory: Path, name: str, body: bytes) -> Path:
    """Write `body` to a fresh file in `directory`; returns its path.

    Unique per call, so two downloads -- of the same game, or of two -- never
    write over each other's half image.
    """
    handle, raw = tempfile.mkstemp(dir=directory, prefix=f".{name}.", suffix=PART_SUFFIX)
    path = Path(raw)
    try:
        with os.fdopen(handle, "wb") as stream:
            stream.write(body)
    except BaseException:
        _discard(path)
        raise
    return path


def _publish(temporary: Path, target: Path) -> None:
    """Put the whole file at `target`, never replacing one that is there.

    `os.link` is the atomic no-clobber publish: it fails with `FileExistsError`
    when the name is taken. A filesystem without hard links (a FAT stick, say)
    gets the same guarantee from an `O_EXCL` create, and a copy that dies
    half-way leaves nothing behind under a cover name.
    """
    try:
        os.link(temporary, target)
    except FileExistsError:
        raise
    except OSError:
        try:
            handle = open(target, "xb")
        except FileExistsError:
            raise
        try:
            with handle, open(temporary, "rb") as source:
                shutil.copyfileobj(source, handle, CHUNK_SIZE)
        except BaseException:
            target.unlink(missing_ok=True)
            raise


def fetch_cover(
    data: Path,
    jogo: games.Jogo,
    url: str,
    opener: Callable[[str], IO[bytes]],
) -> str | None:
    """Download one cover into the covers directory; why it failed, or None.

    The bytes are checked before anything is written -- a whole PNG or JPEG, and
    no bigger than a cover may be -- and they land through a unique temporary
    file, published under the target name only once they are whole and no cover
    has appeared in the meantime.
    """
    try:
        with opener(url) as response:
            body = _read_at_most(response, MAX_COVER_BYTES)
    except urllib.error.HTTPError as error:
        # An HTTPError is an OSError, so it is caught before the generic case to
        # say which of the two things went wrong.
        if error.code == 404:
            return f"não achei no libretro-thumbnails ({url})"
        return f"não consegui baixar ({url}): HTTP {error.code}"
    except CoverTooLarge:
        limit_mb = MAX_COVER_BYTES // (1024 * 1024)
        return f"passa de {limit_mb} MB; não guardei"
    except (OSError, http.client.HTTPException) as error:
        # HTTPException is the body dying mid-stream (IncompleteRead, say): not
        # an OSError, but the same thing here -- nothing was downloaded.
        return f"não consegui baixar ({url}): {error}"

    kind = image_kind(body)
    if kind is None:
        return "não é uma imagem PNG nem JPEG; não guardei"
    if not image_complete(kind, body):
        return "a imagem veio incompleta; não guardei"

    directory = covers_dir(data)
    target = directory / f"{jogo.id}.{DOWNLOAD_EXTENSIONS[kind]}"
    try:
        # The directory is made here, with the write it serves: a `capas` that
        # cannot be created (it is a file, or the teacher may not write there) is
        # a failed cover, not a traceback out of the recipe.
        directory.mkdir(parents=True, exist_ok=True)
        temporary = _write_temporary(directory, target.name, body)
    except OSError as error:
        return f"não consegui guardar: {error}"

    # The teacher's own image wins, whatever its extension: one can appear while
    # this download runs, and publishing over it would throw away the picture the
    # teacher chose. Every extension is looked at again right here.
    if cover_file(data, jogo) is not None:
        _discard(temporary)
        return None
    try:
        _publish(temporary, target)
    except FileExistsError:
        # Something got to the target name between the check and the publish:
        # the cover that is there stays, and this download did its job.
        _discard(temporary)
        return None
    except OSError as error:
        _discard(temporary)
        return f"não consegui guardar: {error}"
    _discard(temporary)
    return None


def install(
    data: Path,
    jogos: Iterable[games.Jogo],
    *,
    opener: Callable[[str], IO[bytes]] | None = None,
) -> int:
    """Download every cover that is missing; returns how many could not be got.

    A game that already has a cover is skipped -- whatever its extension, since
    that file is what the game page shows and the teacher's own image must win --
    and a cover that cannot be got is reported by game and the run goes on.
    """
    fetch = opener or open_url
    failures = 0
    for jogo in jogos:
        url = thumbnail_url(jogo)
        if url is None:
            continue
        if cover_file(data, jogo) is not None:
            print(f"já tem capa: {jogo.id}")
            continue
        print(f"baixando: {jogo.id} ({url})")
        error = fetch_cover(data, jogo, url, fetch)
        if error is not None:
            print(f"sem capa para {jogo.title} ({jogo.id}): {error}", file=sys.stderr)
            failures += 1
    return failures


def main() -> int:
    """`just sala-capas`: download the covers that are missing."""
    data = config.data_dir()
    try:
        jogos = games.catalogue()
    except (games.CatalogueError, emulatorjs.ManifestError) as error:
        print(f"Erro no catálogo de jogos: {error}", file=sys.stderr)
        return 1

    directory = covers_dir(data)
    print(f"Capas dos jogos em {directory}")
    wanted = [jogo for jogo in jogos if thumbnail_url(jogo) is not None]
    missing = [jogo for jogo in wanted if cover_file(data, jogo) is None]
    if not missing:
        print(f"Tudo pronto: {len(wanted)} jogos com capa.")
        return 0
    print(f"Faltam {len(missing)} de {len(wanted)} capas.")
    failures = install(data, jogos)
    if failures:
        # A cover is decoration: a game without one is shown with the icon of its
        # console, so a miss is a warning and the recipe did its job.
        print(
            f"{failures} capas não vieram: a tela mostra o ícone no lugar delas.",
            file=sys.stderr,
        )
    else:
        print("Pronto! As capas estão na pasta capas do dados.")
    return 0
