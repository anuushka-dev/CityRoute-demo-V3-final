# CityRoute — Urban Routing, Delivery Optimization & Multi-Driver Dispatch Engine

CityRoute is an open-source last-mile urban routing, multi-stop delivery optimization (VRP), and multi-driver dispatch platform built with **FastAPI**, **NetworkX / OSMnx**, **Redis**, and **React + Leaflet**.

Live:- https://cityroute-demo-v3-final.onrender.com (Suspended currently. As you know need money to keep it running. LOL! but enough to show case my skills.)

It provides both:
1. **Product Workspace** — Interactive map-based workflows for:
   - **Route**: Point-to-point shortest-path routing (`A*` vs `Bidirectional A*`) with BallTree coordinate snapping and ETA estimation.
   - **Deliveries (VRP)**: Multi-stop delivery tour optimization (`Nearest-Neighbor Greedy` → `2-Opt` → `Large Neighborhood Search (LNS)`) and `N×N` road distance/ETA matrix generation.
   - **Dispatch**: Multi-driver, capacity-constrained order assignment (`Greedy` vs `Hungarian` optimal assignment) using Haversine or directed road-network (`Source Dijkstra`) costs and workload fairness metrics.
   - **Operations (`POST /operations/plan`)**: End-to-end 3-stage fleet pipeline (`1 Dispatch → 2 Optimize stops → 3 Route legs`) with per-driver color-coded road trajectories, stop sequencing, and fleet telemetry.
2. **Engineering Console** — Live system architecture & operational dashboard with real-time readiness/lifecycle telemetry, Prometheus metrics, interactive Routing/Matrix/VRP/Dispatch/Operations probes, and a live **Redis Cache & Resilience Lab** (`GET /redis/status`, `POST /redis/probe`).

---

## Project Structure

```text
cityroute-demo-v3/
├── app/
│   ├── api/                 # FastAPI routers (health, graph, route, matrix, vrp, dispatch, operations, metrics, frontend)
│   ├── core/                # Pure algorithms (A*, Bi-A*, Multi-target Dijkstra, Greedy, 2-Opt, LNS, Hungarian, Concurrency, Timeouts)
│   ├── infrastructure/      # Redis cache client (TCP + automatic thread-safe in-memory fallback) & resilience recovery controller
│   ├── middleware/          # Lifecycle guard, bounded concurrency admission control, request timeout enforcement
│   ├── models/              # Domain models for distance/ETA matrices
│   ├── observability/       # Prometheus metrics & reliability gauges/counters
│   ├── schemas/             # Pydantic v2 request/response contracts
│   ├── services/            # Orchestration services (graph, routing, matrix, VRP, dispatch, operations, readiness, shutdown)
│   ├── utils/               # GraphML loader, BallTree/vectorized snap index, geo-validation, cache keys, structured logging
│   ├── config.py            # Centralized Pydantic Settings loaded from .env (CITYROUTE_* prefix)
│   └── main.py              # FastAPI application entrypoint, lifespan management & runtime config/Redis endpoints
├── data/
│   └── graphs/              # Cached road network GraphML files (default: kanpur_central.graphml)
├── frontend/                # React 19 + Vite + React-Leaflet SPA (Product Workspace & Engineering Console)
│   ├── public/              # Static assets & historical engineering evidence catalog
│   ├── src/                 # Frontend source code (App.jsx, MapView.jsx, EngineeringDashboard.jsx, API client)
│   └── .env.example         # Frontend Vite environment template
├── tests/                   # Pytest unit, contract, regression & integration test suite
├── .env                     # Active environment configuration (latitude, longitude, graph, Redis, API keys, tuning)
├── .env.example             # Documented template for all customizable environment variables
├── docker-compose.yml       # Full-stack Docker Compose setup (Redis 7 + CityRoute API/UI)
├── Dockerfile               # Multi-stage production container build
└── requirements.txt         # Python dependencies
```

---

## Quick Start (Local Setup)

### 1. Prerequisites
- **Python 3.11+**
- **Node.js 18+** and **npm**
- **Redis 7+** *(Optional for local development — when `CITYROUTE_REDIS_IN_MEMORY_FALLBACK=true` in `.env`, CityRoute automatically falls back to a built-in thread-safe in-memory Redis store if no local Redis daemon is running, keeping Redis health checks `READY` and matrix/dispatch caching fully operational).*

### 2. Configure Environment (`.env`)
Copy `.env.example` to `.env` (already pre-created for local development):
```powershell
Copy-Item .env.example .env
```

### 3. Backend Setup & Run
Create/activate your virtual environment, install dependencies, and start the FastAPI server:
```powershell
# Activate virtual environment (or create one with: python -m venv .venv)
.\.venv\Scripts\Activate.ps1

# Install Python dependencies (if not already installed)
pip install -r requirements.txt

# Start the backend API on http://localhost:8000
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
- Interactive OpenAPI Docs: `http://localhost:8000/docs`
- Runtime Configuration: `http://localhost:8000/config`
- Readiness Check: `http://localhost:8000/health/ready`

### 4. Frontend Setup & Run (Development Mode)
In a second terminal, start the Vite development server (which proxies `/api/*` to `http://127.0.0.1:8000`):
```powershell
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

> **Single-Port Production Mode**: If you build the frontend (`cd frontend && npm run build`), FastAPI automatically serves the compiled SPA directly at `http://localhost:8000/`.

---

## Running with Docker & Redis

To run a dedicated **Redis 7** container alongside the backend (or the full stack):

```powershell
# Start Redis 7 only on localhost:6379 (for local backend + Vite dev)
docker compose up -d redis

# Or build and start both Redis and the CityRoute service on http://localhost:8000
docker compose up --build -d
```

