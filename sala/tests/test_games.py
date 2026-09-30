"""The catalogue (`jogos.yml`): its validation, the derived control scheme, what
is playable and what a kid may see."""

from __future__ import annotations

import dataclasses
from pathlib import Path

import pytest

from app import games

CATALOGUE_IDS = [
    "pong",
    "enduro",
    "space-invaders",
    "river-raid",
    "pitfall",
    "frogger",
    "galaga",
    "ms-pac-man",
    "donkey-kong",
    "super-mario-bros",
    "super-mario-world",
    "sonic",
]

BASE = {
    "id": "enduro",
    "title": "Enduro",
    "type": "emulated",
    "system": "atari2600",
    "core": "stella2014",
    "rom": "atari2600/Enduro (USA).zip",
    "year": 1983,
    "maker": "Activision",
    "about": "Corrida de resistência.",
    "controls": [{"keys": ["←", "→"], "action": "virar"}],
}


def write_catalogue(tmp_path: Path, entries: list) -> Path:
    import yaml

    path = tmp_path / "jogos.yml"
    path.write_text(yaml.safe_dump(entries, allow_unicode=True), encoding="utf-8")
    return path


def load(tmp_path: Path, entries: list) -> tuple[games.Jogo, ...]:
    return games.load_catalogue(write_catalogue(tmp_path, entries))


# --- the tracked file ------------------------------------------------------


def test_the_tracked_catalogue_has_the_games_of_the_course():
    assert [jogo.id for jogo in games.catalogue()] == CATALOGUE_IDS


def test_the_tracked_pong_is_our_own_page():
    pong = games.by_id("pong")

    assert pong is not None
    assert pong.type == games.TYPE_BUILTIN
    assert (pong.title, pong.year, pong.maker) == ("Pong", 1972, "Atari")
    assert pong.system is None and pong.core is None and pong.rom is None
    assert [(control.keys, control.action) for control in pong.controls] == [
        (("↑", "↓", "W", "S"), "mover a raquete"),
        (("P",), "pausar"),
    ]
    # Nothing to install: the page is the game.
    assert games.playable(pong) is True and games.missing_kind(pong) is None


def test_every_entry_is_complete_and_in_portuguese():
    for jogo in games.catalogue():
        assert jogo.type in games.KNOWN_TYPES
        assert jogo.year > 1970
        assert jogo.maker
        assert jogo.about.endswith(".")
        assert jogo.controls
        for control in jogo.controls:
            assert control.keys and control.action


def test_every_emulated_entry_points_at_a_rom_of_a_known_system():
    for jogo in games.catalogue():
        if jogo.type != games.TYPE_EMULATED:
            continue
        assert jogo.system in games.KNOWN_SYSTEMS
        assert jogo.rom and not jogo.rom.startswith("/")


def test_the_catalogue_defaults_to_the_tracked_file():
    assert games.catalogue_path() == Path(games.__file__).resolve().parents[1] / "jogos.yml"


def test_the_tracked_enduro_reads_its_odometer():
    # The hex offsets of the file are plain numbers once loaded.
    assert games.by_id("enduro").score == games.ScoreBlock(
        bcd=(0xA6, 0xA5, 0xA4),
        multiplier=1,
        in_game=games.InGame(offset=0x90, is_value=0xFF),
    )


def test_the_tracked_frogger_reads_its_score_and_its_play_flag():
    assert games.by_id("frogger").score == games.ScoreBlock(
        bcd=(0x453C, 0x453B),
        multiplier=10,
        in_game=games.InGame(offset=0x454C, not_value=0x00),
    )


def test_only_enduro_and_frogger_have_a_score_block():
    with_score = [jogo.id for jogo in games.catalogue() if jogo.score is not None]

    assert with_score == ["enduro", "frogger"]


# --- validation ------------------------------------------------------------


