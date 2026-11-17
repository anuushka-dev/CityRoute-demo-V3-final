import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Polyline, Popup, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { CITYROUTE_CENTER } from '../utils/validation';

const DEFAULT_ZOOM = CITYROUTE_CENTER.zoom ?? 13;
const ROUTE_WEIGHT = 5;
const ROUTE_COMPARISON_WEIGHT = 4;
const ROUTE_OPACITY = 0.9;
const START_RADIUS = 7;
const STOP_RADIUS = 6;
const DRIVER_RADIUS = 7;
const ORDER_RADIUS = 5;
const DEFAULT_MAP_TILE_URL = import.meta.env.VITE_MAP_TILE_URL || 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const DEFAULT_MAP_ATTRIBUTION = import.meta.env.VITE_MAP_ATTRIBUTION || '&copy; OpenStreetMap contributors';

function MapClickHandler({ onMapSelect }) {
    useMapEvents({ click: (event) => onMapSelect?.({ lat: event.latlng.lat, lon: event.latlng.lng }) });
    return null;
}

function ViewportController({ locations, dispatchDrivers, dispatchOrders, extraPoints }) {
    const map = useMap();
    const points = useMemo(() => [
        ...locations.map((location) => [location.coordinate.lat, location.coordinate.lon]),
        ...dispatchDrivers.map((d) => [d.coordinate.lat, d.coordinate.lon]),
        ...dispatchOrders.map((o) => [o.coordinate.lat, o.coordinate.lon]),
        ...extraPoints.map((point) => [point.lat, point.lon]),
    ], [locations, dispatchDrivers, dispatchOrders, extraPoints]);
    useEffect(() => {
        if (points.length >= 2)
            map.fitBounds(points, { padding: [44, 44], maxZoom: 15 });
    }, [map, points]);
    return null;
}

export function MapView({
    routeGeometry,
    comparisonGeometry = [],
    additionalSegments = [],
    locations,
    dispatchDrivers = [],
    dispatchOrders = [],
    dispatchLines = [],
    interactive = false,
    onMapSelect,
    center = CITYROUTE_CENTER,
    zoom = DEFAULT_ZOOM,
    tileUrl = DEFAULT_MAP_TILE_URL,
    tileAttribution = DEFAULT_MAP_ATTRIBUTION,
}) {
    const normalizedSegments = useMemo(() => {
        return additionalSegments.map((seg, index) => {
            if (Array.isArray(seg)) {
                return { id: `segment-${index}`, geometry: seg, color: null, label: null };
            }
            return {
                id: seg.id ?? `segment-${index}`,
                geometry: Array.isArray(seg.geometry) ? seg.geometry : [],
                color: seg.color ?? null,
                label: seg.label ?? null,
            };
        });
    }, [additionalSegments]);

    const extraPoints = useMemo(() => {
        const segmentEndpoints = normalizedSegments.flatMap((s) => [
            ...s.geometry.slice(0, 1),
            ...s.geometry.slice(-1),
        ]);
        return [
            ...routeGeometry.slice(0, 1),
            ...routeGeometry.slice(-1),
            ...comparisonGeometry.slice(0, 1),
            ...comparisonGeometry.slice(-1),
            ...segmentEndpoints,
        ];
    }, [routeGeometry, comparisonGeometry, normalizedSegments]);

    return (
        <MapContainer
            center={[center.lat, center.lon]}
            zoom={zoom}
            className="map-container"
            zoomControl={false}
            scrollWheelZoom
        >
            <TileLayer attribution={tileAttribution} url={tileUrl} maxZoom={19} />
            {interactive && <MapClickHandler onMapSelect={onMapSelect} />}
            <ViewportController
                locations={locations}
                dispatchDrivers={dispatchDrivers}
                dispatchOrders={dispatchOrders}
                extraPoints={extraPoints}
            />

            {routeGeometry.length >= 2 && (
                <Polyline
                    positions={routeGeometry.map((point) => [point.lat, point.lon])}
                    pathOptions={{ className: 'route-primary-line', weight: ROUTE_WEIGHT, opacity: ROUTE_OPACITY }}
                />
            )}
            {comparisonGeometry.length >= 2 && (
                <Polyline
                    positions={comparisonGeometry.map((point) => [point.lat, point.lon])}
                    pathOptions={{ className: 'route-comparison-line', weight: ROUTE_COMPARISON_WEIGHT, opacity: 0.7, dashArray: '10 8' }}
                />
            )}
            {normalizedSegments.map((segment) =>
                segment.geometry.length >= 2 ? (
                    <Polyline
                        key={segment.id}
                        positions={segment.geometry.map((point) => [point.lat, point.lon])}
                        pathOptions={{
                            className: segment.color ? undefined : 'route-primary-line',
                            color: segment.color ?? '#0f172a',
                            weight: ROUTE_WEIGHT,
                            opacity: ROUTE_OPACITY,
                        }}
                    >
                        {segment.label && (
                            <Popup>
                                <strong>{segment.label}</strong>
                            </Popup>
                        )}
                    </Polyline>
                ) : null
            )}

            {locations.map((location, index) => (
                <CircleMarker
                    key={location.id}
                    center={[location.coordinate.lat, location.coordinate.lon]}
                    radius={index === 0 ? START_RADIUS : STOP_RADIUS}
                    pathOptions={{ className: index === 0 ? 'cityroute-marker-start' : 'cityroute-marker-stop' }}
                >
                    <Popup>
                        <strong>{location.label}</strong>
                        <br />
                        {location.coordinate.lat.toFixed(5)}, {location.coordinate.lon.toFixed(5)}
                    </Popup>
                </CircleMarker>
            ))}

            {dispatchDrivers.map((driver) => (
                <CircleMarker
                    key={`driver-${driver.id}`}
                    center={[driver.coordinate.lat, driver.coordinate.lon]}
                    radius={DRIVER_RADIUS}
                    pathOptions={
                        driver.color
                            ? { color: driver.color, fillColor: driver.color, fillOpacity: 0.9, weight: 2 }
                            : { className: 'cityroute-marker-driver' }
                    }
                >
                    <Popup>
                        <strong>{driver.label}</strong>
                        {driver.subtitle && (
                            <>
                                <br />
                                {driver.subtitle}
                            </>
                        )}
                        <br />
                        {driver.coordinate.lat.toFixed(5)}, {driver.coordinate.lon.toFixed(5)}
                    </Popup>
                </CircleMarker>
            ))}

            {dispatchOrders.map((order) => (
                <CircleMarker
                    key={`order-${order.id}`}
                    center={[order.coordinate.lat, order.coordinate.lon]}
                    radius={ORDER_RADIUS + 1}
                    pathOptions={{ className: 'cityroute-marker-order' }}
                >
                    <Popup>
                        <strong>{order.label}</strong>
                        {order.subtitle && (
                            <>
                                <br />
                                {order.subtitle}
                            </>
                        )}
                        <br />
                        {order.coordinate.lat.toFixed(5)}, {order.coordinate.lon.toFixed(5)}
                    </Popup>
                </CircleMarker>
            ))}

            {dispatchLines.map((line) => (
                <Polyline
                    key={`dispatch-${line.id}`}
                    positions={[
                        [line.from.lat, line.from.lon],
                        [line.to.lat, line.to.lon],
                    ]}
                    pathOptions={{
                        className: line.color ? undefined : 'dispatch-line',
                        color: line.color ?? '#7c3aed',
                        weight: 3,
                        dashArray: '7 7',
                        opacity: 0.85,
                    }}
                />
            ))}
        </MapContainer>
    );
}
