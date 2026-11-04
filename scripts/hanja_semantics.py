#!/usr/bin/env python3
"""Validate editorial senses against archived court/Unihan evidence and export review coverage."""
import argparse
from collections import Counter
import io
import json
from pathlib import Path
import re
import zipfile

if __package__:
    from . import hanja_catalog as catalog
else:
    import hanja_catalog as catalog

VERSION = "ko-hanja-semantics-v1"
UNIHAN_SHA = "f7a48b2b545acfaa77b2d607ae28747404ce02baefee16396c5d2d7a8ef34b5e"
MATERIALS = {
    "wood": {"tree", "timber", "plant_part", "flower", "herb", "vegetation", "seedling", "bamboo", "fruit", "grain", "cultivation"},
    "fire": {"flame", "light", "sunlight", "heat", "torch", "lamp"},
    "earth": {"soil", "land", "mountain", "rock", "terrain", "sand", "sandbar"},
    "metal": {"metal", "metal_instrument", "ore", "worked_metal", "blade"},
    "water": {"water", "river", "sea", "lake", "pond", "spring", "stream", "flowing_water", "moisture", "tide", "washing",
              "waterside", "floating", "wetland", "deep_water", "tears", "swimming", "standing_water", "wave", "rain", "snow",
              "dew", "fog", "frost", "ice", "vapor", "immersion", "flood", "ferry_crossing"},
}

# These are evidence audit outcomes, not a claim of human or name-quality review.
SENSE_RULES = {
    "source_agreement": ["source_checked", "법원과 보조 사전의 같은 독음·뜻이 일치"],
    "editorial": ["source_checked", "근거를 재검증한 선택 뜻·독음 검수"],
    "adjudicated": ["source_checked", "출처 차이를 개별 판정하고 근거·이유를 기록"],
    "editorial_hold": ["held", "출처를 개별 비교했으나 의미 차이가 해소되지 않음"],
    "private_code": ["held", "표준 문자 대응 미확인"],
    "character_only": ["held", "글자 단위 정의로 한국어 독음에 연결되지 않음"],
    "dictionary_marker": ["held", "보조 사전 조각에 명시적인 뜻·독음 표지가 없음"],
    "not_allowed": ["held", "법원 허용 독음이 아님"],
    "unclear_gloss": ["held", "주석·관계·형식 잔여를 뜻으로 확정할 수 없음"],
    "single_source": ["held", "같은 독음·뜻의 보조 근거나 개별 판정이 부족"],
    "source_difference": ["held", "같은 독음의 사전 뜻이 다르며 동의어/오류 여부 미확정"],
}


def sense_key(text):
    return re.sub(r"\s+", "", text)


def dictionary_senses(entry):
    """An IME key is not a pronunciation proof: use the printed final marker.

    For example 윤:淪:빠질 륜 supports 륜, not an invented 윤 binding.
    Unparsed fragments remain character-scoped held evidence, never reading-bound.
    """
    senses = []
    for row in entry["libhangul"]:
        for part in row["text"].split(","):
            match = re.fullmatch(r"\s*(.*?)\s+([가-힣])\s*", part)
            if match and match[1].strip():
                senses.append({"text": match[1].strip(), "reading": match[2], "line": row["line"]})
            elif part.strip():
                senses.append({"text": part.strip(), "reading": None, "line": row["line"]})
    return senses


def validate_adjudications(review, entries):
    by_char = {e["character"]: e for e in entries if e["character"]}
    decisions = {}
    for number, decision in enumerate(review.get("sense_adjudications", [])):
        char, reading, text = (decision[k] for k in ("character", "reading", "sense"))
        entry = by_char[char]
        key = (char, reading, sense_key(text))
        if key in decisions or reading not in entry["allowed_readings"] or not decision.get("rationale"):
            raise ValueError("Invalid/duplicate adjudicated sense")
        if decision["source"] == "court":
            candidates = entry["court_primary"]["glosses"] + entry["court_general"]["glosses"]
        elif decision["source"] == "libhangul":
            candidates = dictionary_senses(entry)
        else:
            raise ValueError("Unknown adjudication source")
        if not any(g["reading"] == reading and sense_key(g["text"]) == sense_key(text) for g in candidates):
            raise ValueError("Adjudicated sense is not explicitly bound to that reading")
        if decision.get("status", "source_checked") not in {"source_checked", "held"}:
            raise ValueError("Invalid adjudication status")
        quote = decision["comparison_quote"]
        if decision["comparison_source"] == "unihan":
            valid = any(quote in d["value"] for d in entry["unihan_definitions"])
        elif decision["comparison_source"] == "libhangul":
            valid = any(g["reading"] == reading and sense_key(quote) == sense_key(g["text"])
                        for g in dictionary_senses(entry))
        else:
            valid = False
        if not quote or not valid:
            raise ValueError("Adjudication corroboration does not match source/reading")
        decisions[key] = {**decision, "index": number}
    return decisions


