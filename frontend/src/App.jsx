import { useEffect, useMemo, useState } from 'react';
import {
    compareAdvancedStops,
    compareDispatch,
    compareRoute,
    compareStops,
    createMatrix,
    createOperationsPlan,
    getGraphStats,
    getReadiness,
    getRoute,
    getRuntimeConfig,
    optimizeStops,
    snapGraphCoordinate,
    validateGraphCoordinate,
} from './api/cityRouteApi';
import { EngineeringDashboard } from './engineering/EngineeringDashboard';
import { MapView } from './components/MapView';
import { Metric } from './components/Metric';
import { CodeTag, PanelSection, StatusPill } from './components/PanelPrimitives';
import { formatDistance, formatMilliseconds, formatNumber, formatPct, formatSeconds } from './utils/format';
import { CITYROUTE_BOUNDS, CITYROUTE_CENTER, isInsideCityRouteBounds, updateRuntimeGeoConfig } from './utils/validation';

const MAX_VRP_STOPS = 24;
const MAX_MATRIX_LOCATIONS = 25;
const DEFAULT_RETURN_TO_START = false;
const DEFAULT_VRP_MATRIX_ALGORITHM = 'source_dijkstra';
const DEFAULT_DISPATCH_MATRIX_ALGORITHM = 'haversine';
const DEFAULT_USE_CACHE = true;
const DEFAULT_LNS_ITERATIONS = 500;
const DEFAULT_LNS_DESTROY_FRACTION = 0.3;
const DEFAULT_LNS_NO_IMPROVEMENT_LIMIT = 100;
const DEFAULT_TWO_OPT_ITERATIONS = 100;
const DEFAULT_TWO_OPT_TOLERANCE_M = 0.001;
const DEFAULT_DRIVER_CAPACITY = 2;
const DEFAULT_DRIVER_LOAD = 0;
const DEFAULT_LOAD_PENALTY_M = 0;
const DEFAULT_SLOT_PENALTY_M = 0;

const DRIVER_COLORS = [
    '#2563eb',
    '#16a34a',
    '#d97706',
    '#9333ea',
    '#dc2626',
    '#0891b2',
];

