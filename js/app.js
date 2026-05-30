// ========================================
// Forestry Tree Mapper — Main Application
// ========================================

import { supabase, state, MAX_PHOTO_SIZE, SEARCH_DEBOUNCE_MS } from './config.js';
import { sanitize, debounce, validateTreeInput, haptic, parseCSVImport } from './utils.js';
import {
    showToast, showLoading, hideLoading, showConfirm, initConfirmModal,
    showStatus, updateQueueBadge, openPanel, closePanel, closeAllPanels,
    initDashboard, updateDashboard, initInstallPrompt, initAutoSuggest,
    initLightbox, openLightbox, initSwipeDismiss
} from './ui.js';
import {
    uploadPhoto, insertTree, updateTree, deleteTree as deleteTreeDB,
    insertPlot, updatePlot, deletePlot as deletePlotDB,
    loadAllTrees, loadPlots, queueOfflineAction, flushOfflineQueue,
    exportData, importTreesFromCSV, initRealtime
} from './data.js';
import {
    initMap, addTileLayers, addDrawControls, initGPS,
    createTreeMarker, createClusterGroup, initHeatmap,
    updateHeatmap, toggleHeatmap, createPlotPolygon
} from './map.js';

// ========================================
// DOM References
// ========================================
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
const tabLogin = document.getElementById('tab-login');
const tabSignup = document.getElementById('tab-signup');
const loginForm = document.getElementById('login-form');
const signupForm = document.getElementById('signup-form');
const loginError = document.getElementById('login-error');
const signupError = document.getElementById('signup-error');
const signupSuccess = document.getElementById('signup-success');
const loginSubmit = document.getElementById('login-submit');
const signupSubmit = document.getElementById('signup-submit');
const userEmailDisplay = document.getElementById('user-dropdown-email');

const formPanel = document.getElementById('form-panel');
const plotFormPanel = document.getElementById('plot-form-panel');
const editPanel = document.getElementById('edit-panel');
const importPanel = document.getElementById('import-panel');
const exportPanel = document.getElementById('export-panel');

const filterSpecies = document.getElementById('filter-species');
const filterHealth = document.getElementById('filter-health');
const clearFiltersBtn = document.getElementById('clear-filters');
const photoInput = document.getElementById('photo');
const fileLabel = document.getElementById('file-label');
const photoPreview = document.getElementById('photo-preview');
const photoPreviewImg = document.getElementById('photo-preview-img');

// ========================================
// Authentication (#30 session handling)
// ========================================
tabLogin.addEventListener('click', () => {
    tabLogin.classList.add('active');
    tabSignup.classList.remove('active');
    loginForm.classList.add('active');
    signupForm.classList.remove('active');
    loginError.style.display = 'none';
});

tabSignup.addEventListener('click', () => {
    tabSignup.classList.add('active');
    tabLogin.classList.remove('active');
    signupForm.classList.add('active');
    loginForm.classList.remove('active');
    signupError.style.display = 'none';
    signupSuccess.style.display = 'none';
});

loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    loginError.style.display = 'none';
    loginSubmit.disabled = true;
    loginSubmit.innerHTML = '<span class="spinner"></span>Signing in...';

    const email = document.getElementById('login-email').value;
    const password = document.getElementById('login-password').value;
    const { error } = await supabase.auth.signInWithPassword({ email, password });

    loginSubmit.disabled = false;
    loginSubmit.textContent = 'Sign In';

    if (error) {
        loginError.textContent = error.message;
        loginError.style.display = 'block';
    }
});

signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    signupError.style.display = 'none';
    signupSuccess.style.display = 'none';

    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-password').value;
    const confirm = document.getElementById('signup-confirm').value;

    if (password !== confirm) {
        signupError.textContent = 'Passwords do not match.';
        signupError.style.display = 'block';
        return;
    }

    signupSubmit.disabled = true;
    signupSubmit.innerHTML = '<span class="spinner"></span>Creating account...';

    const { data, error } = await supabase.auth.signUp({ email, password });

    signupSubmit.disabled = false;
    signupSubmit.textContent = 'Create Account';

    if (error) {
        signupError.textContent = error.message;
        signupError.style.display = 'block';
    } else if (data.user && !data.session) {
        signupSuccess.textContent = '✅ Check your email for a confirmation link, then sign in.';
        signupSuccess.style.display = 'block';
    }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
    await supabase.auth.signOut();
    showToast('Signed out successfully', 'info');
});

// Auth state change
supabase.auth.onAuthStateChange((event, session) => {
    if (session && session.user) {
        state.currentUser = session.user;
        if (userEmailDisplay) userEmailDisplay.textContent = state.currentUser.email;

        const initial = (state.currentUser.email || 'U')[0].toUpperCase();
        const avatarChar = document.getElementById('user-avatar-char');
        const avatarCharLarge = document.getElementById('user-avatar-char-large');
        if (avatarChar) avatarChar.textContent = initial;
        if (avatarCharLarge) avatarCharLarge.textContent = initial;

        authScreen.classList.add('hidden');
        appContainer.classList.add('visible');
        initApp();
    } else {
        state.currentUser = null;
        authScreen.classList.remove('hidden');
        appContainer.classList.remove('visible');
        clearAppState();
        if (window.startAuthParticles) {
            window.startAuthParticles();
        }
    }
});

