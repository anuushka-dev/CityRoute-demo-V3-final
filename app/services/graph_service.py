from __future__ import annotations

import logging
from typing import Any

import networkx as nx

from app.config import settings
from app.utils.graphio import (
    graph_backend,
    graph_from_bbox,
    graph_from_place,
    load_graphml,
    osmnx_import_error,
    save_graphml,
)

logger = logging.getLogger(__name__)

_CONNECTIVITY_CACHE: dict[int, tuple[int, int]] = {}


def ensure_directories() -> None:
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    settings.graph_dir.mkdir(parents=True, exist_ok=True)


def extract_graph_stats(graph: Any) -> dict[str, Any]:
    graph_id = id(graph)
    if graph_id in _CONNECTIVITY_CACHE:
        component_count, largest_component_size = _CONNECTIVITY_CACHE[graph_id]
    else:
        weak_components = list(nx.weakly_connected_components(graph))
        largest_component_size = max((len(c) for c in weak_components), default=0)
        component_count = len(weak_components)
        _CONNECTIVITY_CACHE[graph_id] = (component_count, largest_component_size)

    return {
        "city_name": settings.city_name,
        "city_short_name": settings.city_short_name,
        "graph_path": str(settings.graph_path),
        "nodes": graph.number_of_nodes(),
        "edges": graph.number_of_edges(),
        "weakly_connected_components": component_count,
        "largest_weak_component_nodes": largest_component_size,
        "is_multigraph": graph.is_multigraph(),
        "is_directed": graph.is_directed(),
        "graph_backend": graph_backend(),
        "bbox": {
            "north": settings.bbox_north,
            "south": settings.bbox_south,
            "east": settings.bbox_east,
            "west": settings.bbox_west,
        },
        "center": {
            "lat": settings.default_center_lat,
            "lon": settings.default_center_lon,
            "zoom": settings.default_zoom,
        },
    }


def load_or_download_graph() -> tuple[Any | None, dict[str, Any]]:
    ensure_directories()
    graph_path = settings.graph_path

    try:
        if graph_path.exists():
            logger.info("Loading cached road graph from %s", graph_path)
            graph = load_graphml(graph_path)
            source = "disk_cache"
        else:
            if settings.use_bbox_graph:
                logger.info(
                    "Downloading bbox road graph: north=%s south=%s east=%s west=%s",
                    settings.bbox_north,
                    settings.bbox_south,
                    settings.bbox_east,
                    settings.bbox_west,
                )
                # OSMnx v2 expects bbox=(west, south, east, north)
                bbox = (
                    settings.bbox_west,
                    settings.bbox_south,
                    settings.bbox_east,
                    settings.bbox_north,
                )
                graph = graph_from_bbox(
                    bbox=bbox,
                    network_type="drive",
                    simplify=True,
                )
                source = "osmnx_bbox_download"
            else:
                logger.info("Downloading full place graph for %s", settings.city_name)
                graph = graph_from_place(
                    settings.city_name,
                    network_type="drive",
                    simplify=True,
                )
                source = "osmnx_place_download"

            save_graphml(graph, graph_path)
            logger.info("Saved graph to %s", graph_path)

        stats = extract_graph_stats(graph)
        stats["loaded"] = True
        stats["source"] = source
        stats["mode"] = "bbox" if settings.use_bbox_graph else "place"
        if osmnx_import_error() is not None:
            stats["osmnx_fallback_reason"] = str(osmnx_import_error())

        return graph, stats

    except Exception as exc:
        logger.exception("Failed to initialize road graph: %s", exc)
        return None, {
            "loaded": False,
            "city_name": settings.city_name,
            "city_short_name": settings.city_short_name,
            "graph_path": str(graph_path),
            "graph_backend": graph_backend(),
            "error": str(exc),
        }