export default function App() {
    const [page, setPage] = useState('product');
    const [mode, setMode] = useState('route');
    const [pickTarget, setPickTarget] = useState('start');
    const [runtimeConfig, setRuntimeConfig] = useState(null);
    const [bounds, setBounds] = useState({ ...CITYROUTE_BOUNDS });
    const [mapCenter, setMapCenter] = useState({ ...CITYROUTE_CENTER });

    const [start, setStart] = useState(null);
    const [end, setEnd] = useState(null);
    const [stops, setStops] = useState([]);
    const [drivers, setDrivers] = useState([]);
    const [orders, setOrders] = useState([]);
    const [routeResponse, setRouteResponse] = useState(null);
    const [routeComparison, setRouteComparison] = useState(null);
    const [routeLoading, setRouteLoading] = useState(false);
    const [routeCompareLoading, setRouteCompareLoading] = useState(false);

    const [vrpStrategy, setVrpStrategy] = useState('greedy');
    const [returnToStart, setReturnToStart] = useState(DEFAULT_RETURN_TO_START);
    const [vrpMatrixAlgorithm, setVrpMatrixAlgorithm] = useState(DEFAULT_VRP_MATRIX_ALGORITHM);
    const [useVrpCache, setUseVrpCache] = useState(DEFAULT_USE_CACHE);
    const [vrpLoading, setVrpLoading] = useState(false);
    const [greedyResponse, setGreedyResponse] = useState(null);
    const [vrpComparison, setVrpComparison] = useState(null);
    const [advancedComparison, setAdvancedComparison] = useState(null);
    const [selectedVrpStrategy, setSelectedVrpStrategy] = useState('greedy');
    const [routeSegments, setRouteSegments] = useState([]);
    const [keepOptimizationTrace, setKeepOptimizationTrace] = useState(true);
    const [matrixResponse, setMatrixResponse] = useState(null);
    const [matrixLoading, setMatrixLoading] = useState(false);
    const [matrixView, setMatrixView] = useState('distance');

    const [dispatchMatrixAlgorithm, setDispatchMatrixAlgorithm] = useState(DEFAULT_DISPATCH_MATRIX_ALGORITHM);
    const [useDispatchCache, setUseDispatchCache] = useState(DEFAULT_USE_CACHE);
    const [assignmentView, setAssignmentView] = useState('hungarian');
    const [dispatchResponse, setDispatchResponse] = useState(null);
    const [dispatchLoading, setDispatchLoading] = useState(false);
    const [dispatchLines, setDispatchLines] = useState([]);

    const [operationsOrigin, setOperationsOrigin] = useState(null);
    const [operationDrivers, setOperationDrivers] = useState([]);
    const [operationOrders, setOperationOrders] = useState([]);
    const [operationDispatchResponse, setOperationDispatchResponse] = useState(null);
    const [operationPlanResponse, setOperationPlanResponse] = useState(null);
    const [operationPlan, setOperationPlan] = useState([]);
    const [operationSegments, setOperationSegments] = useState([]);
    const [operationLoading, setOperationLoading] = useState(false);
    const [operationMatrixAlgorithm, setOperationMatrixAlgorithm] = useState('haversine');
    const [operationVrpStrategy, setOperationVrpStrategy] = useState('lns');
    const [operationVrpMatrixAlgorithm, setOperationVrpMatrixAlgorithm] = useState('source_dijkstra');
    const [operationUseCache, setOperationUseCache] = useState(true);
    const [operationReturnToStart, setOperationReturnToStart] = useState(false);
    const [operationDriverCapacity, setOperationDriverCapacity] = useState(4);
    const [operationDispatchLines, setOperationDispatchLines] = useState([]);

    const [readinessReady, setReadinessReady] = useState(null);
    const [mapError, setMapError] = useState(null);
    const [routeTechnicalDetailsOpen, setRouteTechnicalDetailsOpen] = useState(false);
    const [deliveryDetailsOpen, setDeliveryDetailsOpen] = useState(false);
    const [dispatchDetailsOpen, setDispatchDetailsOpen] = useState(false);

    useEffect(() => {
        getReadiness()
            .then((response) => setReadinessReady(response.ready))
            .catch(() => setReadinessReady(false));
        getRuntimeConfig()
            .then((cfg) => {
                setRuntimeConfig(cfg);
                if (cfg?.bbox || cfg?.center) {
                    updateRuntimeGeoConfig(cfg.bbox, cfg.center);
                    setBounds({ ...CITYROUTE_BOUNDS });
                    setMapCenter({ ...CITYROUTE_CENTER });
                }
            })
            .catch(() => {});
    }, []);

    const mapLocations = useMemo(() => {
        if (mode === 'route')
            return [
                ...(start ? [{ id: 'route-start', label: 'Start', coordinate: start }] : []),
                ...(end ? [{ id: 'route-end', label: 'Destination', coordinate: end }] : []),
            ];
        if (mode === 'deliveries')
            return [
                ...(start ? [{ id: 'depot', label: 'Start / Depot', coordinate: start }] : []),
                ...stops.map((stop, index) => ({ id: `stop-${index}`, label: `Stop ${index + 1}`, coordinate: stop })),
            ];
        if (mode === 'operations')
            return [
                ...(operationsOrigin ? [{ id: 'operations-origin', label: 'Origin / Start', coordinate: operationsOrigin }] : []),
            ];
        return [];
    }, [mode, start, end, stops, operationsOrigin]);

    const driverMarkers = useMemo(
        () =>
            drivers.map((driver, idx) => ({
                id: driver.driver_id,
                label: driver.driver_id,
                subtitle: `Capacity: ${driver.max_capacity}`,
                color: DRIVER_COLORS[idx % DRIVER_COLORS.length],
                coordinate: { lat: driver.lat, lon: driver.lon },
            })),
        [drivers]
    );
    const orderMarkers = useMemo(
        () =>
            orders.map((order) => ({
                id: order.order_id,
                label: order.order_id,
                coordinate: { lat: order.pickup_lat, lon: order.pickup_lon },
            })),
        [orders]
    );
    const operationDriverMarkers = useMemo(
        () =>
            operationDrivers.map((driver, idx) => ({
                id: driver.driver_id,
                label: driver.driver_id,
                subtitle: `Capacity: ${driver.max_capacity} orders`,
                color: DRIVER_COLORS[idx % DRIVER_COLORS.length],
                coordinate: { lat: driver.lat, lon: driver.lon },
            })),
        [operationDrivers]
    );
    const operationOrderMarkers = useMemo(() => {
        const stopLookup = new Map();
        for (const dp of operationPlan) {
            dp.optimizedOrderIds.forEach((oid, idx) => {
                stopLookup.set(oid, `${dp.driverId} · Stop #${idx + 1}`);
            });
        }
        return operationOrders.map((order) => ({
            id: order.order_id,
            label: order.order_id,
            subtitle: stopLookup.get(order.order_id) ?? 'Customer order',
            coordinate: { lat: order.pickup_lat, lon: order.pickup_lon },
        }));
    }, [operationOrders, operationPlan]);

    const routeGeometry = routeComparison?.astar.geometry ?? routeResponse?.geometry ?? [];
    const comparisonGeometry = routeComparison?.bidirectional_astar.geometry ?? [];

    function handleDriverCapacityChange(nextCapacity) {
        setOperationDriverCapacity(nextCapacity);
        setOperationDrivers((current) =>
            current.map((drv) => ({ ...drv, max_capacity: nextCapacity }))
        );
    }

    function loadSampleOperationsScenario() {
        const cLat = mapCenter.lat;
        const cLon = mapCenter.lon;
        setMapError(null);
        setOperationsOrigin({ lat: Number(cLat.toFixed(5)), lon: Number(cLon.toFixed(5)) });
        setOperationDrivers([
            { driver_id: 'Driver 1', lat: Number((cLat + 0.008).toFixed(5)), lon: Number((cLon - 0.007).toFixed(5)), current_load: 0, max_capacity: operationDriverCapacity },
            { driver_id: 'Driver 2', lat: Number((cLat - 0.007).toFixed(5)), lon: Number((cLon + 0.008).toFixed(5)), current_load: 0, max_capacity: operationDriverCapacity },
        ]);
        setOperationOrders([
            { order_id: 'Order 1', pickup_lat: Number((cLat + 0.011).toFixed(5)), pickup_lon: Number((cLon - 0.003).toFixed(5)) },
            { order_id: 'Order 2', pickup_lat: Number((cLat + 0.004).toFixed(5)), pickup_lon: Number((cLon + 0.009).toFixed(5)) },
            { order_id: 'Order 3', pickup_lat: Number((cLat - 0.009).toFixed(5)), pickup_lon: Number((cLon + 0.004).toFixed(5)) },
            { order_id: 'Order 4', pickup_lat: Number((cLat - 0.005).toFixed(5)), pickup_lon: Number((cLon - 0.010).toFixed(5)) },
        ]);
        setOperationDispatchResponse(null);
        setOperationPlanResponse(null);
        setOperationPlan([]);
        setOperationSegments([]);
        setOperationDispatchLines([]);
        setPickTarget('order');
    }

    function handleMapSelect(coordinate) {
        if (!isInsideCityRouteBounds(coordinate, bounds)) {
            setMapError(
                `Coordinate outside loaded graph area. Allowed bbox: ${bounds.west}–${bounds.east} longitude, ${bounds.south}–${bounds.north} latitude.`
            );
            return;
        }
        setMapError(null);
        if (mode === 'route') {
            if (pickTarget === 'start') {
                setStart(coordinate);
                setPickTarget('end');
                return;
            }
            setEnd(coordinate);
            return;
        }
        if (mode === 'operations') {
            if (pickTarget === 'start') {
                setOperationsOrigin(coordinate);
                setPickTarget(operationDrivers.length === 0 ? 'driver' : 'order');
                return;
            }
            if (pickTarget === 'driver') {
                setOperationDrivers((current) => [
                    ...current,
                    {
                        driver_id: `Driver ${current.length + 1}`,
                        lat: coordinate.lat,
                        lon: coordinate.lon,
                        current_load: 0,
                        max_capacity: operationDriverCapacity,
                    },
                ]);
                if (operationOrders.length === 0) {
                    setPickTarget('order');
                }
                return;
            }
            setOperationOrders((current) => [
                ...current,
                {
                    order_id: `Order ${current.length + 1}`,
                    pickup_lat: coordinate.lat,
                    pickup_lon: coordinate.lon,
                },
            ]);
            return;
        }
        if (mode === 'deliveries') {
            if (pickTarget === 'start') {
                setStart(coordinate);
                setPickTarget('stop');
                return;
            }
            if (stops.length >= MAX_VRP_STOPS) {
                setMapError(`CityRoute allows a maximum of ${MAX_VRP_STOPS} delivery stops.`);
                return;
            }
            setStops((current) => [...current, coordinate]);
            return;
        }
        if (pickTarget === 'driver') {
            setDrivers((current) => [
                ...current,
                {
                    driver_id: `Driver ${current.length + 1}`,
                    lat: coordinate.lat,
                    lon: coordinate.lon,
                    current_load: DEFAULT_DRIVER_LOAD,
                    max_capacity: DEFAULT_DRIVER_CAPACITY,
                },
            ]);
            setPickTarget('order');
            return;
        }
        setOrders((current) => [
            ...current,
            {
                order_id: `Order ${current.length + 1}`,
                pickup_lat: coordinate.lat,
                pickup_lon: coordinate.lon,
            },
        ]);
    }

    function switchMode(nextMode) {
        setMode(nextMode);
        setMapError(null);
        if (nextMode === 'route') setPickTarget(start ? 'end' : 'start');
        if (nextMode === 'deliveries') setPickTarget(start ? 'stop' : 'start');
        if (nextMode === 'dispatch') setPickTarget(drivers.length > 0 ? 'order' : 'driver');
        if (nextMode === 'operations') {
            if (!operationsOrigin) setPickTarget('start');
            else if (operationDrivers.length === 0) setPickTarget('driver');
            else setPickTarget('order');
        }
    }

    async function calculateRoute() {
        if (!start || !end) return;
        setMapError(null);
        setRouteLoading(true);
        setRouteComparison(null);
        try {
            setRouteResponse(await getRoute(start, end));
        } catch (error) {
            setRouteResponse(null);
            setMapError(error instanceof Error ? error.message : 'Route calculation failed.');
        } finally {
            setRouteLoading(false);
        }
    }

    async function compareRoutingAlgorithms() {
        if (!start || !end) return;
        setMapError(null);
        setRouteCompareLoading(true);
        try {
            setRouteComparison(await compareRoute(start, end));
        } catch (error) {
            setRouteComparison(null);
            setMapError(error instanceof Error ? error.message : 'Routing comparison failed.');
        } finally {
            setRouteCompareLoading(false);
        }
    }

    async function runDeliveries() {
        if (!start || stops.length === 0) return;
        setVrpLoading(true);
        setMapError(null);
        setRouteSegments([]);
        setMatrixResponse(null);
        try {
            if (vrpStrategy === 'greedy') {
                const response = await optimizeStops({
                    start,
                    stops,
                    return_to_start: returnToStart,
                    matrix_algorithm: vrpMatrixAlgorithm,
                    use_cache: useVrpCache,
                });
                setGreedyResponse(response);
                setVrpComparison(null);
                setAdvancedComparison(null);
                setSelectedVrpStrategy('greedy');
                await drawStopOrder(response.optimized_order);
            } else if (vrpStrategy === 'two_opt') {
                const response = await compareStops({
                    start,
                    stops,
                    return_to_start: returnToStart,
                    matrix_algorithm: vrpMatrixAlgorithm,
                    use_cache: useVrpCache,
                    ttl_seconds: null,
                    two_opt_max_iterations: DEFAULT_TWO_OPT_ITERATIONS,
                    improvement_tolerance_m: DEFAULT_TWO_OPT_TOLERANCE_M,
                    keep_trace: keepOptimizationTrace,
                });
                setVrpComparison(response);
                setGreedyResponse(null);
                setAdvancedComparison(null);
                setSelectedVrpStrategy('two_opt');
                await drawStopOrder(response.two_opt.optimized_order);
            } else {
                const response = await compareAdvancedStops({
                    start,
                    stops,
                    return_to_start: returnToStart,
                    matrix_algorithm: vrpMatrixAlgorithm,
                    use_cache: useVrpCache,
                    two_opt_max_iterations: DEFAULT_TWO_OPT_ITERATIONS,
                    two_opt_improvement_tolerance_m: DEFAULT_TWO_OPT_TOLERANCE_M,
                    lns_max_iterations: DEFAULT_LNS_ITERATIONS,
                    lns_destroy_fraction: DEFAULT_LNS_DESTROY_FRACTION,
                    lns_no_improvement_limit: DEFAULT_LNS_NO_IMPROVEMENT_LIMIT,
                    lns_random_seed: 42,
                    keep_trace: keepOptimizationTrace,
                });
                setAdvancedComparison(response);
                setGreedyResponse(null);
                setVrpComparison(null);
                setSelectedVrpStrategy('lns');
                await drawStopOrder(response.lns.optimized_order);
            }
        } catch (error) {
            setMapError(error instanceof Error ? error.message : 'Delivery optimization failed.');
        } finally {
            setVrpLoading(false);
        }
    }

    async function drawStopOrder(order) {
        if (!start) return;
        let current = start;
        const ordered = order.map((index) => stops[index]).filter(Boolean);
        const targets = returnToStart ? [...ordered, start] : ordered;
        const segments = [];
        for (const target of targets) {
            const route = await getRoute(current, target);
            segments.push({ id: `delivery-${segments.length}`, geometry: route.geometry, color: '#0f172a' });
            current = target;
        }
        setRouteSegments(segments);
    }

    async function generateMatrix() {
        if (!start || stops.length === 0 || stops.length + 1 > MAX_MATRIX_LOCATIONS) return;
        setMatrixLoading(true);
        setMapError(null);
        try {
            const locations = [
                { id: 'depot', ...start },
                ...stops.map((coordinate, index) => ({ id: `stop-${index + 1}`, ...coordinate })),
            ];
            setMatrixResponse(
                await createMatrix({ locations, algorithm: vrpMatrixAlgorithm, use_cache: useVrpCache })
            );
        } catch (error) {
            setMatrixResponse(null);
            setMapError(error instanceof Error ? error.message : 'Matrix generation failed.');
        } finally {
            setMatrixLoading(false);
        }
    }

    async function runDispatch() {
        if (drivers.length === 0 || orders.length === 0) return;
        setDispatchLoading(true);
        setMapError(null);
        try {
            const response = await compareDispatch({
                drivers,
                orders,
                matrix_algorithm: dispatchMatrixAlgorithm,
                use_cache: useDispatchCache,
                load_penalty_m: DEFAULT_LOAD_PENALTY_M,
                slot_penalty_m: DEFAULT_SLOT_PENALTY_M,
                return_cost_breakdown: true,
            });
            setDispatchResponse(response);
            setAssignmentView('hungarian');
            setDispatchLines(buildDispatchLines(response.hungarian.assignments));
        } catch (error) {
            setDispatchResponse(null);
            setDispatchLines([]);
            setMapError(error instanceof Error ? error.message : 'Dispatch comparison failed.');
        } finally {
            setDispatchLoading(false);
        }
    }

    function buildOperationDispatchLines(assignments) {
        return assignments.flatMap((assignment) => {
            const driverIndex = operationDrivers.findIndex(
                (candidate) => candidate.driver_id === assignment.driver_id
            );
            const driver = operationDrivers[driverIndex];
            const order = operationOrders.find(
                (candidate) => candidate.order_id === assignment.order_id
            );
            if (!driver || !order) return [];
            return [
                {
                    id: `operation-assignment-${assignment.driver_id}-${assignment.order_id}`,
                    from: { lat: driver.lat, lon: driver.lon },
                    to: { lat: order.pickup_lat, lon: order.pickup_lon },
                    color: DRIVER_COLORS[Math.max(0, driverIndex) % DRIVER_COLORS.length],
                },
            ];
        });
    }

    async function runOperationsPlan() {
        if (!operationsOrigin || operationDrivers.length === 0 || operationOrders.length === 0) return;
        setOperationLoading(true);
        setMapError(null);
        setOperationPlanResponse(null);
        setOperationPlan([]);
        setOperationSegments([]);
        try {
            const response = await createOperationsPlan({
                origin: operationsOrigin,
                drivers: operationDrivers,
                orders: operationOrders,
                dispatch_matrix_algorithm: operationMatrixAlgorithm,
                vrp_strategy: operationVrpStrategy,
                vrp_matrix_algorithm: operationVrpMatrixAlgorithm,
                use_cache: operationUseCache,
                return_to_start: operationReturnToStart,
                load_penalty_m: DEFAULT_LOAD_PENALTY_M,
                slot_penalty_m: DEFAULT_SLOT_PENALTY_M,
            });

            setOperationPlanResponse(response);
            setOperationDispatchResponse(response.dispatch);
            setOperationDispatchLines(
                buildOperationDispatchLines(response.dispatch?.hungarian?.assignments ?? [])
            );

            const allSegments = [];
            const plans = (response.driver_plans ?? []).map((dp, driverIdx) => {
                const color = DRIVER_COLORS[driverIdx % DRIVER_COLORS.length];
                const segs = (dp.route_segments ?? []).map((seg, segIdx) => {
                    const formattedSeg = {
                        id: `operation-${dp.driver_id}-${segIdx}`,
                        geometry: seg.geometry ?? [],
                        color,
                        label: `${dp.driver_id} · Leg ${seg.leg_index}: ${seg.from_label} → ${seg.to_label} (${formatDistance(seg.distance_m)})`,
                    };
                    allSegments.push(formattedSeg);
                    return formattedSeg;
                });

                return {
                    driverId: dp.driver_id,
                    color,
                    assignedOrderIds: dp.assigned_order_ids ?? [],
                    optimizedOrderIds: dp.optimized_order_ids ?? [],
                    orderedStops: dp.ordered_stops ?? [],
                    totalDistanceMeters: dp.total_distance_m ?? 0,
                    totalEtaSeconds: dp.total_eta_s ?? 0,
                    routeSegments: segs,
                    optimizationTimeMs: dp.optimization_time_ms ?? 0,
                    routingTimeMs: dp.routing_time_ms ?? 0,
                    strategy: dp.strategy ?? operationVrpStrategy,
                };
            });

            setOperationPlan(plans);
            setOperationSegments(allSegments);
        } catch (error) {
            setMapError(error instanceof Error ? error.message : 'Operations plan failed.');
        } finally {
            setOperationLoading(false);
        }
    }

    function buildDispatchLines(assignments) {
        return assignments.flatMap((assignment) => {
            const driverIndex = drivers.findIndex(
                (candidate) => candidate.driver_id === assignment.driver_id
            );
            const driver = drivers[driverIndex];
            const order = orders.find((candidate) => candidate.order_id === assignment.order_id);
            if (!driver || !order) return [];
            return [
                {
                    id: `${assignment.driver_id}-${assignment.order_id}`,
                    from: { lat: driver.lat, lon: driver.lon },
                    to: { lat: order.pickup_lat, lon: order.pickup_lon },
                    color: DRIVER_COLORS[Math.max(0, driverIndex) % DRIVER_COLORS.length],
                },
            ];
        });
    }

    function setAssignment(next) {
        setAssignmentView(next);
        if (dispatchResponse) setDispatchLines(buildDispatchLines(dispatchResponse[next].assignments));
    }

    const routeDetail = routeComparison?.astar ?? routeResponse;
    const selectedVrp =
        vrpStrategy === 'greedy'
            ? greedyResponse
            : vrpStrategy === 'two_opt'
            ? vrpComparison?.two_opt
            : advancedComparison?.lns;
    const selectedVrpOrder = selectedVrp?.optimized_order ?? [];
    const selectedVrpDistance = selectedVrp?.total_distance_m ?? null;
    const selectedVrpTime = selectedVrp?.optimization_time_ms ?? null;
    const dispatchResult = dispatchResponse?.[assignmentView] ?? null;
    const dispatchFairness =
        assignmentView === 'hungarian'
            ? dispatchResponse?.hungarian_fairness
            : dispatchResponse?.greedy_fairness;
    const operationAssignedCount =
        operationPlanResponse?.assigned_order_count ??
        operationDispatchResponse?.hungarian?.assigned_count ??
        0;
    const operationUnassignedCount =
        operationPlanResponse?.unassigned_order_count ??
        operationDispatchResponse?.hungarian?.unassigned_order_ids?.length ??
        0;
    const cityLabel = runtimeConfig?.city_short_name || 'Kanpur Central';

    return (
        <main className="app-shell">
            <header className="topbar">
                <div className="brand-block">
                    <span className="brand-mark">C</span>
                    <div>
                        <h1>CityRoute</h1>
                        <p>Open-source last-mile routing & dispatch engine</p>
                    </div>
                </div>
                <div className="topbar-controls">
                    <nav className="page-switch">
                        <button
                            type="button"
                            className={page === 'product' ? 'page-switch-active' : ''}
                            onClick={() => setPage('product')}
                        >
                            Product
                        </button>
                        <button
                            type="button"
                            className={page === 'engineering' ? 'page-switch-active' : ''}
                            onClick={() => setPage('engineering')}
                        >
                            Engineering
                        </button>
                    </nav>
                    <StatusPill
                        label={
                            readinessReady === true
                                ? 'Backend ready'
                                : readinessReady === false
                                ? 'Backend unavailable'
                                : 'Checking'
                        }
                        state={
                            readinessReady === true
                                ? 'ok'
                                : readinessReady === false
                                ? 'bad'
                                : 'neutral'
                        }
                    />
                </div>
            </header>

            {page === 'engineering' ? (
                <EngineeringDashboard />
            ) : (
                <section className="product-workspace">
                    <aside className="product-sidebar">
                        <div className="mode-tabs mode-tabs-four">
                            <button
                                type="button"
                                className={mode === 'route' ? 'mode-tab-active' : ''}
                                onClick={() => switchMode('route')}
                            >
                                Route
                            </button>
                            <button
                                type="button"
                                className={mode === 'deliveries' ? 'mode-tab-active' : ''}
                                onClick={() => switchMode('deliveries')}
                            >
                                Deliveries
                            </button>
                            <button
                                type="button"
                                className={mode === 'dispatch' ? 'mode-tab-active' : ''}
                                onClick={() => switchMode('dispatch')}
                            >
                                Dispatch
                            </button>
                            <button
                                type="button"
                                className={mode === 'operations' ? 'mode-tab-active' : ''}
                                onClick={() => switchMode('operations')}
                            >
                                Operations
                            </button>
                        </div>
                        {mapError && <div className="error-box global-error">{mapError}</div>}
                        {mode === 'route' && (
                            <RouteProductPanel
                                {...{
                                    start,
                                    end,
                                    pickTarget,
                                    routeResponse,
                                    routeComparison,
                                    routeDetail,
                                    routeLoading,
                                    routeCompareLoading,
                                    routeTechnicalDetailsOpen,
                                    setRouteTechnicalDetailsOpen,
                                    calculateRoute,
                                    compareRoutingAlgorithms,
                                    setPickTarget,
                                    onClear: () => {
                                        setStart(null);
                                        setEnd(null);
                                        setRouteResponse(null);
                                        setRouteComparison(null);
                                        setPickTarget('start');
                                    },
                                }}
                            />
                        )}
                        {mode === 'deliveries' && (
                            <DeliveriesProductPanel
                                {...{
                                    start,
                                    stops,
                                    pickTarget,
                                    vrpStrategy,
                                    vrpMatrixAlgorithm,
                                    useVrpCache,
                                    returnToStart,
                                    keepOptimizationTrace,
                                    selectedVrp,
                                    selectedVrpOrder,
                                    selectedVrpDistance,
                                    selectedVrpTime,
                                    greedyResponse,
                                    vrpComparison,
                                    advancedComparison,
                                    matrixResponse,
                                    matrixView,
                                    setMatrixView,
                                    vrpLoading,
                                    matrixLoading,
                                    deliveryDetailsOpen,
                                    setDeliveryDetailsOpen,
                                    setVrpStrategy,
                                    setVrpMatrixAlgorithm,
                                    setUseVrpCache,
                                    setReturnToStart,
                                    setKeepOptimizationTrace,
                                    runDeliveries,
                                    generateMatrix,
                                    setPickTarget,
                                    setStops,
                                    setStart,
                                    setMatrixResponse,
                                    selectedVrpStrategy,
                                    setSelectedVrpStrategy,
                                    setRouteSegments,
                                }}
                            />
                        )}
                        {mode === 'dispatch' && (
                            <DispatchProductPanel
                                {...{
                                    drivers,
                                    orders,
                                    pickTarget,
                                    dispatchMatrixAlgorithm,
                                    useDispatchCache,
                                    dispatchResponse,
                                    dispatchResult,
                                    dispatchFairness,
                                    assignmentView,
                                    dispatchLoading,
                                    dispatchDetailsOpen,
                                    setDispatchDetailsOpen,
                                    setDispatchMatrixAlgorithm,
                                    setUseDispatchCache,
                                    setAssignment,
                                    runDispatch,
                                    setPickTarget,
                                    setDrivers,
                                    setOrders,
                                    setDispatchResponse,
                                    setDispatchLines,
                                }}
                            />
                        )}
                        {mode === 'operations' && (
                            <OperationsProductPanel
                                origin={operationsOrigin}
                                drivers={operationDrivers}
                                orders={operationOrders}
                                pickTarget={pickTarget}
                                matrixAlgorithm={operationMatrixAlgorithm}
                                useCache={operationUseCache}
                                returnToStart={operationReturnToStart}
                                driverCapacity={operationDriverCapacity}
                                vrpStrategy={operationVrpStrategy}
                                vrpMatrixAlgorithm={operationVrpMatrixAlgorithm}
                                onVrpStrategyChange={setOperationVrpStrategy}
                                onVrpMatrixAlgorithmChange={setOperationVrpMatrixAlgorithm}
                                onDriverCapacityChange={handleDriverCapacityChange}
                                dispatchResponse={operationDispatchResponse}
                                planResponse={operationPlanResponse}
                                plan={operationPlan}
                                assignedCount={operationAssignedCount}
                                unassignedCount={operationUnassignedCount}
                                loading={operationLoading}
                                onMatrixAlgorithmChange={setOperationMatrixAlgorithm}
                                onUseCacheChange={setOperationUseCache}
                                onReturnToStartChange={setOperationReturnToStart}
                                onChooseOrigin={() => setPickTarget('start')}
                                onAddDriver={() => setPickTarget('driver')}
                                onAddOrder={() => setPickTarget('order')}
                                onLoadSample={loadSampleOperationsScenario}
                                onRun={() => void runOperationsPlan()}
                                onClear={() => {
                                    setOperationsOrigin(null);
                                    setOperationDrivers([]);
                                    setOperationOrders([]);
                                    setOperationDispatchResponse(null);
                                    setOperationPlanResponse(null);
                                    setOperationPlan([]);
                                    setOperationSegments([]);
                                    setOperationDispatchLines([]);
                                    setPickTarget('start');
                                }}
                                onRemoveDriver={(index) =>
                                    setOperationDrivers(
                                        operationDrivers.filter((_value, itemIndex) => itemIndex !== index)
                                    )
                                }
                                onRemoveOrder={(index) =>
                                    setOperationOrders(
                                        operationOrders.filter((_value, itemIndex) => itemIndex !== index)
                                    )
                                }
                            />
                        )}
                    </aside>
                    <section className="product-map-shell">
                        <div className="map-hud">
                            <div>
                                <strong>
                                    {mode === 'route'
                                        ? 'Point-to-point routing'
                                        : mode === 'deliveries'
                                        ? 'Multi-stop delivery optimization'
                                        : mode === 'dispatch'
                                        ? 'Driver-order dispatch'
                                        : 'Operations pipeline'}
                                </strong>
                                <span>
                                    {mode === 'route'
                                        ? `Click map to set ${pickTarget === 'start' ? 'start' : 'destination'}`
                                        : mode === 'deliveries'
                                        ? `Click map to ${pickTarget === 'start' ? 'set depot' : 'add stop'} · ${stops.length}/${MAX_VRP_STOPS} stops`
                                        : mode === 'dispatch'
                                        ? `Click map to ${pickTarget === 'driver' ? 'place driver' : 'place order'}`
                                        : `Click map to ${
                                              pickTarget === 'start'
                                                  ? 'set Origin / Start'
                                                  : pickTarget === 'driver'
                                                  ? 'place Driver'
                                                  : 'place Order'
                                          } · ${operationDrivers.length} drivers · ${operationOrders.length} orders`}
                                </span>
                            </div>
                            <div className="map-hud-tags">
                                <CodeTag>{cityLabel}</CodeTag>
                                {routeComparison && <CodeTag>A* + Bi-A*</CodeTag>}
                                {advancedComparison && <CodeTag>Greedy + 2-Opt + LNS</CodeTag>}
                                {dispatchResponse && <CodeTag>Greedy + Hungarian</CodeTag>}
                                {operationPlanResponse && (
                                    <CodeTag>
                                        Dispatch → {operationVrpStrategy.toUpperCase()} → Route
                                    </CodeTag>
                                )}
                            </div>
                        </div>
                        <MapView
                            routeGeometry={mode === 'route' ? routeGeometry : []}
                            comparisonGeometry={mode === 'route' ? comparisonGeometry : []}
                            additionalSegments={
                                mode === 'deliveries'
                                    ? routeSegments
                                    : mode === 'operations'
                                    ? operationSegments
                                    : []
                            }
                            locations={mapLocations}
                            dispatchDrivers={
                                mode === 'dispatch'
                                    ? driverMarkers
                                    : mode === 'operations'
                                    ? operationDriverMarkers
                                    : []
                            }
                            dispatchOrders={
                                mode === 'dispatch'
                                    ? orderMarkers
                                    : mode === 'operations'
                                    ? operationOrderMarkers
                                    : []
                            }
                            dispatchLines={
                                mode === 'dispatch'
                                    ? dispatchLines
                                    : mode === 'operations'
                                    ? operationDispatchLines
                                    : []
                            }
                            center={mapCenter}
                            zoom={mapCenter.zoom ?? 13}
                            tileUrl={runtimeConfig?.map?.tile_url}
                            tileAttribution={runtimeConfig?.map?.attribution}
                            interactive
                            onMapSelect={handleMapSelect}
                        />
                    </section>
                </section>
            )}
        </main>
    );
}