def audit_senses(entry, meanings, editorial, decisions):
    """Assign an evidenced outcome to every sense; missing evidence stays held."""
    char = entry["character"]
    court = {(g["reading"], sense_key(g["text"]))
             for field in ("court_primary", "court_general") for g in entry[field]["glosses"]}
    library = {(g["reading"], sense_key(g["text"])) for g in dictionary_senses(entry)}
    for sense in meanings:
        reading, text = sense["reading"], sense_key(sense["text"])
        selected = bool(editorial and editorial["meaning_status"] == "source_checked"
                        and reading in editorial["reviewed_readings"]
                        and text == sense_key(editorial["meaning_ko"]))
        if char is None:
            rule = "private_code"
        elif reading is None:
            rule = "dictionary_marker" if any(source == "libhangul" for source, _ in sense["refs"]) else "character_only"
        elif reading not in entry["allowed_readings"]:
            rule = "not_allowed"
        elif (char, reading, text) in decisions:
            decision = decisions[(char, reading, text)]
            rule = "editorial_hold" if decision.get("status") == "held" else "adjudicated"
            sense["adjudication"] = decision["index"]
            if decision.get("clarification"):
                sense["clarification"] = decision["clarification"]
        elif selected:
            rule = "editorial"
        elif not re.fullmatch(r"[가-힣]+", text):
            rule = "unclear_gloss"
        elif (reading, text) in court and (reading, text) in library:
            rule = "source_agreement"
        else:
            has_court = any(r == reading for r, _ in court)
            has_lib = any(r == reading for r, _ in library)
            rule = "source_difference" if has_court and has_lib else "single_source"
        sense["audit"] = rule
        if SENSE_RULES[rule][0] != "source_checked":
            continue
        # A specifically adjudicated correction can replace an erroneous court
        # gloss, while both original texts remain visible with their outcomes.
        sense.pop("reference_only", None)
    result = {}
    for reading in entry["allowed_readings"]:
        candidates = [g for g in meanings if g["reading"] == reading]
        checked = sum(SENSE_RULES[g["audit"]][0] == "source_checked" for g in candidates)
        result[reading] = "source_checked" if checked else "held"
    return result


def definitions_from_zip(path):
    raw = catalog.read_bytes(path)
    if catalog.sha(raw) != UNIHAN_SHA:
        raise ValueError("Unihan source hash differs from pinned version")
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        if archive.getinfo("Unihan_Readings.txt").file_size > catalog.MAX_FILE_BYTES:
            raise ValueError("Unihan member too large")
        lines = archive.read("Unihan_Readings.txt").decode("utf-8").splitlines()
    definitions = {}
    for line in lines:
        parts = line.split("\t")
        if len(parts) == 3 and parts[1] == "kDefinition":
            definitions[chr(int(parts[0][2:], 16))] = parts[2]
    return definitions


def court_texts(entry):
    return sorted({e["raw"]["in"] for e in entry["evidence"] if e["source"].startswith("court:")})


def court_text_hash(texts):
    return catalog.sha(json.dumps(texts, ensure_ascii=False, separators=(",", ":")).encode())


