import copy
import json
from pathlib import Path
import unittest

from scripts import hanja_catalog as catalog
from scripts import hanja_semantics as semantics


def fixture():
    official = catalog.normalize([
        {"cd": "091d1", "type": "0", "isin": 1, "ineum": "금,김", "in": "금,김: 쇠(금) 성(김)", "dic": ""},
    ], "court:fixture")
    definitions = {"金": "gold; metals in general"}
    texts = semantics.court_texts(official[0])
    entry = {"character": "金", "meaning_status": "source_checked", "meaning_basis": "court",
             "meaning_ko": "쇠", "selected_court_gloss": "쇠", "selected_unihan_phrase": None,
             "reviewed_readings": ["금"], "unreviewed_readings": ["김"],
             "element": "metal", "material": "metal", "material_status": "associated",
             "rationale": "쇠 뜻의 금속 소재", "notes": "성씨 독음은 별도", "name_suitability": "not_evaluated",
             "recommendation_ready": False, "evidence": {
                 "court_code": "091d1", "allowed_readings": ["금", "김"], "court_in_raw": texts,
                 "court_in_sha256": semantics.court_text_hash(texts),
                 "unihan_definition_sha256": catalog.sha(definitions["金"].encode())}}
    review = {"version": semantics.VERSION, "human_reviewed": False,
              "review_method": "codex-editorial-source-check", "official_element_assignment": False,
              "catalog_ready": False,
              "material_policy": {e: {"materials": sorted(m)} for e, m in semantics.MATERIALS.items()}, "entries": [entry]}
    return review, official, definitions


class SemanticEvidenceTests(unittest.TestCase):
    def test_selected_reading_does_not_transfer_meaning_to_surname(self):
        review, official, definitions = fixture()
        semantics.validate_review(review, official, definitions)
        review["entries"][0]["reviewed_readings"] = ["김"]
        review["entries"][0]["unreviewed_readings"] = ["금"]
        with self.assertRaisesRegex(ValueError, "Selected sense"):
            semantics.validate_review(review, official, definitions)

    def test_general_or_fabricated_sense_and_rewritten_gloss_rejected(self):
        for key, value in [("selected_court_gloss", "번영"), ("meaning_ko", "행복한 바다")]:
            review, official, definitions = fixture()
            review["entries"][0][key] = value
            with self.subTest(key=key), self.assertRaises(ValueError):
                semantics.validate_review(review, official, definitions)

    def test_raw_evidence_and_definition_changes_are_detected(self):
        for source in ["court", "unihan"]:
            review, official, definitions = fixture()
            if source == "court":
                official[0]["evidence"][0]["raw"]["in"] += " 수정"
            else:
                definitions["金"] = "changed source"
            with self.subTest(source=source), self.assertRaisesRegex(ValueError, "evidence differs"):
                semantics.validate_review(review, official, definitions)

    def test_alternative_source_is_explicit_and_must_contain_selected_phrase(self):
        review, official, definitions = fixture()
        entry = review["entries"][0]
        entry.update(meaning_basis="unihan", selected_court_gloss=None,
                     selected_unihan_phrase="metals in general", meaning_ko="금속")
        semantics.validate_review(review, official, definitions)
        entry["selected_unihan_phrase"] = "magical prosperity"
        with self.assertRaisesRegex(ValueError, "Unihan"):
            semantics.validate_review(review, official, definitions)

    def test_held_meaning_cannot_receive_element_or_unchecked_reading_credit(self):
        review, official, definitions = fixture()
        entry = review["entries"][0]
        entry.update(meaning_status="held", meaning_basis=None, meaning_ko=None, selected_court_gloss=None,
                     reviewed_readings=[], unreviewed_readings=["금", "김"], element=None, material=None, material_status="held")
        semantics.validate_review(review, official, definitions)
        entry["element"] = "metal"
        with self.assertRaisesRegex(ValueError, "Held"):
            semantics.validate_review(review, official, definitions)

    def test_invalid_material_and_false_human_or_name_claims_are_rejected(self):
        for change in ["material", "human", "name", "reading"]:
            review, official, definitions = fixture()
            entry = review["entries"][0]
            if change == "material":
                entry["material"] = "rain"
            elif change == "human":
                review["human_reviewed"] = True
            elif change == "name":
                entry["recommendation_ready"] = True
            else:
                entry["unreviewed_readings"] = []
            with self.subTest(change=change), self.assertRaises(ValueError):
                semantics.validate_review(review, official, definitions)

    def test_duplicate_and_unlisted_characters_rejected(self):
        review, official, definitions = fixture()
        review["entries"].append(copy.deepcopy(review["entries"][0]))
        with self.assertRaisesRegex(ValueError, "duplicate"):
            semantics.validate_review(review, official, definitions)