function RouteProductPanel(props) {
    const {
        start,
        end,
        pickTarget,
        routeResponse,
        routeComparison,
        routeDetail,
        routeLoading,
        routeCompareLoading,
        routeTechnicalDetailsOpen,
        setRouteTechnicalDetailsOpen,
        calculateRoute,
        compareRoutingAlgorithms,
        setPickTarget,
        onClear,
    } = props;
    return (
        <div className="panel-stack">
            <PanelSection
                title="Route"
                subtitle="Real road-network route, snapped graph endpoints, ETA and routing comparison."
            >
                <LocationButton
                    label="Start"
                    coordinate={start}
                    onClick={() => setPickTarget('start')}
                    active={pickTarget === 'start'}
                />
                <LocationButton
                    label="Destination"
                    coordinate={end}
                    onClick={() => setPickTarget('end')}
                    active={pickTarget === 'end'}
                />
                <div className="action-row" style={{ marginTop: 8 }}>
                    <button
                        className="primary-button"
                        type="button"
                        onClick={() => void calculateRoute()}
                        disabled={!start || !end || routeLoading}
                    >
                        {routeLoading ? 'Routing…' : 'Calculate route'}
                    </button>
                    <button
                        className="secondary-button"
                        type="button"
                        onClick={() => void compareRoutingAlgorithms()}
                        disabled={!start || !end || routeCompareLoading}
                    >
                        {routeCompareLoading ? 'Comparing…' : 'Compare A* / Bi-A*'}
                    </button>
                </div>
                {(start || end) && (
                    <div className="action-row" style={{ marginTop: 6 }}>
                        <button className="secondary-button" type="button" onClick={onClear}>
                            Clear route
                        </button>
                    </div>
                )}
            </PanelSection>

            {routeDetail && (
                <PanelSection title="Route result" subtitle="Live response from /route or /route/compare">
                    <div className="metric-grid metric-grid-2">
                        <Metric label="Road distance" value={formatDistance(routeDetail.distance_m)} />
                        <Metric label="ETA" value={formatSeconds(routeDetail.eta_seconds)} />
                        <Metric label="Path nodes" value={formatNumber(routeDetail.path_node_count)} />
                        <Metric label="Nodes expanded" value={formatNumber(routeDetail.nodes_expanded)} />
                        <Metric label="Route time" value={formatMilliseconds(routeDetail.route_time_ms)} />
                        <Metric label="Total time" value={formatMilliseconds(routeResponse?.total_time_ms)} />
                    </div>
                    <button
                        className="text-button"
                        type="button"
                        onClick={() => setRouteTechnicalDetailsOpen(!routeTechnicalDetailsOpen)}
                    >
                        {routeTechnicalDetailsOpen ? 'Hide routing details' : 'Show routing details'}
                    </button>
                    {routeTechnicalDetailsOpen && (
                        <TechnicalRouteDetails routeDetail={routeDetail} routeComparison={routeComparison} />
                    )}
                </PanelSection>
            )}

            {routeComparison && (
                <PanelSection
                    title="Algorithm comparison"
                    subtitle="Same snapped endpoints; actual A* and Bidirectional A* response"
                >
                    <div className="comparison-table">
                        <div className="table-head">
                            <span>Metric</span>
                            <span>A*</span>
                            <span>Bidirectional A*</span>
                        </div>
                        <ComparisonRow
                            label="Distance"
                            a={formatDistance(routeComparison.astar.distance_m)}
                            b={formatDistance(routeComparison.bidirectional_astar.distance_m)}
                        />
                        <ComparisonRow
                            label="Nodes expanded"
                            a={formatNumber(routeComparison.astar.nodes_expanded)}
                            b={formatNumber(routeComparison.bidirectional_astar.nodes_expanded)}
                        />
                        <ComparisonRow
                            label="Route time"
                            a={formatMilliseconds(routeComparison.astar.route_time_ms)}
                            b={formatMilliseconds(routeComparison.bidirectional_astar.route_time_ms)}
                        />
                        <ComparisonRow
                            label="ETA"
                            a={formatSeconds(routeComparison.astar.eta_seconds)}
                            b={formatSeconds(routeComparison.bidirectional_astar.eta_seconds)}
                        />
                    </div>
                    <div className="result-footnote">
                        Node reduction: {formatPct(routeComparison.comparison.nodes_expanded_reduction_pct)} ·
                        route-time reduction: {formatPct(routeComparison.comparison.route_time_reduction_pct)} ·
                        same distance: {String(routeComparison.comparison.same_distance)}
                    </div>
                </PanelSection>
            )}
        </div>
    );
}

