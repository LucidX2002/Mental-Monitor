import unittest

from backend.parsing import parse_post_list, parse_string_list, parse_timestamp_list


class ParsingTests(unittest.TestCase):
    def test_parse_post_list_handles_python_literal_lists(self) -> None:
        raw = "['hello', ' world ', '', 'bye']"
        self.assertEqual(parse_post_list(raw), ["hello", " world ", "bye"])

    def test_parse_string_list_falls_back_to_single_value(self) -> None:
        self.assertEqual(parse_string_list("adhd"), ["adhd"])

    def test_parse_timestamp_list_extracts_timestamp_wrappers(self) -> None:
        raw = "[Timestamp('2018-03-28 00:00:00'), Timestamp('2018-04-07 12:30:00')]"
        self.assertEqual(
            parse_timestamp_list(raw),
            ["2018-03-28T00:00:00", "2018-04-07T12:30:00"],
        )


if __name__ == "__main__":
    unittest.main()
