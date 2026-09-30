"""`just sala-capas` → `python -m app.cover_download`.

The recipe runs this module instead of `app.covers` for the same reason
`app.emulator_download` exists: the app imports `app.covers` (the public API
serves the covers from it), and running a module the package already imported
makes runpy print a warning about it -- and the teacher should only ever read
Brazilian Portuguese here.
"""

from __future__ import annotations

import sys

from .covers import main

if __name__ == "__main__":
    sys.exit(main())
