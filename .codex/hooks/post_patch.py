#!/usr/bin/env python3
"""Give pattern feedback for edited files, including moved files and subdirs."""

import json
import re
import subprocess
from pathlib import Path

from patch_input import load_input, patch_files, report_error, secret_path


RULES = (
    ((".py",), re.compile(r"\bdatetime\.now\s*\(\s*\)"),
     "timezone 없는 datetime.now() - 시간대 경계에 맞는 aware datetime을 사용하세요"),
    ((".py",), re.compile(r"allow_origins\s*=\s*\[\s*['\"]\*['\"]\s*\]"),
     "CORS wildcard가 있습니다. 허용 출처와 자격증명 정책을 확인하세요"),
    ((".ts", ".tsx", ".js", ".jsx", ".astro", ".vue", ".svelte"),
     re.compile(r"localStorage\.setItem\s*\(\s*['\"`][^'\"`]*(token|jwt|auth)", re.IGNORECASE),
     "localStorage에 인증 정보가 저장되는지 확인하세요"),
)


def main():
    data, command = load_input()
    cwd = Path(data.get("cwd") or Path.cwd()).resolve()
    root = Path(subprocess.run(
        ["git", "-C", str(cwd), "rev-parse", "--show-toplevel"],
        capture_output=True, check=True, text=True,
    ).stdout.strip()).resolve()
    paths = set()
    for operation, _, destination in patch_files(command):
        if operation == "Delete" or secret_path(destination):
            continue
        path = (cwd / destination).resolve()
        # Ignore symlinks into private paths or another repository.
        if path.is_relative_to(root) and path.is_file() and not secret_path(path.relative_to(root)):
            paths.add(path)
    problems = []
    for path in sorted(paths):
        rel = path.relative_to(root)
        if rel.parts[:2] == (".codex", "hooks"):
            continue
        applicable = [rule for rule in RULES if path.suffix.lower() in rule[0]]
        if not applicable:
            continue
        content = path.read_text(encoding="utf-8", errors="replace")
        for _, pattern, reason in applicable:
            for match in pattern.finditer(content):
                line = content[:match.start()].count("\n") + 1
                problems.append(f"{rel}:{line}: {reason}")
    if problems:
        # Feedback, not a rollback. Regex matches still need human/model review.
        print(json.dumps({"hookSpecificOutput": {
            "hookEventName": "PostToolUse",
            "additionalContext": "보조 패턴 검사 결과입니다. 실제 코드 맥락을 확인하고 필요한 부분을 수정하세요.\n" + "\n".join(problems),
        }}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        report_error("post_patch", error)
