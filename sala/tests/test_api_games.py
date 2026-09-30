"""The games API: what the SPA sees, the ROM bytes and the teacher's mode switch."""

from __future__ import annotations

import pytest

from app import games
from app.auth import CSRF_HEADER

API = "/api/games"
ROM = "rom de teste: enduro"

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


# --- the public list -------------------------------------------------------


def test_without_a_mode_no_game_is_listed(client, install_games):
    install_games()

    assert client.get(API).get_json() == {"mode": "single", "games": []}


def test_single_mode_lists_the_active_game(client, install_games, set_game_mode):
    install_games()
    set_game_mode(active="enduro")

    body = client.get(API).get_json()

    assert body["mode"] == "single"
    assert [game["id"] for game in body["games"]] == ["enduro"]
    assert body["games"][0]["title"] == "Enduro"
    assert body["games"][0]["controls"][0] == {"keys": ["←", "→"], "action": "virar"}


def test_free_mode_lists_every_playable_game(client, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)

    body = client.get(API).get_json()

    assert body["mode"] == "free"
    assert [game["id"] for game in body["games"]] == [jogo.id for jogo in games.catalogue()]


def test_a_game_without_its_rom_is_not_listed(client, roms, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)
    (roms / games.by_id("sonic").rom).unlink()

    ids = [game["id"] for game in client.get(API).get_json()["games"]]

    assert "sonic" not in ids and "enduro" in ids


def test_a_game_without_its_core_is_not_listed(client, emulator, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)
    (emulator / "cores" / "snes9x-wasm.data").unlink()

    ids = [game["id"] for game in client.get(API).get_json()["games"]]

    assert "super-mario-world" not in ids and "enduro" in ids


def test_one_game(client, install_games, set_game_mode):
    install_games()
    set_game_mode(active="frogger")

    body = client.get(f"{API}/frogger").get_json()

    assert body["id"] == "frogger" and body["maker"] == "Konami"


def test_a_game_that_is_not_visible_is_404(client, install_games, set_game_mode):
    install_games()
    set_game_mode(active="enduro")

    response = client.get(f"{API}/frogger")

    assert response.status_code == 404
    assert response.get_json() == {"error": games.NOT_FOUND_MESSAGE}


def test_an_unknown_game_is_404(client, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)

    assert client.get(f"{API}/nao-existe").status_code == 404


def test_a_builtin_game_is_listed_but_has_no_rom(client, monkeypatch, set_game_mode):
    monkeypatch.setattr(games, "catalogue", lambda: (PONG,))
    set_game_mode(free=True)

    body = client.get(API).get_json()

    assert body["games"] == [
        {
            "id": "pong",
            "title": "Pong",
            "type": "builtin",
            "system": None,
            "year": 1972,
            "maker": "Atari",
            "about": "Bate-bola.",
            "controls": [{"keys": ["↑", "↓"], "action": "mover"}],
            "autoScore": True,
        }
    ]
    assert client.get(f"{API}/pong/rom").status_code == 404


def test_the_payload_says_which_emulated_games_score_by_themselves(client, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)

    games_by_id = {game["id"]: game for game in client.get(API).get_json()["games"]}

    assert games_by_id["enduro"]["autoScore"] is True
    assert games_by_id["frogger"]["autoScore"] is True
    assert games_by_id["space-invaders"]["autoScore"] is False
    assert client.get(f"{API}/enduro").get_json()["autoScore"] is True


def test_the_pong_of_the_catalogue_is_there_with_nothing_installed(client, roms, set_game_mode):
    # Pong is our own page: it needs neither a ROM nor an emulator core, so it
    # is the one game a laptop straight out of the box can already play.
    set_game_mode(free=True)

    body = client.get(API).get_json()

    assert [game["id"] for game in body["games"]] == ["pong"]
    assert body["games"][0]["type"] == "builtin" and body["games"][0]["system"] is None


def test_pong_can_be_the_game_of_the_day(client, set_game_mode):
    set_game_mode(active="pong")

    assert [game["id"] for game in client.get(API).get_json()["games"]] == ["pong"]


def test_pong_has_no_rom_and_no_emulator_page(client, set_game_mode):
    set_game_mode(free=True)

    assert client.get(f"{API}/pong/rom").status_code == 404
    assert client.get(f"{API}/pong/rom/pong.zip").status_code == 404


def test_the_admin_list_shows_pong_ready(admin_client, admin_api):
    listed = {game["id"]: game for game in admin_client.get(f"{admin_api}/games").get_json()["games"]}

    assert listed["pong"]["playable"] is True
    assert listed["pong"]["missing"] is None and listed["pong"]["core"] is None


# --- the ROM ---------------------------------------------------------------


