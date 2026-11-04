#!/usr/bin/env python3
"""Offline, source-linked inventory. This is not a name recommendation allowlist."""
import argparse
from collections import Counter, defaultdict
import hashlib
import json
from pathlib import Path
import re
from urllib.parse import quote

if __package__:
    from .hanja_catalog import ROOT, atomic_write, encode, normalize, read_bytes, snapshot_rows
else:
    from hanja_catalog import ROOT, atomic_write, encode, normalize, read_bytes, snapshot_rows

VERSION = "hanja-search-v4"
DEFAULT = ROOT / "data/hanja"
HEADING = re.compile(r"^\s*([가-힣](?:\s*[,/]\s*[가-힣])*)\s*:\s*")
GLOSS = re.compile(r"([^():,;/]+?)\(\s*([가-힣](?:\s*[,/]\s*[가-힣])*)\s*\)")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def evidence_bytes(value):
    # Canonically encoded documents need no duplicate raw string. Preserve the
    # original bytes for the few noncanonical API envelopes as well.
    return value.encode() if isinstance(value, str) else encode(value)


def wiktionary_references(envelope):
    """Keep actual definition lines; never substitute a variant's definition.

    Korean sections (including their external dictionary references) are not used.
    Wikitext is inert research data, not HTML and not a verified Korean translation.
    """
    raw = envelope["response_text"].encode()
    if digest(raw) != envelope["sha256"]:
        raise ValueError("Wiktionary response hash mismatch")
    payload = json.loads(raw)
    if "error" in payload:
        raise ValueError("Wiktionary API error")
    for page in payload["query"]["pages"]:
        title = page["title"]
        if len(title) != 1:
            raise ValueError("Expected a single character Wiktionary page")
        ref = {"character": title, "missing": page.get("missing", False),
               "page_url": "https://en.wiktionary.org/wiki/" + quote(title, safe=""),
               "history_url": "https://en.wiktionary.org/w/index.php?title=" + quote(title, safe="") + "&action=history",
               "license": "CC-BY-SA-4.0", "definition_lines": []}
        if not ref["missing"]:
            revision = page["revisions"][0]
            ref.update(revision=revision["revid"], timestamp=revision["timestamp"])
            section = None
            for n, line in enumerate(revision["slots"]["main"]["content"].splitlines(), 1):
                if re.fullmatch(r"==[^=]+==", line):
                    section = line.strip("=")
                if section in {"Translingual", "Chinese"} and line.startswith("# "):
                    # Template-only requests, usage restrictions, and relations are
                    # not a self-contained denotation. Keep them only in the raw source.
                    residue = re.sub(r"\{\{[^{}]*\}\}", "", line[2:]).strip()
                    if re.search(r"[a-zA-Z]{2,}", residue):
                        ref["definition_lines"].append({"line": n, "section": section, "wikitext": line[2:]})
        yield ref


def parse_gloss(text, allowed):
    """Extract explicit markers only; keep other readings and all residue visible.

    A bare reading is missing meaning, not malformed syntax. Repairs are mechanical,
    recorded, and never alter the raw source or infer a legal reading.
    """
    heading = HEADING.match(text)
    body = text[heading.end():] if heading else text.strip()
    if not body or (re.fullmatch(r"[가-힣](?:\s*[,/]\s*[가-힣])*", body) and
                    set(re.split(r"\s*[,/]\s*", body)) <= set(allowed)):
        return {"glosses": [], "residue": "", "repairs": [], "status": "no_meaning"}
    repairs = []
    work = body
    if "((" in work:
        # Only collapse doubled opening before an explicit Hangul reading marker.
        work, count = re.subn(r"\(\((?=[가-힣](?:\s*[,/]\s*[가-힣])*\s*\))", "(", work)
        if count:
            repairs.append("duplicate_opening_before_reading")
    if "㈜" in work and "주" in allowed:
        work = work.replace("㈜", "(주)")
        repairs.append("parenthesized_ju_reading_marker")
    found = []
    for match in GLOSS.finditer(work):
        value, sounds = match.groups()
        for sound in re.split(r"\s*[,/]\s*", sounds.strip()):
            found.append({"text": value.strip(), "reading": sound,
                          "court_allowed": sound in allowed})
    residue = GLOSS.sub("", work).strip(" ,;\t\r\n")
    # Unmarked descriptions remain character-scoped evidence, never reading-bound.
    return {"glosses": found, "residue": residue, "repairs": repairs,
            "status": "parsed" if found and not residue else "residue"}


