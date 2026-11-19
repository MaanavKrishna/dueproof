"""Step 2 — understand the document.

Rule-based: title, type, summary bullets, obligations, deadlines and role
routing, all read off the document's own wording against the active profile's
vocabulary. Nothing leaves the machine,
and every finding carries an `evidence_quote` lifted verbatim so the linker can
ground it on the page.
"""
from __future__ import annotations

import os
import re
from datetime import date, timedelta

from dueproof_engine import profiles as _profiles
from dueproof_engine.config import MT_MAX_SENTENCES
from dueproof_engine.languages import enabled as _enabled

# The profile this module instance reads. The module is imported once per
# profile (pipeline/analyzers.py sets PROFILE before executing it); a plain
# import reads the default profile, DUEPROOF_PROFILE.
_P = _profiles.load(globals().get("PROFILE") or _profiles.NAME)
PROFILE = _P.NAME
(DEADLINE_MARKERS, DEFAULT_DOC_TYPE, DEFAULT_ROLE, DOC_TYPE_KEYWORDS, INFO_TERMS, AUTHORITIES,
 DOC_TYPE_ROLES, HEARING_MARKERS, LOCAL_MONTHS, LOCAL_RELATIVE, MODAL_MARKERS, OBLIGATION_CUES,
 RECEIPT_MARKERS, REFERENCE_LABELS, ROLE_KEYWORDS, SEVERITY_HIGH, SUBJECT_WORDS, TITLE_STOPS) = (
    _P.DEADLINE_MARKERS, _P.DEFAULT_DOC_TYPE, _P.DEFAULT_ROLE, _P.DOC_TYPE_KEYWORDS, _P.INFO_TERMS,
    _P.AUTHORITIES, _P.DOC_TYPE_ROLES, _P.HEARING_MARKERS, _P.LOCAL_MONTHS, _P.LOCAL_RELATIVE,
    _P.MODAL_MARKERS, _P.OBLIGATION_CUES, _P.RECEIPT_MARKERS, _P.REFERENCE_LABELS,
    _P.ROLE_KEYWORDS, _P.SEVERITY_HIGH, _P.SUBJECT_WORDS, _P.TITLE_STOPS)
# The languages read beside English: DUEPROOF_LANGUAGES, else the profile's.
LOCALS = _enabled([c.strip() for c in (os.environ.get("DUEPROOF_LANGUAGES")
                                       or ",".join(_P.LANGUAGES)).split(",") if c.strip()])

# Every enabled non-Latin script, as a character-class body; "" when English only.
_SCRIPT = "".join(dict.fromkeys(lang["script"] for lang in LOCALS))
_SCRIPTS = [(lang["code"], re.compile(f"[{lang['script']}]")) for lang in LOCALS]
LATIN_CHAR = re.compile(r"[A-Za-z]")

# dates
EN_MONTHS = {m.lower(): i for i, m in enumerate(
    ["January", "February", "March", "April", "May", "June", "July", "August",
     "September", "October", "November", "December"], 1)}
EN_MONTHS.update({m[:3]: i for m, i in list(EN_MONTHS.items())})
EN_MONTHS["sept"] = 9
_EN = "|".join(sorted(EN_MONTHS, key=len, reverse=True))

# Every pattern names its groups y, m and d. A two-digit year ("20.10.26",
# "20-Oct-26") is read as 20xx: the documents this engine reads are from this
# century. The numeric two-digit form needs a two-digit day and month and one
# separator throughout, so "Clause 4.2.1" or "12.3.456" is not taken for a date.
DATE_PATTERNS = [
    re.compile(r"\b(?P<y>\d{4})-(?P<m>\d{2})-(?P<d>\d{2})\b"),
    re.compile(r"\b(?P<d>\d{1,2})[/.\-](?P<m>\d{1,2})[/.\-](?P<y>\d{4})\b"),
    re.compile(r"(?<![\d./\-])(?P<d>\d{2})(?P<sep>[/.\-])(?P<m>\d{2})(?P=sep)(?P<y>\d{2})(?!\d|[./\-]\d)"),
    # "20 October 2026", "20th day of October, 2026", "20-Oct-26", "20 Sept. 2026"
    re.compile(rf"\b(?P<d>\d{{1,2}})\s*(?:st|nd|rd|th)?(?:\s+day\s+of)?[\s\-./]*(?P<m>{_EN})\b\.?"
               rf"[\s,\-./]*(?P<y>\d{{4}}|\d{{2}})\b", re.I),
    re.compile(rf"\b(?P<m>{_EN})\.?\s+(?P<d>\d{{1,2}})\s*(?:st|nd|rd|th)?,?\s+(?P<y>\d{{4}})\b", re.I),
]
if LOCAL_MONTHS:
    _LOC = "|".join(re.escape(m) for m in sorted(LOCAL_MONTHS, key=len, reverse=True))
    # Tolerates what OCR leaves clinging to a month name: punctuation, joiners,
    # and the script's combining marks (a script character that is not \w).
    _SEP = rf"(?:[\s,.\-‌‍]|[{_SCRIPT}](?<=\W))*" if _SCRIPT else r"[\s,.\-]*"
    DATE_PATTERNS += [      # many languages write the year first: "2026 ഓഗസ്റ്റ് 21-ന്"
        re.compile(rf"(?P<y>\d{{4}})\s*(?P<m>{_LOC}){_SEP}(?P<d>\d{{1,2}})"),
        re.compile(rf"(?P<d>\d{{1,2}}){_SEP}(?P<m>{_LOC}){_SEP}(?P<y>\d{{4}})"),
        re.compile(rf"(?P<m>{_LOC}){_SEP}(?P<d>\d{{1,2}}){_SEP}(?P<y>\d{{4}})"),
    ]