// ========================================
// Auth Screen Visual Enhancements
// ========================================

// --- Forest Particles Animation ---
function initAuthParticles() {
    const canvas = document.getElementById('auth-particles-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animationFrameId = null;
    let particles = [];
    const maxParticles = 50;

    function resizeCanvas() {
        const rect = canvas.getBoundingClientRect();
        canvas.width = rect.width * window.devicePixelRatio;
        canvas.height = rect.height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);
    }

    function createParticles() {
        particles = [];
        const width = canvas.width / window.devicePixelRatio;
        const height = canvas.height / window.devicePixelRatio;
        for (let i = 0; i < maxParticles; i++) {
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                size: Math.random() * 1.8 + 0.8,
                speedY: -(Math.random() * 0.35 + 0.12),
                swayRange: Math.random() * 10 + 4,
                swaySpeed: Math.random() * 0.015 + 0.005,
                angle: Math.random() * Math.PI * 2,
                opacity: Math.random() * 0.45 + 0.2,
                pulseSpeed: Math.random() * 0.02 + 0.008,
                pulseAngle: Math.random() * Math.PI * 2
            });
        }
    }

    function draw() {
        if (authScreen.classList.contains('hidden')) {
            animationFrameId = null;
            return;
        }

        const width = canvas.width / window.devicePixelRatio;
        const height = canvas.height / window.devicePixelRatio;
        ctx.clearRect(0, 0, width, height);

        particles.forEach(p => {
            const currentX = p.x + Math.sin(p.angle) * p.swayRange;
            const currentOpacity = Math.max(0.08, p.opacity + Math.sin(p.pulseAngle) * 0.12);

            const grad = ctx.createRadialGradient(
                currentX, p.y, 0,
                currentX, p.y, p.size * 3.5
            );
            grad.addColorStop(0, `rgba(165, 245, 165, ${currentOpacity})`);
            grad.addColorStop(0.3, `rgba(125, 223, 126, ${currentOpacity * 0.5})`);
            grad.addColorStop(1, 'rgba(125, 223, 126, 0)');

            ctx.beginPath();
            ctx.fillStyle = grad;
            ctx.arc(currentX, p.y, p.size * 3.5, 0, Math.PI * 2);
            ctx.fill();

            p.y += p.speedY;
            p.angle += p.swaySpeed;
            p.pulseAngle += p.pulseSpeed;

            if (p.y < -15) {
                p.y = height + 15;
                p.x = Math.random() * width;
                p.opacity = Math.random() * 0.45 + 0.2;
            }
        });

        animationFrameId = requestAnimationFrame(draw);
    }

    function start() {
        resizeCanvas();
        createParticles();
        if (!animationFrameId) {
            draw();
        }
    }

    window.addEventListener('resize', () => {
        resizeCanvas();
        if (particles.length === 0) createParticles();
    });

    start();

    window.startAuthParticles = () => {
        if (!animationFrameId) {
            start();
        }
    };
}

// --- Interactive Password Strength Meter ---
function initPasswordStrength() {
    const signupPassword = document.getElementById('signup-password');
    const segments = [
        document.getElementById('str-seg-1'),
        document.getElementById('str-seg-2'),
        document.getElementById('str-seg-3')
    ];

    if (!signupPassword || !segments[0]) return;

    signupPassword.addEventListener('input', () => {
        const val = signupPassword.value;
        let score = 0;

        if (val.length >= 6) score++;
        if (val.length >= 8) score++;
        if (/[A-Z]/.test(val) && /[a-z]/.test(val)) score++;
        if (/[0-9]/.test(val)) score++;
        if (/[^A-Za-z0-9]/.test(val)) score++;

        let level = 0; // 0 = none, 1 = weak, 2 = medium, 3 = strong
        if (val.length > 0) {
            if (score <= 2) {
                level = 1;
            } else if (score <= 4) {
                level = 2;
            } else {
                level = 3;
            }
        }

        // Clear existing strength classes
        segments.forEach(seg => {
            seg.className = 'auth-strength-segment';
        });

        // Set strength color classes dynamically
        if (level === 1) {
            segments[0].classList.add('weak');
        } else if (level === 2) {
            segments[0].classList.add('medium');
            segments[1].classList.add('medium');
        } else if (level === 3) {
            segments[0].classList.add('strong');
            segments[1].classList.add('strong');
            segments[2].classList.add('strong');
        }
    });
}

// Initialize Auth Screen Animations & UI interactions
initAuthParticles();
initPasswordStrength();

