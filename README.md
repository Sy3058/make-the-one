# Make The One 계산·검색 구현 초안

이 폴더는 Master PRD v0.3의 한국 가상 원국 정책을 실행 가능한 코드로 옮긴 초안이다. 계산·검색 코드는 공개되어 있으며, 모델 계정과 이름 자료, PostgreSQL 적재는 별도로 준비해야 한다.

## 순서

1. `db/001_init.sql`: PostgreSQL 16에서 정책, 절기, 도시, 네 기둥, 발생, 서사 근거, 이름, 빌드 이력을 분리한다. 같은 정책과 네 기둥은 하나의 `chart_id`로 중복 제거한다.
2. `tests/calendar.test.ts`: KASI 2024 입춘, 성남 경도, 23시, 속초·목포, 1988 서머타임, 2000 무오 기준을 검사한다.
3. `scripts/build-index.ts`: 절입과 평균태양시 두 시간 구간을 나누어 원국·발생·서사 근거 JSONL을 gzip으로 만든다. `manifest.json`에 건수와 체크섬이 남는다.
4. `scripts/load-index.ts`: PostgreSQL에 정책→도시·절기→원국→발생→근거를 적재한다.
5. `app/api/generate/route.ts`: Meta Model API로 원문에서 소재를 추출하고, DB의 검증된 원국·이름만 추천한다.

## 실행

```bash
npm ci
npm test
npm run build:index -- 2024 2024 seoul,seongnam,sokcho,mokpo data/generated/pilot
psql "$DATABASE_URL" -f db/001_init.sql
DATABASE_URL=... npm run load:index -- data/generated/pilot
```

`npm run build:index -- 1980 2039 all data/generated/full`은 전체 20개 도시를 대상으로 한다. 대규모 적재를 시작하기 전에 파일 용량·DB 비용과 모든 좌표의 동일 출처 기준을 확인한다. 실시간 API는 `MODEL_API_KEY`와 검수된 이름 자료가 없으면 503을 반환한다. 이름 목록이 없는데 임의 뜻/한자를 생성해 통과시키지 않는다.

## 테스트 범위

`npm test`는 절기·시간 보정 경계와 추천 규칙을 검사하고, `npm run typecheck`와 `npm run build`는 형식 및 Next.js 빌드를 확인한다. GitHub Actions에서도 커밋과 PR마다 같은 검사를 실행한다. 현재 화면은 없으며 실제 추천을 요청하려면 PostgreSQL에 색인과 이름 데이터를 적재하고 Meta 모델 API 키를 설정해야 한다.

계산 정책: 평균태양시 = UTC + 경도×4분, 연·월은 UTC 절기 순간, 일은 태양시 23시, 시간은 2시간 단위. 절입은 astronomy-engine 2.1.19, 역사적 법정시는 moment-timezone 0.6.5의 전체 시간대 자료를 사용한다. `data/ruleset.json`은 명리 해석 규칙표 v1의 48개 매핑을 옮긴 것이며 일부 12운성 규칙은 검색에서 제외되어 있다. 숫자 점수는 서사 추천용 편집 규칙이다.

출처: [KASI 월력요항](https://astro.kasi.re.kr/kor/life/post/calendarData), [GeoNames](https://www.geonames.org/about.html), [Meta Model API](https://dev.meta.ai/docs/overview), [명리 해석 규칙표 v1](https://docs.google.com/spreadsheets/d/1BA9Po0CIEQOEjw-CDZXhAqgFCmLH79YIm1vCbLwWDKU/edit).
