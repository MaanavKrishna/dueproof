"""Regenerate the test corpus in tests/fixtures/. Developer tool only.

    python tests/make_fixtures.py

Four documents from a fictional operator — nothing here is a real document: a
bilingual circular with a text layer, a skewed image-only "phone photo" of the
same circular (the OCR path, and a true duplicate), an invoice and a set of
minutes; plus two edge cases, a password-protected PDF and a poster-sized page.

It needs PyMuPDF, which Dueproof itself does not use (PyMuPDF is AGPL; it is used
here only to *write* test files, which carry no licence obligation). Install it
just for this: pip install pymupdf. After regenerating, run
`python -m tests.make_golden` and read the diff.
"""
from __future__ import annotations

from pathlib import Path

import cv2
import fitz
import numpy as np


HERE = Path(__file__).resolve().parent
STATIC = HERE.parent / "dueproof" / "static"

# A page is a list of (style, text). Styles: h1, h2, p (English body), ml
# (Malayalam body), ref (small print), row (one table row).
_CIRCULAR = [
    [
        ("h1", "NORTHLINE METRO RAIL CORPORATION"),
        ("ref", "Safety Department · NMR/SAF/2026/041 · Dated: 6 August 2026"),
        ("p", "Subject: Fire safety audit of all elevated stations and compliance reporting"),
        ("h2", "1. Background"),
        ("p", "The annual fire safety audit of the elevated corridor found expired portable "
              "extinguishers at eleven stations and two partially functional smoke detection "
              "loops. This circular sets out what each department must do and by when."),
        ("ml", "എല്ലാ എലിവേറ്റഡ് സ്റ്റേഷനുകളിലെയും അഗ്നിസുരക്ഷാ ഓഡിറ്റിൽ കണ്ടെത്തിയ പോരായ്മകൾ "
               "പരിഹരിക്കുന്നതിനുള്ള നിർദ്ദേശങ്ങളാണ് ഈ സർക്കുലറിൽ ഉള്ളത്."),
        ("h2", "2. Fire extinguishing equipment"),
        ("p", "Every Station Controller shall replace all expired portable extinguishers and "
              "certify the replacement to the Safety Department on or before 21 August 2026."),
        ("ml", "എല്ലാ എലിവേറ്റഡ് സ്റ്റേഷനുകളിലെയും പോർട്ടബിൾ അഗ്നിശമന ഉപകരണങ്ങൾ 2026 ഓഗസ്റ്റ് 21-ന് "
               "മുമ്പ് പരിശോധിച്ച് സാക്ഷ്യപത്രം സഹിതം സുരക്ഷാ വിഭാഗത്തിന് നൽകണം."),
    ],
    [
        ("h2", "3. Evacuation drills"),
        ("p", "Quarterly evacuation drills are mandatory at every station. The Operations "
              "Control Centre must complete the pending drills and report to the Chief Safety "
              "Officer not later than 31 August 2026."),
        ("ml", "നടപ്പുപാദത്തിലെ ഒഴിപ്പിക്കൽ പരിശീലനം 2026 ഓഗസ്റ്റ് 31-ന് മുമ്പ് പൂർത്തിയാക്കി "
               "ഓപ്പറേഷൻസ് കൺട്രോൾ സെന്ററിന് റിപ്പോർട്ട് ചെയ്യണം."),
        ("h2", "4. Smoke detection"),
        ("p", "The Signalling and Telecom department is responsible for restoring both faulty "
              "smoke detection loops. Until restoration, a fire watch is required at the "
              "affected platforms during all service hours."),
        ("p", "Station staff were retrained on extinguisher handling in July, and attendance "
              "records are held by Human Resources for inspection."),
    ],
    [
        ("h2", "5. Reporting to the regulator"),
        ("ml", "മുഴുവൻ എലിവേറ്റഡ് സ്റ്റേഷനുകളിലെയും സമഗ്ര അഗ്നിസുരക്ഷാ ഓഡിറ്റ് റിപ്പോർട്ട് 2026 "
               "സെപ്റ്റംബർ 5-ന് മുമ്പ് ചീഫ് സേഫ്റ്റി ഓഫീസർ മുഖേന കമ്മീഷണർ ഓഫ് മെട്രോ റെയിൽ "
               "സേഫ്റ്റിക്ക് സമർപ്പിക്കണം."),
        ("ml", "റിപ്പോർട്ട് തയ്യാറാക്കുന്നതിന് മുന്നോടിയായി ഓരോ വിഭാഗവും അവരവരുടെ ഭാഗം 2026 "
               "ഓഗസ്റ്റ് 28-നകം സുരക്ഷാ വിഭാഗത്തിന് കൈമാറേണ്ടതാണ്."),
        ("p", "Non-compliance with this statutory reporting requirement attracts a penalty "
              "under the Metro Railways Act, and the audit findings will be reviewed by the "
              "Board."),
        ("ref", "Sd/- Chief Safety Officer · Copy to: all Heads of Department"),
    ],
]

