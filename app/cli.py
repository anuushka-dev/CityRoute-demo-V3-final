"""CityRoute command-line interface, using only Python's standard library.

Examples:
  python -m app.cli serve --port 8010
  python -m app.cli health --url http://localhost:8010
  python -m app.cli route --start-lat 26.46 --start-lon 80.32 --end-lat 26.47 --end-lon 80.34
  python -m app.cli request /config
  python -m app.cli request /dispatch/compare --method POST --body @payload.json
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit, urlunsplit
from urllib.request import Request, urlopen


DEFAULT_URL = "http://127.0.0.1:8010"


def _add_http_options(parser: argparse.ArgumentParser) -> None:
    parser.add_argument(
        "--url", default=DEFAULT_URL, metavar="URL", help=f"API base URL (default: {DEFAULT_URL})"
    )
    parser.add_argument(
        "--timeout", type=float, default=15.0, metavar="SEC", help="Request timeout in seconds"
    )


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="cityroute", description="CityRoute command line — run and query your local routing API."
    )
    sub = parser.add_subparsers(dest="command", required=True)

    serve = sub.add_parser("serve", help="Start the FastAPI backend (requires project dependencies)")
    serve.add_argument("--host", default="127.0.0.1", help="Bind address (default: 127.0.0.1)")
    serve.add_argument("--port", type=int, default=8010, help="HTTP port (default: 8010)")
    serve.add_argument("--reload", action="store_true", help="Reload on source changes")

    checks = {
        "health": "/health/live",
        "ready": "/health/ready",
        "graph-stats": "/graph/stats",
        "redis-status": "/redis/status",
        "config": "/config",
    }
    for name, path in checks.items():
        p = sub.add_parser(name, help=f"GET {path}")
        _add_http_options(p)
        p.set_defaults(path=path, method="GET", body=None)

    for name, path in (("route", "/route"), ("route-compare", "/route/compare")):
        p = sub.add_parser(name, help=f"GET {path} with coordinates")
        _add_http_options(p)
        for arg in ("start-lat", "start-lon", "end-lat", "end-lon"):
            p.add_argument("--" + arg, type=float, required=True)
        p.set_defaults(path=path, method="GET", body=None)

    req = sub.add_parser("request", help="Call any CityRoute GET/POST endpoint")
    req.add_argument("path", help="API path, e.g. /graph/stats or /dispatch/compare")
    req.add_argument("--method", choices=("GET", "POST"), default="GET")
    req.add_argument(
        "--body", metavar="JSON|@FILE", help="POST JSON as text, or @path-to-json-file"
    )
    _add_http_options(req)
    return parser


def build_url(base_url: str, path: str, params: dict[str, object] | None = None) -> str:
    base = urlsplit(base_url.strip())
    if base.scheme not in {"http", "https"} or not base.netloc:
        raise ValueError("--url must be an http:// or https:// base address")
    if not path.startswith("/") or path.startswith("//"):
        raise ValueError("API path must start with one /, e.g. /health/live")
    # Reject URLs disguised as paths and fragments, keeping requests on the selected API host.
    parsed_path = urlsplit(path)
    if parsed_path.scheme or parsed_path.netloc or parsed_path.fragment:
        raise ValueError("API path cannot override the base host or contain a fragment")
    query = parsed_path.query
    if params:
        query = "&".join(part for part in (query, urlencode(params)) if part)
    prefix = base.path.rstrip("/")
    return urlunsplit((base.scheme, base.netloc, prefix + parsed_path.path, query, ""))


def _read_json_body(raw: str | None) -> bytes | None:
    if raw is None:
        return None
    if raw.startswith("@"):
        text = Path(raw[1:]).read_text(encoding="utf-8")
    else:
        text = raw
    # Validate JSON before contacting the server.
    parsed = json.loads(text)
    return json.dumps(parsed).encode("utf-8")


def request_json(url: str, *, method: str, body: bytes | None, timeout: float) -> object:
    request = Request(
        url,
        data=body,
        method=method,
        headers={"Accept": "application/json", **({"Content-Type": "application/json"} if body else {})},
    )
    with urlopen(request, timeout=timeout) as response:
        content = response.read().decode("utf-8")
    try:
        return json.loads(content)
    except json.JSONDecodeError:
        return content


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)

    if args.command == "serve":
        if not 1 <= args.port <= 65535:
            parser.error("--port must be between 1 and 65535")
        try:
            import uvicorn
        except ImportError:
            print("Install project dependencies first: python -m pip install -r requirements.txt", file=sys.stderr)
            return 1
        uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload)
        return 0

    if args.timeout <= 0:
        parser.error("--timeout must be greater than zero")

    path = args.path
    params = None
    if args.command in {"route", "route-compare"}:
        params = {
            "start_lat": args.start_lat,
            "start_lon": args.start_lon,
            "end_lat": args.end_lat,
            "end_lon": args.end_lon,
        }

    try:
        body = _read_json_body(args.body)
        method = args.method
        if body is not None and method != "POST":
            raise ValueError("--body requires --method POST")
        url = build_url(args.url, path, params)
        response = request_json(url, method=method, body=body, timeout=args.timeout)
        print(json.dumps(response, indent=2, ensure_ascii=False))
        return 0
    except HTTPError as exc:
        response_body = exc.read(4096).decode("utf-8", errors="replace")
        print(f"CityRoute HTTP {exc.code}: {response_body}", file=sys.stderr)
        return 1
    except URLError as exc:
        print(f"Cannot connect to CityRoute API: {exc.reason}", file=sys.stderr)
        return 1
    except (ValueError, OSError) as exc:
        print(f"CityRoute CLI error: {exc}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