def test_the_rom_of_the_active_game_comes_as_bytes(client, install_games, set_game_mode):
    install_games("enduro")
    set_game_mode(active="enduro")

    response = client.get(f"{API}/enduro/rom")

    assert response.status_code == 200
    assert response.data == ROM.encode()
    assert response.mimetype == "application/octet-stream"
    assert response.headers["Cache-Control"] == "no-store"
    assert "attachment" not in response.headers.get("Content-Disposition", "")


def test_another_rom_is_404_in_single_mode(client, install_games, set_game_mode):
    install_games()
    set_game_mode(active="enduro")

    assert client.get(f"{API}/frogger/rom").status_code == 404


def test_free_mode_serves_every_rom(client, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)

    assert client.get(f"{API}/frogger/rom").data == b"rom de teste: frogger"
    assert client.get(f"{API}/sonic/rom").data == b"rom de teste: sonic"


def test_a_rom_of_a_game_that_is_not_in_the_catalogue_is_404(client, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)

    assert client.get(f"{API}/nao-existe/rom").status_code == 404


def test_the_rom_of_a_game_comes_with_its_name_for_the_emulator(client, install_games, set_game_mode):
    install_games("frogger")
    set_game_mode(active="frogger")

    assert games.rom_url(games.by_id("frogger")) == "/api/games/frogger/rom/frogger.zip"
    response = client.get(games.rom_url(games.by_id("frogger")))

    assert response.status_code == 200
    assert response.data == b"rom de teste: frogger"


def test_the_name_in_the_url_is_only_decoration(client, install_games, set_game_mode):
    install_games("enduro")
    set_game_mode(active="enduro")

    response = client.get("/api/games/enduro/rom/qualquer-coisa.zip")

    assert response.status_code == 200
    assert response.data == ROM.encode()


def test_a_missing_rom_file_is_404(client, roms, install_games, set_game_mode):
    install_games("enduro")
    set_game_mode(active="enduro")
    (roms / games.by_id("enduro").rom).unlink()

    response = client.get(f"{API}/enduro/rom")

    assert response.status_code == 404
    assert response.get_json()["error"] == games.NOT_FOUND_MESSAGE


def test_a_symlinked_rom_that_leaves_the_rom_dir_is_404(client, roms, tmp_path, install_games, set_game_mode):
    install_games("enduro")
    set_game_mode(active="enduro")
    target = roms / games.by_id("enduro").rom
    target.unlink()
    secret = tmp_path / "segredo.zip"
    secret.write_bytes(b"segredo")
    target.symlink_to(secret)

    response = client.get(f"{API}/enduro/rom")

    assert response.status_code == 404
    assert b"segredo" not in response.data


@pytest.mark.parametrize(
    "url",
    [
        "/api/games/..%2f..%2fetc/rom",
        "/api/games/..%2F..%2Fetc%2Fpasswd/rom",
        "/api/games/%2e%2e%2f%2e%2e%2fetc%2fpasswd/rom",
        "/api/games/../../etc/passwd/rom",
        "/api/games/....//etc/passwd/rom",
        "/api/games/enduro%00/rom",
    ],
)
def test_a_traversal_in_the_id_is_404(client, install_games, set_game_mode, url):
    install_games()
    set_game_mode(free=True)

    response = client.get(url)

    assert response.status_code == 404, url
    assert b"root:" not in response.data


# --- the teacher's list and switch -----------------------------------------


def test_the_admin_list_has_the_whole_catalogue(admin_client, admin_api, install_games):
    install_games("enduro")
    install_games("frogger", core=False)

    body = admin_client.get(f"{admin_api}/games").get_json()

    assert body["activeGame"] is None and body["freeMode"] is False
    assert [game["id"] for game in body["games"]] == [jogo.id for jogo in games.catalogue()]
    listed = {game["id"]: game for game in body["games"]}
    assert listed["enduro"]["playable"] is True and listed["enduro"]["missing"] is None
    assert listed["sonic"]["playable"] is False and listed["sonic"]["missing"] == "rom"
    assert listed["frogger"]["playable"] is False and listed["frogger"]["missing"] == "core"
    assert listed["sonic"]["core"] == "genesis_plus_gx"


def test_the_admin_list_reports_the_mode(admin_client, admin_api, install_games, set_game_mode):
    install_games()
    set_game_mode(active="enduro")

    body = admin_client.get(f"{admin_api}/games").get_json()

    assert body["activeGame"] == "enduro" and body["freeMode"] is False


