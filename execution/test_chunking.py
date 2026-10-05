"""Unit tests for chunk_body. No network, no credentials.

The chunking logic is the only real logic in Stage B, so it is the only thing worth
testing directly. Everything else is API plumbing verified by a dry run.
"""

import re
import unittest

from goals import MAX_VISIBLE_CHARS
from post_goal_updates import adf_summary, chunk_body

SUFFIX_RE = re.compile(r" \(\d+/\d+\)$")


def strip_suffix(chunk: str) -> str:
    return SUFFIX_RE.sub("", chunk)


def words(text: str) -> list[str]:
    return text.split()


class ChunkBodyTests(unittest.TestCase):
    def test_short_body_single_chunk_no_suffix(self):
        body = (
            "Key wins: Game key template shipped in SiteBuilder and duplicated cleanly "
            "(XLAPAGES-147). Meetups MVP PRD finalized (XLAPAGES-158). PM Rene Valen now "
            "owns unassigned tickets. Blocker: no developer to integrate the two tracks "
            "before October."
        )
        self.assertLessEqual(len(body), MAX_VISIBLE_CHARS)
        chunks = chunk_body(body)
        self.assertEqual(len(chunks), 1)
        self.assertEqual(chunks[0], body)
        self.assertIsNone(SUFFIX_RE.search(chunks[0]))

    def test_269_char_body_single_chunk(self):
        body = "A" * 180 + ". " + "B" * 85
        self.assertEqual(len(body), 267)
        chunks = chunk_body(body)
        self.assertEqual(len(chunks), 1)
        self.assertIsNone(SUFFIX_RE.search(chunks[0]))

    def test_long_body_every_chunk_within_limit_including_suffix(self):
        sentences = [
            f"Sentence number {i} carries some concrete detail about the goal and a date like Oct {i}."
            for i in range(1, 12)
        ]
        body = " ".join(sentences)
        self.assertGreater(len(body), 800)
        chunks = chunk_body(body)
        self.assertGreater(len(chunks), 1)
        for c in chunks:
            self.assertLessEqual(
                len(c), MAX_VISIBLE_CHARS, f"chunk of {len(c)} exceeds cap: {c!r}"
            )
            self.assertIsNotNone(SUFFIX_RE.search(c), f"multi-chunk output missing suffix: {c!r}")

    def test_suffix_numbering_is_sequential_and_total_correct(self):
        body = " ".join(f"Fact {i} about the programme and its owner." for i in range(1, 30))
        chunks = chunk_body(body)
        total = len(chunks)
        self.assertGreater(total, 1)
        for i, c in enumerate(chunks, 1):
            self.assertTrue(c.endswith(f" ({i}/{total})"), f"bad suffix on chunk {i}: {c!r}")

    def test_no_chunk_splits_mid_word(self):
        body = " ".join(f"Deliverable{i} progressed materially this cycle." for i in range(1, 40))
        chunks = chunk_body(body)
        original = words(body)
        produced = []
        for c in chunks:
            produced.extend(words(strip_suffix(c)))
        self.assertEqual(produced, original)

    def test_content_preserved_across_chunks(self):
        body = (
            "Target 3-5 paid deals by Jan 2027. 10 proposals out by Oct 15 with warm outreach. "
            "Budget 80k approved. Risk: 30 percent conversion may not support targets. "
            "October decision needed on proposal count versus deal threshold. "
            "Pipeline review moved to the 12th. Two sponsors verbally committed pending legal. "
            "Attribution tooling blocked on the Backpack dependency overdue since Sept 1."
        )
        chunks = chunk_body(body)
        rejoined = " ".join(strip_suffix(c) for c in chunks)
        self.assertEqual(words(rejoined), words(body))

    def test_empty_and_whitespace_body_returns_empty_list(self):
        self.assertEqual(chunk_body(""), [])
        self.assertEqual(chunk_body("   \n  "), [])
        self.assertEqual(chunk_body(None), [])

    def test_pathological_single_long_word_terminates(self):
        body = "X" * 400
        chunks = chunk_body(body)
        self.assertGreater(len(chunks), 1)
        for c in chunks:
            self.assertLessEqual(len(c), MAX_VISIBLE_CHARS)
        rejoined = "".join(strip_suffix(c) for c in chunks)
        self.assertEqual(rejoined, body)

    def test_comma_fallback_for_one_very_long_sentence(self):
        body = ", ".join(f"item {i} with a little context attached" for i in range(1, 20)) + "."
        self.assertGreater(len(body), MAX_VISIBLE_CHARS)
        chunks = chunk_body(body)
        for c in chunks:
            self.assertLessEqual(len(c), MAX_VISIBLE_CHARS)

    def test_boundary_body_exactly_at_limit(self):
        body = "A" * MAX_VISIBLE_CHARS
        chunks = chunk_body(body)
        self.assertEqual(len(chunks), 1)
        self.assertEqual(len(chunks[0]), MAX_VISIBLE_CHARS)

    def test_boundary_body_one_over_limit_splits_and_fits(self):
        body = "word " * 60  # ~300 chars, forces a split
        self.assertGreater(len(body.strip()), MAX_VISIBLE_CHARS)
        chunks = chunk_body(body)
        self.assertGreater(len(chunks), 1)
        for c in chunks:
            self.assertLessEqual(len(c), MAX_VISIBLE_CHARS)


class AdfSummaryTests(unittest.TestCase):
    def test_summary_is_a_string_not_an_object(self):
        out = adf_summary("hello")
        self.assertIsInstance(out, str)

    def test_summary_round_trips_to_expected_adf_shape(self):
        import json

        doc = json.loads(adf_summary("hello world"))
        self.assertEqual(doc["type"], "doc")
        self.assertEqual(doc["version"], 1)
        self.assertEqual(doc["content"][0]["content"][0]["text"], "hello world")


if __name__ == "__main__":
    unittest.main()
