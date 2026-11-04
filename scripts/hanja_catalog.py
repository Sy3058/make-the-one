#!/usr/bin/env python3
"""Prepare reviewable court Hanja data; never load or modify the application DB."""
import argparse
from collections import Counter, defaultdict
from datetime import datetime, timezone
import fcntl
import hashlib
import json
import math
import os
from pathlib import Path
import re
import socket
import tempfile
import time
import unicodedata
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import HTTPRedirectHandler, ProxyHandler, Request, build_opener

VERSION = "court-hanja-review-v1"
COMMIT = "12df1ba1b4dfaa095813e4ddfba424e816f94c53"
SOURCE_SHA = "e7b0d6878c425b30eb9c1e878adba820a4a48f03d4e60fef028473999598caaf"
UPSTREAM = "https://github.com/rutopio/Korean-Name-Hanja-Charset"
ENDPOINT = "https://efamily.scourt.go.kr/webhanja/whjsearch"
POLICY = "https://efamily.scourt.go.kr/sm/SmBottomCopyProtecPolic.do"
GUIDANCE = "https://efamily.scourt.go.kr/cs/CsBltnWrtList.do?bltnbordId=0000010"
MAX_BYTES = 8 * 1024 * 1024
MAX_FILE_BYTES = 64 * 1024 * 1024
PAGE_SIZE = 1000
CODE = re.compile(r"[02af][0-9a-f]{4}")
READING = re.compile(r"[가-힣]")
ROOT = Path(__file__).resolve().parents[1]


def now():
    return datetime.now(timezone.utc).isoformat()


def sha(data):
    return hashlib.sha256(data).hexdigest()


def encode(value):
    return (json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True) + "\n").encode()


def read_bytes(path):
    with Path(path).open("rb") as stream:
        data = stream.read(MAX_FILE_BYTES + 1)
    if len(data) > MAX_FILE_BYTES:
        raise ValueError("Input exceeds byte limit")
    return data


def atomic_write(path, data):
    """Replace only our own generated checkpoint, never follow its symlink."""
    path = Path(path)
    if path.is_symlink():
        raise ValueError("Symlink output is forbidden")
    fd, temporary = tempfile.mkstemp(dir=path.parent, prefix=".hanja-")
    try:
        with os.fdopen(fd, "wb") as stream:
            stream.write(data)
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


def integer(value, minimum, maximum):
    if isinstance(value, bool) or not isinstance(value, int) or not minimum <= value <= maximum:
        raise ValueError("Invalid integer response field")
    return value


def validate_rows(rows):
    if not isinstance(rows, list) or len(rows) > 30000:
        raise ValueError("Invalid Hanja row list")
    for row in rows:
        if not isinstance(row, dict) or not isinstance(row.get("cd"), str) or not CODE.fullmatch(row["cd"]):
            raise ValueError("Invalid court code")
        if row.get("type") not in {"0", "2", "A", "F"} or row["cd"][0].upper() != row["type"]:
            raise ValueError("Court code/type mismatch")
        for field in ("ineum", "in", "dic"):
            if not isinstance(row.get(field), str) or len(row[field]) > 4000:
                raise ValueError("Invalid text field")
        integer(row.get("isin"), 0, 1)
    return rows


def readings(text):
    result = [part.strip() for part in text.split(",") if part.strip()]
    if any(not READING.fullmatch(part) for part in result):
        raise ValueError("Invalid personal-name reading")
    return sorted(set(result))


def glosses(text, allowed):
    """Only link explicit (reading) markers. Unparsed text remains review material."""
    work = re.sub(r"[가-힣](?:\s*,\s*[가-힣])*\s*:", "", text)
    pattern = re.compile(r"([^():,;/]+?)\(([가-힣](?:\s*[,/]\s*[가-힣])*)\)")
    result = defaultdict(set)
    uncertain = False
    for match in pattern.finditer(work):
        meaning, sound = match.groups()
        meaning = meaning.strip()
        for reading in re.split(r"\s*[,/]\s*", sound):
            if reading not in allowed or not meaning:
                uncertain = True
            else:
                result[reading].add(meaning)
    remainder = pattern.sub("", work).strip(" ,;\t\r\n")
    if remainder:
        uncertain = True
    return {reading: sorted(values) for reading, values in sorted(result.items())}, uncertain


