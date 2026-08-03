// ========================================
// OpenGIS — Map Module (MapLibre GL JS)
// ========================================

import { state, DEFAULT_CENTER, DEFAULT_ZOOM, LAYER_COLORS, IS_LOW_END } from './config.js';
import {
    sanitize, formatArea, formatPerimeter, formatDistance, formatNumber,
    calculatePolygonArea, calculatePolygonPerimeter,
    haversineDistance, featureIdToCode
} from './utils.js';

// MapTiler free tier key — for vector tile styles + terrain
const MAPTILER_KEY = 'get_your_own_OpIi9ZULNHzrESv6T2vL';

// Style URLs
const STYLES = {
    streets: `https://api.maptiler.com/maps/streets-v2/style.json?key=${MAPTILER_KEY}`,
    satellite: `https://api.maptiler.com/maps/satellite/style.json?key=${MAPTILER_KEY}`,
    topo: `https://api.maptiler.com/maps/topo-v2/style.json?key=${MAPTILER_KEY}`,
    dark: `https://api.maptiler.com/maps/dataviz-dark/style.json?key=${MAPTILER_KEY}`,
};

// Unique source/layer IDs
const CLUSTER_SOURCE = 'opengis-cluster-source';
const CLUSTER_LAYER = 'opengis-clusters';
const CLUSTER_COUNT_LAYER = 'opengis-cluster-count';
const UNCLUSTERED_LAYER = 'opengis-unclustered-point';
const HEATMAP_SOURCE = 'opengis-heatmap-source';
const HEATMAP_LAYER = 'opengis-heatmap';
const ROUTE_SOURCE = 'opengis-route-source';
const ROUTE_LAYER = 'opengis-route-line';

// ========================================
// Map Initialization
// ========================================
export function initMap(elementId) {
    const map = new maplibregl.Map({
        container: elementId,
        style: STYLES.streets,
        center: [DEFAULT_CENTER[1], DEFAULT_CENTER[0]], // MapLibre uses [lng, lat]
        zoom: DEFAULT_ZOOM,
        attributionControl: true,
        maxPitch: 60,
    });

    // Navigation controls (zoom + compass)
    map.addControl(new maplibregl.NavigationControl(), 'top-right');

    // Scale bar
    map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-left');

    // 3D Terrain (once style loads)
    map.on('style.load', () => {
        // Add terrain source if available in style
        try {
            if (!map.getSource('terrain')) {
                map.addSource('terrain', {
                    type: 'raster-dem',
                    url: `https://api.maptiler.com/tiles/terrain-rgb/tiles.json?key=${MAPTILER_KEY}`,
                    tileSize: 256,
                });
            }
            map.setTerrain({ source: 'terrain', exaggeration: 1.3 });
        } catch (e) {
            console.warn('Terrain not available for this style:', e);
        }

        // Re-add custom sources/layers after style change
        restoreCustomLayers(map);
    });

    state.map = map;
    return map;
}

// ========================================
// Tile Layers / Base Map Switcher
// ========================================
export function addTileLayers(map) {
    // Build custom layer switcher control
    const switcherDiv = document.createElement('div');
    switcherDiv.className = 'maplibre-base-switcher';
    switcherDiv.innerHTML = `
        <button class="base-switch-btn active" data-style="streets" title="Street Map">🗺️</button>
        <button class="base-switch-btn" data-style="satellite" title="Satellite">🛰️</button>
        <button class="base-switch-btn" data-style="topo" title="Topographic">⛰️</button>
        <button class="base-switch-btn" data-style="dark" title="Dark Mode">🌑</button>
    `;

    switcherDiv.querySelectorAll('.base-switch-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const styleName = btn.dataset.style;
            if (!STYLES[styleName]) return;

            // Update active state
            switcherDiv.querySelectorAll('.base-switch-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Store current camera position
            const center = map.getCenter();
            const zoom = map.getZoom();
            const pitch = map.getPitch();
            const bearing = map.getBearing();

            // Switch style (this fires 'style.load' which restores custom layers)
            map.setStyle(STYLES[styleName]);

            // Restore camera after style loads
            map.once('style.load', () => {
                map.jumpTo({ center, zoom, pitch, bearing });
            });
        });
    });

    // Add as a custom control
    const switcherControl = {
        onAdd: () => switcherDiv,
        onRemove: () => switcherDiv.remove(),
    };
    map.addControl(switcherControl, 'top-right');

    return switcherDiv;
}

