from __future__ import annotations

import logging
from time import perf_counter
from typing import Any

from starlette.concurrency import run_in_threadpool

from app.core.lns import large_neighborhood_search
from app.core.two_opt import two_optimize
from app.models.matrix_model import MatrixRequest
from app.schemas.dispatch import (
    DispatchCompareRequest,
    DispatchOrderRequest,
)
from app.schemas.operations import (
    OperationsDriverPlanResponse,
    OperationsOrderedStopResponse,
    OperationsPlanRequest,
    OperationsPlanResponse,
    OperationsRouteSegmentResponse,
)
from app.schemas.vrp import Coordinate
from app.services.dispatch_service import (
    DispatchRoadMatrixDependencies,
    compare_dispatch_assignments,
)
from app.services.matrix_service import build_distance_matrix_response
from app.services.routing_service import compute_route
from app.services.vrp_advanced_compare_service import _nearest_neighbor_order
from app.utils.geo_validation import validate_coordinates

logger = logging.getLogger(__name__)


async def build_operations_plan(
    payload: OperationsPlanRequest,
    *,
    graph: Any,
    snap_index: Any = None,
    road_matrix_dependencies: DispatchRoadMatrixDependencies | None = None,
) -> OperationsPlanResponse:
    """
    Execute the complete 3-stage Operations pipeline:
      1. Dispatch assignment (Greedy vs Hungarian)
      2. Per-driver VRP stop sequence optimization (Greedy / 2-Opt / LNS)
      3. Per-leg road network geometry & ETA computation
    """
    pipeline_start = perf_counter()

    validate_coordinates(payload.origin.lat, payload.origin.lon)
    for drv in payload.drivers:
        validate_coordinates(drv.lat, drv.lon)
    for ord_item in payload.orders:
        validate_coordinates(ord_item.pickup_lat, ord_item.pickup_lon)

    # Stage 1: Dispatch assignment
    dispatch_start = perf_counter()
    dispatch_request = DispatchCompareRequest(
        drivers=payload.drivers,
        orders=payload.orders,
        matrix_algorithm=payload.dispatch_matrix_algorithm,
        use_cache=payload.use_cache,
        load_penalty_m=payload.load_penalty_m,
        slot_penalty_m=payload.slot_penalty_m,
        return_cost_breakdown=True,
    )

    dispatch_response = await compare_dispatch_assignments(
        dispatch_request,
        road_matrix_dependencies=road_matrix_dependencies,
    )
    dispatch_time_ms = round((perf_counter() - dispatch_start) * 1000.0, 3)

    order_by_id: dict[str, DispatchOrderRequest] = {o.order_id: o for o in payload.orders}
    driver_assigned_map: dict[str, list[DispatchOrderRequest]] = {
        d.driver_id: [] for d in payload.drivers
    }

    for assignment in dispatch_response.hungarian.assignments:
        if assignment.driver_id in driver_assigned_map and assignment.order_id in order_by_id:
            driver_assigned_map[assignment.driver_id].append(order_by_id[assignment.order_id])

    driver_plans: list[OperationsDriverPlanResponse] = []
    total_fleet_distance_m = 0.0
    total_fleet_eta_s = 0.0
    total_opt_time_ms = 0.0
    total_routing_time_ms = 0.0
    active_driver_count = 0

    for driver in payload.drivers:
        assigned_orders = driver_assigned_map.get(driver.driver_id, [])
        driver_coord = Coordinate(lat=driver.lat, lon=driver.lon)

        if not assigned_orders:
            driver_plans.append(
                OperationsDriverPlanResponse(
                    driver_id=driver.driver_id,
                    driver_coordinate=driver_coord,
                    max_capacity=driver.max_capacity,
                    assigned_order_ids=[],
                    optimized_order_ids=[],
                    ordered_stops=[],
                    total_distance_m=0.0,
                    total_distance_km=0.0,
                    total_eta_s=0.0,
                    total_eta_min=0.0,
                    optimization_time_ms=0.0,
                    routing_time_ms=0.0,
                    strategy=payload.vrp_strategy,
                    cache_used=payload.use_cache,
                    cache_hit=False,
                    route_segments=[],
                    geometry=[],
                )
            )
            continue

        active_driver_count += 1

        # Stage 2: VRP stop ordering for this driver (starting from shared origin or driver position)
        opt_start = perf_counter()
        cache_hit = False

        if len(assigned_orders) == 1:
            ordered_orders = list(assigned_orders)
        else:
            locations = [
                {
                    "id": "origin",
                    "lat": payload.origin.lat,
                    "lon": payload.origin.lon,
                },
                *[
                    {
                        "id": f"stop_{idx}",
                        "lat": o.pickup_lat,
                        "lon": o.pickup_lon,
                    }
                    for idx, o in enumerate(assigned_orders)
                ],
            ]
            matrix_req = MatrixRequest(
                locations=locations,
                algorithm=payload.vrp_matrix_algorithm,
                use_cache=payload.use_cache,
            )
            matrix_resp = await run_in_threadpool(
                build_distance_matrix_response,
                matrix_req,
                graph,
                snap_index,
            )
            cache_meta = getattr(matrix_resp, "cache", None)
            if cache_meta is not None:
                cache_hit = bool(getattr(cache_meta, "hit", False))

            raw_matrix = getattr(matrix_resp, "matrix_distance_m", None) or []
            distance_matrix = [
                [float(cell) if cell is not None else -1.0 for cell in row] for row in raw_matrix
            ]

            greedy_order = _nearest_neighbor_order(
                distance_matrix,
                stop_count=len(assigned_orders),
            )

            if payload.vrp_strategy == "greedy":
                chosen_order = greedy_order
            else:
                two_opt_sol = two_optimize(
                    greedy_order,
                    distance_matrix,
                    return_to_start=payload.return_to_start,
                )
                two_opt_order = list(two_opt_sol.optimized_order)

                if payload.vrp_strategy == "two_opt":
                    chosen_order = two_opt_order
                else:
                    lns_sol = large_neighborhood_search(
                        initial_order=[idx + 1 for idx in two_opt_order],
                        distance_matrix=distance_matrix,
                        depot_index=0,
                        return_to_start=payload.return_to_start,
                    )
                    chosen_order = [m_idx - 1 for m_idx in lns_sol.optimized_order]

            ordered_orders = [
                assigned_orders[idx] for idx in chosen_order if 0 <= idx < len(assigned_orders)
            ]

        driver_opt_ms = round((perf_counter() - opt_start) * 1000.0, 3)
        total_opt_time_ms += driver_opt_ms

        # Stage 3: Compute road segments (origin -> stop 1 -> stop 2 ... [-> origin])
        routing_start = perf_counter()
        waypoints: list[tuple[str, float, float]] = [
            ("Origin", payload.origin.lat, payload.origin.lon),
            *[(o.order_id, o.pickup_lat, o.pickup_lon) for o in ordered_orders],
        ]
        if payload.return_to_start and ordered_orders:
            waypoints.append(("Origin (Return)", payload.origin.lat, payload.origin.lon))

        route_segments: list[OperationsRouteSegmentResponse] = []
        ordered_stops: list[OperationsOrderedStopResponse] = []
        combined_geometry: list[Coordinate] = []
        driver_dist_m = 0.0
        driver_eta_s = 0.0

        for leg_idx in range(len(waypoints) - 1):
            from_label, from_lat, from_lon = waypoints[leg_idx]
            to_label, to_lat, to_lon = waypoints[leg_idx + 1]
            try:
                route_res = await run_in_threadpool(
                    compute_route,
                    graph=graph,
                    snap_index=snap_index,
                    start_lat=from_lat,
                    start_lon=from_lon,
                    end_lat=to_lat,
                    end_lon=to_lon,
                )
                seg_dist = float(route_res.get("distance_m", 0.0))
                seg_eta_s = float(route_res.get("eta_seconds", 0.0))
                seg_time_ms = float(route_res.get("route_time_ms", 0.0))
                raw_geom = route_res.get("geometry") or []
                seg_geom = [
                    Coordinate(lat=float(pt["lat"]), lon=float(pt["lon"])) for pt in raw_geom
                ]
            except Exception as exc:
                logger.warning(
                    "Operations leg route fallback from %s to %s: %s",
                    from_label,
                    to_label,
                    exc,
                )
                seg_dist = 0.0
                seg_eta_s = 0.0
                seg_time_ms = 0.0
                seg_geom = [
                    Coordinate(lat=from_lat, lon=from_lon),
                    Coordinate(lat=to_lat, lon=to_lon),
                ]

            driver_dist_m += seg_dist
            driver_eta_s += seg_eta_s

            if combined_geometry and seg_geom:
                combined_geometry.extend(seg_geom[1:])
            else:
                combined_geometry.extend(seg_geom)

            route_segments.append(
                OperationsRouteSegmentResponse(
                    leg_index=leg_idx + 1,
                    from_label=from_label,
                    to_label=to_label,
                    distance_m=round(seg_dist, 2),
                    eta_seconds=round(seg_eta_s, 1),
                    route_time_ms=round(seg_time_ms, 3),
                    geometry=seg_geom,
                )
            )

            if leg_idx < len(ordered_orders):
                ord_obj = ordered_orders[leg_idx]
                ordered_stops.append(
                    OperationsOrderedStopResponse(
                        visit_sequence=leg_idx + 1,
                        order_id=ord_obj.order_id,
                        lat=ord_obj.pickup_lat,
                        lon=ord_obj.pickup_lon,
                        distance_from_prev_m=round(seg_dist, 2),
                        eta_from_prev_s=round(seg_eta_s, 1),
                    )
                )

        driver_routing_ms = round((perf_counter() - routing_start) * 1000.0, 3)
        total_routing_time_ms += driver_routing_ms
        total_fleet_distance_m += driver_dist_m
        total_fleet_eta_s += driver_eta_s

        driver_plans.append(
            OperationsDriverPlanResponse(
                driver_id=driver.driver_id,
                driver_coordinate=driver_coord,
                max_capacity=driver.max_capacity,
                assigned_order_ids=[o.order_id for o in assigned_orders],
                optimized_order_ids=[o.order_id for o in ordered_orders],
                ordered_stops=ordered_stops,
                total_distance_m=round(driver_dist_m, 2),
                total_distance_km=round(driver_dist_m / 1000.0, 3),
                total_eta_s=round(driver_eta_s, 1),
                total_eta_min=round(driver_eta_s / 60.0, 2),
                optimization_time_ms=driver_opt_ms,
                routing_time_ms=driver_routing_ms,
                strategy=payload.vrp_strategy,
                cache_used=payload.use_cache,
                cache_hit=cache_hit,
                route_segments=route_segments,
                geometry=combined_geometry,
            )
        )

    assigned_count = dispatch_response.hungarian.assigned_count
    unassigned_count = len(dispatch_response.hungarian.unassigned_order_ids)
    total_time_ms = round((perf_counter() - pipeline_start) * 1000.0, 3)

    return OperationsPlanResponse(
        status="ok",
        phase="tier4_operations",
        origin=payload.origin,
        vrp_strategy=payload.vrp_strategy,
        vrp_matrix_algorithm=payload.vrp_matrix_algorithm,
        dispatch_matrix_algorithm=payload.dispatch_matrix_algorithm,
        return_to_start=payload.return_to_start,
        use_cache=payload.use_cache,
        driver_count=len(payload.drivers),
        order_count=len(payload.orders),
        assigned_order_count=assigned_count,
        unassigned_order_count=unassigned_count,
        active_driver_count=active_driver_count,
        total_fleet_distance_m=round(total_fleet_distance_m, 2),
        total_fleet_distance_km=round(total_fleet_distance_m / 1000.0, 3),
        total_fleet_eta_s=round(total_fleet_eta_s, 1),
        total_fleet_eta_min=round(total_fleet_eta_s / 60.0, 2),
        dispatch_time_ms=dispatch_time_ms,
        optimization_time_ms=round(total_opt_time_ms, 3),
        routing_time_ms=round(total_routing_time_ms, 3),
        total_time_ms=total_time_ms,
        dispatch=dispatch_response,
        driver_plans=driver_plans,
    )
