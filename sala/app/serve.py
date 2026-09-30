"""`python -m app.serve`: print the addresses for the board and serve with waitress.

The teacher can also name the game of the day: `just sala jogo=enduro` (or
`just sala enduro` — the recipe passes whatever was typed through) sets the active
game for single-game mode, and `just sala jogo=livre` turns free mode on. An
unknown name stops the server before it starts, listing the ids it knows.
"""

from __future__ import annotations

import fcntl
import ipaddress
import os
import socket
import struct
import sys
from collections.abc import Sequence
from dataclasses import dataclass
from pathlib import Path

from waitress import serve as waitress_serve

from . import create_app, emulatorjs, games
from .config import Config
from .db import get_db

DEFAULT_PORT = 8000
THREADS = 16
SYS_CLASS_NET = Path("/sys/class/net")
SIOCGIFADDR = 0x8915

# `just sala jogo=enduro` arrives as the single argument `jogo=enduro`; the
# prefix is stripped here (and not in the recipe) so `just sala enduro` works too.
GAME_ARGUMENT_PREFIX = "jogo="

RFC1918_NETWORKS = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
)

MISSING_CONFIG_MESSAGE = "Não achei o dados/config.toml. Rode primeiro: just sala-config"
NO_ADDRESS_MESSAGE = (
    "Não achei nenhum endereço da rede local. Veja o IP da máquina com `ip -4 addr`"
    " e escreva no quadro."
)


@dataclass(frozen=True)
class Interface:
    """One network interface: its name, IPv4 addresses and whether it is physical."""

    name: str
    addresses: tuple[str, ...]
    physical: bool


def is_rfc1918(address: str) -> bool:
    """True for a private IPv4 address (10/8, 172.16/12, 192.168/16)."""
    try:
        parsed = ipaddress.ip_address(address)
    except ValueError:
        return False
    if not isinstance(parsed, ipaddress.IPv4Address):
        return False
    return any(parsed in network for network in RFC1918_NETWORKS)


def lan_addresses(interfaces: Sequence[Interface], port: int = DEFAULT_PORT) -> list[str]:
    """The `http://<ip>:<port>` URLs for the board.

    Only IPv4 of physical interfaces (docker bridges, veth, tun/wg and loopback
    have no `/sys/class/net/<if>/device` link) with an RFC1918 address.
    """
    urls: list[str] = []
    for interface in interfaces:
        if not interface.physical:
            continue
        for address in interface.addresses:
            if not is_rfc1918(address):
                continue
            url = f"http://{address}:{port}"
            if url not in urls:
                urls.append(url)
    return urls


def _interface_ipv4(name: str) -> str | None:
    with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
        try:
            packed = fcntl.ioctl(sock.fileno(), SIOCGIFADDR, struct.pack("256s", name[:15].encode()))
        except OSError:
            return None
    return socket.inet_ntoa(packed[20:24])


def list_interfaces() -> list[Interface]:
    """The host's interfaces, read from `/sys/class/net`."""
    try:
        names = sorted(os.listdir(SYS_CLASS_NET))
    except OSError:
        return []
    interfaces = []
    for name in names:
        address = _interface_ipv4(name)
        interfaces.append(
            Interface(
                name=name,
                addresses=(address,) if address else (),
                physical=(SYS_CLASS_NET / name / "device").exists(),
            )
        )
    return interfaces


def parse_game_argument(argv: Sequence[str]) -> str | None:
    """The game the teacher named on the command line, or None.

    `just sala jogo=enduro` hands over `jogo=enduro`; `just sala enduro` hands
    over `enduro`. Anything after the first argument is ignored.
    """
    if not argv:
        return None
    value = argv[0].strip()
    if value.startswith(GAME_ARGUMENT_PREFIX):
        value = value[len(GAME_ARGUMENT_PREFIX) :].strip()
    return value or None


def _choice_message(choice: str) -> str:
    if choice == games.FREE_MODE_CHOICE:
        return "Modo livre ligado: a turma escolhe qualquer jogo do catálogo."
    jogo = games.by_id(choice)
    title = jogo.title if jogo is not None else choice
    return f"Jogo do dia: {title}."


def main(argv: Sequence[str] | None = None) -> int:
    config = Config.load_optional()
    if config is None:
        print(MISSING_CONFIG_MESSAGE, file=sys.stderr)
        return 1

    try:
        games.catalogue()
    except (games.CatalogueError, emulatorjs.ManifestError) as error:
        print(f"Erro no catálogo de jogos: {error}", file=sys.stderr)
        return 1

    choice = parse_game_argument(list(sys.argv[1:] if argv is None else argv))
    if choice is not None and choice != games.FREE_MODE_CHOICE and games.by_id(choice) is None:
        print(f"Erro: {games.unknown_game_message(choice)}", file=sys.stderr)
        return 1

    port = int(os.environ.get("SALA_PORTA", DEFAULT_PORT))
    urls = lan_addresses(list_interfaces(), port)
    if urls:
        print("Escreva no quadro um destes endereços:")
        for url in urls:
            print(f"  {url}")
    else:
        print(NO_ADDRESS_MESSAGE)

    app = create_app(config)
    if choice is not None:
        with app.app_context():
            games.choose(get_db(), choice)
        print(_choice_message(choice))

    waitress_serve(app, host="0.0.0.0", port=port, threads=THREADS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