def normalize(rows, source_id):
    grouped = defaultdict(list)
    for position, row in enumerate(validate_rows(rows)):
        grouped[row["cd"]].append((position, row))
    entries = []
    for code, occurrences in sorted(grouped.items()):
        row = occurrences[0][1]
        reasons = []
        variants = {tuple(r[k] for k in ("type", "isin", "ineum", "in", "dic")) for _, r in occurrences}
        if len(variants) != 1:
            reasons.append("conflicting_source_rows")
        allowed = sorted({sound for _, r in occurrences for sound in readings(r["ineum"])})
        char = None
        if row["type"] in {"0", "2"}:
            candidate = chr(int(code, 16))
            if unicodedata.category(candidate) == "Lo" and unicodedata.name(candidate, "").startswith("CJK "):
                char = candidate
            else:
                reasons.append("unrecognized_standard_code")
        else:
            reasons.append("dedicated_or_private_code")
        if not allowed:
            reasons.append("missing_allowed_reading")
        if any(r["isin"] != 1 for _, r in occurrences):
            reasons.append("not_personal_name")
        parsed, ambiguous = glosses(row["in"], allowed)
        if ambiguous:
            reasons.append("unparsed_gloss")
        if not all(parsed.get(sound) for sound in allowed) or not allowed:
            reasons.append("missing_reading_gloss")
        entries.append({
            "court_code": code, "code_type": row["type"], "character": char,
            "allowed_readings": allowed, "gloss_candidates": parsed,
            "general_dictionary_raw": row["dic"],
            "evidence": [{"source": source_id, "row_index": index, "raw": raw} for index, raw in occurrences],
            "eligibility_status": "upstream_claimed", "review_status": "needs_review",
            "quarantine_reasons": sorted(set(reasons)), "recommendation_ready": False,
            "semantic_tags": [], "element_materials": [],
            "stroke_count": None, "stroke_policy": "not_used_for_semantic_elements",
        })
    return entries


def index_strokes(payload):
    if not isinstance(payload, list) or not 1 <= len(payload) <= 100:
        raise ValueError("Invalid stroke index")
    values = []
    for row in payload:
        value = row.get("totstroke") if isinstance(row, dict) else None
        if not isinstance(value, str) or not re.fullmatch(r"[1-9][0-9]?", value):
            raise ValueError("Invalid indexed stroke count")
        values.append(int(value))
    if len(values) != len(set(values)):
        raise ValueError("Duplicate stroke index")
    return sorted(values)


def index_query():
    return {"mode": "listTotstroke", "ext": "0", "ksnd": ""}


def page_query(stroke, page):
    return {"mode": "listUnicodeByTotstroke", "totstroke": str(stroke), "ksnd": "", "ext": "0",
            "pgmode": "1", "pgno": str(page), "pgsize": str(PAGE_SIZE)}


def validate_page(payload, stroke, page, expected_count=None):
    if not isinstance(payload, dict) or payload.get("errno") != 0 or payload.get("ext") is not False:
        raise ValueError("Court page error or incorrect filter")
    if payload.get("ksnd") != "" or payload.get("pgmode") is not True:
        raise ValueError("Court page has unexpected reading filter/pagination")
    count = integer(payload.get("resultcount"), 0, 30000)
    last = integer(payload.get("pglast"), 1, 100)
    if payload.get("totstroke") != stroke or payload.get("pgno") != page or payload.get("pgsize") != PAGE_SIZE:
        raise ValueError("Court page does not match request")
    if last != max(1, math.ceil(count / PAGE_SIZE)) or (expected_count is not None and count != expected_count):
        raise ValueError("Court pagination/count changed")
    rows = validate_rows(payload.get("resultlist"))
    if len(rows) != min(PAGE_SIZE, max(0, count - (page - 1) * PAGE_SIZE)):
        raise ValueError("Court page truncated")
    if any(row["isin"] != 1 or row.get("totstroke") != stroke for row in rows):
        raise ValueError("Non-name or incorrect stroke row")
    if len({row["cd"] for row in rows}) != len(rows):
        raise ValueError("Duplicate code within page")
    return rows, count, last


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise ValueError("Court endpoint redirect rejected")


