"""Configuration: the Config dataclass, loading/verifying dados/config.toml and the
interactive setup run by `just sala-config` (`python -m app.config`).

The admin path and the password hash live outside the code (the repo is public), in
the gitignored data directory (`SALA_DADOS`, default `sala/dados`).
"""

from __future__ import annotations

import hashlib
import hmac
import json
import os
import secrets
import string
import sys
import tomllib
from dataclasses import dataclass, field
from getpass import getpass
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
SALA_DIR = APP_DIR.parent
DEFAULT_DATA_DIRNAME = "dados"
CONFIG_FILENAME = "config.toml"

# scrypt parameters for the teacher's password (interactive login only).
SCRYPT_N = 2**14
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 32
# OpenSSL's default memory limit is 32 MiB; scrypt needs 128*n*r bytes.
SCRYPT_MAXMEM = 128 * SCRYPT_N * SCRYPT_R * 2

ADMIN_PATH_PREFIX = "/professor-"
ADMIN_PATH_RANDOM_LENGTH = 4
MIN_PASSWORD_LENGTH = 4


class ConfigError(Exception):
    """config.toml is missing or unusable."""


def data_dir() -> Path:
    """Data directory: `SALA_DADOS` if set, else `sala/dados`."""
    override = os.environ.get("SALA_DADOS")
    if override:
        return Path(override).expanduser()
    return SALA_DIR / DEFAULT_DATA_DIRNAME


def config_path(directory: Path | None = None) -> Path:
    return (directory or data_dir()) / CONFIG_FILENAME


def default_admin_path() -> str:
    letters = "".join(secrets.choice(string.ascii_lowercase) for _ in range(ADMIN_PATH_RANDOM_LENGTH))
    return f"{ADMIN_PATH_PREFIX}{letters}"


def normalize_admin_path(value: str) -> str:
    """Return a usable admin path or raise ValueError (pt-BR message)."""
    path = (value or "").strip()
    if not path:
        raise ValueError("O caminho do professor não pode ficar vazio.")
    if not path.startswith("/"):
        path = "/" + path
    path = path.rstrip("/")
    if path == "":
        raise ValueError("O caminho do professor não pode ser a raiz do site (/).")
    if any(character.isspace() for character in path):
        raise ValueError("O caminho do professor não pode ter espaços.")
    if "?" in path or "#" in path or "\\" in path:
        raise ValueError("O caminho do professor não pode ter ? # nem \\.")
    return path


def hash_password(password: str, *, salt: bytes | None = None) -> str:
    """Hash a password as `scrypt$<n>$<r>$<p>$<salt_hex>$<hash_hex>`."""
    if not password:
        raise ValueError("A senha não pode ficar vazia.")
    salt = salt if salt is not None else secrets.token_bytes(16)
    digest = hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt,
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
        maxmem=SCRYPT_MAXMEM,
    )
    return f"scrypt${SCRYPT_N}${SCRYPT_R}${SCRYPT_P}${salt.hex()}${digest.hex()}"


def verify_password(password: str, encoded: str) -> bool:
    """Constant-time check of a password against an encoded scrypt hash."""
    try:
        scheme, n, r, p, salt_hex, hash_hex = (encoded or "").split("$")
        if scheme != "scrypt":
            return False
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
        digest = hashlib.scrypt(
            (password or "").encode("utf-8"),
            salt=salt,
            n=int(n),
            r=int(r),
            p=int(p),
            dklen=len(expected),
            maxmem=SCRYPT_MAXMEM,
        )
    except (ValueError, TypeError, OverflowError):
        return False
    return hmac.compare_digest(digest, expected)


def new_secret_key() -> str:
    return secrets.token_hex(32)


