"""Unit tests for the one-post-per-goal rule. No network, no credentials.

An Atlas update is a single post of at most 280 visible characters. A body over the
limit must fail loudly against its goal. It must never be split or silently trimmed.
"""

import json
import unittest

from goals import MAX_VISIBLE_CHARS
from post_goal_updates import GoalError, adf_summary, check_body


class CheckBodyTests(unittest.TestCase):
    def test_short_body_returned_unchanged(self):
        body = "Key wins: Launch fixed for Oct 15. Blocker: databases need infra support."
        self.assertEqual(check_body(body), body)

    def test_body_exactly_at_limit_passes(self):
        body = "A" * MAX_VISIBLE_CHARS
        self.assertEqual(len(check_body(body)), MAX_VISIBLE_CHARS)

    def test_body_one_over_limit_raises(self):
        with self.assertRaises(GoalError) as ctx:
            check_body("A" * (MAX_VISIBLE_CHARS + 1))
        msg = str(ctx.exception)
        self.assertIn(str(MAX_VISIBLE_CHARS + 1), msg)
        self.assertIn("not be split", msg)

    def test_long_body_is_never_split_or_trimmed(self):
        body = " ".join(f"Sentence {i} carries concrete detail." for i in range(1, 40))
        self.assertGreater(len(body), MAX_VISIBLE_CHARS)
        with self.assertRaises(GoalError):
            check_body(body)

    def test_empty_whitespace_and_none_raise(self):
        for bad in ("", "   \n  ", None):
            with self.assertRaises(GoalError):
                check_body(bad)

    def test_surrounding_whitespace_is_stripped(self):
        self.assertEqual(check_body("  hello  \n"), "hello")

    def test_whitespace_does_not_count_against_limit(self):
        padded = "  " + "A" * MAX_VISIBLE_CHARS + "  "
        self.assertEqual(len(check_body(padded)), MAX_VISIBLE_CHARS)

    def test_no_part_suffix_is_added(self):
        out = check_body("Short single post.")
        self.assertNotRegex(out, r"\(\d+/\d+\)")


class AdfSummaryTests(unittest.TestCase):
    def test_summary_is_a_string_not_an_object(self):
        self.assertIsInstance(adf_summary("hello"), str)

    def test_summary_round_trips_to_expected_adf_shape(self):
        doc = json.loads(adf_summary("hello world"))
        self.assertEqual(doc["type"], "doc")
        self.assertEqual(doc["version"], 1)
        self.assertEqual(doc["content"][0]["content"][0]["text"], "hello world")


if __name__ == "__main__":
    unittest.main()