# periods: "within 30 days", "within thirty (30) days", "not later than 15 days"
_SMALL = ["one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven",
          "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"]
_TENS = ["twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"]
NUMBER_WORDS = {w: i for i, w in enumerate(_SMALL, 1)} | {w: 10 * i for i, w in enumerate(_TENS, 2)}
_WORD = (rf"(?:(?:{'|'.join(_TENS)})(?:[\s\-]+(?:{'|'.join(_SMALL[:9])})\b)?"
         rf"|{'|'.join(sorted(_SMALL, key=len, reverse=True))})")
_NUM = rf"(?:\d{{1,3}}|{_WORD})"
REL_RX = re.compile(rf"\b(?:within|not later than|no later than)\s+(?:(?:a|the)\s+(?:period|maximum)\s+of\s+)?"
                    rf"(?P<n>{_NUM})(?:\s*\(\s*(?P<n2>{_NUM})\s*\))?\s+"
                    r"(?P<u>working\s+day|business\s+day|day|week|month)s?\b", re.I)
REL_LOCAL = re.compile(LOCAL_RELATIVE) if LOCAL_RELATIVE else None
# A date is only a *deadline* when the sentence frames it as one; without this,
# issue dates and inspection windows get filed as obligations.
DEADLINE_RX = re.compile("(" + "|".join(DEADLINE_MARKERS) + ")", re.I) if DEADLINE_MARKERS \
    else re.compile(r"(?!)")


def _number(text: str) -> int:
    """"30", "thirty" or "forty-five" as an int."""
    text = text.strip().lower()
    if text.isdigit():
        return int(text)
    return sum(NUMBER_WORDS[w] for w in re.split(r"[\s\-]+", text) if w)


def _iso(m: re.Match) -> str | None:
    raw_y, raw_m, raw_d = m["y"], m["m"], m["d"]
    try:
        year = int(raw_y) + (2000 if len(raw_y) == 2 else 0)
        month = (int(raw_m) if raw_m.isdigit()
                 else LOCAL_MONTHS.get(raw_m) or EN_MONTHS[raw_m.lower()])
        return date(year, month, int(raw_d)).isoformat()
    except (ValueError, KeyError, TypeError):
        return None                     # "31/02/2026" is not a day


def date_spans(text: str) -> list[tuple[int, int, str]]:
    """Every date in `text`, as (start, end, ISO date), in reading order. Where
    two patterns overlap, the earlier and then the longer match wins."""
    found = [(m.start(), m.end(), iso) for rx in DATE_PATTERNS for m in rx.finditer(text)
             if (iso := _iso(m))]
    out: list[tuple[int, int, str]] = []
    for start, end, iso in sorted(found, key=lambda t: (t[0], t[0] - t[1])):
        if not out or start >= out[-1][1]:
            out.append((start, end, iso))
    return out


def _periods(s: str) -> list[tuple[int, str]] | None:
    """Every "within N days" in `s`, as (amount, unit word), or None when a
    period contradicts itself ("within 30 (fifteen) days")."""
    out = []
    for m in REL_RX.finditer(s):
        n = _number(m["n"])
        if m["n2"] and _number(m["n2"]) != n:
            return None
        out.append((n, m["u"].lower().split()[0]))
    if not out and REL_LOCAL and (m := REL_LOCAL.search(s)):
        out.append((int(m[1]), "day"))
    return out


def parse_date(text: str, base: date | None = None) -> str | None:
    """The date that appears first in `text`, as ISO — or, failing an absolute
    one, a relative one ("within 15 days") off `base`. This is for the
    document's own date; in a deadline sentence, date_reading picks the date
    the duty applies to."""
    if spans := date_spans(text):
        return spans[0][2]
    if base and (days := relative_days(text)) is not None:
        return (base + timedelta(days=days)).isoformat()
    return None

