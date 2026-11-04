# 한자 수집·검증 도구

현재 파일 구조·검색·검증 명령은 [데이터 안내](../../data/hanja/README.md)를 따른다. Python 표준 라이브러리만 사용하며 앱·DB에 연결하지 않는다.

- `hanja_inventory.py`: 원문 근거 검증, 중복 제거·검색 색인 재생성, 글자/독음/뜻/의미 개념/소재/미해결 검색.
- `hanja_catalog.py`: 공식 전체 획수 색인의 제한된 수집과 고정 rutopio 원본 대조. 외부 저장소 코드는 실행하지 않는다.
- `hanja_semantics.py`: 전체 뜻·독음의 사전 대조와 개별 판정·통제 동의어·의미 개념/소재 규칙과 270자 기준 재검토의 근거/누락 검증, 기존 344자 선택 근거 검증.

별도 원문 분할기와 OCR 도구는 제거했다. [고정 rutopio 출처](source.json)와 MIT/법원 출처 고지, Unicode/libhangul/Wiktionary 고지는 유지한다. 과거 실행 결과는 [조사 기록](../../docs/research/hanja-rutopio-audit.md)에 있다.

## 기존 편집 검수 재현

로컬 원본 `data/sources/hanja-rutopio.json`, `data/sources/Unihan17.zip`은 기존 고정 해시 검증에 필요해 한 벌씩 보존하며 Git 제외다. 원본의 URL·SHA-256은 source.json과 [검수 JSON](../../data/hanja-semantic-review.json)에 있다. 전체 원문에는 Unihan 18도 있으나 과거 선택 검수는 Unihan 17을 유지한다. © 2025/2026 Unicode®, Inc., [Unicode License v3](LICENSES.md#unicode).

삭제한 과거 출력을 확인할 때만 실행한다. 기존 출력 디렉터리는 거부한다.

```bash
python3 -B scripts/hanja_catalog.py build \
  --source data/sources/hanja-rutopio.json \
  --official-cache data/hanja/sources.json \
  --output data/generated/hanja-legacy-review

python3 -B -m scripts.hanja_semantics \
  --review data/hanja-semantic-review.json \
  --catalog data/generated/hanja-legacy-review/review.json \
  --official-cache data/hanja/sources.json \
  --unihan data/sources/Unihan17.zip \
  --output data/generated/hanja-semantic-review
```

통합 원문에서도 과거 대조 목록을 바이트 단위로 재현하고 344자 검증 결과가 유지되는 것을 확인했다.

## 공식 자료 재수집

필요할 때만 별도 cache를 지정한다. 보존된 원문 묶음을 덮어쓰지 않는다.

```bash
python3 -B scripts/hanja_catalog.py collect --allow-network \
  --cache data/generated/hanja-court-next --max-requests 150
```

`ext=0`·빈 독음 필터로 전체 획수 색인과 모든 페이지를 순회한다. 건수/필터/구간/중복/인명용 여부/종료 색인·원문 해시를 검증한다. 요청 간격 1초, 고정 HTTPS·리다이렉트/환경 프록시 거부, 연결 timeout 15초·본문 제한 30초, 응답 8MB, 최대 2회 재시도, 전체 요청 예산·24시간 재개·파일 잠금·마지막 완료 manifest를 적용한다. 실패를 완료로 표시하지 않는다. 단일 시점 트랜잭션·법적 별표 전체 대응을 보장하지 않는다. 새 수집 자료는 기존 근거와 대조하고 출처/해시를 갱신한 후 통합 원문에 반영한다.

현재 검색 출력은 v4다. 출처 대조 `source_audit`와 의미 해소 `concept_audit`를 분리한다. 개별 판정 및 개념 승인만 새 소재 규칙으로 연결하며, 기존 344자 출력의 소재는 과거 기준 기록이다. 현재 결과 검증에는 `hanja_inventory.py --check`를 사용한다. 재수집·생성은 명시적인 도구 실행이며 서비스 요청마다 외부 사전이나 모델을 호출하지 않는다.
