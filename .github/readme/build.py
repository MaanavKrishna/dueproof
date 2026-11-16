#!/usr/bin/env python3
"""Build the SVG graphics used by the repository README.

    pip install fonttools brotli
    python3 .github/readme/build.py

Writes .github/readme/*.svg. Run it again after changing anything here.

Design: Ledger, the Dueproof design system, in its default "ink-saffron" brand.
Ink blue is the signature colour; saffron is kept for proof only (a highlighted
quote on a page, a proof grade, the proof gate), exactly as in the product.
Every colour below comes from packages/tokens/src/source/color.ts.

Type: Inter (sans) and JetBrains Mono (mono), the faces the design system uses
where SF Pro and SF Mono are not available, plus Noto Sans for the six Indian
scripts on the languages tile. Each SVG embeds a WOFF2 subset of exactly the
glyphs it uses, so type renders the same on GitHub in every browser.

Fonts in .github/readme/fonts, all under the SIL Open Font License 1.1
(licence texts beside them):
  - Inter, (c) 2016 The Inter Project Authors (OFL-Inter.txt)
  - JetBrains Mono, (c) 2020 The JetBrains Mono Project Authors (OFL-JetBrainsMono.txt)
  - Noto Sans Devanagari, Tamil, Bengali, Telugu, Malayalam and Arabic,
    (c) The Noto Project Authors (OFL-Noto.txt)
They come from the @fontsource packages on npm.

Every SVG has role="img" and an aria-label. Tiles, the hero and panels paint
their own background; section headers are transparent and use colours that
read on both GitHub light (#ffffff) and dark (#0d1117). Animations are CSS
only, play inside prefers-reduced-motion: no-preference, and every element's
resting state is its final state, so with motion off the picture is complete.
"""
import base64
import io
import math
import os
from collections import defaultdict
from xml.dom import minidom
from xml.sax.saxutils import escape

from fontTools import subset
from fontTools.ttLib import TTFont

HERE = os.path.dirname(os.path.abspath(__file__))
FONT_DIR = os.path.join(HERE, "fonts")
OUT = HERE

# ---------------------------------------------------------------- tokens (color.ts)
N = {0: "#FFFFFF", 1: "#F9FAFB", 2: "#F3F4F6", 3: "#EAECEF", 4: "#DFE2E6", 5: "#CDD1D7", 6: "#B1B7BF",
     7: "#8D949E", 8: "#6B727D", 9: "#555B66", 10: "#3E444D", 11: "#272B32", 12: "#15181D"}
ND = {0: "#0B0D10", 1: "#111317", 2: "#16191E", 3: "#1C2026", 4: "#23272E", 5: "#2C3139", 6: "#3A404A",
      7: "#4F5661", 8: "#6B727D", 9: "#8E959F", 10: "#B3B9C1", 11: "#D6DAE0", 12: "#F3F4F6"}

INK = "#1F3A8A"           # accent.solid (light)
INK_HOVER = "#1A3176"     # accent.hover (light)
INK_PRESSED = "#152862"   # accent.pressed (light)
INK_DARK = "#4766DA"      # accent.solid (dark); also the README's header colour on light and dark
INK_TEXT_DARK = "#A3B8FF"  # accent.text (dark)
INK_SUBTLE = "#E6ECFA"    # accent.subtle (light)
INK_SUBTLE_DARK = "#1B2645"
INK_SUBTLE_FG_DARK = "#C2D0FF"

HL = "#FCDD9A"            # proof.highlight
STROKE = "#B87300"        # proof.stroke
PROOF_BG, PROOF_BG_DARK = "#FEF3DA", "#3A2A0B"
PROOF_FG, PROOF_FG_DARK = "#7F4D00", "#F9C76A"
PROOF_BORDER, PROOF_BORDER_DARK = "#F5C66B", "#6E4E12"

OVERDUE = dict(fg="#B42318", bg="#FDECEA", border="#F4BDB7")
WEEK = dict(fg="#0B6672", bg="#E3F3F5", border="#A9DCE3")
LATER = dict(fg=N[9], bg=N[3], border=N[5])
DONE = dict(fg="#17703A", bg="#E6F4EA", border="#B4DEC1")

HEAD = INK_DARK           # section headers: 5.0:1 on white, 3.8:1 on #0d1117 (large text)
HEAD_NOTE = N[8]          # #6B727D is neutral.8 and neutralDark.8: 4.9:1 and 3.9:1

THEMES = {
    "paper": dict(bg=N[1], card=N[0], fg=N[12], mut=N[9], faint=N[8], line=N[4], grid=N[3],
                  acc=INK, acc_text=INK, acc_subtle=INK_SUBTLE, on_acc="#FFFFFF",
                  proof_bg=PROOF_BG, proof_fg=PROOF_FG, proof_border=PROOF_BORDER, edge=N[4]),
    "night": dict(bg=ND[1], card=ND[3], fg=ND[12], mut=ND[10], faint=ND[9], line=ND[5], grid=ND[2],
                  acc=INK_DARK, acc_text=INK_TEXT_DARK, acc_subtle=INK_SUBTLE_DARK, on_acc="#FFFFFF",
                  proof_bg=PROOF_BG_DARK, proof_fg=PROOF_FG_DARK, proof_border=PROOF_BORDER_DARK, edge=ND[5]),
    "ink": dict(bg=INK, card=INK_HOVER, fg="#FFFFFF", mut=INK_SUBTLE_FG_DARK, faint=INK_TEXT_DARK, line="#3B55A6",
                grid="#28449A", acc="#FFFFFF", acc_text="#FFFFFF", acc_subtle=INK_PRESSED, on_acc=INK,
                proof_bg=PROOF_BG, proof_fg=PROOF_FG, proof_border=PROOF_BORDER, edge=None),
}

# css class -> ([files, first wins per glyph], family, weight, fallback, opentype features)
SANS = "-apple-system, 'Segoe UI', system-ui, sans-serif"
MONO = "ui-monospace, Menlo, Consolas, monospace"
INTER_FEATURES = "'cv11','ss01','ss03'"  # as on the website (apps/site/app/globals.css)
FONTS = {
    "fx": (["inter-latin-800-normal.woff2"], "DP Display", 800, SANS, INTER_FEATURES),
    "fh": (["inter-latin-700-normal.woff2", "inter-latin-ext-700-normal.woff2"], "DP Bold", 700, SANS, INTER_FEATURES),
    "fs": (["inter-latin-600-normal.woff2", "inter-latin-ext-600-normal.woff2"], "DP Semibold", 600, SANS, INTER_FEATURES),
    "fb": (["inter-latin-500-normal.woff2"], "DP Medium", 500, SANS, INTER_FEATURES),
    "fr": (["inter-latin-400-normal.woff2"], "DP Regular", 400, SANS, INTER_FEATURES),
    "fm": (["jetbrains-mono-latin-500-normal.woff2"], "DP Mono", 500, MONO, ""),
    "fmb": (["jetbrains-mono-latin-700-normal.woff2"], "DP Mono Bold", 700, MONO, ""),
    "fi": ([f"noto-sans-{s}-{s}-600-normal.woff2" for s in
            ("devanagari", "tamil", "bengali", "telugu", "malayalam", "arabic")], "DP Indic", 600, "sans-serif", ""),
}
LATIN_FEATURES = ["kern", "liga", "calt", "tnum", "cv11", "ss01", "ss03"]

BASE_CSS = """
@media (prefers-reduced-motion:no-preference){
.fade{animation:fade .9s cubic-bezier(.2,.8,.2,1) both}
.wipe{transform-box:fill-box;transform-origin:left center;animation:wipe 1.1s cubic-bezier(.65,0,.25,1) both}
.draw{stroke-dasharray:1;animation:draw 1.6s cubic-bezier(.65,0,.25,1) both}
.pop{transform-box:fill-box;transform-origin:center;animation:pop .55s cubic-bezier(.3,1.5,.5,1) both}
.flow{animation:flow 1.2s linear infinite}
.pulse{animation:pulse 2s ease-in-out infinite}
}
@keyframes fade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes wipe{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes draw{from{stroke-dashoffset:1}to{stroke-dashoffset:0}}
@keyframes pop{from{transform:scale(0)}to{transform:scale(1)}}
@keyframes flow{to{stroke-dashoffset:-20}}
@keyframes pulse{0%,100%{opacity:.35}50%{opacity:1}}
"""


def motion(css):
    """Wrap animation rules so they only apply when the reader allows motion."""
    return "@media (prefers-reduced-motion:no-preference){" + css + "}" if css else ""


# ---------------------------------------------------------------- font helpers
_tt = {}


def tt(file):
    if file not in _tt:
        _tt[file] = TTFont(os.path.join(FONT_DIR, file))
    return _tt[file]


