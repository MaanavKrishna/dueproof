"""Measure extraction against labelled documents.

    dueproof eval labels.jsonl --docs FOLDER [--json] [--min-precision 0.8 ...]

A labels file has one JSON object per line, one per document:

    {"file": "notice.pdf", "received_on": "2026-10-24",
     "obligations": [{"quote": "directed to explain the discrepancies",
                      "due_date": "2026-11-23", "desks": ["GST & Indirect Tax"]}],
     "not_obligations": ["Failure to reply will attract"]}

A quote is any distinctive substring of the sentence; spacing, case and
punctuation are ignored. `dueproof labels export` writes this format from the
corrections people make in the app, so every review is also a label.

Reported:
  precision, recall     obligations found vs. labelled
  deadline_exact        labelled due dates reproduced exactly (off by a day is wrong)
  desk_top1, desk_top3  the right desk first, or anywhere in the top three
  false_confident       findings marked exact/strong whose outlined words are not
                        the quote — the number that must stay at zero
"""
from __future__ import annotations

import json
import sys
import tempfile
from datetime import date
from pathlib import Path

from rapidfuzz import fuzz

from dueproof.pipeline.analyze import analyze
from dueproof.pipeline.link import _norm_text, build_index, link_quote

# Malayalam has two encodings of its chillu letters; OCR emits the older one.
_CHILLU = {"ണ്‍": "ൺ", "ന്‍": "ൻ", "ര്‍": "ർ", "ല്‍": "ൽ", "ള്‍": "ൾ"}

def _key(s: str) -> str:
    for old, new in _CHILLU.items():
        s = s.replace(old, new)
    return _norm_text(s)

def _located_text(rects: list, words: list[dict]) -> str:
    """The words the outline actually covers, in reading order."""
    inside = lambda w: any(x0 <= (w["x0"] + w["x1"]) / 2 <= x1 and y0 <= (w["y0"] + w["y1"]) / 2 <= y1
                           for x0, y0, x1, y1 in rects)
    return _key(" ".join(w["text"] for w in words if inside(w)))

def predict(path: Path, received: date | None) -> dict:
    """Run read -> analyze -> link on one file, as the app would (no database)."""
    from dueproof.pipeline.read import read_image, read_pdf
    reader = read_pdf if path.suffix.lower() == ".pdf" else read_image
    with tempfile.TemporaryDirectory():
        doc = reader(f"eval-{abs(hash(path.name)) % 10**8}", path)
    found = analyze(doc["page_texts"], path.name, received=received)
    by_page: dict[int, list[dict]] = {}
    for w in doc["words"]:
        by_page.setdefault(w["page_num"], []).append(w)
    index = build_index(by_page)
    findings = []
    for kind, items in (("bullet", found["summary"]), ("obligation", found["obligations"])):
        for f in items:
            hit = link_quote(f["evidence_quote"], index, f["page"])
            findings.append(dict(f, kind=kind, link=hit,
                                 located=_located_text(hit["rects"], by_page.get(hit["page_num"], []))))
    return {"findings": findings}