DATED_RX = re.compile(r"\b(?:dated|date of issue|issued on|date)\s*[:\-]?\s*", re.I)
RECEIPT_RX = re.compile("(" + "|".join(RECEIPT_MARKERS) + ")", re.I) if RECEIPT_MARKERS \
    else re.compile(r"(?!)")
HEARING_RX = re.compile("(" + "|".join(HEARING_MARKERS) + ")", re.I) if HEARING_MARKERS \
    else re.compile(r"(?!)")

def relative_days(s: str) -> int | None:
    """"within 30 days" -> 30 (weeks and months converted, a month as 30
    days), else None. Working days need the holiday calendar, so None."""
    if not (periods := _periods(s)):
        return None
    n, unit = periods[0]
    return None if unit in ("working", "business") else n * {"day": 1, "week": 7, "month": 30}[unit]

def due_basis(s: str) -> str | None:
    """"receipt:30" when the deadline runs from the day the notice was received
    — the one date the notice itself cannot know — so it can be recomputed if
    the received date is corrected. None for any other kind of date."""
    rule, _ = date_reading(s)
    if (rule and rule["type"] == "relative" and RECEIPT_RX.search(s)
            and (days := relative_days(s)) is not None):
        return f"receipt:{days}"
    return None

def _absolute(s: str) -> bool:
    return any(rx.search(s) for rx in DATE_PATTERNS)

def deadline_in(s: str, base: date | None, received: date | None = None) -> str | None:
    """The deadline a sentence sets, if it sets one and it reads without doubt
    (see date_reading). Relative deadlines run from receipt when the sentence
    says so, otherwise from the document's own date."""
    rule, _ = date_reading(s)
    if not rule:
        return None
    if rule["type"] == "fixed":
        return rule["date"]
    start = received if received and due_basis(s) else base or received
    days = relative_days(s)
    return (start + timedelta(days=days)).isoformat() if start and days is not None else None

# date rules
# What a deadline sentence *says*, as a DateRule (packages/contracts/src/
# date-rule.ts). The TypeScript date engine turns rules into dates; the engine
# only extracts them.
CONDONE_RX = re.compile(r"(?:further|additional|extended)\s+period\s+(?:of\s+|not\s+exceeding\s+)?(\d{1,3})\s+"
                        r"(day|month)s?", re.I)
# What a relative period runs from, most specific first. Receipt markers come
# from the profile; "of service" among them is its own anchor.
ANCHORS = [("service", re.compile(r"(?:date of|from)\s+(?:the\s+)?(?:service|communication)|of service of|"
                                  r"(?:is|was|being)\s+(?:served|communicated)", re.I)),
           ("order", re.compile(r"(?:date of|from)\s+(?:the\s+)?(?:this\s+)?order\b", re.I)),
           ("hearing", re.compile(r"(?:date of|from)\s+(?:the\s+)?hearing\b", re.I))]

# Which date in a sentence the duty applies to. Each date is judged by the
# words just before it (and, for a superseded date, just after it):
#   superseded  "earlier fixed on X", "X is adjourned", "postponed from X"
#   named       "adjourned to X", "due date: X", "date of hearing: X"
#   due         "on or before X", "latest by X", "appear on X"
#   ignored     "dated X", "issued on X", "for the period X to Y", "w.e.f. X"
#   plain       anything else
_SUPERSEDED_BEFORE = re.compile(
    r"(?:(?:earlier|previously|originally|initially|already)\s+(?:\w+\s+){0,3}?"
    r"(?:fixed|scheduled|listed|posted|set|due|notified)\s+(?:on|for)"
    r"|instead\s+of|in\s+place\s+of|in\s+lieu\s+of"
    r"|(?:adjourned|postponed|preponed|rescheduled|shifted|changed|moved|deferred|advanced)\s+from)"
    r"\s*(?:the\s+)?$", re.I)
_SUPERSEDED_AFTER = re.compile(
    r"\s*(?:\([^)]{0,30}\)\s*)?(?:at\s+[\d:.]+\s*(?:a\.?m\.?|p\.?m\.?|hrs|hours)?\s*)?,?\s*"
    r"(?:is|has\s+been|stands|was|shall\s+be|will\s+be|stand)?\s*(?:hereby\s+)?"
    r"(?:adjourned|postponed|preponed|rescheduled|cancelled|canceled|deferred|advanced|vacated|"
    r"withdrawn|shifted)\b", re.I)
