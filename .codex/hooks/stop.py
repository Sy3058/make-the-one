#!/usr/bin/env python3
"""Remind the agent about project evidence without blocking completion."""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parents[2]
status = subprocess.run(['git', '-C', str(root), 'status', '--porcelain'], capture_output=True, text=True)
message = '종료 전 관련 검증 결과와 PROJECT.md·README·해커톤 기여 기록의 갱신 필요 여부를 확인하세요. 자동 커밋하지 마세요.'
if status.stdout.strip():
    message += f' 커밋되지 않은 변경 항목이 {len(status.stdout.splitlines())}개 있습니다.'
print(json.dumps({'systemMessage': message}, ensure_ascii=False))
