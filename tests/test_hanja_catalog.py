import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / "scripts/hanja_catalog.py"
SPEC = importlib.util.spec_from_file_location("hanja_catalog", SCRIPT)
hanja = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(hanja)


def row(code="0745e", sound="서", gloss="서 : 상서(서)", dictionary="단", stroke=13):
    return {"cd": code, "type": code[0].upper(), "ineum": sound, "in": gloss, "dic": dictionary,
            "isin": 1, "totstroke": stroke, "stroke": 0, "rnum": 1}


def page(rows, stroke=13, count=None, number=1):
    count = len(rows) if count is None else count
    return {"errno": 0, "ext": False, "pgmode": True, "ksnd": "", "resultcount": count,
            "totstroke": stroke, "pgno": number, "pgsize": hanja.PAGE_SIZE,
            "pglast": max(1, (count + hanja.PAGE_SIZE - 1) // hanja.PAGE_SIZE), "resultlist": rows}


class NormalizationTests(unittest.TestCase):
    def test_duplicate_rows_preserve_provenance_and_multiple_readings(self):
        first = row("05f8b", "률,율", "률,율 : 법(률/율)")
        second = {**first, "rnum": 7}
        entries = hanja.normalize([first, second], "fixture")
        self.assertEqual(len(entries), 1)
        entry = entries[0]
        self.assertEqual(entry["allowed_readings"], ["률", "율"])
        self.assertEqual(entry["gloss_candidates"], {"률": ["법"], "율": ["법"]})
        self.assertEqual(len(entry["evidence"]), 2)
        self.assertEqual(entry["quarantine_reasons"], [])
        self.assertFalse(entry["recommendation_ready"])

    def test_general_dictionary_never_adds_allowed_reading(self):
        entry = hanja.normalize([row()], "fixture")[0]
        self.assertEqual(entry["allowed_readings"], ["서"])
        self.assertEqual(entry["general_dictionary_raw"], "단")
        self.assertNotIn("단", entry["gloss_candidates"])

    def test_live_court_comma_glosses_preserve_reading_specific_meanings(self):
        entry = hanja.normalize([row("06835", "렬,례,예",
                                     "렬,례,예 : 작은도토리(렬) 산밤나무(례,예)")], "official")[0]
        self.assertEqual(entry["gloss_candidates"], {"렬": ["작은도토리"], "례": ["산밤나무"], "예": ["산밤나무"]})
        self.assertEqual(entry["quarantine_reasons"], [])

    def test_dedicated_codes_are_not_unicode_characters(self):
        entries = hanja.normalize([row("a0111", "가", "가"), row("f3474", "기", "기")], "fixture")
        for entry in entries:
            self.assertIsNone(entry["character"])
            self.assertIn("dedicated_or_private_code", entry["quarantine_reasons"])

    def test_supplementary_character_and_empty_reading(self):
        entry = hanja.normalize([row("25874", "", "", "계")], "fixture")[0]
        self.assertEqual(ord(entry["character"]), 0x25874)
        self.assertEqual(entry["allowed_readings"], [])
        self.assertIn("missing_allowed_reading", entry["quarantine_reasons"])

    def test_ambiguous_gloss_remains_quarantined(self):
        for text in ("서", "서: 상서(단)", "서: 상서(서) 해석 불명", "상서로움"):
            with self.subTest(text=text):
                entry = hanja.normalize([row(gloss=text)], "fixture")[0]
                self.assertTrue(entry["quarantine_reasons"])
                self.assertFalse(entry["recommendation_ready"])

    def test_conflict_is_retained_and_blocks_promotion(self):
        entries = hanja.normalize([row(), row(sound="단", gloss="단: 상서(단)")], "fixture")
        self.assertIn("conflicting_source_rows", entries[0]["quarantine_reasons"])
        self.assertEqual(len(entries[0]["evidence"]), 2)

    def test_invalid_code_type_and_reading_rejected(self):
        for bad in ({**row(), "cd": "../../bad"}, {**row(), "type": "A"}, row(sound="서윤")):
            with self.subTest(bad=bad), self.assertRaises(ValueError):
                hanja.normalize([bad], "fixture")

    def test_reconcile_separates_absence_from_disallowance(self):
        old = hanja.normalize([row(), row("06f64", "윤", "윤: 윤택할(윤)")], "upstream")
        new = hanja.normalize([row(gloss="서: 상서로울(서)"), row("04f73", "가", "가: 아름다울(가)")], "official")
        entries, diff = hanja.reconcile(old, new)
        by_code = {e["court_code"]: e for e in entries}
        self.assertEqual(by_code["06f64"]["eligibility_status"], "not_seen_in_stroke_index")
        self.assertEqual(by_code["0745e"]["eligibility_status"], "official_listed")
        self.assertEqual(len(by_code["0745e"]["evidence"]), 2)
        self.assertEqual({d["kind"] for d in diff}, {"changed", "newly_observed", "not_seen_in_stroke_index"})
        self.assertTrue(all(not e["recommendation_ready"] for e in entries))


class CollectionTests(unittest.TestCase):
    def test_index_and_page_reject_truncation_wrong_filters_and_duplicate_rows(self):
        with self.assertRaises(ValueError):
            hanja.index_strokes([{"totstroke": "1"}, {"totstroke": "1"}])
        for response in (page([row()], count=2), {**page([row()]), "ext": True},
                         {**page([row()]), "ksnd": "서"}, page([row(), row()]),
                         page([{**row(), "isin": 0}]), {**page([row()]), "pglast": 2}):
            with self.subTest(response=response), self.assertRaises(ValueError):
                hanja.validate_page(response, 13, 1)

    def test_redirect_is_rejected(self):
        with self.assertRaises(ValueError):
            hanja.NoRedirect().redirect_request(None, None, 302, "", {}, "https://example.com/")

    def make_snapshot(self, folder, fail_stroke=None):
        fixtures = {"index": [{"totstroke": "1"}, {"totstroke": "2"}]}
        def get(client, query, refresh=False):
            if query["mode"] == "listTotstroke":
                payload = fixtures["index"]
            else:
                stroke = int(query["totstroke"])
                if stroke == fail_stroke:
                    raise ValueError("Fixture failure")
                # Empty first interval must not skip the following interval.
                payload = page([] if stroke == 1 else [row(stroke=2)], stroke=stroke)
            raw = hanja.encode(payload)
            envelope = {"endpoint": hanja.ENDPOINT, "query": query, "fetched_at": hanja.now(),
                        "response_sha256": hanja.sha(raw), "response_text": raw.decode()}
            name = hanja.sha(hanja.urlencode(sorted(query.items())).encode()) + ".json"
            path = client.cache / name
            hanja.atomic_write(path, hanja.encode(envelope))
            return hanja.load_envelope(path, query)
        with patch.object(hanja.CourtClient, "get", get):
            hanja.collect(folder, 20)

    def test_full_index_empty_interval_and_evidence_hashes(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_snapshot(tmp)
            rows, manifest = hanja.snapshot_rows(tmp)
            self.assertEqual(len(rows), 1)
            self.assertEqual(manifest["strokes"], [1, 2])
            self.assertFalse(manifest["legal_inventory_complete"])
            reference = manifest["requests"][-1]
            target = Path(tmp) / reference["cache_file"]
            target.write_text(target.read_text() + " ")
            with self.assertRaisesRegex(ValueError, "hash mismatch"):
                hanja.snapshot_rows(tmp)

    def test_failed_collection_has_no_complete_snapshot(self):
        with tempfile.TemporaryDirectory() as tmp:
            with self.assertRaisesRegex(ValueError, "Fixture failure"):
                self.make_snapshot(tmp, fail_stroke=2)
            self.assertFalse((Path(tmp) / "snapshot.json").exists())
            self.assertTrue(list(Path(tmp).glob("*.json")))

    def test_manifest_cannot_omit_required_page(self):
        with tempfile.TemporaryDirectory() as tmp:
            self.make_snapshot(tmp)
            path = Path(tmp) / "snapshot.json"
            manifest = json.loads(path.read_text())
            manifest["requests"].pop()
            path.write_bytes(hanja.encode(manifest))
            with self.assertRaisesRegex(ValueError, "Missing stroke page"):
                hanja.snapshot_rows(tmp)

    def test_input_hash_checked_before_output_created(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "input.json"
            output = Path(tmp) / "output"
            source.write_text("[]")
            with self.assertRaisesRegex(ValueError, "pinned hash"):
                hanja.build(source, output)
            self.assertFalse(output.exists())

    def test_existing_output_and_symlink_not_overwritten(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "source"
            target = Path(tmp) / "target"
            target.write_text("preserved")
            path.symlink_to(target)
            with self.assertRaises(ValueError):
                hanja.atomic_write(path, b"bad")
            self.assertEqual(target.read_text(), "preserved")

    def test_network_failure_respects_request_budget_and_never_writes_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            client = hanja.CourtClient(tmp, max_requests=1)
            with patch.object(client.opener, "open", side_effect=hanja.URLError("offline")) as request:
                with patch.object(hanja.time, "sleep"), self.assertRaisesRegex(ValueError, "Request limit"):
                    client.get(hanja.index_query())
            self.assertEqual(request.call_count, 1)
            self.assertEqual(list(Path(tmp).iterdir()), [])

    def test_build_preserves_input_and_existing_output(self):
        with tempfile.TemporaryDirectory() as tmp:
            source = Path(tmp) / "input.json"
            original = hanja.encode([row()])
            source.write_bytes(original)
            output = Path(tmp) / "output"
            with patch.object(hanja, "SOURCE_SHA", hanja.sha(original)):
                hanja.build(source, output)
                manifest = json.loads((output / "manifest.json").read_text())
                self.assertTrue(manifest["complete"])
                self.assertFalse(manifest["catalog_ready"])
                for name, digest in manifest["files"].items():
                    self.assertEqual(hanja.sha((output / name).read_bytes()), digest)
                before = (output / "review.json").read_bytes()
                with self.assertRaises(FileExistsError):
                    hanja.build(source, output)
                self.assertEqual((output / "review.json").read_bytes(), before)
                self.assertEqual(source.read_bytes(), original)


if __name__ == "__main__":
    unittest.main()
