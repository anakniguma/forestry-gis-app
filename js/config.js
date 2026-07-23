// ========================================
// OpenGIS — Configuration
// ========================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Supabase Configuration
export const SUPABASE_URL = 'https://btwvxrnrteyzugqjqppj.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0d3Z4cm5ydGV5enVncWpxcHBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjkyNDgsImV4cCI6MjA5NTU0NTI0OH0.zJwfIPTQwWUdQXMa37uuU0A2eX_jFm8QyH_b_ibmls4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// App Constants
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_PHOTO_WIDTH = 1200; // px — smaller for low-end devices
export const PHOTO_QUALITY = 0.7; // more aggressive compression
export const SEARCH_DEBOUNCE_MS = 600;
export const PAGE_SIZE = 100;
export const MAX_TILE_CACHE = 500;

// Map defaults (Philippines center)
export const DEFAULT_CENTER = [14.0, 121.0];
export const DEFAULT_ZOOM = 10;

// Layer color palette — vibrant, accessible, distinct
export const LAYER_COLORS = [
    '#4C9AFF', // blue
    '#FF6B6B', // red
    '#51CF66', // green
    '#FFD43B', // yellow
    '#CC5DE8', // purple
    '#FF922B', // orange
    '#20C997', // teal
    '#F06595', // pink
    '#748FFC', // indigo
    '#FFA94D', // amber
    '#69DB7C', // lime
    '#339AF0', // sky
];

// Layer icon options
export const LAYER_ICONS = [
    '📍', '🏠', '🌳', '🏗️', '🚗', '⚡', '💧', '🏥',
    '🏫', '⛪', '🏭', '🌾', '🛣️', '🌊', '⛰️', '📡',
    '🔥', '🚧', '🏞️', '🗼', '🎯', '⭐', '🔵', '🟢',
];

// Geometry types
export const GEOMETRY_TYPES = {
    POINT: 'Point',
    LINE: 'LineString',
    POLYGON: 'Polygon',
};

// Default attribute schema for new layers
export const DEFAULT_SCHEMA = [
    { key: 'name', label: 'Name', type: 'text', required: true },
    { key: 'description', label: 'Description', type: 'textarea', required: false },
];

// Forestry template schema (preserved as template)
export const FORESTRY_TREE_SCHEMA = [
    { key: 'species', label: 'Species', type: 'text', required: false },
    { key: 'dbh', label: 'DBH (cm)', type: 'number', required: false, min: 0, max: 500, step: 0.1 },
    { key: 'height', label: 'Height (m)', type: 'number', required: false, min: 0, max: 150, step: 0.1 },
    { key: 'elevation', label: 'Elevation (m)', type: 'number', required: false, readonly: true },
    { key: 'health', label: 'Health Status', type: 'select', required: false, options: ['Healthy', 'Diseased', 'Dead', 'Stressed'] },
    { key: 'notes', label: 'Notes', type: 'textarea', required: false },
];

export const FORESTRY_PLOT_SCHEMA = [
    { key: 'name', label: 'Plot Name', type: 'text', required: false },
    { key: 'notes', label: 'Notes', type: 'textarea', required: false },
];

// Tree Growth Monitoring constants
export const HEALTH_STATUSES = ['Healthy', 'Stressed', 'Diseased', 'Dead'];

export const RISK_THRESHOLDS = {
    low: 25,
    medium: 50,
    high: 75,
};

export const CONSERVATION_STATUSES = ['LC', 'NT', 'VU', 'EN', 'CR', 'EW', 'EX', 'DD'];

// Low-end device detection
export const IS_LOW_END = (() => {
    try {
        const cores = navigator.hardwareConcurrency || 4;
        const memory = navigator.deviceMemory || 4; // GB
        return cores <= 2 || memory <= 2;
    } catch (e) {
        return false;
    }
})();

// Apply reduce-motion class for low-end devices
if (IS_LOW_END) {
    document.documentElement.classList.add('reduce-motion');
}

// Shared Application State
export const state = {
    // Map
    map: null,
    drawnItems: null,
    drawControl: null,
    currentLayer: null,
    currentDrawType: null,
    markerClusterGroup: null,
    heatLayer: null,
    searchMarker: null,
    gpsCircle: null,
    gpsMarker: null,

    // Auth
    currentUser: null,
    appInitialized: false,

    // Projects
    projects: [],
    activeProject: null,

    // Layers & Features
    layers: [],          // layer objects from DB
    activeLayerId: null,  // currently selected layer for adding features
    layerGroups: {},      // { layerId: L.featureGroup }
    allFeatures: [],      // { feature, marker/polygon/polyline, layerId }

    // Dashboard
    chartInstance: null,

    // UI state
    editingFeatureId: null,
    deferredInstallPrompt: null,
    realtimeChannel: null,
    isLoadingData: false,

    // Forestry — Growth Monitoring
    surveyRouteLayer: null,       // L.polyline drawn on map for planned route
    priorityTrees: [],            // Ranked tree risk objects from rankTreesByRisk()
    speciesMap: null,             // { speciesId: speciesObj } cache
    speciesList: [],              // All species from DB
    currentGrowthFeatureId: null, // Feature ID whose growth history panel is open
    growthChartInstance: null,    // Chart.js instance for growth history
};
