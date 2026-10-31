"""`just sala-groovie` → `python -m app.groovie_download`.

The recipe runs this module instead of `app.groovie` for the same reason
`app.emulator_download` exists: the app imports `app.groovie` (the page serves
from it), and running a module the package already imported makes runpy print a
warning about it — and the teacher should only ever read Brazilian Portuguese
here.
"""

from __future__ import annotations

import sys

from .groovie import main

if __name__ == "__main__":
    sys.exit(main())
