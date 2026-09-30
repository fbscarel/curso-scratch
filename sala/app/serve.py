"""`python -m app.serve`: print the addresses for the board and serve with waitress.

The teacher can also name the game of the day: `just sala jogo=enduro` (or
`just sala enduro` — the recipe passes whatever was typed through) sets the active
game for single-game mode, and `just sala jogo=livre` turns free mode on. An
unknown name stops the server before it starts, listing the ids it knows.

It also announces the board address as `<SALA_NOME>.local` while the server
runs, so the class can reach it by name; avahi-publish is only a child of this
process, stopped together with it.
"""

from __future__ import annotations

import fcntl
import ipaddress
import os
import re
import shutil
import signal
import socket
import struct
import subprocess
import sys
import time
from collections.abc import Callable, Iterator, Sequence
from contextlib import contextmanager
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urlsplit

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

# The published name doubles as a hostname, so only lowercase letters, digits
# and hyphens are accepted.
MDNS_PROGRAM = "avahi-publish"
DEFAULT_MDNS_NAME = "sala"
MDNS_NAME_PATTERN = re.compile(r"[a-z0-9-]+")
# avahi-publish gives up at once when the daemon is off or the name is taken;
# one that survives this long is the one the class will actually resolve.
MDNS_SETTLE_SECONDS = 1.0
MDNS_STOP_SECONDS = 5.0


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


def mdns_hint(name: str) -> str:
    """The pt-BR instructions to make `<name>.local` work."""
    return (
        f"Para usar http://{name}.local: sudo pacman -S avahi nss-mdns"
        " e sudo systemctl enable --now avahi-daemon"
    )


def is_valid_mdns_name(name: str) -> bool:
    """True when `name` may be published as `<name>.local`."""
    return MDNS_NAME_PATTERN.fullmatch(name) is not None


def board_address(url: str) -> str:
    """The IPv4 inside one `http://<ip>:<port>` URL from the board."""
    return urlsplit(url).hostname or ""


def mdns_command(name: str, address: str) -> list[str]:
    """The avahi-publish command announcing `<name>.local` at `address`."""
    return [MDNS_PROGRAM, "-a", "-R", f"{name}.local", address]


def start_mdns(name: str, address: str) -> subprocess.Popen | None:
    """Start avahi-publish, or None when it is not installed."""
    if shutil.which(MDNS_PROGRAM) is None:
        return None
    return subprocess.Popen(mdns_command(name, address), stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def stays_up(process: subprocess.Popen) -> bool:
    """True when the child is still running after the settle time."""
    time.sleep(MDNS_SETTLE_SECONDS)
    return process.poll() is None


def stop_mdns(process: subprocess.Popen | None) -> None:
    """Stop the avahi child, if any, and reap it."""
    if process is None or process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=MDNS_STOP_SECONDS)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait()


def announce_mdns(process: subprocess.Popen | None, name: str, port: int) -> None:
    """Say where the board is announced, once the settle wait has passed.

    A child that gave up right away (daemon off, name taken) is reaped and the
    pt-BR hint is printed instead.
    """
    if process is not None and stays_up(process):
        print(f"Também em: http://{name}.local:{port}")
        return
    stop_mdns(process)
    print(mdns_hint(name))


def _exit_on_signal(signum: int, frame: object) -> None:
    raise SystemExit(0)


@contextmanager
def mdns_lifetime(start: Callable[[], subprocess.Popen | None]) -> Iterator[subprocess.Popen | None]:
    """Run the block with `start()`'s avahi child alive, stopping it on the way out.

    The SIGTERM handler goes up before the child is even started and the process
    is handed to the block, so Ctrl+C and a plain kill both reach the cleanup —
    including a signal that lands during the settle wait — and never leave an
    avahi-publish behind.
    """
    previous = signal.signal(signal.SIGTERM, _exit_on_signal)
    process: subprocess.Popen | None = None
    try:
        process = start()
        yield process
    finally:
        signal.signal(signal.SIGTERM, previous)
        stop_mdns(process)


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

    name = os.environ.get("SALA_NOME", DEFAULT_MDNS_NAME)
    if not is_valid_mdns_name(name):
        print(
            f"Erro: SALA_NOME={name!r} não serve: use só letras minúsculas, números e hífen (ex.: sala).",
            file=sys.stderr,
        )
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

    def start_publisher() -> subprocess.Popen | None:
        if not urls:
            return None
        return start_mdns(name, board_address(urls[0]))

    with mdns_lifetime(start_publisher) as publisher:
        if urls:
            announce_mdns(publisher, name, port)
        waitress_serve(app, host="0.0.0.0", port=port, threads=THREADS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