// ========================================
// Draw Controls (MapboxDraw)
// ========================================
export function addDrawControls(map) {
    const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {
            point: true,
            line_string: true,
            polygon: true,
            trash: true,
        },
        styles: getDrawStyles(),
    });

    map.addControl(draw, 'top-left');
    state.drawControl = draw;
    return draw;
}

function getDrawStyles() {
    // Custom MapboxDraw styles matching the app theme
    return [
        // Active polygon fill
        {
            id: 'gl-draw-polygon-fill-active',
            type: 'fill',
            filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
            paint: {
                'fill-color': '#4C9AFF',
                'fill-opacity': 0.15,
            },
        },
        // Active polygon outline
        {
            id: 'gl-draw-polygon-stroke-active',
            type: 'line',
            filter: ['all', ['==', '$type', 'Polygon'], ['!=', 'mode', 'static']],
            paint: {
                'line-color': '#4C9AFF',
                'line-width': 2,
            },
        },
        // Active line
        {
            id: 'gl-draw-line-active',
            type: 'line',
            filter: ['all', ['==', '$type', 'LineString'], ['!=', 'mode', 'static']],
            paint: {
                'line-color': '#FFD43B',
                'line-width': 3,
            },
        },
        // Active point (vertex)
        {
            id: 'gl-draw-point-active',
            type: 'circle',
            filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'vertex']],
            paint: {
                'circle-radius': 5,
                'circle-color': '#fff',
                'circle-stroke-color': '#4C9AFF',
                'circle-stroke-width': 2,
            },
        },
        // Active point (feature, not vertex)
        {
            id: 'gl-draw-point-feature-active',
            type: 'circle',
            filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'feature'], ['!=', 'mode', 'static']],
            paint: {
                'circle-radius': 7,
                'circle-color': '#4C9AFF',
                'circle-stroke-color': '#fff',
                'circle-stroke-width': 2,
            },
        },
        // Midpoints
        {
            id: 'gl-draw-point-midpoint',
            type: 'circle',
            filter: ['all', ['==', '$type', 'Point'], ['==', 'meta', 'midpoint']],
            paint: {
                'circle-radius': 3,
                'circle-color': '#4C9AFF',
            },
        },
    ];
}

// ========================================
// GPS Locate Me
// ========================================
export function initGPS(map) {
    const btn = document.getElementById('gps-btn');
    if (!btn) return;

    // MapLibre GeolocateControl for the actual geolocation
    const geolocate = new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: false,
        showAccuracyCircle: true,
        showUserLocation: true,
    });

    // We add the control but hide its default button (we use our own GPS button)
    map.addControl(geolocate, 'bottom-right');

    // Hide the built-in geolocate button after it's added to DOM
    map.on('load', () => {
        const geolocateEl = document.querySelector('.maplibregl-ctrl-geolocate');
        if (geolocateEl) geolocateEl.style.display = 'none';
    });

    btn.addEventListener('click', () => {
        btn.classList.add('locating');
        geolocate.trigger();
    });

    geolocate.on('geolocate', (e) => {
        btn.classList.remove('locating');
        btn.classList.add('located');
        setTimeout(() => btn.classList.remove('located'), 3000);

        // Store GPS position for route planning
        state.gpsPosition = { lat: e.coords.latitude, lng: e.coords.longitude };
    });

    geolocate.on('error', () => {
        btn.classList.remove('locating');
    });

    state.geolocateControl = geolocate;
}

// ========================================
// Feature Rendering
// ========================================

// Track all popup markers and geometry layers for cleanup
let featureMarkers = [];   // maplibregl.Marker instances for Point features
let featureLayers = [];     // { sourceId, layerIds } for line/polygon features
let featureLayerCounter = 0;