function TechnicalRouteDetails({ routeDetail, routeComparison }) {
    const start = routeComparison?.start ?? routeDetail.start;
    const end = routeComparison?.end ?? routeDetail.end;
    return (
        <div className="detail-list">
            <KeyValue label="Start snapped node" value={String(start?.snapped_node ?? '—')} />
            <KeyValue label="Start snap distance" value={formatDistance(start?.snap_distance_m)} />
            <KeyValue label="Start snap method" value={start?.snap_method ?? '—'} />
            <KeyValue label="End snapped node" value={String(end?.snapped_node ?? '—')} />
            <KeyValue label="End snap distance" value={formatDistance(end?.snap_distance_m)} />
            <KeyValue label="End snap method" value={end?.snap_method ?? '—'} />
        </div>
    );
}

function DeliveriesProductPanel(props) {
    const {
        start,
        stops,
        pickTarget,
        vrpStrategy,
        vrpMatrixAlgorithm,
        useVrpCache,
        returnToStart,
        keepOptimizationTrace,
        selectedVrp,
        selectedVrpOrder,
        selectedVrpDistance,
        selectedVrpTime,
        greedyResponse,
        vrpComparison,
        advancedComparison,
        matrixResponse,
        matrixView,
        setMatrixView,
        vrpLoading,
        matrixLoading,
        deliveryDetailsOpen,
        setDeliveryDetailsOpen,
        setVrpStrategy,
        setVrpMatrixAlgorithm,
        setUseVrpCache,
        setReturnToStart,
        setKeepOptimizationTrace,
        runDeliveries,
        generateMatrix,
        setPickTarget,
        setStops,
        setStart,
        setMatrixResponse,
        setRouteSegments,
    } = props;
    return (
        <div className="panel-stack">
            <PanelSection
                title="Deliveries"
                subtitle="Depot + delivery stops. Maximum 24 stops because the backend matrix supports 25 total locations including the depot."
            >
                <LocationButton
                    label="Depot / Start"
                    coordinate={start}
                    onClick={() => setPickTarget('start')}
                    active={pickTarget === 'start'}
                />
                <div className="stop-list">
                    {stops.map((stop, index) => (
                        <div className="list-row" key={`${stop.lat}-${stop.lon}-${index}`}>
                            <span className="stop-number">{index + 1}</span>
                            <span className="grow">
                                <strong>Stop {index + 1}</strong>
                                <small>
                                    {stop.lat.toFixed(5)}, {stop.lon.toFixed(5)}
                                </small>
                            </span>
                            <button
                                className="icon-button"
                                type="button"
                                onClick={() =>
                                    setStops(stops.filter((_value, itemIndex) => itemIndex !== index))
                                }
                            >
                                ×
                            </button>
                        </div>
                    ))}
                    {stops.length === 0 && (
                        <div className="empty-state">
                            No stops yet. Click the map after selecting the depot.
                        </div>
                    )}
                </div>
                <div className="segmented-control three">
                    <button
                        type="button"
                        className={vrpStrategy === 'greedy' ? 'segment-active' : ''}
                        onClick={() => setVrpStrategy('greedy')}
                    >
                        Greedy
                    </button>
                    <button
                        type="button"
                        className={vrpStrategy === 'two_opt' ? 'segment-active' : ''}
                        onClick={() => setVrpStrategy('two_opt')}
                    >
                        2-Opt
                    </button>
                    <button
                        type="button"
                        className={vrpStrategy === 'lns' ? 'segment-active' : ''}
                        onClick={() => setVrpStrategy('lns')}
                    >
                        LNS
                    </button>
                </div>
                <label className="field-label">
                    Matrix algorithm
                    <select
                        value={vrpMatrixAlgorithm}
                        onChange={(event) => setVrpMatrixAlgorithm(event.target.value)}
                    >
                        <option value="source_dijkstra">Source Dijkstra</option>
                        <option value="bidirectional_astar">Bidirectional A*</option>
                    </select>
                </label>
                <div className="option-grid">
                    <label className="toggle-row">
                        <input
                            type="checkbox"
                            checked={returnToStart}
                            onChange={(event) => setReturnToStart(event.target.checked)}
                        />{' '}
                        Return to depot
                    </label>
                    <label className="toggle-row">
                        <input
                            type="checkbox"
                            checked={useVrpCache}
                            onChange={(event) => setUseVrpCache(event.target.checked)}
                        />{' '}
                        Matrix cache
                    </label>
                    <label className="toggle-row">
                        <input
                            type="checkbox"
                            checked={keepOptimizationTrace}
                            onChange={(event) => setKeepOptimizationTrace(event.target.checked)}
                        />{' '}
                        Keep trace
                    </label>
                </div>
                <div className="action-row">
                    <button
                        className="primary-button"
                        type="button"
                        disabled={!start || stops.length === 0 || vrpLoading}
                        onClick={() => void runDeliveries()}
                    >
                        {vrpLoading ? 'Optimizing…' : 'Run optimizer'}
                    </button>
                    <button
                        className="secondary-button"
                        type="button"
                        disabled={!start || stops.length === 0 || matrixLoading}
                        onClick={() => void generateMatrix()}
                    >
                        {matrixLoading ? 'Generating…' : 'Generate matrix'}
                    </button>
                </div>
                <div className="action-row" style={{ marginTop: 6 }}>
                    <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                            setStart(null);
                            setStops([]);
                            setMatrixResponse(null);
                            setRouteSegments([]);
                            setPickTarget('start');
                        }}
                        disabled={!start && stops.length === 0}
                    >
                        Clear
                    </button>
                </div>
            </PanelSection>

            {selectedVrp && (
                <PanelSection
                    title="Selected optimization"
                    subtitle="Actual optimizer response rendered on the map"
                >
                    <div className="metric-grid metric-grid-3">
                        <Metric label="Distance" value={formatDistance(selectedVrpDistance)} />
                        <Metric label="Optimization" value={formatMilliseconds(selectedVrpTime)} />
                        <Metric label="Stops" value={formatNumber(stops.length)} />
                    </div>
                    <div className="order-line">
                        <span>Visit order</span>
                        <strong>{selectedVrpOrder.map((index) => index + 1).join(' → ')}</strong>
                    </div>
                    <button
                        className="text-button"
                        type="button"
                        onClick={() => setDeliveryDetailsOpen(!deliveryDetailsOpen)}
                    >
                        {deliveryDetailsOpen
                            ? 'Hide optimization internals'
                            : 'Show optimization internals'}
                    </button>
                    {deliveryDetailsOpen && (
                        <DeliveryDetails
                            {...{ vrpStrategy, greedyResponse, vrpComparison, advancedComparison }}
                        />
                    )}
                </PanelSection>
            )}

            {matrixResponse && (
                <PanelSection title="Distance matrix" subtitle="Direct response from POST /matrix">
                    <div className="metric-grid metric-grid-4">
                        <Metric label="N" value={formatNumber(matrixResponse.n)} />
                        <Metric label="Pairs" value={formatNumber(matrixResponse.pair_count)} />
                        <Metric label="Computed" value={formatNumber(matrixResponse.computed_pairs)} />
                        <Metric label="Failed" value={formatNumber(matrixResponse.failed_pairs)} />
                        <Metric
                            label="Generation"
                            value={formatMilliseconds(matrixResponse.generation_time_ms)}
                        />
                        <Metric label="Workers" value={formatNumber(matrixResponse.parallel_workers)} />
                        <Metric
                            label="Cache"
                            value={
                                matrixResponse.cache.hit
                                    ? 'HIT'
                                    : matrixResponse.cache.enabled
                                    ? 'MISS'
                                    : 'DISABLED'
                            }
                        />
                        <Metric label="Algorithm" value={matrixResponse.algorithm} />
                    </div>
                    <div className="segmented-control two">
                        <button
                            type="button"
                            className={matrixView === 'distance' ? 'segment-active' : ''}
                            onClick={() => setMatrixView('distance')}
                        >
                            Distance m
                        </button>
                        <button
                            type="button"
                            className={matrixView === 'eta' ? 'segment-active' : ''}
                            onClick={() => setMatrixView('eta')}
                        >
                            ETA s
                        </button>
                    </div>
                    <MatrixTable response={matrixResponse} view={matrixView} />
                </PanelSection>
            )}

            {advancedComparison && (
                <PanelSection title="Algorithm progression" subtitle="Greedy → 2-Opt → LNS">
                    <div className="comparison-table">
                        <div className="table-head">
                            <span>Stage</span>
                            <span>Distance</span>
                            <span>Improvement</span>
                        </div>
                        <ComparisonRow
                            label="Greedy"
                            a={formatDistance(advancedComparison.greedy.total_distance_m)}
                            b="baseline"
                        />
                        <ComparisonRow
                            label="2-Opt"
                            a={formatDistance(advancedComparison.two_opt.total_distance_m)}
                            b={formatPct(
                                advancedComparison.comparison.two_opt_vs_greedy_improvement_pct
                            )}
                        />
                        <ComparisonRow
                            label="LNS"
                            a={formatDistance(advancedComparison.lns.total_distance_m)}
                            b={formatPct(advancedComparison.comparison.lns_vs_greedy_improvement_pct)}
                        />
                    </div>
                    <div className="result-footnote">
                        2-Opt non-regression:{' '}
                        {String(advancedComparison.comparison.two_opt_non_regression)} · LNS
                        non-regression: {String(advancedComparison.comparison.lns_non_regression)}
                    </div>
                </PanelSection>
            )}
        </div>
    );
}

