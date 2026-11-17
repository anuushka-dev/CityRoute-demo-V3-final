# app/schemas/operations.py

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

from app.schemas.dispatch import (
    DispatchCompareResponse,
    DispatchDriverRequest,
    DispatchMatrixAlgorithm,
    DispatchOrderRequest,
)
from app.schemas.vrp import Coordinate

OperationsVrpStrategy = Literal["greedy", "two_opt", "lns"]
OperationsVrpMatrixAlgorithm = Literal["source_dijkstra", "bidirectional_astar"]


class OperationsPlanRequest(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        str_strip_whitespace=True,
        allow_inf_nan=False,
    )

    origin: Coordinate = Field(
        ...,
        description="Depot or dispatch hub starting location for delivery routes.",
    )
    drivers: list[DispatchDriverRequest] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Available drivers with position and capacity.",
    )
    orders: list[DispatchOrderRequest] = Field(
        ...,
        min_length=1,
        max_length=50,
        description="Customer orders to assign, sequence, and route.",
    )
    dispatch_matrix_algorithm: DispatchMatrixAlgorithm = Field(
        default="haversine",
        description="Cost matrix algorithm for Stage 1 (Dispatch).",
    )
    vrp_strategy: OperationsVrpStrategy = Field(
        default="lns",
        description="Stop ordering solver for Stage 2 (VRP).",
    )
    vrp_matrix_algorithm: OperationsVrpMatrixAlgorithm = Field(
        default="source_dijkstra",
        description="Road matrix algorithm for Stage 2 (VRP).",
    )
    use_cache: bool = Field(
        default=True,
        description="Whether Redis cache should be used for dispatch and VRP matrices.",
    )
    return_to_start: bool = Field(
        default=False,
        description="Whether each driver returns to the origin after completing their stops.",
    )
    load_penalty_m: float = Field(
        default=0.0,
        ge=0.0,
        description="Load fairness penalty in meters for Stage 1 dispatch.",
    )
    slot_penalty_m: float = Field(
        default=0.0,
        ge=0.0,
        description="Slot fairness penalty in meters for Stage 1 dispatch.",
    )

    @model_validator(mode="after")
    def validate_unique_ids(self) -> OperationsPlanRequest:
        driver_ids = [d.driver_id for d in self.drivers]
        if len(driver_ids) != len(set(driver_ids)):
            raise ValueError("driver_id values must be unique.")

        order_ids = [o.order_id for o in self.orders]
        if len(order_ids) != len(set(order_ids)):
            raise ValueError("order_id values must be unique.")

        return self


class OperationsOrderedStopResponse(BaseModel):
    visit_sequence: int = Field(..., ge=1)
    order_id: str
    lat: float
    lon: float
    distance_from_prev_m: float = Field(..., ge=0.0)
    eta_from_prev_s: float = Field(..., ge=0.0)


class OperationsRouteSegmentResponse(BaseModel):
    leg_index: int = Field(..., ge=1)
    from_label: str
    to_label: str
    distance_m: float = Field(..., ge=0.0)
    eta_seconds: float = Field(..., ge=0.0)
    route_time_ms: float = Field(..., ge=0.0)
    geometry: list[Coordinate] = Field(default_factory=list)


class OperationsDriverPlanResponse(BaseModel):
    driver_id: str
    driver_coordinate: Coordinate
    max_capacity: int = Field(..., ge=1)
    assigned_order_ids: list[str] = Field(default_factory=list)
    optimized_order_ids: list[str] = Field(default_factory=list)
    ordered_stops: list[OperationsOrderedStopResponse] = Field(default_factory=list)
    total_distance_m: float = Field(..., ge=0.0)
    total_distance_km: float = Field(..., ge=0.0)
    total_eta_s: float = Field(..., ge=0.0)
    total_eta_min: float = Field(..., ge=0.0)
    optimization_time_ms: float = Field(..., ge=0.0)
    routing_time_ms: float = Field(..., ge=0.0)
    strategy: OperationsVrpStrategy
    cache_used: bool = False
    cache_hit: bool = False
    route_segments: list[OperationsRouteSegmentResponse] = Field(default_factory=list)
    geometry: list[Coordinate] = Field(default_factory=list)


class OperationsPlanResponse(BaseModel):
    status: Literal["ok"] = "ok"
    phase: Literal["tier4_operations"] = "tier4_operations"
    origin: Coordinate
    vrp_strategy: OperationsVrpStrategy
    vrp_matrix_algorithm: OperationsVrpMatrixAlgorithm
    dispatch_matrix_algorithm: DispatchMatrixAlgorithm
    return_to_start: bool
    use_cache: bool

    driver_count: int = Field(..., ge=1)
    order_count: int = Field(..., ge=1)
    assigned_order_count: int = Field(..., ge=0)
    unassigned_order_count: int = Field(..., ge=0)
    active_driver_count: int = Field(..., ge=0)

    total_fleet_distance_m: float = Field(..., ge=0.0)
    total_fleet_distance_km: float = Field(..., ge=0.0)
    total_fleet_eta_s: float = Field(..., ge=0.0)
    total_fleet_eta_min: float = Field(..., ge=0.0)

    dispatch_time_ms: float = Field(..., ge=0.0)
    optimization_time_ms: float = Field(..., ge=0.0)
    routing_time_ms: float = Field(..., ge=0.0)
    total_time_ms: float = Field(..., ge=0.0)

    dispatch: DispatchCompareResponse
    driver_plans: list[OperationsDriverPlanResponse] = Field(default_factory=list)
