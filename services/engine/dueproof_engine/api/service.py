"""What each endpoint does, between the contract's models and the pipeline.

Coordinates: the pipeline works in boxes 0-1 from the page's top-left; the
contract speaks PDF points from the top-left (pixels for an image page). The
conversion happens here and only here.
"""
from __future__ import annotations

import io
import logging
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import date

import numpy as np
from PIL import Image

from dueproof_engine import config
from dueproof_engine.api import models as m
from dueproof_engine.api import storage
from dueproof_engine.pipeline import pdf, read as reader
from dueproof_engine.pipeline.analyzers import analyzer
from dueproof_engine.pipeline.link import build_index, link_quote

log = logging.getLogger("dueproof.service")


def _rect(box, width: float, height: float) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = box
    return (round(x0 * width, 2), round(y0 * height, 2), round(x1 * width, 2), round(y1 * height, 2))


# inspect
def inspect(req: m.InspectRequest) -> m.InspectResponse:
    data = storage.fetch(req.sourceUrl)
    kind = reader.sniff(data[:1024])
    no = lambda reason, **kw: m.InspectResponse(**{"ok": False, "pageCount": 0, "encrypted": False,
                                                    "textLayerPages": [], "reason": reason, **kw})
    if kind is None:
        return no("unsupported")
    if kind != "application/pdf":
        try:
            frames = reader.image_frames(data)
        except reader.ReadError as exc:
            return no(exc.reason)
        return m.InspectResponse(ok=True, pageCount=len(frames), encrypted=False, textLayerPages=[])
    try:
        doc = pdf.open_pdf(data, req.password)
    except reader.ReadError as exc:
        return no(exc.reason, encrypted=exc.reason == "encrypted")
    try:
        with pdf.LOCK:
            n, encrypted = len(doc), pdf.is_encrypted(doc)
        if n == 0:
            return no("malformed", encrypted=encrypted)
        if n > config.MAX_PAGES:
            return no("too_many_pages", pageCount=n, encrypted=encrypted)
        layer_pages = []
        for pno in range(n):
            with pdf.LOCK:
                page = doc[pno]
                try:
                    if len(pdf.words(page)) >= reader.NATIVE_WORD_FLOOR:
                        layer_pages.append(pno + 1)
                finally:
                    page.close()
        return m.InspectResponse(ok=True, pageCount=n, encrypted=encrypted, textLayerPages=layer_pages)
    finally:
        with pdf.LOCK:
            doc.close()


# read
def webp(bgr: np.ndarray) -> bytes:
    out = io.BytesIO()
    Image.fromarray(np.ascontiguousarray(bgr[:, :, ::-1])).save(
        out, format="WEBP", quality=config.DISPLAY_QUALITY, method=4)
    return out.getvalue()


def page_model(p: dict) -> m.PageText:
    w, h = p["width"], p["height"]
    return m.PageText(
        page=p["page"], width=w, height=h, rotation=p["rotation"], text=p["text"],
        words=[m.Word(text=wd["text"], rect=_rect((wd["x0"], wd["y0"], wd["x1"], wd["y1"]), w, h),
                      line=max(0, int(wd["line_id"]))) for wd in p["words"]],
        engine=p["engine"], confidence=p["confidence"], languages=p["languages"])


def read(req: m.ReadRequest) -> m.ReadResponse:
    for url in req.pageImagePutUrls:
        storage.check_url(url)
    data = storage.fetch(req.sourceUrl)
    urls = req.pageImagePutUrls
    pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix="put")
    puts = []

    def on_image(pno: int, bgr: np.ndarray) -> None:
        if pno <= len(urls):
            puts.append(pool.submit(storage.put, urls[pno - 1], webp(bgr)))

    t0 = time.perf_counter()
    try:
        doc = reader.read_document(data, password=req.password, max_rung=req.maxRung,
                                   languages=req.languages, on_image=on_image)
        for f in puts:
            f.result()                          # surfaces a failed PUT as StorageError
    finally:
        pool.shutdown(wait=True, cancel_futures=True)
    if len(urls) < doc["page_count"]:
        log.warning("read: %d pages, %d image URLs; pages without one have no image",
                    doc["page_count"], len(urls))
    log.info("read: %d pages (%s) in %d ms, escalate %s", doc["page_count"],
             ",".join(sorted({p["engine"] for p in doc["pages"]})),
             (time.perf_counter() - t0) * 1000, doc["needs_escalation"] or "none")
    return m.ReadResponse(pages=[page_model(p) for p in doc["pages"]],
                          needsEscalation=doc["needs_escalation"])


# translate
def translate(req: m.TranslateRequest) -> m.TranslateResponse:
    from dueproof_engine.pipeline import translate as mt
    untouched = m.TranslateResponse(
        segments=[m.TranslatedSegment(id=s.id, textEn=s.text, warn=False) for s in req.segments],
        engine="none")
    if not req.segments or not mt.available():
        return untouched
    todo = [(i, s) for i, s in enumerate(req.segments) if s.lang not in ("en", "") and s.text.strip()]
    out = mt.translate([(s.lang, s.text) for _, s in todo]) if todo else []
    segments = list(untouched.segments)
    for (i, s), en in zip(todo, out):
        if en:
            segments[i] = m.TranslatedSegment(id=s.id, textEn=en, warn=bool(mt.check_terms(s.text, en)))
        else:
            segments[i] = m.TranslatedSegment(id=s.id, textEn=s.text, warn=True)
    return m.TranslateResponse(segments=segments, engine="indictrans2")