function DeliveryDetails({ vrpStrategy, greedyResponse, vrpComparison, advancedComparison }) {
    if (vrpStrategy === 'greedy' && greedyResponse)
        return (
            <div className="detail-list">
                <KeyValue
                    label="Matrix generation"
                    value={formatMilliseconds(greedyResponse.matrix_generation_time_ms)}
                />
                <KeyValue
                    label="Optimization time"
                    value={formatMilliseconds(greedyResponse.optimization_time_ms)}
                />
                <KeyValue label="Total time" value={formatMilliseconds(greedyResponse.total_time_ms)} />
                <KeyValue label="Cache status" value={greedyResponse.cache_status ?? '—'} />
                <KeyValue label="Cache hits" value={formatNumber(greedyResponse.cache_hits)} />
                <KeyValue label="Cache misses" value={formatNumber(greedyResponse.cache_misses)} />
            </div>
        );
    if (vrpStrategy === 'two_opt' && vrpComparison)
        return (
            <div className="detail-list">
                <KeyValue label="Iterations" value={formatNumber(vrpComparison.two_opt.iterations)} />
                <KeyValue label="Swaps" value={formatNumber(vrpComparison.two_opt.swaps_applied)} />
                <KeyValue label="Converged" value={String(vrpComparison.two_opt.converged)} />
                <KeyValue
                    label="Distance saved"
                    value={formatDistance(vrpComparison.improvement.distance_saved_m)}
                />
                <KeyValue
                    label="Improvement"
                    value={formatPct(vrpComparison.improvement.improvement_pct)}
                />
                <KeyValue
                    label="Trace entries"
                    value={formatNumber(vrpComparison.convergence_trace.length)}
                />
            </div>
        );
    if (vrpStrategy === 'lns' && advancedComparison)
        return (
            <div className="detail-list">
                <KeyValue
                    label="Iterations"
                    value={formatNumber(advancedComparison.lns.iterations_run)}
                />
                <KeyValue
                    label="Improvements applied"
                    value={formatNumber(advancedComparison.lns.improvements_applied)}
                />
                <KeyValue label="Converged" value={String(advancedComparison.lns.converged)} />
                <KeyValue
                    label="Random seed"
                    value={
                        advancedComparison.lns.random_seed === null
                            ? 'none'
                            : String(advancedComparison.lns.random_seed)
                    }
                />
                <KeyValue label="Trace entries" value={formatNumber(advancedComparison.lns.trace.length)} />
                <KeyValue label="Total time" value={formatMilliseconds(advancedComparison.total_time_ms)} />
            </div>
        );
    return null;
}

