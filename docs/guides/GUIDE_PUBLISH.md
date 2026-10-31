# 공개 전 검사

파일을 stage하거나 커밋·push·PR·병합하기 전에 읽는다. 공개 저장소에는 개발에 필요한 코드·설정·검토된 문서만 올린다.

- PR은 작업 기록으로 사용한다. 사용자가 PR 생성·push·CI 확인·머지까지 맡긴 범위는 재승인 없이 완료하되 검사 실패나 미확인 CI를 통과로 취급하지 않는다. 범위 밖의 배포·tag는 별도다.
- 실제 내부 문서 링크·ID는 로컬 `docs/private/PRD_SOURCES.md`에 둔다. 공개 동기화 가이드는 절차만 설명한다. 새 체크아웃에는 내부 원본 연결을 별도로 준비한다.
- `PROJECT.md`, `docs/private/`, 원시 보안 보고서, Jev `*-live-*.json`, 자격증명·캐시·생성물은 로컬 보관한다. 공개 규칙 데이터에는 버전별 출처 식별자를 남기고 실제 내부 원본 매핑은 로컬 파일에 보존한다.
- `.gitignore`는 이미 추적 중인 파일이나 강제로 stage한 파일을 막지 않는다. 과거 커밋의 링크도 제거하지 않는다. 노출된 실제 자격증명이 발견되면 공개를 멈추고 폐기·교체하며, 이력 재작성은 별도 승인 후 진행한다.

```bash
python3 scripts/check_publish.py
python3 scripts/check_publish.py --ref HEAD
python3 -B -m unittest discover -s tests -p 'test_*.py' -v
```

기본 검사는 작업 디렉터리 대신 Git index 전체의 blob을 검사한다. `--ref`는 지정 커밋의 전체 트리를 검사한다. 비밀 파일·내부 Drive 링크·개인 절대 경로·대표 토큰/개인키/자격증명 URL, 충돌·symlink·대형 파일을 차단하며 매칭된 값은 출력하지 않는다. CI는 체크아웃된 커밋 트리와 오프라인 Python 회귀 검사를 실행한다.

패턴 검사만으로 모든 비밀이나 개인 서사를 식별할 수는 없다. stage diff와 PR 제목·본문을 직접 검토하고, 범위에 맞는 보안 검증을 함께 적용한다. 스크립트는 PR 본문·과거 Git 이력·외부 서비스 권한을 검사하지 않는다. CI job 정의는 branch protection을 자동 설정하지 않으므로 병합 전 모든 실제 check 결과를 확인한다.
