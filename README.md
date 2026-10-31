# Make The One 계산·검색 구현 초안

이 폴더는 Master PRD v0.3의 한국 가상 원국 정책을 실행 가능한 코드로 옮긴 초안이다. 계산·검색 코드는 공개되어 있으며, 모델 계정과 이름 자료, PostgreSQL 적재는 별도로 준비해야 한다.

## 브랜치 운영

`main`은 배포 가능한 코드, `develop`은 개발 통합, `feature/<작업명>`은 기능·수정·문서 작업을 담당한다. 최초 `develop`은 최신 `main`에서 만들고, 이후 작업은 최신 `develop`에서 분기하여 `feature/*` → PR → `develop` → 배포 PR → `main` 순서로 합친다. 프론트엔드·백엔드 상시 브랜치는 두지 않는다. 검사와 승인 등 상세 절차는 [Git 작업 가이드](docs/guides/GUIDE_GIT.md)을 따른다.

공개 전 `python3 scripts/check_publish.py`로 stage된 파일 전체를 검사한다. CI는 커밋 트리를 검사한다. 내부 PRD 연결은 로컬로 준비한다. 상세 경계와 한계는 [공개 전 검사 가이드](docs/guides/GUIDE_PUBLISH.md)를 따른다.

## 스택 대조 (2026-10-31)

제품 기술 결정은 Master PRD 6A·6B를 따른다. 아래는 현재 저장소와의 대조 결과이며 별도 요구사항 문서가 아니다.

| 항목 | 현재 정의·구현 | 대조 결과 |
| --- | --- | --- |
| 앱·API | Next.js 16.4.3, React 19.2.0, TypeScript 5.9.3; `app/api/generate/route.ts` | 단일 Node/Route Handler 구조 일치. `/me`·`/character` 화면은 없음 |
| 입출력 검증 | Zod 4.6.7 | 입력·모티프 검증 코드 있음. API 최종 응답 스키마 검증은 별도 확인 필요 |
| 검색 DB | `pg` 8.16.3, `db/001_init.sql` | PostgreSQL 16 대상 스키마 있음. 실행 서버 버전·적재 상태 미확인 |
| 절입 계산 | astronomy-engine 2.1.19 | 지정 버전·SearchSunLongitude 사용 일치 |
| 역사 시간대 | moment-timezone 0.6.5, moment 2.31.0 | 지정 버전 일치. 테스트는 IANA 2026e를 요구하며 설치 자료의 실제 버전은 실행 검증 필요 |
| 독립 계산 대조 | lunar-javascript 1.7.7 | PRD에서 비경계 대조용으로 지정했으나 의존성·대조 테스트 없음 |
| 제품 모델 | 서버의 muse-spark-1.3, `META_ALLOW_12=1`일 때 1.2 대체 경로 | Standard 모델 ID 일치. 계정 권한·쿼터 및 동일 시험 통과는 미확인 |
| 실행·검사 | `.nvmrc`·engines·CI에서 Node 24.22.2 고정; npm lockfile; typecheck·test·build | 직접 의존성 버전과 lockfile 일치. CI 정의 존재와 실제 실행 성공은 구분 |
| 카드·분석·배포 | 구현·배포 설정 없음 | PNG·X 공유 UI·분석 및 호스팅 검증 대기 |

