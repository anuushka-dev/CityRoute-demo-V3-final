from __future__ import annotations

from fastapi.testclient import TestClient

from app.main import app


def test_config_and_redis_probe_endpoints() -> None:
    with TestClient(app) as client:
        config_res = client.get("/config")
        assert config_res.status_code == 200
        cfg = config_res.json()
        assert "bbox" in cfg
        assert "center" in cfg
        assert "redis" in cfg
        assert "optimization_defaults" in cfg

        status_res = client.get("/redis/status")
        assert status_res.status_code == 200
        status_payload = status_res.json()
        assert status_payload["cache"]["healthy"] is True

        probe_res = client.post("/redis/probe")
        assert probe_res.status_code == 200
        probe_payload = probe_res.json()
        assert probe_payload["status"] == "ok"
        assert probe_payload["write_ok"] is True
        assert probe_payload["read_match"] is True


def test_operations_plan_endpoint_executes_full_pipeline() -> None:
    payload = {
        "origin": {"lat": 26.4650, "lon": 80.3300},
        "drivers": [
            {
                "driver_id": "Driver 1",
                "lat": 26.4720,
                "lon": 80.3310,
                "current_load": 0,
                "max_capacity": 4,
            },
            {
                "driver_id": "Driver 2",
                "lat": 26.4580,
                "lon": 80.3360,
                "current_load": 0,
                "max_capacity": 4,
            },
        ],
        "orders": [
            {"order_id": "Order 1", "pickup_lat": 26.4680, "pickup_lon": 80.3340},
            {"order_id": "Order 2", "pickup_lat": 26.4610, "pickup_lon": 80.3400},
            {"order_id": "Order 3", "pickup_lat": 26.4740, "pickup_lon": 80.3260},
        ],
        "dispatch_matrix_algorithm": "haversine",
        "vrp_strategy": "lns",
        "vrp_matrix_algorithm": "source_dijkstra",
        "use_cache": True,
        "return_to_start": False,
    }
    with TestClient(app) as client:
        response = client.post("/operations/plan", json=payload)
        assert response.status_code == 200, response.text
        data = response.json()
        assert data["status"] == "ok"
        assert data["driver_count"] == 2
        assert data["order_count"] == 3
        assert data["assigned_order_count"] == 3
        assert data["unassigned_order_count"] == 0
        assert len(data["driver_plans"]) == 2
        assert data["total_fleet_distance_m"] > 0
        active_plans = [p for p in data["driver_plans"] if p["assigned_order_ids"]]
        assert len(active_plans) >= 1
        for plan in active_plans:
            assert len(plan["route_segments"]) >= 1
            assert len(plan["geometry"]) >= 2
