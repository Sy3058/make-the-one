# 보안 검사 가이드

## 언제 읽는가

이 문서는 다음 작업에서 관련 절만 읽는다. 매 턴·매 도구 호출마다 로드하거나 전체 검사를 반복하지 않는다.

| 시점 | 읽고 적용할 내용 |
| --- | --- |
| 외부 스킬을 추가·업데이트하기 전 | SkillSpector 정적 검사와 결과 해석 |
| 패키지·바이너리를 다운로드·설치·업데이트하기 전 | 공식 출처·버전·무결성 확인, 의존성 변경 시 OSV 검사 |
| 코드 구현·수정을 마치고 평가할 때 | 변경 경로의 보안 리뷰, 아래 기준에 해당하면 Codex Security 검사 |
| 배포 준비·명시적인 보안 점검 | 해당 앱의 의존성과 전체 보안 경계·잔여 위험 검토 |

일반 문구·서식만 바꾼 작업은 문서의 참조·일관성을 확인하면 된다. 보안 불변조건 자체를 바꾼 경우에는 관련 규칙을 검토한다.

## 자동 적용 기준과 범위

- 위 조건에 해당하면 사용자가 별도로 요청하지 않아도 관련 검사를 작업에 포함한다. 같은 범위에서 이미 허용된 검사는 매번 재승인을 묻지 않는다. 검사 범위·실제 결과·미실행 사유는 완료 보고에 포함한다.
- 외부 스킬을 새로 추가하거나 업데이트할 때는 활성화·실행 전에 SkillSpector로 해당 스킬과 동봉 스크립트를 검사한다. 기존 이관 스킬은 첫 기준 검사를 한 번 수행하고, 이후에는 변경된 대상만 다시 검사한다. 우선 `--no-llm` 정적 검사를 사용하며, 종료 코드만으로 안전을 단정하지 않고 findings와 검사 누락도 확인한다. 이 모드는 의존성 정보를 OSV에 조회할 수 있다.
- 패키지·바이너리를 다운로드·설치·업데이트할 때는 공식 출처와 버전을 확인하고 제공되는 checksum·무결성 정보를 검증한다. 모든 다운로드에 전체 코드 감사를 실행하지 않는다.
- 앱 의존성을 처음 추가하거나 manifest·lockfile을 변경할 때는 OSV-Scanner로 해당 프로젝트의 실제 해석된 의존성을 검사한다. 배포 준비와 의존성 업데이트에서도 실행한다. 락파일이 아직 없거나 지원하지 않는 형식이면 결과를 통과로 처리하지 않고 검사 범위를 명시한다.
- 코드 구현·수정이 끝나면 변경 범위에 맞게 보안 리뷰한다. 외부 입력 처리, 모델 API 연결, 인증·권한, 비밀키·환경 설정, 파일 접근·업로드, 생성 결과 렌더링, 호출량·비용 제한을 구현하거나 변경하면 사용 가능한 Codex Security로 관련 경로를 좁혀 검사하고 수정 검증을 수행한다. 첫 공개 배포 준비에는 앱 전체 검사와 잔여 위험 검토를 포함한다.
- Codex Security를 실행할 수 없으면 `fable-review`로 실제 코드와 실패 경로를 수동 검토하고, 자동 검사가 미실행임을 별도로 보고한다. 이를 Codex Security 검사 통과로 표시하지 않는다. 성공한 검사는 새 변경·실패·미해결 우려 없이 반복하지 않는다.
- Cloudflare 전체 감사는 복잡한 신뢰 경계 변경이나 독립적인 추가 검증이 필요한 중요한 발견에 선택적으로 사용한다. Anthropic 레퍼런스 하네스·Alibaba 리뷰어·PHP 전용 검사를 모든 작업의 필수 단계로 추가하지 않는다.
- 검사 도구가 없으면 공식 설치법과 버전을 확인해 격리된 도구 환경에서 준비한다. 현재 환경이 설치·네트워크·인증 승인을 요구하면 필요한 단계만 요청한다. 실행 권한·계정 접근이 없으면 조용히 생략하지 말고 제한과 대체 검토 결과를 보고한다. 확인되지 않은 실행 명령은 만들지 않는다.
- 스캐너의 입력에서 무관한 자격증명·환경 파일과 대화 기록을 제외한다. 검사 결과는 실행 허가나 자동 배포·push 승인이 아니다. 확인된 문제는 요청 범위에서 수정하고 재검증하며, 파괴적 변경이나 범위 확장이 필요하면 해당 내용만 알린다.

## 설치된 도구

2026-10-28 사용자 요청으로 다음 도구를 프로젝트의 `.tools/security/`에 설치했다. 전역 Python·npm 환경을 변경하지 않았으며 설치 파일·캐시는 Git에서 제외한다.

| 도구 | 고정 버전 | 설치 위치 |
| --- | --- | --- |
| SkillSpector | 2.12.0, NVIDIA 소스 커밋 `e7172462caf367736645f66c1aa154ca5f9c64dc` | `.tools/security/python/`의 Python 3.12.13 가상환경 |
| OSV-Scanner | 2.7.0 | `.tools/security/bin/osv-scanner` |
| Codex Security | 0.7.0 | `.tools/security/node/node_modules/` |

OSV 바이너리의 SHA-256을 공식 GitHub 배포 digest와 비교했고, Codex Security npm 무결성은 registry 값과 설치 lockfile을 비교했다. 이 확인을 전체 공급망 안전성 보증으로 해석하지 않는다.

## 실행 명령