Meta 공식 문서는 위 Standard 모델 ID와 [Chat Completions 호출 형식](https://dev.meta.ai/docs/protocols/chat-completions)을 제공한다. 프로젝트 계정의 사용 권한은 문서 확인만으로 검증되지 않는다. Node 24.22.2는 [Next.js 공식 최소 Node 20.9 조건](https://nextjs.org/docs/app/getting-started/installation)을 충족한다. Python 파일은 개발 보조 도구이며 별도 Python 제품 API를 도입한 상태가 아니다.

moment-timezone의 [현재 공식 배포](https://momentjs.com/timezone/)는 0.6.6/2026f지만 이 프로젝트 계약은 0.6.5/2026e를 고정한다. 최신판 존재만으로 의존성을 바꾸지 않으며, 변경하려면 계산 재현성·회귀 검증과 PRD 변경 절차를 따른다.

남은 구현·실행 확인은 이름 자료 72+12 검수, KASI 다년도 절입 대조와 1분 초과 반복 불일치 시 빌드 중단, Meta 권한·대체 모델 시험, 호출 빈도·지출 상한, 실제 사용 모델의 응답 버전 기록, 전체 색인/DB 적재, 두 화면과 카드·공유·분석 흐름이다. 현재 API는 응답 모델 버전을 1.3으로 고정하므로 1.2 대체가 실행될 경우 실제 모델과 다르게 표시한다.

2026-10-31 스택 대조는 코드·manifest·lockfile 기준이었으며 런타임 검증은 포함하지 않았다. 이후 개발 환경 검증 결과는 아래에 기록한다.

### 개발 환경 검증 (2026-11-01)

- nvm으로 Node 24.22.2 설치 및 공식 SHA-256 체크섬 일치 확인. `.nvmrc`·engines·CI의 버전을 통일했다.
- `npm ci`, `npm run typecheck`, 실제 단위 테스트 9개, 프로덕션 빌드 통과. 설치된 시간대 자료는 2026e다.
- OSV-Scanner로 앱 lockfile의 110개 패키지를 조회했고 보고된 취약점은 0건이다. 이는 조회 시점·해당 lockfile 범위의 결과이며 앱 전체 보안 감사가 아니다.
- 로컬 개발 서버 기동과 `POST /api/generate`에 `{}` 입력 시 400 응답 확인. 검증 서버는 종료했다. 브라우저 실기능 확인은 수행하지 않았다.
- 이 에이전트 sandbox에서는 자식 프로세스·소켓 실행이 EPERM으로 제한된다. sandbox 안의 테스트는 파일 단위 통과만 표시하여 유효한 통과 근거로 쓰지 않았고, 승인된 환경에서 실제 테스트 9개와 빌드를 확인했다.
- `next.config.mjs`의 `agentRules: false`로 개발 서버가 AGENTS.md에 긴 지침을 자동 추가하지 않게 했다. Next.js 구현 전 읽을 관련 문서는 제품 구현 가이드에서 안내한다.
- 코드 개발은 시작할 수 있다. 현재 셸에 Meta·DB 환경 변수와 `.env`·`.env.local`이 없고 PostgreSQL 접속 도구도 확인되지 않아, DB 적재·Meta 호출·실제 추천 결과와 배포는 미검증이다. 화면·공유 기능 역시 구현 대상이다.

## 순서

1. `db/001_init.sql`: PostgreSQL 16에서 정책, 절기, 도시, 네 기둥, 발생, 서사 근거, 이름, 빌드 이력을 분리한다. 같은 정책과 네 기둥은 하나의 `chart_id`로 중복 제거한다.
2. `tests/calendar.test.ts`: KASI 2024 입춘, 성남 경도, 23시, 속초·목포, 1988 서머타임, 2000 무오 기준을 검사한다.
3. `scripts/build-index.ts`: 절입과 평균태양시 두 시간 구간을 나누어 원국·발생·서사 근거 JSONL을 gzip으로 만든다. `manifest.json`에 건수와 체크섬이 남는다.
4. `scripts/load-index.ts`: PostgreSQL에 정책→도시·절기→원국→발생→근거를 적재한다.
5. `app/api/generate/route.ts`: Meta Model API로 원문에서 소재를 추출하고, DB의 검증된 원국·이름만 추천한다.

## 실행

```bash
nvm install
nvm use
npm ci
npm run typecheck
npm test
npm run build
```

Node는 [공식 24.22.2 LTS](https://nodejs.org/en/blog/release/v24.22.2)를 사용한다. `.nvmrc`는 버전 선택 파일이며 새 셸에서 자동 전환을 보장하지 않으므로 `nvm use` 후 `node --version`을 확인한다. 전역 nvm 기본 별칭은 변경하지 않는다. CI도 `.nvmrc`를 읽는다. Node 변경 시 `.nvmrc`, package.json의 engines, lockfile의 루트 engines 및 검증 기록을 함께 갱신한다.

Meta·DB를 연결한 기능 실행에는 `.env.example`을 참고하여 서버 환경 변수를 별도로 준비한다. 예시 값을 실제 자격증명으로 사용하지 않는다. Next.js 로컬 환경 파일의 자동 로딩과 별개로 색인 적재 스크립트에는 `DATABASE_URL`을 셸 환경으로 전달해야 한다.

```bash
npm run build:index -- 2024 2024 seoul,seongnam,sokcho,mokpo data/generated/pilot
psql "$DATABASE_URL" -f db/001_init.sql
DATABASE_URL=... npm run load:index -- data/generated/pilot
```

`npm run build:index -- 1980 2039 all data/generated/full`은 전체 20개 도시를 대상으로 한다. 대규모 적재를 시작하기 전에 파일 용량·DB 비용과 모든 좌표의 동일 출처 기준을 확인한다. 실시간 API는 `MODEL_API_KEY`와 검수된 이름 자료가 없으면 503을 반환한다. 이름 목록이 없는데 임의 뜻/한자를 생성해 통과시키지 않는다.

## 테스트 범위

`npm test`는 절기·시간 보정 경계와 추천 규칙을 검사하고, `npm run typecheck`와 `npm run build`는 형식 및 Next.js 빌드를 확인한다. GitHub Actions에서도 커밋과 PR마다 같은 검사를 실행한다. 현재 화면은 없으며 실제 추천을 요청하려면 PostgreSQL에 색인과 이름 데이터를 적재하고 Meta 모델 API 키를 설정해야 한다.

계산 정책: 평균태양시 = UTC + 경도×4분, 연·월은 UTC 절기 순간, 일은 태양시 23시, 시간은 2시간 단위. 절입은 astronomy-engine 2.1.19, 역사적 법정시는 moment-timezone 0.6.5의 전체 시간대 자료를 사용한다. `data/ruleset.json`은 명리 해석 규칙표 v1의 48개 매핑을 옮긴 것이며 일부 12운성 규칙은 검색에서 제외되어 있다. 숫자 점수는 서사 추천용 편집 규칙이다.

출처: [KASI 월력요항](https://astro.kasi.re.kr/kor/life/post/calendarData), [GeoNames](https://www.geonames.org/about.html), [Meta Model API](https://dev.meta.ai/docs/overview), 명리 해석 규칙표 v1 (`urn:make-the-one:ruleset:mt1-v1`).