_DUE_NAMED = re.compile(
    r"(?:(?:due|last)\s+date|date\s+of\s+(?:the\s+)?(?:personal\s+)?hearing|next\s+date|hearing\s+date"
    r"|deadline)(?:\s+(?:for|of|to)\s+[\w ]{0,30}?)?\s*(?:is|shall\s+be|will\s+be)?\s*[:\-–]?\s*"
    r"(?:,?\s*(?:i\.e\.?|viz\.?|namely),?\s*)?(?:on\s+)?(?:the\s+)?$"
    r"|(?:adjourned|postponed|preponed|rescheduled|shifted|changed|moved|deferred|advanced|extended)"
    r"\s+(?:\w+\s+){0,3}?(?:to|till|until|upto|for|on)\s*(?:the\s+)?$", re.I)
_CLARIFIED = re.compile(r"(?:i\.e\.?|that\s+is|viz\.?)\s*,?\s*(?:by|on\s+or\s+before|on|before)?\s*"
                        r"(?:the\s+)?$", re.I)
_IGNORED = re.compile(
    r"(?:\bdated|\bdt\.?|\bdate|\bissued|\bsigned|\breceived|\bserved|\bfiled|\bsubmitted|\bpassed"
    r"|\bw\.?\s?e\.?\s?f\.?|with\s+effect\s+from|effective\s+from)\s*(?:on|of|from)?\s*[:\-–]?\s*"
    r"(?:the\s+)?$", re.I)
_PERIOD = re.compile(r"(?:\bperiod|\bf\.?\s?y\.?|financial\s+year|assessment\s+year|\bquarter)\s*"
                     r"(?:from|of|:|-|–|commencing|beginning|starting)?\s*(?:the\s+)?$", re.I)
_RANGE_START = re.compile(r"\b(?:between|from)\s+(?:the\s+)?$", re.I)
_RANGE_JOIN = re.compile(r"\s*(?:to|till|until|upto|up\s+to|and|-|–|—)\s*", re.I)
_DUE = re.compile(
    r"(?:on\s+or\s+before|not\s+later\s+than|no\s+later\s+than|latest\s+by|positively\s+by|\bby|\bbefore"
    r"|\btill|\buntil|\bupto|\bup\s+to|\bon|(?:fixed|scheduled|listed|posted)\s+for|\bdue|\bexpires?"
    r"|valid\s+until)\s*[:\-–]?\s*(?:the\s+)?$", re.I)
# Profile markers in a script that writes them after the date: "21-ന് മുമ്പ്".
_DUE_AFTER = [m for m in DEADLINE_MARKERS if any(ord(c) > 127 for c in m)]


def _date_roles(s: str) -> list[tuple[str, str]]:
    """(role, ISO date) for every date in `s`, roles as described above."""
    spans = date_spans(s)
    roles: list[str] = []
    for i, (start, end, _) in enumerate(spans):
        left = s[max(0, start - 80):start]
        joined = i and _RANGE_JOIN.fullmatch(s[spans[i - 1][1]:start])
        if joined and roles[-1] in ("period", "from"):
            roles[-1] = role = "ignored"              # "for the period X to Y", "from X to Y"
        elif joined and roles[-1] == "superseded":
            role = "named"                            # "postponed from X to Y"
        elif _SUPERSEDED_BEFORE.search(left) or _SUPERSEDED_AFTER.match(s[end:end + 60]):
            role = "superseded"
        elif _DUE_NAMED.search(left):
            role = "named"
        elif _CLARIFIED.search(left):
            role = "clarified"
        elif _PERIOD.search(left):
            role = "period"
        elif _IGNORED.search(left):
            role = "ignored"
        elif _RANGE_START.search(left):
            role = "from"
        elif _DUE.search(left) or any(mk in s[end:end + 25] for mk in _DUE_AFTER):
            role = "due"
        else:
            role = "plain"
        roles.append(role)
    settled = {"period": "ignored", "from": "plain"}   # a lone "from X" is not a range
    return [(settled.get(r, r), iso) for r, (_, _, iso) in zip(roles, spans)]


def _relative_rule(s: str) -> dict | None | bool:
    """The relative DateRule a sentence sets; None if it sets none; False when
    its periods disagree with each other."""
    periods = _periods(s)
    if periods is None or len(set(periods)) > 1:
        return False
    if not periods:
        return None
    n, word = periods[0]
    amount, unit = {"working": (n, "working_days"), "business": (n, "working_days"),
                    "day": (n, "days"), "week": (n * 7, "days"), "month": (n, "months")}[word]
    if not amount:
        return None
    anchor = next((a for a, rx in ANCHORS if rx.search(s)), None)
    if anchor is None:
        anchor = "receipt" if RECEIPT_RX.search(s) else "issue"
    rule = {"type": "relative", "anchor": anchor, "amount": amount, "unit": unit}
    if (m := CONDONE_RX.search(s)) and int(m[1]) > 0:
        rule["condonable"] = {"amount": int(m[1]), "unit": m[2].lower() + "s"}
    return rule