def measure(text, cls, size, ls=0.0):
    files = FONTS[cls][0]
    w = 0.0
    for c in text:
        for f in files:
            font = tt(f)
            cmap = font.getBestCmap()
            if ord(c) in cmap:
                w += font["hmtx"][cmap[ord(c)]][0] * size / font["head"].unitsPerEm
                break
        else:
            w += size * 0.6
    return w + ls * len(text)


def fit(text, cls, size, max_w, ls=0.0):
    while size > 8 and measure(text, cls, size, ls) > max_w:
        size -= 0.5
    return size


def subset_b64(file, chars, cls):
    f = TTFont(os.path.join(FONT_DIR, file))
    opts = subset.Options()
    opts.flavor = "woff2"
    opts.layout_features = ["*"] if cls == "fi" else LATIN_FEATURES
    opts.name_IDs = []
    opts.notdef_outline = False
    s = subset.Subsetter(opts)
    s.populate(text=chars)
    s.subset(f)
    buf = io.BytesIO()
    f.flavor = "woff2"
    f.save(buf)
    return base64.b64encode(buf.getvalue()).decode()


def T(x, y, s, cls, size, fill, anchor=None, ls=None, extra="", classes="", weight=None):
    a = f' text-anchor="{anchor}"' if anchor else ""
    l_ = f' letter-spacing="{ls}"' if ls else ""
    c = f"{cls} {classes}".strip()
    return (f'<text x="{x:.1f}" y="{y:.1f}" class="{c}" font-size="{size}" fill="{fill}"{a}{l_} {extra}>'
            f"{escape(s)}</text>")


def doc(W, H, body, css="", label=""):
    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" '
            f'role="img" aria-label="{escape(label, {chr(34): "&quot;"})}"><title>{escape(label)}</title>'
            f"<style>/*FONTS*/{BASE_CSS}{motion(css)}</style>{body}</svg>")


def write(name, svg):
    """Embed exactly the glyphs each text element uses, then save."""
    dom = minidom.parseString(svg)
    chars = defaultdict(set)

    def walk(node, cls):
        if node.nodeType == node.ELEMENT_NODE:
            if node.tagName in ("style", "title"):
                return
            for k in node.getAttribute("class").split():
                if k in FONTS:
                    cls = k
            for ch in node.childNodes:
                walk(ch, cls)
        elif node.nodeType == node.TEXT_NODE and cls:
            chars[cls].update(node.data)

    walk(dom.documentElement, None)
    css = ""
    for cls in sorted(chars):
        files, fam, weight, fallback, feats = FONTS[cls]
        want = set(chars[cls]) - {" ", "\n"}
        families = []
        for i, file in enumerate(files):
            cmap = tt(file).getBestCmap()
            mine = {c for c in want if ord(c) in cmap}
            want -= mine
            if not mine:
                continue
            fname = f"{fam} {i}"
            families.append(f"'{fname}'")
            data = subset_b64(file, "".join(sorted(mine)) + " ", cls)
            css += (f"@font-face{{font-family:'{fname}';src:url(data:font/woff2;base64,{data}) format('woff2');"
                    f"font-weight:{weight};font-style:normal}}")
        if want:
            raise SystemExit(f"{name}: no font in class {cls} has {sorted(want)}")
        ff = f"font-feature-settings:{feats};" if feats else ""
        css += f".{cls}{{font-family:{','.join(families)},{fallback};font-weight:{weight};{ff}}}"
    with open(os.path.join(OUT, name), "w", encoding="utf-8") as fh:
        fh.write(svg.replace("/*FONTS*/", css))


# ---------------------------------------------------------------- drawing helpers
def arrow(x1, y1, x2, y2, col, w=2.0, head=9, cls="", dash=""):
    ang = math.atan2(y2 - y1, x2 - x1)
    a1, a2 = ang + math.radians(150), ang - math.radians(150)
    hx1, hy1 = x2 + head * math.cos(a1), y2 + head * math.sin(a1)
    hx2, hy2 = x2 + head * math.cos(a2), y2 + head * math.sin(a2)
    d = f' stroke-dasharray="{dash}"' if dash else ""
    c = f' class="{cls}"' if cls else ""
    return (f'<path d="M{x1:.1f},{y1:.1f}L{x2:.1f},{y2:.1f}"{c} fill="none" stroke="{col}" stroke-width="{w}" '
            f'stroke-linecap="round"{d}/>'
            f'<path d="M{hx1:.1f},{hy1:.1f}L{x2:.1f},{y2:.1f}L{hx2:.1f},{hy2:.1f}" fill="none" stroke="{col}" '
            f'stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')


def tick(cx, cy, col, s=1.0, w=2.5):
    return (f'<path d="M{cx-7*s:.1f},{cy:.1f} l{5*s:.1f},{5*s:.1f} l{9*s:.1f},{-10*s:.1f}" fill="none" stroke="{col}" '
            f'stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')


def cross(cx, cy, col, s=6, w=2.5):
    return (f'<path d="M{cx-s},{cy-s}L{cx+s},{cy+s}M{cx+s},{cy-s}L{cx-s},{cy+s}" stroke="{col}" stroke-width="{w}" '
            f'stroke-linecap="round"/>')


def chevron(x, y, col, s=6, w=2):
    return (f'<path d="M{x-s/2:.1f},{y-s:.1f}L{x+s/2:.1f},{y:.1f}L{x-s/2:.1f},{y+s:.1f}" fill="none" stroke="{col}" '
            f'stroke-width="{w}" stroke-linecap="round" stroke-linejoin="round"/>')


def mark(x, y, size, page=INK, corner=INK_SUBTLE, hl=HL, tick_col="#FFFFFF"):
    """The Dueproof mark (apps/site/components/Brand.tsx): a page, a highlight (proof) and a tick (done)."""
    s = size / 24
    return (f'<g transform="translate({x},{y}) scale({s:.4f})">'
            f'<path d="M4 3.5A1.5 1.5 0 0 1 5.5 2h9.4L20 7.1v13.4a1.5 1.5 0 0 1-1.5 1.5h-13A1.5 1.5 0 0 1 4 20.5z" fill="{page}"/>'
            f'<path d="M14.9 2v3.6a1.5 1.5 0 0 0 1.5 1.5H20z" fill="{corner}"/>'
            f'<rect x="6.5" y="10" width="11" height="4" rx="1" fill="{hl}"/>'
            f'<path d="M8 17.6l1.9 1.9 3.9-4" fill="none" stroke="{tick_col}" stroke-width="1.9" stroke-linecap="round" '
            f'stroke-linejoin="round"/></g>')


def bars(x, y, widths, col, gap=18, h=6, op=1.0):
    return "".join(f'<rect x="{x}" y="{y+i*gap}" width="{w}" height="{h}" rx="{h/2}" fill="{col}" fill-opacity="{op}"/>'
                   for i, w in enumerate(widths))


def chip(x, y, text, cls, size, fg, bg, border=None, pad=12, h=30, dash=False, anchor="start", ls=0.8):
    """A rounded label. (x, y) is the left (or right, with anchor=end) of the chip and its vertical centre."""
    w = measure(text, cls, size, ls) + pad * 2
    x0 = x - w if anchor == "end" else x
    b = f' stroke="{border}" stroke-width="1.5"' if border else ""
    if dash:
        b += ' stroke-dasharray="4 4"'
    return (f'<rect x="{x0:.1f}" y="{y-h/2:.1f}" width="{w:.1f}" height="{h}" rx="{h/2}" fill="{bg}"{b}/>'
            + T(x0 + pad, y + size * 0.36, text, cls, size, fg, ls=ls)), w


def shadow_filter(fid, op=0.22, dy=10, blur=18):
    return (f'<filter id="{fid}" x="-20%" y="-20%" width="140%" height="150%">'
            f'<feDropShadow dx="0" dy="{dy}" stdDeviation="{blur/2}" flood-color="#0B0D10" flood-opacity="{op}"/></filter>')


def frame(W, H, t, r=28):
    """Background, clip and (on paper and night) a hairline edge for a self-painted panel."""
    head = (f'<clipPath id="clip"><rect width="{W}" height="{H}" rx="{r}"/></clipPath>')
    bg = f'<rect width="{W}" height="{H}" fill="{t["bg"]}"/>'
    edge = (f'<rect x=".75" y=".75" width="{W-1.5}" height="{H-1.5}" rx="{r-.75}" fill="none" stroke="{t["edge"]}" '
            f'stroke-width="1.5"/>') if t["edge"] else ""
    return head, bg, edge


def ledger_lines(W, H, col, step=44, op=1.0, y0=0):
    return "".join(f'<line x1="0" y1="{y}" x2="{W}" y2="{y}" stroke="{col}" stroke-opacity="{op}"/>'
                   for y in range(y0, H, step))


# ================================================================ HERO
NOTICE_PROOF = ["You are hereby directed to explain the",
                "discrepancies and pay the tax of Rs. 4,52,300",
                "with interest within 30 days of receipt of",
                "this notice."]


