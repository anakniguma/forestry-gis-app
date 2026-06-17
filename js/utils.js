// ========================================
// OpenGIS — Utility Functions
// ========================================

// --- XSS Sanitization ---
const SANITIZE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' };

export function sanitize(str) {
    if (str == null) return '';
    return String(str).replace(/[&<>"']/g, c => SANITIZE_MAP[c]);
}

// --- Debounce ---
export function debounce(fn, ms) {
    let timer;
    return function (...args) {
        clearTimeout(timer);
        timer = setTimeout(() => fn.apply(this, args), ms);
    };
}

// --- Geospatial Calculations ---
export function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000;
    const toRad = d => d * Math.PI / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export async function fetchElevation(lat, lng) {
    try {
        const response = await fetch(`https://api.opentopodata.org/v1/srtm90m?locations=${lat},${lng}`);
        if (!response.ok) throw new Error('API response not ok');
        const data = await response.json();
        if (data.results && data.results.length > 0) {
            return data.results[0].elevation || 0;
        }
    } catch (err) {
        console.warn('Could not fetch elevation:', err);
    }
    return 0;
}

export function calculatePolygonArea(latlngs) {
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

export function countFeaturesInPolygon(features, polygonCoords) {
    return features.filter(f => {
        if (f.geometry_type !== 'Point') return false;
        const coords = f.coordinates;
        if (!coords) return false;
        return pointInPolygon(coords.lat || coords[0], coords.lng || coords[1], polygonCoords);
    });
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

export function formatDistance(meters) {
    if (meters > 1000) return (meters / 1000).toFixed(2) + ' km';
    return meters.toFixed(1) + ' m';
}

// --- Forestry-specific calculations (kept for Forestry template) ---
export function calculateBasalArea(dbhCm) {
    if (!dbhCm || dbhCm <= 0) return 0;
    const radiusCm = dbhCm / 2;
    return Math.PI * radiusCm * radiusCm / 10000; // m²
}

export function calculateVolume(dbhCm, heightM) {
    if (!dbhCm || !heightM || dbhCm <= 0 || heightM <= 0) return 0;
    const ba = calculateBasalArea(dbhCm);
    return ba * heightM * 0.42; // m³
}

// --- Photo Compression ---
export function compressImage(file, maxWidth = 1200, quality = 0.7) {
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
                            resolve(file);
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

// --- Generic Export Functions ---
export function featuresToCSV(features, layers) {
    if (!features.length) return '';
    // Collect all unique attribute keys across features
    const attrKeys = new Set();
    features.forEach(f => {
        if (f.attributes) {
            Object.keys(f.attributes).forEach(k => attrKeys.add(k));
        }
    });
    const sortedKeys = Array.from(attrKeys).sort();
    const headers = ['id', 'layer', 'geometry_type', 'latitude', 'longitude', ...sortedKeys, 'photo_url', 'created_at'];

    const layerMap = {};
    layers.forEach(l => { layerMap[l.id] = l.name; });

    const rows = features.map(f => {
        const coords = f.coordinates || {};
        const lat = coords.lat || (Array.isArray(coords) ? coords[0]?.lat || '' : '');
        const lng = coords.lng || (Array.isArray(coords) ? coords[0]?.lng || '' : '');
        const attrVals = sortedKeys.map(k => escapeCSV(f.attributes?.[k] || ''));
        return [
            escapeCSV(f.id),
            escapeCSV(layerMap[f.layer_id] || ''),
            escapeCSV(f.geometry_type),
            escapeCSV(lat), escapeCSV(lng),
            ...attrVals,
            escapeCSV(f.photo_url),
            escapeCSV(f.created_at),
        ].join(',');
    });
    return [headers.join(','), ...rows].join('\n');
}

export function featuresToGeoJSON(features, layers) {
    const layerMap = {};
    layers.forEach(l => { layerMap[l.id] = l.name; });

    return JSON.stringify({
        type: 'FeatureCollection',
        features: features.map(f => {
            let geometry;
            if (f.geometry_type === 'Point') {
                geometry = { type: 'Point', coordinates: [f.coordinates.lng, f.coordinates.lat] };
            } else if (f.geometry_type === 'LineString') {
                geometry = {
                    type: 'LineString',
                    coordinates: f.coordinates.map(c => [c.lng, c.lat])
                };
            } else if (f.geometry_type === 'Polygon') {
                const ring = f.coordinates.map(c => [c.lng, c.lat]);
                ring.push(ring[0]); // close ring
                geometry = { type: 'Polygon', coordinates: [ring] };
            }
            return {
                type: 'Feature',
                geometry,
                properties: {
                    id: f.id,
                    layer: layerMap[f.layer_id] || '',
                    ...(f.attributes || {}),
                    photo_url: f.photo_url || null,
                    created_at: f.created_at,
                }
            };
        })
    }, null, 2);
}

export function featuresToKML(features, layers, projectName) {
    const layerMap = {};
    layers.forEach(l => { layerMap[l.id] = l.name; });

    const placemarks = features.map(f => {
        const name = f.attributes?.name || f.attributes?.species || 'Feature';
        let coordStr = '';
        if (f.geometry_type === 'Point') {
            coordStr = `${f.coordinates.lng},${f.coordinates.lat},0`;
            return `
    <Placemark>
      <name>${sanitize(name)}</name>
      <description>Layer: ${sanitize(layerMap[f.layer_id] || '')}</description>
      <Point><coordinates>${coordStr}</coordinates></Point>
    </Placemark>`;
        } else if (f.geometry_type === 'LineString') {
            coordStr = f.coordinates.map(c => `${c.lng},${c.lat},0`).join(' ');
            return `
    <Placemark>
      <name>${sanitize(name)}</name>
      <LineString><coordinates>${coordStr}</coordinates></LineString>
    </Placemark>`;
        } else if (f.geometry_type === 'Polygon') {
            coordStr = f.coordinates.map(c => `${c.lng},${c.lat},0`).join(' ');
            const first = f.coordinates[0];
            coordStr += ` ${first.lng},${first.lat},0`;
            return `
    <Placemark>
      <name>${sanitize(name)}</name>
      <Polygon><outerBoundaryIs><LinearRing><coordinates>${coordStr}</coordinates></LinearRing></outerBoundaryIs></Polygon>
    </Placemark>`;
        }
        return '';
    }).join('');

    return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
  <name>${sanitize(projectName || 'OpenGIS Export')}</name>
  ${placemarks}
</Document>
</kml>`;
}

// --- CSV Import Parser (generic) ---
export function parseCSVImport(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return { headers: [], rows: [], errors: ['File is empty or has no data rows.'] };

    const headers = lines[0].split(',').map(h => h.trim().toLowerCase().replace(/"/g, ''));
    const requiredFields = ['latitude', 'longitude'];
    const altHeaders = { 'lat': 'latitude', 'lng': 'longitude', 'lon': 'longitude' };
    const mappedHeaders = headers.map(h => altHeaders[h] || h);
    const missingFields = requiredFields.filter(f => !mappedHeaders.includes(f));

    if (missingFields.length > 0) {
        return { headers, rows: [], errors: [`Missing required columns: ${missingFields.join(', ')}`] };
    }

    const errors = [];
    const rows = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;
        const values = parseCSVLine(lines[i]);
        const row = {};
        headers.forEach((h, idx) => {
            const key = altHeaders[h] || h;
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
        rows.push(row);
    }

    return { headers: mappedHeaders, rows, errors };
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

// --- GeoJSON Import Parser ---
export function parseGeoJSONImport(text) {
    try {
        const geojson = JSON.parse(text);
        if (geojson.type !== 'FeatureCollection' || !Array.isArray(geojson.features)) {
            return { features: [], errors: ['Invalid GeoJSON: must be a FeatureCollection'] };
        }

        const features = [];
        const errors = [];

        geojson.features.forEach((f, idx) => {
            if (!f.geometry || !f.geometry.type || !f.geometry.coordinates) {
                errors.push(`Feature ${idx + 1}: Missing geometry`);
                return;
            }

            const geoType = f.geometry.type;
            let coordinates;

            if (geoType === 'Point') {
                coordinates = { lat: f.geometry.coordinates[1], lng: f.geometry.coordinates[0] };
            } else if (geoType === 'LineString') {
                coordinates = f.geometry.coordinates.map(c => ({ lat: c[1], lng: c[0] }));
            } else if (geoType === 'Polygon') {
                // Take outer ring, skip closing duplicate
                const ring = f.geometry.coordinates[0];
                coordinates = ring.slice(0, -1).map(c => ({ lat: c[1], lng: c[0] }));
            } else {
                errors.push(`Feature ${idx + 1}: Unsupported geometry type "${geoType}"`);
                return;
            }

            const props = f.properties || {};
            // Strip out known non-attribute keys
            const { id, layer, photo_url, created_at, ...attributes } = props;

            features.push({
                geometry_type: geoType,
                coordinates,
                attributes,
                photo_url: photo_url || null,
            });
        });

        return { features, errors };
    } catch (e) {
        return { features: [], errors: ['Failed to parse GeoJSON: ' + e.message] };
    }
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

// --- Haptic Feedback ---
export function haptic(pattern = [10]) {
    if ('vibrate' in navigator) {
        try { navigator.vibrate(pattern); } catch (e) { /* ignore */ }
    }
}

// --- Feature Code Mapping (for QR/deep links) ---
export function featureIdToCode(id) {
    if (!id) return 'FT-UNKNOWN';
    const prime = 15485863;
    const modulo = 268435456;
    const mixed = (Number(id) * prime) % modulo;
    return 'FT-' + mixed.toString(36).toUpperCase().padStart(6, '0');
}

export function featureCodeToId(code) {
    if (!code || !code.startsWith('FT-')) return null;
    const mixPart = code.substring(3).toLowerCase();
    const mixed = parseInt(mixPart, 36);
    if (isNaN(mixed)) return null;
    const inv = 44542999;
    const modulo = 268435456;
    return (mixed * inv) % modulo;
}

// --- Generate Share Token ---
export function generateShareToken() {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    let result = '';
    const arr = new Uint8Array(24);
    crypto.getRandomValues(arr);
    for (let i = 0; i < 24; i++) {
        result += chars[arr[i] % chars.length];
    }
    return result;
}

// --- Input Validation (generic) ---
export function validateFeatureInput(attributes, schema) {
    const errors = [];
    if (!schema) return errors;
    schema.forEach(field => {
        if (field.required && (!attributes[field.key] || String(attributes[field.key]).trim() === '')) {
            errors.push(`${field.label} is required`);
        }
        if (field.type === 'number' && attributes[field.key] != null && attributes[field.key] !== '') {
            const val = parseFloat(attributes[field.key]);
            if (isNaN(val)) {
                errors.push(`${field.label} must be a number`);
            } else {
                if (field.min != null && val < field.min) errors.push(`${field.label} must be at least ${field.min}`);
                if (field.max != null && val > field.max) errors.push(`${field.label} must be at most ${field.max}`);
            }
        }
        if (field.type === 'text' && attributes[field.key] && String(attributes[field.key]).length > 200) {
            errors.push(`${field.label} is too long (max 200 chars)`);
        }
    });
    return errors;
}