def date_reading(s: str) -> tuple[dict | None, bool]:
    """(DateRule, doubtful) for a sentence. The rule is the date the duty
    applies to: the one "on or before", "latest by", "appear on" or
    "adjourned to" governs, or a "within N days" period. Issue dates, periods
    and superseded dates are passed over. A hearing date counts without a
    deadline marker: "a personal hearing is fixed on …" is an appointment
    nobody may miss. When the sentence still holds two candidate dates, or a
    date and a period, nothing is guessed: the rule is None and `doubtful`
    is True, so a person reads the sentence."""
    roles = _date_roles(s)
    named = any(r == "named" for r, _ in roles)      # "adjourned to X" sets a date by itself
    if not DEADLINE_RX.search(s) and not (HEARING_RX.search(s) and roles) and not named:
        return None, False
    due = {iso for r, iso in roles if r in ("due", "named", "clarified")}
    dates = due or {iso for r, iso in roles if r == "plain"}
    rel = _relative_rule(s)
    if rel is False or len(dates) > 1:
        return None, True
    if dates:
        if rel and not any(r == "clarified" for r, _ in roles):
            return None, True                       # "within 45 days or by 20.12.2026"
        return {"type": "fixed", "date": next(iter(dates))}, False
    if rel:
        return rel, False
    # A deadline marker, and only dates it cannot govern ("reply to the notice
    # dated 01.10.2026 at the earliest"): say so rather than file a past date.
    return None, bool(roles)

def date_rule(s: str) -> dict | None:
    """The DateRule a sentence sets, or None (also when it is doubtful)."""
    return date_reading(s)[0]


def _add_months(d: date, n: int) -> date:
    y, m = divmod(d.month - 1 + n, 12)
    y, m = d.year + y, m + 1
    for day in (d.day, 30, 29, 28):
        try:
            return date(y, m, day)
        except ValueError:
            continue
    raise ValueError(d)

def resolve_rule(rule: dict | None, issued: date | None, received: date | None) -> str | None:
    """The engine's own reading of a rule as a date — used only to cross-check
    the TypeScript date engine, never shown as the due date. Calendar days and
    months only; working days need the holiday calendar, so they stay None, as
    does any rule whose anchor date the engine was not given."""
    if not rule:
        return None
    if rule["type"] == "fixed":
        return rule["date"]
    start = {"issue": issued, "receipt": received}.get(rule["anchor"])
    if start is None or rule["unit"] == "working_days":
        return None
    if rule["unit"] == "months":
        return _add_months(start, rule["amount"]).isoformat()
    return (start + timedelta(days=rule["amount"])).isoformat()

# notice details
SECTION_RX = re.compile(r"\b(section|sec\.|u/s\.?|rule|regulation|article)\s*"
                        r"(\d+[A-Z]{0,3}(?:\s*\(\s*[0-9A-Za-z]{1,4}\s*\))*)", re.I)
# Amounts: "Rs. 4,52,300", "₹ 1.5 Cr.", "Rupees 12 lakhs", "Rs.4 52 300" (Indian
# digit groups set apart by spaces), and a bare "4,52,300/-".
_FIGURE = r"(?:\d{1,2}(?: \d{2})* \d{3}(?!\d|[,.]\d)|\d[\d,]*(?:\.\d+)?)"
_SCALE = r"(?:\s*(?P<scale>lakhs?|lacs?|crores?|crs?|thousand|millions?|mn)\b\.?)?"
AMOUNT_RX = re.compile(rf"(?:₹|\bRs\.?|\bINR|\bRupees)\s*[:\-]?\s*(?P<n>{_FIGURE}){_SCALE}(?:\s*/-)?", re.I)
BARE_AMOUNT_RX = re.compile(r"(?<![\d,.])(?P<n>\d{1,3}(?:,\d{2,3})+(?:\.\d{1,2})?)(?P<scale>)\s*/-")
_SCALES = {"cr": 1e7, "la": 1e5, "th": 1e3, "mi": 1e6, "mn": 1e6}
# What the words just before an amount say it is. A demand is tax, interest, a
# penalty or a fee that is payable, due, demanded or short paid; turnover, a
# refund or a taxable value is not, however large.
AMOUNT_CUES = re.compile(r"demand|payable|\bdue\b|outstanding|liabilit|penalt|tax|interest|\bfees?\b|"
                         r"recover|short\s*paid|not\s+paid|unpaid|arrears|total|\bpay\b", re.I)
