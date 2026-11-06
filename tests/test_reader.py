"""Build and exercise the real site at a GitHub Pages-style project URL."""

from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright


class ProjectPagesHandler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        return super().translate_path(path.removeprefix("/BlockDoc"))

    def log_message(self, *_args):
        pass


class ReaderTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        repository = Path(__file__).resolve().parents[1]
        cls.output = TemporaryDirectory(prefix="blockdoc-reader-")
        site = Path(cls.output.name)
        cls.server = ThreadingHTTPServer(("127.0.0.1", 0), partial(ProjectPagesHandler, directory=str(site)))
        cls.base = f"http://127.0.0.1:{cls.server.server_port}/BlockDoc/"
        result = subprocess.run(
            [sys.executable, "-m", "mkdocs", "build", "--strict", "--site-dir", str(site)],
            cwd=repository, env={**os.environ, "SITE_URL": cls.base}, capture_output=True, text=True,
        )
        if result.returncode:
            raise RuntimeError(result.stdout + result.stderr)
        cls.thread = Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch()

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join()
        cls.output.cleanup()

    def setUp(self):
        self.context = self.browser.new_context(viewport={"width": 1440, "height": 1100}, color_scheme="light")
        self.page = self.context.new_page()
        self.page.set_default_timeout(12000)
        self.errors = []
        self.page.on("pageerror", lambda error: self.errors.append(str(error)))

    def tearDown(self):
        self.context.close()
        self.assertEqual(self.errors, [])

    def open(self, path=""):
        self.page.goto(self.base + path, wait_until="networkidle")
        expect(self.page.locator(".reader-root")).to_have_attribute("data-reader-count", re.compile(r"\d+"))
        return self.page.locator(".reader-root")

    def test_turn_keyboard_and_shareable_reading_position(self):
        root = self.open()
        self.assertGreater(int(root.get_attribute("data-reader-count")), 2)
        self.page.get_by_role("button", name="Next page", exact=True).click()
        expect(root).to_have_attribute("data-reader-page", "3")
        self.assertIn("page=3", self.page.url)
        self.page.reload(wait_until="networkidle")
        expect(root).to_have_attribute("data-reader-page", "3")
        self.page.keyboard.press("ArrowLeft")
        expect(root).to_have_attribute("data-reader-page", "1")
        self.page.keyboard.press("End")
        expect(self.page.get_by_role("button", name="Next page", exact=True)).to_be_disabled()
        self.page.keyboard.press("Home")
        expect(root).to_have_attribute("data-reader-page", "1")

    def test_drag_corner_and_print_restore_the_reader(self):
        root = self.open()
        bounds = self.page.locator(".reader-stage").bounding_box()
        height = self.page.evaluate("document.documentElement.scrollHeight")
        self.page.mouse.move(bounds["x"] + bounds["width"] - 8, bounds["y"] + bounds["height"] - 12)
        self.page.wait_for_timeout(200)
        self.page.mouse.down()
        self.page.mouse.move(bounds["x"] + bounds["width"] * .75, bounds["y"] + bounds["height"] * .75, steps=12)
        expect(root).to_have_attribute("data-reader-state", "user_fold")
        self.assertEqual(self.page.evaluate("document.documentElement.scrollHeight"), height)
        self.page.mouse.move(bounds["x"] + bounds["width"] * .15, bounds["y"] + bounds["height"] * .85, steps=20)
        self.page.mouse.up()
        expect(root).to_have_attribute("data-reader-page", "3")
        self.page.evaluate("dispatchEvent(new Event('beforeprint'))")
        expect(self.page.locator(".reader-article")).to_be_visible()
        expect(self.page.locator(".reader-book")).to_be_hidden()
        self.page.evaluate("dispatchEvent(new Event('afterprint'))")
        expect(self.page.locator(".reader-stage")).to_be_visible()

    def test_long_paragraph_and_table_survive_real_pagination(self):
        words = " ".join(f"ore{index:04d}" for index in range(900))
        story = f'<p data-fixture="story"><strong>{words[:159]}</strong>{words[159:]}</p>'
        rows = "".join(f"<tr><td>Block {index}</td><td>{index}</td></tr>" for index in range(45))
        table = f'<table data-fixture="ledger"><thead><tr><th>Block</th><th>Count</th></tr></thead><tbody>{rows}</tbody></table>'
        self.page.route("**/BlockDoc/blocks/natural/stone/", lambda route: route.fulfill(
            response=(response := route.fetch()),
            body=response.text().replace("</article>", story + table + "</article>", 1),
        ))
        root = self.open("blocks/natural/stone/")
        self.assertGreater(int(root.get_attribute("data-reader-count")), 8)
        pieces = self.page.locator('.reader-leaf [data-fixture="story"]')
        self.assertGreater(pieces.count(), 1)
        actual = "".join(pieces.all_text_contents())
        self.assertEqual(re.sub(r"\s", "", actual), re.sub(r"\s", "", words))
        self.assertGreater(self.page.locator('.reader-leaf [data-fixture="story"] strong').count(), 0)
        tables = self.page.locator('.reader-leaf table[data-fixture="ledger"]')
        self.assertGreater(tables.count(), 1)
        self.assertEqual(tables.locator("tbody tr").count(), 45)
        self.assertEqual(tables.locator("thead").count(), tables.count())
        overflow = self.page.locator(".reader-leaf__body").evaluate_all(
            "nodes => nodes.filter(node => node.scrollHeight > node.clientHeight + 1).length"
        )
        self.assertEqual(overflow, 0)
        self.page.get_by_role("button", name="Read as article", exact=True).click()
        self.assertEqual(self.page.locator('[data-fixture="story"]').count(), 1)
        self.assertEqual(self.page.locator('[data-fixture="ledger"] tbody tr').count(), 45)

    def test_heading_tabs_details_and_code_copy(self):
        self.open("items/tools/pickaxes/#useful-enchantments")
        self.assertIn("#useful-enchantments", self.page.url)
        expect(self.page.locator('.reader-leaf[aria-hidden="false"] #useful-enchantments')).to_be_visible()
        self.open("mechanics/redstone/signal-strength/#edition-notes")
        self.page.locator('.reader-leaf[aria-hidden="false"] .tabbed-labels label').filter(has_text="Bedrock Edition").click()
        panel = self.page.locator(".reader-leaf .tabbed-block").filter(has_text="Verify piston behavior")
        expect(panel).to_be_visible()
        self.page.wait_for_timeout(300)  # Repagination must preserve the selected tab.
        expect(panel).to_be_visible()
        self.open("blocks/natural/stone/#uses")
        self.page.locator('.reader-leaf[aria-hidden="false"] summary').click()
        expect(self.page.locator(".reader-leaf details")).to_have_attribute("open", "")
        self.page.wait_for_timeout(300)
        expect(self.page.locator(".reader-leaf details")).to_have_attribute("open", "")
        self.page.add_init_script("Object.defineProperty(navigator, 'clipboard', {value: {writeText: async text => {window.copiedCode = text}}})")
        self.open("reference/#commands-for-a-test-world")
        self.page.locator('.reader-leaf[aria-hidden="false"] [data-md-type="copy"]').filter(visible=True).first.click()
        self.page.wait_for_function("window.copiedCode?.includes('/give @s minecraft:stone 64')")

    def test_instant_chapter_navigation_and_resize_release_old_renderers(self):
        self.page.add_init_script("""(() => {
          const request = window.requestAnimationFrame.bind(window);
          const cancel = window.cancelAnimationFrame.bind(window);
          window.readerFrames = new Set();
          window.documentToken = Math.random();
          window.requestAnimationFrame = callback => {
            const tracked = callback.toString().includes('readerStopped');
            const id = request(time => { window.readerFrames.delete(id); callback(time); });
            if (tracked) window.readerFrames.add(id);
            return id;
          };
          window.cancelAnimationFrame = id => { window.readerFrames.delete(id); cancel(id); };
        })()""")
        self.open()
        token = self.page.evaluate("window.documentToken")
        for _ in range(5):
            link = self.page.locator('.reader-chapters a[rel="next"]')
            href = link.get_attribute("href")
            link.click()
            self.page.wait_for_url(href)
            expect(self.page.locator(".reader-root")).to_have_attribute("data-reader-path", urlparse(href).path)
            expect(self.page.locator(".reader-root")).to_have_attribute("data-reader-count", re.compile(r"\d+"))
            self.assertEqual(self.page.evaluate("window.documentToken"), token)
            self.assertEqual(self.page.evaluate("window.readerFrames.size"), 1)
            self.assertEqual(self.page.locator(".stf__block").evaluate("node => getComputedStyle(node).position"), "absolute")
        self.page.set_viewport_size({"width": 900, "height": 800})
        self.page.wait_for_timeout(300)
        self.assertEqual(self.page.evaluate("window.readerFrames.size"), 1)
        self.page.get_by_role("button", name="Read as article", exact=True).click()
        self.assertEqual(self.page.evaluate("window.readerFrames.size"), 0)
        self.page.get_by_role("button", name="Open flipbook", exact=True).click()
        self.assertEqual(self.page.evaluate("window.readerFrames.size"), 1)

    def test_mobile_swipe_and_reduced_motion(self):
        for reduced in ["no-preference", "reduce"]:
            with self.subTest(reduced_motion=reduced):
                context = self.browser.new_context(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True, reduced_motion=reduced)
                page = context.new_page()
                page.goto(self.base, wait_until="networkidle")
                root = page.locator(".reader-root")
                expect(root).to_have_attribute("data-reader-page", "1")
                bounds = page.locator(".reader-stage").bounding_box()
                client = context.new_cdp_session(page)
                y = bounds["y"] + bounds["height"] * .25
                x = bounds["x"] + bounds["width"] * .8
                client.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": x, "y": y}]})
                for step in range(1, 7):
                    client.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": x - step * bounds["width"] * .1, "y": y}]})
                client.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
                expect(root).to_have_attribute("data-reader-page", "2")
                self.assertTrue(page.evaluate("document.documentElement.scrollWidth <= innerWidth"))
                context.close()

    def test_no_javascript_keeps_the_complete_static_article(self):
        context = self.browser.new_context(java_script_enabled=False)
        page = context.new_page()
        page.goto(self.base + "items/tools/pickaxes/", wait_until="networkidle")
        expect(page.locator("article h1")).to_contain_text("Pickaxes")
        expect(page.locator("article #useful-enchantments")).to_be_visible()
        self.assertEqual(page.locator(".reader-root").count(), 0)
        context.close()


if __name__ == "__main__":
    unittest.main()