export function clearAllFeatures(map) {
    // Remove markers
    featureMarkers.forEach(m => m.remove());
    featureMarkers = [];

    // Remove line/polygon source+layers
    featureLayers.forEach(({ sourceId, layerIds }) => {
        layerIds.forEach(id => {
            if (map.getLayer(id)) map.removeLayer(id);
        });
        if (map.getSource(sourceId)) map.removeSource(sourceId);
    });
    featureLayers = [];

    // Remove cluster source/layers
    [CLUSTER_LAYER, CLUSTER_COUNT_LAYER, UNCLUSTERED_LAYER].forEach(id => {
        if (map.getLayer(id)) map.removeLayer(id);
    });
    if (map.getSource(CLUSTER_SOURCE)) map.removeSource(CLUSTER_SOURCE);

    // Remove heatmap
    if (map.getLayer(HEATMAP_LAYER)) map.removeLayer(HEATMAP_LAYER);
    if (map.getSource(HEATMAP_SOURCE)) map.removeSource(HEATMAP_SOURCE);

    // Remove route
    if (map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER);
    if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);

    // Remove route stop markers
    if (state._routeStopMarkers) {
        state._routeStopMarkers.forEach(m => m.remove());
        state._routeStopMarkers = [];
    }

    featureLayerCounter = 0;
}

/**
 * Render all features from all layers onto the map.
 * Points get individual markers with popups, plus a clustered source for visual clustering.
 * Lines/polygons get individual GeoJSON sources.
 */
export function renderAllFeatures(map, features, layerMap) {
    // --- Points: collect into cluster GeoJSON ---
    const pointGeoJSON = {
        type: 'FeatureCollection',
        features: [],
    };

    const renderedItems = []; // { feature, mapLayer/marker, layerId }

    features.forEach(feature => {
        const layer = layerMap[feature.layer_id];
        if (!layer || layer.visible === false) return;

        if (feature.geometry_type === 'Point' && feature.coordinates) {
            // Build a GeoJSON feature for the cluster source
            const gf = {
                type: 'Feature',
                geometry: {
                    type: 'Point',
                    coordinates: [feature.coordinates.lng, feature.coordinates.lat],
                },
                properties: {
                    _featureId: feature.id,
                    _layerId: feature.layer_id,
                    _color: layer.color || LAYER_COLORS[0],
                },
            };
            pointGeoJSON.features.push(gf);

            // Also create a Marker with a popup (for interaction)
            const marker = createFeatureMarker(feature, layer);
            marker.addTo(map);
            featureMarkers.push(marker);
            renderedItems.push({ feature, mapLayer: marker, layerId: layer.id });

        } else if (feature.geometry_type === 'LineString' && feature.coordinates) {
            const { sourceId, layerIds } = createFeaturePolyline(map, feature, layer);
            featureLayers.push({ sourceId, layerIds });
            renderedItems.push({ feature, mapLayer: null, layerId: layer.id });

        } else if (feature.geometry_type === 'Polygon' && feature.coordinates) {
            const { sourceId, layerIds } = createFeaturePolygon(map, feature, layer);
            featureLayers.push({ sourceId, layerIds });
            renderedItems.push({ feature, mapLayer: null, layerId: layer.id });
        }
    });

    // --- Add clustered source for point count display ---
    if (pointGeoJSON.features.length > 0 && !map.getSource(CLUSTER_SOURCE)) {
        map.addSource(CLUSTER_SOURCE, {
            type: 'geojson',
            data: pointGeoJSON,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: IS_LOW_END ? 80 : 60,
        });

        // Cluster circles
        map.addLayer({
            id: CLUSTER_LAYER,
            type: 'circle',
            source: CLUSTER_SOURCE,
            filter: ['has', 'point_count'],
            paint: {
                'circle-color': [
                    'step', ['get', 'point_count'],
                    '#4C9AFF', 10,
                    '#3b82f6', 50,
                    '#2563eb',
                ],
                'circle-radius': [
                    'step', ['get', 'point_count'],
                    18, 10,
                    22, 50,
                    26,
                ],
                'circle-stroke-width': 2,
                'circle-stroke-color': '#fff',
            },
        });

        // Cluster count labels
        map.addLayer({
            id: CLUSTER_COUNT_LAYER,
            type: 'symbol',
            source: CLUSTER_SOURCE,
            filter: ['has', 'point_count'],
            layout: {
                'text-field': '{point_count_abbreviated}',
                'text-size': 12,
            },
            paint: {
                'text-color': '#ffffff',
            },
        });

        // Click on cluster -> zoom in
        map.on('click', CLUSTER_LAYER, (e) => {
            const clusterFeatures = map.queryRenderedFeatures(e.point, { layers: [CLUSTER_LAYER] });
            const clusterId = clusterFeatures[0].properties.cluster_id;
            map.getSource(CLUSTER_SOURCE).getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                map.easeTo({ center: clusterFeatures[0].geometry.coordinates, zoom });
            });
        });

        map.on('mouseenter', CLUSTER_LAYER, () => { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', CLUSTER_LAYER, () => { map.getCanvas().style.cursor = ''; });
    }

    return renderedItems;
}