def notice_page(x, y, w, h, fid="sh", proof_lines=NOTICE_PROOF, size=17, box_cls="wipe", badge=True):
    """The sample GST notice from the website (apps/site/lib/sample.ts), as a white page."""
    g = f'<g filter="url(#{fid})"><rect x="{x}" y="{y}" width="{w}" height="{h}" rx="6" fill="#FFFFFF"/></g>'
    cx = x + w / 2
    g += bars(cx - 130, y + 40, [260], N[6], h=7) + bars(cx - 100, y + 58, [200], N[5], h=6)
    g += T(cx, y + 104, "FORM GST ASMT-10", "fmb", 15, N[12], "middle", 1.5)
    g += T(x + 32, y + 138, "Ref ZD2910260012345", "fm", 13, N[9])
    g += T(x + w - 32, y + 138, "20 Oct 2026", "fm", 13, N[9], "end")
    g += f'<line x1="{x+32}" y1="{y+154}" x2="{x+w-32}" y2="{y+154}" stroke="{N[4]}"/>'
    g += bars(x + 32, y + 176, [w - 64, w - 90, w - 64, w - 150], N[5], gap=20)
    py = y + 268
    lh = size * 1.45
    bh = lh * len(proof_lines) + 18
    g += (f'<rect class="{box_cls}" x="{x+20}" y="{py}" width="{w-40}" height="{bh:.0f}" rx="5" fill="{HL}" '
          f'stroke="{STROKE}" stroke-width="2" style="animation-delay:.7s"/>')
    for i, line in enumerate(proof_lines):
        g += T(x + 32, py + 9 + lh * (i + 0.5) + size * 0.36, line, "fs", size, N[12])
    if badge:
        g += (f'<g class="pop" style="animation-delay:1.7s"><rect x="{x+w-112}" y="{py-30}" width="86" height="30" rx="15" '
              f'fill="{PROOF_BG}" stroke="{STROKE}" stroke-width="1.5"/>'
              + tick(x + w - 92, py - 14, PROOF_FG, .7, 2.2) + T(x + w - 78, py - 9.5, "EXACT", "fmb", 13, PROOF_FG, ls=1.2) + "</g>")
    ay = py + bh + 26
    g += bars(x + 32, ay, [w - 64, w - 110, w - 64, w - 200], N[5], gap=20)
    g += bars(x + 32, ay + 100, [w - 64, w - 160], N[5], gap=20)
    sx = x + w - 150
    g += (f'<path d="M{sx},{y+h-46} c14,-22 22,8 34,-6 s16,-18 26,0 s18,10 30,-8 s12,4 22,2" fill="none" '
          f'stroke="{N[10]}" stroke-width="2" stroke-linecap="round"/>')
    g += f'<line x1="{sx-6}" y1="{y+h-34}" x2="{x+w-32}" y2="{y+h-34}" stroke="{N[5]}"/>'
    return g, (x + 20, py, w - 40, bh)


def hero():
    W, H = 1600, 900
    t = THEMES["ink"]
    head, bg, _ = frame(W, H, t)
    px, py, pw, ph = 930, 150, 440, 640
    page, (bx, by, bw, bh) = notice_page(px, py, pw, ph)
    # the computed deadline card, linked to the outlined sentence by a hairline
    cx, cy, cw, ch = 1222, 540, 330, 236
    card = (f'<g class="fade" style="animation-delay:1.1s"><g filter="url(#sh2)"><rect x="{cx}" y="{cy}" width="{cw}" '
            f'height="{ch}" rx="14" fill="#FFFFFF"/></g>'
            + T(cx + 26, cy + 42, "REPLY DUE", "fmb", 14, INK, ls=1.8)
            + chip(cx + cw - 24, cy + 37, "MONDAY", "fmb", 12, N[9], N[2], anchor="end", h=26, pad=10, ls=1)[0]
            + T(cx + 24, cy + 102, "23 Nov 2026", "fx", 48, N[12], ls=-1.6)
            + T(cx + 26, cy + 136, "30 days from receipt on 24 Oct 2026", "fb", fit("30 days from receipt on 24 Oct 2026", "fb", 17, cw - 50), N[9])
            + f'<line x1="{cx+26}" y1="{cy+160}" x2="{cx+cw-26}" y2="{cy+160}" stroke="{N[4]}"/>'
            + f'<circle cx="{cx+38}" cy="{cy+196}" r="12" fill="{INK}"/>' + tick(cx + 38, cy + 196, "#FFFFFF", .62, 2.2)
            + T(cx + 60, cy + 192, "Computed by the date engine", "fs", 16, N[12])
            + T(cx + 60, cy + 214, "Holidays checked, working shown", "fr", 15, N[9]) + "</g>")
    lx, ly = bx + bw, by + bh / 2
    link = (f'<path class="draw" pathLength="1" d="M{lx},{ly:.0f} C{lx+70},{ly:.0f} {cx+60},{cy-70} {cx+60},{cy}" '
            f'fill="none" stroke="{STROKE}" stroke-width="2" style="animation-delay:1s"/>'
            f'<circle cx="{lx}" cy="{ly:.0f}" r="5" fill="{STROKE}"/><circle cx="{cx+60}" cy="{cy}" r="5" fill="{STROKE}"/>')

    # headline with the proof highlight behind its last line
    L = 64
    size = 92
    lines = ["Every deadline", "in your notices,", "proved on the page."]
    while max(measure(s, "fx", size, -size * .035) for s in lines) > 800:
        size -= 1
    ls = round(-size * .035, 2)
    ys = [292, 292 + size * 1.04, 292 + size * 2.08]
    hl_w = measure(lines[2], "fx", size, ls)
    headline = ""
    for i, (s, yy) in enumerate(zip(lines, ys)):
        if i == 2:
            headline += (f'<rect class="wipe" x="{L-12}" y="{yy-size*.80:.0f}" width="{hl_w+30:.0f}" height="{size*1.02:.0f}" '
                         f'rx="8" fill="{HL}" stroke="{STROKE}" stroke-width="2.5" style="animation-delay:.55s"/>')
            headline += T(L, yy, s, "fx", size, N[12], ls=ls)
        else:
            headline += f'<g class="fade" style="animation-delay:{.1*i:.1f}s">' + T(L - 4, yy, s, "fx", size, "#FFFFFF", ls=ls) + "</g>"
    lede = ["Dueproof reads tax, regulatory and court notices, finds",
            "what's owed and by when, and proves every finding on the",
            "page it came from. A person decides; code computes every date."]
    lsz = fit(max(lede, key=len), "fb", 25, 800)
    lede_svg = "".join(T(L, 590 + i * 38, s, "fb", lsz, t["mut"]) for i, s in enumerate(lede))

    stats = [("23", "languages a notice", "can be read in"), ("0", "dates written by a model;", "code computes them"),
             ("1", "place to look for proof:", "the page")]
    st = ""
    x = L
    for i, (n, a, b) in enumerate(stats):
        if i:
            x += 28
        st += (f'<g class="fade" style="animation-delay:{1.2+.12*i:.2f}s">' + T(x - 3, 778, n, "fx", 54, "#FFFFFF", ls=-2)
               + T(x + measure(n, "fx", 54, -2) + 14, 752, a, "fb", 17, t["mut"])
               + T(x + measure(n, "fx", 54, -2) + 14, 776, b, "fb", 17, t["mut"]) + "</g>")
        if i:
            st += f'<line x1="{x-14}" y1="726" x2="{x-14}" y2="790" stroke="{t["line"]}"/>'
        x += measure(n, "fx", 54, -2) + 14 + max(measure(a, "fb", 17), measure(b, "fb", 17)) + 28
        assert x - 28 < 900, x

    top = (mark(L, 44, 40, page="#FFFFFF", corner=INK_SUBTLE_FG_DARK, tick_col=INK)
           + T(L + 52, 74, "Dueproof", "fh", 30, "#FFFFFF", ls=-.6)
           + T(W - L, 70, "v0.1.0 BETA  /  INDIA FIRST  /  SELF-HOST FREE", "fm", 15, t["mut"], "end", 2)
           + f'<line x1="{L}" y1="108" x2="{W-L}" y2="108" stroke="#FFFFFF" stroke-opacity=".22"/>')
    body = f"""<defs>{head}{shadow_filter("sh", .35, 18, 34)}{shadow_filter("sh2", .30, 12, 26)}</defs>
<g clip-path="url(#clip)">{bg}{ledger_lines(W, H, "#FFFFFF", 44, .045, 20)}
{top}{headline}{lede_svg}{st}{page}{link}{card}
<line x1="{L}" y1="836" x2="{W-L}" y2="836" stroke="#FFFFFF" stroke-opacity=".22"/>
{T(L, 868, "TAX  /  REGULATORY  /  COURT NOTICES", "fm", 14, t["faint"], ls=2)}
{T(W-L, 868, "SAMPLE NOTICE: FICTIONAL OFFICE, REFERENCE AND COMPANY", "fm", 14, t["faint"], "end", 2)}
</g>"""
    write("hero.svg", doc(W, H, body, "", "Dueproof. Every deadline in your notices, proved on the page. Dueproof reads "
                          "tax, regulatory and court notices, finds what's owed and by when, and proves every finding "
                          "on the page it came from. A sample GST notice has one sentence highlighted: pay the tax of "
                          "Rs. 4,52,300 with interest within 30 days of receipt of this notice. A line links it to a "
                          "card: reply due 23 Nov 2026, 30 days from receipt on 24 Oct 2026, computed by the date engine."))


