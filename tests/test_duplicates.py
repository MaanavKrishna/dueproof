"""Duplicate detection: blocking must never cost a true duplicate, and must
actually spare the fuzzy scorer most of the corpus."""
import json
import random
import subprocess
import sys
import unittest
from unittest import mock

from dueproof import db
from dueproof.pipeline.link import (CANDIDATE_KEYS, SHINGLE, SIG_SIZE, _norm_text,
                           near_duplicate_score, signature)
from tests.support import REPO, CIRCULAR, SCAN, client, ingest, snapshot

from dueproof import ingest as ingestion


def jaccard(a: str, b: str) -> float:
    grams = lambda s: {t[i:i + SHINGLE] for t in [_norm_text(s)[:6000]]
                       for i in range(len(t) - SHINGLE + 1)}
    A, B = grams(a), grams(b)
    return len(A & B) / len(A | B)


def overlap(a: str, b: str) -> float:
    return len(set(signature(a)) & set(signature(b))) / SIG_SIZE


def blocked_match(a: str, b: str) -> bool:
    """Would the app's cheap stage let this pair through to the scorer?"""
    return len(set(signature(a)) & set(signature(b))) >= CANDIDATE_KEYS


class Signature(unittest.TestCase):
    def test_shape(self):
        sig = signature(snapshot()[CIRCULAR]["full_text"])
        self.assertEqual(len(sig), SIG_SIZE)
        self.assertEqual(len(set(sig)), SIG_SIZE)                  # position is in the key
        self.assertTrue(all(k.split(":")[0] == str(i) for i, k in enumerate(sig)))

    def test_too_little_text_has_no_signature_and_matches_nothing(self):
        for text in ("", "ab", "   ", "!!!"):
            self.assertEqual(signature(text), [])
        self.assertFalse(blocked_match("", ""))

    def test_identical_text_whatever_the_spacing_and_case(self):
        text = snapshot()[CIRCULAR]["full_text"]
        self.assertEqual(signature(text), signature(text.upper().replace(" ", "  \n")))
        self.assertEqual(overlap(text, text), 1.0)

    def test_stable_across_processes(self):
        """Stored signatures are compared tomorrow, by another process."""
        code = ("import sys, json; sys.path.insert(0, %r); from dueproof.pipeline.link import signature;"
                "print(json.dumps(signature('Northline fire safety audit സുരക്ഷ ' * 40)))" % str(REPO))
        runs = {subprocess.run([sys.executable, "-c", code], capture_output=True, text=True,
                               check=True, env={"PYTHONHASHSEED": seed}).stdout
                for seed in ("0", "1", "12345")}
        self.assertEqual(len(runs), 1)
        self.assertEqual(json.loads(runs.pop()), signature("Northline fire safety audit സുരക്ഷ " * 40))

    def test_estimate_tracks_true_overlap_on_the_corpus(self):
        snap = snapshot()
        names = sorted(snap)
        for i, a in enumerate(names):
            for b in names[i + 1:]:
                ta, tb = snap[a]["full_text"], snap[b]["full_text"]
                with self.subTest(a=a[:20], b=b[:20]):
                    self.assertAlmostEqual(overlap(ta, tb), jaccard(ta, tb), delta=0.12)