function createFeatureMarker(feature, layer) {
    const color = layer?.color || LAYER_COLORS[0];
    const icon = layer?.icon || '📍';
    const coords = feature.coordinates;

    // Create a circle marker element
    const el = document.createElement('div');
    el.className = 'maplibre-feature-marker';
    el.style.cssText = `
        width: 14px; height: 14px;
        background: ${color};
        border: 2px solid #fff;
        border-radius: 50%;
        cursor: pointer;
        box-shadow: 0 1px 4px rgba(0,0,0,0.3);
    `;

    const marker = new maplibregl.Marker({ element: el })
        .setLngLat([coords.lng, coords.lat]);

    // Build popup content (identical HTML to previous Leaflet version)
    const attrs = feature.attributes || {};
    const displayName = attrs.name || attrs.species || icon + ' Feature';
    const latStr = parseFloat(coords.lat).toFixed(6);
    const lngStr = parseFloat(coords.lng).toFixed(6);

    let attrHtml = '';
    if (layer?.schema) {
        layer.schema.forEach(field => {
            const val = attrs[field.key];
            if (val != null && val !== '') {
                attrHtml += `<span class="popup-label">${sanitize(field.label)}:</span> ${sanitize(val)}<br/>`;
            }
        });
    } else {
        Object.entries(attrs).forEach(([key, val]) => {
            if (val != null && val !== '') {
                attrHtml += `<span class="popup-label">${sanitize(key)}:</span> ${sanitize(val)}<br/>`;
            }
        });
    }

    let photoHtml = '';
    if (feature.photo_url) {
        photoHtml = `<img class="popup-photo" src="${sanitize(feature.photo_url)}" alt="Feature photo" loading="lazy"
            onclick="window.dispatchEvent(new CustomEvent('open-lightbox', {detail:'${sanitize(feature.photo_url)}'}))" />`;
    }

    let timeHtml = '';
    if (feature.created_at) {
        const date = new Date(feature.created_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
        timeHtml = `<div class="popup-timestamp">🕐 ${date}</div>`;
    }

    const isTreeLayer = layer?.name?.toLowerCase()?.includes('tree');
    const growthBtn = isTreeLayer
        ? `<button class="popup-growth-btn" onclick="window.dispatchEvent(new CustomEvent('show-growth', {detail:${feature.id}}))">📈 Growth</button>`
        : '';

    const popupContent = `
        <div>
            <div class="popup-header" style="border-left: 3px solid ${color}; padding-left: 8px; margin-bottom: 6px;">
                <strong style="font-size: 14px;">${sanitize(displayName)}</strong><br/>
                <small style="color: var(--text-muted);">${sanitize(layer?.name || 'Layer')}</small>
            </div>
            ${attrHtml}
            <span class="popup-label">Coordinates:</span>
            <span class="popup-coords" title="Click to copy" onclick="window.copyText('${latStr}, ${lngStr}')">
                ${latStr}, ${lngStr}
            </span><br/>
            ${photoHtml}
            ${timeHtml}
            <div class="popup-actions">
                <button class="popup-edit-btn" onclick="window.dispatchEvent(new CustomEvent('edit-feature', {detail:${feature.id}}))">✏️ Edit</button>
                ${growthBtn}
                <button class="popup-delete-btn" onclick="window.dispatchEvent(new CustomEvent('delete-feature', {detail:${feature.id}}))">🗑️ Delete</button>
            </div>
        </div>
    `;

    const popup = new maplibregl.Popup({ maxWidth: '280px', offset: 12 })
        .setHTML(popupContent);

    marker.setPopup(popup);

    // Store metadata on marker for lookup
    marker._featureId = feature.id;
    marker._layerId = layer?.id;

    return marker;
}

function createFeaturePolyline(map, feature, layer) {
    const color = layer?.color || '#FFD43B';
    const coords = feature.coordinates.map(c => [c.lng, c.lat]);
    const sourceId = `line-src-${feature.id}`;
    const lineLayerId = `line-layer-${feature.id}`;

    map.addSource(sourceId, {
        type: 'geojson',
        data: {
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
            properties: { _featureId: feature.id },
        },
    });

    map.addLayer({
        id: lineLayerId,
        type: 'line',
        source: sourceId,
        paint: {
            'line-color': color,
            'line-width': 3,
            'line-opacity': 0.8,
        },
    });

    // Popup on click
    const totalDist = calcTotalDistance(feature.coordinates);
    const attrs = feature.attributes || {};
    const displayName = attrs.name || '📏 Line';

    const popupHTML = `
        <div>
            <div class="popup-header" style="border-left: 3px solid ${color}; padding-left: 8px; margin-bottom: 6px;">
                <strong>${sanitize(displayName)}</strong><br/>
                <small style="color: var(--text-muted);">${sanitize(layer?.name || 'Layer')}</small>
            </div>
            <span class="popup-label">📏 Length:</span> ${formatDistance(totalDist)}<br/>
            <div class="popup-actions">
                <button class="popup-edit-btn" onclick="window.dispatchEvent(new CustomEvent('edit-feature', {detail:${feature.id}}))">✏️ Edit</button>
                <button class="popup-delete-btn" onclick="window.dispatchEvent(new CustomEvent('delete-feature', {detail:${feature.id}}))">🗑️ Delete</button>
            </div>
        </div>
    `;

    map.on('click', lineLayerId, (e) => {
        new maplibregl.Popup({ maxWidth: '260px' })
            .setLngLat(e.lngLat)
            .setHTML(popupHTML)
            .addTo(map);
    });

    map.on('mouseenter', lineLayerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', lineLayerId, () => { map.getCanvas().style.cursor = ''; });

    return { sourceId, layerIds: [lineLayerId] };
}

function createFeaturePolygon(map, feature, layer) {
    const color = layer?.color || '#4C9AFF';
    const coords = feature.coordinates.map(c => [c.lng, c.lat]);
    // Close the ring for GeoJSON
    const ring = [...coords, coords[0]];
    const sourceId = `poly-src-${feature.id}`;
    const fillLayerId = `poly-fill-${feature.id}`;
    const outlineLayerId = `poly-outline-${feature.id}`;

    map.addSource(sourceId, {
        type: 'geojson',
        data: {
            type: 'Feature',
            geometry: { type: 'Polygon', coordinates: [ring] },
            properties: { _featureId: feature.id },
        },
    });

    map.addLayer({
        id: fillLayerId,
        type: 'fill',
        source: sourceId,
        paint: {
            'fill-color': color,
            'fill-opacity': 0.15,
        },
    });

    map.addLayer({
        id: outlineLayerId,
        type: 'line',
        source: sourceId,
        paint: {
            'line-color': color,
            'line-width': 2,
            'line-dasharray': [3, 2],
        },
    });

    // Popup on click
    const area = calculatePolygonArea(feature.coordinates);
    const perimeter = calculatePolygonPerimeter(feature.coordinates);
    const attrs = feature.attributes || {};
    const displayName = attrs.name || '📐 Area';

    let timeHtml = '';
    if (feature.created_at) {
        const date = new Date(feature.created_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
        timeHtml = `<div class="popup-timestamp">🕐 ${date}</div>`;
    }

    const popupHTML = `
        <div>
            <div class="popup-header" style="border-left: 3px solid ${color}; padding-left: 8px; margin-bottom: 6px;">
                <strong>${sanitize(displayName)}</strong><br/>
                <small style="color: var(--text-muted);">${sanitize(layer?.name || 'Layer')}</small>
            </div>
            <div class="popup-stats">
                <span>📐 Area: ${formatArea(area)}</span><br/>
                <span>📏 Perimeter: ${formatPerimeter(perimeter)}</span>
            </div>
            ${timeHtml}
            <div class="popup-actions">
                <button class="popup-edit-btn" onclick="window.dispatchEvent(new CustomEvent('edit-feature', {detail:${feature.id}}))">✏️ Edit</button>
                <button class="popup-delete-btn" onclick="window.dispatchEvent(new CustomEvent('delete-feature', {detail:${feature.id}}))">🗑️ Delete</button>
            </div>
        </div>
    `;

    map.on('click', fillLayerId, (e) => {
        new maplibregl.Popup({ maxWidth: '260px' })
            .setLngLat(e.lngLat)
            .setHTML(popupHTML)
            .addTo(map);
    });

    map.on('mouseenter', fillLayerId, () => { map.getCanvas().style.cursor = 'pointer'; });
    map.on('mouseleave', fillLayerId, () => { map.getCanvas().style.cursor = ''; });

    return { sourceId, layerIds: [fillLayerId, outlineLayerId] };
}

function calcTotalDistance(coordinates) {
    let total = 0;
    for (let i = 0; i < coordinates.length - 1; i++) {
        const c1 = coordinates[i];
        const c2 = coordinates[i + 1];
        total += haversineDistance(c1.lat, c1.lng, c2.lat, c2.lng);
    }
    return total;
}

// ========================================
// Heatmap (Native MapLibre)
// ========================================
export function initHeatmap(map) {
    // Source created lazily in updateHeatmap
    return true; // just return truthy so the toggle logic works
}

export function updateHeatmap(map, features) {
    const points = features
        .filter(f => f.geometry_type === 'Point' && f.coordinates)
        .map(f => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [f.coordinates.lng, f.coordinates.lat],
            },
            properties: {},
        }));

    const geojson = { type: 'FeatureCollection', features: points };

    if (map.getSource(HEATMAP_SOURCE)) {
        map.getSource(HEATMAP_SOURCE).setData(geojson);
    } else {
        map.addSource(HEATMAP_SOURCE, {
            type: 'geojson',
            data: geojson,
        });
    }

    // Add the heatmap layer if it doesn't exist (hidden initially)
    if (!map.getLayer(HEATMAP_LAYER)) {
        map.addLayer({
            id: HEATMAP_LAYER,
            type: 'heatmap',
            source: HEATMAP_SOURCE,
            paint: {
                'heatmap-radius': 25,
                'heatmap-opacity': 0.7,
                'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0, 'rgba(0,0,0,0)',
                    0.2, '#4C9AFF',
                    0.4, '#51CF66',
                    0.6, '#FFD43B',
                    0.8, '#FF922B',
                    1.0, '#FF6B6B',
                ],
                'heatmap-intensity': 1,
            },
            layout: {
                visibility: 'none', // hidden by default
            },
        });
    }
}

