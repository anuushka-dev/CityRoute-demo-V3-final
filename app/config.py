from __future__ import annotations

from pathlib import Path

from pydantic import Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "CityRoute"
    environment: str = "local"
    city_name: str = "Kanpur Central, Uttar Pradesh, India"
    city_short_name: str = "Kanpur Central"
    log_level: str = "INFO"

    # API / Security / Map Configuration
    api_key: str = ""
    external_routing_api_key: str = ""
    map_api_key: str = ""
    map_tile_url: str = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
    map_attribution: str = (
        '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    )
    cors_allowed_origins: str = "*"

    data_dir: Path = Path("data")
    graph_dir: Path = Path("data/graphs")
    graph_file: str = "kanpur_central.graphml"

    # Prefer smaller development graph for local runtime
    use_bbox_graph: bool = True

    # Central Kanpur development bounding box
    bbox_north: float = Field(default=26.50, ge=-90.0, le=90.0)
    bbox_south: float = Field(default=26.43, ge=-90.0, le=90.0)
    bbox_east: float = Field(default=80.38, ge=-180.0, le=180.0)
    bbox_west: float = Field(default=80.28, ge=-180.0, le=180.0)

    # Default viewport & speed
    default_center_lat: float = Field(default=26.465, ge=-90.0, le=90.0)
    default_center_lon: float = Field(default=80.33, ge=-180.0, le=180.0)
    default_zoom: int = Field(default=13, ge=1, le=20)
    default_speed_kph: float = Field(default=30.0, gt=0.0)

    # Phase 6: Redis + Distance Matrix Settings
    redis_url: str = "redis://localhost:6379/0"
    redis_socket_timeout_s: float = Field(default=2.0, gt=0.0)
    redis_in_memory_fallback: bool = True

    matrix_cache_ttl_seconds: int = Field(default=86_400, ge=1)
    matrix_max_locations: int = Field(default=25, ge=2)
    matrix_workers: int = Field(default=8, ge=1)

    # Phase 7: VRP Settings
    # VRP includes 1 start location + up to 24 delivery stops = 25 total matrix locations.
    vrp_max_stops: int = Field(default=24, ge=1)
    vrp_default_matrix_algorithm: str = "source_dijkstra"
    vrp_default_use_cache: bool = True

    # Phase 8: 2-Opt / LNS Tuning Defaults
    two_opt_max_iterations: int = Field(default=100, ge=1)
    two_opt_improvement_tolerance_m: float = Field(default=0.001, ge=0.0)
    lns_max_iterations: int = Field(default=500, ge=1)
    lns_destroy_fraction: float = Field(default=0.30, gt=0.0, le=0.90)
    lns_no_improvement_limit: int = Field(default=100, ge=1)
    lns_random_seed: int = 42

    # Phase 9-10: Dispatch Tuning Defaults
    dispatch_default_matrix_algorithm: str = "haversine"
    dispatch_default_use_cache: bool = True
    dispatch_cache_ttl_seconds: int = Field(default=86_400, ge=1)
    dispatch_unreachable_cost_m: float = Field(default=1_000_000_000.0, gt=0.0)
    dispatch_default_load_penalty_m: float = Field(default=0.0, ge=0.0)
    dispatch_default_slot_penalty_m: float = Field(default=0.0, ge=0.0)

    # Operations Pipeline Defaults
    operations_default_driver_capacity: int = Field(default=4, ge=1)
    operations_default_vrp_strategy: str = "lns"
    operations_default_vrp_matrix_algorithm: str = "source_dijkstra"
    operations_default_dispatch_algorithm: str = "haversine"
    operations_default_return_to_start: bool = False
    operations_timeout_s: float = Field(default=45.0, gt=0.0)

    # Phase 11: Operational Hardening Feature Flags
    lifecycle_guard_enabled: bool = True
    concurrency_control_enabled: bool = True
    request_timeout_enabled: bool = True
    redis_recovery_enabled: bool = True
    graceful_shutdown_enabled: bool = True
    metrics_enabled: bool = True

    # Phase 11: Readiness Policy
    readiness_require_graph: bool = True
    readiness_require_snap_index: bool = True
    readiness_require_adjacency: bool = True
    readiness_require_redis: bool = False
    redis_fail_open: bool = True

    # Phase 11: Bounded Concurrency & Admission Control
    concurrency_max_active_requests: int = Field(default=4, ge=1)
    concurrency_max_waiting_requests: int = Field(default=8, ge=0)
    concurrency_wait_timeout_s: float = Field(default=1.0, ge=0.0)
    concurrency_retry_after_s: int = Field(default=1, ge=0)
    concurrency_emit_admission_headers: bool = True
    lifecycle_retry_after_s: int = Field(default=1, ge=0)

    # Phase 11: Endpoint Timeout Budgets
    route_timeout_s: float = Field(default=5.0, gt=0.0)
    route_compare_timeout_s: float = Field(default=10.0, gt=0.0)
    matrix_timeout_s: float = Field(default=15.0, gt=0.0)
    vrp_timeout_s: float = Field(default=20.0, gt=0.0)
    advanced_vrp_timeout_s: float = Field(default=30.0, gt=0.0)
    dispatch_timeout_s: float = Field(default=20.0, gt=0.0)
    request_timeout_cancellation_grace_s: float = Field(default=0.05, ge=0.0)
    request_timeout_emit_headers: bool = True

    # Phase 11: Redis Resilience & Recovery
    redis_recovery_interval_s: float = Field(default=5.0, gt=0.0)
    redis_max_recovery_interval_s: float = Field(default=60.0, gt=0.0)
    redis_recovery_backoff_multiplier: float = Field(default=2.0, ge=1.0)
    redis_run_sync_healthcheck_in_thread: bool = True
    redis_healthcheck_interval_s: float = Field(default=15.0, gt=0.0)

    # Phase 11: Graceful Shutdown & Request Draining
    shutdown_drain_timeout_s: float = Field(default=30.0, ge=0.0)
    shutdown_cleanup_timeout_s: float = Field(default=15.0, ge=0.0)
    shutdown_default_hook_timeout_s: float = Field(default=5.0, ge=0.0)
    shutdown_run_sync_hooks_in_thread: bool = True

    # Phase 12: Built Frontend Static Serving
    serve_frontend: bool = True
    frontend_dist_dir: Path = Path("frontend/dist")

    model_config = SettingsConfigDict(
        env_file=".env",
        env_prefix="CITYROUTE_",
        extra="ignore",
    )

    @model_validator(mode="after")
    def validate_configuration(self) -> Settings:
        if self.bbox_north <= self.bbox_south:
            raise ValueError("bbox_north must be greater than bbox_south.")

        if self.bbox_east <= self.bbox_west:
            raise ValueError("bbox_east must be greater than bbox_west.")

        if self.vrp_max_stops + 1 > self.matrix_max_locations:
            raise ValueError(
                "vrp_max_stops + 1 must be less than or equal to matrix_max_locations."
            )

        if self.redis_max_recovery_interval_s < self.redis_recovery_interval_s:
            raise ValueError(
                "redis_max_recovery_interval_s must be greater than or equal to redis_recovery_interval_s."
            )

        return self

    @property
    def graph_path(self) -> Path:
        return self.graph_dir / self.graph_file


settings = Settings()
