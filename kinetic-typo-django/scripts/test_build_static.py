import hashlib
import re
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from build_static import PAGES  # noqa: E402

LINK_RE = re.compile(r'(?:href|src)="(/[^"]*)"')


class BuildStaticTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls._tmp = tempfile.TemporaryDirectory()
        cls.addClassCleanup(cls._tmp.cleanup)
        cls.out = Path(cls._tmp.name) / "dist"
        subprocess.run(
            [sys.executable, "scripts/build_static.py", "--out", str(cls.out)],
            cwd=ROOT,
            check=True,
            capture_output=True,
            text=True,
        )

    def test_all_pages_written(self):
        for rel in PAGES.values():
            html = (self.out / rel).read_text(encoding="utf-8")
            self.assertIn("<html", html)

    def test_static_copied_completely(self):
        src = sorted(p.relative_to(ROOT / "static") for p in (ROOT / "static").rglob("*") if p.is_file())
        dst = sorted(p.relative_to(self.out / "static") for p in (self.out / "static").rglob("*") if p.is_file())
        self.assertEqual(src, dst)

    def test_asset_version_is_content_hash(self):
        expected = hashlib.sha256((ROOT / "static/js/studio.js").read_bytes()).hexdigest()[:12]
        self.assertIn(
            f"/static/js/studio.js?v={expected}",
            (self.out / "pro/index.html").read_text(encoding="utf-8"),
        )

    def test_no_build_artifacts_leak(self):
        for rel in PAGES.values():
            html = (self.out / rel).read_text(encoding="utf-8")
            self.assertNotIn("testserver", html)
            self.assertNotIn("csrfmiddlewaretoken", html)

    def test_internal_links_resolve(self):
        checked = 0
        for rel in PAGES.values():
            html = (self.out / rel).read_text(encoding="utf-8")
            for link in LINK_RE.findall(html):
                path = link.split("#")[0].split("?")[0]
                target = self.out / path.lstrip("/")
                with self.subTest(page=rel, link=link):
                    self.assertTrue(
                        target.is_file() or (target / "index.html").is_file(),
                        f"{link} not found in output",
                    )
                checked += 1
        self.assertGreater(checked, 0)

    def test_headers_file(self):
        text = (self.out / "_headers").read_text(encoding="utf-8")
        self.assertIn("/static/fonts/*\n  ! Cache-Control\n  Cache-Control: public, max-age=604800", text)
        self.assertIn("X-Frame-Options: DENY", text)

    def test_404_page_written(self):
        self.assertTrue((self.out / "404.html").is_file())


if __name__ == "__main__":
    unittest.main()