NOT_DEMAND = re.compile(r"turn\s*over|refund|taxable\s+value|assessable\s+value|transaction\s+value|"
                        r"value\s+of\s+(?:the\s+)?(?:taxable\s+)?(?:supply|supplies|goods|services)|"
                        r"invoice\s+value|(?:gross|total)\s+(?:sales|receipts|income)|"
                        r"(?:returned|declared|assessed)\s+income|already\s+paid|paid\s+by\s+you|"
                        r"\bdeposited|\bsales\b|\bpurchases?\b", re.I)
TOTAL_CUES = re.compile(r"total|aggregate|in\s+all|\bdemand|net\s+payable|sum\s+of", re.I)
# A sentence that asks for payment, as against one that only mentions a
# penalty that may follow.
PAY_CUES = re.compile(r"\bpay\b|payable|to\s+be\s+paid|short\s*paid|not\s+paid|unpaid|\bdemand|"
                      r"outstanding|\bdue\b|recover|arrears|\bdeposit\b", re.I)
REFERENCE_RX = re.compile(r"\b(?:" + "|".join(REFERENCE_LABELS) + r")\s*[:.\-#]?\s*"
                          r"([A-Z0-9][A-Z0-9/\-.]{4,}[A-Z0-9])", re.I) if REFERENCE_LABELS else None
_CANONICAL = {a.lower(): a for a in AUTHORITIES}
AUTHORITY_RX = re.compile("(" + "|".join(re.escape(a) for a in sorted(AUTHORITIES, key=len,
                                                                       reverse=True)) + ")", re.I) \
    if AUTHORITIES else None

OFFICE_RX = re.compile(r"^(?:office of the\s+|in the\s+)?((?:[\w&,.()'-]+\s+){0,8}?"
                       r"(?:commissioner|officer|registrar|tribunal|court|authority|ministry|"
                       r"directorate|department|bank|board|corporation|council)\b[^\n]{0,60})$", re.I)

def section_of(s: str) -> str | None:
    """The statutory provision a sentence cites: "Section 143(2)", "Rule 86A"."""
    if m := SECTION_RX.search(s):
        kind = {"sec.": "Section", "u/s": "Section", "u/s.": "Section"}.get(m[1].lower(),
                                                                          m[1].capitalize())
        return f"{kind} {re.sub(r'\s+', '', m[2])}"
    return None

def _rupees(number: str, scale: str | None) -> float:
    value = float(number.replace(",", "").replace(" ", ""))
    if scale:
        value *= _SCALES[scale.lower()[:2]]
    return value

def _amounts_in(part: str) -> list[re.Match]:
    hits = sorted((m for rx in (AMOUNT_RX, BARE_AMOUNT_RX) for m in rx.finditer(part)),
                  key=lambda m: (m.start(), -m.end()))
    out: list[re.Match] = []
    for m in hits:
        if not out or m.start() >= out[-1].end():
            out.append(m)
    return out

def demand(page_texts: list[str]) -> dict | None:
    """The amount a notice demands, read off the words around each amount:
    {value, text, page, quote, doubtful}, or None. An amount counts when the
    words before it (or, failing those, after it) call it tax, interest, a
    penalty or something payable, and not when they call it turnover, a
    refund or a taxable value. A total or a demand wins over its parts, and an
    amount in a sentence asking for payment over one that only mentions it
    ("a penalty of Rs. 2.5 lakh may follow"). When several different amounts
    remain, the largest is returned as doubtful: a person picks, not the
    rules."""
    cands = []
    for pno, txt in enumerate(page_texts, 1):
        for raw in txt.split("\n"):
            line = " ".join(raw.split())
            for part in _SENTENCE_BREAK.split(line):
                hits = _amounts_in(part)
                for i, m in enumerate(hits):
                    if re.match(r"\s*\d", part[m.end():]):
                        continue                       # a figure cut short: do not guess the rest
                    left = part[max(hits[i - 1].end() if i else 0, m.start() - 80):m.start()]
                    right = part[m.end():min(hits[i + 1].start() if i + 1 < len(hits) else len(part),
                                             m.end() + 50)]
                    if NOT_DEMAND.search(left):
                        continue
                    if not AMOUNT_CUES.search(left):
                        cue, other = AMOUNT_CUES.search(right), NOT_DEMAND.search(right)
                        if not cue or (other and other.start() < cue.start()):
                            continue
                    try:
                        value = _rupees(m["n"], m["scale"])
                    except (ValueError, KeyError):
                        continue
                    rank = 2 if TOTAL_CUES.search(left) else 1 if PAY_CUES.search(part) else 0
                    cands.append({"value": value, "text": m[0].strip(), "page": pno,
                                  "quote": part if len(part) >= 30 else m[0].strip(), "rank": rank})
    if not cands:
        return None
    top = max(c["rank"] for c in cands)
    pool = [c for c in cands if c["rank"] == top]
    best = max(pool, key=lambda c: c["value"])
    return {**best, "doubtful": len({c["value"] for c in pool}) > 1}