@pytest.mark.parametrize(
    "change, expected",
    [
        ({"id": "Enduro"}, "a-z0-9-"),
        ({"id": "enduro_x"}, "a-z0-9-"),
        ({"id": "enduro x"}, "a-z0-9-"),
        ({"id": ""}, "'id'"),
        ({"title": "   "}, "'title'"),
        ({"type": "video"}, "tipo"),
        ({"system": "dreamcast"}, "sistema"),
        ({"core": "nao_existe"}, "núcleo"),
        # A system and a core are one decision: arcade games run on MAME or
        # FBNeo, and pairing them with another system's core would mislabel the
        # console and boot nothing.
        ({"system": "arcade", "core": "snes9x"}, "núcleo"),
        ({"system": "nes", "core": "mame2003_plus"}, "núcleo"),
        ({"system": "genesis", "core": "fceumm"}, "núcleo"),
        ({"rom": "../fora.zip"}, "ROM"),
        ({"rom": "/mnt/z/roms/atari2600/Enduro (USA).zip"}, "ROM"),
        ({"rom": "atari2600/../../fora.zip"}, "ROM"),
        ({"rom": r"atari2600\..\fora.zip"}, "ROM"),
        # A control character in the name passes any string check and then blows
        # up as a ValueError deep inside path handling -- a 500, not a message.
        ({"rom": "atari2600/Endu\0ro (USA).zip"}, "controle"),
        ({"rom": "atari2600/Enduro\n.zip"}, "controle"),
        ({"year": "1983"}, "year"),
        ({"year": True}, "year"),
        ({"maker": ""}, "'maker'"),
        ({"about": None}, "'about'"),
        ({"controls": []}, "controls"),
        ({"controls": "x"}, "controls"),
        ({"controls": [{"keys": [], "action": "virar"}]}, "keys"),
        ({"controls": [{"keys": [1], "action": "virar"}]}, "keys"),
        ({"controls": [{"keys": ["x"]}]}, "action"),
        ({"controls": [{"keys": ["x"], "action": " "}]}, "action"),
        ({"controls": ["x"]}, "controls"),
        ({"capa": ""}, "capa"),
        ({"capa": "   "}, "capa"),
        ({"capa": 3}, "capa"),
        ({"capa": "Endu\0ro (USA)"}, "capa"),
    ],
)
def test_a_bad_entry_names_the_file_and_the_entry(tmp_path, change, expected):
    with pytest.raises(games.CatalogueError) as error:
        load(tmp_path, [{**BASE, **change}])

    message = str(error.value)
    assert expected in message, message
    assert str(tmp_path / "jogos.yml") in message
    assert "entrada 1" in message


def test_a_builtin_game_has_no_rom_core_or_system(tmp_path):
    with pytest.raises(games.CatalogueError) as error:
        load(tmp_path, [{**BASE, "type": "builtin"}])

    assert "builtin" in str(error.value)


def test_a_builtin_game_has_no_cover_name(tmp_path):
    # Our own game's cover is a screenshot that ships with the SPA: there is no
    # thumbnail to download for it, so a name for one is a mistake.
    entry = {
        "id": "pong",
        "title": "Pong",
        "type": "builtin",
        "year": 1972,
        "maker": "Atari",
        "about": "Bate-bola.",
        "controls": [{"keys": ["↑"], "action": "mover"}],
        "capa": "Pong",
    }

    with pytest.raises(games.CatalogueError) as error:
        load(tmp_path, [entry])

    assert "builtin" in str(error.value) and "capa" in str(error.value)


def test_the_catalogue_takes_a_cover_name(tmp_path):
    jogo = load(tmp_path, [{**BASE, "capa": "  Enduro (USA)  "}])[0]

    assert jogo.capa == "Enduro (USA)"


def test_a_game_without_a_cover_name_has_none(tmp_path):
    assert load(tmp_path, [BASE])[0].capa is None


