"""Check the Git index or a commit tree before publishing; never print matched values."""

import argparse
import json
import re
import subprocess
from pathlib import PurePosixPath


PRIVATE_DIRS = {
    ".aws", ".tools", ".venv", "node_modules", ".next", "secrets",
    "__pycache__", ".codex-log", "hook_outputs", "dist", "coverage", ".pytest_cache", ".ruff_cache",
}
EXAMPLES = {".env.example", ".env.sample", ".env.template"}
KEY_SUFFIXES = {".pem", ".key", ".p12", ".pfx", ".jks", ".keystore"}
# Two reviewed source/search datasets replace arbitrary sub-megabyte shards.
# Exact paths only; JSON structure and all secret checks still apply.
LARGE_JSON = {
    "data/hanja/sources.json": (8_000_000, "hanja-evidence-v1", {"manifest", "files"}),
    "data/hanja/catalog.json": (8_000_000, "hanja-search-v4", {"entries", "index", "counts", "source_audit", "concepts", "concept_audit"}),
}
PATTERNS = {
    "private key": re.compile(rb"-----BEGIN(?: [A-Z]+)* PRIVATE KEY-----"),
    "GitHub token": re.compile(rb"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b"),
    "AWS access key": re.compile(rb"\b(?:AKIA|ASIA)[A-Z0-9]{16}\b"),
    "API token": re.compile(rb"\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}\b"),
    "internal Drive link": re.compile(rb"https?://(?:docs|drive)\.google\.com/", re.I),
    "personal filesystem path": re.compile(rb"(?:/home/|/Users/)[A-Za-z0-9_.-]+/|[A-Za-z]:\\Users\\[A-Za-z0-9_.-]+\\"),
    "literal credential": re.compile(
        rb'''\b(?:api[_-]?key|access[_-]?token|client[_-]?secret|password)["']?\s*[:=]\s*["'][A-Za-z0-9_+/=-]{24,}["']''',
        re.I,
    ),
}
AUTH_URL = re.compile(rb"(?:postgres(?:ql)?|mysql|https?)://([^\s/:@]+):([^\s/@]+)@", re.I)


def git(*args):
    return subprocess.check_output(["git", *args])


def blocked_path(name):
    path = PurePosixPath(name)
    if any(part in PRIVATE_DIRS for part in path.parts):
        return True
    if name == "PROJECT.md" or name.startswith(("docs/private/", "reports/security/")):
        return True
    if name.startswith("experiments/jev/") and "-live-" in path.name:
        return True
    if path.name.startswith(".env") and path.name not in EXAMPLES:
        return True
    return path.suffix.lower() in KEY_SUFFIXES or path.name in {
        ".npmrc", ".pypirc", ".git-credentials", "id_rsa", "id_dsa", "id_ecdsa", "id_ed25519",
        ".DS_Store",
    } or path.name.endswith((".tsbuildinfo", ".pyc", ".pyo", ".log", ".local"))


def snapshot(ref=None):
    if ref is None:
        rows = git("ls-files", "--stage", "-z")
    else:
        tree = git("rev-parse", "--verify", "--end-of-options", ref + "^{tree}").decode().strip()
        rows = git("ls-tree", "-r", "-z", tree)
    for row in rows.split(b"\0"):
        if not row:
            continue
        metadata, raw_name = row.split(b"\t", 1)
        first, second, third = metadata.decode().split()
        mode, oid = (first, second) if ref is None else (first, third)
        yield raw_name.decode("utf-8", errors="surrogateescape"), mode, oid, third if ref is None else "0"


def check(ref=None):
    findings = []
    count = 0
    for name, mode, oid, stage in snapshot(ref):
        count += 1
        if stage != "0":
            findings.append((name, 0, "unresolved merge"))
            continue
        if blocked_path(name):
            findings.append((name, 0, "private or generated path"))
            continue
        if mode not in {"100644", "100755"}:
            findings.append((name, 0, "symlink or submodule requires explicit review"))
            continue
        size = int(git("cat-file", "-s", oid))
        limit = LARGE_JSON.get(name, (1_000_000,))[0]
        if size > limit:
            findings.append((name, 0, "file exceeds 1 MB review limit" if name not in LARGE_JSON else "Hanja JSON exceeds 8 MB review limit"))
            continue
        blob = git("cat-file", "blob", oid)
        if name in LARGE_JSON:
            try:
                value = json.loads(blob)
                _, version, required = LARGE_JSON[name]
                if not isinstance(value, dict) or value.get("version") != version or not required <= value.keys():
                    raise ValueError("Invalid Hanja dataset")
            except (ValueError, UnicodeError, RecursionError):
                findings.append((name, 0, "invalid Hanja JSON structure"))
        for label, pattern in PATTERNS.items():
            match = pattern.search(blob)
            if match:
                findings.append((name, blob.count(b"\n", 0, match.start()) + 1, label))
        for match in AUTH_URL.finditer(blob):
            # Only the checked-in environment example may contain this exact dummy pair.
            if PurePosixPath(name).name in EXAMPLES and match.groups() == (b"user", b"password"):
                continue
            findings.append((name, blob.count(b"\n", 0, match.start()) + 1, "credential-bearing URL"))
    return count, findings


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--ref", help="Scan this commit tree instead of the Git index")
    args = parser.parse_args()
    try:
        count, findings = check(args.ref)
    except (subprocess.CalledProcessError, ValueError) as error:
        print(f"Publish check could not inspect Git snapshot ({type(error).__name__}).")
        return 2
    for name, line, reason in findings:
        print(f"{name!r}:{line}: {reason}")
    if findings:
        print(f"Publish check blocked: {len(findings)} finding(s); values suppressed.")
        return 1
    print(f"Publish check passed: {count} Git snapshot files inspected.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
