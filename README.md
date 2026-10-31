# Make The One 계산·검색 구현 초안

이 폴더는 Master PRD v0.3의 한국 가상 원국 정책을 실행 가능한 코드로 옮긴 초안이다. 계산·검색 코드와 출처를 확인한 이름 자료를 포함한다. 로컬 Meta 호출, PostgreSQL 16 연결 및 작은 색인 적재를 검증했다. 제품 화면과 전체 색인은 구현·검증 대기다.

## 브랜치 운영

`main`은 배포 가능한 코드, `develop`은 개발 통합, `feature/<작업명>`은 기능·수정·문서 작업을 담당한다. 최초 `develop`은 최신 `main`에서 만들고, 이후 작업은 최신 `develop`에서 분기하여 `feature/*` → PR → `develop` → 배포 PR → `main` 순서로 합친다. 프론트엔드·백엔드 상시 브랜치는 두지 않는다. 검사와 승인 등 상세 절차는 [Git 작업 가이드](docs/guides/GUIDE_GIT.md)을 따른다.

공개 전 `python3 scripts/check_publish.py`로 stage된 파일 전체를 검사한다. CI는 커밋 트리를 검사한다. 내부 PRD 연결은 로컬로 준비한다. 상세 경계와 한계는 [공개 전 검사 가이드](docs/guides/GUIDE_PUBLISH.md)를 따른다.

## 스택 대조 (2026-11-01)

제품 기술 결정은 Master PRD 6A·6B를 따른다. 아래는 현재 저장소와의 대조 결과이며 별도 요구사항 문서가 아니다.

| 항목 | 현재 정의·구현 | 대조 결과 |
| --- | --- | --- |
| 앱·API | Next.js 16.4.3, React 19.2.0, TypeScript 5.9.3; `app/api/generate/route.ts` | 단일 Node/Route Handler 구조 일치. `/me`·`/character` 화면은 없음 |
| 입출력 검증 | Zod 4.6.7 | 입력·모티프 검증 코드 있음. API 최종 응답 스키마 검증은 별도 확인 필요 |
| 검색 DB | `pg` 8.16.3, `db/001_init.sql` | 로컬 PostgreSQL 16.15 연결·초기화·작은 색인 적재 확인 |
| 절입 계산 | astronomy-engine 2.1.19 | 지정 버전·SearchSunLongitude 사용 일치 |
| 역사 시간대 | moment-timezone 0.6.5, moment 2.31.0 | 지정 버전 및 설치 IANA 2026e 확인 |
| 독립 계산 대조 | lunar-javascript 1.7.7 | 개발 의존성 고정, 비경계 360개 표본의 네 기둥 일치 |
| 제품 모델 | 서버의 muse-spark-1.3, `META_ALLOW_12=1`일 때 1.2 대체 경로 | Standard 모델 ID 일치. 1.3 실제 구조화 추출 성공. 쿼터 잔액·1.2 대체 모델은 미확인 |
| 실행·검사 | `.nvmrc`·engines·CI에서 Node 24.22.2 고정; npm lockfile; typecheck·test·build | 직접 의존성 버전과 lockfile 일치. CI 정의 존재와 실제 실행 성공은 구분 |
| 카드·분석·배포 | 구현·배포 설정 없음 | PNG·X 공유 UI·분석 및 호스팅 검증 대기 |