def test_the_arcade_entries_name_the_cover_of_their_cabinet():
    # A MAME set name (`dkong`, `mspacman`) is not what is written on the box, so
    # these entries name the thumbnail themselves; a console game is named after
    # its ROM file and needs nothing.
    named = {jogo.id: jogo.capa for jogo in games.catalogue() if jogo.capa is not None}

    assert named == {
        "frogger": "Frogger",
        "galaga": "Galaga (Namco rev. B)",
        "ms-pac-man": "Ms. Pac-Man",
        "donkey-kong": "Donkey Kong (US set 1)",
    }


def test_an_arcade_game_may_use_either_arcade_core(tmp_path):
    # mame2003_plus is what the catalogue uses; FBNeo is the other runtime for
    # the same system, and the pair is what the check accepts, not one name.
    jogo = load(tmp_path, [{**BASE, "system": "arcade", "core": "fbneo"}])[0]

    assert (jogo.system, jogo.core) == ("arcade", "fbneo")


def test_a_builtin_game_loads_without_the_emulator_bits(tmp_path):
    entry = {
        "id": "pong",
        "title": "Pong",
        "type": "builtin",
        "year": 1972,
        "maker": "Atari",
        "about": "Bate-bola.",
        "controls": [{"keys": ["↑", "↓"], "action": "mover"}],
    }

    jogo = load(tmp_path, [entry])[0]

    assert jogo.type == games.TYPE_BUILTIN
    assert jogo.system is None and jogo.core is None and jogo.rom is None
    assert games.playable(jogo) and games.missing_kind(jogo) is None


def test_a_repeated_id_stops_the_catalogue(tmp_path):
    with pytest.raises(games.CatalogueError) as error:
        load(tmp_path, [BASE, {**BASE, "title": "Outro"}])

    message = str(error.value)
    assert 'entrada 2 ("enduro")' in message
    assert "já apareceu" in message


# --- the score block -------------------------------------------------------


def test_a_score_block_is_only_for_an_emulated_game(tmp_path):
    entry = {
        "id": "pong",
        "title": "Pong",
        "type": "builtin",
        "year": 1972,
        "maker": "Atari",
        "about": "Bate-bola.",
        "controls": [{"keys": ["↑"], "action": "mover"}],
        "score": {"bcd": [1], "multiplier": 1, "in_game": {"offset": 0, "is": 1}},
    }

    with pytest.raises(games.CatalogueError) as error:
        load(tmp_path, [entry])

    assert "score" in str(error.value)


@pytest.mark.parametrize(
    "score, expected",
    [
        ("x", "'score'"),
        ({"bcd": []}, "bcd"),
        ({"bcd": [1, 2, 3, 4, 5]}, "bcd"),
        ({"bcd": [-1]}, "bcd"),
        ({"bcd": [1.5]}, "bcd"),
        ({"bcd": ["1"]}, "bcd"),
        ({"bcd": [True]}, "bcd"),
        ({"bcd": [1], "multiplier": 3}, "multiplier"),
        ({"bcd": [1], "multiplier": True}, "multiplier"),
        ({"bcd": [1], "multiplier": 1.0}, "multiplier"),
        ({"bcd": [1], "multiplier": 1}, "in_game"),
        ({"bcd": [1], "multiplier": 1, "in_game": "x"}, "in_game"),
        ({"bcd": [1], "multiplier": 1, "in_game": {"offset": 0x90}}, "exatamente um"),
        (
            {"bcd": [1], "multiplier": 1, "in_game": {"offset": 0x90, "is": 1, "not": 0}},
            "exatamente um",
        ),
        ({"bcd": [1], "multiplier": 1, "in_game": {"is": 1}}, "offset"),
        ({"bcd": [1], "multiplier": 1, "in_game": {"offset": -1, "is": 1}}, "offset"),
        ({"bcd": [1], "multiplier": 1, "in_game": {"offset": 0x90, "is": 256}}, "byte"),
        ({"bcd": [1], "multiplier": 1, "in_game": {"offset": 0x90, "not": -1}}, "byte"),
        ({"bcd": [1], "multiplier": 1, "in_game": {"offset": 0x90, "is": True}}, "byte"),
    ],
)
def test_a_bad_score_block_names_the_file_and_the_entry(tmp_path, score, expected):
    with pytest.raises(games.CatalogueError) as error:
        load(tmp_path, [{**BASE, "score": score}])

    message = str(error.value)
    assert expected in message, message
    assert str(tmp_path / "jogos.yml") in message
    assert "entrada 1" in message