class CourtClient:
    def __init__(self, cache, max_requests=150):
        self.cache = Path(cache)
        self.max_requests = max_requests
        self.request_count = 0
        self.last_request = 0
        self.opener = build_opener(ProxyHandler({}), NoRedirect())

    def get(self, query, refresh=False):
        key = sha(urlencode(sorted(query.items())).encode())
        path = self.cache / (key + ".json")
        if path.exists() and not refresh:
            return load_envelope(path, query)
        for attempt in range(3):
            if self.request_count >= self.max_requests:
                raise ValueError("Request limit reached; resume the same cache")
            time.sleep(max(0, 1 - (time.monotonic() - self.last_request)))
            self.request_count += 1
            self.last_request = time.monotonic()
            request = Request(ENDPOINT + "?" + urlencode(query), headers={
                "User-Agent": "MakeTheOne-HanjaDataReview/1.0", "Accept": "application/json"})
            try:
                with self.opener.open(request, timeout=15) as response:
                    if response.status != 200 or "json" not in response.headers.get("Content-Type", "").lower():
                        raise ValueError("Unexpected court HTTP response")
                    # Chunk reads also enforce a total body deadline, including slow responses.
                    deadline = time.monotonic() + 30
                    parts = []
                    size = 0
                    while True:
                        chunk = response.read1(65536)
                        if time.monotonic() > deadline:
                            raise TimeoutError("Court response body timeout")
                        if not chunk:
                            break
                        size += len(chunk)
                        if size > MAX_BYTES:
                            raise ValueError("Court response too large")
                        parts.append(chunk)
                    raw = b"".join(parts)
                payload = json.loads(raw)
                # Validate before caching a successful response.
                if query["mode"] == "listTotstroke":
                    index_strokes(payload)
                else:
                    validate_page(payload, int(query["totstroke"]), int(query["pgno"]))
                envelope = {"endpoint": ENDPOINT, "query": query, "fetched_at": now(),
                            "response_sha256": sha(raw), "response_text": raw.decode("utf-8")}
                atomic_write(path, encode(envelope))
                return payload, {"cache_file": path.name, "file_sha256": sha(read_bytes(path)),
                                 "response_sha256": sha(raw), "fetched_at": envelope["fetched_at"]}
            except HTTPError as error:
                status = error.code
                error.close()
                if status not in {429, 500, 502, 503, 504} or attempt == 2:
                    raise ValueError("Court HTTP request failed") from None
            except (URLError, TimeoutError, socket.timeout):
                if attempt == 2:
                    raise ValueError("Court network request failed; cache preserved") from None
            time.sleep(2 ** attempt)
        raise ValueError("Court request failed")


def load_envelope(path, query, expected_hash=None, data=None):
    if path.is_symlink():
        raise ValueError("Symlink evidence is forbidden")
    data = read_bytes(path) if data is None else data
    if expected_hash is not None and sha(data) != expected_hash:
        raise ValueError("Evidence file hash mismatch")
    envelope = json.loads(data)
    if envelope["endpoint"] != ENDPOINT or envelope["query"] != query:
        raise ValueError("Evidence query mismatch")
    raw = envelope["response_text"].encode("utf-8")
    if sha(raw) != envelope["response_sha256"]:
        raise ValueError("Evidence response hash mismatch")
    payload = json.loads(raw)
    if query["mode"] == "listTotstroke":
        index_strokes(payload)
    else:
        validate_page(payload, int(query["totstroke"]), int(query["pgno"]))
    return payload, {"cache_file": path.name, "file_sha256": sha(data),
                     "response_sha256": sha(raw), "fetched_at": envelope["fetched_at"]}