def load_sources(source=DEFAULT / "sources.json"):
    path = Path(source)
    if any(p.is_symlink() for p in [path, *path.parents]):
        raise ValueError("Symlink evidence is forbidden")
    bundle = json.loads(read_bytes(path))
    if bundle.get("version") != "hanja-evidence-v1":
        raise ValueError("Unsupported source bundle")
    manifest = bundle["manifest"]
    verified = {}
    for ref in manifest["files"]:
        name = ref["path"]
        if Path(name).is_absolute() or ".." in Path(name).parts or name in verified:
            raise ValueError("Invalid/duplicate evidence path")
        raw = evidence_bytes(bundle["files"][name])
        if len(raw) != ref["bytes"] or digest(raw) != ref["sha256"]:
            raise ValueError("Source hash/size mismatch: " + name)
        verified[name] = json.loads(raw)
    if set(verified) != set(bundle["files"]):
        raise ValueError("Unlisted source evidence")
    court = {name.removeprefix("court/"): evidence_bytes(raw) for name, raw in bundle["files"].items()
             if name.startswith("court/")}
    if digest(court["snapshot.json"]) != manifest["sources"]["court"]["snapshot_sha256"]:
        raise ValueError("Court snapshot mismatch")
    rows, snapshot = snapshot_rows(Path("court"), files=court)
    supplementary = defaultdict(list)
    for name, records in verified.items():
        if name.startswith("wiktionary-page-"):
            for ref in wiktionary_references(records):
                supplementary[ref["character"]].append({**ref, "source_file": name})
            continue
        if not name.startswith(("libhangul-", "unihan-definitions-", "unihan-variants-")):
            continue
        if not isinstance(records, list):
            raise ValueError("Invalid dictionary subset")
        for index, row in enumerate(records):
            ch = row["character"]
            if not isinstance(ch, str) or len(ch) != 1:
                raise ValueError("Invalid dictionary character")
            supplementary[ch].append({**row, "source_file": name, "record_index": index})
    return rows, supplementary, {**manifest, "court_snapshot": snapshot}


def inventory(source=DEFAULT / "sources.json", loaded=None):
    rows, supplementary, manifest = loaded if loaded is not None else load_sources(source)
    normalized = normalize(rows, "court:" + manifest["sources"]["court"]["snapshot_sha256"])
    result = []
    for original in normalized:
        if "conflicting_source_rows" in original["quarantine_reasons"]:
            raise ValueError("Conflicting court source rows")
        raw = original["evidence"][0]["raw"]
        allowed = original["allowed_readings"]
        primary = parse_gloss(raw["in"], allowed)
        general = parse_gloss(raw["dic"], allowed)
        aux = supplementary.get(original["character"], [])
        korean = [r for r in aux if r["source_file"].startswith("libhangul-")]
        wiki = [r for r in aux if r["source_file"].startswith("wiktionary-")]
        wiki_meaning = any(r["definition_lines"] for r in wiki)
        english = [r for r in aux if r.get("field") == "kDefinition"]
        variants = [r for r in aux if r.get("field") and r["field"] != "kDefinition"]
        covered = {r["reading"] for r in primary["glosses"] + general["glosses"] if r["court_allowed"]}
        covered.update(r["reading"] for r in korean if r["reading"] in allowed and r["text"].strip())
        character_korean = bool(primary["glosses"] or general["glosses"] or any(r["text"].strip() for r in korean))
        issues = []
        if not original["character"]:
            issues.append("dedicated_code_without_standard_character")
        if not allowed:
            issues.append("missing_court_allowed_reading")
        if set(allowed) - covered:
            issues.append("missing_korean_gloss_for_some_allowed_readings")
        if not character_korean and not english and not wiki_meaning:
            issues.append("no_extracted_meaning_in_collected_dictionaries")
        if primary["status"] == "residue":
            issues.append("court_primary_residue")
        result.append({
            "court_code": original["court_code"], "code_type": original["code_type"],
            "character": original["character"], "allowed_readings": allowed,
            "official_row_indices": [r["row_index"] for r in original["evidence"]],
            "court_raw": {k: raw[k] for k in ("ineum", "in", "dic")},
            "court_primary": primary, "court_general": general,
            "libhangul": korean, "unihan_definitions": english, "variant_references": variants,
            "wiktionary_references": wiki,
            "korean_gloss_readings": sorted(covered),
            "has_character_meaning_evidence": character_korean or bool(english) or wiki_meaning,
            "issues": issues, "semantic_review": "not_evaluated_by_this_inventory",
            "recommendation_ready": False,
        })
    return result