아래 명령은 저장소 루트에서 실행한다. 공통 진입점 `scripts/security_tool.py`는 관련 없는 환경 자격증명을 하위 프로세스에 전달하지 않고 원래 종료 코드를 보존한다. SkillSpector의 `scan`에는 항상 `--no-llm`을 적용한다. 이 진입점은 의미 분석을 활성화하는 인터페이스가 아니다.

```bash
# 스킬 추가·변경 전에 정적 검사
python3 scripts/security_tool.py skillspector scan .agents/skills \
  --recursive --format json --output /tmp/skillspector-review.json

# 앱 락파일이 생긴 뒤 해당 파일만 검사 (경로는 실제 파일로 지정)
python3 scripts/security_tool.py osv-scanner scan source \
  --lockfile pnpm-lock.yaml --format json --output-file /tmp/osv-review.json

# 보안 관련 구현이 생긴 뒤 선택한 경로 검사
python3 scripts/security_tool.py codex-security scan . \
  --path scripts --model gpt-6.1-sol --effort medium \
  --max-time 5 --max-cost 1 --headless
```

마지막 명령은 실제 모델 호출을 시작하므로 범위와 예산을 확인해 사용한다. Standard의 `--max-time`은 엄격한 전체 실행 종료 시간이 아닌 조사 시간 안내다. `--max-cost`도 추정 모델 비용 기준이며 보편적인 청구 상한으로 간주하지 않는다. 검증만 하려면 `--dry-run`을 붙인다. `--patch`, `--create-pr`, `publish`는 검사 명령에 자동 추가하지 않는다.

Codex Security CLI의 자체 기본 모델과 reasoning은 프로젝트 Codex 기본값을 자동 상속한다고 가정하지 않는다. 위처럼 `gpt-6.1-sol / medium`을 명시한다.

설치 당시 기존 ChatGPT 로그인을 인식했다. 실제 스캔 모델 호출 권한·보호된 결과 접근까지 검증한 것은 아니다. 이 환경의 sandbox는 디렉터리 소유자를 매핑하므로 `login status`가 `trusted owner` 오류를 내면 권한 승인을 받아 같은 명령을 실행한다. 현재 권한 검사를 우회하거나 소유자 검사를 제거하지 않는다.

스캔 상태·결과는 저장소 밖의 사용자 전용 `/tmp/make-the-one-codex-security-<uid>/`를 사용한다. 임시 경로이므로 장기 보존을 보장하지 않는다. CLI가 임시 Codex home에서 PATH helper 별칭을 만들지 못했다는 경고를 낼 수 있으나, 이번 로그인 상태 확인은 종료 코드 0으로 성공했다. 계정 토큰은 보고서에 저장하지 않는다.

## 수행한 검사와 한계

- 세 CLI의 버전·도움말 실행 성공.
- Codex Security `login status`: 기존 ChatGPT 로그인 인식. `scan . --path scripts --dry-run --model gpt-6.1-sol --effort medium`: 사전 검증 성공. 실제 코드 보안 스캔·수정은 수행하지 않았다.
- 기존 스킬 5개에 SkillSpector `--no-llm` 정적 검사 실행. 발견 0, 최대 위험 점수 0. 그러나 보고서 전체 커버리지는 **40%, partial/CAUTION**이었다. 외부 참조와 의미 분석까지 완료된 것으로 표시하지 않는다. 원본은 `reports/security/skillspector-baseline.json`에 있다.
- 도구의 npm lockfile 124개와 Python 고정 의존성 71개, 총 195개 추출 항목을 OSV에 조회했다. 보고된 취약점은 0이다. 원본은 `reports/security/tool-dependencies-osv.json`에 있다. 이는 2026-10-28 당시 개발 도구만 검사한 결과다. 현재 앱의 package-lock.json에 대한 검사 결과가 아니며 앱 의존성의 안전성을 보증하지 않는다.
- 첫 OSV 시도는 기본 transitive resolver가 `jsonpointer==3.6` 후보를 찾지 못해 실패했다. 설치된 전체 버전 목록을 이미 갖고 있으므로 `--no-resolve`로 재해석을 끄고 전체 고정 목록을 조회했다. 이 옵션을 아직 해석되지 않은 manifest의 전체 의존성 검사에 무조건 사용하지 않는다.
- 실행 진입점의 자격증명 분리, 정적 검사 기본값, 리터럴 인자 전달, 실패 종료 코드 보존을 오프라인 테스트로 검증했다. 명령: `python3 -B -m unittest discover -s tests -p test_security_tool.py -v`.

스캐너 결과는 각 검사의 범위에서만 의미가 있으며 보안 완성을 뜻하지 않는다. 실행 시점과 범위는 이 문서의 해당 절을 따른다.

## 재설치

버전·무결성 정보는 `tools/security/versions.json`, Python 의존성은 `python-requirements.lock.txt`, npm 의존성은 해당 디렉터리의 `package.json`과 `npm-package-lock.json`에 기록했다. 현재 설치기는 Linux amd64용 OSV 바이너리와 Python 3.12·Node 24 환경을 기준으로 한다.

```bash
python3 scripts/install_security_tool.py skillspector
python3 scripts/install_security_tool.py osv
python3 scripts/install_security_tool.py codex-security
```

설치기는 공식 소스의 고정 커밋·배포 버전과 고정 의존성을 사용하며 네트워크가 필요하다. 버전 갱신은 manifest·lockfile을 검토한 뒤 명시적으로 수행한다.

공식 자료: [SkillSpector](https://github.com/NVIDIA/SkillSpector), [OSV 설치 안내](https://google.github.io/osv-scanner/installation/), [Codex Security CLI](https://learn.chatgpt.com/docs/security/cli).
