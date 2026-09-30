"""The game catalogue (`jogos.yml`), the active game and free mode.

`jogos.yml` is tracked and holds ROM *names* only — never a ROM. It is read and
validated on start: an entry with a bad id, a ROM path that could leave the ROM
directory, an unknown system, a core the emulator manifest does not cover or a
`score` block that does not describe a savestate stops the server with a
Brazilian Portuguese message naming the file and the entry.

Two settings decide what a kid sees: `active_game` (single-game mode) and
`free_mode`. A game is *playable* when its ROM file is under `SALA_ROMS` and the
emulator install has its core; the public API only ever lists playable games, and
the admin list says which piece is missing. The ROM path never comes from the
client: it comes from this catalogue, is resolved inside the ROM directory and is
refused if the result is not there (a symlink that points outside, say).
"""

from __future__ import annotations

import os
import re
import sqlite3
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path, PurePosixPath
from urllib.parse import quote

import yaml

from . import emulatorjs
from .config import SALA_DIR
from .db import delete_setting, get_setting, set_setting

CATALOGUE_FILENAME = "jogos.yml"
ROMS_ENV = "SALA_ROMS"
DEFAULT_ROMS_DIR = Path("/mnt/z/roms")

SETTING_ACTIVE_GAME = "active_game"
SETTING_FREE_MODE = "free_mode"
FREE_MODE_VALUE = "1"
# What the teacher types: `just sala jogo=livre`.
FREE_MODE_CHOICE = "livre"

TYPE_EMULATED = "emulated"
TYPE_BUILTIN = "builtin"
KNOWN_TYPES = (TYPE_EMULATED, TYPE_BUILTIN)

# The systems of the catalogue and the EmulatorJS core each one runs on.
# `jogos.yml` states both, and they are one decision: `system` is what a kid
# reads ("Mega Drive"), picks the console colour and the key chips, and `core` is
# the runtime that boots the ROM. A pair that disagrees -- an arcade game with
# the Super Nintendo core -- would mislabel the console and hand out a game that
# cannot start, so a `core` outside its system's list stops the server.
SYSTEM_CORES: dict[str, tuple[str, ...]] = {
    "atari2600": ("stella2014",),
    "arcade": ("mame2003_plus", "fbneo"),
    "nes": ("fceumm",),
    "snes": ("snes9x",),
    "genesis": ("genesis_plus_gx",),
}
KNOWN_SYSTEMS = tuple(SYSTEM_CORES)

# The EmulatorJS control scheme a core must be told to use. `genesis_plus_gx`
# falls back to `segaMS` on its own, where the START key does nothing at all.
CORE_CONTROL_SCHEMES = {"genesis_plus_gx": "segaMD"}

ID_PATTERN = re.compile(r"[a-z0-9-]+")

# The `score` block: how many packed-BCD bytes a score may be read from, and the
# only multipliers a game may need (the digits it never stores).
SCORE_MAX_BYTES = 4
SCORE_MULTIPLIERS = (1, 10, 100)
BYTE_MAX = 0xFF

NOT_FOUND_MESSAGE = "Não encontrei esse jogo."


class CatalogueError(Exception):
    """`jogos.yml` is missing or has a bad entry (pt-BR message)."""


class UnknownGame(Exception):
    """`just sala jogo=<id>` named something the catalogue does not have."""


@dataclass(frozen=True)
class Control:
    """One row of a game's controls: the keys that do something, and what."""

    keys: tuple[str, ...]
    action: str


@dataclass(frozen=True)
class InGame:
    """The savestate byte that tells a running match from the attract screen.

    The catalogue gives the byte value that means "playing" (`is`) or the one
    that means "not playing" (`not`), never both.
    """

    offset: int
    is_value: int | None = None
    not_value: int | None = None

    def payload(self) -> dict:
        flag: dict = {"offset": self.offset}
        if self.is_value is not None:
            flag["is"] = self.is_value
        else:
            flag["not"] = self.not_value
        return flag


