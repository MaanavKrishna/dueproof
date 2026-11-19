"""Fuzz finding: a text layer holding characters outside the Basic
Multilingual Plane (emoji, mathematical letters, CJK Extension B) breaks
/v1/read with a 500.

PDFium's FPDFText_GetUnicode returns one UTF-16 code unit per character
index, so pdf.words() builds strings of lone surrogates ("\\ud83d\\ude00"
rather than "😀"). Those survive the pipeline and fail when the response is
encoded as UTF-8. Expected: the pair is joined into one character (and a
lone surrogate dropped), and the page reads normally."""
import unittest

from dueproof_engine.pipeline import pdf, read
from tests.storage_server import StorageServer
from tests.fixtures import FOLDER
from tests.support import token


def _pdf_with_tounicode(mapping: dict[int, str], repeat: int = 40) -> bytes:
    """One Helvetica page whose ToUnicode CMap maps one-byte codes to the given strings."""
    cmap = ["/CIDInit /ProcSet findresource begin 12 dict begin begincmap",
            "/CMapName /X def /CMapType 2 def 1 begincodespacerange <00> <FF> endcodespacerange",
            f"{len(mapping)} beginbfchar"]
    cmap += [f"<{c:02X}> <{s.encode('utf-16-be').hex().upper()}>" for c, s in mapping.items()]
    cmap += ["endbfchar endcmap CMapName currentdict /CMap defineresource pop end end"]
    cmap_b = "\n".join(cmap).encode()
    run = "".join(f"{c:02X}" for c in mapping)
    content = ("BT /F1 10 Tf 40 800 Td 12 TL " + " ".join(f"<{run}> Tj T*" for _ in range(repeat)) + " ET").encode()
    objs = [b"<< /Type /Catalog /Pages 2 0 R >>", b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
            b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 5 0 R >> >> /Contents 4 0 R >>",
            b"<< /Length %d >>\nstream\n" % len(content) + content + b"\nendstream",
            b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /ToUnicode 6 0 R >>",
            b"<< /Length %d >>\nstream\n" % len(cmap_b) + cmap_b + b"\nendstream"]
    out, offs = bytearray(b"%PDF-1.7\n"), []
    for n, body in enumerate(objs, 1):
        offs.append(len(out))
        out += b"%d 0 obj\n" % n + body + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 %d\n0000000000 65535 f \n" % (len(objs) + 1) + b"".join(b"%010d 00000 n \n" % o for o in offs)
    out += b"trailer\n<< /Size %d /Root 1 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objs) + 1, xref)
    return bytes(out)


EMOJI = _pdf_with_tounicode({0x41: "Pay ", 0x42: "by ", 0x43: "\U0001F4C5", 0x44: " 21 August 2026 "})


class AstralCharacters(unittest.TestCase):
    def test_words_hold_whole_characters_not_surrogate_halves(self):
        doc = pdf.open_pdf(EMOJI)
        words = pdf.words(doc[0])
        text = "".join(w["text"] for w in words)
        self.assertFalse(any(0xD800 <= ord(ch) <= 0xDFFF for ch in text), "lone UTF-16 surrogates in the text layer")
        self.assertIn("\U0001F4C5", text)

    def test_read_answers_200_with_the_emoji_intact(self):
        with StorageServer(FOLDER) as storage:
            storage.extra["emoji.pdf"] = EMOJI
            from fastapi.testclient import TestClient
            from dueproof_engine.app import app
            c = TestClient(app, raise_server_exceptions=False, headers={"Authorization": f"Bearer {token()}"})
            r = c.post("/v1/read", json={"sourceUrl": storage.url("emoji.pdf"), "mime": "application/pdf",
                                                "pageImagePutUrls": [], "maxRung": "text_layer"})
        self.assertEqual(r.status_code, 200, r.text[:200])
        self.assertIn("\U0001F4C5", r.json()["pages"][0]["text"])
        self.assertIn("21 August 2026", r.json()["pages"][0]["text"])

    def test_the_document_reader_never_returns_surrogates(self):
        doc = read.read_document(EMOJI, max_rung="text_layer")
        self.assertEqual(doc["pages"][0]["engine"], "text_layer")
        doc["full_text"].encode("utf-8")          # raises UnicodeEncodeError today


if __name__ == "__main__":
    unittest.main()
