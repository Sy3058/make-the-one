# Codex 설정

2026-10-27에 `../d-web`의 개발 도구 설정을 이 프로젝트에 맞게 이관했다. 제품 코드나 데이터는 가져오지 않았다.

## 구성

| 경로 | 역할 |
| --- | --- |
| `AGENTS.md` | 매 작업 공통 규칙과 작업별 가이드 진입점 |
| `docs/guides/` | PRD 동기화·Git·제품 구현/검증·Codex·보안의 조건부 상세 규칙 |
| `.codex/config.toml` | 기본 모델 `gpt-6.1-sol`, reasoning `medium`, hooks 활성화 |
| `.codex/hooks.json` | 세션 시작, 패치 전후, 종료 이벤트 연결 |
| `.codex/hooks/` | Git 상태 안내, 패치의 비밀 파일·추가 텍스트 검사, Python/JS 패턴 피드백, 종료 안내 |
| `.agents/skills/fable-plan` | 계획·설계 |
| `.agents/skills/fable-exec` | 구현·디버깅 |
| `.agents/skills/fable-review` | 코드·설계 리뷰 |
| `.agents/skills/council-review` | 주요 계획의 다섯 관점 검토 |
| `.agents/skills/typesafe-ai` | 필요할 때만 사용하는 TypeSafe 개발 가이드, 원본 MIT 라이선스 포함 |
| `tests/test_codex_hooks.py` | 훅 실행과 Git 제외 규칙의 회귀 검사 (표준 Python unittest) |
| `scripts/jev_harness.py` | 명시한 상태만 전송하는 Jev 개발 보조 CLI; 실행 권한 없이 추천과 실제 호출 기록만 반환 |
| `docs/JEV_TRIAL.md`, `experiments/jev/` | 사용자 요청으로 시작한 Jev 실제 시험 운영 기준·고정 사례·원본 응답·사용량 |

## 전체 이관 재검토

2026-10-27 전체 재검토에서는 원본의 루트 지침·영역별 지침 목록, Codex 설정·훅, 스킬 5개와 UI 메타데이터, Claude 공유 훅, Git 훅·워크플로·커밋 가이드, `.gitignore`를 현재 파일과 대조했다. 인증 파일·대화 이력은 검사하거나 복사하지 않았다.

| 항목 | 판단과 적용 |
| --- | --- |
| 한국어·기존 변경 보존·공식 근거·필요한 문서만 읽기 | 공통 작업 원칙으로 유지 |
| 모델·reasoning | 사용자 지정 Sol Medium 기본, 아래 기준으로 필요할 때만 변경 |
| Fable 3종·Council | 유지, 없는 결정·마일스톤 문서 경로 대신 `PROJECT.md`와 실제 존재하는 기록 참조 |
| TypeSafe | 스킬과 MIT 라이선스 유지, 일반 AI 기획이 아닌 선택된 TypeSafe 작업에 적용하도록 설명 범위 축소 |
| 패치 전 검사 | 기존 em dash 삭제·문맥은 허용하고 추가 줄만 검사; 파일 이동의 출발·도착 경로와 비밀 키 경로 검사 |
| 패치 후 검사 | 하위 작업 폴더와 이동한 파일을 검사; 저장소 밖·비밀 경로의 symlink는 읽지 않음 |
| 패턴 일치의 처리 | 정규식은 주석·문자열에서도 일치할 수 있어 자동 실패 대신 실제 코드 확인용 피드백으로 전달 |
| 세션 시작·종료 | 현재 Git 상태와 문서 갱신 필요 안내 유지, 자동 커밋·강제 후속 턴 없음 |
| Git 작업 | 브랜치·커밋·push·tag 승인 규칙과 원자적 커밋 원칙 유지; PR 게시도 요청 범위에서 수행 |
| Git 제외 규칙 | 빠진 개인 키·비밀 폴더·훅 로그·일반 빌드/검증 산출물 제외 추가; 예시 환경 파일·도구 설정은 공유 가능 |
| 원본의 `.githooks` | 앱 영역·브랜치·커밋 형식이 d-web에 종속되어 설치·활성화하지 않음; main push 금지는 현재 에이전트 지침이며 Git 훅으로 강제되지 않음 |
| 원본의 도구 설정 로컬 전용 방침 | 이 저장소는 비밀이 없는 지침·스킬·훅을 Git으로 재현 가능하게 공유; 자격증명·로그는 계속 제외 |
| 웹툰 결제·인증·DB·Astro/Admin 검사 명령 | 제품·스택이 달라 제외; API 비밀 보호와 시간대·입력 검증 원칙만 현재 범위에 맞게 유지 |
| study 복습·퀴즈·LEARN 주석 | 자동 학습 흐름은 이관하지 않음; 사용자가 요청한 학습·정리는 별도 수행 가능 |
| 브라우저·E2E | 원본의 수동 브라우저 검증과 Playwright 미도입 방침 유지 |