def test_a_score_block_of_one_byte_is_enough(tmp_path):
    jogo = load(
        tmp_path,
        [{**BASE, "score": {"bcd": [0x10], "multiplier": 100, "in_game": {"offset": 0, "not": 0}}}],
    )[0]

    assert jogo.score == games.ScoreBlock(
        bcd=(0x10,), multiplier=100, in_game=games.InGame(offset=0, not_value=0)
    )


def test_a_game_without_a_score_block_has_none(tmp_path):
    assert load(tmp_path, [BASE])[0].score is None


@pytest.mark.parametrize(
    "bcd, multiplier",
    [
        ([1, 2, 3], 100),
        ([1, 2, 3, 4], 1),
        ([1, 2, 3, 4], 100),
    ],
)
def test_a_score_block_that_could_beat_the_server_cap_is_refused(tmp_path, bcd, multiplier):
    # The widest number the bytes can hold, times the multiplier, is a pontuação
    # the API refuses: a game with this block could only ever fail to save.
    score = {"bcd": bcd, "multiplier": multiplier, "in_game": {"offset": 0, "not": 0}}

    with pytest.raises(games.CatalogueError) as error:
        load(tmp_path, [{**BASE, "score": score}])

    message = str(error.value)
    assert "acima do limite" in message, message
    assert str(tmp_path / "jogos.yml") in message
    assert "entrada 1" in message


def test_a_score_block_that_reads_up_to_the_server_cap_is_accepted(tmp_path):
    # Three bytes are six digits, so even the multiplier of 10 reads at most
    # 9.999.990 -- inside the limit, and that is as far as a block may go.
    score = {"bcd": [1, 2, 3], "multiplier": 10, "in_game": {"offset": 0, "not": 0}}

    jogo = load(tmp_path, [{**BASE, "score": score}])[0]

    assert jogo.score == games.ScoreBlock(
        bcd=(1, 2, 3), multiplier=10, in_game=games.InGame(offset=0, not_value=0)
    )


def test_the_score_block_payload_uses_the_catalogue_keys():
    assert games.by_id("enduro").score.payload() == {
        "bcd": [0xA6, 0xA5, 0xA4],
        "multiplier": 1,
        "inGame": {"offset": 0x90, "is": 0xFF},
    }
    assert games.by_id("frogger").score.payload() == {
        "bcd": [0x453C, 0x453B],
        "multiplier": 10,
        "inGame": {"offset": 0x454C, "not": 0x00},
    }


@pytest.mark.parametrize("body", ["", "jogos: 1", "[]", "- id: enduro\n  id: enduro\n"])
def test_a_catalogue_that_is_not_a_list_of_games_is_refused(tmp_path, body):
    path = tmp_path / "jogos.yml"
    path.write_text(body, encoding="utf-8")

    with pytest.raises(games.CatalogueError):
        games.load_catalogue(path)


def test_a_missing_file_is_named(tmp_path):
    with pytest.raises(games.CatalogueError) as error:
        games.load_catalogue(tmp_path / "nao-existe.yml")

    assert "nao-existe.yml" in str(error.value)


def test_broken_yaml_is_named(tmp_path):
    path = tmp_path / "jogos.yml"
    path.write_text("id: [\n", encoding="utf-8")

    with pytest.raises(games.CatalogueError) as error:
        games.load_catalogue(path)

    assert "YAML" in str(error.value)


# --- the derived control scheme --------------------------------------------


def test_only_the_genesis_core_needs_a_control_scheme():
    assert games.control_scheme("genesis_plus_gx") == "segaMD"
    assert games.control_scheme("stella2014") is None
    assert games.control_scheme("mame2003_plus") is None
    assert games.control_scheme(None) is None


# --- the ROM directory -----------------------------------------------------


