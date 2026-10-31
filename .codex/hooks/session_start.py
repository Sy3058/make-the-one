#!/usr/bin/env python3
"""Report the current repository context without relying on Claude files."""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]

def git(*args):
    result = subprocess.run(['git', '-C', str(root), *args], capture_output=True, text=True)
    return result.stdout.strip() if result.returncode == 0 else ''

print(json.dumps({'systemMessage': '\n'.join([
    '프로젝트: Story to Destiny (가상 인물 이름 창작 도구)',
    '범위·완료조건: PROJECT.md, 작업 지침: AGENTS.md',
    f'브랜치: {git("branch", "--show-current") or "unknown"}',
    f'마지막 커밋: {git("log", "--oneline", "-1") or "없음"}',
    f'변경 파일:\n{git("status", "--short") or "없음"}',
])}, ensure_ascii=False))