// ========================================
// App Initialization
// ========================================
async function initApp() {
    if (state.appInitialized) {
        await reloadData();
        return;
    }
    state.appInitialized = true;

    // Initialize map
    const map = initMap('map');
    addTileLayers(map);

    // Drawn items layer
    state.drawnItems = new L.FeatureGroup();
    map.addLayer(state.drawnItems);

    // Marker cluster group (#19)
    state.markerClusterGroup = createClusterGroup();
    if (state.markerClusterGroup) {
        map.addLayer(state.markerClusterGroup);
    }

    // Draw controls
    addDrawControls(map, state.drawnItems);

    // GPS (#6)
    initGPS(map);

    // Heatmap (#13)
    state.heatLayer = initHeatmap(map);

    // Heatmap toggle button
    const heatmapBtn = document.getElementById('heatmap-toggle');
    if (heatmapBtn) {
        let heatmapVisible = false;
        heatmapBtn.addEventListener('click', () => {
            heatmapVisible = !heatmapVisible;
            toggleHeatmap(map, state.heatLayer, heatmapVisible);
            heatmapBtn.classList.toggle('active-fab', heatmapVisible);
        });
    }

    // Photo input
    photoInput.addEventListener('change', handlePhotoChange);

    // Draw events
    map.on('draw:created', handleDrawCreated);
    map.on('draw:edited', handleDrawEdited);
    map.on('draw:deleted', handleDrawDeleted);

    // Form buttons
    document.getElementById('cancel-btn').addEventListener('click', () => {
        if (state.currentLayer) { map.removeLayer(state.currentLayer); state.currentLayer = null; }
        closePanel(formPanel);
    });

    document.getElementById('cancel-plot-btn').addEventListener('click', () => {
        if (state.currentLayer) { map.removeLayer(state.currentLayer); state.currentLayer = null; }
        closePanel(plotFormPanel);
    });

    document.getElementById('save-btn').addEventListener('click', saveTree);
    document.getElementById('save-plot-btn').addEventListener('click', savePlot);

    // Edit panel (#15)
    document.getElementById('cancel-edit-btn')?.addEventListener('click', () => {
        state.editingTreeId = null;
        closePanel(editPanel);
    });
    document.getElementById('save-edit-btn')?.addEventListener('click', saveEditTree);

    // Import panel (#16)
    document.getElementById('cancel-import-btn')?.addEventListener('click', () => closePanel(importPanel));
    document.getElementById('import-file')?.addEventListener('change', handleImportFileChange);
    document.getElementById('confirm-import-btn')?.addEventListener('click', executeImport);

    // Export panel (#12)
    document.getElementById('cancel-export-btn')?.addEventListener('click', () => closePanel(exportPanel));
    document.querySelectorAll('.format-card').forEach(card => {
        card.addEventListener('click', () => {
            const format = card.dataset.format;
            if (format) {
                exportData(format);
                closePanel(exportPanel);
                showToast(`Exported as ${format.toUpperCase()}`, 'success');
                haptic();
            }
        });
    });

    // Dashboard actions
    document.getElementById('btn-export')?.addEventListener('click', () => {
        document.getElementById('dashboard-panel')?.classList.remove('open');
        openPanel(exportPanel);
    });
    document.getElementById('btn-import')?.addEventListener('click', () => {
        document.getElementById('dashboard-panel')?.classList.remove('open');
        openPanel(importPanel);
    });

    // Filters
    filterSpecies.addEventListener('change', applyFilters);
    filterHealth.addEventListener('change', applyFilters);
    clearFiltersBtn.addEventListener('click', () => {
        filterSpecies.value = '';
        filterHealth.value = '';
        clearFiltersBtn.style.display = 'none';
        applyFilters();
    });

    // Online/offline
    window.addEventListener('online', async () => {
        showStatus('Back online!', 'online');
        showToast('Connection restored — syncing...', 'success');
        const result = await flushOfflineQueue();
        updateQueueBadge();
        if (result.synced > 0) {
            showToast(`Synced ${result.synced} offline item${result.synced > 1 ? 's' : ''}!`, 'success');
            await reloadData();
        }
    });

    window.addEventListener('offline', () => {
        showStatus('You are offline', 'offline');
        showToast('You are offline — changes will sync later', 'warning', 5000);
    });

    if (!navigator.onLine) showStatus('You are offline', 'offline');

    // Search with debounce (#28)
    initSearch(map);

    // User dropdown
    initUserDropdown();

    // Panel backdrop
    initPanelBackdrop();

    // Confirm modal (#11)
    initConfirmModal();

    // Dashboard (#5)
    initDashboard();

    // Install prompt (#24)
    initInstallPrompt();

    // Species auto-suggest (#35)
    initAutoSuggest('species', () => state.allSpecies);
    initAutoSuggest('edit-species', () => state.allSpecies);

    // Lightbox (#17)
    initLightbox();
    window.addEventListener('open-lightbox', (e) => openLightbox(e.detail));

    // Tree edit/delete events from popups (#15, #11)
    window.addEventListener('edit-tree', (e) => openEditForm(e.detail));
    window.addEventListener('delete-tree', (e) => confirmDeleteTree(e.detail));

    // QR Tag event from popups
    window.addEventListener('qr-tree', (e) => openQRModal(e.detail));

    // QR modal init
    initQRModal();

    // Swipe to dismiss (#21)
    initSwipeDismiss();

    // Realtime (#31)
    initRealtime(
        (payload) => {
            // Tree changed by someone else
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
                reloadData();
            }
        },
        (payload) => {
            if (payload.eventType === 'INSERT' || payload.eventType === 'UPDATE' || payload.eventType === 'DELETE') {
                reloadData();
            }
        }
    );

    // Service Worker (#25 background sync)
    if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.register('./sw.js');
        console.log('SW registered:', reg.scope);

        // Background sync registration
        if ('sync' in reg) {
            try {
                await reg.sync.register('sync-offline-queue');
            } catch (e) {
                console.log('Background sync not supported');
            }
        }
    }

    updateQueueBadge();
    await reloadData();

    // Deep-link: open tree from URL ?tree=ID
    handleDeepLink();
}