def collect(cache, max_requests):
    cache = Path(cache)
    cache.mkdir(parents=True, exist_ok=True)
    if cache.is_symlink():
        raise ValueError("Symlink cache is forbidden")
    with (cache / "collection.lock").open("a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        if (cache / "snapshot.json").exists():
            raise ValueError("Completed snapshot exists; use a new cache for a new collection")
        started = cache / "started.json"
        if not started.exists():
            atomic_write(started, encode({"version": VERSION, "started_at": now()}))
        start = json.loads(read_bytes(started))
        age = datetime.now(timezone.utc) - datetime.fromisoformat(start["started_at"])
        if start.get("version") != VERSION or not 0 <= age.total_seconds() <= 86400:
            raise ValueError("Cache older than 24 hours; use a new collection directory")
        client = CourtClient(cache, max_requests)
        index, reference = client.get(index_query())
        initial_sha = reference["response_sha256"]
        strokes = index_strokes(index)
        references = [{"query": index_query(), **reference}]
        for stroke in strokes:
            payload, reference = client.get(page_query(stroke, 1))
            rows, count, last = validate_page(payload, stroke, 1)
            references.append({"query": page_query(stroke, 1), **reference})
            codes = [r["cd"] for r in rows]
            for page in range(2, last + 1):
                payload, reference = client.get(page_query(stroke, page))
                page_rows, _, _ = validate_page(payload, stroke, page, count)
                codes.extend(r["cd"] for r in page_rows)
                references.append({"query": page_query(stroke, page), **reference})
            if len(codes) != count or len(set(codes)) != count:
                raise ValueError("Duplicate/missing codes across pages")
            print(f"stroke={stroke} rows={count} pages={last}", flush=True)
        # Keep the first index evidence intact; compare a fresh end index separately.
        end_cache = cache / "end-index"
        end_cache.mkdir(exist_ok=True)
        end_client = CourtClient(end_cache, max_requests - client.request_count)
        end_client.last_request = client.last_request
        end_index, end_reference = end_client.get(index_query(), refresh=True)
        if end_reference["response_sha256"] != initial_sha:
            raise ValueError("Court index changed during collection")
        end_reference["cache_file"] = "end-index/" + end_reference["cache_file"]
        atomic_write(cache / "snapshot.json", encode({
            "version": VERSION, "started_at": start["started_at"], "completed_at": now(),
            "scope": "official_personal_name_stroke_index", "index_traversal_complete": True,
            "legal_inventory_complete": False, "strokes": strokes, "requests": references,
            "end_index": end_reference, "network_requests_this_run": client.request_count + end_client.request_count,
        }))


def snapshot_rows(cache, files=None):
    cache = Path(cache)
    def read(name):
        return files[name] if files is not None else read_bytes(cache / name)
    manifest = json.loads(read("snapshot.json"))
    if manifest.get("version") != VERSION or manifest.get("index_traversal_complete") is not True:
        raise ValueError("Incomplete or incompatible official snapshot")
    requests = manifest["requests"]
    # Derive every required request from the first index, never trust a completeness flag.
    def load(reference, query, prefix=""):
        filename = prefix + sha(urlencode(sorted(query.items())).encode()) + ".json"
        if reference.get("cache_file") != filename or reference.get("query", query) != query:
            raise ValueError("Invalid snapshot evidence path/query")
        payload, actual = load_envelope(cache / filename, query, reference["file_sha256"], read(filename))
        if any(reference.get(k) != actual[k] for k in ("response_sha256", "fetched_at")):
            raise ValueError("Snapshot reference metadata mismatch")
        return payload
    if not isinstance(requests, list) or not requests:
        raise ValueError("Missing snapshot index")
    index = load(requests[0], index_query())
    strokes = index_strokes(index)
    if strokes != manifest.get("strokes"):
        raise ValueError("Snapshot stroke index mismatch")
    offset = 1
    result = []
    for stroke in strokes:
        if offset >= len(requests):
            raise ValueError("Missing stroke page")
        payload = load(requests[offset], page_query(stroke, 1))
        rows, count, last = validate_page(payload, stroke, 1)
        offset += 1
        combined = list(rows)
        for page in range(2, last + 1):
            if offset >= len(requests):
                raise ValueError("Missing following page")
            payload = load(requests[offset], page_query(stroke, page))
            rows, _, _ = validate_page(payload, stroke, page, count)
            combined.extend(rows)
            offset += 1
        if len({r["cd"] for r in combined}) != count:
            raise ValueError("Duplicate codes across pages")
        result.extend(combined)
    if offset != len(requests):
        raise ValueError("Unexpected snapshot requests")
    end = load(manifest["end_index"], index_query(), "end-index/")
    if encode(index) != encode(end):
        raise ValueError("End index mismatch")
    return result, manifest


def reconcile(upstream, official):
    old = {e["court_code"]: e for e in upstream}
    current = {e["court_code"]: e for e in official}
    changes = []
    combined = []
    for code in sorted(old.keys() | current.keys()):
        entry = current.get(code, old.get(code)).copy()
        if code in current:
            entry["eligibility_status"] = "official_listed"
            if code in old:
                entry["evidence"] = old[code]["evidence"] + current[code]["evidence"]
                changed = [k for k in ("allowed_readings", "gloss_candidates", "general_dictionary_raw")
                           if old[code][k] != current[code][k]]
                if changed:
                    changes.append({"court_code": code, "kind": "changed", "fields": changed})
            else:
                changes.append({"court_code": code, "kind": "newly_observed"})
        else:
            entry["eligibility_status"] = "not_seen_in_stroke_index"
            entry["quarantine_reasons"] = sorted(set(entry["quarantine_reasons"] + ["not_seen_in_stroke_index"]))
            changes.append({"court_code": code, "kind": "not_seen_in_stroke_index"})
        combined.append(entry)
    return combined, changes


def summary(entries):
    return {"entries": len(entries), "standard_characters": sum(e["character"] is not None for e in entries),
            "code_types": dict(Counter(e["code_type"] for e in entries)),
            "eligibility": dict(Counter(e["eligibility_status"] for e in entries)),
            "quarantine_reasons": dict(Counter(reason for e in entries for reason in e["quarantine_reasons"])),
            "structurally_clear_needs_semantic_review": sum(not e["quarantine_reasons"] for e in entries),
            "recommendation_ready": sum(e["recommendation_ready"] for e in entries)}


def build(source, output, cache=None):
    raw = read_bytes(source)
    if sha(raw) != SOURCE_SHA:
        raise ValueError("Upstream source differs from reviewed pinned hash")
    original = json.loads(raw)
    upstream = normalize(original, "rutopio:" + COMMIT)
    official_manifest = None
    changes = []
    entries = upstream
    if cache is not None:
        if Path(cache).is_file():
            if __package__:
                from .hanja_inventory import load_sources
            else:
                from hanja_inventory import load_sources
            official_rows, _, bundle = load_sources(cache)
            official_manifest = bundle["court_snapshot"]
            snapshot_hash = bundle["sources"]["court"]["snapshot_sha256"]
        else:
            official_rows, official_manifest = snapshot_rows(cache)
            snapshot_hash = sha(read_bytes(Path(cache) / "snapshot.json"))
        current = normalize(official_rows, "court:" + snapshot_hash)
        entries, changes = reconcile(upstream, current)
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    # A crash leaves an incomplete directory, never a falsely complete manifest.
    atomic_write(output / "upstream.json", raw)
    license_bytes = read_bytes(ROOT / "tools/hanja-catalog/LICENSES.md")
    atomic_write(output / "LICENSES.md", license_bytes)
    catalog = {"version": VERSION, "catalog_ready": False, "entries": entries}
    atomic_write(output / "review.json", encode(catalog))
    report = {"version": VERSION, "summary": summary(entries), "changes": changes,
              "upstream_summary": summary(upstream), "official_index": official_manifest,
              "limits": ["stroke-index traversal is not proof of legal inventory completeness",
                         "glosses, semantic tags, name naturalness and dedicated codes need review"]}
    atomic_write(output / "report.json", encode(report))
    atomic_write(output / "manifest.json", encode({
        "version": VERSION, "created_at": now(), "complete": True, "catalog_ready": False,
        "upstream_url": UPSTREAM, "upstream_commit": COMMIT, "upstream_sha256": SOURCE_SHA,
        "court_guidance": GUIDANCE, "court_reuse_policy": POLICY,
        "attribution": "대한민국 법원 전자가족관계등록시스템 인명용 한자 조회; rutopio/ChingRu",
        "license": "upstream MIT notice plus court source attribution policy; third-party rights excluded",
        "files": {name: sha(read_bytes(output / name)) for name in
                  ("upstream.json", "review.json", "report.json", "LICENSES.md")},
    }))
    print(json.dumps(report["summary"], ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    collector = commands.add_parser("collect", help="Opt-in official stroke index collection")
    collector.add_argument("--cache", type=Path, required=True)
    collector.add_argument("--allow-network", action="store_true")
    collector.add_argument("--max-requests", type=int, default=150)
    builder = commands.add_parser("build", help="Offline pinned JSON normalization and reconciliation")
    builder.add_argument("--source", type=Path, required=True)
    builder.add_argument("--output", type=Path, required=True)
    builder.add_argument("--official-cache", type=Path)
    args = parser.parse_args()
    try:
        if args.command == "collect":
            if not args.allow_network or not 1 <= args.max_requests <= 300:
                raise ValueError("Explicit network opt-in and request budget 1..300 required")
            collect(args.cache, args.max_requests)
        else:
            build(args.source, args.output, args.official_cache)
    except (ValueError, OSError, KeyError, TypeError) as error:
        # Do not print payloads or generic transport exception strings.
        parser.exit(1, f"Hanja data preparation failed ({type(error).__name__}): "
                    + (str(error) if isinstance(error, ValueError) else "check input/cache paths and schema") + "\n")


if __name__ == "__main__":
    main()
