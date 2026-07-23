// ========================================
// OpenGIS — Map Module
// ========================================

import { state, DEFAULT_CENTER, DEFAULT_ZOOM, LAYER_COLORS, IS_LOW_END } from './config.js';
import {
    sanitize, formatArea, formatPerimeter, formatDistance, formatNumber,
    calculatePolygonArea, calculatePolygonPerimeter,
    haversineDistance, featureIdToCode
} from './utils.js';

// --- Map Initialization ---
export function initMap(elementId) {
    const map = L.map(elementId, {
        zoomControl: false,
        preferCanvas: true, // Canvas rendering — critical for low-end devices
        maxBoundsViscosity: 1.0,
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    L.control.zoom({ position: 'topright' }).addTo(map);

    state.map = map;
    return map;
}

// --- Tile Layers ---
export function addTileLayers(map) {
    const osm = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        maxZoom: 19
    });

    const satellite = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: '&copy; Esri',
        maxZoom: 19
    });

    const dark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; CartoDB',
        maxZoom: 19
    });

    const topo = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: &copy; OpenStreetMap, SRTM | Style: &copy; OpenTopoMap',
        maxNativeZoom: 17,
        maxZoom: 19
    });

    osm.addTo(map);

    const baseLayers = {
        '🗺️ Street Map': osm,
        '🛰️ Satellite': satellite,
        '⛰️ Topographic': topo,
        '🌑 Dark Mode': dark
    };

    L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);

    return { osm, satellite, topo, dark };
}

// --- Draw Controls ---
export function addDrawControls(map, drawnItems) {
    const drawControl = new L.Control.Draw({
        draw: {
            polygon: {
                allowIntersection: false,
                shapeOptions: { color: '#4C9AFF', weight: 2, fillColor: '#4C9AFF', fillOpacity: 0.15 }
            },
            polyline: {
                shapeOptions: { color: '#FFD43B', weight: 3 }
            },
            rectangle: {
                shapeOptions: { color: '#CC5DE8', weight: 2, fillColor: '#CC5DE8', fillOpacity: 0.15 }
            },
            circle: false,
            circlemarker: false,
            marker: true,
        },
        edit: {
            featureGroup: drawnItems,
            remove: true
        }
    });
    map.addControl(drawControl);
    state.drawControl = drawControl;
    return drawControl;
}

// --- GPS Locate Me ---
export function initGPS(map) {
    const btn = document.getElementById('gps-btn');
    if (!btn) return;

    btn.addEventListener('click', () => {
        btn.classList.add('locating');
        map.locate({ setView: true, maxZoom: 16, enableHighAccuracy: true });
    });

    map.on('locationfound', (e) => {
        btn.classList.remove('locating');
        btn.classList.add('located');
        setTimeout(() => btn.classList.remove('located'), 3000);

        if (state.gpsCircle) map.removeLayer(state.gpsCircle);
        if (state.gpsMarker) map.removeLayer(state.gpsMarker);

        state.gpsCircle = L.circle(e.latlng, {
            radius: e.accuracy / 2,
            color: '#4C9AFF',
            fillColor: '#4C9AFF',
            fillOpacity: 0.1,
            weight: 1
        }).addTo(map);

        state.gpsMarker = L.circleMarker(e.latlng, {
            radius: 8,
            fillColor: '#4C9AFF',
            fillOpacity: 1,
            color: '#fff',
            weight: 2
        }).addTo(map);

        state.gpsMarker.bindPopup('<span class="popup-label">📍 Your Location</span>').openPopup();
    });

    map.on('locationerror', () => {
        btn.classList.remove('locating');
    });
}

// --- Feature Rendering ---

export function createFeatureMarker(feature, layer) {
    const color = layer?.color || LAYER_COLORS[0];
    const icon = layer?.icon || '📍';
    const coords = feature.coordinates;

    const marker = L.circleMarker([coords.lat, coords.lng], {
        radius: 7,
        fillColor: color,
        fillOpacity: 0.85,
        color: '#fff',
        weight: 2
    });

    marker.databaseId = feature.id;
    marker.layerType = 'feature';
    marker.featureData = feature;
    marker.layerData = layer;

    // Build popup
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
        // Display all attributes
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

    // Show "Growth" button only for tree-layer features (by layer name convention)
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

    marker.bindPopup(popupContent, { maxWidth: 280 });
    return marker;
}

export function createFeaturePolyline(feature, layer) {
    const color = layer?.color || '#FFD43B';
    const coords = feature.coordinates.map(c => [c.lat, c.lng]);

    const polyline = L.polyline(coords, {
        color,
        weight: 3,
        opacity: 0.8,
    });

    polyline.databaseId = feature.id;
    polyline.layerType = 'feature';
    polyline.featureData = feature;
    polyline.layerData = layer;

    // Calc length
    let totalDist = 0;
    for (let i = 0; i < feature.coordinates.length - 1; i++) {
        const c1 = feature.coordinates[i];
        const c2 = feature.coordinates[i + 1];
        totalDist += haversineDistance(c1.lat, c1.lng, c2.lat, c2.lng);
    }

    const attrs = feature.attributes || {};
    const displayName = attrs.name || '📏 Line';

    polyline.bindPopup(`
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
    `, { maxWidth: 260 });

    return polyline;
}

