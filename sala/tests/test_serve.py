"""app.serve: the board addresses (pure function) and the missing-config refusal."""

from __future__ import annotations

import os
import signal
import subprocess
import sys
from pathlib import Path

import pytest

from app import games, serve
from app.config import Config, write_config
from app.db import connect, get_setting
from app.serve import Interface, is_rfc1918, lan_addresses, list_interfaces

SALA_DIR = Path(__file__).resolve().parents[1]

INTERFACES = [
    Interface("lo", ("127.0.0.1",), physical=False),
    Interface("docker0", ("172.17.0.1",), physical=False),
    Interface("br-1a2b3c4d", ("192.168.0.1",), physical=False),
    Interface("veth9f8e", ("192.168.30.99",), physical=False),
    Interface("tun0", ("10.8.0.2",), physical=False),
    Interface("wlan0", ("192.168.99.99",), physical=True),
    Interface("enp3s0", ("203.0.113.7",), physical=True),
    Interface("enp4s0", ("10.0.5.4",), physical=True),
]


def test_lan_addresses_keep_only_physical_rfc1918():
    assert lan_addresses(INTERFACES, 8000) == ["http://192.168.99.99:8000", "http://10.0.5.4:8000"]


def test_lan_addresses_honour_the_port():
    assert lan_addresses(INTERFACES, 9000) == ["http://192.168.99.99:9000", "http://10.0.5.4:9000"]


def test_lan_addresses_drop_duplicates():
    interfaces = [
        Interface("wlan0", ("192.168.99.99",), physical=True),
        Interface("eth0", ("192.168.99.99",), physical=True),
    ]
    assert lan_addresses(interfaces, 8000) == ["http://192.168.99.99:8000"]


def test_lan_addresses_empty_when_nothing_matches():
    assert lan_addresses([interface for interface in INTERFACES if not interface.physical], 8000) == []


def test_lan_addresses_ignores_ipv6_and_garbage():
    interfaces = [Interface("wlan0", ("fd00::1", "nada", "192.168.1.5"), physical=True)]
    assert lan_addresses(interfaces, 8000) == ["http://192.168.1.5:8000"]


@pytest.mark.parametrize("address", ["10.0.0.1", "10.255.255.254", "172.16.0.1", "172.31.255.1", "192.168.0.1", "192.168.255.254"])
def test_is_rfc1918_accepts_private(address):
    assert is_rfc1918(address)


@pytest.mark.parametrize("address", ["127.0.0.1", "172.15.0.1", "172.32.0.1", "192.169.0.1", "8.8.8.8", "203.0.113.7", "169.254.1.1", "fd00::1", "", "nada"])
def test_is_rfc1918_rejects_everything_else(address):
    assert not is_rfc1918(address)


@pytest.mark.skipif(not Path("/sys/class/net").is_dir(), reason="no /sys/class/net")
def test_list_interfaces_reads_the_host():
    interfaces = {interface.name: interface for interface in list_interfaces()}
    assert "lo" in interfaces
    assert interfaces["lo"].physical is False


def test_main_refuses_without_a_config(tmp_path: Path):
    data_dir = tmp_path / "vazio"
    data_dir.mkdir()
    env = {**os.environ, "SALA_DADOS": str(data_dir)}
    result = subprocess.run(
        [sys.executable, "-m", "app.serve"],
        cwd=SALA_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=60,
    )
    assert result.returncode != 0
    assert "just sala-config" in result.stderr
    assert not (data_dir / "sala.db").exists()


def test_main_prints_the_physical_addresses(tmp_path: Path, monkeypatch, capsys):
    config = write_config(tmp_path / "dados" / "config.toml", admin_path="/professor-aaaa", password="senha-boa")
    monkeypatch.setenv("SALA_DADOS", str(config.data_dir))
    monkeypatch.setattr(serve, "list_interfaces", lambda: list(INTERFACES))
    served: dict = {}
    monkeypatch.setattr(serve, "waitress_serve", lambda app, **kwargs: served.update(kwargs))

    assert serve.main([]) == 0

    out = capsys.readouterr().out
    assert "http://192.168.99.99:8000" in out
    assert "http://10.0.5.4:8000" in out
    assert "http://172.17.0.1:8000" not in out
    assert served["host"] == "0.0.0.0" and served["port"] == 8000 and served["threads"] == 16


