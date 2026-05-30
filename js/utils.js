// ========================================
// Forestry Tree Mapper — Utility Functions
// ========================================

// --- XSS Sanitization (#26) ---
const SANITIZE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

export function sanitize(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, c => SANITIZE_MAP[c]);
}

// --- Debounce (#28) ---
export function debounce(fn, ms) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

// --- Forestry Calculations (#33, #34) ---
export function calculateBasalArea(dbhCm) {
    // BA = π × (DBH/2)² — result in cm², convert to m²
    if (!dbhCm || dbhCm <= 0) return 0;
    const radiusCm = dbhCm / 2;
    return Math.PI * radiusCm * radiusCm / 10000; // m²
}

export function calculateVolume(dbhCm, heightM) {
    // V = BA × Height × Form Factor (0.42 is common for tropical trees)
    if (!dbhCm || !heightM || dbhCm <= 0 || heightM <= 0) return 0;
    const ba = calculateBasalArea(dbhCm);
    return ba * heightM * 0.42; // m³
}

// --- Geospatial Calculations (#14, #32) ---
export function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth radius in meters
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export function calculatePolygonArea(latlngs) {
    // Shoelace formula with haversine-based distances (approximate for small polygons)
    // Uses spherical excess for more accuracy
    if (!latlngs || latlngs.length < 3) return 0;
    const toRad = d => d * Math.PI / 180;
    let total = 0;
    for (let i = 0; i < latlngs.length; i++) {
        const j = (i + 1) % latlngs.length;
        const xi = toRad(latlngs[i].lng || latlngs[i][1]);
        const yi = toRad(latlngs[i].lat || latlngs[i][0]);
        const xj = toRad(latlngs[j].lng || latlngs[j][1]);
        const yj = toRad(latlngs[j].lat || latlngs[j][0]);
        total += xi * Math.sin(yj) - xj * Math.sin(yi);
    }
    const R = 6371000;
    return Math.abs(total * R * R / 2);
}

export function calculatePolygonPerimeter(latlngs) {
    if (!latlngs || latlngs.length < 2) return 0;
    let total = 0;
    for (let i = 0; i < latlngs.length; i++) {
        const j = (i + 1) % latlngs.length;
        const p1 = latlngs[i];
        const p2 = latlngs[j];
        total += haversineDistance(
            p1.lat || p1[0], p1.lng || p1[1],
            p2.lat || p2[0], p2.lng || p2[1]
        );
    }
    return total;
}

export function pointInPolygon(lat, lng, polygon) {
    // Ray-casting algorithm
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].lat || polygon[i][0];
        const yi = polygon[i].lng || polygon[i][1];
        const xj = polygon[j].lat || polygon[j][0];
        const yj = polygon[j].lng || polygon[j][1];

        const intersect = ((yi > lng) !== (yj > lng)) &&
            (lat < (xj - xi) * (lng - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

// --- Formatting ---
export function formatArea(areaM2) {
    if (areaM2 >= 10000) return (areaM2 / 10000).toFixed(2) + ' ha';
    return areaM2.toFixed(1) + ' m²';
}

export function formatPerimeter(perimeterM) {
    if (perimeterM >= 1000) return (perimeterM / 1000).toFixed(2) + ' km';
    return perimeterM.toFixed(1) + ' m';
}

export function formatNumber(num, decimals = 2) {
    if (num == null || isNaN(num)) return '0';
    return Number(num).toFixed(decimals);
}

// --- Photo Compression (#29) ---
export function compressImage(file, maxWidth = 1600, quality = 0.8) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let w = img.width;
                let h = img.height;
                if (w > maxWidth) {
                    h = (h * maxWidth) / w;
                    w = maxWidth;
                }
                canvas.width = w;
                canvas.height = h;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, w, h);
                canvas.toBlob(
                    (blob) => {
                        if (blob) {
                            const compressed = new File([blob], file.name, {
                                type: 'image/jpeg',
                                lastModified: Date.now()
                            });
                            resolve(compressed);
                        } else {
                            resolve(file); // fallback to original
                        }
                    },
                    'image/jpeg',
                    quality
                );
            };
            img.onerror = () => resolve(file);
            img.src = e.target.result;
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
    });
}