제품 스택은 Master PRD 6B에서 확정됐다. 현재 Next.js/TypeScript 의존성과 `.github/workflows/ci.yml`이 있으며, 검사 명령은 package.json·README·CI의 실제 정의를 따른다. 미확인 배포 환경이나 별도 backend 명령은 가정하지 않는다.

## 스킬을 적용할 때

| 상황 | 적용할 스킬 | 경계 |
| --- | --- | --- |
| 기능·아키텍처 설계, 작업 분해 | `fable-plan` | 계획만 요청받으면 구현하지 않음 |
| 기능 구현, 버그 원인 조사와 수정 | `fable-exec` | 필요한 수정·검증까지 완료; 사소한 수정에 별도 계획 문서 강제 안 함 |
| 코드·설계·보안 검토 | `fable-review` | 실제 정의와 실패 경로를 확인하고 발견·검증 공백을 보고 |
| 비용이 큰 설계·출시 결정 | `council-review` | 여러 관점의 검토가 유용할 때만 적용; 독립 병렬 리뷰는 사용자 요청 시에만 |
| 이미 선택한 TypeSafe 통합의 설계·구현 | `typesafe-ai` | Meta 제품 흐름에 서비스를 자동 추가하지 않음 |

스킬은 작업의 방식이고 모델은 실행 주체다. 모든 작업에 스킬 5개를 동시에 적용하거나 Council을 필수 승인 단계로 두지 않는다.

## 모델과 reasoning 선택

2026-10-27 사용자 지정에 따라 기본 모델을 `gpt-6.1-sol`로 변경했다. 현재는 앱 코드 없이 `PROJECT.md`와 개발 도구 설정이 있는 초기 단계다. 기본 Sol이 계획부터 구현·검증까지 담당하며, 기존의 Astra 계획자 / Sol 구현자 분업을 강제하지 않는다.

아래는 공식 모델 설명과 현재 프로젝트 범위를 바탕으로 정한 운영 권장값이다. 이 프로젝트에서 모델별 품질·속도·비용을 실측한 결과는 아니다.

| 작업·상황 | 모델 / reasoning | 적용 기준 |
| --- | --- | --- |
| MVP 작업 분해, 일반 구현·디버깅·리뷰 | `gpt-6.1-sol` Medium | 프로젝트 기본값 |
| 명확한 작은 설정·문서 수정 | `gpt-6.1-sol` Low | 새로운 설계 판단이 없는 작업, 짧으면 메인이 직접 처리 |
| 사주 계산 규칙·경계조건, 보안 설계, 복잡한 원인 조사 | `gpt-6.1-sol` High | 여러 제약을 함께 판단해야 할 때; 미해결 문제가 남으면 XHigh 고려 |
| 중요한 미해결 설계 문제, 독립적인 추가 검토 | `gpt-6-astra` High/XHigh | Sol의 조사·검증 후에도 중요한 불확실성이 남는 경우 또는 사용자가 요청한 경우 |
| 한정된 파일 검색·확정 규칙의 반복 수정 | `gpt-6-luna` Low | 위임이 허용되고 전달 비용보다 이득이 클 때만; 메인이 결과 검증 |
| 화면 중심 조사·시각적 비교 | `gpt-6.1-terra` Medium | 실제 화면 작업이 필요할 때 선택적으로 비교; 현재 도입 필수 아님 |

