const envNum = (val, fallback) => {
    const parsed = Number(val);
    return Number.isFinite(parsed) ? parsed : fallback;
};

export const CITYROUTE_BOUNDS = {
    south: envNum(import.meta.env.VITE_BBOX_SOUTH, 26.43),
    north: envNum(import.meta.env.VITE_BBOX_NORTH, 26.50),
    west: envNum(import.meta.env.VITE_BBOX_WEST, 80.28),
    east: envNum(import.meta.env.VITE_BBOX_EAST, 80.38),
};

export const CITYROUTE_CENTER = {
    lat: envNum(import.meta.env.VITE_DEFAULT_CENTER_LAT, 26.465),
    lon: envNum(import.meta.env.VITE_DEFAULT_CENTER_LON, 80.33),
    zoom: envNum(import.meta.env.VITE_DEFAULT_ZOOM, 13),
};

export function updateRuntimeGeoConfig(bbox, center) {
    if (bbox) {
        if (Number.isFinite(Number(bbox.south))) CITYROUTE_BOUNDS.south = Number(bbox.south);
        if (Number.isFinite(Number(bbox.north))) CITYROUTE_BOUNDS.north = Number(bbox.north);
        if (Number.isFinite(Number(bbox.west))) CITYROUTE_BOUNDS.west = Number(bbox.west);
        if (Number.isFinite(Number(bbox.east))) CITYROUTE_BOUNDS.east = Number(bbox.east);
    }
    if (center) {
        if (Number.isFinite(Number(center.lat))) CITYROUTE_CENTER.lat = Number(center.lat);
        if (Number.isFinite(Number(center.lon))) CITYROUTE_CENTER.lon = Number(center.lon);
        if (Number.isFinite(Number(center.zoom))) CITYROUTE_CENTER.zoom = Number(center.zoom);
    }
}

export function isInsideCityRouteBounds(coordinate, boundsOverride = null) {
    const b = boundsOverride ?? CITYROUTE_BOUNDS;
    return (
        coordinate.lat >= b.south &&
        coordinate.lat <= b.north &&
        coordinate.lon >= b.west &&
        coordinate.lon <= b.east
    );
}
