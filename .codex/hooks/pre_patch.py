#!/usr/bin/env python3
"""Check newly added text and source/destination paths before apply_patch."""

import json

from patch_input import load_input, patch_files, report_error, secret_path


def deny(reason):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse",
        "permissionDecision": "deny",
        "permissionDecisionReason": reason,
    }}, ensure_ascii=False))


def main():
    _, command = load_input()
    if any(line.startswith("+") and "\u2014" in line for line in command.splitlines()):
        deny("추가하는 텍스트에는 em dash(U+2014) 대신 hyphen(-)을 사용하세요.")
        return
    for _, source, destination in patch_files(command):
        if secret_path(source) or secret_path(destination):
            deny("비밀 파일 경로의 변경·삭제·이동은 apply_patch로 수행할 수 없습니다. 예시 환경 파일만 사용하세요.")
            return


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        report_error("pre_patch", error)