# ================================================================ SECTION HEADERS (transparent)
def header(name, idx, title, note):
    W, H = 1600, 112
    size = 54
    ls = -1.6
    tw = measure(title, "fx", size, ls)
    body = (T(2, 74, title, "fx", size, HEAD, ls=ls)
            + T(2 + tw + 16, 74, idx, "fmb", 18, HEAD, ls=1)
            + T(W - 4, 72, note.upper(), "fm", 17, HEAD_NOTE, "end", 2)
            + f'<rect class="wipe" x="4" y="98" width="{min(tw, 120):.0f}" height="5" rx="2.5" fill="{HEAD}"/>')
    write(name, doc(W, H, body, "", title))


# ================================================================ HOW IT WORKS (pipeline)
def icon(kind, x, y, t):
    """36 px line icons, drawn in the accent colour, top-left at (x, y)."""
    a, f = t["acc"], t["fg"]
    s = f'fill="none" stroke="{a}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"'
    if kind == "upload":
        return (f'<g transform="translate({x},{y})"><path d="M4,24 V32 H36 V24" {s}/><path d="M20,26 V4 M11,13 L20,4 L29,13" {s}/></g>')
    if kind == "read":
        return (f'<g transform="translate({x},{y})"><path d="M8,2 H26 L33,9 V36 H8 Z" {s}/>'
                f'<line class="scan" x1="4" y1="14" x2="37" y2="14" stroke="{a}" stroke-width="2.4" stroke-linecap="round"/></g>')
    if kind == "translate":
        return (T(x + 2, y + 24, "अ", "fi", 26, a) + T(x + 22, y + 36, "A", "fh", 20, a))
    if kind == "rules":
        return T(x + 6, y + 31, "§", "fh", 34, a)
    if kind == "date":
        return (f'<g transform="translate({x},{y})"><rect x="3" y="6" width="32" height="30" rx="5" {s}/>'
                f'<path d="M3,15 H35 M11,2 V9 M27,2 V9" {s}/></g>' + T(x + 19, y + 32, "23", "fmb", 12, a, "middle"))
    if kind == "proof":
        return (f'<g transform="translate({x},{y})"><path d="M8,2 H26 L33,9 V36 H8 Z" fill="none" stroke="{a}" stroke-width="2.4" '
                f'stroke-linejoin="round"/><rect x="4" y="17" width="33" height="9" rx="2" fill="{HL}" stroke="{STROKE}" stroke-width="1.5"/></g>')
    if kind == "track":
        return (f'<g transform="translate({x},{y})"><path d="M9,28 V17 a11,11 0 0 1 22,0 V28 L34,32 H6 Z" {s}/>'
                f'<path d="M16,35 a4,4 0 0 0 8,0" {s}/></g>')
    if kind == "ai":
        return (f'<g transform="translate({x},{y})"><path d="M18,2 C19,12 22,15 32,17 C22,19 19,22 18,32 C17,22 14,19 4,17 C14,15 17,12 18,2 Z" {s}/>'
                f'<path d="M31,2 V9 M27.5,5.5 H34.5" {s}/></g>')
    return ""


def pipeline():
    W, H = 1600, 820
    t = THEMES["paper"]
    head, bg, edge = frame(W, H, t)
    M, gap, cw, ch = 48, 32, 0, 270
    cw = (W - 2 * M - 3 * gap) / 4
    y1, y2 = 130, 130 + ch + 120
    steps = [
        ("01", "upload", "Upload", ["Drop a PDF or take a photo.", "Email, portal or posted letter."], "SIGNED, SHORT-LIVED LINKS"),
        ("02", "read", "Read", ["Text layer first, then OCR.", "Each rung only if needed."], "TEXT  >  PADDLE  >  TESSERACT"),
        ("03", "translate", "Translate", ["Indian languages, offline.", "IndicTrans2, on your server."], "THE ORIGINAL STAYS THE PROOF"),
        ("04", "rules", "Find", ["Rules read every notice:", "duties, amounts, hearings."], "A DATE RULE, NEVER A DATE"),
        ("05", "date", "Compute", ["The date engine counts", "and shows its working."], "30 DAYS FROM RECEIPT"),
        ("06", "proof", "Prove", ["Each finding outlined on", "the page it came from."], "UNLOCATED WAITS FOR A PERSON"),
        ("07", "track", "Track", ["Case, deadline, reminders,", "calendar and iCal feed."], "A PERSON DECIDES"),
    ]

    def card(i, x, y, step, dashed=False, delay=0.0):
        idx, ic, title, desc, tag = step
        fill = t["acc_subtle"] if dashed else t["card"]
        stroke = t["acc"] if dashed else t["line"]
        da = ' stroke-dasharray="7 6"' if dashed else ""
        g = (f'<g class="fade" style="animation-delay:{delay:.2f}s"><rect x="{x:.1f}" y="{y}" width="{cw:.1f}" height="{ch}" rx="18" '
             f'fill="{fill}" stroke="{stroke}" stroke-width="1.5"{da}/>')
        g += T(x + 28, y + 46, idx, "fmb", 18, t["acc"], ls=1)
        g += icon(ic, x + cw - 66, y + 22, t)
        g += T(x + 26, y + 124, title, "fx", 40, t["fg"], ls=-1.2)
        for k, d in enumerate(desc):
            g += T(x + 28, y + 168 + k * 30, d, "fb", fit(d, "fb", 22, cw - 50), t["mut"])
        tsz = fit(tag, "fm", 15, cw - 56, 1)
        g += f'<line x1="{x+28:.1f}" y1="{y+ch-52}" x2="{x+cw-28:.1f}" y2="{y+ch-52}" stroke="{t["line"]}"/>'
        g += T(x + 28, y + ch - 22, tag, "fm", tsz, t["acc_text"] if dashed else t["faint"], ls=1)
        return g + "</g>"

    xs = [M + k * (cw + gap) for k in range(4)]
    body = ""
    for k in range(4):
        body += card(k, xs[k], y1, steps[k], delay=.08 * k)
    for k in range(3):
        body += card(k, xs[k], y2, steps[4 + k], delay=.4 + .08 * k)
    body += card(3, xs[3], y2, ("AI", "ai", "AI, if on", ["Only where rules aren't sure.", "Off, local, your key, our plan."],
                                "HAIKU  >  SONNET  >  OPUS"), dashed=True, delay=.7)
    # connectors in the gaps
    ac = t["acc"]
    for k in range(3):
        x0 = xs[k] + cw + 4
        body += arrow(x0, y1 + ch / 2, x0 + gap - 8, y1 + ch / 2, ac, 2.4, 8)
        if k < 2:
            body += arrow(x0, y2 + ch / 2, x0 + gap - 8, y2 + ch / 2, ac, 2.4, 8)
    # return path: Find -> Compute
    gy = y1 + ch + 60
    sx = xs[3] + 70
    ex = xs[0] + cw / 2
    body += (f'<path class="flow" d="M{sx:.0f},{y1+ch+4} V{gy-16} Q{sx:.0f},{gy} {sx-16:.0f},{gy} H{ex+16:.0f} Q{ex:.0f},{gy} {ex:.0f},{gy+16} '
             f'V{y2-12}" fill="none" stroke="{ac}" stroke-width="2.4" stroke-dasharray="8 6" stroke-linecap="round"/>')
    body += arrow(ex, y2 - 22, ex, y2 - 4, ac, 2.4, 8)
    body += T((sx + ex) / 2, gy - 14, "rules and AI findings reconciled; each date rule becomes a date", "fr", 19,
              t["mut"], "middle")
    # AI link: Find <-> AI through the proof gate
    ax = xs[3] + cw - 70
    body += (f'<path d="M{ax:.0f},{y1+ch+6} V{y2-6}" stroke="{ac}" stroke-width="2.4" stroke-dasharray="3 6" '
             f'stroke-linecap="round" class="flow"/>')
    body += arrow(ax, y1 + ch + 20, ax, y1 + ch + 6, ac, 2.4, 8)
    gate, gw = chip(ax, gy, "PROOF GATE", "fmb", 14, PROOF_FG, PROOF_BG, STROKE, h=32, pad=14, ls=1.2)
    body += f'<g transform="translate({-gw/2:.1f},0)">{gate}</g>'

    top = (T(M + 4, 72, "A NOTICE'S JOURNEY", "fmb", 17, t["acc"], ls=2)
           + T(W - M, 72, "RULES FIRST  /  AI OPTIONAL  /  EVERY DATE COMPUTED", "fm", 16, t["faint"], "end", 2))
    css = ".scan{animation:scan 2.4s ease-in-out infinite alternate}@keyframes scan{from{transform:translateY(0)}to{transform:translateY(16px)}}"
    svg = f"""<defs>{head}</defs><g clip-path="url(#clip)">{bg}{top}{body}</g>{edge}"""
    write("how-it-works.svg", doc(W, H, svg, css,
          "How a notice becomes a deadline, in seven steps. 1 Upload: drop a PDF or take a photo. 2 Read: the text layer "
          "first, then OCR with PaddleOCR and Tesseract, each only if needed. 3 Translate: Indian languages, offline, "
          "with IndicTrans2 on your server; the original stays the proof. 4 Find: rules read every notice for duties, "
          "amounts and hearings, and return a date rule, never a date. Optional AI (off, local, your own key or the "
          "Dueproof plan, routed Haiku, Sonnet, Opus) helps only where rules aren't sure, and its findings pass the same "
          "proof gate. 5 Compute: the date engine counts, with holidays and its working shown. 6 Prove: each finding is "
          "outlined on its page; an unlocated finding waits for a person. 7 Track: case, deadline, reminders, calendar "
          "and iCal feed. A person decides."))


