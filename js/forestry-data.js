// ========================================
// OpenGIS — Forestry Data Layer
// Supabase CRUD for species, measurements, survey_visits
// ========================================

import { supabase, state } from './config.js';

// ========================================
// Species CRUD
// ========================================

/** Load all species (shared reference data). */
export async function loadSpecies() {
    const { data, error } = await supabase
        .from('species')
        .select('*')
        .order('name', { ascending: true });
    if (error) throw error;
    return data || [];
}

/** Create a new species entry. */
export async function createSpecies(speciesData) {
    const { data, error } = await supabase
        .from('species')
        .insert([{ ...speciesData, created_by: state.currentUser.id }])
        .select();
    if (error) throw error;
    return data[0];
}

/** Update an existing species entry. */
export async function updateSpecies(id, updateData) {
    const { data, error } = await supabase
        .from('species')
        .update(updateData)
        .eq('id', id)
        .select();
    if (error) throw error;
    return data?.[0];
}

/** Delete a species entry. */
export async function deleteSpecies(id) {
    const { error } = await supabase
        .from('species')
        .delete()
        .eq('id', id);
    if (error) throw error;
}


// ========================================
// Measurements CRUD
// ========================================

/**
 * Load all measurements for a specific tree feature.
 * Returns chronologically ordered (oldest first).
 */
export async function loadMeasurements(featureId) {
    const { data, error } = await supabase
        .from('measurements')
        .select('*')
        .eq('feature_id', featureId)
        .order('measured_at', { ascending: true });
    if (error) throw error;
    return data || [];
}

/** Insert a new measurement for a tree. */
export async function insertMeasurement(measurementData) {
    const { data, error } = await supabase
        .from('measurements')
        .insert([{ ...measurementData, surveyor_id: state.currentUser.id }])
        .select();
    if (error) throw error;
    return data[0];
}

/** Update an existing measurement. */
export async function updateMeasurement(id, updateData) {
    const { data, error } = await supabase
        .from('measurements')
        .update(updateData)
        .eq('id', id)
        .select();
    if (error) throw error;
    return data?.[0];
}

/** Delete a measurement. */
export async function deleteMeasurement(id) {
    const { error } = await supabase
        .from('measurements')
        .delete()
        .eq('id', id);
    if (error) throw error;
}


// ========================================
// Survey Visits CRUD
// ========================================

/** Load all survey visits for a project. */
export async function loadSurveyVisits(projectId) {
    const { data, error } = await supabase
        .from('survey_visits')
        .select('*')
        .eq('project_id', projectId)
        .order('visit_date', { ascending: false });
    if (error) throw error;
    return data || [];
}

/** Create a new survey visit record. */
export async function createSurveyVisit(visitData) {
    const { data, error } = await supabase
        .from('survey_visits')
        .insert([{ ...visitData, user_id: state.currentUser.id }])
        .select();
    if (error) throw error;
    return data[0];
}

/** Delete a survey visit. */
export async function deleteSurveyVisit(id) {
    const { error } = await supabase
        .from('survey_visits')
        .delete()
        .eq('id', id);
    if (error) throw error;
}


// ========================================
// Composite Queries
// ========================================

/**
 * Load all tree features in a project together with their measurements and
 * species data. This powers the risk-ranking algorithm.
 *
 * Returns an array of:
 *   { feature, measurements: [...], species: {...} | null }
 *
 * "Trees" are identified as Point features in layers named "Trees" (case-
 * insensitive), matching the Forestry project template convention.
 */
export async function loadTreesWithMeasurements(projectId) {
    // 1. Find the "Trees" layer(s) in this project
    const treeLayers = state.layers.filter(
        l => l.name.toLowerCase() === 'trees' && l.geometry_type === 'Point'
    );
    if (treeLayers.length === 0) return [];

    const treeLayerIds = treeLayers.map(l => l.id);

    // 2. Get all tree features
    const treeFeatures = state.allFeatures
        .filter(f => treeLayerIds.includes(f.feature.layer_id))
        .map(f => f.feature);

    if (treeFeatures.length === 0) return [];

    // 3. Load all measurements for these trees in a single query
    const featureIds = treeFeatures.map(f => f.id);
    const { data: allMeasurements, error: mErr } = await supabase
        .from('measurements')
        .select('*')
        .in('feature_id', featureIds)
        .order('measured_at', { ascending: true });
    if (mErr) throw mErr;

    // 4. Load species lookup (cached in state if already loaded)
    let speciesMap = state.speciesMap;
    if (!speciesMap) {
        const speciesList = await loadSpecies();
        speciesMap = {};
        speciesList.forEach(s => { speciesMap[s.id] = s; });
        state.speciesMap = speciesMap;
    }

    // 5. Group measurements by feature_id
    const measurementsByTree = {};
    (allMeasurements || []).forEach(m => {
        if (!measurementsByTree[m.feature_id]) {
            measurementsByTree[m.feature_id] = [];
        }
        measurementsByTree[m.feature_id].push(m);
    });

    // 6. Assemble result
    return treeFeatures.map(feature => ({
        feature,
        measurements: measurementsByTree[feature.id] || [],
        species: feature.species_id ? (speciesMap[feature.species_id] || null) : null,
    }));
}

/**
 * Get the growth history for a single tree: its chronologically ordered
 * measurements plus species info.
 */
export async function getTreeGrowthHistory(featureId) {
    const measurements = await loadMeasurements(featureId);

    // Get the feature from state to find species_id
    const item = state.allFeatures.find(f => f.feature.id === featureId);
    let species = null;
    if (item?.feature?.species_id && state.speciesMap) {
        species = state.speciesMap[item.feature.species_id] || null;
    }

    return { measurements, species };
}

/**
 * Load sample plots for a project (Polygon features in "Sample Plots" layers).
 * Returns array of { id, lat, lng, name } with centroids computed.
 */
export function getPlotCentroids() {
    const plotLayers = state.layers.filter(
        l => l.name.toLowerCase().includes('plot') && l.geometry_type === 'Polygon'
    );
    if (plotLayers.length === 0) return [];

    const plotLayerIds = plotLayers.map(l => l.id);

    return state.allFeatures
        .filter(f => plotLayerIds.includes(f.feature.layer_id))
        .map(f => {
            const coords = f.feature.coordinates;
            // Compute centroid of the polygon
            let latSum = 0, lngSum = 0;
            const n = Array.isArray(coords) ? coords.length : 0;
            if (n === 0) return null;
            coords.forEach(c => {
                latSum += c.lat || 0;
                lngSum += c.lng || 0;
            });
            return {
                id: f.feature.id,
                lat: latSum / n,
                lng: lngSum / n,
                name: f.feature.attributes?.name || `Plot ${f.feature.id}`,
                feature: f.feature,
            };
        })
        .filter(Boolean);
}
