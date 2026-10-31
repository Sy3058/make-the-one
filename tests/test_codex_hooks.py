"""Regression checks for project tooling; run with Python's standard unittest."""

import json
import os
import subprocess
import tempfile
import unittest
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
HOOKS = Path(os.environ.get("CODEX_HOOKS_DIR", ROOT / ".codex/hooks"))


class CodexHooksTests(unittest.TestCase):
    def invoke(self, name, patch=None, cwd=None, raw=None):
        payload = {"tool_input": {"command": patch or ""}}
        if cwd:
            payload["cwd"] = str(cwd)
        result = subprocess.run(
            ["python3", "-B", str(HOOKS / name)],
            input=raw if raw is not None else json.dumps(payload),
            capture_output=True, text=True, cwd=cwd or ROOT, check=True,
        )
        output = json.loads(result.stdout) if result.stdout.strip() else {}
        return output, result.stderr

    def test_old_punctuation_can_be_removed_or_kept_in_context(self):
        for body in ("-old \u2014 title\n+new - title", " old \u2014 title\n+new text"):
            with self.subTest(body=body):
                output, errors = self.invoke("pre_patch.py", "*** Update File: PROJECT.md\n@@\n" + body)
                self.assertEqual(output, {})
                self.assertEqual(errors, "")

    def test_new_forbidden_punctuation_is_rejected(self):
        output, _ = self.invoke("pre_patch.py", "*** Add File: text.md\n+new \u2014 title")
        self.assertEqual(output["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_secret_source_destination_and_key_files_are_rejected(self):
        for path in (".env", "api/.env.production", ".env.example.local", "private.pem", "private.key", "keys/id_ed25519", ".aws/config", "secrets/token.txt"):
            for patch in (f"*** Add File: {path}\n+placeholder", f"*** Delete File: {path}", f"*** Update File: template.txt\n*** Move to: {path}\n@@\n-old\n+new"):
                with self.subTest(path=path, patch=patch):
                    output, _ = self.invoke("pre_patch.py", patch)
                    self.assertEqual(output["hookSpecificOutput"]["permissionDecision"], "deny")

    def test_example_templates_and_regular_moves_are_allowed(self):
        for path in (".env.example", "api/.env.sample", ".env.template", "src/app.py"):
            output, errors = self.invoke("pre_patch.py", f"*** Add File: {path}\n+placeholder")
            self.assertEqual(output, {})
            self.assertEqual(errors, "")
        output, _ = self.invoke("pre_patch.py", "*** Update File: old.py\n*** Move to: src/new.py\n@@\n-old\n+new")
        self.assertEqual(output, {})

    def test_malformed_payload_is_visible_without_exposing_content(self):
        for script in ("pre_patch.py", "post_patch.py"):
            output, errors = self.invoke(script, raw="private_payload_not_valid_json")
            self.assertEqual(output, {})
            self.assertIn("inspection failed", errors)
            self.assertNotIn("private_payload", errors)

    def test_post_checks_subdirectory_and_moved_destinations(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            cwd = root / "src"
            cwd.mkdir()
            (cwd / "new.py").write_text("value = datetime.now()\n")
            for patch in ("*** Add File: new.py\n+value = datetime.now()", "*** Update File: old.py\n*** Move to: new.py\n@@\n-old\n+new"):
                output, errors = self.invoke("post_patch.py", patch, cwd)
                self.assertEqual(errors, "")
                self.assertIn("src/new.py:1:", output["hookSpecificOutput"]["additionalContext"])
                self.assertNotIn("decision", output)
            (cwd / "new.py").write_text("value = datetime.now(timezone.utc)\n")
            output, _ = self.invoke("post_patch.py", "*** Update File: new.py\n@@\n-old\n+new", cwd)
            self.assertEqual(output, {})

    def test_post_skips_deleted_outside_and_secret_symlink_targets(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp) / "repo"
            root.mkdir()
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            outside = Path(tmp) / "private.py"
            outside.write_text("value = datetime.now()\n")
            (root / "link.py").symlink_to(outside)
            secret = root / "secrets"
            secret.mkdir()
            (secret / "data.py").write_text("value = datetime.now()\n")
            (root / "secret_link.py").symlink_to(secret / "data.py")
            for patch in ("*** Delete File: gone.py", "*** Update File: link.py", "*** Update File: secret_link.py", f"*** Update File: {outside}"):
                output, errors = self.invoke("post_patch.py", patch, root)
                self.assertEqual(output, {})
                self.assertEqual(errors, "")

    def test_post_reports_cors_and_browser_token_patterns(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            subprocess.run(["git", "init", "-q", str(root)], check=True)
            for name, content in (("app.py", 'allow_origins=["*"]\n'), ("App.svelte", 'localStorage.setItem("authToken", value);\n')):
                (root / name).write_text(content)
                output, errors = self.invoke("post_patch.py", f"*** Add File: {name}", root)
                self.assertEqual(errors, "")
                self.assertIn(name + ":1:", output["hookSpecificOutput"]["additionalContext"])

    def test_session_and_stop_hooks_emit_nonblocking_json(self):
        for name in ("session_start.py", "stop.py"):
            output, errors = self.invoke(name)
            self.assertIn("systemMessage", output)
            self.assertNotIn("decision", output)
            self.assertEqual(errors, "")

    def test_gitignore_keeps_tooling_and_examples_but_excludes_private_files(self):
        for name in (".env", "backend/.env.production", "secrets/data.json", "private.pem", ".aws/credentials", ".codex-log/events.json", "hook_outputs/output.txt"):
            result = subprocess.run(["git", "check-ignore", "-q", "--no-index", name], cwd=ROOT)
            self.assertEqual(result.returncode, 0, name)
        for name in (".env.example", "backend/.env.sample", ".env.template", ".codex/config.toml", ".agents/skills/fable-plan/SKILL.md"):
            result = subprocess.run(["git", "check-ignore", "-q", "--no-index", name], cwd=ROOT)
            self.assertEqual(result.returncode, 1, name)


if __name__ == "__main__":
    unittest.main()