# analyze
# How sure the rules are, by what they found. Rule confidence, not OCR's.
CONF_DATED, CONF_DUTY, CONF_SUMMARY, CONF_DETAIL = 0.9, 0.75, 0.6, 0.85
CONFIDENT_TYPE_SCORE = 6.0    # two masthead keyword hits: the notice type is known


def _texts(pages: list[m.PageText]) -> list[str]:
    """Page texts indexed from page 1, with empty strings for pages not sent
    (a batch of pages 5-7 keeps its numbering)."""
    if not pages:
        return []
    out = [""] * max(p.page for p in pages)
    for p in pages:
        out[p.page - 1] = p.text
    return out


def _glosses(translations: dict[str, str]) -> dict[tuple[int, int], str]:
    out = {}
    for key, en in translations.items():
        page, _, line = key.partition(":")
        if page.isdigit() and line.isdigit() and en:
            out[(int(page), int(line))] = en
    return out


def _rule(rule: dict | None):
    if not rule:
        return None
    if rule["type"] == "fixed":
        return m.FixedRule(**rule)
    return m.RelativeRule(**rule)


def analyze(req: m.AnalyzeRequest) -> m.AnalyzeResponse:
    rules = analyzer(req.profile)
    texts = _texts(req.pages)
    received = date.fromisoformat(req.receivedOn) if req.receivedOn else None
    found = rules.analyze(texts, "", received=received, line_glosses=_glosses(req.translations))
    issued = date.fromisoformat(found["doc_date"]) if found["doc_date"] else None
    findings: list[m.EngineFinding] = []

    def text_fields(f: dict) -> dict:
        original = f["text_local"] or f["text_en"] or f["evidence_quote"]
        return {"text": original, "quote": f["evidence_quote"], "quoteLang": f["orig_lang"],
                **({"textEn": f["text_en"]} if f["text_en"] else {}), "pageHint": f["page"]}

    for f in found["obligations"]:
        rule = f.get("due_rule")
        kind = "hearing" if f.get("tag") == "hearing" else "deadline" if rule else "obligation"
        findings.append(m.EngineFinding(
            kind=kind, **text_fields(f), confidence=CONF_DATED if rule else CONF_DUTY,
            dueRule=_rule(rule), engineDueOn=rules.resolve_rule(rule, issued, received),
            desk=(f.get("roles") or [None])[0], severity=f.get("severity")))
    for f in found["summary"]:
        findings.append(m.EngineFinding(kind="summary", **text_fields(f), confidence=CONF_SUMMARY,
                                        desk=(f.get("roles") or [None])[0]))
    notice, evidence = found["notice"], found["evidence"]
    for kind, key, value in (("reference", "reference", notice["reference"]),
                             ("office", "authority", notice["authority"])):
        if value and evidence.get(key):
            page, quote = evidence[key]
            findings.append(m.EngineFinding(kind=kind, text=value, quote=quote,
                                            quoteLang=rules.detect_lang(quote), pageHint=page,
                                            confidence=CONF_DETAIL))
    if notice["amount"] is not None and evidence.get("amount"):
        page, quote = evidence["amount"]
        findings.append(m.EngineFinding(kind="amount", text=notice["amount_text"], quote=quote,
                                        quoteLang=rules.detect_lang(quote), pageHint=page,
                                        confidence=CONF_DETAIL,
                                        amountMinor=int(round(notice["amount"] * 100))))
    dated = [f for f in findings if f.dueRule]
    confident = (found["doc_type"] != rules.DEFAULT_DOC_TYPE
                 and found["doc_type_score"] >= CONFIDENT_TYPE_SCORE and bool(dated))
    return m.AnalyzeResponse(
        docType=found["doc_type"], title=found["title"] or None, reference=notice["reference"],
        issuingOffice=notice["authority"], issuedOn=found["doc_date"], sections=notice["sections"],
        findings=findings, confident=confident)


# link
def link(req: m.LinkRequest) -> m.LinkResponse:
    sizes = {p.page: (p.width or 1.0, p.height or 1.0) for p in req.pages}
    by_page: dict[int, list[dict]] = {}
    for p in req.pages:
        w, h = sizes[p.page]
        by_page[p.page] = [{"text": wd.text, "x0": wd.rect[0] / w, "y0": wd.rect[1] / h,
                            "x1": wd.rect[2] / w, "y1": wd.rect[3] / h, "line_id": wd.line}
                           for wd in p.words]
    index = build_index(by_page)
    matches = []
    for q in req.quotes:
        hit = link_quote(q.text, index, q.pageHint)
        grade = "unlocated" if hit["confidence"] == "none" else hit["confidence"]
        located = grade != "unlocated" and hit["rects"] and hit["page_num"] in sizes
        w, h = sizes.get(hit["page_num"], (1.0, 1.0))
        matches.append(m.LinkMatch(
            id=q.id, page=hit["page_num"] if located else None,
            rects=[_rect(r, w, h) for r in hit["rects"]] if located else [],
            score=round(min(1.0, max(0.0, hit["score"] / 100)), 4), grade=grade if located else "unlocated"))
    return m.LinkResponse(matches=matches)