def test_main_honours_sala_porta(tmp_path: Path, monkeypatch, capsys):
    config = write_config(tmp_path / "dados" / "config.toml", admin_path="/professor-aaaa", password="senha-boa")
    monkeypatch.setenv("SALA_DADOS", str(config.data_dir))
    monkeypatch.setenv("SALA_PORTA", "9100")
    monkeypatch.setattr(serve, "list_interfaces", lambda: [Interface("wlan0", ("192.168.99.99",), physical=True)])
    served: dict = {}
    monkeypatch.setattr(serve, "waitress_serve", lambda app, **kwargs: served.update(kwargs))

    assert serve.main([]) == 0

    assert "http://192.168.99.99:9100" in capsys.readouterr().out
    assert served["port"] == 9100


def test_main_hints_when_there_is_no_lan_address(tmp_path: Path, monkeypatch, capsys):
    config = write_config(tmp_path / "dados" / "config.toml", admin_path="/professor-aaaa", password="senha-de-teste")
    monkeypatch.setenv("SALA_DADOS", str(config.data_dir))
    monkeypatch.setattr(serve, "list_interfaces", lambda: [Interface("lo", ("127.0.0.1",), physical=False)])
    monkeypatch.setattr(serve, "waitress_serve", lambda app, **kwargs: None)

    assert serve.main([]) == 0

    out = capsys.readouterr().out
    assert "Não achei nenhum endereço da rede local" in out


# --- the game of the day ---------------------------------------------------


@pytest.mark.parametrize(
    "argv, expected",
    [
        ([], None),
        (["enduro"], "enduro"),
        (["jogo=enduro"], "enduro"),
        (["jogo=livre"], "livre"),
        (["jogo="], None),
        (["  "], None),
        (["jogo=enduro", "extra"], "enduro"),
    ],
)
def test_the_game_argument_accepts_both_spellings(argv, expected):
    assert serve.parse_game_argument(argv) == expected


@pytest.fixture
def serving(tmp_path: Path, monkeypatch) -> Config:
    """A config in a tmp data dir and a waitress that does not really serve."""
    config = write_config(tmp_path / "dados" / "config.toml", admin_path="/professor-aaaa", password="senha-de-teste")
    monkeypatch.setenv("SALA_DADOS", str(config.data_dir))
    monkeypatch.setattr(serve, "list_interfaces", lambda: [])
    monkeypatch.setattr(serve, "waitress_serve", lambda app, **kwargs: None)
    return config


def test_main_sets_the_active_game(serving: Config, capsys):
    assert serve.main(["jogo=enduro"]) == 0

    connection = connect(serving.db_path)
    try:
        assert get_setting(connection, games.SETTING_ACTIVE_GAME) == "enduro"
        assert get_setting(connection, games.SETTING_FREE_MODE) is None
    finally:
        connection.close()
    assert "Jogo do dia: Enduro." in capsys.readouterr().out


def test_main_accepts_the_bare_id_too(serving: Config):
    assert serve.main(["enduro"]) == 0

    connection = connect(serving.db_path)
    try:
        assert get_setting(connection, games.SETTING_ACTIVE_GAME) == "enduro"
    finally:
        connection.close()


def test_main_turns_free_mode_on_with_livre(serving: Config, capsys):
    assert serve.main(["jogo=livre"]) == 0

    connection = connect(serving.db_path)
    try:
        assert get_setting(connection, games.SETTING_FREE_MODE) == games.FREE_MODE_VALUE
    finally:
        connection.close()
    assert "Modo livre ligado" in capsys.readouterr().out


def test_main_leaves_the_settings_alone_without_an_argument(serving: Config):
    assert serve.main([]) == 0

    connection = connect(serving.db_path)
    try:
        assert get_setting(connection, games.SETTING_ACTIVE_GAME) is None
        assert get_setting(connection, games.SETTING_FREE_MODE) is None
    finally:
        connection.close()


def test_main_refuses_an_unknown_game_listing_the_ids(serving: Config, capsys):
    assert serve.main(["jogo=nao-existe"]) == 1

    error = capsys.readouterr().err
    assert "Jogo desconhecido: nao-existe" in error
    assert "enduro" in error and "livre" in error
    assert not serving.db_path.exists()  # the server never started