function DispatchProductPanel(props) {
    const {
        drivers,
        orders,
        pickTarget,
        dispatchMatrixAlgorithm,
        useDispatchCache,
        dispatchResponse,
        dispatchResult,
        dispatchFairness,
        assignmentView,
        dispatchLoading,
        dispatchDetailsOpen,
        setDispatchDetailsOpen,
        setDispatchMatrixAlgorithm,
        setUseDispatchCache,
        setAssignment,
        runDispatch,
        setPickTarget,
        setDrivers,
        setOrders,
        setDispatchResponse,
        setDispatchLines,
    } = props;
    return (
        <div className="panel-stack">
            <PanelSection
                title="Dispatch"
                subtitle="Driver-order assignment using the backend's greedy and Hungarian cost models."
            >
                <ListEditor
                    title="Drivers"
                    active={pickTarget === 'driver'}
                    items={drivers.map((driver) => ({
                        id: driver.driver_id,
                        subtitle: `${driver.lat.toFixed(4)}, ${driver.lon.toFixed(4)} · ${
                            driver.max_capacity - driver.current_load
                        } slots`,
                    }))}
                    color="driver"
                    onAdd={() => setPickTarget('driver')}
                    onRemove={(index) =>
                        setDrivers(drivers.filter((_value, itemIndex) => itemIndex !== index))
                    }
                />
                <ListEditor
                    title="Orders"
                    active={pickTarget === 'order'}
                    items={orders.map((order) => ({
                        id: order.order_id,
                        subtitle: `${order.pickup_lat.toFixed(4)}, ${order.pickup_lon.toFixed(4)}`,
                    }))}
                    color="order"
                    onAdd={() => setPickTarget('order')}
                    onRemove={(index) =>
                        setOrders(orders.filter((_value, itemIndex) => itemIndex !== index))
                    }
                />
                <label className="field-label">
                    Cost matrix
                    <select
                        value={dispatchMatrixAlgorithm}
                        onChange={(event) => setDispatchMatrixAlgorithm(event.target.value)}
                    >
                        <option value="haversine">Haversine</option>
                        <option value="source_dijkstra">Source Dijkstra / road network</option>
                    </select>
                </label>
                <label className="toggle-row">
                    <input
                        type="checkbox"
                        checked={useDispatchCache}
                        onChange={(event) => setUseDispatchCache(event.target.checked)}
                    />{' '}
                    Dispatch cache
                </label>
                <div className="action-row">
                    <button
                        className="primary-button"
                        type="button"
                        disabled={drivers.length === 0 || orders.length === 0 || dispatchLoading}
                        onClick={() => void runDispatch()}
                    >
                        {dispatchLoading ? 'Assigning…' : 'Run dispatch comparison'}
                    </button>
                    <button
                        className="secondary-button"
                        type="button"
                        onClick={() => {
                            setDrivers([]);
                            setOrders([]);
                            setDispatchResponse(null);
                            setDispatchLines([]);
                        }}
                        disabled={drivers.length === 0 && orders.length === 0}
                    >
                        Clear
                    </button>
                </div>
            </PanelSection>
            {dispatchResponse && dispatchResult && dispatchFairness && (
                <PanelSection
                    title="Assignment result"
                    subtitle="Compare Greedy vs Hungarian and inspect fairness / feasibility"
                >
                    <div className="segmented-control two">
                        <button
                            type="button"
                            className={assignmentView === 'greedy' ? 'segment-active' : ''}
                            onClick={() => setAssignment('greedy')}
                        >
                            Greedy
                        </button>
                        <button
                            type="button"
                            className={assignmentView === 'hungarian' ? 'segment-active' : ''}
                            onClick={() => setAssignment('hungarian')}
                        >
                            Hungarian
                        </button>
                    </div>
                    <div className="metric-grid metric-grid-4">
                        <Metric label="Assigned" value={formatNumber(dispatchResult.assigned_count)} />
                        <Metric
                            label="Unassigned"
                            value={formatNumber(dispatchResult.unassigned_order_ids.length)}
                        />
                        <Metric label="Total cost" value={formatDistance(dispatchResult.total_cost)} />
                        <Metric
                            label="Total time"
                            value={formatMilliseconds(dispatchResponse.total_time_ms)}
                        />
                        <Metric label="Fairness" value={dispatchFairness.fairness_score.toFixed(3)} />
                        <Metric
                            label="Utilization max"
                            value={formatPct(dispatchFairness.max_utilization_pct)}
                        />
                        <Metric
                            label="Available slots"
                            value={formatNumber(dispatchResponse.available_slot_count)}
                        />
                        <Metric
                            label="Unused slots"
                            value={formatNumber(dispatchResponse.unused_slot_count)}
                        />
                    </div>
                    <div className="assignment-list">
                        {dispatchResult.assignments.map((assignment) => (
                            <div
                                className="assignment-row"
                                key={`${assignment.driver_id}-${assignment.order_id}`}
                            >
                                <span>{assignment.driver_id}</span>
                                <strong>→</strong>
                                <span>{assignment.order_id}</span>
                                <span>{formatDistance(assignment.cost)}</span>
                            </div>
                        ))}
                    </div>
                    <div className="result-footnote">
                        Hungarian vs Greedy:{' '}
                        {formatPct(dispatchResponse.comparison.hungarian_vs_greedy_improvement_pct)}{' '}
                        cost improvement · non-regression=
                        {String(dispatchResponse.comparison.hungarian_non_regression)}
                    </div>
                    <button
                        className="text-button"
                        type="button"
                        onClick={() => setDispatchDetailsOpen(!dispatchDetailsOpen)}
                    >
                        {dispatchDetailsOpen ? 'Hide dispatch internals' : 'Show dispatch internals'}
                    </button>
                    {dispatchDetailsOpen && (
                        <DispatchDetails response={dispatchResponse} fairness={dispatchFairness} />
                    )}
                </PanelSection>
            )}
        </div>
    );
}

