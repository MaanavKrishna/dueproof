"""A minimal PDF writer for tests: pages of plain Latin text in Helvetica.

Enough to exercise the native-text path without any PDF library, and
deterministic — the same input always gives the same bytes.
"""
from __future__ import annotations

import textwrap

def _escape(s: str) -> str:
    s = s.encode("latin-1", "replace").decode("latin-1")
    return s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")

def pdf(pages: list[str], size: tuple[float, float] = (595, 842), font_size: float = 11,
        rotate: int = 0) -> bytes:
    """One page per string; blank lines separate paragraphs; long lines wrap.
    `rotate` sets /Rotate on every page, as scanners and some producers do."""
    w, h = size
    objs = ["<< /Type /Catalog /Pages 2 0 R >>", None,
            "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"]
    kids = []
    for text in pages:
        lines = []
        for para in text.split("\n"):
            lines += textwrap.wrap(para, 88) or [""]
        ops = [f"BT /F1 {font_size} Tf {font_size * 1.4:.1f} TL 60 {h - 72} Td"]
        ops += [f"({_escape(line)}) Tj T*" for line in lines]
        ops.append("ET")
        stream = "\n".join(ops).encode("latin-1")
        objs.append(f"<< /Length {len(stream)} >>\nstream\n" + stream.decode("latin-1") + "\nendstream")
        content = len(objs)
        objs.append(f"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 {w} {h}] "
                    f"/Rotate {rotate} /Resources << /Font << /F1 3 0 R >> >> /Contents {content} 0 R >>")
        kids.append(len(objs))
    objs[1] = f"<< /Type /Pages /Kids [{' '.join(f'{k} 0 R' for k in kids)}] /Count {len(kids)} >>"
    out, offsets = bytearray(b"%PDF-1.4\n"), []
    for n, body in enumerate(objs, 1):
        offsets.append(len(out))
        out += f"{n} 0 obj\n{body}\nendobj\n".encode("latin-1")
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += "".join(f"{o:010d} 00000 n \n" for o in offsets).encode()
    out += f"trailer\n<< /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n%%EOF\n".encode()
    return bytes(out)
