"""Offline checks for security tool invocation; no scanner or provider is run."""

import importlib.util
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

SPEC = importlib.util.spec_from_file_location("security_tool", Path(__file__).resolve().parents[1] / "scripts/security_tool.py")
tool = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(tool)


class SecurityToolTests(unittest.TestCase):
    def invoke(self, name, args):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        binary = Path(temporary.name) / "scanner"
        binary.touch()
        with patch.object(tool, "TOOLS", {name: binary}), patch.object(sys, "argv", ["security_tool.py", name, *args]), patch.object(tool.tempfile, "gettempdir", return_value=temporary.name), patch.object(tool.subprocess, "run") as run:
            run.return_value.returncode = 0
            self.assertEqual(tool.main(), 0)
            return run.call_args

    def test_static_scan_does_not_inherit_credentials(self):
        with patch.dict(os.environ, {"TYPESAFE_API_KEY": "fake-jev", "AWS_SECRET_ACCESS_KEY": "fake-aws", "OPENAI_API_KEY": "fake-openai"}):
            call = self.invoke("skillspector", ["scan", ".agents/skills", "--recursive"])
        self.assertIn("--no-llm", call.args[0])
        self.assertNotIn("TYPESAFE_API_KEY", call.kwargs["env"])
        self.assertNotIn("AWS_SECRET_ACCESS_KEY", call.kwargs["env"])
        self.assertNotIn("OPENAI_API_KEY", call.kwargs["env"])

    def test_osv_receives_literal_arguments_and_propagates_exit(self):
        call = self.invoke("osv-scanner", ["scan", "source", "folder with spaces"])
        self.assertEqual(call.args[0][-1], "folder with spaces")
        self.assertNotIn("--no-llm", call.args[0])

    def test_codex_receives_only_relevant_authentication_environment(self):
        with patch.dict(os.environ, {"TYPESAFE_API_KEY": "fake-jev", "OPENAI_API_KEY": "fake-openai"}):
            call = self.invoke("codex-security", ["--version"])
        self.assertEqual(call.kwargs["env"]["OPENAI_API_KEY"], "fake-openai")
        self.assertNotIn("TYPESAFE_API_KEY", call.kwargs["env"])
        self.assertFalse(Path(call.kwargs["env"]["CODEX_SECURITY_STATE_DIR"]).is_relative_to(tool.ROOT))

    def test_scanner_failure_is_not_reported_as_success(self):
        with tempfile.TemporaryDirectory() as tmp:
            binary = Path(tmp) / "scanner"
            binary.touch()
            with patch.object(tool, "TOOLS", {"osv-scanner": binary}), patch.object(sys, "argv", ["security_tool.py", "osv-scanner", "scan", "source"]), patch.object(tool.subprocess, "run") as run:
                run.return_value.returncode = 127
                self.assertEqual(tool.main(), 127)


if __name__ == "__main__":
    unittest.main()