function DispatchDetails({ response, fairness }) {
    return (
        <div className="detail-list">
            <KeyValue label="Matrix algorithm" value={response.matrix_algorithm} />
            <KeyValue label="Cache status" value={response.cache_status ?? '—'} />
            <KeyValue label="Cache hit" value={String(response.cache_hit)} />
            <KeyValue
                label="Cost-matrix build"
                value={formatMilliseconds(response.cost_matrix_build_time_ms)}
            />
            <KeyValue
                label="Road network"
                value={
                    response.road_network
                        ? `${response.road_network.matrix_source}, ${response.road_network.reachable_pair_count}/${response.road_network.pair_count} reachable`
                        : 'not used / not returned'
                }
            />
            <KeyValue label="Fairness score" value={fairness.fairness_score.toFixed(3)} />
            <KeyValue label="Projected load range" value={String(fairness.projected_load_range)} />
            <KeyValue label="Max utilization" value={formatPct(fairness.max_utilization_pct)} />
        </div>
    );
}

function OperationsProductPanel(props) {
    const {
        origin,
        drivers,
        orders,
        pickTarget,
        matrixAlgorithm,
        useCache,
        returnToStart,
        driverCapacity,
        vrpStrategy,
        vrpMatrixAlgorithm,
        onDriverCapacityChange,
        onVrpStrategyChange,
        onVrpMatrixAlgorithmChange,
        dispatchResponse,
        planResponse,
        plan,
        assignedCount,
        unassignedCount,
        loading,
        onMatrixAlgorithmChange,
        onUseCacheChange,
        onReturnToStartChange,
        onChooseOrigin,
        onAddDriver,
        onAddOrder,
        onLoadSample,
        onRun,
        onClear,
        onRemoveDriver,
        onRemoveOrder,
    } = props;
    const canRun = Boolean(origin) && drivers.length > 0 && orders.length > 0 && !loading;
    return (
        <div className="panel-stack">
            <PanelSection
                title="Operations pipeline"
                subtitle="Full backend pipeline (/operations/plan): 1 Dispatch → 2 Optimize stops → 3 Route legs."
            >
                <div className="operation-flow">
                    <span>1 Dispatch</span>
                    <span>→</span>
                    <span>2 Optimize stops</span>
                    <span>→</span>
                    <span>3 Route legs</span>
                </div>

                <div className="target-selector-bar" role="group" aria-label="Map click mode">
                    <button
                        type="button"
                        className={`target-pill ${pickTarget === 'start' ? 'target-pill-active' : ''}`}
                        onClick={onChooseOrigin}
                    >
                        1. Origin {origin ? '✓' : ''}
                    </button>
                    <button
                        type="button"
                        className={`target-pill ${pickTarget === 'driver' ? 'target-pill-active' : ''}`}
                        onClick={onAddDriver}
                    >
                        2. Drivers ({drivers.length})
                    </button>
                    <button
                        type="button"
                        className={`target-pill ${pickTarget === 'order' ? 'target-pill-active' : ''}`}
                        onClick={onAddOrder}
                    >
                        3. Orders ({orders.length})
                    </button>
                </div>

                <label className="field-label">
                    Driver capacity
                    <select
                        value={driverCapacity}
                        onChange={(event) => onDriverCapacityChange(Number(event.target.value))}
                    >
                        {[1, 2, 3, 4, 5, 6, 8, 10].map((value) => (
                            <option key={value} value={value}>
                                {value} orders / driver
                            </option>
                        ))}
                    </select>
                </label>
                <div className="option-grid">
                    <label className="field-label">
                        Delivery optimizer
                        <select
                            value={vrpStrategy}
                            onChange={(event) => onVrpStrategyChange(event.target.value)}
                        >
                            <option value="greedy">Greedy</option>
                            <option value="two_opt">2-Opt</option>
                            <option value="lns">LNS</option>
                        </select>
                    </label>
                    <label className="field-label">
                        Delivery matrix
                        <select
                            value={vrpMatrixAlgorithm}
                            onChange={(event) => onVrpMatrixAlgorithmChange(event.target.value)}
                        >
                            <option value="source_dijkstra">Source Dijkstra</option>
                            <option value="bidirectional_astar">Bidirectional A*</option>
                        </select>
                    </label>
                </div>
                <LocationButton
                    label="Origin / Start"
                    coordinate={origin}
                    onClick={onChooseOrigin}
                    active={pickTarget === 'start'}
                />
                <ListEditor
                    title="Drivers"
                    active={pickTarget === 'driver'}
                    items={drivers.map((driver, idx) => ({
                        id: driver.driver_id,
                        colorHex: DRIVER_COLORS[idx % DRIVER_COLORS.length],
                        subtitle: `${driver.lat.toFixed(4)}, ${driver.lon.toFixed(4)} · capacity ${driver.max_capacity}`,
                    }))}
                    color="driver"
                    onAdd={onAddDriver}
                    onRemove={onRemoveDriver}
                />
                <ListEditor
                    title="Orders"
                    active={pickTarget === 'order'}
                    items={orders.map((order) => ({
                        id: order.order_id,
                        subtitle: `${order.pickup_lat.toFixed(4)}, ${order.pickup_lon.toFixed(4)}`,
                    }))}
                    color="order"
                    onAdd={onAddOrder}
                    onRemove={onRemoveOrder}
                />
                <div className="option-grid" style={{ marginTop: 6 }}>
                    <label className="field-label">
                        Dispatch cost
                        <select
                            value={matrixAlgorithm}
                            onChange={(event) => onMatrixAlgorithmChange(event.target.value)}
                        >
                            <option value="haversine">Haversine</option>
                            <option value="source_dijkstra">Road network / Source Dijkstra</option>
                        </select>
                    </label>
                    <label className="toggle-row">
                        <input
                            type="checkbox"
                            checked={useCache}
                            onChange={(event) => onUseCacheChange(event.target.checked)}
                        />{' '}
                        Cache
                    </label>
                </div>
                <label className="toggle-row" style={{ margin: '6px 0' }}>
                    <input
                        type="checkbox"
                        checked={returnToStart}
                        onChange={(event) => onReturnToStartChange(event.target.checked)}
                    />{' '}
                    Return each driver to start
                </label>

                {!canRun && !loading && (
                    <div className="helper-banner" style={{ marginBottom: 6 }}>
                        {!origin
                            ? 'Step 1: Click the map to set Origin / Start (or load sample scenario below).'
                            : drivers.length === 0
                            ? 'Step 2: Click the map to place at least 1 Driver.'
                            : 'Step 3: Click the map to place at least 1 Customer Order.'}
                    </div>
                )}

                <div className="action-row">
                    <button
                        className="primary-button"
                        type="button"
                        disabled={!canRun}
                        onClick={onRun}
                    >
                        {loading ? 'Building plan…' : 'Build delivery plan'}
                    </button>
                    <button
                        className="secondary-button"
                        type="button"
                        disabled={drivers.length === 0 && orders.length === 0 && !origin}
                        onClick={onClear}
                    >
                        Clear
                    </button>
                </div>
                <div className="action-row" style={{ marginTop: 6 }}>
                    <button
                        className="secondary-button"
                        type="button"
                        onClick={onLoadSample}
                        disabled={loading}
                    >
                        Load sample scenario
                    </button>
                </div>
            </PanelSection>

            {planResponse && (
                <PanelSection
                    title="Fleet operations summary"
                    subtitle="Live response from POST /operations/plan"
                >
                    <div className="metric-grid metric-grid-4">
                        <Metric
                            label="Fleet distance"
                            value={formatDistance(planResponse.total_fleet_distance_m)}
                        />
                        <Metric
                            label="Fleet ETA"
                            value={formatSeconds(planResponse.total_fleet_eta_s)}
                        />
                        <Metric
                            label="Active drivers"
                            value={`${planResponse.active_driver_count}/${planResponse.driver_count}`}
                        />
                        <Metric
                            label="Total time"
                            value={formatMilliseconds(planResponse.total_time_ms)}
                        />
                    </div>
                </PanelSection>
            )}

            {dispatchResponse && (
                <PanelSection
                    title="Stage 1 · Dispatch"
                    subtitle="Hungarian vs Greedy order allocation."
                >
                    <div className="metric-grid metric-grid-3">
                        <Metric label="Assigned" value={formatNumber(assignedCount)} />
                        <Metric label="Unassigned" value={formatNumber(unassignedCount)} />
                        <Metric
                            label="Cost"
                            value={formatDistance(dispatchResponse.hungarian.total_cost)}
                        />
                    </div>
                    <div className="result-footnote">
                        Hungarian improvement vs Greedy:{' '}
                        {formatPct(dispatchResponse.comparison.hungarian_vs_greedy_improvement_pct)}
                    </div>
                </PanelSection>
            )}

            {plan.length > 0 && (
                <PanelSection
                    title="Stage 2–3 · Driver plans"
                    subtitle="Each driver's assigned orders are sequenced and routed on the road graph."
                >
                    <div className="operation-plan-list">
                        {plan.map((item) => (
                            <div className="operation-driver-plan" key={item.driverId}>
                                <div className="section-heading">
                                    <strong>
                                        <span
                                            className="driver-color-dot"
                                            style={{ background: item.color }}
                                        />
                                        {item.driverId}
                                    </strong>
                                    <span className="code-tag">
                                        {item.assignedOrderIds.length} orders
                                    </span>
                                </div>
                                <div className="result-footnote">
                                    Assigned:{' '}
                                    {item.assignedOrderIds.length
                                        ? item.assignedOrderIds.join(' → ')
                                        : 'none'}
                                </div>
                                {item.optimizedOrderIds.length > 0 && (
                                    <>
                                        <div className="result-footnote">
                                            Optimized ({item.strategy.toUpperCase()}):{' '}
                                            {item.optimizedOrderIds.join(' → ')}
                                        </div>
                                        <div className="metric-grid metric-grid-3" style={{ marginTop: 6 }}>
                                            <Metric
                                                label="Road distance"
                                                value={formatDistance(item.totalDistanceMeters)}
                                            />
                                            <Metric
                                                label="ETA"
                                                value={formatSeconds(item.totalEtaSeconds)}
                                            />
                                            <Metric
                                                label="Optimizer"
                                                value={formatMilliseconds(item.optimizationTimeMs)}
                                            />
                                        </div>
                                    </>
                                )}
                                {item.assignedOrderIds.length === 0 && (
                                    <div className="empty-state">No orders assigned.</div>
                                )}
                            </div>
                        ))}
                    </div>
                </PanelSection>
            )}
        </div>
    );
}