// ========================================
// Data Loading
// ========================================
async function reloadData() {
    if (state.isLoadingData) return;
    state.isLoadingData = true;
    showLoading('Loading forestry data...');

    clearAppState();

    try {
        const [trees, plots] = await Promise.all([loadAllTrees(), loadPlots()]);

        trees.forEach(tree => addTreeToMap(tree));
        const allTrees = state.allTreeMarkers.map(m => m.tree);
        plots.forEach(plot => addPlotToMap(plot, allTrees));

        updateSpeciesFilter();
        updateDashboard();

        // Update heatmap
        if (state.heatLayer) {
            updateHeatmap(state.heatLayer, allTrees);
        }
    } catch (err) {
        console.error('Error loading data:', err);
        showToast('Error loading data: ' + err.message, 'error');
    } finally {
        hideLoading();
        state.isLoadingData = false;
    }
}

function clearAppState() {
    // Clear cluster group
    if (state.markerClusterGroup) state.markerClusterGroup.clearLayers();

    // Clear drawn items (plots)
    if (state.drawnItems) state.drawnItems.clearLayers();

    state.allTreeMarkers = [];
    state.allPlotPolygons = [];
    state.allSpecies.clear();
    if (filterSpecies) filterSpecies.innerHTML = '<option value="">All Species</option>';
}

function addTreeToMap(tree) {
    const marker = createTreeMarker(tree);

    // Add to cluster group or drawn items
    if (state.markerClusterGroup) {
        state.markerClusterGroup.addLayer(marker);
    } else {
        state.drawnItems.addLayer(marker);
    }

    state.allTreeMarkers.push({ marker, tree });

    if (tree.species && tree.species !== 'Unknown') {
        state.allSpecies.add(tree.species);
    }
}

function addPlotToMap(plot, allTrees = []) {
    const polygon = createPlotPolygon(plot, allTrees);
    state.drawnItems.addLayer(polygon);
    state.allPlotPolygons.push(polygon);
}

// ========================================
// Species Filter (#10 count badges)
// ========================================
function updateSpeciesFilter() {
    const current = filterSpecies.value;
    filterSpecies.innerHTML = '<option value="">All Species</option>';

    // Count per species
    const counts = {};
    state.allTreeMarkers.forEach(({ tree }) => {
        const sp = tree.species || 'Unknown';
        if (sp !== 'Unknown') counts[sp] = (counts[sp] || 0) + 1;
    });

    const sorted = Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0]));
    sorted.forEach(([sp, count]) => {
        const opt = document.createElement('option');
        opt.value = sp;
        opt.textContent = `${sp} (${count})`;
        filterSpecies.appendChild(opt);
    });

    if (current && Object.keys(counts).includes(current)) {
        filterSpecies.value = current;
    }
}

function applyFilters() {
    const speciesVal = filterSpecies.value;
    const healthVal = filterHealth.value;
    const hasFilter = speciesVal || healthVal;
    clearFiltersBtn.style.display = hasFilter ? 'block' : 'none';

    state.allTreeMarkers.forEach(({ marker, tree }) => {
        let show = true;
        if (speciesVal && tree.species !== speciesVal) show = false;
        if (healthVal && tree.health !== healthVal) show = false;

        const group = state.markerClusterGroup || state.drawnItems;
        if (show) {
            if (!group.hasLayer(marker)) group.addLayer(marker);
        } else {
            if (group.hasLayer(marker)) group.removeLayer(marker);
        }
    });
}

// ========================================
// Photo Handling
// ========================================
function handlePhotoChange() {
    const file = photoInput.files[0];
    if (file) {
        if (file.size > MAX_PHOTO_SIZE) {
            showToast('Photo must be smaller than 5 MB', 'error');
            photoInput.value = '';
            fileLabel.textContent = '📷 Tap to attach photo';
            fileLabel.classList.remove('has-file');
            photoPreview.style.display = 'none';
            return;
        }
        fileLabel.textContent = '✅ ' + file.name;
        fileLabel.classList.add('has-file');
        const reader = new FileReader();
        reader.onload = (e) => {
            photoPreviewImg.src = e.target.result;
            photoPreview.style.display = 'block';
        };
        reader.readAsDataURL(file);
    } else {
        fileLabel.textContent = '📷 Tap to attach photo';
        fileLabel.classList.remove('has-file');
        photoPreview.style.display = 'none';
    }
}

