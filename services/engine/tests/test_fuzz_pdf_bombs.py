"""Fuzz findings on hostile PDFs.

1. A 635-byte PDF whose Form XObject draws itself twice (or a 2 kB PDF whose
   forms fan out 10 x 10 x ... eight levels deep) makes PDFium allocate
   without bound while it builds the page's text page. /v1/inspect and
   /v1/read both do that. Under a 2 GiB limit (the Vercel function) PDFium
   aborts the whole process (SIGABRT, exit 134); without a limit the kernel's
   OOM killer takes it past 9 GB.
2. A 1 MB PDF whose content stream inflates to 1 GB of spaces: PDFium
   inflates it whole when the page loads; the process aborts under 2 GiB.
3. A page tree with a cycle, or 5000 levels deep: len(doc) succeeds, then
   doc[i] raises PdfiumError("Failed to load page."), which nothing maps to a
   ReadError, so /v1/inspect and /v1/read answer 500.
4. A text-layer bomb: an 11 kB PDF whose single page draws 1.5 million
   two-letter words in a 2 pt font. pdf.words() walks every character in
   Python while holding pdf.LOCK: about 40 s and 2 GB for one page, and every
   other PDF request in the process waits for the lock (measured: an
   innocent 2-page /v1/inspect took 55 s behind it). Pages can share the
   content stream, so 300 such pages cost 3 hours. Expected: a cap on
   characters/words per page and per document (ReadError "too_large", or
   truncate and escalate).
5. No memory or time budget for a whole document: a 300-page fax TIFF is
   decoded in full before the first page is read (see DocumentBudget).

Expected: the engine refuses cleanly (ReadError "too_large"/"malformed")
within its caps and never takes the process down. PDFium cannot be told to
stop, so the realistic fix is to run PDFium work in a child process with
RLIMIT_AS, a CPU-time limit and a wall-clock deadline, and map its death to
ReadError("too_large")."""
import json
import os
import subprocess
import sys
import textwrap
import unittest
import zlib

from tests.fixtures import FOLDER
from tests.storage_server import StorageServer
from tests.support import token

ENGINE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
LIMIT = 2 << 30


def _build(objs: list[bytes]) -> bytes:
    out, offs = bytearray(b"%PDF-1.7\n"), []
    for n, body in enumerate(objs, 1):
        offs.append(len(out))
        out += b"%d 0 obj\n" % n + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % o for o in offs)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


def _stream(data: bytes, extra: bytes = b"") -> bytes:
    return b"<< /Length %d %s >>\nstream\n" % (len(data), extra) + data + b"\nendstream"


CATALOG = b"<< /Type /Catalog /Pages 2 0 R >>"
PAGES = b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>"

SELF_FORM = _build([CATALOG, PAGES,
    b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /XObject << /X 5 0 R >> >> /Contents 4 0 R >>",
    _stream(b"/X Do"),
    _stream(b"/X Do /X Do", b"/Type /XObject /Subtype /Form /BBox [0 0 1 1] /Resources << /XObject << /X 5 0 R >> >>")])

def _deflated_spaces(mib: int) -> bytes:
    """`mib` MiB of spaces as one zlib stream, built from a single compressed
    MiB repeated (each block ends at a full flush, so it stands alone): about
    1 MB for 1 GiB, in milliseconds and without the gigabyte in memory."""
    chunk = b" " * (1 << 20)
    co = zlib.compressobj(9)
    head = co.compress(chunk) + co.flush(zlib.Z_FULL_FLUSH)      # zlib header + one block
    block = co.compress(chunk) + co.flush(zlib.Z_FULL_FLUSH)     # the same block, no header
    adler = 1
    for _ in range(mib):
        adler = zlib.adler32(chunk, adler)
    final = zlib.compressobj(9, zlib.DEFLATED, -15).flush()     # an empty last block
    return head + block * (mib - 1) + final + adler.to_bytes(4, "big")


def inflate_bomb() -> bytes:
    """A page whose content stream inflates to 1 GiB of spaces."""
    return _build([CATALOG, PAGES,
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R >>",
        _stream(_deflated_spaces(1024), b"/Filter /FlateDecode")])

CYCLE = _build([CATALOG, b"<< /Type /Pages /Kids [2 0 R 4 0 R] /Count 2 >>",
                b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
                b"<< /Type /Pages /Parent 2 0 R /Kids [2 0 R 4 0 R] /Count 1 >>"])


def _child(data: bytes, call: str, timeout: int = 60) -> dict:
    """Run one service call on `data` in a child limited to 2 GiB; report how it ended."""
    prog = textwrap.dedent(f"""
        import json, resource, sys
        resource.setrlimit(resource.RLIMIT_AS, ({LIMIT}, {LIMIT}))
        from unittest import mock
        from dueproof_engine.api import service, storage, models as m
        from dueproof_engine.pipeline.read import ReadError
        data = sys.stdin.buffer.read()
        try:
            with mock.patch.object(storage, "fetch", return_value=data):
                r = {call}
            # /v1/inspect answers a refusal as ok=false with the reason
            result = ({{"result": "ReadError", "reason": r.reason}} if getattr(r, "ok", True) is False
                      else {{"result": "ok"}})
        except ReadError as e:
            result = {{"result": "ReadError", "reason": e.reason}}
        except BaseException as e:
            result = {{"result": "exception", "error": type(e).__name__}}
        print(json.dumps(result))
    """)
    try:
        p = subprocess.run([sys.executable, "-c", prog], input=data, cwd=ENGINE, capture_output=True,
                           timeout=timeout)
    except subprocess.TimeoutExpired:
        return {"result": "hang"}
    lines = [l for l in p.stdout.decode().splitlines() if l.startswith("{")]
    return json.loads(lines[-1]) if lines else {"result": "process died", "rc": p.returncode}


