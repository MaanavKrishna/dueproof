"""Step 2 — understand the document.

Rule-based: title, type, summary bullets, obligations, deadlines and role
routing, all read off the document's own wording against the active profile's
vocabulary. Nothing leaves the machine,
and every finding carries an `evidence_quote` lifted verbatim so the linker can
ground it on the page.
"""
from __future__ import annotations

import re
from datetime import date, timedelta

from dueproof.config import LOCAL_SCRIPTS, LOCALS, MT_MAX_SENTENCES
from dueproof.profiles import (DEADLINE_MARKERS, DEFAULT_DOC_TYPE, DEFAULT_ROLE, DOC_TYPE_KEYWORDS, INFO_TERMS,
                      LOCAL_MONTHS, LOCAL_RELATIVE, MODAL_MARKERS, OBLIGATION_CUES,
                      ROLE_KEYWORDS, SEVERITY_HIGH, SUBJECT_WORDS, TITLE_STOPS)

# Every enabled non-Latin script, as a character-class body; "" when English only.
_SCRIPT = LOCAL_SCRIPTS
_SCRIPTS = [(lang["code"], re.compile(f"[{lang['script']}]")) for lang in LOCALS]
LATIN_CHAR = re.compile(r"[A-Za-z]")

# dates
EN_MONTHS = {m.lower(): i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"], 1)}
EN_MONTHS.update({m[:3]: i for m, i in list(EN_MONTHS.items())})
_EN = "|".join(sorted(EN_MONTHS, key=len, reverse=True))

# (pattern, (year group, month group, day group)).
DATE_PATTERNS = [
    (re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b"), (0, 1, 2)),
    (re.compile(r"\b(\d{1,2})[/.\-](\d{1,2})[/.\-](\d{4})\b"), (2, 1, 0)),
    (re.compile(rf"\b(\d{{1,2}})\s*(?:st|nd|rd|th)?\s+({_EN})\.?,?\s+(\d{{4}})\b", re.I), (2, 1, 0)),
    (re.compile(rf"\b({_EN})\.?\s+(\d{{1,2}})\s*(?:st|nd|rd|th)?,?\s+(\d{{4}})\b", re.I), (2, 0, 1)),
]
if LOCAL_MONTHS:
    _LOC = "|".join(re.escape(m) for m in sorted(LOCAL_MONTHS, key=len, reverse=True))
    # Tolerates what OCR leaves clinging to a month name: punctuation, joiners,
    # and the script's combining marks (a script character that is not \w).
    _SEP = rf"(?:[\s,.\-\u200c\u200d]|[{_SCRIPT}](?<=\W))*" if _SCRIPT else r"[\s,.\-]*"
    DATE_PATTERNS += [      # many languages write the year first: "2026 ഓഗസ്റ്റ് 21-ന്"
        (re.compile(rf"(\d{{4}})\s*({_LOC}){_SEP}(\d{{1,2}})"), (0, 1, 2)),
        (re.compile(rf"(\d{{1,2}}){_SEP}({_LOC}){_SEP}(\d{{4}})"), (2, 1, 0)),
        (re.compile(rf"({_LOC}){_SEP}(\d{{1,2}}){_SEP}(\d{{4}})"), (2, 0, 1)),
    ]
REL_EN = re.compile(r"within\s+(\d{1,3})\s+(day|week|month)s?", re.I)
REL_LOCAL = re.compile(LOCAL_RELATIVE) if LOCAL_RELATIVE else None
# A date is only a *deadline* when the sentence frames it as one; without this,
# issue dates and inspection windows get filed as obligations.
DEADLINE_RX = re.compile("(" + "|".join(DEADLINE_MARKERS) + ")", re.I) if DEADLINE_MARKERS \
    else re.compile(r"(?!)")

def parse_date(text: str, base: date | None = None) -> str | None:
    """The date that appears first in `text`, as ISO — or, failing an absolute
    one, a relative one ("within 15 days") off `base`."""
    best: tuple[int, str] | None = None
    for rx, (yi, mi, di) in DATE_PATTERNS:
        for m in rx.finditer(text):
            if best and m.start() >= best[0]:
                break                       # an earlier date is already in hand
            raw = [m[1], m[2], m[3]]
            try:
                mo = (int(raw[mi]) if raw[mi].isdigit()
                      else LOCAL_MONTHS.get(raw[mi]) or EN_MONTHS[raw[mi].lower()])
                best = (m.start(), date(int(raw[yi]), mo, int(raw[di])).isoformat())
                break
            except (ValueError, KeyError, TypeError):
                continue                    # "31/02/2026": keep looking
    if best:
        return best[1]
    if base:
        if m := REL_EN.search(text):
            return (base + timedelta(days=int(m[1]) * {"day": 1, "week": 7, "month": 30}
                                     [m[2].lower()])).isoformat()
        if REL_LOCAL and (m := REL_LOCAL.search(text)):
            return (base + timedelta(days=int(m[1]))).isoformat()
    return None

def deadline_in(s: str, base: date | None) -> str | None:
    return parse_date(s, base) if DEADLINE_RX.search(s) else None

# scoring
INFO_RX = re.compile("(" + "|".join([r"\d", "%", r"[$€£₹]"] + [re.escape(t) for t in INFO_TERMS])
                     + ")", re.I)
NOISE = re.compile(r"(page\s+\d+(\s+of\s+\d+)?|\d+|[-–—_=•*\s]{3,})", re.I)   # whole line only
SENTENCE_END = re.compile(r"[.।۔]\s*$")        # prose stops; ref bars and table rows don't
# A table row opening with its serial number. Bounded to 1-2 digits so a
# year-first local date ("2026 ജൂലൈ 8 മുതൽ…") is not caught.
TABLE_ROW = re.compile(r"^\d{1,2}[\s.)]")
MIN_BULLETS, MAX_BULLETS = 1, 6   # a one-line invoice gets one bullet, not padding

_SENTENCE_BREAK = re.compile(rf"(?<![A-Z]\.)(?<=[.;।۔])\s+(?=[A-Z0-9{_SCRIPT}])")

def _sentences(page_texts: list[str]) -> list[tuple[int, str]]:
    out = []
    for pno, txt in enumerate(page_texts, 1):
        for raw in txt.split("\n"):
            line = " ".join(raw.split())
            if len(line) < 30 or NOISE.fullmatch(line):
                continue
            # The lookbehind keeps "M.G. Road" intact: a period after a lone
            # capital is an abbreviation, not a full stop.
            for part in _SENTENCE_BREAK.split(line):
                if len(part.strip()) >= 30:
                    out.append((pno, part.strip()))
    return out

def _cue_score(s: str) -> int:
    low = s.lower()
    return sum(2 for cue in OBLIGATION_CUES if cue in low)

# Scoring reads a sentence together with its English gloss, when it has one:
# `t` below is "original + translation", so a duty is recognised whether the
# profile knows how that language words one or only English does. Shape tests
# (length, punctuation) stay on the original, `s`.
def _score_obligation(t: str, base: date | None) -> int:
    """A sentence is an obligation because it *directs* someone: a bare date is
    not enough, since issue dates carry dates too."""
    if not (cue := _cue_score(t)):
        return 0
    return (cue + (4 if deadline_in(t, base) else 0)
            + (1 if re.search(r"\b(clause|para|section)\s+\d", t.lower()) else 0)
            + (1 if any(r in t for r in MODAL_MARKERS) else 0))

def _score_bullet(s: str, t: str) -> int:
    """What a department head would want in a three-line summary."""
    cued = bool(_cue_score(t))
    score = min(len(s) // 45, 4) + min(len(INFO_RX.findall(t)), 5) + cued
    if re.match(r"^(sd/-|copy to|source:|cross-reference|page \d)", s.lower()) or _bad_title(s):
        score -= 6
    toks = s.split()
    if toks and sum(1 for t_ in toks if re.fullmatch(r"[\d.,%/-]+", t_)) / len(toks) > 0.3:
        score -= 5                    # a reflowed table row: numbers, no verb
    if TABLE_ROW.match(s):
        score -= 5                    # "1 LED station lighting assemblies 40 Nos."
    if len(toks) >= 6 and not cued and not SENTENCE_END.search(s):
        score -= 2
    return score

def route_roles(text: str) -> list[str]:
    low = text.lower()
    hits = [r for r, kws in ROLE_KEYWORDS.items() if any(k in low for k in kws)]
    return hits[:3] or [DEFAULT_ROLE]

def guess_doc_type(body: str, head: str = "", filename: str = "") -> str:
    """Weight by where the evidence sits: the masthead and the filename say what
    a document *is*, the body only says what it mentions."""
    low, hi = body.lower(), head.lower()
    fn = filename.lower().replace("-", " ").replace("_", " ")
    best, best_score = DEFAULT_DOC_TYPE, 0.0
    for dt, kws in DOC_TYPE_KEYWORDS.items():
        score = (sum(3.0 for k in kws if k in hi) + sum(2.0 for k in kws if k in fn)
                 + sum(0.6 for k in kws if k in low)
                 + (1.5 if any(w in fn for w in dt.lower().split()) else 0))
        if score > best_score:
            best, best_score = dt, score
    return best

# title
SUBJECT_LINE = re.compile(r"\b(?:" + "|".join(map(re.escape, SUBJECT_WORDS))
                          + r")\s*:\s*(.+)", re.I)                    # colon: "Sub-total" is safe
DOC_NOUN = re.compile(r"\b(minutes of|work order|tax invoice|purchase order|legal opinion|"
                      r"incident report)\b", re.I)
LETTERHEAD = re.compile(r"(gstin|limited|pvt ltd|government of|joint venture|department\s*$|circle\b)", re.I)
TITLE_STOP = re.compile(r"\s*(" + "|".join(re.escape(t) + r"\s*:" for t in TITLE_STOPS)
                        + "|Copy to)", re.I)                         # subject runs into addressee

def _bad_title(line: str) -> bool:
    """Letterhead, shouted masthead, or a reflowed table row."""
    if LETTERHEAD.search(line):
        return True
    letters = [c for c in line if c.isalpha()]
    if letters and sum(c.isupper() for c in letters) / len(letters) > 0.75:
        return True
    toks = line.split()
    return bool(toks) and sum(1 for t in toks if re.fullmatch(r"[\d.,%₹/-]+", t)) / len(toks) > 0.35

def _trim(s: str, limit: int = 110) -> str:
    s = TITLE_STOP.split(s)[0].strip(" -–—·")
    if len(s) <= limit:
        return s
    cut = s[:limit]
    return (cut[:cut.rfind(" ")] if " " in cut else cut).rstrip(" ,;·") + "…"

def _guess_title(page_texts: list[str], filename: str) -> str:
    """Prefer the subject line — the letterhead is identical on every document."""
    lines = [" ".join(l.split()) for l in (page_texts[0].split("\n") if page_texts else [])]
    for line in lines:
        if (m := SUBJECT_LINE.search(line)) and len(m.group(1)) > 10:
            return _trim(m.group(1))
    # A document noun names the document only when it opens a line near the top
    # of page one; buried in body prose it is just a cross-reference.
    for line in lines[:12]:
        if (m := DOC_NOUN.search(line)) and m.start() < 40 and len(line) > 15 and not _bad_title(line):
            return _trim(line)
    # Falling back to the filename beats guessing at a body sentence: real
    # attachments usually carry the reference number in the name.
    return " ".join(re.sub(r"\.pdf$", "", filename, flags=re.I)
                    .replace("-", " ").replace("_", " ").split())[:200]

# findings
def detect_lang(text: str) -> str:
    """Which language a passage is written in, by script. Code-mixed prose is
    the local language carrying English technical terms ("Maximo സിസ്റ്റത്തിൽ"),
    so a modest local share still means local."""
    text = text or ""
    code, loc = max(((c, len(rx.findall(text))) for c, rx in _SCRIPTS),
                    key=lambda t: t[1], default=("en", 0))
    return code if loc and loc / max(loc + len(LATIN_CHAR.findall(text)), 1) >= 0.20 else "en"

def _finding(text: str, page: int, gloss: str | None = None, **extra) -> dict:
    """One finding, filed under the language it was written in — deciding from
    the script is what lets the UI label honestly later. `gloss` is its machine
    translation, when the sentence was translated before analysis."""
    lang = detect_lang(text)
    return {"text_en": text if lang == "en" else gloss,
            "text_local": text if lang != "en" else None,
            "orig_lang": lang, "translated": bool(gloss) and lang != "en",
            "evidence_quote": text, "page": page, **extra}

def _glosses(cands: list[tuple[int, str]], translate) -> dict[str, str]:
    """English for the non-English candidate sentences, so the English rules can
    read them. This is what lets a language work with no vocabulary of its own."""
    if not translate:
        return {}
    todo = list(dict.fromkeys(s for _, s in cands if detect_lang(s) != "en"))[:MT_MAX_SENTENCES]
    out = translate([(detect_lang(s), s) for s in todo]) if todo else []
    return {s: en for s, en in zip(todo, out) if en}

def analyze(page_texts: list[str], filename: str, translate=None) -> dict:
    """`translate`, if given, maps [(language code, sentence)] to English (None
    where it could not). The evidence quote is always the original sentence."""
    full = "\n".join(page_texts)
    doc_date = parse_date(full[:1500])
    base = date.fromisoformat(doc_date) if doc_date else None
    cands = _sentences(page_texts)
    gloss = _glosses(cands, translate)
    seen_by = {s: f"{s} {gloss[s]}" if s in gloss else s for _, s in cands}     # s -> "t"

    obligations, seen = [], set()
    for score, pno, s in sorted(((_score_obligation(seen_by[s], base), pno, s) for pno, s in cands),
                                key=lambda t: (-t[0], t[1])):
        if score < 3 or len(obligations) >= 5:
            break
        if s[:60].lower() in seen:
            continue
        seen.add(s[:60].lower())
        t = seen_by[s]
        obligations.append(_finding(
            s, pno, gloss.get(s), due_date=deadline_in(t, base), roles=route_roles(t),
            severity="high" if any(k in t.lower() for k in SEVERITY_HIGH) else "medium"))

    # How many bullets a document deserves is the document's business, so take
    # whole sentences while they last. Ref bars, letterheads and reflowed table
    # rows have no terminal stop, which is what SENTENCE_END filters on; the
    # ungated pass only runs if that leaves the card too thin to be useful.
    summary, used_pages = [], set()
    ranked = sorted(((_score_bullet(s, seen_by[s]), pno, s) for pno, s in cands),
                    key=lambda t: (-t[0], t[1]))
    for sentences_only in (True, False):
        limit = MAX_BULLETS if sentences_only else MIN_BULLETS   # top up, don't pad
        for first_pass in (True, False):      # one per page first, so page 1 can't sweep
            for score, pno, s in ranked:
                if len(summary) >= limit:
                    break
                if score < 3 or s[:60].lower() in seen or (first_pass and pno in used_pages):
                    continue
                if sentences_only and not SENTENCE_END.search(s):
                    continue
                seen.add(s[:60].lower())
                used_pages.add(pno)
                # Bullets carry roles too: a payment term stated as prose rather
                # than as a duty is still the desk that needs to see the document.
                summary.append(_finding(s, pno, gloss.get(s), roles=route_roles(seen_by[s])))
        if len(summary) >= MIN_BULLETS:
            break

    return {"title": _guess_title(page_texts, filename),
            "doc_type": guess_doc_type(full, page_texts[0][:900] if page_texts else "", filename),
            "doc_date": doc_date, "summary": summary, "obligations": obligations}