class Blocking(unittest.TestCase):
    def test_agrees_with_brute_force_on_the_corpus(self):
        snap = snapshot()
        names = sorted(snap)
        pairs = [(a, b) for i, a in enumerate(names) for b in names[i + 1:]]
        brute = {(a, b) for a, b in pairs
                 if near_duplicate_score(snap[a]["full_text"], snap[b]["full_text"]) >= 80}
        blocked = {(a, b) for a, b in pairs
                   if blocked_match(snap[a]["full_text"], snap[b]["full_text"])
                   and near_duplicate_score(snap[a]["full_text"], snap[b]["full_text"]) >= 80}
        self.assertEqual(blocked, brute)
        self.assertEqual(brute, {tuple(sorted((CIRCULAR, SCAN)))})

    def test_no_true_duplicate_is_lost_under_noise(self):
        """Uniform character noise is the worst case for shingles. Every noisy
        copy that the scorer would still call a duplicate must reach the scorer."""
        rnd = random.Random(7)
        checked, weakest = 0, 1.0
        for name, doc in snapshot().items():
            base = doc["full_text"]
            alphabet = sorted(set(_norm_text(base)))
            for rate in (0.02, 0.05, 0.10, 0.15, 0.18, 0.20):
                for _ in range(15):
                    noisy = "".join(rnd.choice(alphabet) if c.strip() and rnd.random() < rate
                                    else c for c in base)
                    if near_duplicate_score(base, noisy) >= ingestion.DUPLICATE_THRESHOLD:
                        checked += 1
                        weakest = min(weakest, overlap(base, noisy))
                        self.assertTrue(blocked_match(base, noisy), (name, rate))
        self.assertGreater(checked, 200)
        # Not merely passing: the weakest true duplicate clears the floor with room.
        self.assertGreater(weakest, CANDIDATE_KEYS / SIG_SIZE + 0.03)

    def test_unrelated_documents_are_mostly_never_scored(self):
        snap = snapshot()
        names = sorted(snap)
        pairs = [(a, b) for i, a in enumerate(names) for b in names[i + 1:]]
        through = sum(blocked_match(snap[a]["full_text"], snap[b]["full_text"]) for a, b in pairs)
        self.assertLess(through, len(pairs) // 3, f"{through} of {len(pairs)} pairs reached the scorer")
        self.assertGreaterEqual(through, 1)                        # the real pair does


class InTheApp(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.hero = ingest(CIRCULAR)
        cls.scan = ingest(SCAN, "WhatsApp")

    def test_the_pair_is_linked_both_ways(self):
        for a, b in ((self.hero, self.scan), (self.scan, self.hero)):
            row = db.one("SELECT score FROM duplicates WHERE doc_id=? AND other_id=?", (a, b))
            self.assertIsNotNone(row)
            self.assertGreaterEqual(row["score"], 80)
        d = client().get(f"/api/document/{self.scan}").json()
        self.assertEqual([(x["id"], x["source_channel"]) for x in d["duplicates"]],
                         [(self.hero, "Email")])
        self.assertEqual(d["text_source"], "ocr")

    def test_nothing_else_is_linked_to_them(self):
        others = db.q("SELECT other_id FROM duplicates WHERE doc_id=?", (self.hero,))
        self.assertEqual([o["other_id"] for o in others], [self.scan])

    def test_signature_keys_are_stored(self):
        self.assertEqual(db.one("SELECT COUNT(*) n FROM dup_keys WHERE doc_id=?",
                                (self.hero,))["n"], SIG_SIZE)

    def test_the_scorer_runs_on_candidates_only(self):
        """Ingest unrelated text into a corpus of many: the fuzzy scorer, and the
        full-text read behind it, must not run once per existing document."""
        rnd = random.Random(3)
        words = ["".join(rnd.choices("abcdefghijklmnopqrstuvwxyz", k=rnd.randint(4, 11)))
                 for _ in range(4000)]
        ids = []
        for n in range(30):
            doc_id = f"filler{n:03d}"
            ids.append(doc_id)
            db.run("INSERT INTO documents (id, filename, status) VALUES (?,?,'done')",
                   (doc_id, f"{doc_id}.pdf"))
            ingestion._find_duplicates(doc_id, " ".join(rnd.choices(words, k=400)))
        try:
            db.run("INSERT INTO documents (id, filename, status) VALUES ('probe','p.pdf','done')")
            with mock.patch.object(ingestion, "near_duplicate_score",
                                   wraps=near_duplicate_score) as scorer:
                ingestion._find_duplicates("probe", " ".join(rnd.choices(words, k=400)))
            self.assertEqual(scorer.call_count, 0)
            self.assertEqual(db.q("SELECT * FROM duplicates WHERE doc_id='probe'"), [])
            # ...and an exact copy of one of them is still found.
            copy = db.one("SELECT full_text FROM documents WHERE id='filler007'")["full_text"]
            db.run("INSERT INTO documents (id, filename, status) VALUES ('copy','c.pdf','done')")
            ingestion._find_duplicates("copy", copy)
            self.assertEqual([r["other_id"] for r in db.q(
                "SELECT other_id FROM duplicates WHERE doc_id='copy'")], ["filler007"])
        finally:
            for doc_id in ids + ["probe", "copy"]:
                db.forget(doc_id)
                db.run("DELETE FROM documents WHERE id=?", (doc_id,))

    def test_a_forgotten_document_leaves_no_keys_behind(self):
        db.run("INSERT INTO documents (id, filename, status) VALUES ('gone','g.pdf','done')")
        ingestion._find_duplicates("gone", snapshot()[CIRCULAR]["full_text"])
        self.assertTrue(db.q("SELECT 1 FROM duplicates WHERE doc_id='gone'"))
        db.forget("gone")
        db.run("DELETE FROM documents WHERE id='gone'")
        self.assertEqual(db.q("SELECT 1 FROM dup_keys WHERE doc_id='gone'"), [])
        self.assertEqual(db.q("SELECT 1 FROM duplicates WHERE doc_id='gone' OR other_id='gone'"), [])


if __name__ == "__main__":
    unittest.main()