Meta 공식 문서는 위 Standard 모델 ID와 [Chat Completions 호출 형식](https://dev.meta.ai/docs/protocols/chat-completions)을 제공한다. 프로젝트 계정의 사용 권한은 문서 확인만으로 검증되지 않는다. Node 24.22.2는 [Next.js 공식 최소 Node 20.9 조건](https://nextjs.org/docs/app/getting-started/installation)을 충족한다. Python 파일은 개발 보조 도구이며 별도 Python 제품 API를 도입한 상태가 아니다.

moment-timezone의 [현재 공식 배포](https://momentjs.com/timezone/)는 0.6.6/2026f지만 이 프로젝트 계약은 0.6.5/2026e를 고정한다. 최신판 존재만으로 의존성을 바꾸지 않으며, 변경하려면 계산 재현성·회귀 검증과 PRD 변경 절차를 따른다.

남은 구현·실행 확인은 전체 60년 색인, 전체 도시 좌표 출처 재확인, 20개 서사 사람 검토, 대체 모델 시험, 호출 빈도·지출 상한, 실제 사용 모델의 응답 버전 기록, 두 화면과 카드·공유·분석 흐름이다. 현재 API는 응답 모델 버전을 1.3으로 고정하므로 1.2 대체가 실행될 경우 실제 모델과 다르게 표시한다.

### 개발 환경·데이터 검증 (2026-11-01)

- Node 24.22.2 공식 체크섬 확인, typecheck·단위 테스트 18개·프로덕션 빌드 통과. 앱 lockfile 111개 패키지 OSV 조회에서 보고된 취약점 0건. 전체 보안 감사나 향후 안전성 보증은 아니다.
- Meta 1.3 Standard에 합성 서사를 보내 구조화 추출과 근거 검증 성공. 원문 개인 서사를 사용하지 않았다. 키·DB 접속 정보는 Git 제외 로컬 환경 파일에만 둔다.
- KASI 공식 1920-2100 배포 자료 중 1980-2039의 1,440개 절기를 대조했다. 양쪽을 분 단위로 반올림한 차이의 최댓값은 1분, 원시 오차 최댓값은 71.829초다. 1분 초과 시 색인 생성을 중단한다. 실제 절기 경계는 반올림하지 않는다.
- 2024년 서울·성남·속초·목포 작은 색인: 원국 4,406개, 발생 17,620개, 모티프 근거 162,575개. PostgreSQL 16.15에 이름 84개와 함께 적재했다. 반복 적재, 파일 변조 거부, 실패 시 트랜잭션 롤백을 실제 DB에서 검증했다.
- 진지한 이름 72개와 별도 창작 별명 12개를 준비했다. 한자·독음·기초 뜻의 출처와 프로젝트의 창작적 조합 뜻을 구분한다. 자연스러움 점수는 초기 편집 평가이며 사람 패널의 검수 완료를 의미하지 않는다. [데이터 출처와 검증 범위](data/README.md)를 따른다.
- 생성 파일의 해시와 적재 검증은 계산 정책의 출시 승인을 의미하지 않는다. 정책 상태는 `draft`다. 브라우저 실기능·전체 추천 흐름·배포는 아직 확인하지 않았다.
- Next.js `agentRules: false`로 AGENTS.md 자동 확장을 막는다. sandbox에서 파일 단위 통과만 표시하는 테스트 결과는 유효한 근거로 쓰지 않고 승인된 환경에서 실제 테스트 수를 확인했다.

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

Meta·DB 연결에는 `.env.example`을 참고해 `.env`에 서버 환경 변수를 준비한다. `POSTGRES_PASSWORD`는 충분히 긴 무작위 값을 사용하고 `DATABASE_URL`에도 동일한 비밀번호를 URL 인코딩해 넣는다. 예시 값을 실제 자격증명으로 사용하지 않는다. 아래 DB 명령은 `.env`, 이어서 `.env.local`을 읽으며 이미 설정된 셸 환경 변수가 우선한다.

```bash
docker compose up -d
npm run db:init
npm run check:services -- --db
# 합성 서사로 실제 Meta 호출 (API 사용량 발생)
npm run check:services -- --meta
npm run build:index -- 2024 2024 seoul,seongnam,sokcho,mokpo data/generated/pilot-2024
npm run load:names
npm run load:index -- data/generated/pilot-2024
npm run test:db
```

DB는 `127.0.0.1:5432`로만 공개하며 named volume에 보관한다. 초기화 명령은 기존 완성 스키마를 보존하고 일부 테이블만 있는 경우 중단한다. 색인 생성은 비어 있지 않은 출력 폴더를 덮어쓰지 않는다. `test:db`는 로컬 개발 DB를 대상으로 하며 이름과 색인을 먼저 적재한다. 기존에 다른 색인을 적재한 DB 대신 별도 개발 DB를 쓰고, `INDEX_DIR`로 검사할 색인 폴더를 지정할 수 있다.

`npm run build:index -- 1980 2039 all data/generated/full`은 전체 20개 도시를 대상으로 한다. 대규모 적재 전에 용량·DB 비용과 모든 좌표의 출처를 확인한다. 현재 GeoNames 덤프와 대전의 기존 좌표가 일치하지 않아 전체 생성은 보류한다. 임의로 좌표를 바꾸지 않았다. 실시간 API는 `MODEL_API_KEY`와 검수된 이름 자료가 없으면 503을 반환한다.

## 테스트 범위

`npm test`는 절기·시간 보정 경계와 추천 규칙을 검사하고, `npm run typecheck`와 `npm run build`는 형식 및 Next.js 빌드를 확인한다. GitHub Actions에서도 커밋과 PR마다 같은 검사를 실행한다. 실제 DB 적재 회귀 검사는 `npm run test:db`로 분리하며 CI의 PostgreSQL 16 서비스에서도 실행한다. 현재 화면은 없다.

계산 정책: 평균태양시 = UTC + 경도×4분, 연·월은 UTC 절기 순간, 일은 태양시 23시, 시간은 2시간 단위. 절입은 astronomy-engine 2.1.19, 역사적 법정시는 moment-timezone 0.6.5의 전체 시간대 자료를 사용한다. `data/ruleset.json`은 명리 해석 규칙표 v1의 48개 매핑을 옮긴 것이며 일부 12운성 규칙은 검색에서 제외되어 있다. 숫자 점수는 서사 추천용 편집 규칙이다.

출처: [KASI 월력요항](https://astro.kasi.re.kr/kor/life/post/calendarData), [GeoNames](https://www.geonames.org/about.html), [Meta Model API](https://dev.meta.ai/docs/overview), 명리 해석 규칙표 v1 (`urn:make-the-one:ruleset:mt1-v1`).
