// ========================================
// OpenGIS — Data Layer
// ========================================

import { supabase, state, PAGE_SIZE, MAX_PHOTO_WIDTH, PHOTO_QUALITY, LAYER_COLORS, DEFAULT_SCHEMA } from './config.js';
import { compressImage, featuresToCSV, featuresToGeoJSON, featuresToKML, downloadFile, parseCSVImport, generateShareToken } from './utils.js';

// --- Photo Upload with Compression ---
export async function uploadPhoto(file) {
    let processedFile = file;
    try {
        processedFile = await compressImage(file, MAX_PHOTO_WIDTH, PHOTO_QUALITY);
    } catch (e) {
        console.warn('Photo compression failed, using original:', e);
    }

    const ext = file.name.split('.').pop();
    const fileName = `${state.currentUser.id}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage
        .from('feature-photos')
        .upload(fileName, processedFile, {
            cacheControl: '3600',
            upsert: false
        });

    if (error) {
        // Fallback to old bucket name if new one doesn't exist yet
        const { data: data2, error: error2 } = await supabase.storage
            .from('tree-photos')
            .upload(fileName, processedFile, {
                cacheControl: '3600',
                upsert: false
            });
        if (error2) throw error2;
        const { data: urlData2 } = supabase.storage.from('tree-photos').getPublicUrl(fileName);
        return urlData2.publicUrl;
    }

    const { data: urlData } = supabase.storage.from('feature-photos').getPublicUrl(fileName);
    return urlData.publicUrl;
}

// ========================================
// Project CRUD
// ========================================
export async function loadProjects() {
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('updated_at', { ascending: false });
    if (error) throw error;
    return data || [];
}

export async function createProject(projectData) {
    const { data, error } = await supabase
        .from('projects')
        .insert([{ ...projectData, user_id: state.currentUser.id }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function updateProject(id, updateData) {
    const { data, error } = await supabase
        .from('projects')
        .update(updateData)
        .eq('id', id)
        .select();
    if (error) throw error;
    return data?.[0];
}

export async function deleteProject(id) {
    const { error } = await supabase
        .from('projects')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// ========================================
// Layer CRUD
// ========================================
export async function loadLayers(projectId) {
    const { data, error } = await supabase
        .from('layers')
        .select('*')
        .eq('project_id', projectId)
        .order('order_index', { ascending: true });
    if (error) throw error;
    return data || [];
}

export async function createLayer(layerData) {
    const { data, error } = await supabase
        .from('layers')
        .insert([{ ...layerData, user_id: state.currentUser.id }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function updateLayer(id, updateData) {
    const { data, error } = await supabase
        .from('layers')
        .update(updateData)
        .eq('id', id)
        .select();
    if (error) throw error;
    return data?.[0];
}

export async function deleteLayer(id) {
    const { error } = await supabase
        .from('layers')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// ========================================
// Feature CRUD
// ========================================
export async function loadFeatures(projectId) {
    // Load all features for all layers in the project
    const { data, error } = await supabase
        .from('features')
        .select('*, layers!inner(project_id)')
        .eq('layers.project_id', projectId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    return (data || []).map(f => {
        // Strip the join data
        const { layers, ...feature } = f;
        return feature;
    });
}

export async function insertFeature(featureData) {
    const { data, error } = await supabase
        .from('features')
        .insert([{ ...featureData, user_id: state.currentUser.id }])
        .select();
    if (error) throw error;
    return data[0];
}

export async function updateFeature(id, updateData) {
    const { data, error } = await supabase
        .from('features')
        .update(updateData)
        .eq('id', id)
        .select();
    if (error) throw error;
    return data?.[0];
}

export async function deleteFeature(id) {
    const { error } = await supabase
        .from('features')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// ========================================
// Public Share
// ========================================
export async function toggleProjectShare(projectId, isPublic) {
    const updateData = { is_public: isPublic };
    if (isPublic) {
        // Generate a share token
        updateData.share_token = generateShareToken();
    } else {
        updateData.share_token = null;
    }
    return await updateProject(projectId, updateData);
}

export async function loadSharedProject(shareToken) {
    const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('share_token', shareToken)
        .eq('is_public', true)
        .single();
    if (error) throw error;
    return data;
}

// ========================================
// Offline Queue
// ========================================
export function queueOfflineAction(type, data) {
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    queue.push({ type, data, timestamp: Date.now() });
    localStorage.setItem('offlineQueue', JSON.stringify(queue));
}

export async function flushOfflineQueue() {
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    if (queue.length === 0) return { synced: 0, remaining: 0 };

    const remaining = [];
    let synced = 0;

    for (const item of queue) {
        try {
            if (item.type === 'feature') {
                const { error } = await supabase.from('features').insert([item.data]);
                if (error) throw error;
            } else if (item.type === 'edit-feature') {
                const { id, ...data } = item.data;
                const { error } = await supabase.from('features').update(data).eq('id', id);
                if (error) throw error;
            } else if (item.type === 'delete-feature') {
                const { error } = await supabase.from('features').delete().eq('id', item.data.id);
                if (error) throw error;
            } else if (item.type === 'layer') {
                const { error } = await supabase.from('layers').insert([item.data]);
                if (error) throw error;
            } else if (item.type === 'edit-layer') {
                const { id, ...data } = item.data;
                const { error } = await supabase.from('layers').update(data).eq('id', id);
                if (error) throw error;
            } else if (item.type === 'delete-layer') {
                const { error } = await supabase.from('layers').delete().eq('id', item.data.id);
                if (error) throw error;
            }
            synced++;
        } catch (err) {
            remaining.push(item);
        }
    }

    localStorage.setItem('offlineQueue', JSON.stringify(remaining));
    return { synced, remaining: remaining.length };
}

// ========================================
// Data Export
// ========================================
export async function exportData(format = 'csv') {
    const features = state.allFeatures.map(f => f.feature);
    const layers = state.layers;
    const projectName = state.activeProject?.name || 'OpenGIS';
    const date = new Date().toISOString().slice(0, 10);

    switch (format) {
        case 'csv':
            downloadFile(featuresToCSV(features, layers), `${projectName}-${date}.csv`, 'text/csv');
            break;
        case 'geojson':
            downloadFile(featuresToGeoJSON(features, layers), `${projectName}-${date}.geojson`, 'application/geo+json');
            break;
        case 'kml':
            downloadFile(featuresToKML(features, layers, projectName), `${projectName}-${date}.kml`, 'application/vnd.google-earth.kml+xml');
            break;
    }
}

// ========================================
// Bulk Import
// ========================================
export async function importFeaturesFromCSV(csvText, layerId) {
    const { rows, errors } = parseCSVImport(csvText);
    if (errors.length > 0 && rows.length === 0) {
        return { imported: 0, errors };
    }

    let imported = 0;
    const importErrors = [...errors];
    const chunkSize = 50;

    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize).map(row => {
            // Build attributes from all columns except lat/lng
            const { latitude, longitude, ...attrs } = row;
            return {
                layer_id: layerId,
                geometry_type: 'Point',
                coordinates: { lat: latitude, lng: longitude },
                attributes: attrs,
                user_id: state.currentUser.id,
            };
        });

        try {
            const { data, error } = await supabase
                .from('features')
                .insert(chunk)
                .select();
            if (error) throw error;
            imported += data.length;
        } catch (err) {
            importErrors.push(`Batch ${Math.floor(i / chunkSize) + 1}: ${err.message}`);
        }
    }

    return { imported, total: rows.length, errors: importErrors };
}

// ========================================
// Project Templates
// ========================================
export async function createForestryProject() {
    // Create a project with pre-configured forestry layers
    const project = await createProject({
        name: 'Forestry Inventory',
        description: 'Forest tree mapping and sample plots',
    });

    // Create Trees layer
    await createLayer({
        project_id: project.id,
        name: 'Trees',
        color: '#51CF66',
        icon: '🌳',
        geometry_type: 'Point',
        schema: [
            { key: 'species', label: 'Species', type: 'text', required: false },
            { key: 'dbh', label: 'DBH (cm)', type: 'number', required: false, min: 0, max: 500, step: 0.1 },
            { key: 'height', label: 'Height (m)', type: 'number', required: false, min: 0, max: 150, step: 0.1 },
            { key: 'elevation', label: 'Elevation (m)', type: 'number', required: false, readonly: true },
            { key: 'health', label: 'Health Status', type: 'select', required: false, options: ['Healthy', 'Diseased', 'Dead'] },
            { key: 'notes', label: 'Notes', type: 'textarea', required: false },
        ],
        visible: true,
        order_index: 0,
    });

    // Create Sample Plots layer
    await createLayer({
        project_id: project.id,
        name: 'Sample Plots',
        color: '#4C9AFF',
        icon: '📐',
        geometry_type: 'Polygon',
        schema: [
            { key: 'name', label: 'Plot Name', type: 'text', required: false },
            { key: 'notes', label: 'Notes', type: 'textarea', required: false },
        ],
        visible: true,
        order_index: 1,
    });

    return project;
}

export async function createBlankProject(name) {
    const project = await createProject({
        name: name || 'Untitled Map',
        description: '',
    });

    // Create a default Points layer
    await createLayer({
        project_id: project.id,
        name: 'Points',
        color: LAYER_COLORS[0],
        icon: '📍',
        geometry_type: 'Point',
        schema: DEFAULT_SCHEMA,
        visible: true,
        order_index: 0,
    });

    return project;
}

// ========================================
// Supabase Realtime
// ========================================
export function initRealtime(onFeatureChange, onLayerChange) {
    if (state.realtimeChannel) {
        supabase.removeChannel(state.realtimeChannel);
    }

    state.realtimeChannel = supabase
        .channel('db-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'features' },
            (payload) => {
                if (onFeatureChange) onFeatureChange(payload);
            }
        )
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'layers' },
            (payload) => {
                if (onLayerChange) onLayerChange(payload);
            }
        )
        .subscribe();
}