# ================================================================ BENTO TILES
TILE_H = 640
WIDE_W, NARROW_W = 1140, 560
ART_Y, ART_H = 96, 330


def tile(name, size, theme, idx, kind, title, desc, art, label, css=""):
    t = THEMES[theme]
    W = WIDE_W if size == "wide" else NARROW_W
    H = TILE_H
    head, bg, edge = frame(W, H, t)
    aw = W - 64
    body = f'<defs>{head}{shadow_filter("tsh", .16 if theme != "night" else .5, 8, 18)}</defs><g clip-path="url(#clip)">{bg}'
    body += T(34, 60, idx, "fmb", 18, t["acc_text"], ls=1) + T(74, 60, kind.upper(), "fm", 16, t["mut"], ls=1.6)
    body += f'<g transform="translate(32,{ART_Y})">{art(t, aw)}</g>'
    body += f'<line x1="34" y1="450" x2="{W-34}" y2="450" stroke="{t["line"]}"/>'
    body += T(32, 516, title, "fx", fit(title, "fx", 52, W - 68, -1.6), t["fg"], ls=-1.6)
    body += T(34, 562, desc[0], "fb", fit(desc[0], "fb", 24, W - 68), t["fg"])
    body += T(34, 596, desc[1], "fb", fit(desc[1], "fb", 24, W - 68), t["mut"])
    body += "</g>" + edge
    write(name, doc(W, H, body, css, label))


def art_proof(t, aw):
    # left: the page with the outlined sentence; right: the findings, graded
    pw = 380
    g = f'<g filter="url(#tsh)"><rect x="6" y="6" width="{pw}" height="318" rx="6" fill="#FFFFFF"/></g>'
    g += T(26, 40, "FORM GST ASMT-10", "fmb", 13, N[12], ls=1.2) + T(pw - 14, 40, "PAGE 1", "fm", 12, N[8], "end", 1)
    g += bars(26, 60, [pw - 40, pw - 70, pw - 52], N[5], gap=18)
    lines = ["You are hereby directed to explain the", "discrepancies and pay the tax of", "Rs. 4,52,300 with interest within 30",
             "days of receipt of this notice."]
    py = 124
    g += (f'<rect class="box" pathLength="1" x="16" y="{py}" width="{pw-20}" height="110" rx="5" fill="{HL}" stroke="{STROKE}" '
          f'stroke-width="2"/>')
    for i, s in enumerate(lines):
        g += T(28, py + 28 + i * 24, s, "fs", fit(s, "fs", 15.5, pw - 50), N[12])
    g += bars(26, 252, [pw - 40, pw - 120, pw - 40], N[5], gap=18)
    # grades
    rx = pw + 80
    rows = [("EXACT", "Pay tax with interest", "23 Nov 2026", "solid"),
            ("EXACT", "Personal hearing", "18 Nov 2026", "solid"),
            ("STRONG", "Amount demanded", "₹4,52,300", "line"),
            ("APPROXIMATE", "Section cited", "Sec 61", "dash"),
            ("UNLOCATED", "Not found on the page", "needs a person", "none")]
    g += T(rx, 22, "WHAT THE NOTICE SAYS, GRADED AGAINST THE PAGE", "fm", 14, t["faint"], ls=1.4)
    for i, (grade, lab, val, style) in enumerate(rows):
        y = 70 + i * 58
        if style == "solid":
            c, _ = chip(rx, y, grade, "fmb", 13, PROOF_FG, PROOF_BG, STROKE, h=30, ls=1)
        elif style == "line":
            c, _ = chip(rx, y, grade, "fmb", 13, PROOF_FG, t["card"], STROKE, h=30, ls=1)
        elif style == "dash":
            c, _ = chip(rx, y, grade, "fmb", 13, PROOF_FG, t["card"], STROKE, h=30, dash=True, ls=1)
        else:
            c, _ = chip(rx, y, grade, "fmb", 13, t["mut"], t["card"], t["faint"], h=30, dash=True, ls=1)
        g += f'<g class="fade" style="animation-delay:{.9+.12*i:.2f}s">{c}'
        g += T(rx + 170, y + 7, lab, "fs", 21, t["fg"] if style != "none" else t["mut"])
        g += T(aw - 6, y + 7, val, ("fh" if "₹" in val else "fmb") if style != "none" else "fm", 16, t["fg"] if style != "none" else t["mut"], "end", .5)
        g += f'<line x1="{rx}" y1="{y+29}" x2="{aw-6}" y2="{y+29}" stroke="{t["line"]}"/></g>'
    g += (f'<path class="draw" pathLength="1" d="M{pw-4},{py+55} C{pw+40},{py+55} {pw+30},70 {rx-8},70" fill="none" '
          f'stroke="{STROKE}" stroke-width="2" style="animation-delay:.8s"/><circle cx="{pw-4}" cy="{py+55}" r="4.5" fill="{STROKE}"/>')
    return g


PROOF_CSS = ".box{stroke-dasharray:1;animation:draw 1.4s cubic-bezier(.65,0,.25,1) .2s both}"


def art_dates(t, aw):
    c = aw / 2
    q = "“within 30 days of receipt”"
    qw = measure(q, "fs", 22) + 32
    g = (f'<rect class="wipe" x="{c-qw/2:.0f}" y="0" width="{qw:.0f}" height="44" rx="6" fill="{HL}" stroke="{STROKE}" stroke-width="2"/>'
         + T(c, 29, q, "fs", 22, N[12], "middle"))
    g += arrow(c, 52, c, 84, t["mut"], 2, 8)
    code = [('{ "type": ', '"relative",'), ('  "anchor": ', '"receipt",'), ('  "amount": ', "30,"), ('  "unit": ', '"days" }')]
    g += f'<rect x="{c-210}" y="92" width="420" height="136" rx="12" fill="{INK_PRESSED}"/>'
    g += T(c + 194, 116, "DATERULE", "fmb", 12, t["faint"], "end", 1.5)
    for i, (k, v) in enumerate(code):
        y = 126 + i * 26
        g += (f'<g class="fade" style="animation-delay:{.4+.1*i:.1f}s"><text x="{c-186:.1f}" y="{y}" class="fm" '
              f'font-size="17" fill="{t["mut"]}" xml:space="preserve">{escape(k)}<tspan fill="#FFFFFF">{escape(v)}</tspan></text></g>')
    g += arrow(c, 236, c, 266, t["mut"], 2, 8)
    g += T(c + 14, 258, "packages/core", "fm", 14, t["faint"])
    g += (f'<g class="pop" style="animation-delay:1.1s"><rect x="{c-150}" y="272" width="300" height="56" rx="28" fill="#FFFFFF"/>'
          + T(c, 309, "23 Nov 2026", "fx", 28, INK, "middle", -.6) + "</g>")
    return g


