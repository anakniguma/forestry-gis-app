// ========================================
// Forestry Tree Mapper — Configuration
// ========================================

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Supabase Configuration
export const SUPABASE_URL = 'https://btwvxrnrteyzugqjqppj.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImJ0d3Z4cm5ydGV5enVncWpxcHBqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk5NjkyNDgsImV4cCI6MjA5NTU0NTI0OH0.zJwfIPTQwWUdQXMa37uuU0A2eX_jFm8QyH_b_ibmls4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// App Constants
export const MAX_PHOTO_SIZE = 5 * 1024 * 1024; // 5 MB
export const MAX_PHOTO_WIDTH = 1600; // px for compression
export const PHOTO_QUALITY = 0.8;
export const SEARCH_DEBOUNCE_MS = 600;
export const PAGE_SIZE = 100;
export const MAX_TILE_CACHE = 500;

// Map defaults
export const DEFAULT_CENTER = [14.0, 121.0];
export const DEFAULT_ZOOM = 10;

// Health status config
export const HEALTH_COLORS = {
    Healthy: { fill: '#2d8a2e', stroke: '#7ddf7e', bg: 'rgba(45,106,46,0.7)' },
    Diseased: { fill: '#b48228', stroke: '#ffcc66', bg: 'rgba(180,130,40,0.7)' },
    Dead: { fill: '#c8503c', stroke: '#ff8a7a', bg: 'rgba(220,80,60,0.7)' }
};

// Shared Application State
export const state = {
    map: null,
    drawnItems: null,
    drawControl: null,
    currentLayer: null,
    currentDrawType: null,
    allTreeMarkers: [],
    allPlotPolygons: [],
    allSpecies: new Set(),
    currentUser: null,
    appInitialized: false,
    markerClusterGroup: null,
    heatLayer: null,
    searchMarker: null,
    editingTreeId: null,
    gpsCircle: null,
    gpsMarker: null,
    speciesChartInstance: null,
    healthChartInstance: null,
    deferredInstallPrompt: null,
    realtimeChannel: null,
    treesPage: 0,
    allTreesLoaded: false,
    isLoadingData: false
};