// ========================================
// Draw Event Handlers
// ========================================
function handleDrawCreated(e) {
    const type = e.layerType;
    const layer = e.layer;

    if (state.currentLayer) state.map.removeLayer(state.currentLayer);
    state.currentLayer = layer;
    state.drawnItems.addLayer(state.currentLayer);

    closeAllPanels();

    if (type === 'marker') {
        state.currentDrawType = 'marker';
        openPanel(formPanel);
        resetTreeForm();
    } else if (type === 'polygon') {
        state.currentDrawType = 'polygon';
        openPanel(plotFormPanel);
        document.getElementById('plot-name').value = '';
        document.getElementById('plot-notes').value = '';
    }
}

async function handleDrawEdited(e) {
    const layers = e.layers;
    layers.eachLayer(async (layer) => {
        const dbId = layer.databaseId;
        const type = layer.layerType;
        if (!dbId || !type) return;

        if (type === 'tree') {
            const latlng = layer.getLatLng();
            try {
                await updateTree(dbId, { latitude: latlng.lat, longitude: latlng.lng });
                showToast('Tree location updated!', 'success');
                haptic();
            } catch (err) {
                if (!navigator.onLine) {
                    queueOfflineAction('edit-tree', { id: dbId, latitude: latlng.lat, longitude: latlng.lng });
                    updateQueueBadge();
                    showToast('Saved edit offline — will sync later', 'warning');
                } else {
                    showToast('Error updating tree: ' + err.message, 'error');
                }
            }
        } else if (type === 'plot') {
            const latlngs = layer.getLatLngs()[0];
            const coordinates = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
            try {
                await updatePlot(dbId, { coordinates });
                showToast('Plot coordinates updated!', 'success');
                haptic();
            } catch (err) {
                if (!navigator.onLine) {
                    queueOfflineAction('edit-plot', { id: dbId, coordinates });
                    updateQueueBadge();
                    showToast('Saved edit offline — will sync later', 'warning');
                } else {
                    showToast('Error updating plot: ' + err.message, 'error');
                }
            }
        }
    });
}

function handleDrawDeleted(e) {
    // Confirmation is handled via custom delete buttons in popups (#11)
    // This handles the Leaflet Draw toolbar delete
    const layers = e.layers;
    layers.eachLayer(async (layer) => {
        const dbId = layer.databaseId;
        const type = layer.layerType;
        if (!dbId || !type) return;

        if (type === 'tree') {
            try {
                await deleteTreeDB(dbId);
                state.allTreeMarkers = state.allTreeMarkers.filter(item => item.tree.id !== dbId);
                updateSpeciesFilter();
                updateDashboard();
                showToast('Tree deleted!', 'success');
                haptic([10, 50, 10]);
            } catch (err) {
                if (!navigator.onLine) {
                    queueOfflineAction('delete-tree', { id: dbId });
                    updateQueueBadge();
                    showToast('Deleted offline — will sync later', 'warning');
                } else {
                    showToast('Error deleting tree: ' + err.message, 'error');
                }
            }
        } else if (type === 'plot') {
            try {
                await deletePlotDB(dbId);
                state.allPlotPolygons = state.allPlotPolygons.filter(p => p !== layer);
                updateDashboard();
                showToast('Plot deleted!', 'success');
                haptic([10, 50, 10]);
            } catch (err) {
                if (!navigator.onLine) {
                    queueOfflineAction('delete-plot', { id: dbId });
                    updateQueueBadge();
                    showToast('Deleted offline — will sync later', 'warning');
                } else {
                    showToast('Error deleting plot: ' + err.message, 'error');
                }
            }
        }
    });
}

// ========================================
// Save Tree (#27 validation)
// ========================================
function resetTreeForm() {
    document.getElementById('species').value = '';
    document.getElementById('dbh').value = '';
    document.getElementById('height').value = '';
    document.getElementById('health').value = 'Healthy';
    document.getElementById('notes').value = '';
    photoInput.value = '';
    fileLabel.textContent = '📷 Tap to attach photo';
    fileLabel.classList.remove('has-file');
    photoPreview.style.display = 'none';
}

async function saveTree() {
    if (!state.currentLayer || !state.currentUser) return;

    const species = document.getElementById('species').value || 'Unknown';
    const dbh = parseFloat(document.getElementById('dbh').value) || 0;
    const height = parseFloat(document.getElementById('height').value) || 0;
    const health = document.getElementById('health').value;
    const notes = document.getElementById('notes').value;

    // Validation (#27)
    const errors = validateTreeInput(species, dbh, height);
    if (errors.length > 0) {
        showToast(errors.join('. '), 'error');
        return;
    }

    const latlng = state.currentLayer.getLatLng();
    const file = photoInput.files[0];
    let photoUrl = null;

    if (file) {
        try {
            photoUrl = await uploadPhoto(file);
        } catch (err) {
            showToast('Photo upload failed: ' + err.message, 'error');
        }
    }

    const treeData = {
        species, dbh, height, health, notes,
        latitude: latlng.lat, longitude: latlng.lng,
        photo_url: photoUrl, user_id: state.currentUser.id
    };

    try {
        const saved = await insertTree(treeData);
        state.map.removeLayer(state.currentLayer);
        addTreeToMap(saved);
        state.currentLayer = null;
        closePanel(formPanel);
        updateSpeciesFilter();
        updateDashboard();
        if (state.heatLayer) updateHeatmap(state.heatLayer, state.allTreeMarkers.map(m => m.tree));
        showToast('Tree saved!', 'success');
        haptic();
    } catch (err) {
        if (!navigator.onLine) {
            queueOfflineAction('tree', treeData);
            state.map.removeLayer(state.currentLayer);
            state.currentLayer = null;
            closePanel(formPanel);
            updateQueueBadge();
            showToast('Saved offline — will sync later', 'warning');
        } else {
            showToast('Error saving tree: ' + err.message, 'error');
        }
    }
}

