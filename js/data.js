// ========================================
// Forestry Tree Mapper — Data Layer
// ========================================

import { supabase, state, PAGE_SIZE, MAX_PHOTO_WIDTH, PHOTO_QUALITY } from './config.js';
import { compressImage, treesToCSV, treesToGeoJSON, treesToKML, plotsToGeoJSON, downloadFile, parseCSVImport } from './utils.js';

// --- Photo Upload with Compression (#29) ---
export async function uploadPhoto(file) {
    // Compress first
    let processedFile = file;
    try {
        processedFile = await compressImage(file, MAX_PHOTO_WIDTH, PHOTO_QUALITY);
    } catch (e) {
        console.warn('Photo compression failed, using original:', e);
    }

    const ext = file.name.split('.').pop();
    const fileName = `${state.currentUser.id}/${crypto.randomUUID()}.${ext}`;
    const { data, error } = await supabase.storage
        .from('tree-photos')
        .upload(fileName, processedFile, {
            cacheControl: '3600',
            upsert: false
        });

    if (error) throw error;

    const { data: urlData } = supabase.storage
        .from('tree-photos')
        .getPublicUrl(fileName);

    return urlData.publicUrl;
}

// --- Tree CRUD ---
export async function insertTree(treeData) {
    const { data, error } = await supabase
        .from('trees')
        .insert([treeData])
        .select();
    if (error) throw error;
    return data[0];
}

export async function updateTree(id, updateData) {
    const { data, error } = await supabase
        .from('trees')
        .update(updateData)
        .eq('id', id)
        .select();
    if (error) throw error;
    return data?.[0];
}

export async function deleteTree(id) {
    const { error } = await supabase
        .from('trees')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// --- Plot CRUD ---
export async function insertPlot(plotData) {
    const { data, error } = await supabase
        .from('sample_plots')
        .insert([plotData])
        .select();
    if (error) throw error;
    return data[0];
}

export async function updatePlot(id, updateData) {
    const { data, error } = await supabase
        .from('sample_plots')
        .update(updateData)
        .eq('id', id)
        .select();
    if (error) throw error;
    return data?.[0];
}

export async function deletePlot(id) {
    const { error } = await supabase
        .from('sample_plots')
        .delete()
        .eq('id', id);
    if (error) throw error;
}

// --- Load Data with Pagination (#39) ---
export async function loadTreesPage(page = 0) {
    const from = page * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    const { data, error, count } = await supabase
        .from('trees')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(from, to);

    if (error) throw error;

    const hasMore = data && count ? (from + data.length) < count : false;
    return { trees: data || [], hasMore };
}

export async function loadAllTrees() {
    // Load all pages
    let allTrees = [];
    let page = 0;
    let hasMore = true;

    while (hasMore) {
        const result = await loadTreesPage(page);
        allTrees = allTrees.concat(result.trees);
        hasMore = result.hasMore;
        page++;
    }

    return allTrees;
}

export async function loadPlots() {
    const { data, error } = await supabase
        .from('sample_plots')
        .select('*');
    if (error) throw error;
    return data || [];
}

// --- Offline Queue ---
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
            if (item.type === 'tree') {
                const { error } = await supabase.from('trees').insert([item.data]);
                if (error) throw error;
            } else if (item.type === 'plot') {
                const { error } = await supabase.from('sample_plots').insert([item.data]);
                if (error) throw error;
            } else if (item.type === 'edit-tree') {
                const { id, ...data } = item.data;
                const { error } = await supabase.from('trees').update(data).eq('id', id);
                if (error) throw error;
            } else if (item.type === 'edit-plot') {
                const { id, ...data } = item.data;
                const { error } = await supabase.from('sample_plots').update(data).eq('id', id);
                if (error) throw error;
            } else if (item.type === 'delete-tree') {
                const { error } = await supabase.from('trees').delete().eq('id', item.data.id);
                if (error) throw error;
            } else if (item.type === 'delete-plot') {
                const { error } = await supabase.from('sample_plots').delete().eq('id', item.data.id);
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

// --- Data Export (#12) ---
export async function exportData(format = 'csv') {
    const trees = state.allTreeMarkers.map(m => m.tree);
    const plotDataArray = state.allPlotPolygons.map(p => p.plotData).filter(Boolean);

    const date = new Date().toISOString().slice(0, 10);

    switch (format) {
        case 'csv':
            downloadFile(treesToCSV(trees), `tree-inventory-${date}.csv`, 'text/csv');
            break;
        case 'geojson': {
            downloadFile(treesToGeoJSON(trees), `trees-${date}.geojson`, 'application/geo+json');
            if (plotDataArray.length > 0) {
                downloadFile(plotsToGeoJSON(plotDataArray), `plots-${date}.geojson`, 'application/geo+json');
            }
            break;
        }
        case 'kml':
            downloadFile(treesToKML(trees), `tree-inventory-${date}.kml`, 'application/vnd.google-earth.kml+xml');
            break;
    }
}

// --- Bulk CSV Import (#16) ---
export async function importTreesFromCSV(csvText) {
    const { rows, errors } = parseCSVImport(csvText);
    if (errors.length > 0 && rows.length === 0) {
        return { imported: 0, errors };
    }

    let imported = 0;
    const importErrors = [...errors];

    // Batch insert in chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize).map(row => ({
            species: row.species,
            dbh: row.dbh,
            height: row.height,
            health: row.health,
            notes: row.notes,
            latitude: row.latitude,
            longitude: row.longitude,
            user_id: state.currentUser.id
        }));

        try {
            const { data, error } = await supabase
                .from('trees')
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

// --- Supabase Realtime (#31) ---
export function initRealtime(onTreeChange, onPlotChange) {
    // Clean up existing channel
    if (state.realtimeChannel) {
        supabase.removeChannel(state.realtimeChannel);
    }

    state.realtimeChannel = supabase
        .channel('db-changes')
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'trees' },
            (payload) => {
                if (onTreeChange) onTreeChange(payload);
            }
        )
        .on('postgres_changes',
            { event: '*', schema: 'public', table: 'sample_plots' },
            (payload) => {
                if (onPlotChange) onPlotChange(payload);
            }
        )
        .subscribe();
}

// --- Session Management (#30) ---
export function initSessionWatcher(onExpired) {
    supabase.auth.onAuthStateChange((event, session) => {
        if (event === 'TOKEN_REFRESHED') {
            console.log('Session token refreshed');
        } else if (event === 'SIGNED_OUT' || (!session && state.currentUser)) {
            if (onExpired) onExpired();
        }
    });
}