function LocationButton({ label, coordinate, onClick, active }) {
    return (
        <button
            className={`location-button ${active ? 'location-button-active' : ''}`}
            type="button"
            onClick={onClick}
        >
            <span className="location-dot" />
            <span className="grow">
                <strong>{label}</strong>
                <small>
                    {coordinate
                        ? `${coordinate.lat.toFixed(5)}, ${coordinate.lon.toFixed(5)}`
                        : 'Click to select on map'}
                </small>
            </span>
        </button>
    );
}

function ListEditor({ title, items, color, active = false, onAdd, onRemove }) {
    return (
        <section className={`compact-section ${active ? 'compact-section-active' : ''}`}>
            <div className="section-heading">
                <div>
                    <h3>{title}</h3>
                </div>
                <button
                    className={`text-button ${active ? 'text-button-active' : ''}`}
                    type="button"
                    onClick={onAdd}
                >
                    {active ? 'Adding on map…' : 'Add on map'}
                </button>
            </div>
            {items.map((item, index) => (
                <div className="list-row" key={item.id}>
                    <span
                        className={`dispatch-swatch dispatch-swatch-${color}`}
                        style={item.colorHex ? { background: item.colorHex } : undefined}
                    />
                    <span className="grow">
                        <strong>{item.id}</strong>
                        <small>{item.subtitle}</small>
                    </span>
                    <button className="icon-button" type="button" onClick={() => onRemove(index)}>
                        ×
                    </button>
                </div>
            ))}
            {items.length === 0 && <div className="empty-state">None — click "Add on map" then click map.</div>}
        </section>
    );
}

function MatrixTable({ response, view }) {
    const matrix = view === 'distance' ? response.matrix_distance_m : response.matrix_eta_s;
    return (
        <div className="matrix-wrap">
            <table>
                <thead>
                    <tr>
                        <th>From / To</th>
                        {response.locations.map((location) => (
                            <th key={location.id}>{location.id}</th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {matrix.map((row, rowIndex) => (
                        <tr key={response.locations[rowIndex].id}>
                            <th>{response.locations[rowIndex].id}</th>
                            {row.map((value, columnIndex) => (
                                <td key={`${rowIndex}-${columnIndex}`}>
                                    {value === null ? '∅' : value.toFixed(1)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
            {response.failures.length > 0 && (
                <div className="notice-box">
                    Failed pairs:{' '}
                    {response.failures
                        .map((failure) => `${failure.from_id}→${failure.to_id}`)
                        .join(', ')}
                </div>
            )}
        </div>
    );
}

function ComparisonRow({ label, a, b }) {
    return (
        <div className="table-row">
            <span>{label}</span>
            <span>{a}</span>
            <span>{b}</span>
        </div>
    );
}

function KeyValue({ label, value }) {
    return (
        <div className="key-value">
            <span>{label}</span>
            <strong>{value}</strong>
        </div>
    );
}
