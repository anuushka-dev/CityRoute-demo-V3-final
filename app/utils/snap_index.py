from __future__ import annotations

from dataclasses import dataclass
from time import perf_counter
from typing import Any, Literal, TypedDict

import numpy as np

from app.utils.graphio import haversine_m

EARTH_RADIUS_M = 6_371_000.0
SnapMethod = Literal["balltree", "linear_fallback"]

_SNAP_INDEX_CACHE: dict[tuple[int, int], "SnapIndex"] = {}


class SnappedCoordinate(TypedDict):
    lat: float
    lon: float


class SnapQueryResult(TypedDict):
    nearest_node: int
    snapped: SnappedCoordinate
    snap_distance_m: float
    snap_method: SnapMethod


@dataclass(frozen=True)
class SnapIndex:
    node_ids: list[int]
    coordinates_rad: np.ndarray
    tree: Any | None
    build_time_ms: float
    method: SnapMethod
    import_error: str | None = None

    @property
    def node_count(self) -> int:
        return len(self.node_ids)

    @property
    def is_balltree(self) -> bool:
        return self.tree is not None and self.method == "balltree"


def _load_ball_tree() -> tuple[Any | None, str | None]:
    try:
        from sklearn.neighbors import BallTree

        return BallTree, None
    except Exception as exc:
        return None, f"{type(exc).__name__}: {exc}"


def build_snap_index(graph: Any) -> SnapIndex:
    """
    Build an in-memory haversine spatial index over all graph nodes.

    Coordinates are stored in radians as [lat_rad, lon_rad], which is required by
    scikit-learn's BallTree(metric="haversine"). When scikit-learn is blocked on a
    Windows host, the same radian array backs a vectorized haversine fallback.
    """
    node_total = len(graph.nodes)
    cache_key = (id(graph), node_total)
    if node_total >= 500 and cache_key in _SNAP_INDEX_CACHE:
        return _SNAP_INDEX_CACHE[cache_key]

    started = perf_counter()

    node_ids: list[int] = []
    coordinates_deg: list[tuple[float, float]] = []

    for node_id, data in graph.nodes(data=True):
        if "y" not in data or "x" not in data:
            raise ValueError(f"Graph node {node_id} is missing 'y' (lat) or 'x' (lon)")

        lat = float(data["y"])
        lon = float(data["x"])

        node_ids.append(int(node_id))
        coordinates_deg.append((lat, lon))

    if not node_ids:
        raise ValueError("Cannot build snap index for an empty graph")

    coordinates_rad = np.radians(np.asarray(coordinates_deg, dtype=np.float64))
    ball_tree_cls, import_error = _load_ball_tree()

    if ball_tree_cls is not None:
        tree = ball_tree_cls(coordinates_rad, metric="haversine")
        method: SnapMethod = "balltree"
    else:
        tree = None
        method = "linear_fallback"

    build_time_ms = round((perf_counter() - started) * 1000.0, 3)

    index = SnapIndex(
        node_ids=node_ids,
        coordinates_rad=coordinates_rad,
        tree=tree,
        build_time_ms=build_time_ms,
        method=method,
        import_error=import_error,
    )
    if node_total >= 500:
        _SNAP_INDEX_CACHE[cache_key] = index
    return index


def _query_position(
    *,
    snap_index: SnapIndex,
    lat: float,
    lon: float,
) -> tuple[int, float]:
    query_rad = np.radians(np.asarray([[lat, lon]], dtype=np.float64))

    if snap_index.tree is not None:
        distances_rad, indices = snap_index.tree.query(query_rad, k=1)
        nearest_pos = int(indices[0][0])
        snap_distance_m = float(distances_rad[0][0] * EARTH_RADIUS_M)
        return nearest_pos, snap_distance_m

    node_lat = snap_index.coordinates_rad[:, 0]
    node_lon = snap_index.coordinates_rad[:, 1]
    lat1 = float(query_rad[0, 0])
    lon1 = float(query_rad[0, 1])

    dlat = node_lat - lat1
    dlon = node_lon - lon1
    hav = (
        np.sin(dlat / 2.0) ** 2
        + np.cos(lat1) * np.cos(node_lat) * (np.sin(dlon / 2.0) ** 2)
    )
    distances_rad = 2.0 * np.arcsin(np.minimum(1.0, np.sqrt(hav)))
    nearest_pos = int(np.argmin(distances_rad))
    snap_distance_m = float(distances_rad[nearest_pos] * EARTH_RADIUS_M)
    return nearest_pos, snap_distance_m


def query_snap_index(
    *,
    graph: Any,
    snap_index: SnapIndex,
    lat: float,
    lon: float,
) -> SnapQueryResult:
    """
    Snap a latitude/longitude coordinate to the nearest graph node using the
    prebuilt haversine index.
    """
    nearest_pos, snap_distance_m = _query_position(
        snap_index=snap_index,
        lat=lat,
        lon=lon,
    )
    nearest_node = int(snap_index.node_ids[nearest_pos])
    node_data = graph.nodes[nearest_node]
    snapped_lat = float(node_data["y"])
    snapped_lon = float(node_data["x"])

    if not np.isfinite(snap_distance_m):
        snap_distance_m = haversine_m(lat, lon, snapped_lat, snapped_lon)

    return {
        "nearest_node": nearest_node,
        "snapped": {
            "lat": round(snapped_lat, 6),
            "lon": round(snapped_lon, 6),
        },
        "snap_distance_m": round(snap_distance_m, 2),
        "snap_method": snap_index.method,
    }


def query_nearest_node_id(
    *,
    snap_index: SnapIndex,
    lat: float,
    lon: float,
) -> int:
    """
    Fast helper for internal services that only need the snapped node ID.
    """
    nearest_pos, _ = _query_position(
        snap_index=snap_index,
        lat=lat,
        lon=lon,
    )
    return int(snap_index.node_ids[nearest_pos])