def validate_review(review, official, definitions):
    if (review.get("version") != VERSION or review.get("human_reviewed") is not False
            or review.get("review_method") != "codex-editorial-source-check"
            or review.get("official_element_assignment") is not False or review.get("catalog_ready") is not False):
        raise ValueError("Invalid editorial review boundaries")
    policies = review.get("material_policy", {})
    if set(policies) != set(MATERIALS) or any(set(policies[e].get("materials", [])) != MATERIALS[e] for e in MATERIALS):
        raise ValueError("Unexpected material policy")
    entries = review.get("entries")
    if not isinstance(entries, list) or not 1 <= len(entries) <= 10000:
        raise ValueError("Invalid review entries")
    by_char = {e["character"]: e for e in official if e["character"] is not None}
    seen = set()
    for entry in entries:
        char = entry.get("character")
        if not isinstance(char, str) or len(char) != 1 or char in seen or char not in by_char:
            raise ValueError("Invalid/duplicate/absent review character")
        seen.add(char)
        fact = by_char[char]
        evidence = entry.get("evidence", {})
        texts = court_texts(fact)
        expected = {"court_code": fact["court_code"], "allowed_readings": fact["allowed_readings"],
                    "court_in_raw": texts, "court_in_sha256": court_text_hash(texts),
                    "unihan_definition_sha256": catalog.sha(definitions[char].encode()) if char in definitions else None}
        if evidence != expected:
            raise ValueError("Editorial evidence differs from archived sources")
        sounds = entry.get("reviewed_readings")
        if not isinstance(sounds, list) or sounds != sorted(set(sounds)) or not set(sounds) <= set(fact["allowed_readings"]):
            raise ValueError("Reviewed reading is not court-listed")
        if entry.get("unreviewed_readings") != sorted(set(fact["allowed_readings"]) - set(sounds)):
            raise ValueError("Unreviewed readings were silently promoted")
        if entry.get("recommendation_ready") is not False or entry.get("name_suitability") != "not_evaluated":
            raise ValueError("Semantic review cannot certify name suitability")
        if not entry.get("rationale") or not isinstance(entry.get("notes"), str):
            raise ValueError("Missing editorial rationale")
        if entry.get("meaning_status") == "held":
            if (sounds or entry.get("element") is not None or entry.get("material") is not None
                    or entry.get("meaning_ko") is not None or entry.get("material_status") != "held"
                    or entry.get("meaning_basis") is not None or entry.get("selected_court_gloss") is not None
                    or entry.get("selected_unihan_phrase") is not None):
                raise ValueError("Held meanings cannot receive element credit")
            continue
        if entry.get("meaning_status") != "source_checked" or not sounds or not entry.get("meaning_ko"):
            raise ValueError("Missing checked sense/readings")
        if any(reason in fact["quarantine_reasons"] for reason in
               ("conflicting_source_rows", "not_personal_name", "missing_allowed_reading")):
            raise ValueError("Unresolved court eligibility")
        if entry.get("meaning_basis") == "court":
            sense = entry.get("selected_court_gloss")
            if any(sense not in fact["gloss_candidates"].get(sound, []) for sound in sounds):
                raise ValueError("Selected sense does not belong to selected reading")
            if entry.get("meaning_ko") != sense or entry.get("selected_unihan_phrase") is not None:
                raise ValueError("Court sense was rewritten without a separate review basis")
        elif entry.get("meaning_basis") == "unihan":
            phrase = entry.get("selected_unihan_phrase")
            if not phrase or phrase not in definitions.get(char, "") or entry.get("selected_court_gloss") is not None:
                raise ValueError("Missing explicit Unihan meaning evidence")
            if not entry.get("notes"):
                raise ValueError("Alternative meaning source needs explanation")
        else:
            raise ValueError("Unknown meaning basis")
        element, material = entry.get("element"), entry.get("material")
        if element is None:
            if material is not None or entry.get("material_status") != "unclassified":
                raise ValueError("Unclassified sense must receive no element credit")
        elif element not in MATERIALS or material not in MATERIALS[element] or entry.get("material_status") != "associated":
            raise ValueError("Material does not match element policy")
    return entries


