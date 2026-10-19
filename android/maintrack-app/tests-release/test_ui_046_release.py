"""Owner-approved 0.4.6 UI-only regression guards; no live services or secrets."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[3] / "ops/maintrack/scripts/verify-native-406-build.py"
spec = importlib.util.spec_from_file_location("release_406", SCRIPT)
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


class CleanUiReleaseTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.www = Path(self.tmp.name)
        (self.www / "index.html").write_text(
            '<html><script src="secure-assets/index-inline-1.js"></script>'
            '<script src="v6.js"></script></html>')
        (self.www / "v6-core.js").write_text(
            "toggle.id='v6Toggle'; toggle.onclick=()=>{}; "
            "document.body.classList.add('v6Drawer'); "
            "tabs.addEventListener('click',()=>{});")
        (self.www / "v6-core.css").write_text("body.v6On{color:inherit}")

    def test_only_approved_removed_elements_absent(self):
        self.assertTrue(release.ui_assertions(self.www))

    def test_pilot_overlay_is_blocked(self):
        with (self.www / "index.html").open("a") as f:
            f.write('<div aria-label="Pilot demo system">PILOT — بلاغات تجريبية فقط</div>')
        with self.assertRaisesRegex(ValueError, "PILOT_OVERLAY"):
            release.ui_assertions(self.www)

    def test_clickable_bottom_dock_is_blocked(self):
        with (self.www / "v6-core.js").open("a") as f:
            f.write("document.createElement('nav').id='v6Dock'")
        with self.assertRaisesRegex(ValueError, "BOTTOM_DOCK"):
            release.ui_assertions(self.www)

    def test_bottom_dock_reserved_space_is_blocked(self):
        with (self.www / "v6-core.css").open("a") as f:
            f.write("body.v6On{padding-bottom:calc(78px + env(safe-area-inset-bottom))}")
        with self.assertRaisesRegex(ValueError, "RESERVED_SPACE"):
            release.ui_assertions(self.www)

    def test_missing_sidebar_is_blocked(self):
        (self.www / "v6-core.js").write_text("document.body.className='v6On'")
        with self.assertRaisesRegex(ValueError, "SIDEBAR_REGRESSION"):
            release.ui_assertions(self.www)


if __name__ == "__main__":
    unittest.main()
