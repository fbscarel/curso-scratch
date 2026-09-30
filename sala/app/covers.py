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
import sys
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
# What the download writes: one extension for every game, so a second run finds
# its own file.
DOWNLOAD_EXTENSION = "png"
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

# The browser may keep a cover for a day: it is a file on the teacher's laptop,
# and it changes only when the teacher changes it.
CACHE_SECONDS = 60 * 60 * 24

USER_AGENT = "Sala (servidor local da sala de aula)"
TIMEOUT_SECONDS = 30
# The download lands under this suffix and is renamed into place once it is
# whole, so a dropped connection never leaves a half image to be served.
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
    """The image to show for a game: the first extension that is there, or None."""
    for extension in COVER_EXTENSIONS:
        path = covers_dir(data) / f"{jogo.id}.{extension}"
        if path.is_file():
            return path
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


def open_url(url: str) -> IO[bytes]:
    """The default opener: libretro-thumbnails over HTTPS, saying who we are."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return urllib.request.urlopen(request, timeout=TIMEOUT_SECONDS)


def _read_at_most(stream: IO[bytes], limit: int) -> bytes:
    """Read the stream, refusing anything over `limit` (raises CoverTooLarge)."""
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
    return data


def fetch_cover(
    directory: Path,
    jogo: games.Jogo,
    url: str,
    opener: Callable[[str], IO[bytes]],
) -> str | None:
    """Download one cover into `<directory>/<id>.png`; why it failed, or None.

    The bytes are checked before anything is written -- a PNG or a JPEG, and no
    bigger than a cover may be -- and the file lands through a `.parcial` name
    renamed over the target only once it is whole.
    """
    try:
        with opener(url) as response:
            data = _read_at_most(response, MAX_COVER_BYTES)
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

    if image_kind(data) is None:
        return "não é uma imagem PNG nem JPEG; não guardei"

    directory.mkdir(parents=True, exist_ok=True)
    target = directory / f"{jogo.id}.{DOWNLOAD_EXTENSION}"
    partial = target.with_name(target.name + PART_SUFFIX)
    try:
        partial.write_bytes(data)
        os.replace(partial, target)
    except OSError as error:
        partial.unlink(missing_ok=True)
        return f"não consegui guardar: {error}"
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
    directory = covers_dir(data)
    failures = 0
    for jogo in jogos:
        url = thumbnail_url(jogo)
        if url is None:
            continue
        if cover_file(data, jogo) is not None:
            print(f"já tem capa: {jogo.id}")
            continue
        print(f"baixando: {jogo.id} ({url})")
        error = fetch_cover(directory, jogo, url, fetch)
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