// --- CSV Escaping ---
export function escapeCSV(val) {
    if (val == null) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

// --- Export Functions (#12) ---
export function treesToCSV(trees) {
    const headers = ['id', 'species', 'dbh_cm', 'height_m', 'health', 'latitude', 'longitude', 'basal_area_m2', 'volume_m3', 'notes', 'photo_url', 'created_at'];
    const rows = trees.map(t => [
        escapeCSV(t.id), escapeCSV(t.species), escapeCSV(t.dbh), escapeCSV(t.height),
        escapeCSV(t.health), escapeCSV(t.latitude), escapeCSV(t.longitude),
        escapeCSV(formatNumber(calculateBasalArea(t.dbh), 4)),
        escapeCSV(formatNumber(calculateVolume(t.dbh, t.height), 4)),
        escapeCSV(t.notes), escapeCSV(t.photo_url), escapeCSV(t.created_at)
    ].join(','));
    return [headers.join(','), ...rows].join('\n');
}

export function treesToGeoJSON(trees) {
    return JSON.stringify({
        type: 'FeatureCollection',
        features: trees.map(t => ({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [t.longitude, t.latitude] },
            properties: {
                id: t.id, species: t.species, dbh: t.dbh, height: t.height,
                health: t.health, notes: t.notes, photo_url: t.photo_url,
                basal_area_m2: +formatNumber(calculateBasalArea(t.dbh), 4),
                volume_m3: +formatNumber(calculateVolume(t.dbh, t.height), 4),
                created_at: t.created_at
            }
        }))
    }, null, 2);
}

export function plotsToGeoJSON(plots) {
    return JSON.stringify({
        type: 'FeatureCollection',
        features: plots.map(p => ({
            type: 'Feature',
            geometry: {
                type: 'Polygon',
                coordinates: [p.coordinates.map(c => [c.lng, c.lat]).concat([
                    [p.coordinates[0].lng, p.coordinates[0].lat]
                ])]
            },
            properties: { id: p.id, name: p.name, notes: p.notes }
        }))
    }, null, 2);
}

export function treesToKML(trees) {
    const placemarks = trees.map(t => `
    <Placemark>
      <name>${sanitize(t.species || 'Unknown')}</name>
      <description>DBH: ${t.dbh}cm, Height: ${t.height}m, Health: ${t.health}</description>
      <Point><coordinates>${t.longitude},${t.latitude},0</coordinates></Point>
    </Placemark>`).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>Forestry Tree Inventory</name>
  ${placemarks}
</Document>
</kml>`;
}

// --- CSV Import Parser (#16) ---
export function parseCSVImport(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [], errors: ['File is empty or has no data rows.'] };

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const requiredFields = ['latitude', 'longitude'];
    const missingFields = requiredFields.filter(f => !headers.includes(f) && !headers.includes(f.replace('_', '')));

    if (missingFields.length > 0) {
        // Try alternate header names
        const altHeaders = { 'lat': 'latitude', 'lng': 'longitude', 'lon': 'longitude' };
        const mappedHeaders = headers.map(h => altHeaders[h] || h);
        const stillMissing = requiredFields.filter(f => !mappedHeaders.includes(f));
        if (stillMissing.length > 0) {
            return { headers, rows: [], errors: [`Missing required columns: ${stillMissing.join(', ')}`] };
        }
    }

    const errors = [];
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => {
            const key = h === 'lat' ? 'latitude' : h === 'lng' || h === 'lon' ? 'longitude' : h;
            row[key] = values[idx] || '';
        });

        const lat = parseFloat(row.latitude);
        const lng = parseFloat(row.longitude);
        if (isNaN(lat) || isNaN(lng)) {
            errors.push(`Row ${i}: Invalid coordinates`);
            continue;
        }

        row.latitude = lat;
        row.longitude = lng;
        row.dbh = parseFloat(row.dbh || row.dbh_cm) || 0;
        row.height = parseFloat(row.height || row.height_m) || 0;
        row.species = row.species || 'Unknown';
        row.health = ['Healthy', 'Diseased', 'Dead'].includes(row.health) ? row.health : 'Healthy';
        row.notes = row.notes || '';

        rows.push(row);
    }

    return { headers, rows, errors };
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const c = line[i];
        if (c === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (c === ',' && !inQuotes) {
            result.push(current.trim());
            current = '';
        } else {
            current += c;
        }
    }
    result.push(current.trim());
    return result;
}

// --- File Download Helper ---
export function downloadFile(content, filename, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// --- Input Validation (#27) ---
export function validateTreeInput(species, dbh, height) {
    const errors = [];
    if (species && species.length > 100) errors.push('Species name too long (max 100 chars)');
    if (dbh < 0 || dbh > 500) errors.push('DBH must be between 0 and 500 cm');
    if (height < 0 || height > 150) errors.push('Height must be between 0 and 150 m');
    return errors;
}

// --- Haptic Feedback (#22) ---
export function haptic(pattern = [10]) {
    if ('vibrate' in navigator) {
        try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    }
}

// --- Count trees in polygon (#32) ---
export function countTreesInPolygon(trees, polygonCoords) {
    return trees.filter(t =>
        pointInPolygon(t.latitude || t.lat, t.longitude || t.lng, polygonCoords)
    );
}