def notice_details(page_texts: list[str]) -> dict:
    """What a notice desk files a notice under: its reference number, who issued
    it, the provisions it cites, and the amount it demands."""
    full = "\n".join(page_texts)
    head = "\n".join(page_texts[:1])[:3000]
    ref = REFERENCE_RX.search(head) if REFERENCE_RX else None
    authority = None
    if AUTHORITY_RX and (m := AUTHORITY_RX.search(full)):
        authority = _CANONICAL[m[1].lower()]          # the profile's own spelling
    else:
        # Failing a known name: an "Office of the …" heading, or a top line that
        # names an office, near the head of page one.
        for line in [" ".join(x.split()) for x in head.split("\n")[:8]]:
            if m := OFFICE_RX.search(line):
                authority = m[1].strip(" ,.-")
                authority = authority.title() if authority.isupper() else authority
                break
    # The amount demanded (see demand): an invoice line item is not a demand.
    amount = demand(page_texts)
    sections = list(dict.fromkeys(s for line in full.split("\n")
                                  for s in [section_of(line)] if s))
    return {"reference": ref[1] if ref else None, "authority": authority,
            "amount": amount["value"] if amount else None,
            "amount_text": amount["text"] if amount else None,
            "sections": sections[:8]}

def notice_evidence(page_texts: list[str]) -> dict:
    """Where on the page each notice detail was read: (page, verbatim quote),
    or None. The quote is the match itself, or the sentence around the
    demanded amount, so the linker can outline it."""
    out: dict = {"reference": None, "authority": None, "amount": None}
    if REFERENCE_RX and page_texts and (m := REFERENCE_RX.search(page_texts[0][:3000])):
        out["reference"] = (1, m[0].strip())
    for pno, txt in enumerate(page_texts, 1):
        if AUTHORITY_RX and (m := AUTHORITY_RX.search(txt)):
            out["authority"] = (pno, m[1])
            break
    if out["authority"] is None and page_texts:
        for line in [" ".join(x.split()) for x in page_texts[0][:3000].split("\n")[:8]]:
            if m := OFFICE_RX.search(line):
                out["authority"] = (1, m[1].strip(" ,.-"))
                break
    if amount := demand(page_texts):
        out["amount"] = (amount["page"], amount["quote"])
    return out

# scoring
INFO_RX = re.compile("(" + "|".join([r"\d", "%", r"[$€£₹]"] + [re.escape(t) for t in INFO_TERMS])
                     + ")", re.I)
NOISE = re.compile(r"(page\s+\d+(\s+of\s+\d+)?|\d+|[-–—_=•*\s]{3,})", re.I)   # whole line only
SENTENCE_END = re.compile(r"[.।۔]\s*$")        # prose stops; ref bars and table rows don't
# A table row opening with its serial number. Bounded to 1-2 digits so a
# year-first local date ("2026 ജൂലൈ 8 മുതൽ…") is not caught.
TABLE_ROW = re.compile(r"^\d{1,2}[\s.)]")
MIN_BULLETS, MAX_BULLETS = 1, 6   # a one-line invoice gets one bullet, not padding

# Abbreviations that end in a full stop but not a sentence: "Rs. 4,52,300",
# "No. 117", "Sec. 61". Fixed-width lookbehinds, one per spelling.
_ABBREV = "".join(rf"(?<!\b{re.escape(a)})" for a in (
    "Rs.", "No.", "no.", "Nos.", "Sec.", "sec.", "Dr.", "Mr.", "Ms.", "Mrs.", "Ltd.", "Pvt.",
    "Co.", "St.", "vs.", "Vs.", "viz.", "Art.", "Reg.", "Govt.", "Dept."))
_SENTENCE_BREAK = re.compile(rf"(?<![A-Z]\.){_ABBREV}(?<=[.;।۔])\s+(?=[A-Z0-9{_SCRIPT}])")

def _sentences(page_texts: list[str]) -> list[tuple[int, str]]:
    return [(pno, s) for pno, _, s in _sentences_at(page_texts)]

def _sentences_at(page_texts: list[str]) -> list[tuple[int, int, str]]:
    """(page, line number within the page text, sentence) for every sentence
    worth reading. The line number keys translations made per line."""
    out = []
    for pno, txt in enumerate(page_texts, 1):
        for lno, raw in enumerate(txt.split("\n")):
            line = " ".join(raw.split())
            if len(line) < 30 or NOISE.fullmatch(line):
                continue
            # The lookbehind keeps "M.G. Road" intact: a period after a lone
            # capital is an abbreviation, not a full stop.
            for part in _SENTENCE_BREAK.split(line):
                if len(part.strip()) >= 30:
                    out.append((pno, lno, part.strip()))
    return out