export function toggleHeatmap(map, heatmapEnabled, show) {
    if (!map.getLayer(HEATMAP_LAYER)) return;
    map.setLayoutProperty(HEATMAP_LAYER, 'visibility', show ? 'visible' : 'none');
}

// ========================================
// Survey Route Drawing
// ========================================
export function drawSurveyRoute(map, orderedPlots) {
    if (!orderedPlots || orderedPlots.length === 0) return null;

    const coords = orderedPlots.map(p => [p.lng, p.lat]);

    // Add route line
    if (map.getSource(ROUTE_SOURCE)) {
        map.getSource(ROUTE_SOURCE).setData({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords },
        });
    } else {
        map.addSource(ROUTE_SOURCE, {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: coords },
            },
        });
    }

    if (!map.getLayer(ROUTE_LAYER)) {
        map.addLayer({
            id: ROUTE_LAYER,
            type: 'line',
            source: ROUTE_SOURCE,
            paint: {
                'line-color': '#FF922B',
                'line-width': 3,
                'line-opacity': 0.85,
                'line-dasharray': [2, 1.5],
            },
        });
    }

    // Add numbered stop markers
    const stopMarkers = [];
    orderedPlots.forEach((plot, idx) => {
        const el = document.createElement('div');
        el.className = 'route-stop-number';
        el.textContent = idx + 1;

        const marker = new maplibregl.Marker({ element: el })
            .setLngLat([plot.lng, plot.lat]);

        const distStr = plot.distFromPrev
            ? (plot.distFromPrev > 1000
                ? (plot.distFromPrev / 1000).toFixed(1) + ' km'
                : Math.round(plot.distFromPrev) + ' m')
            : '';

        const popup = new maplibregl.Popup({ offset: 18 })
            .setHTML(`
                <strong>Stop ${idx + 1}: ${sanitize(plot.name || 'Plot')}</strong>
                ${distStr ? `<br/><small>📏 ${distStr} from previous</small>` : ''}
            `);

        marker.setPopup(popup);
        marker.addTo(map);
        stopMarkers.push(marker);
    });

    state._routeStopMarkers = stopMarkers;

    // Fit map to route bounds
    if (coords.length > 1) {
        const bounds = coords.reduce(
            (b, c) => b.extend(c),
            new maplibregl.LngLatBounds(coords[0], coords[0])
        );
        map.fitBounds(bounds, { padding: 60, duration: 800 });
    }

    return 'route-active'; // return a truthy token for state tracking
}

