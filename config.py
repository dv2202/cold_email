"""Load simple KEY=VALUE settings from the project's .env file.

Project settings take precedence over values inherited from the shell.
"""

import os
import re
from pathlib import Path


def load_env(path: str | Path) -> None:
    path = Path(path)
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, separator, value = line.partition("=")
        key = key.strip()
        if not separator or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        value = value.strip()
        if value.startswith(('"', "'")):
            end = value.find(value[0], 1)
            if end != -1:
                value = value[1:end]
        else:
            value = value.split(" #", 1)[0].rstrip()
        os.environ[key] = value