_INVOICE = [[
    ("h1", "HARBOUR VALLEY COMPONENTS PVT LTD"),
    ("ref", "TAX INVOICE · Invoice No: HVC/INV/2026/1183 · Dated: 16 August 2026"),
    ("p", "Billed to: Northline Metro Rail Corporation · Against purchase order NMR/PO/2026/0912"),
    ("row", "Description          Qty     Rate     Amount"),
    ("row", "1  Brake pad set, sintered     48     18,400     8,83,200"),
    ("row", "2  Brake disc runout gauge     2     34,500     69,000"),
    ("row", "3  Torque wrench, calibrated     4     12,750     51,000"),
    ("p", "Payment is due within 30 days of the invoice date. Finance must clear this invoice "
          "on or before 15 September 2026 to retain the negotiated early-settlement discount "
          "of 1.5%."),
    ("p", "Two line items were delivered short against the purchase order quantity, and the "
          "vendor will supply the balance with the next consignment at no additional cost."),
]]

_MINUTES = [[
    ("h1", "NORTHLINE METRO RAIL CORPORATION"),
    ("p", "Minutes of the 87th meeting of the Board of Directors, held on 30 July 2026 at the "
          "Corporate Office."),
    ("h2", "Item 1 — Phase II extension"),
    ("p", "The Board noted that civil works on the Phase II viaduct are 62% complete against "
          "a planned 70%, and resolved that the Director (Projects) shall submit a recovery "
          "schedule to the Board by 30 September 2026."),
    ("h2", "Item 2 — Budget"),
    ("p", "The revised budget of 412 crore for rolling stock procurement was approved, subject "
          "to the tender being re-issued with the amended technical specification."),
    ("p", "The next meeting of the Board will be convened in October at a date to be notified "
          "by the Company Secretary."),
]]

_NOTICE = [[
    ("h1", "OFFICE OF THE ASSISTANT COMMISSIONER OF STATE TAX"),
    ("ref", "Commercial Taxes Department · Northline Division"),
    ("p", "Reference No: ZD2910260012345   Date: 20 October 2026"),
    ("p", "Subject: Notice under Section 61 for intimating discrepancies in the return "
          "(Form GST ASMT-10)"),
    ("p", "To: Harbour Valley Components Pvt Ltd, GSTIN 29AAACH0000A1Z5, Tax period April 2025 "
          "to March 2026."),
    ("p", "On scrutiny of the returns filed for the above period, discrepancies were noticed in "
          "the input tax credit claimed against the supplier statements."),
    ("p", "You are hereby directed to explain the discrepancies and pay the tax of Rs. 4,52,300 "
          "with interest within 30 days of receipt of this notice."),
    ("p", "A personal hearing is fixed on 18 November 2026 at 11:00 AM before the undersigned at "
          "the Division office."),
    ("p", "Failure to reply will attract proceedings under Section 73(1) of the Act, including a "
          "penalty of Rs. 2.5 lakh, without further notice."),
    ("ref", "Sd/- Assistant Commissioner of State Tax"),
]]

_SIZES = {"h1": 13, "h2": 11, "p": 10.5, "ml": 10.5, "ref": 9, "row": 10.5}
_FONTS = STATIC / "fonts"