def test_main_refuses_a_broken_catalogue(tmp_path: Path, monkeypatch, capsys):
    config = write_config(tmp_path / "dados" / "config.toml", admin_path="/professor-aaaa", password="senha-de-teste")
    monkeypatch.setenv("SALA_DADOS", str(config.data_dir))
    monkeypatch.setattr(serve, "list_interfaces", lambda: [])
    monkeypatch.setattr(serve, "waitress_serve", lambda app, **kwargs: None)

    def broken():
        raise games.CatalogueError("jogos.yml: entrada 1: id ruim")

    monkeypatch.setattr(games, "catalogue", broken)

    assert serve.main([]) == 1

    error = capsys.readouterr().err
    assert "Erro no catálogo de jogos" in error
    assert "entrada 1" in error


# --- sala.local ------------------------------------------------------------


class FakeChild:
    """A stand-in for the avahi-publish child.

    `alive` decides whether it survives the settle window, like avahi-publish
    does when the daemon is off or the name is already taken.
    """

    def __init__(self, alive: bool = True):
        self.alive = alive
        self.terminated = False
        self.killed = False
        self.waits: list[float | None] = []

    def poll(self):
        if self.killed or self.terminated:
            return 0
        return None if self.alive else 1

    def terminate(self):
        self.terminated = True

    def kill(self):
        self.killed = True

    def wait(self, timeout=None):
        self.waits.append(timeout)
        return 0


class FakeAvahi:
    """Records the Popen calls and hands out one fake child per call."""

    def __init__(self, alive: bool = True):
        self.alive = alive
        self.commands: list[list[str]] = []
        self.children: list[FakeChild] = []
        self.sleeps: list[float] = []

    def __call__(self, command, **kwargs):
        self.commands.append(list(command))
        child = FakeChild(self.alive)
        self.children.append(child)
        return child


BOARD = Interface("wlan0", ("192.168.99.99",), physical=True)
AVAHI_PATH = "/usr/bin/avahi-publish"


@pytest.fixture
def avahi(monkeypatch) -> FakeAvahi:
    """avahi-publish on PATH, a fake child and a settle wait that returns at once."""
    fake = FakeAvahi()
    monkeypatch.delenv("SALA_NOME", raising=False)
    monkeypatch.setattr(serve.shutil, "which", lambda program: AVAHI_PATH)
    monkeypatch.setattr(serve.subprocess, "Popen", fake)
    monkeypatch.setattr(serve.time, "sleep", fake.sleeps.append)
    return fake


@pytest.fixture
def board_serving(tmp_path: Path, monkeypatch) -> Config:
    """Like `serving`, but with one board address to announce."""
    config = write_config(
        tmp_path / "dados" / "config.toml", admin_path="/professor-aaaa", password="senha-de-teste"
    )
    monkeypatch.setenv("SALA_DADOS", str(config.data_dir))
    monkeypatch.delenv("SALA_PORTA", raising=False)
    monkeypatch.setattr(serve, "list_interfaces", lambda: [BOARD])
    monkeypatch.setattr(serve, "waitress_serve", lambda app, **kwargs: None)
    return config


def test_board_address_reads_the_ipv4_of_the_url():
    assert serve.board_address("http://192.168.99.99:8000") == "192.168.99.99"
    assert serve.board_address("http://10.0.5.4:9100") == "10.0.5.4"


def test_mdns_command_announces_the_name_for_the_address():
    assert serve.mdns_command("sala", "192.168.99.99") == [
        "avahi-publish",
        "-a",
        "-R",
        "sala.local",
        "192.168.99.99",
    ]


@pytest.mark.parametrize("name", ["sala", "sala-1", "turma-3", "a"])
def test_mdns_name_accepts_lowercase_letters_digits_and_hyphen(name):
    assert serve.is_valid_mdns_name(name)


@pytest.mark.parametrize("name", ["", "Sala", "sala.local", "sala_1", "turma 3", "sala!", "sala/"])
def test_mdns_name_rejects_anything_else(name):
    assert not serve.is_valid_mdns_name(name)