Sol은 `low`, `medium`, `high`, `xhigh`, `max`를 지원한다. 여기서는 Medium을 출발점으로 하고 관찰된 난도와 실패에 따라 높인다. Max를 상시 사용하거나 모든 계획·리뷰를 Astra로 보내지 않는다. [공식 Sol 모델 안내](https://developers.openai.com/api/docs/models/gpt-6.1-sol)

공식 안내는 Sol을 복잡한 작업에서 비용과 성능을 균형 있게 선택하는 모델, Astra를 가장 어려운 추론용, Luna를 한정된 반복 작업용, Terra를 시각 추론·화면 조작용으로 설명한다. 실제 품질은 같은 작업의 결과와 검증으로 판단한다. [공식 모델 선택 안내](https://developers.openai.com/api/docs/guides/model-selection)

Fable은 모델이 아니라 작업 지침이다. 계획은 `fable-plan`, 구현은 `fable-exec`, 리뷰는 `fable-review`를 Sol에서 적용할 수 있다. Council도 메인이 여러 관점을 검토하는 방식이며 독립 병렬 리뷰를 자동으로 뜻하지 않는다. TypeSafe 스킬은 해당 서비스를 쓰는 별도 작업용이다. 이 설정은 개발용 Codex 모델 선택이며, 제품의 Meta 모델 사용 계획은 `PROJECT.md`를 따른다.

## 적용 방법과 한계

- `AGENTS.md`에는 보안 가이드를 읽을 시점만 둔다. 상세 적용 기준·실행 명령·설치 버전·초기 검사 결과는 `docs/guides/GUIDE_SECURITY.md`에 모았으며, 해당 작업에서 관련 절만 읽는다. 세 도구는 `.tools/security/`에 격리 설치되어 있다.
- `AGENTS.md`는 에이전트가 작업할 때 적용하는 지침이다. 백그라운드 스케줄러나 Git/CI 강제 실행 장치가 아니다. 현재 CI는 앱의 typecheck·test·build를 정의한다. 보안 의존성 스캔의 CI 연결은 아직 없으며, 로컬 보안 도구 설치를 앱 의존성 검사 완료로 해석하지 않는다.
- 새 Codex 세션에서 이 저장소를 열어 스킬과 설정이 로드되는지 확인한다. 현재 세션이 즉시 모델을 전환하거나 새 스킬을 자동 등록했다고 가정하지 않는다.
- 프로젝트 `.codex/config.toml`은 trusted project에서 적용된다. 실행 옵션과 관리 정책이 우선할 수 있다. [공식 설정 문서](https://learn.chatgpt.com/docs/config-file/config-basic)
- 훅은 지원되는 로컬 Codex 실행 환경에서 작동한다. Work Cloud 오케스트레이션에서는 로컬 command hooks가 지원되지 않을 수 있다. 스크립트의 직접 검증과 실제 세션 이벤트 실행은 구분한다. [공식 Hooks 문서](https://learn.chatgpt.com/docs/hooks)
- 패치 검사는 `apply_patch` 경로의 보조 검사다. 모든 shell 편집이나 비밀 유출을 차단하는 보안 경계가 아니며 실제 검토·테스트를 대체하지 않는다. PostToolUse는 이미 적용된 변경을 되돌리지 않는다.
- 훅은 Python 3.10 이상과 Git을 전제로 한다. 잘못된 입력·실행 오류는 payload를 노출하지 않는 stderr 진단으로 알리고, 현재 실행 환경의 권한 판단을 대신하지 않는다. 개인 키·환경 파일은 별도 비밀 관리 경로를 사용한다.
- 이전 `.claude` 의존성, study 복습 알림, backend 전용 자동 포맷, 웹툰·결제 규칙과 과거 진행 상태는 가져오지 않았다. 기존 Claude Bash guard의 프로젝트 전용 SQL·경로 규칙도 제외했다. 실행 권한은 현재 환경 정책을 따른다.
- TypeSafe 스킬은 참고용이다. API 통합·호출, 비용 지출이나 Meta 대신 제품 모델로 쓰는 결정을 자동 승인하지 않는다.
- 인증 정보, API 키, 대화 기록, 캐시와 기존 permission 누적 기록은 이관하지 않았다.
- 비밀이 없는 도구 설정은 Git으로 공유하며 자격증명·로컬 캐시·내부 문서 참조·원시 실행 기록은 `.gitignore`로 제외한다. 행사 이전부터 쓰던 개발 도구 설정을 새 제품 구현 실적으로 표시하지 않는다.

제품 검사 명령은 현재 `package.json`, README와 CI에서 확인하고, 적용 기준은 `docs/guides/GUIDE_DEVELOPMENT.md`에 유지한다. 작업별 상세 규칙을 `AGENTS.md`에 추가하지 않는다.

도구 회귀 검사는 `python3 -B -m unittest discover -s tests -p test_codex_hooks.py -v`로 실행한다. 스크립트 직접 검사가 통과해도 호스트에서 각 lifecycle 이벤트가 호출됐다는 증거는 아니므로, 실제 자동 로드는 새 세션에서 별도로 확인한다.

## 공개 저장소 경계

실제 PRD 링크·ID와 원본 매핑은 `docs/private/PRD_SOURCES.md`, 과거 개인 작업 메모는 `PROJECT.md`에 로컬로 보관하며 Git에 올리지 않는다. 원시 보안 보고서와 Jev 실제 호출 기록도 로컬 보관한다. 새 체크아웃에서는 내부 원본 연결을 따로 준비한다. 공개 절차는 [공개 전 검사 가이드](guides/GUIDE_PUBLISH.md)를 따른다.