@dataclass(frozen=True)
class Config:
    """Everything the app needs to start."""

    admin_path: str
    password_hash: str
    secret_key: str
    data_dir: Path = field(default_factory=data_dir)
    # Seconds to sleep on a wrong password; tests set 0.
    login_delay: float = 1.0

    @property
    def db_path(self) -> Path:
        return self.data_dir / "sala.db"

    def check_password(self, password: str) -> bool:
        return verify_password(password, self.password_hash)

    @classmethod
    def from_file(cls, path: Path, *, login_delay: float | None = None) -> "Config":
        try:
            raw = path.read_text(encoding="utf-8")
        except OSError as error:
            raise ConfigError(f"Não consegui ler {path}: {error}") from error
        try:
            data = tomllib.loads(raw)
        except tomllib.TOMLDecodeError as error:
            raise ConfigError(f"{path} não é um TOML válido: {error}") from error

        missing = [key for key in ("admin_path", "password_hash", "secret_key") if not data.get(key)]
        if missing:
            raise ConfigError(f"{path} está sem: {', '.join(missing)}.")
        try:
            admin_path = normalize_admin_path(str(data["admin_path"]))
        except ValueError as error:
            raise ConfigError(f"{path}: {error}") from error
        if login_delay is None:
            login_delay = float(os.environ.get("SALA_LOGIN_DELAY", "1"))
        return cls(
            admin_path=admin_path,
            password_hash=str(data["password_hash"]),
            secret_key=str(data["secret_key"]),
            data_dir=path.parent,
            login_delay=login_delay,
        )

    @classmethod
    def load(cls, directory: Path | None = None) -> "Config":
        """Load the config of a data directory; raise ConfigError if missing."""
        return cls.from_file(config_path(directory))

    @classmethod
    def load_optional(cls, directory: Path | None = None) -> "Config | None":
        try:
            return cls.load(directory)
        except ConfigError:
            return None


def _toml_string(value: str) -> str:
    # json.dumps produces a valid TOML basic string for our values.
    return json.dumps(value)


def write_config(
    path: Path,
    *,
    admin_path: str,
    password: str,
    secret_key: str | None = None,
) -> Config:
    """Write config.toml with mode 0600 and return the loaded Config."""
    admin_path = normalize_admin_path(admin_path)
    password_hash = hash_password(password)
    secret_key = secret_key or new_secret_key()

    path.parent.mkdir(parents=True, exist_ok=True)
    body = (
        "# Configuração da sala — não versionar.\n"
        f"admin_path = {_toml_string(admin_path)}\n"
        f"password_hash = {_toml_string(password_hash)}\n"
        f"secret_key = {_toml_string(secret_key)}\n"
    )
    flags = os.O_WRONLY | os.O_CREAT | os.O_TRUNC
    fd = os.open(path, flags, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as handle:
        handle.write(body)
    os.chmod(path, 0o600)
    return Config.from_file(path)


def interactive_setup(path: Path, *, input_fn=input, getpass_fn=getpass) -> int:
    """Prompt the teacher (pt-BR) and write config.toml. Returns an exit code."""
    if path.exists():
        answer = input_fn(f"{path} já existe. Substituir? [s/N] ").strip().lower()
        if answer not in ("s", "sim", "y", "yes"):
            print("Nada foi alterado.")
            return 0

    suggested = default_admin_path()
    try:
        admin_path = normalize_admin_path(input_fn(f"Caminho do professor [{suggested}]: ") or suggested)
    except ValueError as error:
        print(f"Erro: {error}", file=sys.stderr)
        return 1

    password = getpass_fn("Senha do professor: ")
    if len(password) < MIN_PASSWORD_LENGTH:
        print(f"Erro: a senha precisa de pelo menos {MIN_PASSWORD_LENGTH} caracteres.", file=sys.stderr)
        return 1
    again = getpass_fn("Repita a senha: ")
    if password != again:
        print("Erro: as senhas não são iguais.", file=sys.stderr)
        return 1

    write_config(path, admin_path=admin_path, password=password)
    print(f"Pronto! Guardei em {path} (modo 0600).")
    print(f"O painel do professor fica em {admin_path}")
    print("Agora rode: just sala")
    return 0


def main() -> int:
    return interactive_setup(config_path())


if __name__ == "__main__":
    sys.exit(main())
