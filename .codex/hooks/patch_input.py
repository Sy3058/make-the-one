"""Small helpers for the apply_patch lifecycle hooks (not a security boundary)."""

import json
import re
import sys
from pathlib import Path


HEADER = re.compile(r"^\*\*\* (Add|Update|Delete) File: (.+)$")
EXAMPLES = {".env.example", ".env.sample", ".env.template"}
SECRET_NAMES = {
    "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
    ".npmrc", ".pypirc", ".git-credentials", "credentials",
}
SECRET_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"}


def load_input():
    data = json.load(sys.stdin)
    command = (data.get("tool_input") or {}).get("command", "")
    if not isinstance(command, str):
        raise ValueError("expected tool_input.command to be a string")
    return data, command


def patch_files(command):
    """Yield (operation, source, destination); headers don't have diff prefixes."""
    current = None
    for line in command.splitlines():
        match = HEADER.fullmatch(line)
        if match:
            if current:
                yield current
            current = (match[1], match[2], match[2])
        elif line.startswith("*** Move to: ") and current:
            current = (current[0], current[1], line.removeprefix("*** Move to: "))
    if current:
        yield current


def secret_path(path):
    parts = Path(path).parts
    name = Path(path).name.lower()
    return (
        (name == ".env" or name.startswith(".env.")) and name not in EXAMPLES
        or name in SECRET_NAMES
        or Path(name).suffix in SECRET_SUFFIXES
        or any(part.lower() in {".aws", "secrets"} for part in parts)
    )


def report_error(name, error):
    # Do not echo the payload: it may contain private content.
    print(f"{name}: hook inspection failed ({type(error).__name__}); normal permissions still apply", file=sys.stderr)