def art_langs(t, aw):
    words = [("हिन्दी", "HINDI"), ("தமிழ்", "TAMIL"), ("বাংলা", "BENGALI"),
             ("తెలుగు", "TELUGU"), ("മലയാളം", "MALAYALAM"), ("اردو", "URDU")]
    cw = aw / 3
    g = ""
    for i, (w, lab) in enumerate(words):
        x = (i % 3) * cw + cw / 2
        y = 20 + (i // 3) * 138
        g += (f'<g class="fade" style="animation-delay:{.1*i:.1f}s"><rect x="{x-cw/2+6:.0f}" y="{y}" width="{cw-12:.0f}" height="122" rx="14" '
              f'fill="{t["card"]}" stroke="{t["line"]}"/>'
              + T(x, y + 70, w, "fi", fit(w, "fi", 36, cw - 44), t["fg"], "middle") + T(x, y + 104, lab, "fm", 13, t["faint"], "middle", 1.5) + "</g>")
    g += T(aw / 2, 314, "+ 16 MORE  /  TRANSLATION TESTED END TO END IN THESE SIX", "fm", 13.5, t["mut"], "middle", 1)
    return g


def art_ocr(t, aw):
    rungs = [("1", "PDF text layer", "any script, as written"), ("2", "PaddleOCR", "scans in Latin script"),
             ("3", "Tesseract", "per-language packs"), ("4", "Vision model", "only with AI on")]
    sw, gx = 190, 16
    tops = [196, 144, 92, 40]
    bar_y = 80
    g = ""
    for i, (n, name, note) in enumerate(rungs):
        x = 6 + i * (sw + gx)
        top = tops[i]
        dash = ' stroke-dasharray="7 6"' if i == 3 else ""
        g += (f'<g class="fade" style="animation-delay:{.15*i:.2f}s"><rect x="{x}" y="{top}" width="{sw}" height="{326-top}" rx="14" '
              f'fill="{t["card"]}" stroke="{t["line"] if i < 3 else t["acc"]}" stroke-width="1.5"{dash}/>'
              + f'<circle cx="{x+28}" cy="{top+32}" r="14" fill="{t["acc"]}"/>' + T(x + 28, top + 37.5, n, "fmb", 15, "#FFFFFF", "middle")
              + T(x + 52, top + 39, name, "fh", fit(name, "fh", 20, sw - 62), t["fg"])
              + T(x + 18, top + 72, note, "fr", fit(note, "fr", 16.5, sw - 30), t["mut"]) + "</g>")
    cs = [6 + i * (sw + gx) + sw - 40 for i in range(3)]
    path = f"M{cs[0]},{tops[0]-26} V{tops[1]-26} H{cs[1]} V{tops[2]-26} H{cs[2]}"
    end = (cs[2], tops[2] - 26)
    ex = 6 + 4 * (sw + gx)
    g += (f'<line x1="0" y1="{bar_y}" x2="{6+3*(sw+gx)-12}" y2="{bar_y}" stroke="{t["acc"]}" stroke-width="2" stroke-dasharray="3 6"/>'
          + T(2, bar_y - 14, "CONFIDENCE BAR", "fmb", 13, t["acc_text"], ls=1.5))
    g += f'<path d="{path}" fill="none" stroke="{t["faint"]}" stroke-width="1.5" stroke-dasharray="2 6"/>'
    g += (f'<style>.climb{{transform:translate({end[0]}px,{end[1]}px)}}</style>'
          f'<g class="climb"><path d="M-12,-16 H5 L12,-9 V16 H-12 Z" fill="#FFFFFF" stroke="{t["fg"]}" stroke-width="2" '
          f'stroke-linejoin="round"/><rect x="-8" y="-3" width="16" height="6" rx="1" fill="{HL}"/></g>')
    g += (f'<g class="pop" style="animation-delay:1.6s"><circle cx="{end[0]+34}" cy="{end[1]-14}" r="12" fill="{t["acc"]}"/>'
          + tick(end[0] + 34, end[1] - 14, "#FFFFFF", .6, 2.2) + "</g>")
    lx = ex + 6
    g += (f'<rect x="{lx}" y="{tops[1]}" width="{aw-lx-4}" height="{326-tops[1]}" rx="14" fill="{t["acc_subtle"]}"/>'
          + T(lx + 22, tops[1] + 40, "STILL BELOW THE BAR", "fmb", 13, t["acc_text"], ls=1.2)
          + T(lx + 22, tops[1] + 92, "Needs review", "fh", 22, t["fg"])
          + T(lx + 22, tops[1] + 122, "A person reads it.", "fr", 17, t["mut"]))
    return g


def ocr_css():
    sw, gx, tops = 190, 16, [196, 144, 92]
    cs = [6 + i * (sw + gx) + sw - 40 for i in range(3)]
    path = f"M{cs[0]},{tops[0]-26} V{tops[1]-26} H{cs[1]} V{tops[2]-26} H{cs[2]}"
    return ("g.climb{transform:none;offset-path:path('" + path + "');offset-rotate:0deg;"
            "animation:climb 6s cubic-bezier(.6,0,.3,1) infinite}"
            "@keyframes climb{0%{offset-distance:0%;opacity:0}6%{opacity:1}70%,92%{offset-distance:100%;opacity:1}"
            "100%{offset-distance:100%;opacity:0}}")


def art_register(t, aw):
    groups = [("OVERDUE", 1, [("GSTR-1  /  Oct 2026", "Statutory", "11 Nov", OVERDUE)]),
              ("THIS WEEK", 2, [("Personal hearing", "Notice", "18 Nov", WEEK), ("GSTR-3B  /  Oct 2026", "Statutory", "20 Nov", WEEK)]),
              ("LATER", 1, [("Reply to ASMT-10", "Notice", "23 Nov", LATER)])]
    g, y = "", 8
    for gi, (name, n, rows) in enumerate(groups):
        g += T(4, y + 14, f"{name}  {n}", "fmb", 13, t["faint"], ls=1.5)
        y += 26
        for lab, kind, date, due in rows:
            g += (f'<g class="fade" style="animation-delay:{.2+.12*gi:.2f}s"><rect x="0" y="{y}" width="{aw}" height="52" rx="10" '
                  f'fill="{t["card"]}" stroke="{t["line"]}"/>' + T(16, y + 24, lab, "fs", 18, t["fg"])
                  + T(16, y + 43, kind, "fr", 14, t["mut"])
                  + chip(aw - 12, y + 26, date, "fmb", 13, due["fg"], due["bg"], due["border"], h=28, pad=11, anchor="end", ls=.5)[0]
                  + "</g>")
            y += 60
        y += 6
    return g


def art_ai(t, aw):
    segs = ["Off", "Local", "Your key", "Our plan"]
    sw = aw / 4
    g = f'<rect x="0" y="6" width="{aw}" height="56" rx="14" fill="{t["card"]}" stroke="{t["line"]}"/>'
    g += f'<rect x="5" y="11" width="{sw-10:.0f}" height="46" rx="10" fill="{t["acc"]}"/>'
    for i, s in enumerate(segs):
        g += T(i * sw + sw / 2, 41, s, "fs", fit(s, "fs", 18, sw - 16), "#FFFFFF" if i == 0 else t["mut"], "middle")
    g += T(sw / 2, 88, "THE DEFAULT", "fm", 12, t["faint"], "middle", 1.2)
    # routing
    models = ["Haiku", "Sonnet", "Opus"]
    mw = 124
    gapx = (aw - 3 * mw) / 2
    for i, m in enumerate(models):
        x = i * (mw + gapx)
        g += (f'<g class="fade" style="animation-delay:{.3+.15*i:.2f}s"><rect x="{x:.0f}" y="124" width="{mw}" height="50" rx="12" '
              f'fill="{t["card"]}" stroke="{t["acc"]}" stroke-width="1.5"/>' + T(x + mw / 2, 156, m, "fh", 19, t["fg"], "middle") + "</g>")
        if i < 2:
            g += arrow(x + mw + 8, 149, x + mw + gapx - 8, 149, t["acc_text"], 2, 7)
    g += T(aw / 2, 206, "ESCALATES ONLY WHEN THE PROOF GATE FAILS", "fm", 12.5, t["faint"], "middle", 1)
    g += (f'<rect x="0" y="228" width="{aw}" height="52" rx="12" fill="{PROOF_BG_DARK}" stroke="{PROOF_BORDER_DARK}" stroke-width="1.5"/>'
          + T(aw / 2, 260, "PROOF GATE: SAME GRADING AS RULES", "fmb", 14, PROOF_FG_DARK, "middle", 1.2))
    g += T(aw / 2, 314, "rules read every notice, AI or not", "fr", 16, t["mut"], "middle")
    return g




def art_private(t, aw):
    g = (f'<rect x="0" y="4" width="{aw}" height="132" rx="16" fill="none" stroke="{t["mut"]}" stroke-width="1.5" stroke-dasharray="6 6"/>'
         + T(18, 30, "YOUR SERVER", "fmb", 13, t["mut"], ls=1.5))
    for i, (n, sub) in enumerate([("app", "Next.js"), ("engine", "Python"), ("postgres", "RLS")]):
        x = 18 + i * 140
        g += (f'<rect x="{x}" y="46" width="126" height="72" rx="12" fill="{INK_PRESSED}"/>'
              + T(x + 63, 78, n, "fmb", 16, "#FFFFFF", "middle") + T(x + 63, 102, sub, "fr", 15, t["mut"], "middle"))
    ox = aw - 34
    g += arrow(18 + 2 * 140 + 50 + 76, 82, ox + 10, 82, t["faint"], 2.2, 8, dash="4 5")
    g += f'<circle cx="{ox-14}" cy="82" r="13" fill="{t["bg"]}" stroke="#FFFFFF" stroke-width="2"/>' + cross(ox - 14, 82, "#FFFFFF", 5, 2.4)
    items = ["No telemetry, no phone-home", "Engine has no network route out", "Row-level security per organisation",
             "Document text never logged"]
    for i, s in enumerate(items):
        y = 176 + i * 40
        g += (f'<g class="fade" style="animation-delay:{.3+.1*i:.1f}s"><circle cx="13" cy="{y-6}" r="12" fill="#FFFFFF"/>'
              + tick(13, y - 6, INK, .6, 2.2) + T(38, y, s, "fs", fit(s, "fs", 19, aw - 40), "#FFFFFF") + "</g>")
    return g


def bento():
    tile("tile-proof.svg", "wide", "paper", "01", "The page is the proof", "Proof on the page",
         ("Every finding is outlined on the page it came from.", "If it can't be found there, it can't become a deadline."),
         art_proof, "Proof on the page. Every finding is outlined on the page it came from and graded exact, strong, "
         "approximate or unlocated. A finding that can't be found on the page can't become a deadline until a person "
         "confirms it.", PROOF_CSS)
    tile("tile-dates.svg", "narrow", "ink", "02", "Never generated", "Dates are computed",
         ("Rules turn words into a date rule.", "One date engine turns it into a date."),
         art_dates, "Dates are computed, never generated. The quote 'within 30 days of receipt' becomes a date rule: "
         "relative, anchor receipt, amount 30, unit days. The date engine in packages/core turns it into 23 Nov 2026.")
    tile("tile-languages.svg", "narrow", "night", "03", "Translated offline", "Indian languages",
         ("English and the 22 scheduled languages.", "IndicTrans2 translates on your server."),
         art_langs, "Indian languages: notices in English and the 22 scheduled Indian languages, translated offline by "
         "IndicTrans2 on your own server. Translation is tested end to end in Hindi, Tamil, Bengali, Telugu, Malayalam "
         "and Urdu.")
    tile("tile-ocr.svg", "wide", "paper", "04", "Scans and phone photos", "The OCR ladder",
         ("Each page climbs only as far as it needs to.", "Still below the confidence bar, it goes to a person."),
         art_ocr, "The OCR ladder: the PDF text layer first, then PaddleOCR, then Tesseract with per-language packs, then "
         "a vision model when AI is on. A page still below the confidence bar goes to Needs review.", ocr_css())
    tile("tile-register.svg", "narrow", "paper", "05", "One register", "Cases and deadlines",
         ("Every duty in one register, by week.", "In a calendar, or as an iCal feed."),
         art_register, "Cases and deadlines: every duty in one register, grouped overdue, this week and later, with a "
         "calendar view and an iCal feed.")
    tile("tile-ai.svg", "narrow", "night", "06", "Off by default", "AI, your way",
         ("Off, a local model, your key or our plan.", "Its findings pass the same proof gate."),
         art_ai, "AI, your way: off by default, a local model, your own key, or the Dueproof plan. Routed Haiku, then "
         "Sonnet, then Opus only when the proof gate fails. Its findings pass the same proof gate as the rules.")
    tile("tile-private.svg", "narrow", "ink", "07", "Self-hosted", "Private by design",
         ("Your notices stay on your server.", "Nothing is sent to us."),
         art_private, "Private by design: self-hosted, no telemetry and no phone-home, the engine has no network route "
         "out, row-level security per organisation, and document text is never logged.")


# ================================================================ EDITIONS
def editions():
    W, H = 1600, 680
    t = THEMES["paper"]
    head, bg, edge = frame(W, H, t)
    M, gap = 48, 28
    cw = (W - 2 * M - 2 * gap) / 3
    cards = [
        ("HOSTED", "Run by us", "dueproof-app.vercel.app", "TRY IT LIVE",
         ["Vercel, Neon and Cloudflare R2", "Plans with or without AI", "Data in Singapore and Asia-Pacific"], "cloud", True),
        ("SELF-HOSTED", "Free, on your server", "docker compose up -d --build", "FREE",
         ["Four containers, behind Caddy", "No telemetry, nightly backups", "Business adds SAML SSO (ee/)"], "server", False),
        ("DESKTOP", "Linux today", "Tauri 2, connects to a server", "BETA",
         ["OS notifications and a tray", "Deep links, start at login", "Windows and macOS coming"], "laptop", False),
    ]
    body = ""
    for i, (kind, title, sub, tag, items, art, lead) in enumerate(cards):
        x = M + i * (cw + gap)
        y = 112
        ch = 500
        fill = INK if lead else t["card"]
        fg = "#FFFFFF" if lead else t["fg"]
        mut = INK_SUBTLE_FG_DARK if lead else t["mut"]
        acc = "#FFFFFF" if lead else t["acc"]
        body += f'<g class="fade" style="animation-delay:{.12*i:.2f}s">'
        body += (f'<rect x="{x:.0f}" y="{y}" width="{cw:.0f}" height="{ch}" rx="20" fill="{fill}"'
                 f'{"" if lead else " stroke=\"" + t["line"] + "\" stroke-width=\"1.5\""}/>')
        body += T(x + 30, y + 50, kind, "fmb", 16, acc, ls=2)
        c, _ = chip(x + cw - 28, y + 44, tag, "fmb", 13, INK if lead else t["acc"], "#FFFFFF" if lead else t["acc_subtle"],
                    anchor="end", h=30, ls=1.2)
        body += c
        # illustration
        ix, iy = x + 30, y + 86
        sc = "#FFFFFF" if lead else t["acc"]
        s = f'fill="none" stroke="{sc}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"'
        if art == "cloud":
            body += (f'<path d="M{ix+18},{iy+70} H{ix+92} a22,22 0 0 0 0,-44 a32,32 0 0 0 -60,-6 a20,20 0 0 0 -14,50 Z" {s}/>'
                     f'<path d="M{ix+55},{iy+58} V{iy+36} M{ix+46},{iy+45} L{ix+55},{iy+36} L{ix+64},{iy+45}" {s}/>')
        elif art == "server":
            for k in range(3):
                body += (f'<rect x="{ix+4}" y="{iy+6+k*24}" width="104" height="18" rx="5" {s}/>'
                         f'<circle class="pulse" cx="{ix+20}" cy="{iy+15+k*24}" r="3.5" fill="{sc}" style="animation-delay:{k*.4:.1f}s"/>')
        else:
            body += (f'<rect x="{ix+12}" y="{iy+6}" width="88" height="58" rx="6" {s}/><path d="M{ix},{iy+74} H{ix+112}" {s}/>'
                     f'<rect x="{ix+26}" y="{iy+24}" width="60" height="8" rx="2" fill="{HL}"/>')
        body += T(x + 28, y + 222, title, "fx", fit(title, "fx", 40, cw - 56, -1.2), fg, ls=-1.2)
        body += T(x + 30, y + 260, sub, "fm", fit(sub, "fm", 17, cw - 60), acc if lead else t["acc_text"])
        body += f'<line x1="{x+30:.0f}" y1="{y+290}" x2="{x+cw-30:.0f}" y2="{y+290}" stroke="{"#3B55A6" if lead else t["line"]}"/>'
        for k, it in enumerate(items):
            yy = y + 336 + k * 46
            body += (f'<circle cx="{x+40:.0f}" cy="{yy-7}" r="11" fill="{"#FFFFFF" if lead else t["acc_subtle"]}"/>'
                     + tick(x + 40, yy - 7, INK, .55, 2.2) + T(x + 62, yy, it, "fb", fit(it, "fb", 21, cw - 92), fg if k == 0 else mut))
        body += "</g>"
    top = (T(M + 4, 72, "THREE WAYS TO RUN IT", "fmb", 17, t["acc"], ls=2)
           + T(W - M, 72, "SAME PRODUCT  /  SAME PROOF", "fm", 16, t["faint"], "end", 2))
    foot = (T(M + 4, 650, "PHONE", "fmb", 15, t["acc"], ls=2)
            + T(M + 90, 650, "The web app installs as a PWA, with camera capture and Web Push.", "fb", 19, t["mut"]))
    svg = f'<defs>{head}</defs><g clip-path="url(#clip)">{bg}{top}{body}{foot}</g>{edge}'
    write("editions.svg", doc(W, H, svg, "",
          "Three ways to run Dueproof. Hosted, run by us at dueproof-app.vercel.app on Vercel, Neon and Cloudflare R2, "
          "with plans with or without AI; data is stored in Singapore and Asia-Pacific. Self-hosted, free on your own "
          "server with Docker Compose: four containers behind Caddy, no telemetry, nightly backups; the Business edition "
          "adds SAML single sign-on from ee/. Desktop, a Tauri 2 app that connects to a server, with OS notifications, a tray, "
          "deep links and start at login; it runs on Linux today, and Windows and macOS builds are coming. "
          "On a phone, the web app installs as a PWA with camera capture and Web Push."))


# ================================================================ UNDER THE HOOD
def stack():
    W, H = 1600, 760
    t = THEMES["night"]
    head, bg, edge = frame(W, H, t)
    M = 52

    def box(x, y, w, h, name, sub, strong=False, dashed=False):
        fill = INK_DARK if strong else t["card"]
        st = "none" if strong else t["line"]
        da = ' stroke-dasharray="6 6"' if dashed else ""
        return (f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="14" fill="{fill}" stroke="{st}" stroke-width="1.5"{da}/>'
                + T(x + 22, y + 38, name, "fmb", 18, "#FFFFFF" if strong else t["fg"])
                + T(x + 22, y + 66, sub, "fr", 17, INK_SUBTLE_FG_DARK if strong else t["mut"]))

    lede = "One TypeScript monorepo,"
    g = T(M, 104, lede, "fx", 50, t["fg"], ls=-1.6)
    g += T(M + measure(lede, "fx", 50, -1.6) + 16, 104, "one Python engine.", "fx", 50, INK_TEXT_DARK, ls=-1.6)
    g += T(W - M, 60, "APPS  /  SERVICES  /  PACKAGES", "fm", 16, t["faint"], "end", 2)
    # diagram
    dx, dy = M, 170
    g += box(dx, dy, 330, 88, "browser  /  desktop  /  phone", "the same app everywhere")
    g += arrow(dx + 165, dy + 92, dx + 165, dy + 134, t["acc_text"], 2.2, 8)
    g += box(dx, dy + 140, 330, 88, "apps/app", "Next.js, server actions, /api/v1", strong=True)
    g += box(dx + 400, dy + 140, 250, 88, "Postgres", "row-level security")
    g += arrow(dx + 334, dy + 184, dx + 394, dy + 184, t["acc_text"], 2.2, 8)
    g += arrow(dx + 165, dy + 232, dx + 165, dy + 274, t["acc_text"], 2.2, 8)
    g += T(dx + 180, dy + 258, "signed, short-lived token", "fr", 15, t["faint"])
    g += box(dx, dy + 280, 330, 88, "services/engine", "Python, stateless, no DB")
    g += box(dx + 400, dy + 280, 250, 88, "file storage", "disk, S3 or R2")
    g += arrow(dx + 334, dy + 324, dx + 394, dy + 324, t["acc_text"], 2.2, 8)
    g += T(dx + 364, dy + 400, "signed links, 5 minutes at most", "fr", 15, t["faint"], "middle")
    g += (f'<rect x="{dx}" y="{dy+430}" width="650" height="100" rx="14" fill="{PROOF_BG_DARK}" stroke="{PROOF_BORDER_DARK}"/>'
          + T(dx + 22, dy + 468, "packages/core", "fmb", 18, PROOF_FG_DARK)
          + T(dx + 22, dy + 498, "The only place a date rule becomes a date. Pure functions, no I/O.", "fr", 17, ND[11]))
    # packages list
    lx = 790
    g += f'<line x1="{lx-36}" y1="170" x2="{lx-36}" y2="{H-58}" stroke="{t["line"]}"/>'
    pk = [("apps/site", "website and documentation"), ("apps/desktop", "Tauri 2 shell"),
          ("packages/contracts", "Zod schemas, DateRule, engine API"), ("packages/db", "Drizzle schema, migrations, RLS"),
          ("packages/ai", "providers, model routing, proof gate"), ("packages/auth", "Better Auth"),
          ("packages/storage", "local disk, S3, R2"), ("packages/ui", "Ledger components, Storybook"),
          ("packages/tokens", "design tokens, CSS variables"), ("packages/i18n", "messages, Indian number formats"),
          ("ee/", "Business features, commercial licence")]
    for i, (n, d) in enumerate(pk):
        y = 196 + i * 48
        g += (f'<g class="fade" style="animation-delay:{.05*i:.2f}s">' + T(lx, y, n, "fmb", 17, INK_TEXT_DARK if n != "ee/" else t["mut"])
              + T(lx + 250, y, d, "fr", 18, t["mut"]) + f'<line x1="{lx}" y1="{y+18}" x2="{W-M}" y2="{y+18}" stroke="{t["grid"]}"/></g>')
    svg = f'<defs>{head}</defs><g clip-path="url(#clip)">{bg}{g}</g>{edge}'
    write("stack.svg", doc(W, H, svg, "",
          "Under the hood: one TypeScript monorepo and one Python engine. Browser, desktop app and phone use apps/app "
          "(Next.js, server actions, /api/v1), which talks to Postgres with row-level security and calls services/engine "
          "(Python, stateless, no database) with a signed, short-lived token. The engine reads and writes file storage "
          "(local disk, S3 or R2) through signed links that last five minutes at most. packages/core is the only place "
          "a date rule becomes a date. Other packages: contracts, db, ai, auth, storage, ui, tokens and i18n; ee/ holds "
          "the Business features under a commercial licence."))


# ================================================================ CTA
def cta():
    W, H = 1600, 520
    t = THEMES["ink"]
    head, bg, _ = frame(W, H, t)
    M = 64
    url = "dueproof-app.vercel.app"
    g = ledger_lines(W, H, "#FFFFFF", 44, .045, 20)
    g += T(M, 84, "GET STARTED", "fmb", 17, t["mut"], ls=2)
    g += T(M - 4, 210, "Stop copying dates", "fx", 100, "#FFFFFF", ls=-3.5)
    l2 = "into a spreadsheet."
    g += T(M - 4, 316, l2, "fx", 100, t["faint"], ls=-3.5)
    g += f'<line x1="{M}" y1="372" x2="{W-M}" y2="372" stroke="#FFFFFF" stroke-opacity=".22"/>'
    g += T(M, 444, url, "fh", 40, "#FFFFFF", ls=-.8)
    g += f'<rect class="wipe" x="{M}" y="458" width="{measure(url, "fh", 40, -.8):.0f}" height="4" fill="#FFFFFF" style="animation-delay:.5s"/>'
    g += T(W - M, 430, "Self-host free with Docker", "fs", 22, "#FFFFFF", "end")
    g += T(W - M, 462, "POLYFORM SHIELD 1.0.0  /  FREE TO USE AND MODIFY", "fm", 15, t["mut"], "end", 1.5)
    g += mark(W - M - 168, 120, 168, page="#FFFFFF", corner=INK_SUBTLE_FG_DARK, tick_col=INK)
    svg = f'<defs>{head}</defs><g clip-path="url(#clip)">{bg}{g}</g>'
    write("cta.svg", doc(W, H, svg, "", "Stop copying dates into a spreadsheet. Try Dueproof at dueproof-app.vercel.app, or "
                         "self-host it free with Docker. Licensed under PolyForm Shield 1.0.0: free to use, self-host, modify and improve."))


HEADERS = [
    ("h-how.svg", "01", "How it works", "from the post to the register"),
    ("h-features.svg", "02", "What it does", "seven things it gets right"),
    ("h-see.svg", "03", "See it", "screens from v0.1"),
    ("h-run.svg", "04", "Ways to run it", "hosted, self-hosted, desktop"),
    ("h-start.svg", "05", "Get started", "hosted, docker, development"),
    ("h-hood.svg", "06", "Under the hood", "architecture and layout"),
    ("h-docs.svg", "07", "Documentation", "start, use, run, reference"),
    ("h-status.svg", "08", "Status", "0.1.0 beta, honestly"),
    ("h-contribute.svg", "09", "Contributing", "and reporting security problems"),
    ("h-licence.svg", "10", "Licence", "PolyForm Shield 1.0.0"),
]


def main():
    for f in os.listdir(OUT):
        if f.endswith(".svg"):
            os.remove(os.path.join(OUT, f))
    hero()
    pipeline()
    bento()
    editions()
    stack()
    cta()
    for f, i, title, note in HEADERS:
        header(f, i, title, note)
    files = sorted(f for f in os.listdir(OUT) if f.endswith(".svg"))
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f in files)
    print("\n".join(f"{os.path.getsize(os.path.join(OUT, f))/1024:>6.1f} KB  {f}" for f in files))
    print(f"{total/1024:>6.1f} KB  total")


if __name__ == "__main__":
    main()