def test_the_rom_directory_defaults_to_the_class_share(monkeypatch):
    monkeypatch.delenv("SALA_ROMS", raising=False)

    assert games.roms_dir() == Path("/mnt/z/roms")


def test_the_rom_directory_can_come_from_the_environment(monkeypatch, tmp_path):
    monkeypatch.setenv("SALA_ROMS", str(tmp_path / "roms"))

    assert games.roms_dir() == tmp_path / "roms"


def test_the_rom_file_is_resolved_inside_the_rom_directory(roms, install_games):
    install_games("enduro")

    assert games.rom_file(games.by_id("enduro")) == (roms / games.by_id("enduro").rom).resolve()


def test_a_rom_that_is_not_there_is_none(roms):
    assert games.rom_file(games.by_id("enduro")) is None
    assert games.missing_kind(games.by_id("enduro")) == "rom"


def test_a_symlink_that_leaves_the_rom_directory_is_refused(roms, tmp_path):
    outside = tmp_path / "segredo.zip"
    outside.write_bytes(b"segredo")
    target = roms / games.by_id("enduro").rom
    target.parent.mkdir(parents=True)
    target.symlink_to(outside)

    assert games.rom_file(games.by_id("enduro")) is None


def test_a_rom_with_a_control_character_is_refused_not_crashed(roms):
    # The catalogue refuses these names on start; a `Jogo` built by hand
    # -- or an entry from a catalogue loaded before the check -- answers "not
    # there" instead of raising ValueError out of the path handling.
    enduro = games.by_id("enduro")
    assert enduro is not None
    broken = dataclasses.replace(enduro, rom="atari2600/Endu\0ro (USA).zip")

    assert games.rom_file(broken) is None
    assert games.missing_kind(broken) == "rom"


def test_a_builtin_game_has_no_rom_file(monkeypatch, tmp_path):
    entry = {
        "id": "pong",
        "title": "Pong",
        "type": "builtin",
        "year": 1972,
        "maker": "Atari",
        "about": "Bate-bola.",
        "controls": [{"keys": ["↑"], "action": "mover"}],
    }
    jogo = load(tmp_path, [entry])[0]

    assert games.rom_file(jogo) is None


def test_only_the_games_that_can_report_their_score_do_it_themselves():
    # Our own page counts the points; an emulated game can only do the same
    # when the catalogue says where its score lives in the savestate.
    assert games.allows_auto_score(games.by_id("pong")) is True
    assert games.allows_auto_score(games.by_id("enduro")) is True
    assert games.allows_auto_score(games.by_id("frogger")) is True
    assert games.allows_auto_score(games.by_id("space-invaders")) is False
    assert games.allows_auto_score(games.by_id("sonic")) is False


# --- playability and visibility --------------------------------------------


def test_a_game_without_its_core_says_so(roms, install_games):
    install_games("enduro", core=False)

    assert games.missing_kind(games.by_id("enduro")) == "core"
    assert not games.playable(games.by_id("enduro"))
    assert "just sala-emulador" in games.not_ready_message(games.by_id("enduro"))


def test_a_game_without_its_rom_says_so(roms, install_games):
    install_games("enduro", rom=False)

    assert "SALA_ROMS" in games.not_ready_message(games.by_id("enduro"))


def test_free_mode_offers_every_playable_game(db, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)

    assert [jogo.id for jogo in games.mode_games(db)] == CATALOGUE_IDS
    assert [jogo.id for jogo in games.visible_games(db)] == CATALOGUE_IDS
    assert games.free_mode(db) is True


def test_free_mode_hides_a_game_without_its_rom(db, roms, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)
    (roms / games.by_id("sonic").rom).unlink()

    visible = [jogo.id for jogo in games.visible_games(db)]
    assert "sonic" not in visible
    assert "enduro" in visible


def test_free_mode_hides_a_game_without_its_core(db, emulator, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)
    (emulator / "cores" / "mame2003_plus-wasm.data").unlink()

    visible = [jogo.id for jogo in games.visible_games(db)]
    assert "frogger" not in visible and "galaga" not in visible
    assert "enduro" in visible


