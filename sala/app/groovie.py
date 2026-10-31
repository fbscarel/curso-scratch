"""The Groovie install: the tracked manifest `groovie.sha256`, the gitignored
`vendor/groovie` directory and the checked download that fills it
(`just sala-groovie` → `python -m app.groovie_download`).

Groovie is a browser drum machine (MIT, samples CC0). Only the files the page
loads are downloaded — the published repository's docs, tests, tools and other
files it does not need are not part of the install — and every one of them is
verified against the sha256 of the manifest, so a half-downloaded or swapped
file never reaches the classroom.

The page's one vendor-hosted runtime call (a visit counter on a third-party
service) is taken out here, before the file is stored: the page served in class
must not reach anything outside this laptop. `audit()` is the check that says so,
and it runs at the end of the download as well as in the test suite.

`SALA_GROOVIE` overrides the install directory (tests point it at a tmp dir).
"""

from __future__ import annotations

import http.client
import os
import re
import shutil
import sys
import urllib.request
from collections.abc import Callable, Iterator, Mapping
from functools import lru_cache
from pathlib import Path
from typing import IO

from .config import SALA_DIR
from .emulatorjs import (
    ManifestError,
    file_matches,
    load_manifest,
    missing_files,
    sha256_of,
)

MANIFEST_FILENAME = "groovie.sha256"
DATA_ENV = "SALA_GROOVIE"
VENDOR_PARTS = ("vendor", "groovie")
# The commit the manifest was made from: a tag would move, and the raw files of
# a branch are whatever it points at today.
COMMIT = "7ad01cd57c95134f0945d6f1159b5bf232d3dd0e"
RAW_BASE = f"https://raw.githubusercontent.com/maximecb/groovie/{COMMIT}/"
USER_AGENT = "Sala (servidor local da sala de aula)"
PART_SUFFIX = ".parcial"
CHUNK_SIZE = 1024 * 256
INDEX_FILENAME = "index.html"
# Written only when every manifest entry is on disk with its sha256 and the
# vendor-call audit passed; a half-downloaded install has no marker, so the page
# says it is not installed instead of playing without its samples. A dotfile, so
# the page route refuses it like any other.
MARKER_FILENAME = ".instalado"

# The exact block that calls the visit counter, and what takes its place. The
# anchors are pinned to the commit above: a bump that moves them has to look at
# the page again instead of silently serving the call.
COUNTER_START = b"\n// Count this visit, and show what the count is now at."
COUNTER_END = b".catch(err => console.error(`Could not get the visit count: ${err.message}`));\n"
COUNTER_REPLACEMENT = (
    b"\n// Sala: o contador de visitas do site original foi retirado daqui. Ele\n"
    b"// chamaria um servico de fora do notebook da sala, e esta pagina nao fala\n"
    b"// com nada fora deste servidor.\n"
)

# What a vendor-hosted call looks like in the files we serve: an absolute URL in
# a script or stylesheet, or an element of the page that loads something from
# another site. A canonical/og tag or a link a kid can click is neither.
EXTERNAL_URL = re.compile(rb"https?://")
EXTERNAL_SRC = re.compile(
    rb"<(?:script|img|iframe|audio|video|source|embed)\b[^>]*\bsrc\s*=\s*[\"']https?://",
    re.IGNORECASE,
)
LINK_TAG = re.compile(rb"<link\b[^>]*>", re.IGNORECASE)
LINK_REL = re.compile(rb"rel\s*=\s*[\"']([^\"']*)", re.IGNORECASE)
EXTERNAL_HREF = re.compile(rb"href\s*=\s*[\"']https?://", re.IGNORECASE)
# A `<script>`/`<style>` written inside the page: its body is code, and an
# absolute URL there is a call the browser makes just like a `src` would.
INLINE_BLOCK = re.compile(rb"<(script|style)\b[^>]*>(.*?)</\1\s*>", re.IGNORECASE | re.DOTALL)
# The `rel` values that make the browser fetch the file; `canonical` and the
# preview tags are metadata, and `alternate` alone is not a load either.
LOADING_RELS = (b"stylesheet", b"icon", b"preload", b"modulepreload", b"manifest")
AUDITED_SUFFIXES = (".js", ".css", ".html")


class PatchError(Exception):
    """`main.js` is not the file the patch was written for (pt-BR message)."""


def manifest_path() -> Path:
    return SALA_DIR / MANIFEST_FILENAME


def data_dir() -> Path:
    """Where the Groovie files live: `SALA_GROOVIE`, else `vendor/groovie`."""
    override = os.environ.get(DATA_ENV)
    if override:
        return Path(override).expanduser()
    return SALA_DIR.joinpath(*VENDOR_PARTS)


@lru_cache(maxsize=1)
def manifest() -> dict[str, str]:
    """The tracked manifest, read once."""
    return load_manifest(manifest_path())


def marker_path(directory: Path | None = None) -> Path:
    return (directory or data_dir()) / MARKER_FILENAME


def installed() -> bool:
    """True when a complete, audited install is on disk.

    The marker is what says so: `index.html` alone can be a download that died
    halfway, and the page would play without the samples it needs.
    """
    return marker_path().is_file()


def patch_main_js(data: bytes) -> bytes:
    """`main.js` without the visit counter; raise PatchError if it is not there."""
    start = data.find(COUNTER_START)
    end = data.find(COUNTER_END, start) if start >= 0 else -1
    if start < 0 or end < 0:
        raise PatchError(
            "main.js não tem o contador de visitas na posição esperada."
            " Confira o commit do manifesto antes de baixar de novo."
        )
    return data[:start] + COUNTER_REPLACEMENT + data[end + len(COUNTER_END) :]