def compact(value):
    return (json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True) + "\n").encode()


def words(text):
    return set(re.findall(r"[가-힣a-zA-Z]+", text.casefold()))


def plain_wiki(text):
    text = re.sub(r"<!--.*?-->|\{\{[^{}]*\}\}", "", text)
    return re.sub(r"\[\[(?:[^]|]+\|)?([^]]+)\]\]", r"\1", text).strip()


def render(root=DEFAULT):
    if __package__:
        from . import hanja_semantics as semantics
    else:
        import hanja_semantics as semantics
    root = Path(root)
    loaded = load_sources(root / "sources.json")
    entries = inventory(root / "sources.json", loaded=loaded)
    counts = {
        "court_codes": len(entries), "standard_characters": sum(e["character"] is not None for e in entries),
        "standard_characters_with_meaning_evidence": sum(e["character"] is not None and
            e["has_character_meaning_evidence"] for e in entries),
        "standard_characters_without_extracted_meaning": sum(e["character"] is not None and
            not e["has_character_meaning_evidence"] for e in entries),
        "code_types": dict(Counter(e["code_type"] for e in entries)),
        "character_meaning_evidence": sum(e["has_character_meaning_evidence"] for e in entries),
        "all_allowed_readings_have_korean_gloss": sum(bool(e["allowed_readings"]) and
            set(e["allowed_readings"]) <= set(e["korean_gloss_readings"]) for e in entries),
        "court_code_reading_pairs": sum(len(e["allowed_readings"]) for e in entries),
        "missing_korean_gloss_reading_pairs": sum(len(set(e["allowed_readings"]) -
            set(e["korean_gloss_readings"])) for e in entries),
        "issue_counts": dict(Counter(issue for e in entries for issue in e["issues"])),
    }
    result = {}
    index = {name: defaultdict(set) for name in ("character", "reading", "meaning", "element", "issue", "review_status", "concept", "semantic_status")}
    review_document = json.loads(read_bytes(ROOT / "data/hanja-semantic-review.json"))
    definitions = {e["character"]: d["value"] for e in entries for d in e["unihan_definitions"]}
    # The pinned 17/18 definitions for all 344 selected characters are byte-identical;
    # validate_review compares their recorded definition hashes and court evidence.
    semantics.validate_review(review_document, normalize(loaded[0], "court:full-review"), definitions)
    decisions = semantics.validate_adjudications(review_document, entries)
    reviews = {r["character"]: r for r in review_document["entries"]}
    aliases = semantics.validate_concepts(review_document, entries, reviews)
    concept_counts = Counter()
    audit_counts = Counter()
    audit_rules = Counter()
    for entry in entries:
        code, char = entry["court_code"], entry["character"]
        review = reviews.get(char)
        meanings = []
        for field in ("primary", "general"):
            for n, g in enumerate(entry["court_" + field]["glosses"]):
                meanings.append({"text": g["text"], "reading": g["reading"], "source": "court." + field,
                                 "ref": [entry["official_row_indices"][0], n]})
        for row in semantics.dictionary_senses(entry):
            meanings.append({"text": row["text"], "reading": row["reading"],
                             "source": "libhangul", "ref": row["line"]})
        for row in entry["unihan_definitions"]:
            meanings.append({"text": row["value"], "reading": None, "source": "unihan", "ref": row["line"]})
        for row in entry["wiktionary_references"]:
            for definition in row["definition_lines"]:
                meanings.append({"text": plain_wiki(definition["wikitext"]), "reading": None,
                                 "source": "wiktionary", "ref": [row["revision"], definition["line"]]})
        if review and review["meaning_status"] == "source_checked" and review["meaning_basis"] == "unihan":
            for reading in review["reviewed_readings"]:
                meanings.append({"text": review["meaning_ko"], "reading": reading,
                                 "source": "editorial", "ref": char})
        grouped = {}
        for meaning in meanings:
            lemma = semantics.sense_key(meaning["text"]) if meaning["reading"] is not None else meaning["text"]
            key = (meaning["reading"], lemma)
            sense = grouped.setdefault(key, {"text": meaning["text"], "reading": meaning["reading"], "refs": []})
            reference = [meaning["source"], meaning["ref"]]
            if reference not in sense["refs"]:
                sense["refs"].append(reference)
        meanings = list(grouped.values())
        tiers = {"court.primary": 0, "court.general": 1, "libhangul": 2, "editorial": 0}
        preferred = {}
        for sense in meanings:
            if sense["reading"] in entry["allowed_readings"]:
                tier = min(tiers[source] for source, _ in sense["refs"])
                preferred[sense["reading"]] = min(preferred.get(sense["reading"], tier), tier)
        for sense in meanings:
            if sense["reading"] is not None and (sense["reading"] not in preferred or
                    min(tiers[source] for source, _ in sense["refs"]) > preferred[sense["reading"]]):
                # Preserve conflicting/additional dictionary senses as references.
                # They cannot override a court sense for the same legal reading.
                sense["reference_only"] = True
        # Identical senses share text; independent source references remain.
        fact = {"character": char, "readings": entry["allowed_readings"], "meanings": meanings}
        if entry["issues"]:
            fact["issues"] = entry["issues"]
        if review:
            fact["editorial"] = {k: review[k] for k in ("meaning_status", "meaning_ko", "reviewed_readings", "element", "material")}
        fact["review"] = semantics.audit_senses(entry, meanings, review, decisions)
        semantics.resolve_concepts(entry, meanings, review_document, aliases)
        checked = sum(status == "source_checked" for status in fact["review"].values())
        status = "source_checked" if checked and checked == len(fact["readings"]) else "partial" if checked else "held"
        fact["review_status"] = status
        index["review_status"][status].add(code)
        audit_counts[status] += 1
        audit_counts["reading_pairs_checked"] += checked
        audit_counts["reading_pairs_held"] += len(fact["readings"]) - checked
        for sense in meanings:
            audit_rules[sense["audit"]] += 1
            concept_counts[sense["semantic_status"]] += 1
            index["semantic_status"][sense["semantic_status"]].add(code)
            if sense.get("concept"):
                index["concept"][sense["concept"]].add(code)
            if sense.get("element"):
                index["element"][sense["element"]].add(code)
        if char:
            index["character"][char].add(code)
        for reading in fact["readings"]:
            index["reading"][reading].add(code)
        for meaning in meanings:
            vocabulary = meaning["text"]
            if meaning.get("concept"):
                vocabulary += " " + " ".join(review_document["concepts"][meaning["concept"]]["aliases"])
            for word in words(vocabulary):
                index["meaning"][word].add(code)
        for issue in fact.get("issues", []):
            index["issue"][issue].add(code)
        result[code] = fact
    return {"version": VERSION, "counts": counts, "entries": result,
            "index": {name: {key: sorted(codes) for key, codes in values.items()} for name, values in index.items()},
            "sources_sha256": digest(read_bytes(root / "sources.json")),
            "editorial_sha256": digest(read_bytes(ROOT / "data/hanja-semantic-review.json")),
            "concepts": review_document["concepts"],
            "concept_audit": {"sense_outcomes": dict(concept_counts),
                              "policy": review_document["concept_policy"],
                              "reviews": review_document["concept_reviews"],
                              "reference_facts": review_document["reference_facts"],
                              "statuses": {"reviewed": "Codex individual source-bound decision",
                                           "rule_resolved": "controlled aliases in court and IME at same reading",
                                           "held": "individual unresolved meaning",
                                           "unresolved": "no approved concept"}},
            "source_audit": {"coverage": dict(audit_counts), "sense_rules": semantics.SENSE_RULES,
                               "sense_outcomes": dict(audit_rules), "human_reviewed": False,
                               "reviewed_at": review_document.get("full_review_policy", {}).get("reviewed_at"),
                               "coverage_complete": True, "source_agreement_is_automated": True,
                               "adjudications": review_document.get("sense_adjudications", []),
                               "name_suitability_evaluated": False,
                               "method": "reading-bound source agreement and Codex adjudications"},
            "policy": {"recommendation_ready": False, "all_meanings_verified": False, "legal_annex_reconciled": False,
                       "english_meaning_scope": "character, not every Korean reading",
                       "element_scope": "resolved reading-bound concept and explicit project material rule",
                       "reading_sense_priority": ["court.primary", "court.general", "libhangul"],
                       "variants": "reference only; no inherited meanings or allowed readings"}}