@dataclass(frozen=True)
class ScoreBlock:
    """Where a game keeps its score in the core's savestate (`score` in the file).

    `bcd` lists the offsets of the packed-BCD bytes, most significant first, and
    `multiplier` restores the digits the game does not store (Frogger never keeps
    the constant units 0).
    """

    bcd: tuple[int, ...]
    multiplier: int
    in_game: InGame

    def payload(self) -> dict:
        return {
            "bcd": list(self.bcd),
            "multiplier": self.multiplier,
            "inGame": self.in_game.payload(),
        }


@dataclass(frozen=True)
class Jogo:
    """One catalogue entry. `system`, `core` and `rom` are None for builtin games."""

    id: str
    title: str
    type: str
    system: str | None
    core: str | None
    rom: str | None
    year: int
    maker: str
    about: str
    controls: tuple[Control, ...]
    score: ScoreBlock | None = None


def catalogue_path() -> Path:
    return SALA_DIR / CATALOGUE_FILENAME


@lru_cache(maxsize=1)
def catalogue() -> tuple[Jogo, ...]:
    """The tracked catalogue, read and validated once."""
    return load_catalogue(catalogue_path())


def load_catalogue(path: Path) -> tuple[Jogo, ...]:
    """Read and validate a catalogue file; raise CatalogueError on a bad entry."""
    try:
        text = path.read_text(encoding="utf-8")
    except OSError as error:
        raise CatalogueError(f"Não consegui ler {path}: {error}") from error
    try:
        raw = yaml.safe_load(text)
    except yaml.YAMLError as error:
        raise CatalogueError(f"{path} não é um YAML válido: {error}") from error
    if not isinstance(raw, list) or not raw:
        raise CatalogueError(f"{path}: o catálogo precisa ser uma lista de jogos.")
    jogos: list[Jogo] = []
    seen: set[str] = set()
    for index, entry in enumerate(raw, start=1):
        if not isinstance(entry, dict):
            raise CatalogueError(f"{path}: entrada {index}: esperava um jogo (id, title, …).")
        where = _where(path, index, entry)
        jogo = _parse_entry(where, entry)
        if jogo.id in seen:
            raise CatalogueError(f"{where}: o id '{jogo.id}' já apareceu antes.")
        seen.add(jogo.id)
        jogos.append(jogo)
    return tuple(jogos)


def by_id(game_id: str | None) -> Jogo | None:
    """The catalogue entry with this id, or None."""
    if not game_id:
        return None
    for jogo in catalogue():
        if jogo.id == game_id:
            return jogo
    return None


def control_scheme(core: str | None) -> str | None:
    """The `EJS_controlScheme` a core needs, or None to leave the default."""
    return CORE_CONTROL_SCHEMES.get(core or "")


# --- catalogue validation --------------------------------------------------


def _where(path: Path, index: int, entry: dict) -> str:
    """`<file>: entrada N ("id")` — the label every error of an entry carries."""
    identifier = entry.get("id")
    label = f"{path}: entrada {index}"
    if isinstance(identifier, str) and identifier:
        label += f' ("{identifier}")'
    return label


def _text(where: str, entry: dict, key: str) -> str:
    value = entry.get(key)
    if not isinstance(value, str) or not value.strip():
        raise CatalogueError(f"{where}: falta o campo '{key}' (texto).")
    return value.strip()


