import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import hanja_inventory as inv


class GlossTest(unittest.TestCase):
    def test_bare_multiple_readings_are_missing_not_malformed(self):
        self.assertEqual(inv.parse_gloss("난,란", ["난", "란"])["status"], "no_meaning")

    def test_no_general_reading_becomes_legal(self):
        parsed = inv.parse_gloss("김: 성씨(김) 쇠(금)", ["김"])
        self.assertEqual([(g["reading"], g["court_allowed"]) for g in parsed["glosses"]],
                         [("김", True), ("금", False)])

    def test_double_parenthesis_repair_is_auditable(self):
        parsed = inv.parse_gloss("난,란: 난초((난/란)", ["난", "란"])
        self.assertEqual({g["text"] for g in parsed["glosses"]}, {"난초"})
        self.assertEqual(parsed["repairs"], ["duplicate_opening_before_reading"])
        self.assertEqual(parsed["residue"], "")

    def test_unmarked_meaning_is_not_bound_to_readings(self):
        parsed = inv.parse_gloss("린,인: 돌사이로흐르는 물소리", ["린", "인"])
        self.assertFalse(parsed["glosses"])
        self.assertEqual(parsed["status"], "residue")

    def test_variant_description_does_not_follow_target(self):
        parsed = inv.parse_gloss("룡,용: 龍의 약자", ["룡", "용"])
        self.assertFalse(parsed["glosses"])
        self.assertEqual(parsed["residue"], "龍의 약자")


class InventoryTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.entries = inv.inventory()
        cls.by_code = {e["court_code"]: e for e in cls.entries}

    def test_complete_court_inventory_and_no_auto_promotion(self):
        self.assertEqual(len(self.entries), 9495)
        self.assertEqual(len(self.by_code), 9495)
        self.assertEqual(sum(e["character"] is not None for e in self.entries), 9090)
        self.assertTrue(all(not e["recommendation_ready"] for e in self.entries))
        self.assertTrue(all(e["official_row_indices"] for e in self.entries))

    def test_private_codes_and_empty_reading_are_preserved(self):
        self.assertIsNone(self.by_code["a0111"]["character"])
        self.assertEqual(self.by_code["25874"]["allowed_readings"], [])
        self.assertIn("missing_court_allowed_reading", self.by_code["25874"]["issues"])

    def test_english_does_not_cover_missing_korean_reading(self):
        e = self.by_code["03483"]
        self.assertTrue(e["unihan_definitions"])
        self.assertFalse(e["korean_gloss_readings"])
        self.assertIn("missing_korean_gloss_for_some_allowed_readings", e["issues"])

    def test_missing_wiki_page_and_template_requests_are_not_meanings(self):
        e = self.by_code["04fbe"]  # only rfdef requests, not a definition
        self.assertTrue(e["wiktionary_references"])
        self.assertFalse(e["has_character_meaning_evidence"])
        self.assertTrue(any(r["missing"] for e in self.entries for r in e["wiktionary_references"]))

    def test_wiki_is_character_scoped_and_not_korean(self):
        e = self.by_code["2a664"]
        self.assertTrue(e["has_character_meaning_evidence"])
        self.assertFalse(e["korean_gloss_readings"])
        r = e["wiktionary_references"][0]
        self.assertEqual(r["revision"], 83800075)
        self.assertTrue(all(d["section"] in {"Chinese", "Translingual"} for d in r["definition_lines"]))

    def test_checked_in_output_is_exactly_reproducible(self):
        self.assertEqual((inv.DEFAULT / "catalog.json").read_bytes(), inv.compact(inv.render()))

    def test_source_tamper_and_path_traversal_rejected(self):
        bundle = json.loads((inv.DEFAULT / "sources.json").read_bytes())
        for bad_path in ("../escape.json", "/tmp/escape.json"):
            with self.subTest(bad_path=bad_path), tempfile.TemporaryDirectory() as tmp:
                edited = copy.deepcopy(bundle)
                edited["manifest"]["files"][0]["path"] = bad_path
                path = Path(tmp, "sources.json")
                path.write_bytes(inv.compact(edited))
                with self.assertRaisesRegex(ValueError, "evidence path"):
                    inv.load_sources(path)
        with tempfile.TemporaryDirectory() as tmp:
            edited = copy.deepcopy(bundle)
            edited["files"][edited["manifest"]["files"][0]["path"]] = "[]"
            path = Path(tmp, "sources.json")
            path.write_bytes(inv.compact(edited))
            with self.assertRaisesRegex(ValueError, "hash/size"):
                inv.load_sources(path)


class SearchTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = inv.Catalog()

    def test_character_and_code_lookup(self):
        self.assertEqual(self.catalog.search(character="金")[0]["code"], "091d1")
        self.assertEqual(self.catalog.search(code="091d1")[0]["character"], "金")
        self.assertEqual(self.catalog.search(character="없음"), [])

    def test_reading_and_meaning_must_belong_to_same_sense(self):
        self.assertEqual(self.catalog.search(reading="김", meaning="쇠"), [])
        self.assertTrue(self.catalog.search(character="金", reading="금", meaning="쇠"))
        self.assertEqual(self.catalog.search(character="金", reading="김", meaning="gold"), [])

    def test_element_does_not_transfer_to_other_reading_or_held_meaning(self):
        self.assertEqual(self.catalog.search(reading="김", element="metal"), [])
        for char in ("鉉", "桓"):
            for element in ("wood", "fire", "earth", "metal", "water"):
                self.assertEqual(self.catalog.search(character=char, element=element), [])

    def test_indexed_results_match_linear_search(self):
        for reading, term in [("윤", "물"), ("하", "여름"), ("김", "쇠"), (None, "water"), (None, "깨끗")]:
            expected = []
            for code, fact in self.catalog.entries.items():
                if reading and reading not in fact["readings"]:
                    continue
                if any(not g.get("reference_only") and (self.catalog.data["source_audit"]["sense_rules"][g["audit"]][0] == "source_checked" or g["semantic_status"] in {"reviewed", "rule_resolved"}) and (reading is None or g["reading"] == reading) and any(term in w for w in inv.words(g["text"] + " " + " ".join(self.catalog.data["concepts"].get(g.get("concept"), {}).get("aliases", []))))
                       for g in fact["meanings"]):
                    expected.append(code)
            actual = self.catalog.search(reading=reading, meaning=term, limit=100)
            self.assertEqual([r["code"] for r in actual], sorted(expected)[:100])

    def test_queries_never_read_sources_and_reuse_loaded_catalog(self):
        with patch.object(inv, "read_bytes", wraps=inv.read_bytes) as reader:
            catalog = inv.Catalog()
            for _ in range(5):
                catalog.search(reading="윤", meaning="물")
                catalog.search(element="wood")
            self.assertEqual(reader.call_count, 1)
            self.assertEqual(reader.call_args.args[0].name, "catalog.json")

    def test_duplicate_senses_keep_multiple_source_references(self):
        found = False
        for fact in self.catalog.entries.values():
            senses = [(g["reading"], g["text"]) for g in fact["meanings"]]
            self.assertEqual(len(senses), len(set(senses)))
            found |= any(len(g["refs"]) > 1 for g in fact["meanings"])
        self.assertTrue(found)

    def test_issue_index_retains_all_unresolved_characters(self):
        issue = "no_extracted_meaning_in_collected_dictionaries"
        self.assertEqual(len(self.catalog.index["issue"][issue]), 432)
        results = self.catalog.search(issue=issue, limit=100)
        self.assertTrue(all(issue in r["issues"] for r in results))

    def test_all_codes_readings_and_senses_have_explicit_audit_outcomes(self):
        rules = self.catalog.data["source_audit"]["sense_rules"]
        for fact in self.catalog.entries.values():
            self.assertIn(fact["review_status"], {"source_checked", "partial", "held"})
            self.assertEqual(set(fact["review"]), set(fact["readings"]))
            for sound, status in fact["review"].items():
                checked = any(g["reading"] == sound and rules[g["audit"]][0] == "source_checked" for g in fact["meanings"])
                self.assertEqual(status == "source_checked", checked)
            for sense in fact["meanings"]:
                self.assertIn(sense["audit"], rules)
                if rules[sense["audit"]][0] == "source_checked":
                    self.assertIsNotNone(fact["character"])
                    self.assertIn(sense["reading"], fact["readings"])
                if sense.get("element"):
                    self.assertIn(sense["semantic_status"], {"reviewed", "rule_resolved"})
                    concept = self.catalog.data["concepts"][sense["concept"]]
                    self.assertEqual((sense["element"], sense["material"]), (concept["element"], concept["material"]))

    def test_corrected_meanings_and_homographs_are_not_material_shortcuts(self):
        self.assertEqual(self.catalog.search(character="坪", meaning="돌"), [])
        self.assertTrue(self.catalog.search(character="坪", meaning="벌판", element="earth"))
        self.assertTrue(self.catalog.search(character="鉉", meaning="솥귀"))
        self.assertEqual(self.catalog.search(character="腺", element="water"), [])
        self.assertEqual(self.catalog.search(character="吹", element="fire"), [])
        self.assertTrue(self.catalog.search(character="昭", reading="소", meaning="밝을"))
        self.assertTrue(self.catalog.search(character="葉", reading="섭", meaning="성"))
        self.assertEqual(self.catalog.search(character="葉", reading="섭", meaning="잎"), [])

    def test_holds_are_queryable_without_being_default_name_senses(self):
        held = self.catalog.search(review_status="held", limit=100)
        self.assertTrue(held)
        self.assertTrue(all(f["review_status"] == "held" for f in held))
        self.assertTrue(any(r["character"] is None for r in self.catalog.search(code="a0111")))
        self.assertEqual(self.catalog.search(code="a0111", reading="가"), [])

    def test_query_bounds_and_empty_meaning(self):
        for params in ({"limit": 0}, {"limit": 101}, {"meaning": "a" * 161},
                       {"meaning": "a b c d e f g h i"}):
            with self.assertRaises(ValueError):
                self.catalog.search(**params)
        self.assertEqual(self.catalog.search(meaning=""), [])


class ConceptBenchmarkTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.catalog = inv.Catalog()

    def test_literal_meanings_do_not_transfer_to_homonyms_or_abstract_senses(self):
        # Expected decisions are independent of the synonym table implementation.
        cases = [
            ('火', '화', '불', 'fire'), ('吹', '취', '불', None),
            ('泉', '천', '샘', 'water'), ('腺', '선', '샘', None),
            ('金', '금', '쇠', 'metal'), ('金', '김', '성', None),
            ('葉', '엽', '잎', 'wood'), ('葉', '섭', '성', None),
            ('智', '지', '슬기로울', None), ('晴', '청', '맑은날씨', None),
            ('清', '청', '맑을', None), ('潤', '윤', '젖을', 'water'),
            ('藍', '람', '쪽', 'wood'), ('渚', '저', '사주', 'earth'),
            ('汀', '정', '물가', 'earth'), ('域', '역', '지경', None),
            ('鋒', '봉', '칼날', None), ('鉉', '현', '솥귀', None),
            ('鉛', '연', '납', 'metal'), ('錫', '석', '주석', 'metal'),
            ('鍾', '종', '술잔', None), ('鐘', '종', '쇠북', 'metal'),
        ]
        for char, reading, text, element in cases:
            with self.subTest(char=char, reading=reading, text=text):
                entry = self.catalog.search(character=char)[0]
                sense = next(g for g in entry['meanings'] if g['reading'] == reading and inv.re.sub(r'\s+', '', g['text']) == text)
                self.assertEqual(sense.get('element'), element)
        for char in ('鍾', '蘿', '澔', '沛', '滄', '煐', '蕓', '磺', '檍', '芷', '棠'):
            self.assertFalse(self.catalog.search(character=char, semantic_status='held', element='metal'))
            self.assertTrue(self.catalog.search(character=char, semantic_status='held'))
        self.assertEqual(self.catalog.search(character='蠟', element='metal'), [])
        self.assertEqual(self.catalog.search(character='註', element='metal'), [])
        self.assertEqual(self.catalog.search(character='潤', meaning='윤택', element='water'), [])

    def test_reviewed_synonyms_share_concept_and_search_terms(self):
        a = self.catalog.search(character='菫', reading='근', meaning='제비꽃')
        b = self.catalog.search(character='菫', reading='근', meaning='오랑캐꽃')
        self.assertTrue(a and b)
        self.assertEqual(a[0]['code'], b[0]['code'])
        found = self.catalog.search(concept='plant.flower.violet')
        self.assertIn('菫', {e['character'] for e in found})
        self.assertFalse(self.catalog.search(character='菫', concept='plant.flower.chrysanthemum'))

    def test_every_element_has_resolved_concept_and_each_review_is_consumed(self):
        consumed = set()
        for fact in self.catalog.entries.values():
            for sense in fact['meanings']:
                self.assertIn(sense['semantic_status'], {'reviewed', 'rule_resolved', 'held', 'unresolved'})
                if 'concept_review' in sense:
                    consumed.add(sense['concept_review'])
                if sense.get('element'):
                    self.assertIn(sense['reading'], fact['readings'])
                    self.assertIn(sense['semantic_status'], {'reviewed', 'rule_resolved'})
                    rule = self.catalog.data['concepts'][sense['concept']]
                    self.assertEqual((sense['element'], sense['material']), (rule['element'], rule['material']))
                if sense['semantic_status'] in {'held', 'unresolved'}:
                    self.assertNotIn('element', sense)
        self.assertEqual(consumed, set(self.catalog.data['concept_audit']['reviews']))


if __name__ == "__main__":
    unittest.main()