def _pdf(pages: list[list[tuple[str, str]]]) -> bytes:
    """A PDF with an exact text layer. Each character is written as its own
    glyph, with no shaping: Malayalam conjuncts look wrong on the page, but the
    text layer says precisely what was written — which is what the native path
    reads. The shaped rendering is _printed(), and only the scan uses it."""
    doc = fitz.open()
    for paragraphs in pages:
        page, y = doc.new_page(), 56.0                      # A4
        for style, text in paragraphs:
            y += 12 if style in ("h1", "h2") else 8
            spare = page.insert_textbox(
                fitz.Rect(56, y, 539, 786), text, fontsize=_SIZES[style], lineheight=1.45,
                fontname="ml" if style == "ml" else "body",
                fontfile=str(_FONTS / ("NotoSansMalayalam.ttf" if style == "ml" else "Inter.ttf")))
            assert spare >= 0, "fixture page overflowed"
            y = 786 - spare
    doc.subset_fonts()                                      # keeps the fixtures small
    data = doc.tobytes(deflate=True, garbage=4, no_new_id=True)
    doc.close()
    return data

_CSS = """
@font-face { font-family: body; src: url(Inter.ttf); }
@font-face { font-family: ml; src: url(NotoSansMalayalam.ttf); }
p { font-family: body; font-size: 10.5pt; line-height: 1.45; margin: 8pt 0 0 0; }
.ml { font-family: ml; }
.h1 { font-size: 13pt; margin-top: 12pt; } .h2 { font-size: 11pt; margin-top: 12pt; }
.ref { font-size: 9pt; }
"""

def _printed(pages: list[list[tuple[str, str]]]) -> fitz.Document:
    """The same pages as they would come off a printer: properly shaped."""
    doc = fitz.open()
    archive = fitz.Archive(str(_FONTS))
    for paragraphs in pages:
        html = "".join(f'<p class="{style}">{text}</p>' for style, text in paragraphs)
        doc.new_page().insert_htmlbox(fitz.Rect(56, 56, 539, 786), html, css=_CSS, archive=archive)
    return doc

def _photo(src: fitz.Document, skew: float = 1.6) -> bytes:
    """What a phone does to a printout: no text layer, a tilt, soft focus, noise."""
    out = fitz.open()
    rng = np.random.default_rng(41)
    for page in src:
        pix = page.get_pixmap(dpi=170, colorspace=fitz.csGRAY)
        img = np.frombuffer(pix.samples, np.uint8).reshape(pix.height, pix.width)
        h, w = img.shape
        m = cv2.getRotationMatrix2D((w / 2, h / 2), skew, 1.0)
        img = cv2.warpAffine(img, m, (w, h), borderValue=255)
        img = cv2.GaussianBlur(img, (3, 3), 0.6)
        img = np.clip(img.astype(np.int16) + rng.normal(0, 6, img.shape), 0, 255).astype(np.uint8)
        ok, jpg = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 55])
        assert ok
        out.new_page(width=page.rect.width, height=page.rect.height).insert_image(
            page.rect, stream=jpg.tobytes())
    data = out.tobytes(no_new_id=True)
    src.close()
    out.close()
    return data

def main() -> None:
    from tests.fixtures import CIRCULAR, FOLDER, INVOICE, LOCKED, MINUTES, NOTICE, POSTER, SCAN
    FOLDER.mkdir(exist_ok=True)
    for name, data in ((CIRCULAR, _pdf(_CIRCULAR)), (SCAN, _photo(_printed(_CIRCULAR))),
                       (INVOICE, _pdf(_INVOICE)), (MINUTES, _pdf(_MINUTES)),
                       (NOTICE, _pdf(_NOTICE))):
        (FOLDER / name).write_bytes(data)
    plain = fitz.open(stream=_pdf(_MINUTES), filetype="pdf")
    (FOLDER / LOCKED).write_bytes(plain.tobytes(encryption=fitz.PDF_ENCRYPT_AES_256,
                                                user_pw="secret", owner_pw="owner"))
    poster = fitz.open()
    poster.new_page(width=14400, height=14400)              # 200 inches square
    (FOLDER / POSTER).write_bytes(poster.tobytes())
    print(f"wrote {len(list(FOLDER.glob('*.pdf')))} files to {FOLDER}")

if __name__ == "__main__":
    import sys
    sys.path.insert(0, str(HERE.parent))
    main()
