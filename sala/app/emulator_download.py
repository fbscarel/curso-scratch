"""`just sala-emulador` → `python -m app.emulator_download`.

The recipe runs this module instead of `app.emulatorjs` because the app imports
the latter (`app.games` reads the manifest): running a module that the package
already imported makes runpy print a warning about it, and the teacher should
only ever read Brazilian Portuguese here.
"""

from __future__ import annotations

import sys

from .emulatorjs import main

if __name__ == "__main__":
    sys.exit(main())