def test_the_admin_switch_names_the_active_game(admin_client, admin_api, csrf_of, install_games, db):
    install_games()
    token = csrf_of(admin_client, f"{admin_api}/session")

    response = admin_client.put(
        f"{admin_api}/games/mode",
        json={"activeGame": "enduro", "freeMode": False},
        headers={CSRF_HEADER: token},
    )

    assert response.status_code == 204
    assert games.active_game(db) == "enduro"
    assert games.free_mode(db) is False


def test_the_admin_switch_turns_free_mode_on(admin_client, admin_api, csrf_of, install_games, db):
    install_games()
    token = csrf_of(admin_client, f"{admin_api}/session")

    response = admin_client.put(
        f"{admin_api}/games/mode",
        json={"activeGame": None, "freeMode": True},
        headers={CSRF_HEADER: token},
    )

    assert response.status_code == 204
    assert games.free_mode(db) is True
    assert games.active_game(db) is None


def test_the_admin_switch_clears_the_active_game(admin_client, admin_api, csrf_of, install_games, db, set_game_mode):
    install_games()
    set_game_mode(active="enduro")
    token = csrf_of(admin_client, f"{admin_api}/session")

    admin_client.put(
        f"{admin_api}/games/mode", json={"activeGame": None}, headers={CSRF_HEADER: token}
    )

    assert games.active_game(db) is None


def test_the_admin_switch_refuses_an_unknown_game(admin_client, admin_api, csrf_of, db):
    token = csrf_of(admin_client, f"{admin_api}/session")

    response = admin_client.put(
        f"{admin_api}/games/mode", json={"activeGame": "nao-existe"}, headers={CSRF_HEADER: token}
    )

    assert response.status_code == 422
    assert "nao-existe" in response.get_json()["error"]
    assert games.active_game(db) is None


def test_the_admin_switch_refuses_a_game_that_cannot_run(
    admin_client, admin_api, csrf_of, install_games, db
):
    install_games("enduro")
    token = csrf_of(admin_client, f"{admin_api}/session")

    response = admin_client.put(
        f"{admin_api}/games/mode", json={"activeGame": "frogger"}, headers={CSRF_HEADER: token}
    )

    assert response.status_code == 422
    assert "ROM" in response.get_json()["error"]
    assert games.active_game(db) is None


def test_the_admin_switch_refuses_a_game_without_its_emulator(
    admin_client, admin_api, csrf_of, install_games, db
):
    install_games("enduro", core=False)
    token = csrf_of(admin_client, f"{admin_api}/session")

    response = admin_client.put(
        f"{admin_api}/games/mode", json={"activeGame": "enduro"}, headers={CSRF_HEADER: token}
    )

    assert response.status_code == 422
    assert "sala-emulador" in response.get_json()["error"]
    assert games.active_game(db) is None


@pytest.mark.parametrize(
    "body, expected",
    [
        ({}, "activeGame"),
        ({"freeMode": "sim"}, "freeMode"),
        ({"activeGame": 7}, "activeGame"),
    ],
)
def test_the_admin_switch_refuses_a_bad_body(admin_client, admin_api, csrf_of, install_games, db, body, expected):
    install_games()
    token = csrf_of(admin_client, f"{admin_api}/session")

    response = admin_client.put(f"{admin_api}/games/mode", json=body, headers={CSRF_HEADER: token})

    assert response.status_code == 422
    assert expected in response.get_json()["error"]
    assert games.active_game(db) is None and games.free_mode(db) is False


def test_the_public_list_does_not_need_a_login(client, install_games, set_game_mode):
    install_games()
    set_game_mode(free=True)

    assert client.get(API).status_code == 200


def test_a_rom_needs_no_login_either(client, install_games, set_game_mode):
    install_games("enduro")
    set_game_mode(active="enduro")

    assert client.get(f"{API}/enduro/rom").status_code == 200


def test_the_rom_dir_env_is_honoured(client, monkeypatch, tmp_path, install_games, set_game_mode):
    install_games(rom=False)  # the emulator is installed; the ROMs live elsewhere
    elsewhere = tmp_path / "outra"
    (elsewhere / "atari2600").mkdir(parents=True)
    (elsewhere / "atari2600" / "Enduro (USA).zip").write_bytes(b"outra rom")
    monkeypatch.setenv("SALA_ROMS", str(elsewhere))
    set_game_mode(active="enduro")

    assert client.get(f"{API}/enduro/rom").data == b"outra rom"


def test_the_path_of_a_rom_never_comes_from_the_request(client, install_games, set_game_mode, roms):
    install_games("enduro")
    set_game_mode(active="enduro")
    (roms / "outra.zip").write_bytes(b"outra")

    assert client.get(f"{API}/outra/rom").status_code == 404
    assert client.get(f"{API}/enduro/rom?path=outra.zip").data == ROM.encode()