def test_single_mode_offers_only_the_active_game(db, install_games, set_game_mode):
    install_games()
    set_game_mode(active="enduro")

    assert [jogo.id for jogo in games.visible_games(db)] == ["enduro"]
    assert games.free_mode(db) is False


def test_single_mode_without_an_active_game_offers_nothing(db, install_games):
    install_games()

    assert games.mode_games(db) == []
    assert games.visible_games(db) == []


def test_single_mode_hides_the_active_game_without_its_rom(db, install_games, set_game_mode):
    install_games("frogger")
    set_game_mode(active="enduro")

    assert games.is_offered(db, games.by_id("enduro")) is True
    assert games.visible_games(db) == []


def test_single_mode_hides_the_active_game_without_its_core(db, install_games, set_game_mode):
    install_games("enduro", core=False)
    set_game_mode(active="enduro")

    assert games.visible_games(db) == []


def test_single_mode_does_not_offer_the_other_games(db, install_games, set_game_mode):
    install_games()
    set_game_mode(active="enduro")

    assert games.is_offered(db, games.by_id("enduro")) is True
    assert games.is_offered(db, games.by_id("frogger")) is False


def test_an_active_game_that_left_the_catalogue_is_ignored(db, install_games, set_game_mode):
    install_games()
    set_game_mode(active="nao-existe")

    assert games.active_game(db) is None
    assert games.visible_games(db) == []


# --- the teacher's command line --------------------------------------------


def test_choose_names_the_game_and_leaves_free_mode(db, set_game_mode):
    set_game_mode(free=True)

    games.choose(db, "enduro")

    assert games.active_game(db) == "enduro"
    assert games.free_mode(db) is False


def test_choose_livre_turns_free_mode_on(db):
    games.choose(db, games.FREE_MODE_CHOICE)

    assert games.free_mode(db) is True
    assert games.active_game(db) is None


def test_choose_refuses_an_unknown_game_listing_the_ids(db):
    with pytest.raises(games.UnknownGame) as error:
        games.choose(db, "nao-existe")

    message = str(error.value)
    assert "nao-existe" in message
    assert "enduro" in message and "sonic" in message
    assert "livre" in message
    assert games.active_game(db) is None


# --- payloads --------------------------------------------------------------


def test_the_public_payload_has_the_controls_of_the_game():
    payload = games.game_payload(games.by_id("frogger"), cover=True)

    assert set(payload) == {
        "id",
        "title",
        "type",
        "system",
        "year",
        "maker",
        "about",
        "controls",
        "autoScore",
        "cover",
    }
    assert payload["system"] == "arcade"
    assert payload["year"] == 1981
    assert payload["cover"] is True
    assert {"keys": ["v"], "action": "colocar a ficha (coin)"} in payload["controls"]


def test_the_public_payload_says_when_a_game_scores_by_itself():
    assert games.game_payload(games.by_id("pong"), cover=False)["autoScore"] is True
    assert games.game_payload(games.by_id("enduro"), cover=False)["autoScore"] is True
    assert games.game_payload(games.by_id("frogger"), cover=False)["autoScore"] is True
    assert games.game_payload(games.by_id("space-invaders"), cover=False)["autoScore"] is False


def test_the_admin_payload_says_what_is_missing(install_games):
    install_games("enduro")
    install_games("frogger", core=False)

    ready = games.admin_payload(games.by_id("enduro"), cover=True)
    assert set(ready) == {
        "id",
        "title",
        "type",
        "system",
        "core",
        "year",
        "maker",
        "playable",
        "missing",
        "cover",
    }
    assert ready["playable"] is True and ready["missing"] is None
    assert ready["core"] == "stella2014"
    assert ready["cover"] is True
    assert games.admin_payload(games.by_id("sonic"), cover=False)["missing"] == "rom"
    assert games.admin_payload(games.by_id("frogger"), cover=False)["missing"] == "core"