def _parse_entry(where: str, entry: dict) -> Jogo:
    identifier = _text(where, entry, "id")
    if ID_PATTERN.fullmatch(identifier) is None:
        raise CatalogueError(
            f"{where}: o id '{identifier}' precisa usar só minúsculas, números e hífen (a-z0-9-)."
        )
    title = _text(where, entry, "title")
    maker = _text(where, entry, "maker")
    about = _text(where, entry, "about")
    kind = _text(where, entry, "type")
    if kind not in KNOWN_TYPES:
        raise CatalogueError(f"{where}: o tipo '{kind}' precisa ser 'emulated' ou 'builtin'.")
    year = entry.get("year")
    if isinstance(year, bool) or not isinstance(year, int) or year <= 0:
        raise CatalogueError(f"{where}: o campo 'year' precisa ser um ano (número).")
    controls = _controls(where, entry)

    if kind == TYPE_BUILTIN:
        extra = [key for key in ("system", "core", "rom", "score") if entry.get(key) is not None]
        if extra:
            raise CatalogueError(
                f"{where}: um jogo 'builtin' não tem {', '.join(extra)} (ele é a nossa página)."
            )
        return Jogo(
            id=identifier,
            title=title,
            type=kind,
            system=None,
            core=None,
            rom=None,
            year=year,
            maker=maker,
            about=about,
            controls=controls,
        )

    system = _text(where, entry, "system")
    if system not in KNOWN_SYSTEMS:
        raise CatalogueError(
            f"{where}: sistema desconhecido: '{system}'. Conheço: {', '.join(KNOWN_SYSTEMS)}."
        )
    core = _text(where, entry, "core")
    cores = emulatorjs.known_cores()
    if core not in cores:
        raise CatalogueError(
            f"{where}: núcleo (core) desconhecido: '{core}'. O manifesto tem: {', '.join(cores)}."
        )
    if core not in SYSTEM_CORES[system]:
        raise CatalogueError(
            f"{where}: o núcleo (core) '{core}' não é o de {system}."
            f" Use: {', '.join(SYSTEM_CORES[system])}."
        )
    rom = _text(where, entry, "rom")
    if any(ord(character) < 32 or ord(character) == 127 for character in rom):
        raise CatalogueError(
            f"{where}: o caminho da ROM tem um caractere de controle: {rom!r}."
            " O nome do arquivo não pode ter esse caractere."
        )
    parts = PurePosixPath(rom).parts
    if PurePosixPath(rom).is_absolute() or ".." in parts or "\\" in rom:
        raise CatalogueError(
            f"{where}: o caminho da ROM ('{rom}') precisa ser relativo e não pode sair da"
            " pasta de ROMs (nada de / nem ..)."
        )
    return Jogo(
        id=identifier,
        title=title,
        type=kind,
        system=system,
        core=core,
        rom=rom,
        year=year,
        maker=maker,
        about=about,
        controls=controls,
        score=_score_block(where, entry),
    )


def _controls(where: str, entry: dict) -> tuple[Control, ...]:
    rows = entry.get("controls")
    if not isinstance(rows, list) or not rows:
        raise CatalogueError(f"{where}: falta a lista 'controls' (as teclas e o que elas fazem).")
    controls = []
    for position, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise CatalogueError(f"{where}: controls {position}: esperava 'keys' e 'action'.")
        keys = row.get("keys")
        if (
            not isinstance(keys, list)
            or not keys
            or not all(isinstance(key, str) and key.strip() for key in keys)
        ):
            raise CatalogueError(f"{where}: controls {position}: 'keys' precisa ser uma lista de teclas.")
        action = row.get("action")
        if not isinstance(action, str) or not action.strip():
            raise CatalogueError(f"{where}: controls {position}: falta a 'action' em português.")
        controls.append(Control(keys=tuple(key.strip() for key in keys), action=action.strip()))
    return tuple(controls)


def _is_offset(value: object) -> bool:
    """True for a whole number that can be a savestate offset (a bool is not)."""
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _is_byte(value: object) -> bool:
    """True for a whole number that fits a byte (a bool is not one)."""
    return _is_offset(value) and value <= BYTE_MAX


def _score_block(where: str, entry: dict) -> ScoreBlock | None:
    """The `score` block of an emulated entry, or None when the game has none.

    Only an emulated game can have one: its score lives in a savestate the page
    reads. The offsets are not checked against the state length here -- that is
    the core's business at runtime -- but they have to be numbers that could be
    one, and the in-game flag has to say which byte value means "playing".
    """
    raw = entry.get("score")
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise CatalogueError(
            f"{where}: 'score' precisa ser um bloco com 'bcd', 'multiplier' e 'in_game'."
        )
    bcd = raw.get("bcd")
    if (
        not isinstance(bcd, list)
        or not 1 <= len(bcd) <= SCORE_MAX_BYTES
        or not all(_is_offset(byte) for byte in bcd)
    ):
        raise CatalogueError(
            f"{where}: 'score.bcd' precisa ser uma lista de 1 a {SCORE_MAX_BYTES} posições"
            " (números inteiros ≥ 0), da mais significativa para a menos."
        )
    multiplier = raw.get("multiplier")
    if (
        not isinstance(multiplier, int)
        or isinstance(multiplier, bool)
        or multiplier not in SCORE_MULTIPLIERS
    ):
        raise CatalogueError(
            f"{where}: 'score.multiplier' precisa ser 1, 10 ou 100 (os dígitos que o jogo"
            " não guarda)."
        )
    # The server refuses a pontuação above its own cap, so a block that could
    # decode one would only ever hand the kid a save that cannot succeed: the
    # widest number these bytes can hold, times the multiplier, has to fit.
    # `scores` imports this module (`by_id`), so it is imported here.
    from . import scores

    highest = int("99" * len(bcd)) * multiplier
    if highest > scores.SCORE_MAX:
        highest_text = f"{highest:,}".replace(",", ".")
        raise CatalogueError(
            f"{where}: 'score' pode ler até {highest_text} pontos, acima do limite de"
            f" {scores.SCORE_MAX_TEXT}."
        )
    return ScoreBlock(
        bcd=tuple(bcd), multiplier=multiplier, in_game=_in_game(where, raw.get("in_game"))
    )


