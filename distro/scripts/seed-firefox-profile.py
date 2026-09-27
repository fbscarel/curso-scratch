#!/usr/bin/env python3
"""Seed the student's Firefox profile in /etc/skel.

Every boot starts from a fresh profile, so force-installed add-ons count as newly
installed each time and SponsorBlock opens its welcome tab on every launch. It skips
that when sync storage already holds a userID, so we ship a profile whose
storage-sync-v2.sqlite (schema copied from Firefox 156, user_version 2) has one.
installs.ini pins the profile to /usr/lib/firefox (install hash 4F96D1932A9F858E),
otherwise Firefox would create its own dedicated profile and ignore this one.
"""
import secrets, sqlite3
from pathlib import Path

FF = Path(__file__).resolve().parent.parent / "profile/airootfs/etc/skel/.config/mozilla/firefox"
PROFILE = "scratchlab.default-release"
INSTALL_HASH = "4F96D1932A9F858E"

SCHEMA = """
CREATE TABLE storage_sync_data (
    ext_id TEXT NOT NULL PRIMARY KEY,
    data TEXT,
    sync_change_counter INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE storage_sync_mirror (
    guid TEXT NOT NULL PRIMARY KEY,
    ext_id TEXT UNIQUE,
    data TEXT
    CHECK((ext_id IS NULL AND data IS NULL) OR (ext_id IS NOT NULL AND data IS NOT NULL))
);
CREATE TABLE meta (
    key TEXT PRIMARY KEY,
    value NOT NULL
) WITHOUT ROWID;
PRAGMA user_version = 2;
"""

(FF / PROFILE).mkdir(parents=True, exist_ok=True)
db_path = FF / PROFILE / "storage-sync-v2.sqlite"
db_path.unlink(missing_ok=True)
db = sqlite3.connect(db_path)
db.executescript(SCHEMA)
# SponsorBlock userIDs are 36-char random strings; one shared ID is fine (nothing is submitted).
db.execute("INSERT INTO storage_sync_data (ext_id, data, sync_change_counter) VALUES (?, ?, 0)",
           ("sponsorBlocker@ajay.app", '{"userID":"%s"}' % secrets.token_hex(18)))
db.commit()
db.close()

(FF / "profiles.ini").write_text(f"""[General]
StartWithLastProfile=1
Version=2

[Profile0]
Name=default-release
IsRelative=1
Path={PROFILE}
Default=1

[Install{INSTALL_HASH}]
Default={PROFILE}
Locked=1
""")
(FF / "installs.ini").write_text(f"""[{INSTALL_HASH}]
Default={PROFILE}
Locked=1
""")
print(f"seeded {FF / PROFILE}")
