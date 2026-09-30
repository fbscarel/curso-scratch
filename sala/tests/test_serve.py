"""app.serve: the board addresses (pure function) and the missing-config refusal."""

from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

import pytest

from app import serve
from app.config import Config, write_config
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

    assert serve.main() == 0

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

    assert serve.main() == 0

    assert "http://192.168.99.99:9100" in capsys.readouterr().out
    assert served["port"] == 9100


def test_main_hints_when_there_is_no_lan_address(tmp_path: Path, monkeypatch, capsys):
    config = write_config(tmp_path / "dados" / "config.toml", admin_path="/professor-aaaa", password="senha-boa")
    monkeypatch.setenv("SALA_DADOS", str(config.data_dir))
    monkeypatch.setattr(serve, "list_interfaces", lambda: [Interface("lo", ("127.0.0.1",), physical=False)])
    monkeypatch.setattr(serve, "waitress_serve", lambda app, **kwargs: None)

    assert serve.main() == 0

    out = capsys.readouterr().out
    assert "Não achei nenhum endereço da rede local" in out
