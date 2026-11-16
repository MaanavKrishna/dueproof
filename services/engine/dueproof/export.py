"""The deadline line, exported: a spreadsheet and a printable evidence report.

Both are built from what the app already holds — the findings, their rectangles
and the page images — so an export is exactly as provable as the screen it was
taken from.
"""
from __future__ import annotations

import base64
import csv
import html
import io
from datetime import date

import cv2

from dueproof.config import ORG_NAME, PAGES, PRODUCT
from dueproof.languages import LANGUAGES

COLUMNS = ["Due date", "Days left", "Timing", "State", "Assignee", "Obligation",
           "Original wording", "Written in",
           "Machine translated", "Check terminology", "Severity", "Desks", "Document",
           "Document type", "Channel", "Page", "Source match", "Match score"]

def _cell(value) -> str:
    """Document text goes into a spreadsheet, and a spreadsheet runs formulas: a
    cell starting with = + - @ is executed by Excel. Lead it with an apostrophe."""
    s = "" if value is None else str(value)
    return "'" + s if s[:1] in ("=", "+", "-", "@", "\t", "\r") else s

def deadlines_csv(items: list[dict]) -> bytes:
    buf = io.StringIO()
    out = csv.writer(buf, lineterminator="\r\n")
    out.writerow(COLUMNS)
    for it in items:
        original = it["text_en"] if it["orig_lang"] == "en" else it["text_local"]
        out.writerow([_cell(v) for v in (
            it["due_date"], it["days_left"], "Overdue" if it["overdue"] else "Due",
            it.get("status") or "open", it.get("assignee") or "",
            it["text_en"] or it["text_local"], original,
            LANGUAGES.get(it["orig_lang"], {}).get("english", "English"),
            "yes" if it["translated"] else "no", "; ".join(it.get("term_flags") or []),
            it["severity"], "; ".join(it["roles"]), it["doc_title"], it["doc_type"],
            it["source_channel"], it["page"], it["confidence"], round(it["match_score"] or 0))])
    # The BOM is what makes Excel read the file as UTF-8 rather than mangle
    # every non-Latin character.
    return b"\xef\xbb\xbf" + buf.getvalue().encode("utf-8")

# evidence report
# An HTML page made for printing: the browser lays it out and shapes every
# script correctly, and "Print → Save as PDF" gives the PDF. Crops are inlined
# as data URIs, so the saved page is complete on its own.
_CSS = """
:root { color-scheme: light; }
body { font: 10.5pt/1.45 -apple-system, "Segoe UI", system-ui, "Noto Sans", sans-serif;
       color: #17212b; background: #fff; max-width: 780px; margin: 32px auto; padding: 0 20px; }
h1 { font-size: 19pt; margin: 0 0 2pt; letter-spacing: -.01em; }
.sub { color: #5b6875; font-size: 9pt; margin: 0 0 22pt; }
.hint { background: #f3f6f8; border-radius: 6px; padding: 8px 12px; font-size: 9pt; color: #44525f; }
.item { break-inside: avoid; page-break-inside: avoid; margin: 0 0 20pt;
        padding-top: 12pt; border-top: 1px solid #e3e8ec; }
.due { font-weight: 650; font-size: 11pt; margin: 0; }
.overdue { color: #b45309; }
.status { font-size: 8pt; text-transform: uppercase; letter-spacing: .06em; color: #5b6875;
          border: 1px solid #c9d2d9; border-radius: 10px; padding: 0 6px; margin-left: 6px; }
.duty { margin: 4pt 0; }
.meta { font-size: 8pt; color: #5b6875; margin: 0 0 5pt; }
.note { font-size: 8pt; color: #b45309; margin: 0 0 5pt; }
img { width: 100%; border: 1px solid #e3e8ec; border-radius: 3px; }
@media print { .hint { display: none; } body { margin: 0; max-width: none; } }
"""

def _crop(doc_id: str, page: int, rects: list[list[float]]) -> bytes | None:
    """The passage as it appears on the page: a full-width strip around the
    matched lines, with each line outlined."""
    path = PAGES / doc_id / f"{page}.jpg"
    img = cv2.imread(str(path)) if rects and path.is_file() else None
    if img is None:
        return None
    h, w = img.shape[:2]
    for x0, y0, x1, y1 in rects:
        cv2.rectangle(img, (int(x0 * w), int(y0 * h)), (int(x1 * w), int(y1 * h)),
                      (41, 180, 240), 2)                       # the UI's amber, in BGR
    top = max(0, int((min(r[1] for r in rects) - 0.025) * h))
    bottom = min(h, int((max(r[3] for r in rects) + 0.025) * h))
    ok, jpg = cv2.imencode(".jpg", img[top:bottom, int(0.03 * w):int(0.97 * w)],
                           [int(cv2.IMWRITE_JPEG_QUALITY), 82])
    return jpg.tobytes() if ok else None

def _when(left: int) -> str:
    return (f"{-left} day{'s' if left != -1 else ''} overdue" if left < 0
            else "due today" if left == 0 else f"in {left} day{'s' if left != 1 else ''}")

def evidence_html(items: list[dict], generated: date, role: str = "") -> str:
    """One block per obligation: the date, the duty, where it came from, and the
    cropped page image with the supporting lines outlined."""
    esc = html.escape
    who = " · ".join(filter(None, [PRODUCT, ORG_NAME]))
    parts = [f'<!doctype html><html lang="en"><head><meta charset="utf-8">'
             f'<meta name="viewport" content="width=device-width, initial-scale=1">'
             f"<title>Deadlines — evidence report</title><style>{_CSS}</style></head><body>"
             f"<h1>Deadlines — evidence report</h1>"
             f'<p class="sub">{esc(who)} · generated {generated.strftime("%d %b %Y")} · '
             f'{len(items)} dated obligation{"" if len(items) == 1 else "s"}'
             f'{" · desk: " + esc(role) if role else ""}'
             f" · every passage below is reproduced from the source page</p>"
             f'<p class="hint">To keep this as a PDF, print it and choose “Save as PDF”.</p>']
    for it in items:
        when = date.fromisoformat(it["due_date"]).strftime("%d %b %Y")
        left, status = it["days_left"], it.get("status") or "open"
        notes = []
        if it["translated"]:
            notes.append("Machine translation — the original wording is in the image below.")
        if it.get("term_flags"):
            notes.append("Check terminology: " + "; ".join(it["term_flags"]))
        text = it["text_en"] or it["text_local"]
        lang = "en" if text == it["text_en"] else it["orig_lang"]
        crop = _crop(it["doc_id"], it["page"], it["rects"])
        parts.append(
            f'<section class="item"><p class="due{" overdue" if left < 0 and status == "open" else ""}">'
            f'{when} · {_when(left)}<span class="status">{esc(status)}</span></p>'
            f'<p class="duty" lang="{esc(lang)}">{esc(text)}</p>'
            f'<p class="meta">{esc(it["doc_title"])} · {esc(it["doc_type"] or "")} · '
            f'{esc(it["source_channel"] or "")} · page {it["page"]} · {esc(it["confidence"])} match'
            f' · {esc("; ".join(it["roles"]))}</p>'
            + "".join(f'<p class="note">{esc(x)}</p>' for x in notes)
            + (f'<img alt="Page {it["page"]}, the supporting passage outlined" '
               f'src="data:image/jpeg;base64,{base64.b64encode(crop).decode()}">' if crop else
               '<p class="note">The supporting passage could not be located on the page.</p>')
            + "</section>")
    parts.append("</body></html>")
    return "".join(parts)
