"""The emulator page: its CSP, the JSON configuration handed to
EmulatorJS, the files under `/emulador/data/` and the pt-BR 404s."""

from __future__ import annotations

import json
from html.parser import HTMLParser

import pytest

from app import emulator_page, games

PLAY = "/emulador/play"
PLAY_JS = "/emulador/play.js"
SCORE_JS = "/emulador/score.js"
DATA = "/emulador/data"

# The exact policy the page must send: 'unsafe-eval' because
# emulator.min.js runs Function(...), blob:/data: for the workers and the ROM it
# unpacks in memory, and nothing pointing outside this laptop.
EXPECTED_CSP = (
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval' 'unsafe-eval' blob:;"
    " worker-src 'self' blob:; connect-src 'self' blob: data:; img-src 'self' blob: data:;"
    " media-src 'self' blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:"
)

BUTTONS = {
    "saveState",
    "loadState",
    "cheat",
    "netplay",
    "cacheManager",
    "saveSavFiles",
    "loadSavFiles",
    "quickSave",
    "quickLoad",
    "screenRecord",
    "screenshot",
    "exitEmulation",
    "restart",
}

PONG = games.Jogo(
    id="pong",
    title="Pong",
    type=games.TYPE_BUILTIN,
    system=None,
    core=None,
    rom=None,
    year=1972,
    maker="Atari",
    about="Bate-bola.",
    controls=(games.Control(keys=("↑", "↓"), action="mover"),),
)


class Scripts(HTMLParser):
    """The `<script>` tags of a document: their attributes and their content."""

    def __init__(self) -> None:
        super().__init__()
        self.tags: list[dict] = []
        self.contents: list[str] = []
        self._open: dict | None = None
        self._buffer: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag == "script":
            self._open = dict(attrs)
            self._buffer = []
            self.tags.append(self._open)

    def handle_data(self, data):
        if self._open is not None:
            self._buffer.append(data)

    def handle_endtag(self, tag):
        if tag == "script" and self._open is not None:
            self.contents.append("".join(self._buffer))
            self._open = None


def scripts_of(document: str) -> Scripts:
    parser = Scripts()
    parser.feed(document)
    return parser


def config_of(document: str) -> dict:
    """The game configuration block of the play page, parsed."""
    parser = scripts_of(document)
    blocks = [
        content
        for tag, content in zip(parser.tags, parser.contents)
        if tag.get("type") == "application/json"
    ]
    assert len(blocks) == 1, blocks
    return json.loads(blocks[0])


def play(client, game_id: str):
    return client.get(f"{PLAY}?game={game_id}")


# --- the page and its policy -----------------------------------------------


def test_the_play_page_carries_the_expected_csp(client, install_games, set_game_mode):
    install_games("enduro")
    set_game_mode(active="enduro")

    response = play(client, "enduro")

    assert response.status_code == 200
    assert response.mimetype == "text/html"
    assert response.headers["Content-Security-Policy"] == EXPECTED_CSP
    assert response.headers["Cache-Control"] == "no-store"


def test_the_play_page_has_no_inline_script(client, install_games, set_game_mode):
    install_games("enduro")
    set_game_mode(active="enduro")

    document = play(client, "enduro").get_data(as_text=True)
    scripts = scripts_of(document)

    assert len(scripts.tags) == 3
    for tag in scripts.tags:
        assert tag.get("src") or tag.get("type") == "application/json", tag
    executable = [tag for tag in scripts.tags if tag.get("type") != "application/json"]
    # The decoder is loaded before the page that uses it.
    assert [tag["src"] for tag in executable] == [SCORE_JS, PLAY_JS]
    assert "javascript:" not in document


def test_the_play_page_never_leaves_this_laptop():
    # The policy is the only thing that can make the browser go elsewhere: no
    # CDN, no fonts, no analytics — every source is 'self', blob: or data:.
    assert "http://" not in emulator_page.PLAY_CSP
    assert "https://" not in emulator_page.PLAY_CSP
    assert "*" not in emulator_page.PLAY_CSP


# --- the configuration -----------------------------------------------------


def test_the_config_of_an_atari_game(client, install_games, set_game_mode):
    install_games("enduro")
    set_game_mode(active="enduro")

    config = config_of(play(client, "enduro").get_data(as_text=True))

    assert config["core"] == "stella2014"
    assert config["gameUrl"] == "/api/games/enduro/rom/Enduro%20(USA).zip"
    assert config["controlScheme"] is None
    assert config["language"] == "pt-BR"
    assert config["pathtodata"] == "/emulador/data/"
    assert config["defaultOptions"] == {"webgl2Enabled": "enabled"}
    assert "error" not in config


