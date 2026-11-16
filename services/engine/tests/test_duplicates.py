"""Duplicate detection: blocking must never cost a true duplicate, and must
actually spare the fuzzy scorer most of the corpus."""
import json
import random
import subprocess
import sys
import unittest

from dueproof_engine.pipeline.link import (CANDIDATE_KEYS, DUPLICATE_THRESHOLD, SHINGLE, SIG_SIZE,
                                           _norm_text, near_duplicate_score, signature)
from tests.support import REPO, CIRCULAR, SCAN, snapshot


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
        code = ("import sys, json; sys.path.insert(0, %r); from dueproof_engine.pipeline.link import signature;"
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
                    if near_duplicate_score(base, noisy) >= DUPLICATE_THRESHOLD:
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


if __name__ == "__main__":
    unittest.main()
