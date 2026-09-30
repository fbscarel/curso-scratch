"""Current-lesson logic ("Aula atual"): pure functions with an injectable `today`."""

from __future__ import annotations

import sqlite3
from datetime import date

from flask import current_app

from .db import SETTING_LESSON_OVERRIDE, get_setting


def today() -> date:
    """Today's local date, or the date the app config pins (`SALA_TODAY`).

    Tests pin it so the answers of `current_lesson` and the default date of a new
    lesson do not depend on the day the suite runs.
    """
    pinned = current_app.config.get("SALA_TODAY")
    if pinned is None:
        return date.today()
    if isinstance(pinned, date):
        return pinned
    return date.fromisoformat(str(pinned))


def get_lesson(connection: sqlite3.Connection, number: int) -> sqlite3.Row | None:
    return connection.execute("SELECT * FROM lessons WHERE number = ?", (number,)).fetchone()


def lesson_override(connection: sqlite3.Connection) -> int | None:
    """The lesson number the teacher pinned, if it names an existing lesson."""
    value = get_setting(connection, SETTING_LESSON_OVERRIDE)
    if value is None:
        return None
    try:
        number = int(value)
    except ValueError:
        return None
    return number if get_lesson(connection, number) is not None else None


def current_lesson(connection: sqlite3.Connection, today: date | str) -> sqlite3.Row | None:
    """The lesson the class is on.

    The override wins when it names an existing lesson; otherwise the registered
    lesson with the greatest date <= today (ties: greatest number); otherwise None.
    """
    overridden = lesson_override(connection)
    if overridden is not None:
        return get_lesson(connection, overridden)
    day = today.isoformat() if isinstance(today, date) else str(today)
    return connection.execute(
        "SELECT * FROM lessons WHERE date <= ? ORDER BY date DESC, number DESC LIMIT 1",
        (day,),
    ).fetchone()
