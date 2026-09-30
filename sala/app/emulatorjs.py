"""The EmulatorJS installation: the tracked manifest `emulador.sha256`, the
gitignored `vendor/emulatorjs/data` directory and the checked download that fills
it (`just sala-emulador` → `python -m app.emulator_download`, the wrapper this
package does not import, so runpy does not warn about it).

Nothing here ships in the repo: the runtime files come from the pinned CDN
release (4.2.3) and every one of them is verified against the sha256 of the
manifest, so a half-downloaded or swapped file never reaches the classroom. The
manifest is also what tells the rest of the app which cores exist — `games.py`
validates the catalogue against it.

`SALA_EMULADOR` overrides the data directory (tests point it at a tmp dir; a
teacher can put the install on another disk).
"""

from __future__ import annotations

import hashlib
import http.client
import os
import shutil
import sys
import urllib.request
from functools import lru_cache
from pathlib import Path, PurePosixPath
from typing import IO, Callable, Iterator

from .config import SALA_DIR

MANIFEST_FILENAME = "emulador.sha256"
DATA_ENV = "SALA_EMULADOR"
VENDOR_PARTS = ("vendor", "emulatorjs", "data")
VERSION = "4.2.3"
CDN_BASE = f"https://cdn.emulatorjs.org/{VERSION}/data/"
# The CDN answers 403 to urllib's default `Python-urllib/x.y`; a request has to
# say who it is.
USER_AGENT = f"Sala/{VERSION} (servidor local da sala de aula)"
# The download lands here first and is only renamed into place once its sha256
# matches, so a dropped connection never leaves a file the app would serve.
PART_SUFFIX = ".parcial"
CHUNK_SIZE = 1024 * 256
# The report of each core, as it appears in the manifest: `cores/reports/x.json`.
REPORT_DIR = "cores/reports"
CORE_FILENAME_SUFFIX = "-wasm.data"


class ManifestError(Exception):
    """`emulador.sha256` is missing or unreadable (pt-BR message)."""


def manifest_path() -> Path:
    return SALA_DIR / MANIFEST_FILENAME


def data_dir() -> Path:
    """Where the EmulatorJS files live: `SALA_EMULADOR`, else `vendor/emulatorjs/data`."""
    override = os.environ.get(DATA_ENV)
    if override:
        return Path(override).expanduser()
    return SALA_DIR.joinpath(*VENDOR_PARTS)


def load_manifest(path: Path) -> dict[str, str]:
    """Read `<sha256>  <path>` lines into a mapping; raise ManifestError.

    A line whose hash is not a sha256 or whose path could climb out of the data
    directory is refused here, before any of it is used to build a path.
    """
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as error:
        raise ManifestError(f"Não consegui ler {path}: {error}") from error
    files: dict[str, str] = {}
    for number, line in enumerate(text.splitlines(), start=1):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        parts = line.split(None, 1)
        if len(parts) != 2:
            raise ManifestError(f"{path}: linha {number}: esperava '<sha256>  <caminho>'.")
        digest, name = parts[0].strip(), parts[1].strip()
        if len(digest) != 64 or any(character not in "0123456789abcdef" for character in digest):
            raise ManifestError(f"{path}: linha {number}: '{digest}' não é um sha256.")
        if not name or name.startswith("/") or ".." in PurePosixPath(name).parts:
            raise ManifestError(f"{path}: linha {number}: caminho inválido: '{name}'.")
        files[name] = digest
    if not files:
        raise ManifestError(f"{path}: o manifesto está vazio.")
    return files


@lru_cache(maxsize=1)
def manifest() -> dict[str, str]:
    """The tracked manifest, read once."""
    return load_manifest(manifest_path())


def known_cores() -> tuple[str, ...]:
    """The cores the manifest covers, taken from `cores/reports/<core>.json`."""
    cores = []
    for name in manifest():
        parts = PurePosixPath(name).parts
        if len(parts) == 3 and parts[0] == "cores" and parts[1] == "reports":
            core = parts[2][: -len(".json")] if parts[2].endswith(".json") else None
            if core and core not in cores:
                cores.append(core)
    return tuple(cores)


def core_path(core: str) -> Path:
    """The wasm file of a core inside the data directory (what EmulatorJS loads)."""
    return data_dir() / "cores" / f"{core}{CORE_FILENAME_SUFFIX}"


def core_installed(core: str) -> bool:
    return core_path(core).is_file()


def sha256_of(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(CHUNK_SIZE), b""):
            digest.update(block)
    return digest.hexdigest()


def file_matches(path: Path, expected: str) -> bool:
    """True when `path` exists and its sha256 is `expected`."""
    if not path.is_file():
        return False
    try:
        return sha256_of(path) == expected
    except OSError:
        return False


def open_url(url: str) -> IO[bytes]:
    """The default opener: the pinned CDN over HTTPS, saying who we are."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return urllib.request.urlopen(request, timeout=120)


def install(
    directory: Path,
    files: dict[str, str],
    *,
    opener: Callable[[str], IO[bytes]] | None = None,
) -> int:
    """Download what is missing or wrong into `directory`; 0 when all is well.

    Every file is written to `<name>.parcial` in the same directory and renamed
    over the target only after its sha256 matched: a mismatch (or a failed
    download) removes the partial file and leaves whatever was there before, and
    the exit code says something went wrong.
    """
    opener = opener or open_url
    failures = 0
    for name, expected in files.items():
        target = directory / name
        if file_matches(target, expected):
            print(f"já está pronto: {name}")
            continue
        print(f"baixando: {name}")
        target.parent.mkdir(parents=True, exist_ok=True)
        partial = target.with_name(target.name + PART_SUFFIX)
        try:
            with opener(CDN_BASE + name) as response, open(partial, "wb") as handle:
                shutil.copyfileobj(response, handle, CHUNK_SIZE)
        except (OSError, http.client.HTTPException) as error:
            # HTTPException is the body dying mid-stream (IncompleteRead, say):
            # not an OSError, but the same thing to the teacher -- nothing was
            # downloaded, and the partial file must not stay behind. Catching
            # both in the one place is what keeps that from being forgotten.
            partial.unlink(missing_ok=True)
            print(f"Erro: não consegui baixar {CDN_BASE + name}: {error}", file=sys.stderr)
            failures += 1
            continue
        digest = sha256_of(partial)
        if digest != expected:
            partial.unlink(missing_ok=True)
            print(
                f"Erro: {name} não confere o sha256 (esperado {expected}, veio {digest})."
                " O arquivo não foi guardado.",
                file=sys.stderr,
            )
            failures += 1
            continue
        os.replace(partial, target)
    return 1 if failures else 0


def missing_files(directory: Path, files: dict[str, str]) -> Iterator[str]:
    """The manifest entries that are not present with the right hash."""
    for name, expected in files.items():
        if not file_matches(directory / name, expected):
            yield name


def main() -> int:
    """`just sala-emulador`: download what is missing and say how it went."""
    try:
        files = manifest()
    except ManifestError as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1
    directory = data_dir()
    print(f"EmulatorJS {VERSION} em {directory}")
    pending = list(missing_files(directory, files))
    if not pending:
        print(f"Tudo pronto: {len(files)} arquivos conferidos.")
        return 0
    print(f"Faltam {len(pending)} de {len(files)} arquivos.")
    code = install(directory, files)
    if code == 0:
        print("Pronto! O emulador está instalado.")
    else:
        print("Alguns arquivos falharam: veja as mensagens acima.", file=sys.stderr)
    return code