def export_review(review_path, catalog_path, cache_path, unihan_path, output):
    review_raw = catalog.read_bytes(review_path)
    review = json.loads(review_raw)
    sources = review["sources"]
    if Path(cache_path).is_file():
        from scripts.hanja_inventory import load_sources
        rows, _, bundle = load_sources(cache_path)
        snapshot_hash = bundle["sources"]["court"]["snapshot_sha256"]
    else:
        rows, _ = catalog.snapshot_rows(cache_path)
        snapshot_hash = catalog.sha(catalog.read_bytes(Path(cache_path) / "snapshot.json"))
    if (sources["court_catalog_sha256"] != catalog.sha(catalog.read_bytes(catalog_path))
            or sources["court_snapshot_sha256"] != snapshot_hash
            or sources["unihan_sha256"] != UNIHAN_SHA):
        raise ValueError("Source version differs from editorial review")
    official = catalog.normalize(rows, "court:semantic-review")
    checked = validate_review(review, official, definitions_from_zip(unihan_path))
    by_char = {e["character"]: e for e in checked}
    coverage = []
    for fact in official:
        entry = by_char.get(fact["character"])
        if entry:
            status = "meaning_source_checked" if entry["meaning_status"] == "source_checked" else "meaning_held"
        else:
            status = "structural_hold" if fact["quarantine_reasons"] else "not_reviewed"
        coverage.append({"court_code": fact["court_code"], "character": fact["character"], "status": status,
                         "reviewed_readings": entry["reviewed_readings"] if entry else [],
                         "unreviewed_readings": entry["unreviewed_readings"] if entry else fact["allowed_readings"],
                         "element": entry["element"] if entry else None, "recommendation_ready": False})
    report = {"version": VERSION, "source_codes": len(official), "editorial_entries": len(checked),
              "coverage": dict(Counter(e["status"] for e in coverage)),
              "associated_elements": dict(Counter(e["element"] for e in checked if e["element"])),
              "source_checked_unclassified": sum(e["meaning_status"] == "source_checked" and e["element"] is None for e in checked),
              "partial_reading_reviews": sum(bool(e["reviewed_readings"]) and bool(e["unreviewed_readings"]) for e in checked),
              "human_reviewed": False, "name_suitability_evaluated": False, "recommendation_ready": 0}
    output = Path(output)
    output.mkdir(parents=True, exist_ok=False)
    catalog.atomic_write(output / "review.json", review_raw)
    catalog.atomic_write(output / "coverage.json", catalog.encode(coverage))
    catalog.atomic_write(output / "report.json", catalog.encode(report))
    catalog.atomic_write(output / "manifest.json", catalog.encode({
        "version": VERSION, "created_at": catalog.now(), "complete": True, "catalog_ready": False,
        "sources": sources, "files": {name: catalog.sha(catalog.read_bytes(output / name))
                                       for name in ("review.json", "coverage.json", "report.json")},
    }))
    print(json.dumps(report, ensure_ascii=False, indent=2))


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--review", type=Path, required=True)
    parser.add_argument("--catalog", type=Path, required=True)
    parser.add_argument("--official-cache", type=Path, required=True)
    parser.add_argument("--unihan", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    try:
        export_review(args.review, args.catalog, args.official_cache, args.unihan, args.output)
    except (ValueError, OSError, KeyError, TypeError, zipfile.BadZipFile):
        parser.exit(1, "Semantic review failed: check source versions, sense evidence and output path.\n")

def concept_sense_id(code, reading, text):
    return code + ":" + reading + ":" + sense_key(text)


def validate_concepts(document, entries, editorial):
    """Check source-bound decisions before any material credit is generated."""
    concepts = document["concepts"]
    ambiguous = document["ambiguous_glosses"]
    aliases = {}
    for cid, concept in concepts.items():
        if not re.fullmatch(r"[a-z][a-z0-9_.]*", cid) or not all(concept.get(k) for k in ("label", "definition", "rationale")):
            raise ValueError("Invalid concept definition")
        element, material = concept.get("element"), concept.get("material")
        if (element is None) != (material is None) or (element and material not in MATERIALS.get(element, set())):
            raise ValueError("Invalid concept material rule")
        for alias in concept["aliases"]:
            if not alias or not re.fullmatch(r"[가-힣]+", sense_key(alias)):
                raise ValueError("Invalid concept alias")
            aliases.setdefault(sense_key(alias), set()).add(cid)
    for text, candidates in ambiguous.items():
        if not text or len(set(candidates)) < 2 or not set(candidates) <= concepts.keys():
            raise ValueError("Invalid ambiguous concept candidates")
    # A shared or explicitly polysemous alias cannot become an automatic rule.
    aliases = {key: next(iter(ids)) for key, ids in aliases.items() if len(ids) == 1 and key not in ambiguous}
    by_code = {e["court_code"]: e for e in entries}
    references = document.get("reference_facts", {})
    for reference in references.values():
        if not reference.get("url", "").startswith("https://") or not reference.get("fact") or not reference.get("checked_at"):
            raise ValueError("Invalid external reference fact")
    decisions = document["concept_reviews"]
    for key, decision in decisions.items():
        code, reading, text = key.split(":", 2)
        entry = by_code[code]
        if entry["character"] is None or reading not in entry["allowed_readings"]:
            raise ValueError("Concept review needs a standard character and legal reading")
        court = entry["court_primary"]["glosses"] + entry["court_general"]["glosses"]
        lib = dictionary_senses(entry)
        selected = editorial.get(entry["character"])
        selected_match = bool(selected and reading in selected["reviewed_readings"]
                              and text == sense_key(selected["meaning_ko"] or ""))
        if not any(g["reading"] == reading and sense_key(g["text"]) == text for g in court + lib) and not selected_match:
            raise ValueError("Concept review sense does not exist at selected reading")
        cid, status = decision.get("concept"), decision.get("status")
        if (status not in {"reviewed", "held"} or not decision.get("rationale")
                or (status == "reviewed" and cid not in concepts) or (status == "held" and cid is not None)):
            raise ValueError("Invalid concept review decision")
        if not set(decision.get("references", [])) <= references.keys():
            raise ValueError("Missing concept reference")
        bound = False
        for proof in decision.get("proof", []):
            source, quote = proof["source"], proof.get("quote")
            if source == "court":
                fields = [f for f, raw in (("court_primary", entry["court_raw"]["in"]),
                                          ("court_general", entry["court_raw"]["dic"])) if raw == quote]
                valid = bool(fields)
                bound |= any(g["reading"] == reading and sense_key(g["text"]) == text
                             for field in fields for g in entry[field]["glosses"])
            elif source == "libhangul":
                valid = any(row["line"] == proof.get("line") and row["text"] == quote for row in entry["libhangul"])
                bound |= valid and any(g["line"] == proof.get("line") and g["reading"] == reading
                                       and sense_key(g["text"]) == text for g in lib)
            elif source == "unihan":
                valid = bool(quote) and any(quote == row["value"] for row in entry["unihan_definitions"])
            elif source == "editorial":
                valid = selected_match and proof.get("character") == entry["character"]
                bound |= valid
            else:
                valid = False
            if not valid:
                raise ValueError("Concept proof differs from archived source")
        if not bound:
            raise ValueError("Concept proof does not bind selected sense and reading")
    policy = document["concept_policy"]
    before = [{"id": k, "before": v["before"]} for k, v in sorted(decisions.items()) if "before" in v]
    projection = json.dumps(before, ensure_ascii=False, separators=(",", ":"), sort_keys=True).encode()
    if (policy.get("human_reviewed") is not False or policy.get("baseline_senses") != len(before)
            or policy.get("baseline_characters") != len({r["id"].split(":")[0] for r in before})
            or catalog.sha(projection) != policy.get("baseline_sha256")):
        raise ValueError("Concept baseline coverage/hash mismatch")
    return aliases


def resolve_concepts(entry, meanings, document, aliases):
    """Resolve exact senses, keeping evidence agreement independent of meaning approval.

    Automatic equivalence needs court AND IME meanings at the same legal reading.
    English, radicals, nearby words and shared elements never substitute for that.
    """
    concepts, decisions = document["concepts"], document["concept_reviews"]
    court = entry["court_primary"]["glosses"] + entry["court_general"]["glosses"]
    lib = dictionary_senses(entry)
    court_ids, lib_ids = {}, {}
    for records, target in ((court, court_ids), (lib, lib_ids)):
        for g in records:
            cid = aliases.get(sense_key(g["text"]))
            if cid:
                target.setdefault(g["reading"], set()).add(cid)
    for sense in meanings:
        reading, text = sense["reading"], sense_key(sense["text"])
        sense["semantic_status"] = "unresolved"
        if entry["character"] is None or reading is None or reading not in entry["allowed_readings"]:
            continue
        key = concept_sense_id(entry["court_code"], reading, text)
        decision = decisions.get(key)
        cid = None
        if decision:
            sense["semantic_status"] = decision["status"]
            sense["concept_review"] = key
            cid = decision["concept"]
        elif sense["audit"] != "editorial_hold":
            candidate = aliases.get(text)
            if candidate and candidate in court_ids.get(reading, set()) & lib_ids.get(reading, set()):
                cid = candidate
                sense["semantic_status"] = "rule_resolved"
                sense["concept_basis"] = "court_lib_same_reading_alias"
        if cid:
            sense["concept"] = cid
            # A resolved same-reading dictionary synonym may be an additional sense.
            # This approval never overwrites the separate source evidence outcome.
            sense.pop("reference_only", None)
            rule = concepts[cid]
            if rule["element"]:
                sense.update(element=rule["element"], material=rule["material"])
        elif text in document["ambiguous_glosses"]:
            sense["concept_candidates"] = document["ambiguous_glosses"][text]


if __name__ == "__main__":
    main()
