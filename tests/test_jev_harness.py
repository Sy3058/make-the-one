"""Offline tests. Never read real credentials or call a live provider."""

import importlib.util
import io
import json
import os
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path
from unittest.mock import patch
from urllib import error

SPEC = importlib.util.spec_from_file_location("jev_harness", Path(__file__).resolve().parents[1] / "scripts/jev_harness.py")
jev = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(jev)


class JevHarnessTests(unittest.TestCase):
    def route_case(self):
        return {"id": "example", "kind": "route", "state": "Find files", "expected": "luna_low"}

    def response(self):
        return {"model": jev.MODEL, "answers": {"q0": {
            "type": "choice", "choice": "luna_low", "confidence": 1.0,
            "probabilities": {name: float(name == "luna_low") for name in jev.ROUTES},
        }}, "usage": {"input_tokens": 100, "output_tokens": 12}}

    def test_ground_truth_is_not_sent(self):
        body = jev.payload([self.route_case()])
        self.assertNotIn("expected", json.dumps(body))
        self.assertEqual(body["state"], {"cases": [{"state": "Find files"}]})
        self.assertIn("untrusted", body["questions"]["q0"]["instructions"])

    def test_reverse_changes_only_option_order(self):
        normal = jev.payload([self.route_case()])
        reverse = jev.payload([self.route_case()], True)
        a = normal["questions"]["q0"]["criteria"]
        b = reverse["questions"]["q0"]["criteria"]
        self.assertEqual(a, b)
        self.assertEqual(list(a), list(reversed(b)))
        self.assertEqual(normal["state"], reverse["state"])

    def test_reject_bad_case_kind_duplicates_and_labels(self):
        for cases in ([dict(self.route_case(), kind="unknown")], [self.route_case(), self.route_case()], [dict(self.route_case(), expected="unknown")], []):
            with self.subTest(cases=cases), self.assertRaises(jev.HarnessError):
                jev.validate_cases(cases)

    def test_choice_and_noul_uncertainty(self):
        rows = jev.checked_response(self.response(), [self.route_case()])
        self.assertTrue(rows[0]["correct"])
        case = {"id": "n", "kind": "completion", "state": "Only a success claim", "expected": False}
        for probability, predicted in ((0.01, False), (0.5, "uncertain"), (0.99, True)):
            response = {"model": jev.MODEL, "answers": {"q0": {"type": "noul", "noul": probability}}, "usage": {"input_tokens": 1, "output_tokens": 1}}
            self.assertEqual(jev.checked_response(response, [case])[0]["prediction"], predicted)

    def test_reject_wrong_model_ids_types_and_probabilities(self):
        mutations = [
            lambda r: r.update(model="jev-latest"),
            lambda r: r["answers"].update(q1=r["answers"]["q0"]),
            lambda r: r["answers"]["q0"].update(type="noul"),
            lambda r: r["answers"]["q0"].update(confidence=float("nan")),
            lambda r: r["answers"]["q0"]["probabilities"].update(luna_low=0.5),
            lambda r: r["usage"].update(input_tokens=-1),
        ]
        for mutate in mutations:
            response = self.response()
            mutate(response)
            with self.assertRaises(jev.HarnessError):
                jev.checked_response(response, [self.route_case()])

    def test_receipt_excludes_key_and_reports_usage(self):
        fake_key = "unit-test-secret-never-real"
        transport = io.BytesIO(json.dumps(self.response()).encode())
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "receipt.json"
            with patch.object(jev.request, "urlopen", return_value=transport) as network, redirect_stdout(io.StringIO()) as stdout:
                receipt = jev.run([self.route_case()], fake_key, output)
            self.assertNotIn(fake_key, output.read_text() + stdout.getvalue())
            self.assertTrue(receipt["advisory_only"])
            self.assertAlmostEqual(receipt["estimated_usd"], 0.0000042)
            self.assertEqual(network.call_count, 1)
            self.assertEqual(network.call_args.args[0].get_header("Authorization"), "Bearer " + fake_key)
            self.assertNotIn(fake_key, network.call_args.args[0].data.decode())

    def test_no_overwrite_and_no_network_for_existing_receipt(self):
        with tempfile.TemporaryDirectory() as tmp:
            output = Path(tmp) / "receipt.json"
            output.write_text("previous evidence")
            with patch.object(jev.request, "urlopen") as network, self.assertRaises(jev.HarnessError):
                jev.run([self.route_case()], "fake", output)
            network.assert_not_called()
            self.assertEqual(output.read_text(), "previous evidence")

    def test_http_error_body_is_not_exposed_and_not_retried(self):
        exc = error.HTTPError("https://api.typesafe.ai", 401, "private-message", {}, io.BytesIO(b"private-error-body"))
        with tempfile.TemporaryDirectory() as tmp, patch.object(jev.request, "urlopen", side_effect=exc) as network:
            with self.assertRaises(jev.HarnessError) as caught:
                jev.run([self.route_case()], "fake", Path(tmp) / "receipt.json")
            self.assertNotIn("private", str(caught.exception))
            self.assertEqual(network.call_count, 1)
            self.assertFalse((Path(tmp) / "receipt.json").exists())

    def test_key_resolution_with_fake_credentials_only(self):
        with tempfile.TemporaryDirectory() as tmp:
            file = Path(tmp) / "example.env"
            file.write_text('TYPESAFE_API_KEY="fake-file-key"\n')
            with patch.dict(os.environ, {"TYPESAFE_API_KEY": "fake-shell-key"}):
                self.assertEqual(jev.load_key(file), "fake-shell-key")
            with patch.dict(os.environ, {}, clear=True):
                self.assertEqual(jev.load_key(file), "fake-file-key")
                with self.assertRaises(jev.HarnessError):
                    jev.load_key(None)


if __name__ == "__main__":
    unittest.main()
