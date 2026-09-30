"""config.toml: writing, loading, the scrypt password hash and the interactive setup."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.config import (
    SALA_DIR,
    Config,
    ConfigError,
    config_path,
    data_dir,
    default_admin_path,
    hash_password,
    interactive_setup,
    normalize_admin_path,
    verify_password,
    write_config,
)

PASSWORD = "senha-do-professor"


# --- password hashing ------------------------------------------------------


def test_password_hash_round_trip():
    encoded = hash_password(PASSWORD)
    assert encoded.startswith("scrypt$")
    assert verify_password(PASSWORD, encoded)
    assert not verify_password("outra-senha", encoded)


def test_password_hash_uses_a_fresh_salt_every_time():
    assert hash_password(PASSWORD) != hash_password(PASSWORD)


def test_verify_password_refuses_garbage():
    for encoded in ("", "scrypt", "md5$1$2$3$aa$bb", "scrypt$16384$8$1$zz$bb", "scrypt$16384$8$1$aabb"):
        assert not verify_password(PASSWORD, encoded)


def test_hash_password_refuses_an_empty_password():
    with pytest.raises(ValueError):
        hash_password("")


# --- paths -----------------------------------------------------------------


def test_normalize_admin_path():
    assert normalize_admin_path("professor-kqzt") == "/professor-kqzt"
    assert normalize_admin_path("/professor-kqzt/") == "/professor-kqzt"
    assert normalize_admin_path("  /professor-kqzt  ") == "/professor-kqzt"


@pytest.mark.parametrize("value", ["", "   ", "/", "professor com espaço", "/professor?x", "/professor\\x"])
def test_normalize_admin_path_rejects_bad_values(value):
    with pytest.raises(ValueError):
        normalize_admin_path(value)


def test_default_admin_path_shape():
    path = default_admin_path()
    assert path.startswith("/professor-")
    suffix = path.removeprefix("/professor-")
    assert len(suffix) == 4 and suffix.islower() and suffix.isalpha()


def test_data_dir_honours_sala_dados(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("SALA_DADOS", str(tmp_path / "dados"))
    assert data_dir() == tmp_path / "dados"
    assert config_path() == tmp_path / "dados" / "config.toml"


def test_data_dir_defaults_to_the_repo(tmp_path: Path, monkeypatch):
    monkeypatch.delenv("SALA_DADOS", raising=False)
    assert data_dir() == SALA_DIR / "dados"


# --- write + load round trip -----------------------------------------------


def test_write_and_load_round_trip(tmp_path: Path):
    path = tmp_path / "dados" / "config.toml"
    config = write_config(path, admin_path="/professor-abcd", password=PASSWORD)

    assert path.stat().st_mode & 0o777 == 0o600
    assert config.admin_path == "/professor-abcd"
    assert len(config.secret_key) == 64

    loaded = Config.from_file(path)
    assert loaded.admin_path == "/professor-abcd"
    assert loaded.password_hash == config.password_hash
    assert loaded.secret_key == config.secret_key
    assert loaded.data_dir == path.parent
    assert loaded.db_path == path.parent / "sala.db"
    assert loaded.check_password(PASSWORD)
    assert not loaded.check_password("senha-errada")


def test_write_config_generates_a_different_secret_key_each_time(tmp_path: Path):
    first = write_config(tmp_path / "a" / "config.toml", admin_path="/professor-aaaa", password=PASSWORD)
    second = write_config(tmp_path / "b" / "config.toml", admin_path="/professor-bbbb", password=PASSWORD)
    assert first.secret_key != second.secret_key


def test_load_missing_config(tmp_path: Path):
    with pytest.raises(ConfigError):
        Config.load(tmp_path)
    assert Config.load_optional(tmp_path) is None


def test_load_rejects_a_config_without_all_the_keys(tmp_path: Path):
    path = tmp_path / "config.toml"
    path.write_text('admin_path = "/professor-aaaa"\n', encoding="utf-8")
    with pytest.raises(ConfigError) as info:
        Config.from_file(path)
    assert "password_hash" in str(info.value) and "secret_key" in str(info.value)


def test_load_rejects_a_broken_toml(tmp_path: Path):
    path = tmp_path / "config.toml"
    path.write_text("admin_path = \n", encoding="utf-8")
    with pytest.raises(ConfigError):
        Config.from_file(path)


def test_default_login_delay_is_one_second(tmp_path: Path):
    config = write_config(tmp_path / "config.toml", admin_path="/professor-aaaa", password=PASSWORD)
    assert config.login_delay == 1.0


# --- interactive setup -----------------------------------------------------


def _prompter(answers: list[str]):
    replies = iter(answers)
    return lambda prompt="": next(replies)


def test_interactive_setup_writes_the_config(tmp_path: Path):
    path = tmp_path / "dados" / "config.toml"
    code = interactive_setup(
        path,
        input_fn=_prompter(["/professor-zxcv"]),
        getpass_fn=_prompter([PASSWORD, PASSWORD]),
    )
    assert code == 0
    config = Config.from_file(path)
    assert config.admin_path == "/professor-zxcv"
    assert config.check_password(PASSWORD)


def test_interactive_setup_offers_a_default_path(tmp_path: Path):
    path = tmp_path / "config.toml"
    code = interactive_setup(path, input_fn=_prompter([""]), getpass_fn=_prompter([PASSWORD, PASSWORD]))
    assert code == 0
    config = Config.from_file(path)
    assert config.admin_path.startswith("/professor-")
    assert len(config.admin_path) == len("/professor-") + 4


def test_interactive_setup_refuses_different_passwords(tmp_path: Path, capsys):
    path = tmp_path / "config.toml"
    code = interactive_setup(path, input_fn=_prompter([""]), getpass_fn=_prompter([PASSWORD, "outra-senha"]))
    assert code == 1
    assert not path.exists()
    assert "as senhas não são iguais" in capsys.readouterr().err


def test_interactive_setup_refuses_a_short_password(tmp_path: Path, capsys):
    path = tmp_path / "config.toml"
    code = interactive_setup(path, input_fn=_prompter([""]), getpass_fn=_prompter(["ab", "ab"]))
    assert code == 1
    assert not path.exists()
    assert "pelo menos" in capsys.readouterr().err


def test_interactive_setup_refuses_a_bad_path(tmp_path: Path, capsys):
    path = tmp_path / "config.toml"
    code = interactive_setup(path, input_fn=_prompter(["/"]), getpass_fn=_prompter([PASSWORD, PASSWORD]))
    assert code == 1
    assert not path.exists()
    assert capsys.readouterr().err.startswith("Erro:")


def test_interactive_setup_keeps_an_existing_config_when_declined(tmp_path: Path):
    path = tmp_path / "config.toml"
    write_config(path, admin_path="/professor-aaaa", password=PASSWORD)
    code = interactive_setup(path, input_fn=_prompter(["n"]), getpass_fn=_prompter(["outra-senha"]))
    assert code == 0
    assert Config.from_file(path).admin_path == "/professor-aaaa"


def test_interactive_setup_overwrites_an_existing_config_when_confirmed(tmp_path: Path):
    path = tmp_path / "config.toml"
    write_config(path, admin_path="/professor-aaaa", password=PASSWORD)
    code = interactive_setup(
        path,
        input_fn=_prompter(["s", "/professor-bbbb"]),
        getpass_fn=_prompter(["outra-senha", "outra-senha"]),
    )
    assert code == 0
    config = Config.from_file(path)
    assert config.admin_path == "/professor-bbbb"
    assert config.check_password("outra-senha")