export function createFeaturePolygon(feature, layer) {
    const color = layer?.color || '#4C9AFF';
    const coords = feature.coordinates.map(c => [c.lat, c.lng]);

    const polygon = L.polygon(coords, {
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.15,
        dashArray: '6, 4'
    });

    polygon.databaseId = feature.id;
    polygon.layerType = 'feature';
    polygon.featureData = feature;
    polygon.layerData = layer;

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

    polygon.bindPopup(`
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
    `, { maxWidth: 260 });

    return polygon;
}

// --- Marker Clustering ---
export function createClusterGroup() {
    if (typeof L.markerClusterGroup !== 'function') {
        console.warn('MarkerCluster plugin not loaded');
        return null;
    }

    const group = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: IS_LOW_END ? 80 : 60, // Larger radius on low-end = fewer clusters to render
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
        animate: !IS_LOW_END, // Disable animation on low-end devices
        iconCreateFunction: (cluster) => {
            const count = cluster.getChildCount();
            let size = 'small';
            if (count > 50) size = 'large';
            else if (count > 10) size = 'medium';

            return L.divIcon({
                html: `<div>${count}</div>`,
                className: `marker-cluster marker-cluster-${size}`,
                iconSize: L.point(40, 40)
            });
        }
    });

    return group;
}

// --- Heatmap ---
export function initHeatmap(map) {
    if (typeof L.heatLayer !== 'function') {
        console.warn('Leaflet.heat plugin not loaded');
        return null;
    }

    const layer = L.heatLayer([], {
        radius: 25,
        blur: 15,
        maxZoom: 15,
        gradient: { 0.2: '#4C9AFF', 0.4: '#51CF66', 0.6: '#FFD43B', 0.8: '#FF922B', 1.0: '#FF6B6B' }
    });

    return layer;
}

export function updateHeatmap(heatLayer, features) {
    if (!heatLayer) return;
    const points = features
        .filter(f => f.geometry_type === 'Point' && f.coordinates)
        .map(f => [f.coordinates.lat, f.coordinates.lng, 1]);
    heatLayer.setLatLngs(points);
}

export function toggleHeatmap(map, heatLayer, show) {
    if (!heatLayer) return;
    if (show) {
        heatLayer.addTo(map);
    } else {
        map.removeLayer(heatLayer);
    }
}

// --- Create a Leaflet layer for a feature based on geometry type ---
export function createMapLayer(feature, layer) {
    if (feature.geometry_type === 'Point') {
        return createFeatureMarker(feature, layer);
    } else if (feature.geometry_type === 'LineString') {
        return createFeaturePolyline(feature, layer);
    } else if (feature.geometry_type === 'Polygon') {
        return createFeaturePolygon(feature, layer);
    }
    return null;
}


// ========================================
// Survey Route Drawing
// ========================================

/**
 * Draw an animated dashed polyline connecting the ordered plots.
 * @param {L.Map} map
 * @param {Array<{lat, lng, name, distFromPrev?}>} orderedPlots
 * @returns {L.LayerGroup} The route layer group (polyline + numbered markers)
 */
export function drawSurveyRoute(map, orderedPlots) {
    if (!orderedPlots || orderedPlots.length === 0) return null;

    const group = L.layerGroup();
    const latlngs = orderedPlots.map(p => [p.lat, p.lng]);

    // Animated dashed polyline
    const polyline = L.polyline(latlngs, {
        color: '#FF922B',
        weight: 3,
        opacity: 0.85,
        dashArray: '10, 8',
        className: 'survey-route-line', // For CSS animation
    });
    group.addLayer(polyline);

    // Numbered stop markers
    orderedPlots.forEach((plot, idx) => {
        const marker = L.marker([plot.lat, plot.lng], {
            icon: L.divIcon({
                className: 'survey-route-marker',
                html: `<div class="route-stop-number">${idx + 1}</div>`,
                iconSize: [28, 28],
                iconAnchor: [14, 14],
            }),
        });

        const distStr = plot.distFromPrev
            ? (plot.distFromPrev > 1000
                ? (plot.distFromPrev / 1000).toFixed(1) + ' km'
                : Math.round(plot.distFromPrev) + ' m')
            : '';

        marker.bindPopup(`
            <strong>Stop ${idx + 1}: ${sanitize(plot.name || 'Plot')}</strong>
            ${distStr ? `<br/><small>📏 ${distStr} from previous</small>` : ''}
        `);

        group.addLayer(marker);
    });

    group.addTo(map);

    // Fit map to route bounds
    if (latlngs.length > 1) {
        map.fitBounds(L.latLngBounds(latlngs).pad(0.15));
    }

    return group;
}

/**
 * Remove the survey route layer from the map.
 */
export function clearSurveyRoute(map, routeLayer) {
    if (routeLayer) {
        map.removeLayer(routeLayer);
    }
}

/**
 * Fly to a specific tree and briefly pulse-highlight it.
 */
export function highlightTree(map, feature) {
    if (!feature?.coordinates) return;
    const { lat, lng } = feature.coordinates;

    map.flyTo([lat, lng], 18, { duration: 0.8 });

    // Pulse ring effect
    const pulse = L.circleMarker([lat, lng], {
        radius: 18,
        fillColor: '#FF6B6B',
        fillOpacity: 0.3,
        color: '#FF6B6B',
        weight: 2,
        className: 'tree-highlight-pulse',
    }).addTo(map);

    // Remove after animation
    setTimeout(() => map.removeLayer(pulse), 2500);
}