export function clearSurveyRoute(map) {
    if (map.getLayer(ROUTE_LAYER)) map.removeLayer(ROUTE_LAYER);
    if (map.getSource(ROUTE_SOURCE)) map.removeSource(ROUTE_SOURCE);

    if (state._routeStopMarkers) {
        state._routeStopMarkers.forEach(m => m.remove());
        state._routeStopMarkers = [];
    }
}

// ========================================
// Highlight Tree (Fly-To + Pulse)
// ========================================
export function highlightTree(map, feature) {
    if (!feature?.coordinates) return;
    const { lat, lng } = feature.coordinates;

    map.flyTo({
        center: [lng, lat],
        zoom: 18,
        duration: 800,
    });

    // Pulse ring effect via a temporary marker
    const el = document.createElement('div');
    el.className = 'tree-highlight-pulse-marker';
    el.style.cssText = `
        width: 36px; height: 36px;
        border-radius: 50%;
        background: rgba(255,107,107,0.3);
        border: 2px solid #FF6B6B;
        pointer-events: none;
        animation: treePulseMarker 0.8s ease-out infinite;
    `;

    const pulseMarker = new maplibregl.Marker({ element: el })
        .setLngLat([lng, lat])
        .addTo(map);

    setTimeout(() => pulseMarker.remove(), 2500);
}

// ========================================
// Restore custom layers after style change
// ========================================
function restoreCustomLayers(map) {
    // After a style change, all custom sources/layers are removed.
    // We need to re-render features. Signal the app to reload data.
    if (state.appInitialized && state.activeProject && !state.isLoadingData) {
        window.dispatchEvent(new CustomEvent('maplibre-style-changed'));
    }
}

// ========================================
// Utility: close all popups (compatibility shim)
// ========================================
export function closeAllPopups(map) {
    // MapLibre popups auto-close when a new one opens via markers.
    // This is a no-op for compatibility with app.js.
}
