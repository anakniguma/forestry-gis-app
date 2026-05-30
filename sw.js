// ========================================
// Forestry Tree Mapper — Service Worker
// Enhanced: Cache limits (#38), Background Sync (#25)
// ========================================

const CACHE_NAME = 'forestry-mapper-v6';
const TILE_CACHE = 'map-tiles-v2';
const MAX_TILE_CACHE_ITEMS = 500; // LRU eviction (#38)

const PRECACHE_URLS = [
    './',
    './index.html',
    './styles.css',
    './manifest.json',
    './icons/icon-192.png',
    './icons/icon-512.png',
    './js/config.js',
    './js/utils.js',
    './js/ui.js',
    './js/data.js',
    './js/map.js',
    './js/app.js',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.css',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/MarkerCluster.Default.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js',
    'https://unpkg.com/leaflet-draw@1.0.4/dist/leaflet.draw.js',
    'https://unpkg.com/leaflet.markercluster@1.5.3/dist/leaflet.markercluster.js',
    'https://unpkg.com/leaflet.heat@0.2.0/dist/leaflet-heat.js',
    'https://cdn.jsdelivr.net/npm/chart.js@4/dist/chart.umd.min.js'
];

// --- Install ---
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_URLS);
        })
    );
    self.skipWaiting();
});

// --- Activate: Clean old caches ---
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((name) => {
                    if (name !== CACHE_NAME && name !== TILE_CACHE) {
                        return caches.delete(name);
                    }
                })
            );
        })
    );
    self.clients.claim();
});

// --- Fetch: Strategies per resource type ---
self.addEventListener('fetch', (event) => {
    const url = new URL(event.request.url);

    // Map tiles: stale-while-revalidate with cache limit
    if (url.hostname.includes('tile.openstreetmap.org') ||
        url.hostname.includes('arcgisonline.com') ||
        url.hostname.includes('basemaps.cartocdn.com')) {
        event.respondWith(handleTileRequest(event.request));
        return;
    }

    // Supabase API: network-only
    if (url.hostname.includes('supabase.co') || url.hostname.includes('supabase.in')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Nominatim: network-only
    if (url.hostname.includes('nominatim.openstreetmap.org')) {
        event.respondWith(fetch(event.request));
        return;
    }

    // Everything else: cache-first, fallback to network
    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request).then((response) => {
                if (response.ok && event.request.method === 'GET') {
                    const responseClone = response.clone();
                    caches.open(CACHE_NAME).then((cache) => {
                        cache.put(event.request, responseClone);
                    });
                }
                return response;
            });
        })
    );
});

// --- Tile Request Handler with LRU Cache (#38) ---
async function handleTileRequest(request) {
    const cache = await caches.open(TILE_CACHE);
    const cachedResponse = await cache.match(request);

    // Fetch from network in background
    const fetchPromise = fetch(request).then(async (networkResponse) => {
        if (networkResponse.ok) {
            await cache.put(request, networkResponse.clone());
            // Enforce cache size limit
            await trimTileCache(cache);
        }
        return networkResponse;
    }).catch(() => cachedResponse);

    // Return cached if available, otherwise wait for network
    return cachedResponse || fetchPromise;
}

async function trimTileCache(cache) {
    const keys = await cache.keys();
    if (keys.length > MAX_TILE_CACHE_ITEMS) {
        // Delete oldest entries (FIFO approximation)
        const toDelete = keys.length - MAX_TILE_CACHE_ITEMS;
        for (let i = 0; i < toDelete; i++) {
            await cache.delete(keys[i]);
        }
    }
}

// --- Background Sync (#25) ---
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-offline-queue') {
        event.waitUntil(syncOfflineQueue());
    }
});

async function syncOfflineQueue() {
    // Notify the client to flush its offline queue
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
        client.postMessage({ type: 'SYNC_OFFLINE_QUEUE' });
    });
}

// Listen for messages from client
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