INSPECT = 'service.inspect(m.InspectRequest(sourceUrl="http://s/x", mime="application/pdf"))'
READ = ('service.read(m.ReadRequest(sourceUrl="http://s/x", mime="application/pdf", '
        'pageImagePutUrls=[], maxRung="text_layer"))')


class Bombs(unittest.TestCase):
    def assertRefused(self, got):
        self.assertEqual((got.get("result"), got.get("reason")), ("ReadError", "too_large"),
                         f"expected a clean refusal, got {got}")

    def test_self_drawing_form_xobject(self):
        for call in (INSPECT, READ):
            with self.subTest(call=call[:15]):
                self.assertRefused(_child(SELF_FORM, call))

    def test_inflate_bomb_content_stream(self):
        for call in (INSPECT, READ):
            with self.subTest(call=call[:15]):
                self.assertRefused(_child(inflate_bomb(), call))


class BrokenPageTrees(unittest.TestCase):
    def test_a_page_that_will_not_load_is_malformed_not_a_500(self):
        from fastapi.testclient import TestClient
        from dueproof_engine.app import app
        c = TestClient(app, raise_server_exceptions=False, headers={"Authorization": f"Bearer {token()}"})
        with StorageServer(FOLDER) as storage:
            storage.extra["cycle.pdf"] = CYCLE
            r = c.post("/v1/inspect", json={"sourceUrl": storage.url("cycle.pdf"), "mime": "application/pdf"})
            self.assertEqual(r.status_code, 200, r.text[:200])
            self.assertEqual((r.json()["ok"], r.json()["reason"]), (False, "malformed"))
            r = c.post("/v1/read", json={"sourceUrl": storage.url("cycle.pdf"), "mime": "application/pdf",
                                         "pageImagePutUrls": [], "maxRung": "text_layer"})
            self.assertEqual((r.status_code, r.json().get("reason")), (422, "malformed"), r.text[:200])


class TextLayerBomb(unittest.TestCase):
    def test_a_page_with_300k_words_is_refused_or_capped_quickly(self):
        line = b"(" + b"ab " * 300 + b") '\n"
        content = zlib.compress(b"BT /F1 2 Tf 2.4 TL 10 14390 Td " + line * 1000 + b"ET", 9)
        bomb = _build([CATALOG, PAGES,
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 14400 14400] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            _stream(content, b"/Filter /FlateDecode"),
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"])          # 2.7 kB, 300,000 words
        import time
        from dueproof_engine.pipeline import read
        t0 = time.monotonic()
        try:
            doc = read.read_document(bomb, max_rung="text_layer")
            words = len(doc["words"])
        except read.ReadError as e:
            self.assertEqual(e.reason, "too_large")
            words = 0
        self.assertLess(time.monotonic() - t0, 3.0, "one page held the PDFium lock for ~8 s")   # today ~8 s
        self.assertLess(words, 100_000)


class DocumentBudget(unittest.TestCase):
    # About 75 s (300 pages, each decoded and scaled for display): CI runs it
    # (GitHub Actions sets CI); DUEPROOF_HEAVY_TESTS=1 runs it locally.
    @unittest.skipUnless(os.environ.get("CI") or os.environ.get("DUEPROOF_HEAVY_TESTS"),
                         "heavy: runs in CI, or with DUEPROOF_HEAVY_TESTS=1")
    def test_a_300_page_fax_tiff_is_read_within_2_gib(self):
        """300 ordinary A4 fax pages (200 DPI, 1-bit, 3.7 MB) pass every cap,
        but image_frames() holds all 300 decoded RGB frames (1.7 GB) at once
        before the first page is read. Measured: 2.9 GB peak, and with
        PaddleOCR still running after 150 s (Vercel stops at 300 s)."""
        import io
        from PIL import Image, ImageDraw
        page = Image.new("1", (1654, 2339), 1)                        # A4 at 200 DPI
        ImageDraw.Draw(page).text((100, 100), "Notice under section 73(1)", fill=0)
        out = io.BytesIO()
        page.save(out, format="TIFF", compression="group4", save_all=True, append_images=[page] * 299)
        got = _child_image(out.getvalue())
        self.assertIn(got["result"], ("ok", "ReadError"), got)


def _child_image(data: bytes) -> dict:
    prog = textwrap.dedent(f"""
        import json, resource, sys
        resource.setrlimit(resource.RLIMIT_AS, ({LIMIT}, {LIMIT}))
        from dueproof_engine.pipeline import read
        data = sys.stdin.buffer.read()
        try:
            read.read_document(data, max_rung="text_layer")
            result = {{"result": "ok"}}
        except read.ReadError as e:
            result = {{"result": "ReadError", "reason": e.reason}}
        except BaseException as e:
            result = {{"result": "exception", "error": type(e).__name__}}
        print(json.dumps(result))
    """)
    p = subprocess.run([sys.executable, "-c", prog], input=data, cwd=ENGINE, capture_output=True, timeout=300)
    lines = [l for l in p.stdout.decode().splitlines() if l.startswith("{")]
    return json.loads(lines[-1]) if lines else {"result": "process died", "rc": p.returncode}


if __name__ == "__main__":
    unittest.main()