// ========================================
// Save Plot
// ========================================
async function savePlot() {
    if (!state.currentLayer || !state.currentUser) return;

    const latlngs = state.currentLayer.getLatLngs()[0];
    const coordinates = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
    const name = document.getElementById('plot-name').value || 'Unnamed Plot';
    const notes = document.getElementById('plot-notes').value;

    const plotData = { name, notes, coordinates, user_id: state.currentUser.id };

    try {
        const saved = await insertPlot(plotData);
        state.map.removeLayer(state.currentLayer);
        addPlotToMap(saved, state.allTreeMarkers.map(m => m.tree));
        state.currentLayer = null;
        closePanel(plotFormPanel);
        updateDashboard();
        showToast('Plot saved!', 'success');
        haptic();
    } catch (err) {
        if (!navigator.onLine) {
            queueOfflineAction('plot', plotData);
            state.map.removeLayer(state.currentLayer);
            state.currentLayer = null;
            closePanel(plotFormPanel);
            updateQueueBadge();
            showToast('Saved offline — will sync later', 'warning');
        } else {
            showToast('Error saving plot: ' + err.message, 'error');
        }
    }
}

// ========================================
// Edit Tree (#15)
// ========================================
function openEditForm(treeId) {
    const item = state.allTreeMarkers.find(m => m.tree.id === treeId);
    if (!item) return;
    const tree = item.tree;

    state.editingTreeId = treeId;
    state.map.closePopup();

    // Pre-fill form
    document.getElementById('edit-species').value = tree.species || '';
    document.getElementById('edit-dbh').value = tree.dbh || '';
    document.getElementById('edit-height').value = tree.height || '';
    document.getElementById('edit-health').value = tree.health || 'Healthy';
    document.getElementById('edit-notes').value = tree.notes || '';

    closeAllPanels();
    openPanel(editPanel);
}

async function saveEditTree() {
    if (!state.editingTreeId) return;

    const species = document.getElementById('edit-species').value || 'Unknown';
    const dbh = parseFloat(document.getElementById('edit-dbh').value) || 0;
    const height = parseFloat(document.getElementById('edit-height').value) || 0;
    const health = document.getElementById('edit-health').value;
    const notes = document.getElementById('edit-notes').value;

    const errors = validateTreeInput(species, dbh, height);
    if (errors.length > 0) {
        showToast(errors.join('. '), 'error');
        return;
    }

    // Handle edit photo
    const editPhotoInput = document.getElementById('edit-photo');
    let photoUrl = undefined; // undefined = don't update
    if (editPhotoInput?.files[0]) {
        try {
            photoUrl = await uploadPhoto(editPhotoInput.files[0]);
        } catch (err) {
            showToast('Photo upload failed: ' + err.message, 'error');
        }
    }

    const updateData = { species, dbh, height, health, notes };
    if (photoUrl !== undefined) updateData.photo_url = photoUrl;

    try {
        await updateTree(state.editingTreeId, updateData);
        closePanel(editPanel);
        state.editingTreeId = null;
        showToast('Tree updated!', 'success');
        haptic();
        await reloadData();
    } catch (err) {
        if (!navigator.onLine) {
            queueOfflineAction('edit-tree', { id: state.editingTreeId, ...updateData });
            closePanel(editPanel);
            state.editingTreeId = null;
            updateQueueBadge();
            showToast('Edit saved offline — will sync later', 'warning');
        } else {
            showToast('Error updating tree: ' + err.message, 'error');
        }
    }
}

function confirmDeleteTree(treeId) {
    showConfirm(
        'Delete Tree',
        'Are you sure you want to delete this tree? This action cannot be undone.',
        async () => {
            try {
                await deleteTreeDB(treeId);
                // Remove marker
                const item = state.allTreeMarkers.find(m => m.tree.id === treeId);
                if (item) {
                    const group = state.markerClusterGroup || state.drawnItems;
                    group.removeLayer(item.marker);
                }
                state.allTreeMarkers = state.allTreeMarkers.filter(m => m.tree.id !== treeId);
                updateSpeciesFilter();
                updateDashboard();
                showToast('Tree deleted!', 'success');
                haptic([10, 50, 10]);
            } catch (err) {
                if (!navigator.onLine) {
                    queueOfflineAction('delete-tree', { id: treeId });
                    updateQueueBadge();
                    showToast('Deleted offline — will sync later', 'warning');
                } else {
                    showToast('Error deleting tree: ' + err.message, 'error');
                }
            }
        }
    );
}

// ========================================
// CSV Import (#16)
// ========================================
let importPreviewData = null;

function handleImportFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        const csvText = ev.target.result;
        const result = parseCSVImport(csvText);
        importPreviewData = result;

        const preview = document.getElementById('import-preview');
        const errorsDiv = document.getElementById('import-errors');
        const statsDiv = document.getElementById('import-stats');
        const confirmBtn = document.getElementById('confirm-import-btn');

        if (result.errors.length > 0) {
            errorsDiv.innerHTML = result.errors.map(e => `⚠ ${sanitize(e)}`).join('<br>');
            errorsDiv.style.display = 'block';
        } else {
            errorsDiv.style.display = 'none';
        }

        if (result.rows.length > 0) {
            statsDiv.innerHTML = `<span>✅ ${result.rows.length} valid rows</span>`;
            statsDiv.style.display = 'flex';
            confirmBtn.disabled = false;

            // Preview table (first 5 rows)
            const previewRows = result.rows.slice(0, 5);
            let table = '<table class="import-preview-table"><thead><tr>';
            table += '<th>Species</th><th>DBH</th><th>Height</th><th>Health</th><th>Lat</th><th>Lng</th>';
            table += '</tr></thead><tbody>';
            previewRows.forEach(r => {
                table += `<tr><td>${sanitize(r.species)}</td><td>${r.dbh}</td><td>${r.height}</td>`;
                table += `<td>${sanitize(r.health)}</td><td>${r.latitude.toFixed(4)}</td><td>${r.longitude.toFixed(4)}</td></tr>`;
            });
            if (result.rows.length > 5) {
                table += `<tr><td colspan="6" style="text-align:center;color:#7a9a7a">... and ${result.rows.length - 5} more rows</td></tr>`;
            }
            table += '</tbody></table>';
            preview.innerHTML = table;
        } else {
            statsDiv.style.display = 'none';
            confirmBtn.disabled = true;
            preview.innerHTML = '<p style="color:#7a9a7a;text-align:center">No valid data found</p>';
        }
    };
    reader.readAsText(file);
}

async function executeImport() {
    if (!importPreviewData || importPreviewData.rows.length === 0) return;

    const confirmBtn = document.getElementById('confirm-import-btn');
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner"></span>Importing...';

    try {
        const csvText = await readFileAsText(document.getElementById('import-file').files[0]);
        const result = await importTreesFromCSV(csvText);

        closePanel(importPanel);
        showToast(`Imported ${result.imported} of ${result.total} trees!`, result.errors.length > 0 ? 'warning' : 'success');
        if (result.errors.length > 0) {
            console.warn('Import errors:', result.errors);
        }
        haptic();
        await reloadData();
    } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Import Trees';
    }
}

function readFileAsText(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = e => resolve(e.target.result);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
    });
}