def test_the_config_asks_for_the_sega_md_scheme_on_genesis(client, install_games, set_game_mode):
    install_games("sonic")
    set_game_mode(active="sonic")

    config = config_of(play(client, "sonic").get_data(as_text=True))

    assert config["core"] == "genesis_plus_gx"
    assert config["controlScheme"] == "segaMD"


def test_the_config_keeps_only_the_kid_safe_buttons(client, install_games, set_game_mode):
    install_games("enduro")
    set_game_mode(active="enduro")

    config = config_of(play(client, "enduro").get_data(as_text=True))

    assert set(config["buttons"]) == BUTTONS
    assert not any(config["buttons"].values())
    for kept in ("pause", "controls", "volume", "settings", "fullscreen"):
        assert kept not in config["buttons"]


def test_the_config_carries_the_score_block_of_the_game(client, install_games, set_game_mode):
    install_games("frogger")
    set_game_mode(active="frogger")

    config = config_of(play(client, "frogger").get_data(as_text=True))

    # The hex offsets of jogos.yml arrive as plain numbers.
    assert config["score"] == {
        "bcd": [0x453C, 0x453B],
        "multiplier": 10,
        "inGame": {"offset": 0x454C, "not": 0x00},
    }


def test_the_config_carries_a_digit_score_block_with_its_shift_and_blank(
    client, install_games, set_game_mode
):
    install_games("river-raid")
    set_game_mode(active="river-raid")

    config = config_of(play(client, "river-raid").get_data(as_text=True))

    assert config["score"] == {
        "digits": [0xC9, 0xCB, 0xCD, 0xCF, 0xD1, 0xD3],
        "digitShift": 3,
        "blank": 0x58,
        "multiplier": 1,
        "inGame": {"all": [{"offset": 0xBC, "not": 0x58}, {"offset": 0xBC, "not": 0x00}]},
    }


def test_the_config_carries_a_two_test_in_game_flag(client, install_games, set_game_mode):
    install_games("pitfall")
    set_game_mode(active="pitfall")

    config = config_of(play(client, "pitfall").get_data(as_text=True))

    assert config["score"]["inGame"] == {
        "any": [{"offset": 0x9A, "is": 0x00}, {"offset": 0xDC, "not": 0x00}]
    }


def test_the_config_of_a_game_without_a_score_block_says_null(client, install_games, set_game_mode):
    install_games("super-mario-bros")
    set_game_mode(active="super-mario-bros")

    config = config_of(play(client, "super-mario-bros").get_data(as_text=True))

    assert config["score"] is None


# --- the MAME disclaimer ---------------------------------------------------


def test_the_arcade_config_skips_the_disclaimer_and_the_warnings(
    client, install_games, set_game_mode
):
    # mame2003_plus shows an English copyright warning before every arcade game;
    # the core's own options turn it (and the game warnings) off.
    install_games("frogger")
    set_game_mode(active="frogger")

    config = config_of(play(client, "frogger").get_data(as_text=True))

    assert config["defaultOptions"] == {
        "webgl2Enabled": "enabled",
        "mame2003-plus_skip_disclaimer": "enabled",
        "mame2003-plus_skip_warnings": "enabled",
    }


def test_the_other_cores_keep_their_own_options(client, install_games, set_game_mode):
    # The two options are mame2003_plus's; another core would not know them.
    install_games("super-mario-bros")
    set_game_mode(active="super-mario-bros")

    config = config_of(play(client, "super-mario-bros").get_data(as_text=True))

    assert config["defaultOptions"] == {"webgl2Enabled": "enabled"}


# --- the 404s --------------------------------------------------------------


def test_a_game_the_mode_does_not_offer_is_404(client, install_games, set_game_mode):
    install_games()
    set_game_mode(active="enduro")

    response = play(client, "frogger")

    assert response.status_code == 404
    assert response.mimetype == "text/html"
    assert emulator_page.GAME_NOT_FOUND_MESSAGE in response.get_data(as_text=True)


def test_without_a_mode_every_game_is_404(client, install_games):
    install_games()

    assert play(client, "enduro").status_code == 404


def test_an_unknown_game_is_404(client, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)

    assert play(client, "nao-existe").status_code == 404


def test_without_a_game_parameter_is_404(client, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)

    assert client.get(PLAY).status_code == 404


def test_a_game_without_its_rom_is_404(client, roms, install_games, set_game_mode):
    install_games("enduro", rom=False)
    set_game_mode(active="enduro")

    assert play(client, "enduro").status_code == 404