PATCHES: dict[str, Callable[[bytes], bytes]] = {"main.js": patch_main_js}


def _loads_external_file(page: bytes) -> bool:
    """True when a `<link>` of the page makes the browser fetch another site."""
    for tag in LINK_TAG.finditer(page):
        if not EXTERNAL_HREF.search(tag.group(0)):
            continue
        rel = LINK_REL.search(tag.group(0))
        if rel is not None and any(word in rel.group(1).lower() for word in LOADING_RELS):
            return True
    return False


def _inline_finding(page: bytes) -> str | None:
    """The finding for a `<script>`/`<style>` written in the page, or None.

    The page's policy has no `'unsafe-inline'`, so an inline block is blocked by
    the browser: the page would ship broken with a green audit. One that names an
    absolute URL is reported as the call it is; any other non-empty one is
    reported as the block it is.
    """
    bodies = [block.group(2).strip() for block in INLINE_BLOCK.finditer(page)]
    bodies = [body for body in bodies if body]
    if not bodies:
        return None
    if any(EXTERNAL_URL.search(body) for body in bodies):
        return "um script ou estilo da página chama um endereço de fora."
    return "tem um script ou estilo escrito na página, e a política da página não permite."


def audit(files: Mapping[str, bytes]) -> list[str]:
    """The vendor-hosted calls left in a tree of files to serve (pt-BR findings).

    Scripts and stylesheets may not name an absolute URL at all, the page may not
    load a resource from one, and it may not carry a script or style written in
    the document: the first two would make a lab PC talk to a server that is not
    the teacher's laptop, and the page's policy blocks the third.
    """
    findings = []
    for name, data in files.items():
        suffix = Path(name).suffix.lower()
        if suffix == ".html":
            inline = _inline_finding(data)
            if inline is not None:
                findings.append(f"{name}: {inline}")
            elif EXTERNAL_SRC.search(data) or _loads_external_file(data):
                findings.append(f"{name}: carrega um arquivo de outro site.")
            continue
        if suffix not in AUDITED_SUFFIXES:
            continue
        urls = EXTERNAL_URL.findall(data)
        if urls:
            findings.append(f"{name}: chama um endereço de fora ({len(urls)}).")
    return findings


def open_url(url: str) -> IO[bytes]:
    """The default opener: the pinned raw file over HTTPS, saying who we are."""
    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
    return urllib.request.urlopen(request, timeout=120)


def install(
    directory: Path,
    files: dict[str, str],
    *,
    opener: Callable[[str], IO[bytes]] | None = None,
) -> int:
    """Download what is missing or wrong into `directory`; 0 when all is well.

    Each file is written to `<name>.parcial` beside its target, patched when the
    manifest says its served bytes differ from the published ones, and renamed
    over the target only after the sha256 matched: a mismatch (or a failed
    download) removes the partial file and leaves whatever was there before.

    The completion marker goes first: from here until `main()` audits the tree
    and writes it again, the install is not ready, whatever the last run left.
    """
    opener = opener or open_url
    marker_path(directory).unlink(missing_ok=True)
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
            with opener(RAW_BASE + name) as response, open(partial, "wb") as handle:
                shutil.copyfileobj(response, handle, CHUNK_SIZE)
        except (OSError, http.client.HTTPException) as error:
            partial.unlink(missing_ok=True)
            print(f"Erro: não consegui baixar {RAW_BASE + name}: {error}", file=sys.stderr)
            failures += 1
            continue
        patch = PATCHES.get(name)
        if patch is not None:
            try:
                partial.write_bytes(patch(partial.read_bytes()))
            except PatchError as error:
                partial.unlink(missing_ok=True)
                print(f"Erro: {name}: {error}", file=sys.stderr)
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


def audited_files(directory: Path, files: dict[str, str]) -> Iterator[tuple[str, bytes]]:
    """The installed files the vendor-call audit reads: the page, scripts, styles."""
    for name in files:
        if Path(name).suffix.lower() in AUDITED_SUFFIXES:
            path = directory / name
            try:
                yield name, path.read_bytes()
            except OSError:
                continue


def main() -> int:
    """`just sala-groovie`: download what is missing, then check the calls."""
    try:
        files = manifest()
    except ManifestError as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1
    directory = data_dir()
    print(f"Groovie ({COMMIT[:7]}) em {directory}")
    # Whatever the last run left, this one starts from "not ready": the marker
    # goes back only after every file verified and the audit passed.
    marker_path(directory).unlink(missing_ok=True)
    pending = list(missing_files(directory, files))
    if not pending:
        print(f"Tudo pronto: {len(files)} arquivos conferidos.")
    else:
        print(f"Faltam {len(pending)} de {len(files)} arquivos.")
        if install(directory, files) != 0:
            print("Alguns arquivos falharam: veja as mensagens acima.", file=sys.stderr)
            return 1
    findings = audit(dict(audited_files(directory, files)))
    if findings:
        print("Erro: a página chamaria serviços de fora do notebook:", file=sys.stderr)
        for finding in findings:
            print(f"  {finding}", file=sys.stderr)
        return 1
    marker_path(directory).write_text(f"{COMMIT}\n{len(files)} arquivos\n", encoding="utf-8")
    print("Nenhuma chamada para fora do notebook: a página está pronta.")
    return 0
