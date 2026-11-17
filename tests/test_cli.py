"""CLI unit tests; do not start the API or require a Redis instance."""

import io
import json
import unittest
from contextlib import redirect_stdout
from unittest.mock import patch

from app.cli import _read_json_body, build_parser, build_url, main


class TestCityRouteCli(unittest.TestCase):
    def test_default_route(self):
        args = build_parser().parse_args(
            [
                "route",
                "--start-lat",
                "26.46",
                "--start-lon",
                "80.32",
                "--end-lat",
                "26.47",
                "--end-lon",
                "80.34",
            ]
        )
        self.assertEqual(args.path, "/route")
        self.assertEqual(args.start_lat, 26.46)

    def test_query_encoding(self):
        url = build_url("http://localhost:8010/", "/graph/snap", {"lat": 26.46, "lon": 80.32})
        self.assertEqual(url, "http://localhost:8010/graph/snap?lat=26.46&lon=80.32")

    def test_disallow_host_override(self):
        with self.assertRaises(ValueError):
            build_url("http://localhost:8010", "//other-host/path")

    def test_json_body_validates(self):
        self.assertEqual(json.loads(_read_json_body('{"a":1}')), {"a": 1})
        with self.assertRaises(json.JSONDecodeError):
            _read_json_body("{broken")

    @patch("app.cli.request_json", return_value={"status": "alive"})
    def test_health_command(self, mock_http):
        output = io.StringIO()
        with redirect_stdout(output):
            result = main(["health", "--url", "http://localhost:8010"])
        self.assertEqual(result, 0)
        self.assertIn('"alive"', output.getvalue())
        self.assertEqual(mock_http.call_args.args[0], "http://localhost:8010/health/live")


if __name__ == "__main__":
    unittest.main()