---

## Customizing `.env` (Coordinates, Graph, API Keys, Redis & Optimization)

Every customizable parameter is controlled through [`.env`](file:///c:/New%20folder/Projects/cityroute-demo-v3/.env) (and documented in [`.env.example`](file:///c:/New%20folder/Projects/cityroute-demo-v3/.env.example)):

| Category | Environment Variables | Description |
| :--- | :--- | :--- |
| **Geography & Bounding Box** | `CITYROUTE_BBOX_NORTH`, `CITYROUTE_BBOX_SOUTH`, `CITYROUTE_BBOX_EAST`, `CITYROUTE_BBOX_WEST`, `CITYROUTE_DEFAULT_CENTER_LAT`, `CITYROUTE_DEFAULT_CENTER_LON`, `CITYROUTE_DEFAULT_ZOOM` | Customize the allowed latitude/longitude bounding box and default map viewport center. The frontend automatically syncs these from `GET /config` on startup. |
| **Road Graph** | `CITYROUTE_CITY_NAME`, `CITYROUTE_CITY_SHORT_NAME`, `CITYROUTE_GRAPH_DIR`, `CITYROUTE_GRAPH_FILE`, `CITYROUTE_USE_BBOX_GRAPH` | Point to a custom `.graphml` road network file inside `data/graphs/` or let OSMnx download a new bounding-box/place graph automatically when the file does not exist. |
| **API Keys & Map Tiles** | `CITYROUTE_API_KEY`, `CITYROUTE_EXTERNAL_ROUTING_API_KEY`, `CITYROUTE_MAP_API_KEY`, `CITYROUTE_MAP_TILE_URL`, `CITYROUTE_MAP_ATTRIBUTION`, `CITYROUTE_CORS_ALLOWED_ORIGINS` | Configure custom map tile servers (Mapbox, Stadia, Jawg, Thunderforest, or OpenStreetMap), API keys, and CORS origins. |
| **Redis & Caching** | `CITYROUTE_REDIS_URL`, `CITYROUTE_REDIS_SOCKET_TIMEOUT_S`, `CITYROUTE_REDIS_IN_MEMORY_FALLBACK`, `CITYROUTE_REDIS_FAIL_OPEN`, `CITYROUTE_MATRIX_CACHE_TTL_SECONDS`, `CITYROUTE_DISPATCH_CACHE_TTL_SECONDS` | Use `redis://localhost:6379/0` for external Redis or `memory://local` / `CITYROUTE_REDIS_IN_MEMORY_FALLBACK=true` for zero-config local caching. |
| **VRP, Dispatch & Operations** | `CITYROUTE_DEFAULT_SPEED_KPH`, `CITYROUTE_MATRIX_MAX_LOCATIONS`, `CITYROUTE_MATRIX_WORKERS`, `CITYROUTE_VRP_MAX_STOPS`, `CITYROUTE_TWO_OPT_MAX_ITERATIONS`, `CITYROUTE_LNS_MAX_ITERATIONS`, `CITYROUTE_LNS_DESTROY_FRACTION`, `CITYROUTE_OPERATIONS_DEFAULT_DRIVER_CAPACITY`, `CITYROUTE_OPERATIONS_DEFAULT_VRP_STRATEGY` | Tune solver iteration budgets, parallel workers, vehicle capacities, and default algorithms. |
| **Concurrency & Timeouts** | `CITYROUTE_CONCURRENCY_MAX_ACTIVE_REQUESTS`, `CITYROUTE_CONCURRENCY_MAX_WAITING_REQUESTS`, `CITYROUTE_ROUTE_TIMEOUT_S`, `CITYROUTE_MATRIX_TIMEOUT_S`, `CITYROUTE_VRP_TIMEOUT_S`, `CITYROUTE_DISPATCH_TIMEOUT_S`, `CITYROUTE_OPERATIONS_TIMEOUT_S` | Tune Phase 11 admission control limits and per-endpoint execution timeout budgets. |

---

## Key API Endpoints

| Method & Path | Description |
| :--- | :--- |
| `GET /config` | Returns active non-secret runtime configuration (bbox, center, graph metadata, map tiles, Redis status, solver defaults). |
| `GET /health`, `/health/live`, `/health/ready` | Legacy health, process liveness, and component-level readiness (`graph`, `snap_index`, `dispatch_adjacency`, `redis`). |
| `GET /redis/status`, `POST /redis/probe` | Inspects Redis backend mode (`redis_tcp` vs `in_memory_fallback`) and executes a live write/read/delete probe. |
| `GET /graph/stats`, `/graph/validate`, `/graph/snap` | Road network statistics, bounding-box coordinate validation, and BallTree nearest-node snapping. |
| `GET /route`, `GET /route/compare` | Point-to-point shortest path (`A*`) and side-by-side `A*` vs `Bidirectional A*` comparison. |
| `POST /matrix` | Parallel `N×N` road-network distance and ETA matrix builder (`source_dijkstra`, `bidirectional_astar`, `astar`) with Redis caching. |
| `POST /vrp/greedy`, `/vrp/compare`, `/vrp/compare/advanced` | Multi-stop VRP tour optimization (`Greedy`, `Greedy vs 2-Opt`, `Greedy vs 2-Opt vs LNS`). |
| `POST /dispatch/compare` | Multi-driver order assignment (`Greedy vs Hungarian`) with Haversine or `source_dijkstra` road costs and fairness metrics. |
| `POST /operations/plan` | Full 3-stage Operations pipeline (`1 Dispatch → 2 VRP Stop Sequence → 3 Road Network Route Legs`) for the entire fleet. |
| `GET /metrics` | Prometheus metrics exposition. |

---

## Running Tests

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```
