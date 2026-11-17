from __future__ import annotations

import math
from importlib import import_module
from pathlib import Path
from typing import Any

import networkx as nx

EARTH_RADIUS_M = 6_371_000.0
NUMERIC_NODE_ATTRS = ("x", "y", "lat", "lon")
NUMERIC_EDGE_ATTRS = ("length", "speed_kph", "travel_time", "weight", "minute")
BOOL_EDGE_ATTRS = ("oneway", "reversed", "bridge", "tunnel")

_OSMNX_MISSING = object()
_OSMNX_MODULE: Any = _OSMNX_MISSING
_OSMNX_IMPORT_ERROR: Exception | None = None
_GRAPH_CACHE: dict[str, Any] = {}


class GraphDownloadUnavailable(RuntimeError):
    """Raised when OSMnx is needed to download an uncached graph but cannot be imported."""


def osmnx() -> Any | None:
    """Import OSMnx lazily when available; return None when blocked or missing."""
    global _OSMNX_MODULE, _OSMNX_IMPORT_ERROR

    if _OSMNX_MODULE is _OSMNX_MISSING:
        try:
            _OSMNX_MODULE = import_module("osmnx")
            _OSMNX_IMPORT_ERROR = None
        except Exception as exc:
            _OSMNX_MODULE = None
            _OSMNX_IMPORT_ERROR = exc

    return _OSMNX_MODULE


def osmnx_import_error() -> Exception | None:
    osmnx()
    return _OSMNX_IMPORT_ERROR


def graph_backend() -> str:
    return "osmnx" if osmnx() is not None else "networkx"


def _coerce_float(value: Any) -> Any:
    if isinstance(value, (int, float)):
        return float(value)

    if isinstance(value, str):
        text = value.strip()
        try:
            return float(text)
        except ValueError:
            return value

    return value


def _coerce_bool(value: Any) -> Any:
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        lowered = value.strip().lower()
        if lowered in {"true", "1", "yes"}:
            return True
        if lowered in {"false", "0", "no"}:
            return False

    return value


def _coerce_graph_types(graph: nx.MultiDiGraph) -> nx.MultiDiGraph:
    graph.graph["simplified"] = _coerce_bool(graph.graph.get("simplified", True))

    for _, attrs in graph.nodes(data=True):
        for attr in NUMERIC_NODE_ATTRS:
            if attr in attrs:
                attrs[attr] = _coerce_float(attrs[attr])

        if "y" not in attrs and "lat" in attrs:
            attrs["y"] = attrs["lat"]
        if "x" not in attrs and "lon" in attrs:
            attrs["x"] = attrs["lon"]

    for _, _, _, attrs in graph.edges(keys=True, data=True):
        for attr in NUMERIC_EDGE_ATTRS:
            if attr in attrs:
                attrs[attr] = _coerce_float(attrs[attr])

        for attr in BOOL_EDGE_ATTRS:
            if attr in attrs:
                attrs[attr] = _coerce_bool(attrs[attr])

    return graph


def load_graphml(path: str | Path) -> Any:
    graph_path = Path(path)
    cache_key = str(graph_path.resolve())
    cached = _GRAPH_CACHE.get(cache_key)
    if cached is not None:
        return cached

    module = osmnx()
    if module is not None:
        graph = module.load_graphml(graph_path)
    else:
        raw_graph = nx.read_graphml(graph_path, node_type=int, force_multigraph=True)
        graph = raw_graph if isinstance(raw_graph, nx.MultiDiGraph) else nx.MultiDiGraph(raw_graph)
        graph = _coerce_graph_types(graph)

    _GRAPH_CACHE[cache_key] = graph
    return graph


def save_graphml(graph: Any, path: str | Path) -> bool:
    graph_path = Path(path)
    graph_path.parent.mkdir(parents=True, exist_ok=True)
    module = osmnx()

    if module is not None:
        module.save_graphml(graph, graph_path)
        _GRAPH_CACHE[str(graph_path.resolve())] = graph
        return True

    nx.write_graphml(graph, graph_path)
    _GRAPH_CACHE[str(graph_path.resolve())] = graph
    return True


def graph_from_bbox(
    bbox: tuple[float, float, float, float],
    *,
    network_type: str = "drive",
    simplify: bool = True,
) -> Any:
    module = osmnx()
    if module is None:
        raise GraphDownloadUnavailable(
            f"OSMnx is unavailable ({osmnx_import_error()}); provide a cached GraphML file at data/graphs."
        )

    return module.graph_from_bbox(bbox=bbox, network_type=network_type, simplify=simplify)


def graph_from_place(
    place: str,
    *,
    network_type: str = "drive",
    simplify: bool = True,
) -> Any:
    module = osmnx()
    if module is None:
        raise GraphDownloadUnavailable(
            f"OSMnx is unavailable ({osmnx_import_error()}); provide a cached GraphML file at data/graphs."
        )

    return module.graph_from_place(place, network_type=network_type, simplify=simplify)


def haversine_m(lat_a: float, lon_a: float, lat_b: float, lon_b: float) -> float:
    lat1 = math.radians(lat_a)
    lon1 = math.radians(lon_a)
    lat2 = math.radians(lat_b)
    lon2 = math.radians(lon_b)
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    hav = math.sin(dlat / 2.0) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2.0) ** 2
    return 2.0 * EARTH_RADIUS_M * math.asin(min(1.0, math.sqrt(hav)))


def nearest_node(graph: Any, *, lat: float, lon: float) -> int:
    module = osmnx()
    if module is not None:
        try:
            return int(module.distance.nearest_nodes(graph, X=lon, Y=lat))
        except Exception:
            pass

    best_node: int | None = None
    best_distance = float("inf")

    for node_id, attrs in graph.nodes(data=True):
        node_lat = attrs.get("y", attrs.get("lat"))
        node_lon = attrs.get("x", attrs.get("lon"))
        if node_lat is None or node_lon is None:
            continue

        distance = haversine_m(lat, lon, float(node_lat), float(node_lon))
        if distance < best_distance:
            best_distance = distance
            best_node = int(node_id)

    if best_node is None:
        raise ValueError("Graph contains no nodes with coordinates.")

    return best_node
