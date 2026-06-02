// ========================================
// Forestry Tree Mapper — Map Module
// ========================================

import { state, HEALTH_COLORS, DEFAULT_CENTER, DEFAULT_ZOOM } from './config.js';
import {
    sanitize, calculateBasalArea, calculateVolume, formatNumber,
    formatArea, formatPerimeter, calculatePolygonArea, calculatePolygonPerimeter,
    countTreesInPolygon, treeIdToCode
} from './utils.js';

// --- Map Initialization ---
export function initMap(elementId) {
    const map = L.map(elementId, {
        zoomControl: false // We'll add it manually for better positioning
    }).setView(DEFAULT_CENTER, DEFAULT_ZOOM);

    // Add zoom control to top-right
    L.control.zoom({ position: 'topright' }).addTo(map);

    state.map = map;
    return map;
}

// --- Tile Layers (#8) ---
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

    // Default to OSM
    osm.addTo(map);

    const baseLayers = {
        '🗺️ Street Map': osm,
        '🛰️ Satellite': satellite,
        '🌑 Dark Mode': dark
    };

    L.control.layers(baseLayers, null, { position: 'topright' }).addTo(map);

    return { osm, satellite, dark };
}

// --- Draw Controls ---
export function addDrawControls(map, drawnItems) {
    const drawControl = new L.Control.Draw({
        draw: {
            polygon: {
                allowIntersection: false,
                shapeOptions: {
                    color: '#7ddf7e',
                    weight: 2,
                    fillColor: '#2d6a2e',
                    fillOpacity: 0.2
                }
            },
            polyline: false,
            rectangle: false,
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

// --- GPS Locate Me (#6) ---
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

        // Remove old GPS markers
        if (state.gpsCircle) map.removeLayer(state.gpsCircle);
        if (state.gpsMarker) map.removeLayer(state.gpsMarker);

        state.gpsCircle = L.circle(e.latlng, {
            radius: e.accuracy / 2,
            color: '#5cb85c',
            fillColor: '#5cb85c',
            fillOpacity: 0.1,
            weight: 1
        }).addTo(map);

        state.gpsMarker = L.circleMarker(e.latlng, {
            radius: 8,
            fillColor: '#5cb85c',
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

// --- Color-Coded Tree Markers (#7) ---
export function createTreeMarker(tree, callbacks = {}) {
    const health = tree.health || 'Healthy';
    const colors = HEALTH_COLORS[health] || HEALTH_COLORS.Healthy;

    const marker = L.circleMarker([tree.latitude, tree.longitude], {
        radius: 8,
        fillColor: colors.fill,
        fillOpacity: 0.9,
        color: colors.stroke,
        weight: 2
    });

    marker.databaseId = tree.id;
    marker.layerType = 'tree';
    marker.treeData = tree;

    // Build popup content with sanitization (#26)
    const healthClass = health.toLowerCase();
    const ba = calculateBasalArea(tree.dbh);
    const vol = calculateVolume(tree.dbh, tree.height);

    const latStr = tree.latitude ? parseFloat(tree.latitude).toFixed(6) : '0.000000';
    const lngStr = tree.longitude ? parseFloat(tree.longitude).toFixed(6) : '0.000000';

    let photoHtml = '';
    if (tree.photo_url) {
        photoHtml = `<img class="popup-photo" src="${sanitize(tree.photo_url)}" alt="Tree photo"
            onclick="window.dispatchEvent(new CustomEvent('open-lightbox', {detail:'${sanitize(tree.photo_url)}'}))" />`;
    }

    // Timeline (#18)
    let timeHtml = '';
    if (tree.created_at) {
        const date = new Date(tree.created_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
        timeHtml = `<div class="popup-timestamp">🕐 Added ${date}</div>`;
    }

    const popupContent = `
        <div>
            <span class="popup-label">Tree Code:</span> <strong style="color: #7ddf7e; cursor: pointer; text-decoration: underline dotted;" onclick="window.copyText('${treeIdToCode(tree.id)}', 'Tree Code')">${treeIdToCode(tree.id)}</strong><br/>
            <span class="popup-label">Species:</span> ${sanitize(tree.species || 'Unknown')}<br/>
            <span class="popup-label">DBH:</span> ${sanitize(tree.dbh || 0)} cm<br/>
            <span class="popup-label">Height:</span> ${sanitize(tree.height || 0)} m<br/>
            <span class="popup-label">Health:</span>
            <span class="popup-health ${healthClass}">${sanitize(health)}</span><br/>
            <span class="popup-label">Coordinates:</span>
            <span class="popup-coords" title="Click to copy" onclick="window.copyText('${latStr}, ${lngStr}')">
                ${latStr}, ${lngStr}
            </span><br/>
            ${tree.notes ? '<small>' + sanitize(tree.notes) + '</small><br/>' : ''}
            <div class="popup-stats">
                <span>📐 BA: ${formatNumber(ba, 4)} m²</span>
                <span>📦 Vol: ${formatNumber(vol, 3)} m³</span>
            </div>
            ${photoHtml}
            ${timeHtml}
            <div class="popup-actions">
                <button class="popup-edit-btn" onclick="window.dispatchEvent(new CustomEvent('edit-tree', {detail:${tree.id}}))">✏️ Edit</button>
                <button class="popup-delete-btn" onclick="window.dispatchEvent(new CustomEvent('delete-tree', {detail:${tree.id}}))">🗑️ Delete</button>
            </div>
            <div class="popup-actions" style="margin-top:4px">
                <button class="popup-qr-btn" onclick="window.dispatchEvent(new CustomEvent('qr-tree', {detail:${tree.id}}))">🏷️ QR Tag</button>
            </div>
        </div>
    `;

    marker.bindPopup(popupContent, { maxWidth: 280 });

    return marker;
}

// --- Marker Clustering (#19) ---
export function createClusterGroup() {
    if (typeof L.markerClusterGroup !== 'function') {
        console.warn('MarkerCluster plugin not loaded');
        return null;
    }

    const group = L.markerClusterGroup({
        chunkedLoading: true,
        maxClusterRadius: 60,
        spiderfyOnMaxZoom: true,
        showCoverageOnHover: false,
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

// --- Heatmap (#13) ---
export function initHeatmap(map) {
    if (typeof L.heatLayer !== 'function') {
        console.warn('Leaflet.heat plugin not loaded');
        return null;
    }

    const layer = L.heatLayer([], {
        radius: 25,
        blur: 15,
        maxZoom: 15,
        gradient: { 0.2: '#2d6a2e', 0.4: '#5cb85c', 0.6: '#7ddf7e', 0.8: '#ffcc66', 1.0: '#ff6644' }
    });

    return layer;
}

export function updateHeatmap(heatLayer, trees) {
    if (!heatLayer) return;
    const points = trees.map(t => [t.latitude, t.longitude, 1]);
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

// --- Plot Polygon (#14 measurements) ---
export function createPlotPolygon(plot, allTrees = []) {
    const coords = plot.coordinates.map(c => [c.lat, c.lng]);
    const polygon = L.polygon(coords, {
        color: '#7ddf7e',
        weight: 2,
        fillColor: '#2d6a2e',
        fillOpacity: 0.15,
        dashArray: '6, 4'
    });

    polygon.databaseId = plot.id;
    polygon.layerType = 'plot';
    polygon.plotData = plot;

    // Calculate measurements (#14)
    const area = calculatePolygonArea(plot.coordinates);
    const perimeter = calculatePolygonPerimeter(plot.coordinates);
    const treesInPlot = countTreesInPolygon(allTrees, plot.coordinates);

    // Timeline (#18)
    let timeHtml = '';
    if (plot.created_at) {
        const date = new Date(plot.created_at).toLocaleDateString('en-US', {
            year: 'numeric', month: 'short', day: 'numeric'
        });
        timeHtml = `<div class="popup-timestamp">🕐 Created ${date}</div>`;
    }

    polygon.bindPopup(`
        <div>
            <span class="popup-label">Plot:</span> ${sanitize(plot.name || 'Unnamed')}<br/>
            ${plot.notes ? '<small>' + sanitize(plot.notes) + '</small><br/>' : ''}
            <div class="popup-stats">
                <span>📐 Area: ${formatArea(area)}</span><br/>
                <span>📏 Perimeter: ${formatPerimeter(perimeter)}</span><br/>
                <span>🌳 Trees inside: ${treesInPlot.length}</span>
            </div>
            ${timeHtml}
        </div>
    `, { maxWidth: 260 });

    return polygon;
}

// --- Viewport-Based Rendering (#36) ---
export function getVisibleTrees(map, allTreeMarkers) {
    if (!map) return allTreeMarkers;
    const bounds = map.getBounds();
    return allTreeMarkers.filter(({ tree }) =>
        bounds.contains([tree.latitude, tree.longitude])
    );
}
