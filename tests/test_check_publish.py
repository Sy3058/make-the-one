"""Exercise publication checks against real temporary Git snapshots."""

import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[1] / "scripts/check_publish.py"


class PublishCheckTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.git("init", "-q")

    def git(self, *args):
        return subprocess.check_output(["git", *args], cwd=self.root)

    def stage(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
        self.git("add", "--", name)

    def run_check(self, *args):
        return subprocess.run(["python3", "-B", str(SCRIPT), *args], cwd=self.root, capture_output=True, text=True)

    def test_examples_and_regular_code_pass(self):
        self.stage(".env.example", "DATABASE_URL=postgres://" + "user:password@localhost/db\nMODEL_API_KEY=\n")
        self.stage("app.ts", "export const value = 1;\n")
        self.assertEqual(self.run_check().returncode, 0)

    def test_staged_secret_is_detected_even_when_worktree_is_cleaned(self):
        token = "ghp_" + "A" * 36
        self.stage("settings.txt", token)
        (self.root / "settings.txt").write_text("removed from working tree")
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("GitHub token", result.stdout)
        self.assertNotIn(token, result.stdout + result.stderr)

    def test_unstaged_content_is_not_substituted_for_index(self):
        self.stage("settings.txt", "public settings")
        (self.root / "settings.txt").write_text("sk-" + "A" * 40)
        self.assertEqual(self.run_check().returncode, 0)

    def test_private_paths_cannot_be_force_added(self):
        for name in (".env", "docs/private/PRD_SOURCES.md", "PROJECT.md", "reports/security/raw.json",
                     "experiments/jev/checks-live-v1.json", "node_modules/file.txt", "key.pem"):
            with self.subTest(name=name):
                self.stage(name, "private")
                self.assertEqual(self.run_check().returncode, 1)
                self.git("reset", "--", name)

    def test_drive_links_and_personal_paths_are_rejected(self):
        self.stage("notes.md", "https://" + "docs.google.com/document/d/" + "example-id/edit")
        self.assertIn("internal Drive link", self.run_check().stdout)
        self.stage("notes.md", "/home/" + "someone/private/file")
        self.assertIn("personal filesystem path", self.run_check().stdout)

    def test_credentials_in_examples_are_still_rejected(self):
        self.stage(".env.example", "DATABASE_URL=postgres://" + "prod:actual-secret@db/service")
        self.assertEqual(self.run_check().returncode, 1)
        self.stage(".env.example", "MODEL_API_KEY=" + "sk-" + "A" * 40)
        self.assertEqual(self.run_check().returncode, 1)

    def test_ref_checks_commit_tree_without_worktree_or_index(self):
        self.stage("app.ts", "public code")
        self.git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", "fixture")
        self.stage("app.ts", "ghp_" + "A" * 36)
        self.assertEqual(self.run_check("--ref", "HEAD").returncode, 0)
        self.assertEqual(self.run_check().returncode, 1)
        self.assertEqual(self.run_check("--ref", "does-not-exist").returncode, 2)

    def test_symlink_does_not_read_target(self):
        (self.root / "link").symlink_to("/nonexistent/private")
        self.git("add", "link")
        result = self.run_check()
        self.assertEqual(result.returncode, 1)
        self.assertIn("symlink", result.stdout)

    def test_key_formats_and_large_files_are_rejected_without_values(self):
        samples = ["-----BEGIN " + "PRIVATE KEY-----", "AKIA" + "A" * 16,
                   'api_key="' + "aB1_" * 8 + '"']
        for content in samples:
            self.stage("settings.txt", content)
            result = self.run_check()
            self.assertEqual(result.returncode, 1)
            self.assertNotIn(content, result.stdout + result.stderr)
        self.stage("settings.txt", "a" * 1_000_001)
        self.assertIn("1 MB", self.run_check().stdout)


if __name__ == "__main__":
    unittest.main()