def test_main_announces_the_name_locally(board_serving: Config, avahi: FakeAvahi, capsys):
    assert serve.main([]) == 0

    assert avahi.commands == [["avahi-publish", "-a", "-R", "sala.local", "192.168.99.99"]]
    assert avahi.sleeps == [serve.MDNS_SETTLE_SECONDS]  # waits before announcing
    assert "Também em: http://sala.local:8000" in capsys.readouterr().out
    assert avahi.children[0].terminated  # stopped together with the server


def test_main_announces_the_sala_nome(board_serving: Config, avahi: FakeAvahi, monkeypatch, capsys):
    monkeypatch.setenv("SALA_NOME", "turma-3")

    assert serve.main([]) == 0

    assert avahi.commands == [["avahi-publish", "-a", "-R", "turma-3.local", "192.168.99.99"]]
    assert "Também em: http://turma-3.local:8000" in capsys.readouterr().out


def test_main_refuses_a_bad_sala_nome(board_serving: Config, avahi: FakeAvahi, monkeypatch, capsys):
    monkeypatch.setenv("SALA_NOME", "Sala da turma")

    assert serve.main([]) == 1

    error = capsys.readouterr().err
    assert "SALA_NOME" in error
    assert "minúsculas" in error
    assert avahi.commands == []  # nothing published, nothing served
    assert not board_serving.db_path.exists()


def test_main_hints_when_avahi_is_missing(board_serving: Config, avahi: FakeAvahi, monkeypatch, capsys):
    monkeypatch.setattr(serve.shutil, "which", lambda program: None)

    assert serve.main([]) == 0

    out = capsys.readouterr().out
    assert "sudo pacman -S avahi nss-mdns" in out
    assert "sudo systemctl enable --now avahi-daemon" in out
    assert "Também em" not in out
    assert avahi.commands == []


def test_main_hints_when_avahi_gives_up(board_serving: Config, avahi: FakeAvahi, capsys):
    avahi.alive = False  # the daemon is off or the name is taken

    assert serve.main([]) == 0

    out = capsys.readouterr().out
    assert "sudo systemctl enable --now avahi-daemon" in out
    assert "Também em" not in out
    assert not avahi.children[0].terminated  # already gone, nothing to stop


def test_main_skips_mdns_without_a_board_address(serving: Config, avahi: FakeAvahi, capsys):
    assert serve.main([]) == 0

    out = capsys.readouterr().out
    assert "avahi-daemon" not in out
    assert "Também em" not in out
    assert avahi.commands == []


def test_main_stops_avahi_on_ctrl_c(board_serving: Config, avahi: FakeAvahi, monkeypatch):
    def interrupted(app, **kwargs):
        raise KeyboardInterrupt

    monkeypatch.setattr(serve, "waitress_serve", interrupted)

    with pytest.raises(KeyboardInterrupt):
        serve.main([])

    child = avahi.children[0]
    assert child.terminated
    assert child.waits == [serve.MDNS_STOP_SECONDS]


def test_main_stops_avahi_on_sigterm(board_serving: Config, avahi: FakeAvahi, monkeypatch):
    def killed(app, **kwargs):
        assert signal.getsignal(signal.SIGTERM) is serve._exit_on_signal
        os.kill(os.getpid(), signal.SIGTERM)

    monkeypatch.setattr(serve, "waitress_serve", killed)

    with pytest.raises(SystemExit):
        serve.main([])

    assert avahi.children[0].terminated


def test_main_stops_avahi_when_the_signal_lands_during_the_settle(
    board_serving: Config, avahi: FakeAvahi, monkeypatch
):
    def sleep_then_kill(seconds):
        avahi.sleeps.append(seconds)
        assert signal.getsignal(signal.SIGTERM) is serve._exit_on_signal
        os.kill(os.getpid(), signal.SIGTERM)

    monkeypatch.setattr(serve.time, "sleep", sleep_then_kill)

    with pytest.raises(SystemExit):
        serve.main([])

    assert avahi.sleeps == [serve.MDNS_SETTLE_SECONDS]
    assert avahi.children[0].terminated


def test_stop_mdns_kills_a_child_that_ignores_terminate():
    class Stubborn(FakeChild):
        def poll(self):
            return None if not self.killed else 0

        def wait(self, timeout=None):
            if not self.killed:
                raise subprocess.TimeoutExpired(cmd="avahi-publish", timeout=timeout)
            return 0

    child = Stubborn()

    serve.stop_mdns(child)

    assert child.terminated and child.killed