class Catalog:
    """Load only the compact search file once; queries never open source evidence."""
    def __init__(self, path=DEFAULT / "catalog.json"):
        self.data = json.loads(read_bytes(path))
        if self.data.get("version") != VERSION:
            raise ValueError("Unsupported catalog version")
        self.entries = self.data["entries"]
        self.index = self.data["index"]

    def sense_words(self, sense):
        aliases = self.data["concepts"][sense["concept"]]["aliases"] if sense.get("concept") else []
        return words(sense["text"] + " " + " ".join(aliases))

    def search(self, *, character=None, code=None, reading=None, meaning=None, element=None, issue=None, review_status=None, concept=None, semantic_status=None, limit=20):
        if isinstance(limit, bool) or not isinstance(limit, int) or not 1 <= limit <= 100:
            raise ValueError("Limit must be 1..100")
        for value in (character, code, reading, meaning, element, issue, review_status, concept, semantic_status):
            if value is not None and (not isinstance(value, str) or len(value) > 160):
                raise ValueError("Search filters must be strings of at most 160 characters")
        candidates = None
        def narrow(values):
            nonlocal candidates
            values = set(values)
            candidates = values if candidates is None else candidates & values
        if code is not None:
            narrow([code] if code in self.entries else [])
        for group, key in (("character", character), ("reading", reading), ("element", element), ("issue", issue), ("review_status", review_status), ("concept", concept), ("semantic_status", semantic_status)):
            if key is not None:
                narrow(self.index[group].get(key, []))
        terms = words(meaning or "")
        if len(terms) > 8:
            raise ValueError("At most eight meaning terms are supported")
        if meaning is not None and not terms:
            return []
        # Scan the small vocabulary, not all character records. Preserve substring
        # matches such as 물 in 맑은물, without a Korean morphological dependency.
        for term in terms:
            narrow(code for word, codes in self.index["meaning"].items() if term in word for code in codes)
        selected = self.entries.keys() if candidates is None else candidates
        result = []
        scope_checked = (reading is not None or bool(terms) or element is not None or concept is not None or semantic_status is not None) and review_status != "held"
        rules = self.data["source_audit"]["sense_rules"]
        for code in sorted(selected):
            fact = self.entries[code]
            matches = [g for g in fact["meanings"] if (review_status == "held" or semantic_status in {"held", "unresolved"} or not g.get("reference_only"))
                       and (reading is None or g["reading"] == reading)
                       and (element is None or g.get("element") == element)
                       and (concept is None or g.get("concept") == concept)
                       and (semantic_status is None or g["semantic_status"] == semantic_status)
                       and (not scope_checked or rules[g["audit"]][0] == "source_checked"
                            or g["semantic_status"] in {"reviewed", "rule_resolved"}
                            or semantic_status in {"held", "unresolved"})
                       and all(any(term in word for word in self.sense_words(g)) for term in terms)]
            if (scope_checked or terms) and not matches:
                continue
            matched_readings = set(fact["readings"])
            if reading:
                matched_readings &= {reading}
            if terms or element or concept or semantic_status or scope_checked:
                matched_readings &= {g["reading"] for g in matches}
            result.append({"code": code, **fact, "matched_readings": sorted(matched_readings),
                           "matched_meanings": matches if scope_checked or terms else []})
            if len(result) == limit:
                break
        return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=DEFAULT)
    action = parser.add_mutually_exclusive_group()
    action.add_argument("--check", action="store_true")
    action.add_argument("--build", action="store_true")
    for name in ("character", "code", "reading", "meaning", "element", "issue", "review-status", "concept", "semantic-status"):
        parser.add_argument("--" + name)
    parser.add_argument("--limit", type=int, default=20)
    args = parser.parse_args()
    if args.check or args.build:
        data = render(args.root)
        raw = compact(data)
        path = args.root / "catalog.json"
        if args.check:
            if read_bytes(path) != raw:
                raise ValueError("Catalog does not match sources/editorial review")
        else:
            atomic_write(path, raw)
        print(json.dumps(data["counts"], ensure_ascii=False, indent=2))
    else:
        params = {key: getattr(args, key) for key in ("character", "code", "reading", "meaning", "element", "issue", "review_status", "concept", "semantic_status", "limit")}
        print(json.dumps(Catalog(args.root / "catalog.json").search(**params), ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
