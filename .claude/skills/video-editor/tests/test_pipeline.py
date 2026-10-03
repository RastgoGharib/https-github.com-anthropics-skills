"""Offline tests for cut detection, timeline remapping and caption output.

Run: python3 -m unittest discover -s .claude/skills/video-editor/tests
"""
import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "scripts"))
from common import DEFAULTS, norm  # noqa: E402
from cutlist import detect_retakes, detect_silences, detect_stumbles  # noqa: E402
from render import build_ass, keep_segments, merge, remap, retime_words  # noqa: E402


def W(*specs):
    return [dict(text=t, start=s, end=e, type="word", logprob=-0.1) for t, s, e in specs]


class Cuts(unittest.TestCase):
    def test_silence_between_words(self):
        words = W(("سڵاو", 0.0, 0.4), ("هاوڕێیان", 1.6, 2.0))
        cuts = detect_silences(words, 2.1, DEFAULTS)
        self.assertEqual(len(cuts), 1)
        self.assertAlmostEqual(cuts[0]["start"], 0.55)
        self.assertAlmostEqual(cuts[0]["end"], 1.45)

    def test_retake_keeps_second_take(self):
        # "today I want / today I want to say"
        words = W(("ئەمڕۆ", 0, .3), ("ئەمەوێت", .3, .7), ("ئەمڕۆ", 1.5, 1.8), ("ئەمەوێت", 1.8, 2.2), ("بڵێم", 2.2, 2.5))
        cuts = detect_retakes(words, DEFAULTS)
        self.assertEqual([(c["start"], c["end"]) for c in cuts], [(0, 1.5)])

    def test_doubled_word_is_review_not_cut(self):
        words = W(("زۆر", 0, .2), ("زۆر", .25, .45), ("گرنگە", .5, .9))
        cuts = detect_stumbles(words, DEFAULTS)
        self.assertEqual(len(cuts), 1)
        self.assertEqual(cuts[0]["suggest"], "review")
        self.assertEqual(detect_retakes(words, DEFAULTS), [])  # single word is not a retake

    def test_normalization_matches_arabic_variants(self):
        self.assertEqual(norm("كتێب،"), norm("کتێب"))
        self.assertEqual(norm("دوازدە."), norm("دوازدە"))


class Timeline(unittest.TestCase):
    def test_merge_and_remap(self):
        removed = merge([[1, 2], [1.5, 3], [5, 6]])
        self.assertEqual(removed, [[1, 3], [5, 6]])
        keep = keep_segments(removed, 8)
        self.assertEqual(keep, [(0.0, 1), (3, 5), (6, 8)])
        self.assertAlmostEqual(remap(4, keep), 2.0)
        self.assertIsNone(remap(2, keep))
        self.assertAlmostEqual(remap(7, keep), 4.0)

    def test_cut_words_dropped_and_fixes_applied(self):
        words = W(("a", .1, .3), ("gone", 1.2, 1.5), ("Spas", 3.2, 3.5))
        out = retime_words(words, [(0, 1), (3, 4)], {"Spas": "سپاس"})
        self.assertEqual([w["text"] for w in out], ["a", "سپاس"])
        self.assertAlmostEqual(out[1]["start"], 1.2)


class Captions(unittest.TestCase):
    def test_rtl_ass(self):
        words = [dict(text=t, start=i * .3, end=i * .3 + .25) for i, t in enumerate("ئەمەیان زۆر زۆر گرنگە.".split())]
        ass = build_ass(words, DEFAULTS, 1080, 1920)
        style = next(line for line in ass.splitlines() if line.startswith("Style:"))
        self.assertTrue(style.endswith(",-1"), "Encoding must be -1 for bidi")
        events = [line for line in ass.splitlines() if line.startswith("Dialogue:")]
        self.assertEqual(len(events), 4)  # karaoke: one event per word
        self.assertIn("‏", events[0])  # RLM forces RTL base direction
        self.assertIn("&H0000D4FF}ئەمەیان", events[0])  # first word highlighted


if __name__ == "__main__":
    unittest.main()
