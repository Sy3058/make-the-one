"""Run the project's isolated security tools without unrelated environment secrets."""

import os
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BASE = ROOT / ".tools/security"
TOOLS = {
    "skillspector": BASE / "python/bin/skillspector",
    "osv-scanner": BASE / "bin/osv-scanner",
    "codex-security": BASE / "node/node_modules/.bin/codex-security",
}
ENVIRONMENT = {
    "PATH", "HOME", "USER", "LOGNAME", "LANG", "LC_ALL", "TMPDIR",
    "XDG_CONFIG_HOME", "XDG_DATA_HOME", "XDG_CACHE_HOME",
    "SSL_CERT_FILE", "SSL_CERT_DIR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY",
}


def main():
    if len(sys.argv) < 2 or sys.argv[1] not in TOOLS:
        print("Usage: python3 scripts/security_tool.py {skillspector|osv-scanner|codex-security} [arguments]", file=sys.stderr)
        return 2
    name, args = sys.argv[1], sys.argv[2:]
    binary = TOOLS[name]
    if not binary.is_file():
        print(f"{name} is not installed at {binary}", file=sys.stderr)
        return 2
    env = {key: value for key, value in os.environ.items() if key in ENVIRONMENT}
    if name == "skillspector" and args and args[0] == "scan" and "--no-llm" not in args:
        args = [*args, "--no-llm"]
    if name == "codex-security":
        # Existing file-backed Codex sign-in still works through HOME. Only relevant
        # explicitly supplied inference credentials may enter the child environment.
        for key in ("OPENAI_API_KEY", "CODEX_API_KEY", "CODEX_ACCESS_TOKEN"):
            if key in os.environ:
                env[key] = os.environ[key]
        # The CLI requires artifacts outside the scanned repository. Reject an
        # unexpected shared/symlinked directory before using this private location.
        state = Path(tempfile.gettempdir()) / f"make-the-one-codex-security-{os.getuid()}"
        state.mkdir(mode=0o700, exist_ok=True)
        if state.is_symlink() or state.stat().st_uid != os.getuid() or state.stat().st_mode & 0o077:
            print("Codex Security state directory must be private and owned by this user", file=sys.stderr)
            return 2
        env["CODEX_SECURITY_STATE_DIR"] = str(state)
    return subprocess.run([str(binary), *args], env=env).returncode


if __name__ == "__main__":
    raise SystemExit(main())
