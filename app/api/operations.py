from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request, status

from app.api.dispatch import _require_road_matrix_dependencies
from app.schemas.operations import OperationsPlanRequest, OperationsPlanResponse
from app.services.operations_service import build_operations_plan

router = APIRouter(prefix="/operations", tags=["operations"])


@router.post("/plan", response_model=OperationsPlanResponse)
async def create_operations_plan(
    payload: OperationsPlanRequest,
    request: Request,
) -> OperationsPlanResponse:
    """
    Execute the complete end-to-end Operations pipeline:
    1. Dispatch drivers to orders (Greedy vs Hungarian)
    2. Optimize per-driver stop sequences (Greedy / 2-Opt / LNS)
    3. Compute road-network route legs and ETAs for map visualization
    """
    graph = getattr(request.app.state, "graph", None)
    if graph is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Road graph is not loaded on app.state.graph.",
        )

    snap_index = getattr(request.app.state, "snap_index", None)
    road_deps = None
    if payload.dispatch_matrix_algorithm != "haversine":
        road_deps = _require_road_matrix_dependencies(request)

    try:
        return await build_operations_plan(
            payload,
            graph=graph,
            snap_index=snap_index,
            road_matrix_dependencies=road_deps,
        )
    except HTTPException:
        raise
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