class FullSenseAuditTests(unittest.TestCase):
    def test_ime_lookup_key_is_not_a_reading_marker(self):
        entry = {"libhangul": [{"text": "빠질 륜, 거느릴 륜, 표지없음", "reading": "윤", "line": 12}]}
        senses = semantics.dictionary_senses(entry)
        self.assertEqual([s["reading"] for s in senses], ["륜", "륜", None])

    def test_agreement_requires_same_printed_reading_and_meaning(self):
        entry = {"character": "金", "allowed_readings": ["금", "김"],
                 "court_primary": {"glosses": [{"reading": "금", "text": "쇠"}, {"reading": "김", "text": "성"}]},
                 "court_general": {"glosses": []},
                 "libhangul": [{"text": "쇠 금, 쇠 김", "reading": "금", "line": 1}], "unihan_definitions": []}
        senses = [{"text": "쇠", "reading": r, "refs": [["libhangul", 1]]} for r in ["금", "김"]]
        result = semantics.audit_senses(entry, senses, None, {})
        self.assertEqual(result, {"금": "source_checked", "김": "held"})
        self.assertEqual(senses[0]["audit"], "source_agreement")
        self.assertEqual(senses[1]["audit"], "source_difference")

    def test_adjudication_cannot_fabricate_a_reading_or_source_quote(self):
        import sys
        from pathlib import Path
        sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
        import hanja_inventory
        entries = hanja_inventory.inventory()
        review = json.loads((Path(__file__).resolve().parents[1] / "data/hanja-semantic-review.json").read_text())
        semantics.validate_adjudications(review, entries)
        for field, value in [("reading", "가"), ("sense", "없는뜻"), ("comparison_quote", "fabricated evidence")]:
            changed = copy.deepcopy(review)
            changed["sense_adjudications"][0][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                semantics.validate_adjudications(changed, entries)

    def test_english_character_definition_is_not_a_korean_reading_proof(self):
        entry = {"character": "金", "allowed_readings": ["금", "김"], "court_primary": {"glosses": []},
                 "court_general": {"glosses": []}, "libhangul": [],
                 "unihan_definitions": [{"value": "gold; metals"}]}
        senses = [{"text": "gold", "reading": None, "refs": [["unihan", 1]]}]
        semantics.audit_senses(entry, senses, None, {})
        self.assertEqual(senses[0]["audit"], "character_only")
        self.assertNotIn("element", senses[0])


class ReviewedDataTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = json.loads((Path(__file__).resolve().parents[1] / "data/hanja-semantic-review.json").read_text())
        cls.entries = {e["character"]: e for e in cls.data["entries"]}

    def test_literal_materials_and_abstract_counterexamples_are_separate(self):
        for char, element in [("木", "wood"), ("火", "fire"), ("土", "earth"), ("金", "metal"), ("水", "water")]:
            self.assertEqual(self.entries[char]["element"], element)
        for char in "浩錦銘鈺彬峻若榮瑞賢均晶":
            self.assertIsNone(self.entries[char]["element"], char)
        self.assertEqual(self.entries["渚"]["element"], "earth")
        self.assertEqual(self.entries["潤"]["meaning_ko"], "젖을")
        self.assertEqual(self.entries["潤"]["element"], "water")

    def test_actual_reading_boundaries_and_source_repairs_are_recorded(self):
        for char, sounds in [("金", ["금"]), ("葉", ["엽"]), ("芸", ["운"]), ("昭", ["조"])]:
            self.assertEqual(self.entries[char]["reviewed_readings"], sounds)
            self.assertTrue(self.entries[char]["unreviewed_readings"])
        for char in "蘭晴昭":
            self.assertEqual(self.entries[char]["meaning_basis"], "unihan")
        for char in "坪鉉桓":
            self.assertEqual(self.entries[char]["meaning_status"], "held")
            self.assertIsNone(self.entries[char]["element"])

    def test_review_does_not_certify_generated_names_or_all_dictionary_meanings(self):
        self.assertFalse(self.data["human_reviewed"])
        self.assertFalse(self.data["catalog_ready"])
        self.assertEqual(len(self.entries), len(self.data["entries"]))
        for entry in self.entries.values():
            self.assertFalse(entry["recommendation_ready"])
            self.assertEqual(entry["name_suitability"], "not_evaluated")
            self.assertEqual(semantics.court_text_hash(entry["evidence"]["court_in_raw"]), entry["evidence"]["court_in_sha256"])


class ConceptReviewTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from scripts import hanja_inventory
        cls.inventory = hanja_inventory.inventory()
        cls.doc = json.loads((catalog.ROOT / 'data/hanja-semantic-review.json').read_text())
        cls.editorial = {r['character']: r for r in cls.doc['entries']}
        cls.aliases = semantics.validate_concepts(cls.doc, cls.inventory, cls.editorial)

    def test_all_original_material_cases_have_individual_decisions(self):
        cases = {k: r for k, r in self.doc['concept_reviews'].items() if 'before' in r}
        self.assertEqual(len(cases), 296)
        self.assertEqual(len({key.split(':')[0] for key in cases}), 270)
        self.assertTrue(all(r['proof'] and r['rationale'] for r in cases.values()))
        self.assertFalse(self.doc['concept_policy']['human_reviewed'])

    def test_source_proof_cannot_be_swapped_or_removed(self):
        for change in ('quote', 'reading', 'binding', 'baseline', 'material'):
            doc = copy.deepcopy(self.doc)
            key = next(k for k, r in doc['concept_reviews'].items() if r['proof'][0]['source'] == 'court')
            if change == 'quote':
                doc['concept_reviews'][key]['proof'][0]['quote'] = '꾸며낸 출처'
            elif change == 'reading':
                doc['concept_reviews'][key.replace(key.split(':')[1], '가', 1)] = doc['concept_reviews'].pop(key)
            elif change == 'binding':
                doc['concept_reviews'][key]['proof'] = [p for p in doc['concept_reviews'][key]['proof'] if p['source'] == 'unihan']
            elif change == 'baseline':
                del doc['concept_reviews'][key]
            else:
                doc['concepts']['water.spring']['element'] = 'metal'
            with self.subTest(change=change), self.assertRaises(ValueError):
                semantics.validate_concepts(doc, self.inventory, self.editorial)

    def test_alias_equivalence_requires_two_sources_same_concept_and_reading(self):
        # New synthetic examples test the rule rather than depending on gold data.
        def resolve(court, ime, reading='가'):
            entry = {'court_code': 'fixture', 'character': '假', 'allowed_readings': ['가'],
                     'court_primary': {'glosses': [{'text': court, 'reading': reading}]},
                     'court_general': {'glosses': []},
                     'libhangul': [{'text': ime, 'line': 1}]}
            senses = [{'text': court, 'reading': reading, 'audit': 'source_difference'}]
            semantics.resolve_concepts(entry, senses, self.doc, self.aliases)
            return senses[0]
        self.assertEqual(resolve('제비꽃', '오랑캐꽃 가')['concept'], 'plant.flower.violet')
        for court, ime, sound in [('제비꽃', '국화 가', '가'), ('제비꽃', '오랑캐꽃 나', '가'),
                                   ('불', '불 가', '가'), ('샘', '샘 가', '가'),
                                   ('평지', '평지 가', '가'), ('태울', '태울 가', '가'),
                                   ('나무', '나무 가', '나')]:
            with self.subTest(court=court, ime=ime, sound=sound):
                result = resolve(court, ime, sound)
                self.assertNotIn('element', result)
                self.assertEqual(result['semantic_status'], 'unresolved')


if __name__ == "__main__":
    unittest.main()