// ========================================
// Search (#28 debounced)
// ========================================
function initSearch(map) {
    const searchInput = document.getElementById('search-input');
    const searchBtn = document.getElementById('search-btn');
    const searchResults = document.getElementById('search-results');

    const debouncedSearch = debounce(performSearch, SEARCH_DEBOUNCE_MS);

    async function performSearch() {
        const query = searchInput.value.trim();
        if (!query) return;

        searchBtn.disabled = true;
        searchBtn.textContent = '⏳';
        searchResults.innerHTML = '';
        searchResults.style.display = 'block';

        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5`,
                { headers: { 'Accept-Language': 'en' } }
            );
            const data = await response.json();

            searchResults.innerHTML = '';
            if (data.length === 0) {
                searchResults.innerHTML = '<div class="search-no-results">No places found</div>';
                return;
            }

            data.forEach(item => {
                const div = document.createElement('div');
                div.className = 'search-result-item';
                const parts = item.display_name.split(',');
                const primaryName = parts[0];
                const details = parts.slice(1).join(',').trim();

                div.innerHTML = `<strong>${sanitize(primaryName)}</strong><small>${sanitize(details)}</small>`;
                div.addEventListener('click', () => {
                    const lat = parseFloat(item.lat);
                    const lon = parseFloat(item.lon);
                    map.flyTo([lat, lon], 14);

                    if (state.searchMarker) map.removeLayer(state.searchMarker);
                    state.searchMarker = L.marker([lat, lon], {
                        icon: L.icon({
                            iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
                            shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/0.7.7/images/marker-shadow.png',
                            iconSize: [25, 41], iconAnchor: [12, 41],
                            popupAnchor: [1, -34], shadowSize: [41, 41]
                        })
                    }).addTo(map);
                    state.searchMarker.bindPopup(`<strong>${sanitize(primaryName)}</strong><br><small>${sanitize(details)}</small>`).openPopup();
                    searchResults.style.display = 'none';
                });
                searchResults.appendChild(div);
            });
        } catch (err) {
            searchResults.innerHTML = '<div class="search-no-results">Error fetching search results</div>';
        } finally {
            searchBtn.disabled = false;
            searchBtn.textContent = 'Search';
        }
    }

    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') performSearch();
    });
    // Auto-search on typing (debounced)
    searchInput.addEventListener('input', () => {
        if (searchInput.value.trim().length >= 3) debouncedSearch();
    });

    document.addEventListener('click', (e) => {
        if (!searchInput.contains(e.target) && !searchBtn.contains(e.target) && !searchResults.contains(e.target)) {
            searchResults.style.display = 'none';
        }
    });
}

// ========================================
// User Dropdown
// ========================================
function initUserDropdown() {
    const btn = document.getElementById('user-profile-btn');
    const dropdown = document.getElementById('user-dropdown');
    if (!btn || !dropdown) return;

    btn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdown.classList.toggle('active');
    });

    document.addEventListener('click', (e) => {
        if (!dropdown.contains(e.target) && !btn.contains(e.target)) {
            dropdown.classList.remove('active');
        }
    });
}

// ========================================
// Panel Backdrop
// ========================================
function initPanelBackdrop() {
    const backdrop = document.getElementById('panel-backdrop');
    if (!backdrop) return;

    backdrop.addEventListener('click', () => {
        if (formPanel.classList.contains('active')) {
            if (state.currentLayer) { state.map.removeLayer(state.currentLayer); state.currentLayer = null; }
            closePanel(formPanel);
        } else if (plotFormPanel.classList.contains('active')) {
            if (state.currentLayer) { state.map.removeLayer(state.currentLayer); state.currentLayer = null; }
            closePanel(plotFormPanel);
        } else if (editPanel?.classList.contains('active')) {
            state.editingTreeId = null;
            closePanel(editPanel);
        } else if (importPanel?.classList.contains('active')) {
            closePanel(importPanel);
        } else if (exportPanel?.classList.contains('active')) {
            closePanel(exportPanel);
        }
    });
}

// ========================================
// QR Tag Modal
// ========================================
function initQRModal() {
    document.getElementById('qr-modal-close')?.addEventListener('click', closeQRModal);
    document.getElementById('qr-modal-cancel')?.addEventListener('click', closeQRModal);
    document.getElementById('qr-modal')?.addEventListener('click', (e) => {
        if (e.target.id === 'qr-modal') closeQRModal();
    });
    document.getElementById('qr-print-btn')?.addEventListener('click', () => {
        window.print();
    });
}

function openQRModal(treeId) {
    const item = state.allTreeMarkers.find(m => m.tree.id === treeId);
    if (!item) return;
    const tree = item.tree;

    // Build the deep-link URL
    const url = `${location.origin}${location.pathname}?tree=${tree.id}`;

    // Populate tag fields
    document.getElementById('qr-tag-id').textContent   = `#${tree.id}`;
    document.getElementById('qr-tag-species').textContent = tree.species || 'Unknown';
    document.getElementById('qr-tag-health').textContent  = tree.health  || 'Healthy';
    document.getElementById('qr-tag-dbh').textContent     = `${tree.dbh || 0} cm`;
    document.getElementById('qr-tag-height').textContent  = `${tree.height || 0} m`;

    // Clear previous QR and generate new one
    const canvas = document.getElementById('qr-code-canvas');
    canvas.innerHTML = '';
    // eslint-disable-next-line no-undef
    new QRCode(canvas, {
        text: url,
        width: 160,
        height: 160,
        colorDark: '#1a3a1a',
        colorLight: '#f0f8f0',
        correctLevel: QRCode.CorrectLevel.H
    });

    // Close any open map popup
    state.map?.closePopup();

    document.getElementById('qr-modal').classList.add('active');
}

function closeQRModal() {
    document.getElementById('qr-modal').classList.remove('active');
}

// ========================================
// Deep Link Handler (?tree=ID)
// ========================================
async function handleDeepLink() {
    const params = new URLSearchParams(window.location.search);
    const treeId = parseInt(params.get('tree'), 10);
    if (!treeId) return;

    let item = state.allTreeMarkers.find(m => m.tree.id == treeId);
    
    if (!item) {
        showLoading('Loading tree details...');
        try {
            const { data: tree, error } = await supabase
                .from('trees')
                .select('*')
                .eq('id', treeId)
                .single();

            if (error || !tree) {
                showToast(`Tree #${treeId} not found or access restricted`, 'warning');
                return;
            }

            // Tree exists and is accessible! Let's add it to the map dynamically
            addTreeToMap(tree);
            item = state.allTreeMarkers.find(m => m.tree.id == treeId);
            
            // Update UI dashboard & species list
            updateSpeciesFilter();
            updateDashboard();
            if (state.heatLayer) updateHeatmap(state.heatLayer, state.allTreeMarkers.map(m => m.tree));

        } catch (err) {
            console.error('Error fetching deep-linked tree:', err);
            showToast(`Tree #${treeId} could not be loaded`, 'error');
            return;
        } finally {
            hideLoading();
        }
    }

    if (item) {
        const { marker, tree } = item;
        state.map.flyTo([tree.latitude, tree.longitude], 17, { animate: true, duration: 1.2 });
        setTimeout(() => {
            if (state.markerClusterGroup) {
                state.markerClusterGroup.zoomToShowLayer(marker, () => marker.openPopup());
            } else {
                marker.openPopup();
            }
            showToast(`📍 Showing Tree #${treeId} — ${tree.species || 'Unknown'}`, 'info', 3000);
        }, 1400);
    }

    // Clean URL without reload
    const cleanUrl = window.location.pathname;
    window.history.replaceState({}, '', cleanUrl);
}