def score(labels: list[dict], predictions: dict[str, dict]) -> dict:
    tp = fp = fn = 0
    due_ok = due_total = top1 = top3 = desk_total = 0
    confident = false_confident = 0
    flagged_negatives = 0
    per_file = {}
    for lab in labels:
        pred = predictions[lab["file"]]["findings"]
        obligations = [f for f in pred if f["kind"] == "obligation"]
        unmatched = list(range(len(obligations)))
        file_tp = 0
        for want in lab.get("obligations", []):
            k = _key(want["quote"])
            hit = next((i for i in unmatched if k in _key(obligations[i]["evidence_quote"])), None)
            if hit is None:
                fn += 1
                continue
            unmatched.remove(hit)
            tp += 1
            file_tp += 1
            got = obligations[hit]
            if "due_date" in want:
                due_total += 1
                due_ok += got.get("due_date") == want["due_date"]
            if want.get("desks"):
                desk_total += 1
                top1 += bool(got["roles"]) and got["roles"][0] in want["desks"]
                top3 += bool(set(got["roles"][:3]) & set(want["desks"]))
        for i in unmatched:
            fp += 1
            q = _key(obligations[i]["evidence_quote"])
            flagged_negatives += any(_key(n) in q for n in lab.get("not_obligations", []))
        for f in pred:
            if f["link"]["confidence"] in ("exact", "strong"):
                confident += 1
                if fuzz.partial_ratio(_key(f["evidence_quote"]), f["located"]) < 90:
                    false_confident += 1
        per_file[lab["file"]] = {"labelled": len(lab.get("obligations", [])),
                                 "found": len(obligations), "matched": file_tp}
    ratio = lambda a, b: round(a / b, 4) if b else None
    return {"documents": len(labels), "labelled": tp + fn, "predicted": tp + fp,
            "precision": ratio(tp, tp + fp), "recall": ratio(tp, tp + fn),
            "deadline_exact": ratio(due_ok, due_total), "desk_top1": ratio(top1, desk_total),
            "desk_top3": ratio(top3, desk_total), "false_confident": ratio(false_confident, confident),
            "labelled_non_obligations_flagged": flagged_negatives, "per_file": per_file}

def load(labels_path: Path) -> list[dict]:
    out = []
    for n, line in enumerate(Path(labels_path).read_text(encoding="utf-8").splitlines(), 1):
        if line.strip() and not line.lstrip().startswith("#"):
            try:
                out.append(json.loads(line))
            except json.JSONDecodeError as exc:
                raise SystemExit(f"{labels_path}:{n}: {exc}") from None
    return out

def run(labels_path: Path, docs: Path) -> dict:
    labels = load(labels_path)
    predictions = {}
    for lab in labels:
        path = Path(docs) / lab["file"]
        if not path.is_file():
            raise SystemExit(f"{lab['file']} is labelled but not in {docs}")
        received = date.fromisoformat(lab["received_on"]) if lab.get("received_on") else None
        predictions[lab["file"]] = predict(path, received)
    return score(labels, predictions)

def main(args) -> int:
    result = run(args.labels, args.docs)
    if args.json:
        print(json.dumps(result, indent=1, ensure_ascii=False))
    else:
        for key in ("documents", "labelled", "predicted", "precision", "recall", "deadline_exact",
                    "desk_top1", "desk_top3", "false_confident", "labelled_non_obligations_flagged"):
            print(f"{key:<34} {result[key]}")
    failed = [f"{name} {result[name]} < {floor}" for name, floor in
              (("precision", args.min_precision), ("recall", args.min_recall),
               ("deadline_exact", args.min_deadline)) if floor is not None
              and (result[name] or 0) < floor]
    if args.max_false_confident is not None and (result["false_confident"] or 0) > args.max_false_confident:
        failed.append(f"false_confident {result['false_confident']} > {args.max_false_confident}")
    for f in failed:
        print("FAILED:", f, file=sys.stderr)
    return 1 if failed else 0

# exporting labels from the app
def export_labels(out: Path, reviewed_only: bool = True) -> int:
    """Corrections people made, as a labels file. A document counts as reviewed
    once anyone has changed any of its findings."""
    from dueproof import db
    n = 0
    with Path(out).open("w", encoding="utf-8") as fh:
        for d in db.q("SELECT id, filename, received_on FROM documents WHERE status='done' ORDER BY rowid"):
            findings = db.q("SELECT * FROM findings WHERE doc_id=? AND kind='obligation'", (d["id"],))
            reviewed = any(f["updated_at"] for f in findings)
            if reviewed_only and not reviewed:
                continue
            fh.write(json.dumps({
                "file": d["filename"], "received_on": d["received_on"],
                "obligations": [{"quote": f["evidence_quote"],
                                 **({"due_date": f["due_override"] or f["due_date"]}
                                    if f["due_override"] or f["due_date"] else {}),
                                 "desks": json.loads(f["roles_override"] or f["roles"] or "[]")}
                                for f in findings if f["status"] != "dismissed"],
                "not_obligations": [f["evidence_quote"] for f in findings if f["status"] == "dismissed"],
            }, ensure_ascii=False) + "\n")
            n += 1
    return n