def _in_game(where: str, raw: object) -> InGame:
    """The `in_game` flag of a `score` block: an offset and `is` or `not`."""
    if not isinstance(raw, dict):
        raise CatalogueError(
            f"{where}: 'score.in_game' precisa de 'offset' e de um entre 'is' e 'not'."
        )
    offset = raw.get("offset")
    if not _is_offset(offset):
        raise CatalogueError(f"{where}: 'score.in_game.offset' precisa ser um número inteiro ≥ 0.")
    has_is, has_not = "is" in raw, "not" in raw
    if has_is == has_not:
        raise CatalogueError(
            f"{where}: 'score.in_game' precisa de exatamente um entre 'is' e 'not'"
            " (o byte que diz que o jogo começou)."
        )
    key = "is" if has_is else "not"
    value = raw[key]
    if not _is_byte(value):
        raise CatalogueError(f"{where}: 'score.in_game.{key}' precisa ser um byte (0 a 255).")
    return InGame(
        offset=offset, is_value=value if has_is else None, not_value=None if has_is else value
    )


# --- settings, modes and visibility ----------------------------------------


def free_mode(connection: sqlite3.Connection) -> bool:
    return get_setting(connection, SETTING_FREE_MODE) == FREE_MODE_VALUE


def active_game(connection: sqlite3.Connection) -> str | None:
    """The id of the active game, or None when there is none (or it is unknown)."""
    value = get_setting(connection, SETTING_ACTIVE_GAME)
    return value if by_id(value) is not None else None


def mode_games(connection: sqlite3.Connection) -> list[Jogo]:
    """The games this mode offers, playable or not."""
    if free_mode(connection):
        return list(catalogue())
    jogo = by_id(active_game(connection))
    return [jogo] if jogo is not None else []


def is_offered(connection: sqlite3.Connection, jogo: Jogo) -> bool:
    """True when the mode lets this game be opened at all."""
    if free_mode(connection):
        return True
    return active_game(connection) == jogo.id


def visible_games(connection: sqlite3.Connection) -> list[Jogo]:
    """What a kid may see: what the mode offers and is playable right now."""
    return [jogo for jogo in mode_games(connection) if playable(jogo)]


def roms_dir() -> Path:
    """Where the ROMs are: `SALA_ROMS`, else `/mnt/z/roms`."""
    override = os.environ.get(ROMS_ENV)
    if override:
        return Path(override).expanduser()
    return DEFAULT_ROMS_DIR


def rom_file(jogo: Jogo) -> Path | None:
    """The ROM file of an emulated game, or None when it is not safely there.

    The path comes from the catalogue alone. It is resolved (symlinks and all)
    and refused unless the result is still inside the ROM directory, so a
    symlink planted there cannot hand out a file from anywhere else.
    """
    if jogo.type != TYPE_EMULATED or not jogo.rom:
        return None
    try:
        base = roms_dir().resolve()
        resolved = (base / jogo.rom).resolve()
    except (OSError, ValueError):
        # ValueError is the path itself being unusable (a NUL in the name, say):
        # the catalogue refuses those on start, and this is the same answer for a
        # `Jogo` built by hand -- not a file, so not a 500.
        return None
    if not resolved.is_relative_to(base) or not resolved.is_file():
        return None
    return resolved