def _cue_score(s: str) -> int:
    low = s.lower()
    return sum(2 for cue in OBLIGATION_CUES if cue in low)

# Scoring reads a sentence together with its English gloss, when it has one:
# `t` below is "original + translation", so a duty is recognised whether the
# profile knows how that language words one or only English does. Shape tests
# (length, punctuation) stay on the original, `s`.
def _score_obligation(t: str, base: date | None, received: date | None = None) -> int:
    """A sentence is an obligation because it *directs* someone: a bare date is
    not enough, since issue dates carry dates too. A dated hearing is one."""
    cue = _cue_score(t) + (4 if HEARING_RX.search(t) and _absolute(t) else 0)
    if not cue:
        return 0
    dated = deadline_in(t, base, received) or date_reading(t)[1]     # a doubtful date still counts
    return (cue + (4 if dated else 0)
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
    return doc_type_scored(body, head, filename)[0]

def doc_type_scored(body: str, head: str = "", filename: str = "") -> tuple[str, float]:
    """guess_doc_type, with the score that won."""
    low, hi = body.lower(), head.lower()
    fn = filename.lower().replace("-", " ").replace("_", " ")
    best, best_score = DEFAULT_DOC_TYPE, 0.0
    for dt, kws in DOC_TYPE_KEYWORDS.items():
        score = (sum(3.0 for k in kws if k in hi) + sum(2.0 for k in kws if k in fn)
                 + sum(0.6 for k in kws if k in low)
                 + (1.5 if any(w in fn for w in dt.lower().split()) else 0))
        if score > best_score:
            best, best_score = dt, score
    return best, best_score

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

def analyze(page_texts: list[str], filename: str, translate=None,
            received: date | None = None,
            line_glosses: dict[tuple[int, int], str] | None = None) -> dict:
    """`translate`, if given, maps [(language code, sentence)] to English (None
    where it could not). The evidence quote is always the original sentence.
    `received` is the day the document arrived: deadlines that run "from
    receipt" count from it. `line_glosses`, if given, is English already made
    for whole lines, keyed (page, line number in the page text): the engine's
    /v1/analyze receives translations that way instead of translating."""
    full = "\n".join(page_texts)
    # The document's own date: the one labelled as such, else the first one —
    # a notice's first date may be the hearing it fixes, not its issue date.
    head = full[:1500]
    labelled = DATED_RX.search(head)
    doc_date = (labelled and parse_date(head[labelled.end():labelled.end() + 40])) or parse_date(head)
    base = date.fromisoformat(doc_date) if doc_date else None
    cands_at = _sentences_at(page_texts)
    cands = [(pno, s) for pno, _, s in cands_at]
    gloss = _glosses(cands, translate)
    if line_glosses:
        for pno, lno, s in cands_at:
            if (en := line_glosses.get((pno, lno))) and s not in gloss and detect_lang(s) != "en":
                gloss[s] = en
    seen_by = {s: f"{s} {gloss[s]}" if s in gloss else s for _, s in cands}     # s -> "t"

    obligations, seen = [], set()
    for score, pno, s in sorted(((_score_obligation(seen_by[s], base, received), pno, s)
                                 for pno, s in cands),
                                key=lambda t: (-t[0], t[1])):
        if score < 3 or len(obligations) >= 5:
            break
        if s[:60].lower() in seen:
            continue
        seen.add(s[:60].lower())
        t = seen_by[s]
        rule, doubtful = date_reading(t)
        obligations.append(_finding(
            s, pno, gloss.get(s), due_date=deadline_in(t, base, received), roles=route_roles(t),
            severity="high" if any(k in t.lower() for k in SEVERITY_HIGH) else "medium",
            section=section_of(t), due_basis=due_basis(t),
            tag="hearing" if HEARING_RX.search(t) else None,
            due_rule=rule, due_doubtful=doubtful, score=score))

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

    doc_type, type_score = doc_type_scored(full, page_texts[0][:900] if page_texts else "", filename)
    if desk := DOC_TYPE_ROLES.get(doc_type):
        for f in summary + obligations:
            f["roles"] = ([desk] + [r for r in f["roles"] if r != desk and r != DEFAULT_ROLE])[:3]
    return {"title": _guess_title(page_texts, filename), "doc_type": doc_type,
            "doc_date": doc_date, "summary": summary, "obligations": obligations,
            "notice": notice_details(page_texts), "evidence": notice_evidence(page_texts),
            "amount_doubtful": bool((amount := demand(page_texts)) and amount["doubtful"]),
            "doc_type_score": type_score}