def test_a_builtin_game_has_no_emulator_page(client, monkeypatch, set_game_mode):
    monkeypatch.setattr(games, "catalogue", lambda: (PONG,))
    set_game_mode(free=True)

    response = play(client, "pong")

    assert response.status_code == 404
    assert emulator_page.GAME_NOT_FOUND_MESSAGE in response.get_data(as_text=True)


def test_the_pong_of_the_catalogue_has_no_emulator_page_either(client, set_game_mode):
    # It is offered in free mode and it is playable, but there is no ROM to hand
    # to EmulatorJS: the page is the SPA's own.
    set_game_mode(free=True)

    response = play(client, "pong")

    assert response.status_code == 404
    assert emulator_page.GAME_NOT_FOUND_MESSAGE in response.get_data(as_text=True)


# --- the emulator install --------------------------------------------------


def test_the_teacher_message_when_the_emulator_is_not_installed(client, install_games, set_game_mode):
    install_games("enduro", core=False)
    set_game_mode(active="enduro")

    response = play(client, "enduro")
    document = response.get_data(as_text=True)

    assert response.status_code == 200
    assert response.headers["Content-Security-Policy"] == EXPECTED_CSP
    assert emulator_page.MISSING_EMULATOR_MESSAGE in document
    assert '<p id="aviso" hidden>' not in document
    # There is no emulator to put in the game area, and the area is 100% of the
    # viewport: with it in the layout the message sat below a black rectangle,
    # off screen. It is out of the layout instead, so the sentence is the page.
    assert '<div id="game" hidden>' in document
    config = config_of(document)
    assert config["error"] == emulator_page.MISSING_EMULATOR_MESSAGE
    assert config["core"] == "stella2014"


def test_the_warning_stays_hidden_when_the_emulator_is_there(client, install_games, set_game_mode):
    install_games("enduro")
    set_game_mode(active="enduro")

    document = play(client, "enduro").get_data(as_text=True)

    assert '<p id="aviso" hidden>' in document
    assert '<div id="game">' in document
    assert "error" not in config_of(document)


def test_the_play_script_is_served_and_talks_to_the_parent(client):
    response = client.get(PLAY_JS)
    body = response.get_data(as_text=True)

    assert response.status_code == 200
    assert response.mimetype == "text/javascript"
    assert response.headers["Cache-Control"] == "no-store"
    assert "postMessage" in body
    for message in ("sala:ready", "sala:started", "sala:error", "sala:score"):
        assert message in body


def test_the_score_decoder_is_served(client):
    response = client.get(SCORE_JS)
    body = response.get_data(as_text=True)

    assert response.status_code == 200
    assert response.mimetype == "text/javascript"
    assert response.headers["Cache-Control"] == "no-store"
    assert "SalaScore" in body


def test_the_emulator_files_are_served_with_a_long_cache(client, emulator):
    (emulator / "loader.js").write_bytes(b"loader")

    response = client.get(f"{DATA}/loader.js")

    assert response.status_code == 200
    assert response.data == b"loader"
    assert response.headers["Cache-Control"] == "public, max-age=31536000, immutable"


def test_a_missing_emulator_file_is_404(client, emulator):
    assert client.get(f"{DATA}/loader.js").status_code == 404


def test_the_emulator_files_refuse_dotfiles(client, emulator):
    (emulator / ".env").write_bytes(b"segredo")
    (emulator / ".git").mkdir()
    (emulator / ".git" / "config").write_bytes(b"segredo")

    for url in (f"{DATA}/.env", f"{DATA}/.git/config"):
        response = client.get(url)
        assert response.status_code == 404, url
        assert b"segredo" not in response.data, url


def test_the_emulator_files_do_not_leave_their_directory(client, emulator):
    (emulator / "loader.js").write_bytes(b"loader")

    for url in (f"{DATA}/..%2f..%2fapp%2fspa.py", f"{DATA}/../play.html", f"{DATA}/%2e%2e/%2e%2e/etc/passwd"):
        response = client.get(url)
        assert response.status_code == 404, url
        assert b"def " not in response.data, url


# --- the SPA fallback ------------------------------------------------------


@pytest.mark.parametrize(
    "url",
    ["/emulador", "/emulador/", "/emulador/qualquer", "/emulador/play/extra", DATA, f"{DATA}/"],
)
def test_the_spa_fallback_does_not_swallow_the_emulator(client, url):
    response = client.get(url)

    assert response.status_code == 404, url
    assert '<div id="root">' not in response.get_data(as_text=True)


@pytest.mark.parametrize("url", ["/jogo", "/jogos/enduro", "/jogos/nao-existe"])
def test_the_game_screens_are_the_spa(client, url):
    response = client.get(url)

    assert response.status_code == 200
    assert '<div id="root">' in response.get_data(as_text=True)
