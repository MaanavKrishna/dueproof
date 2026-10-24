"""Deskew-and-map-back: rotate a synthetic page by a known angle and check the
boxes come home. The one piece of maths that is easy to break and hard to notice."""
import unittest

import cv2
import numpy as np

from dueproof.pipeline.link import _rects_for, _stitch
from dueproof.pipeline.read import MAX_SKEW_DEG, _deskew, _map_back

W, H = 1200, 1600
BOX = (300.0, 500.0, 700.0, 540.0)      # a word box on the straight page


def page() -> np.ndarray:
    """A white page of ruled 'text lines' — what Hough sees in a real scan."""
    img = np.full((H, W), 255, np.uint8)
    for y in range(120, H - 120, 46):
        cv2.line(img, (110, y), (W - 110, y), 0, 2)
        cv2.putText(img, "Northline fire safety audit circular", (120, y - 10),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.9, 0, 2)
    return img


def rotate(img: np.ndarray, deg: float):
    m = cv2.getRotationMatrix2D((W / 2.0, H / 2.0), deg, 1.0)
    return cv2.warpAffine(img, m, (W, H), borderValue=255), m


def bbox_through(box, m):
    x0, y0, x1, y1 = box
    p = np.array([[x0, y0, 1], [x1, y0, 1], [x1, y1, 1], [x0, y1, 1]]) @ m.T
    return p[:, 0].min(), p[:, 1].min(), p[:, 0].max(), p[:, 1].max()


class MapBack(unittest.TestCase):
    def test_identity_when_no_deskew(self):
        self.assertEqual(_map_back(BOX, None), BOX)

    def test_exact_under_a_known_affine(self):
        m = cv2.getRotationMatrix2D((W / 2.0, H / 2.0), 5.0, 1.0)
        got = _map_back(BOX, m)
        for g, w in zip(got, bbox_through(BOX, m)):
            self.assertAlmostEqual(g, w, places=2)

    def test_round_trip_contains_the_original(self):
        """Forward then inverse yields an axis-aligned box that still covers the
        word: highlights may grow under rotation, they must never miss."""
        m = cv2.getRotationMatrix2D((W / 2.0, H / 2.0), 4.0, 1.0)
        x0, y0, x1, y1 = _map_back(_map_back(BOX, m), cv2.invertAffineTransform(m))
        self.assertLessEqual(x0, BOX[0] + 0.01)
        self.assertLessEqual(y0, BOX[1] + 0.01)
        self.assertGreaterEqual(x1, BOX[2] - 0.01)
        self.assertGreaterEqual(y1, BOX[3] - 0.01)


class Deskew(unittest.TestCase):
    def test_straight_page_is_left_alone(self):
        img = page()
        out, inv = _deskew(img)
        self.assertIsNone(inv)
        self.assertIs(out, img)

    def test_blank_page_is_left_alone(self):
        _, inv = _deskew(np.full((H, W), 255, np.uint8))
        self.assertIsNone(inv)

    def test_boxes_come_back_within_tolerance(self):
        for deg in (-6.0, -3.0, -1.0, 1.0, 2.5, 5.0, 7.0):
            with self.subTest(deg=deg):
                skewed, m = rotate(page(), deg)
                _, inv = _deskew(skewed)
                self.assertIsNotNone(inv, "skew not detected")
                # A box found on the straightened page, pushed back through the
                # inverse, must land where the rotation put that region.
                got, want = _map_back(BOX, inv), bbox_through(BOX, m)
                for g, w in zip(got, want):
                    self.assertAlmostEqual(g, w, delta=8.0)

    def test_recovered_angle(self):
        for deg in (-5.0, 3.0):
            with self.subTest(deg=deg):
                _, inv = _deskew(rotate(page(), deg)[0])
                recovered = np.degrees(np.arctan2(inv[1, 0], inv[0, 0]))
                self.assertAlmostEqual(abs(recovered), abs(deg), delta=0.3)

    def test_skew_beyond_the_cap_is_not_guessed_at(self):
        _, inv = _deskew(rotate(page(), MAX_SKEW_DEG + 7)[0])
        self.assertIsNone(inv)


class Rectangles(unittest.TestCase):
    @staticmethod
    def w(x0, y0, x1, y1, line):
        return {"x0": x0, "y0": y0, "x1": x1, "y1": y1, "line_id": line}

    def test_one_rect_per_line_never_a_union(self):
        words = [self.w(0.60, 0.10, 0.90, 0.12, 0), self.w(0.10, 0.13, 0.50, 0.15, 1),
                 self.w(0.10, 0.16, 0.30, 0.18, 2)]
        rects = _rects_for(words, [0, 1, 2])
        self.assertEqual(len(rects), 3)
        self.assertGreater(rects[0][0], 0.55)        # line 1 did not swallow the left margin

    def test_stitch_merges_runs_of_one_visual_line(self):
        self.assertEqual(len(_stitch([[0.10, 0.10, 0.40, 0.12], [0.405, 0.10, 0.80, 0.12]])), 1)

    def test_stitch_keeps_columns_apart(self):
        self.assertEqual(len(_stitch([[0.10, 0.10, 0.40, 0.12], [0.55, 0.10, 0.90, 0.12]])), 2)

    def test_rects_stay_inside_the_page(self):
        for r in _rects_for([self.w(0.0, 0.0, 1.0, 1.0, 0)], [0]):
            self.assertTrue(all(0.0 <= v <= 1.0 for v in r))


if __name__ == "__main__":
    unittest.main()