def rom_present(jogo: Jogo) -> bool:
    return rom_file(jogo) is not None


def rom_url(jogo: Jogo) -> str:
    """The URL the emulator loads the ROM from.

    EmulatorJS writes the ROM into its virtual filesystem under the last path
    segment of `EJS_gameUrl`, and the arcade cores need that name to know which
    ROM set to load: `/api/games/frogger/rom` would be stored as `rom` and MAME
    would open its own menu instead of the game. The URL therefore ends with the
    ROM's own file name — a name the client only ever sees, never chooses.
    """
    name = PurePosixPath(jogo.rom).name if jogo.rom else jogo.id
    return f"/api/games/{jogo.id}/rom/{quote(name, safe='()')}"


def core_installed(jogo: Jogo) -> bool:
    return jogo.core is not None and emulatorjs.core_installed(jogo.core)


def missing_kind(jogo: Jogo) -> str | None:
    """Which piece is missing: 'rom', 'core' or nothing at all."""
    if jogo.type != TYPE_EMULATED:
        return None
    if not rom_present(jogo):
        return "rom"
    if not core_installed(jogo):
        return "core"
    return None


def playable(jogo: Jogo) -> bool:
    return missing_kind(jogo) is None


def allows_auto_score(jogo: Jogo) -> bool:
    """True when the game may report a score by itself.

    Our own page counts the points and tells the server when the match ends; an
    emulated game can only do the same when the catalogue says where its score
    lives in the savestate (the `score` block), which is what the play page reads
    to follow the game.
    """
    return jogo.type == TYPE_BUILTIN or jogo.score is not None


def not_ready_message(jogo: Jogo) -> str:
    """Why this game cannot be played, in pt-BR (shown to the teacher)."""
    missing = missing_kind(jogo)
    if missing == "rom":
        return f"Falta a ROM de {jogo.title}: confira a pasta de ROMs (SALA_ROMS)."
    if missing == "core":
        return f"Falta o emulador de {jogo.title}: rode just sala-emulador."
    return f"{jogo.title} não está pronto para jogar."


# --- payloads --------------------------------------------------------------


def game_payload(jogo: Jogo) -> dict:
    """The public shape of a game (what a kid's screen shows)."""
    return {
        "id": jogo.id,
        "title": jogo.title,
        "type": jogo.type,
        "system": jogo.system,
        "year": jogo.year,
        "maker": jogo.maker,
        "about": jogo.about,
        "controls": [{"keys": list(control.keys), "action": control.action} for control in jogo.controls],
        "autoScore": allows_auto_score(jogo),
    }


def admin_payload(jogo: Jogo) -> dict:
    """The teacher's shape: the technical bits plus what is missing."""
    return {
        "id": jogo.id,
        "title": jogo.title,
        "type": jogo.type,
        "system": jogo.system,
        "core": jogo.core,
        "year": jogo.year,
        "maker": jogo.maker,
        "playable": playable(jogo),
        "missing": missing_kind(jogo),
    }


# --- the teacher's command line --------------------------------------------


def unknown_game_message(choice: str) -> str:
    ids = ", ".join(jogo.id for jogo in catalogue())
    return (
        f"Jogo desconhecido: {choice}. Use um destes: {ids}"
        f" — ou {FREE_MODE_CHOICE} para o modo livre."
    )


def choose(connection: sqlite3.Connection, choice: str) -> None:
    """Apply `just sala jogo=<choice>`: one game in single mode, or free mode.

    Naming a game turns free mode off: the teacher who says which game the class
    plays does not want the kids to still see the whole catalogue.
    """
    if choice == FREE_MODE_CHOICE:
        set_setting(connection, SETTING_FREE_MODE, FREE_MODE_VALUE)
        connection.commit()
        return
    jogo = by_id(choice)
    if jogo is None:
        raise UnknownGame(unknown_game_message(choice))
    set_setting(connection, SETTING_ACTIVE_GAME, jogo.id)
    delete_setting(connection, SETTING_FREE_MODE)
    connection.commit()
