// ========================================
// OpenGIS — Main Application
// ========================================

import { supabase, state, MAX_PHOTO_SIZE, SEARCH_DEBOUNCE_MS, LAYER_COLORS, DEFAULT_SCHEMA, IS_LOW_END } from './config.js';
import { sanitize, debounce, validateFeatureInput, haptic, parseCSVImport, parseGeoJSONImport, fetchElevation, haversineDistance, featureIdToCode, featureCodeToId } from './utils.js';
import {
    showToast, showLoading, hideLoading, showConfirm, initConfirmModal,
    showStatus, updateQueueBadge, openPanel, closePanel, closeAllPanels,
    initDashboard, updateDashboard, initInstallPrompt,
    initLightbox, openLightbox, initSwipeDismiss,
    generateFormFields, readFormFields, renderLayerList, renderProjectCards
} from './ui.js';
import {
    uploadPhoto, insertFeature, updateFeature, deleteFeature as deleteFeatureDB,
    createLayer, updateLayer, deleteLayer as deleteLayerDB,
    loadProjects, createProject, deleteProject as deleteProjectDB,
    loadLayers, loadFeatures, queueOfflineAction, flushOfflineQueue,
    exportData, importFeaturesFromCSV, initRealtime,
    createBlankProject, createForestryProject, toggleProjectShare
} from './data.js';
import {
    initMap, addTileLayers, addDrawControls, initGPS,
    createClusterGroup, initHeatmap,
    updateHeatmap, toggleHeatmap, createMapLayer
} from './map.js';

// ========================================
// DOM References
// ========================================
const authScreen = document.getElementById('auth-screen');
const appContainer = document.getElementById('app-container');
const projectScreen = document.getElementById('project-screen');
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

const featureFormPanel = document.getElementById('feature-form-panel');
const editPanel = document.getElementById('edit-panel');
const importPanel = document.getElementById('import-panel');
const exportPanel = document.getElementById('export-panel');

const photoInput = document.getElementById('photo');
const fileLabel = document.getElementById('file-label');
const photoPreview = document.getElementById('photo-preview');
const photoPreviewImg = document.getElementById('photo-preview-img');

// ========================================
// Authentication
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
        showProjectScreen();
    } else {
        state.currentUser = null;
        authScreen.classList.remove('hidden');
        appContainer.classList.remove('visible');
        projectScreen.classList.remove('visible');
        if (window.startAuthParticles) {
            window.startAuthParticles();
        }
    }
});

// ========================================
// Auth Screen Visual Enhancements
// ========================================
function initAuthParticles() {
    const canvas = document.getElementById('auth-particles-canvas');
    if (!canvas) return;

    // Skip particles on low-end devices
    if (IS_LOW_END) return;

    const ctx = canvas.getContext('2d');
    let animationFrameId = null;
    let particles = [];
    const maxParticles = 40;

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
                size: Math.random() * 1.5 + 0.6,
                speedY: -(Math.random() * 0.3 + 0.1),
                swayRange: Math.random() * 8 + 3,
                swaySpeed: Math.random() * 0.012 + 0.004,
                angle: Math.random() * Math.PI * 2,
                opacity: Math.random() * 0.4 + 0.15,
                pulseSpeed: Math.random() * 0.015 + 0.006,
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
            const currentOpacity = Math.max(0.05, p.opacity + Math.sin(p.pulseAngle) * 0.1);

            const grad = ctx.createRadialGradient(currentX, p.y, 0, currentX, p.y, p.size * 3);
            grad.addColorStop(0, `rgba(100, 180, 255, ${currentOpacity})`);
            grad.addColorStop(0.3, `rgba(76, 154, 255, ${currentOpacity * 0.5})`);
            grad.addColorStop(1, 'rgba(76, 154, 255, 0)');

            ctx.beginPath();
            ctx.fillStyle = grad;
            ctx.arc(currentX, p.y, p.size * 3, 0, Math.PI * 2);
            ctx.fill();

            p.y += p.speedY;
            p.angle += p.swaySpeed;
            p.pulseAngle += p.pulseSpeed;

            if (p.y < -15) {
                p.y = height + 15;
                p.x = Math.random() * width;
                p.opacity = Math.random() * 0.4 + 0.15;
            }
        });

        animationFrameId = requestAnimationFrame(draw);
    }

    function start() {
        resizeCanvas();
        createParticles();
        if (!animationFrameId) draw();
    }

    window.addEventListener('resize', () => {
        resizeCanvas();
        if (particles.length === 0) createParticles();
    });

    start();

    window.startAuthParticles = () => {
        if (!animationFrameId) start();
    };
}

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

        let level = 0;
        if (val.length > 0) {
            if (score <= 2) level = 1;
            else if (score <= 4) level = 2;
            else level = 3;
        }

        segments.forEach(seg => { seg.className = 'auth-strength-segment'; });

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

initAuthParticles();
initPasswordStrength();

// Global copy text helper
window.copyText = function(text, label = 'Coordinates') {
    if (!text || text === '—') return;
    navigator.clipboard.writeText(text).then(() => {
        showToast(`${label} copied to clipboard!`, 'success');
    }).catch(err => {
        console.error('Failed to copy: ', err);
    });
};

// ========================================
// Project Screen
// ========================================
async function showProjectScreen() {
    projectScreen.classList.add('visible');
    appContainer.classList.remove('visible');

    showLoading('Loading your projects...');
    try {
        state.projects = await loadProjects();
        renderProjectCards(
            state.projects,
            openProject,
            confirmDeleteProject
        );
    } catch (err) {
        console.error('Error loading projects:', err);
        showToast('Error loading projects: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
}

// New project buttons
document.getElementById('new-blank-project')?.addEventListener('click', async () => {
    const nameInput = document.getElementById('new-project-name');
    const name = nameInput?.value?.trim() || 'Untitled Map';
    showLoading('Creating project...');
    try {
        const project = await createBlankProject(name);
        if (nameInput) nameInput.value = '';
        showToast('Project created!', 'success');
        openProject(project);
    } catch (err) {
        showToast('Error creating project: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
});

document.getElementById('new-forestry-project')?.addEventListener('click', async () => {
    showLoading('Creating forestry project...');
    try {
        const project = await createForestryProject();
        showToast('Forestry project created!', 'success');
        openProject(project);
    } catch (err) {
        showToast('Error creating project: ' + err.message, 'error');
    } finally {
        hideLoading();
    }
});

function confirmDeleteProject(project) {
    showConfirm(
        'Delete Project',
        `Delete "${project.name}"? All layers and features will be permanently removed.`,
        async () => {
            try {
                await deleteProjectDB(project.id);
                state.projects = state.projects.filter(p => p.id !== project.id);
                renderProjectCards(state.projects, openProject, confirmDeleteProject);
                showToast('Project deleted', 'success');
            } catch (err) {
                showToast('Error deleting project: ' + err.message, 'error');
            }
        }
    );
}

async function openProject(project) {
    state.activeProject = project;
    projectScreen.classList.remove('visible');
    appContainer.classList.add('visible');

    // Update project name in header
    const projectNameEl = document.getElementById('project-name-display');
    if (projectNameEl) projectNameEl.textContent = project.name;

    await initApp();
}

// Back to projects button
document.getElementById('back-to-projects')?.addEventListener('click', () => {
    state.activeProject = null;
    state.appInitialized = false;
    clearAppState();
    showProjectScreen();
});

// ========================================
// App Initialization
// ========================================
async function initApp() {
    if (state.appInitialized) {
        await reloadData();
        return;
    }
    state.appInitialized = true;

    const map = initMap('map');
    addTileLayers(map);

    state.drawnItems = new L.FeatureGroup();
    map.addLayer(state.drawnItems);

    state.markerClusterGroup = createClusterGroup();
    if (state.markerClusterGroup) {
        map.addLayer(state.markerClusterGroup);
    }

    addDrawControls(map, state.drawnItems);
    initGPS(map);

    state.heatLayer = initHeatmap(map);

    // Heatmap toggle
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
    if (photoInput) photoInput.addEventListener('change', handlePhotoChange);

    // Draw events
    map.on('draw:created', handleDrawCreated);
    map.on('draw:edited', handleDrawEdited);
    map.on('draw:deleted', handleDrawDeleted);

    // Form buttons
    document.getElementById('cancel-feature-btn')?.addEventListener('click', () => {
        if (state.currentLayer) { map.removeLayer(state.currentLayer); state.currentLayer = null; }
        closePanel(featureFormPanel);
    });

    document.getElementById('save-feature-btn')?.addEventListener('click', saveFeature);

    // Edit panel
    document.getElementById('cancel-edit-btn')?.addEventListener('click', () => {
        state.editingFeatureId = null;
        closePanel(editPanel);
    });
    document.getElementById('save-edit-btn')?.addEventListener('click', saveEditFeature);

    // Import panel
    document.getElementById('cancel-import-btn')?.addEventListener('click', () => closePanel(importPanel));
    document.getElementById('import-file')?.addEventListener('change', handleImportFileChange);
    document.getElementById('confirm-import-btn')?.addEventListener('click', executeImport);

    // Export panel
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

    // Layer management
    document.getElementById('add-layer-btn')?.addEventListener('click', showAddLayerDialog);

    // Collapsible layer panel on mobile
    const layerPanel = document.getElementById('layer-panel');
    if (layerPanel) {
        const header = layerPanel.querySelector('.layer-panel-header');
        if (header) {
            header.style.cursor = 'pointer';
            header.addEventListener('click', (e) => {
                if (e.target.closest('#add-layer-btn')) return;
                layerPanel.classList.toggle('collapsed');
            });
        }
        if (window.innerWidth <= 768) {
            layerPanel.classList.add('collapsed');
        }
    }

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

    // Search
    initSearch(map);

    // User dropdown
    initUserDropdown();

    // Panel backdrop
    initPanelBackdrop();

    // Confirm modal
    initConfirmModal();

    // Dashboard
    initDashboard();

    // Install prompt
    initInstallPrompt();

    // Lightbox
    initLightbox();
    window.addEventListener('open-lightbox', (e) => openLightbox(e.detail));

    // Feature edit/delete events
    window.addEventListener('edit-feature', (e) => openEditForm(e.detail));
    window.addEventListener('delete-feature', (e) => confirmDeleteFeature(e.detail));

    // Swipe to dismiss
    initSwipeDismiss();

    // Realtime
    initRealtime(
        (payload) => {
            if (['INSERT', 'UPDATE', 'DELETE'].includes(payload.eventType)) {
                reloadData();
            }
        },
        (payload) => {
            if (['INSERT', 'UPDATE', 'DELETE'].includes(payload.eventType)) {
                reloadData();
            }
        }
    );

    // Service Worker
    if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.register('./sw.js');
        console.log('SW registered:', reg.scope);
        if ('sync' in reg) {
            try { await reg.sync.register('sync-offline-queue'); } catch (e) { }
        }
    }

    updateQueueBadge();
    await reloadData();
}

// ========================================
// Data Loading
// ========================================
async function reloadData() {
    if (state.isLoadingData || !state.activeProject) return;
    state.isLoadingData = true;
    showLoading('Loading map data...');

    clearAppState();

    try {
        const [layers, features] = await Promise.all([
            loadLayers(state.activeProject.id),
            loadFeatures(state.activeProject.id)
        ]);

        state.layers = layers;

        // Set active layer to first layer if none selected
        if (!state.activeLayerId && layers.length > 0) {
            state.activeLayerId = layers[0].id;
        }

        // Create a lookup map for layers
        const layerMap = {};
        layers.forEach(l => { layerMap[l.id] = l; });

        // Add features to map
        features.forEach(feature => {
            const layer = layerMap[feature.layer_id];
            if (!layer) return;
            addFeatureToMap(feature, layer);
        });

        // Update heatmap
        if (state.heatLayer) {
            updateHeatmap(state.heatLayer, features);
        }

        // Update UI
        renderLayerList(state.layers, handleLayerToggle, handleLayerSelect, confirmDeleteLayer);
        updateDashboard();

    } catch (err) {
        console.error('Error loading data:', err);
        showToast('Error loading data: ' + err.message, 'error');
    } finally {
        hideLoading();
        state.isLoadingData = false;
    }
}

function clearAppState() {
    if (state.markerClusterGroup) state.markerClusterGroup.clearLayers();
    if (state.drawnItems) state.drawnItems.clearLayers();
    state.allFeatures = [];

    const layerPanel = document.getElementById('layer-panel');
    if (layerPanel) {
        if (window.innerWidth <= 768) {
            layerPanel.classList.add('collapsed');
        } else {
            layerPanel.classList.remove('collapsed');
        }
    }
}

function addFeatureToMap(feature, layer) {
    if (layer.visible === false) return; // Don't render invisible layers

    const mapLayer = createMapLayer(feature, layer);
    if (!mapLayer) return;

    if (feature.geometry_type === 'Point' && state.markerClusterGroup) {
        state.markerClusterGroup.addLayer(mapLayer);
    } else {
        state.drawnItems.addLayer(mapLayer);
    }

    state.allFeatures.push({ feature, mapLayer, layerId: layer.id });
}

// ========================================
// Layer Management
// ========================================
function handleLayerToggle(layerId) {
    const layer = state.layers.find(l => l.id === layerId);
    if (!layer) return;

    layer.visible = layer.visible === false ? true : false;

    // Update on server (fire-and-forget)
    updateLayer(layerId, { visible: layer.visible }).catch(() => {});

    // Re-render
    reloadData();
}

function handleLayerSelect(layerId) {
    state.activeLayerId = layerId;

    // Update layer list UI
    document.querySelectorAll('.layer-item').forEach(el => {
        el.classList.toggle('active', el.dataset.layerId == layerId);
    });

    // Update active layer indicator
    const layer = state.layers.find(l => l.id === layerId);
    const indicator = document.getElementById('active-layer-name');
    if (indicator && layer) {
        indicator.textContent = `${layer.icon || '📍'} ${layer.name}`;
        indicator.style.color = layer.color;
    }
}

function confirmDeleteLayer(layerId) {
    const layer = state.layers.find(l => l.id === layerId);
    if (!layer) return;

    showConfirm(
        'Delete Layer',
        `Delete "${layer.name}"? All features in this layer will be permanently removed.`,
        async () => {
            try {
                await deleteLayerDB(layerId);
                state.layers = state.layers.filter(l => l.id !== layerId);
                if (state.activeLayerId === layerId) {
                    state.activeLayerId = state.layers.length > 0 ? state.layers[0].id : null;
                }
                showToast('Layer deleted', 'success');
                haptic([10, 50, 10]);
                await reloadData();
            } catch (err) {
                showToast('Error deleting layer: ' + err.message, 'error');
            }
        }
    );
}

function showAddLayerDialog() {
    const name = prompt('Layer name:');
    if (!name || !name.trim()) return;

    const colorIndex = state.layers.length % LAYER_COLORS.length;

    createLayer({
        project_id: state.activeProject.id,
        name: name.trim(),
        color: LAYER_COLORS[colorIndex],
        icon: '📍',
        geometry_type: 'Point',
        schema: DEFAULT_SCHEMA,
        visible: true,
        order_index: state.layers.length,
    }).then(async () => {
        showToast('Layer created!', 'success');
        await reloadData();
    }).catch(err => {
        showToast('Error creating layer: ' + err.message, 'error');
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

    if (!state.activeLayerId || state.layers.length === 0) {
        showToast('Please create a layer first before adding features', 'warning');
        state.map.removeLayer(state.currentLayer);
        state.currentLayer = null;
        return;
    }

    const activeLayer = state.layers.find(l => l.id === state.activeLayerId);

    if (type === 'marker') {
        state.currentDrawType = 'Point';
        const latlng = layer.getLatLng();
        const coordsDisplay = document.getElementById('new-feature-coords');
        if (coordsDisplay) coordsDisplay.textContent = `${latlng.lat.toFixed(6)}, ${latlng.lng.toFixed(6)}`;

        // Generate form fields from layer schema
        const fieldsContainer = document.getElementById('feature-form-fields');
        generateFormFields(fieldsContainer, activeLayer?.schema || DEFAULT_SCHEMA);

        // Auto-fetch elevation if schema has elevation field
        if (activeLayer?.schema?.find(f => f.key === 'elevation')) {
            fetchElevation(latlng.lat, latlng.lng).then(elev => {
                const elevInput = document.getElementById('field-elevation');
                if (elevInput) elevInput.value = elev.toFixed(1);
            });
        }

        // Update form title
        const formTitle = document.getElementById('feature-form-title');
        if (formTitle) formTitle.textContent = `${activeLayer?.icon || '📍'} New ${activeLayer?.name || 'Feature'}`;

        openPanel(featureFormPanel);

    } else if (type === 'polyline') {
        state.currentDrawType = 'LineString';
        const latlngs = layer.getLatLngs();
        let totalDistance = 0;
        for (let i = 0; i < latlngs.length - 1; i++) {
            totalDistance += haversineDistance(latlngs[i].lat, latlngs[i].lng, latlngs[i + 1].lat, latlngs[i + 1].lng);
        }
        const distStr = totalDistance > 1000 ? (totalDistance / 1000).toFixed(2) + ' km' : totalDistance.toFixed(1) + ' m';

        // Show form
        const fieldsContainer = document.getElementById('feature-form-fields');
        generateFormFields(fieldsContainer, activeLayer?.schema || DEFAULT_SCHEMA);

        const coordsDisplay = document.getElementById('new-feature-coords');
        if (coordsDisplay) coordsDisplay.textContent = `📏 ${distStr} (${latlngs.length} points)`;

        const formTitle = document.getElementById('feature-form-title');
        if (formTitle) formTitle.textContent = `📏 New Line`;

        openPanel(featureFormPanel);

    } else if (type === 'polygon' || type === 'rectangle') {
        state.currentDrawType = 'Polygon';

        const fieldsContainer = document.getElementById('feature-form-fields');
        generateFormFields(fieldsContainer, activeLayer?.schema || DEFAULT_SCHEMA);

        const coordsDisplay = document.getElementById('new-feature-coords');
        if (coordsDisplay) coordsDisplay.textContent = `📐 Polygon`;

        const formTitle = document.getElementById('feature-form-title');
        if (formTitle) formTitle.textContent = `📐 New Area`;

        openPanel(featureFormPanel);
    }
}

async function handleDrawEdited(e) {
    const layers = e.layers;
    layers.eachLayer(async (layer) => {
        const dbId = layer.databaseId;
        if (!dbId) return;

        let coordinates;
        if (layer.getLatLng) {
            const ll = layer.getLatLng();
            coordinates = { lat: ll.lat, lng: ll.lng };
        } else if (layer.getLatLngs) {
            const lls = layer.getLatLngs();
            const flat = Array.isArray(lls[0]) && Array.isArray(lls[0][0]) ? lls[0] : lls;
            const arr = Array.isArray(flat[0]) ? flat : [flat];
            coordinates = arr[0].map(ll => ({ lat: ll.lat, lng: ll.lng }));
        }

        try {
            await updateFeature(dbId, { coordinates });
            showToast('Feature location updated!', 'success');
            haptic();
        } catch (err) {
            if (!navigator.onLine) {
                queueOfflineAction('edit-feature', { id: dbId, coordinates });
                updateQueueBadge();
                showToast('Saved edit offline — will sync later', 'warning');
            } else {
                showToast('Error updating feature: ' + err.message, 'error');
            }
        }
    });
}

function handleDrawDeleted(e) {
    const layers = e.layers;
    layers.eachLayer(async (layer) => {
        const dbId = layer.databaseId;
        if (!dbId) return;

        try {
            await deleteFeatureDB(dbId);
            state.allFeatures = state.allFeatures.filter(f => f.feature.id !== dbId);
            updateDashboard();
            showToast('Feature deleted!', 'success');
            haptic([10, 50, 10]);
        } catch (err) {
            if (!navigator.onLine) {
                queueOfflineAction('delete-feature', { id: dbId });
                updateQueueBadge();
                showToast('Deleted offline — will sync later', 'warning');
            } else {
                showToast('Error deleting feature: ' + err.message, 'error');
            }
        }
    });
}

// ========================================
// Save Feature
// ========================================
async function saveFeature() {
    if (!state.currentLayer || !state.currentUser || !state.activeLayerId) return;

    const activeLayer = state.layers.find(l => l.id === state.activeLayerId);
    const schema = activeLayer?.schema || DEFAULT_SCHEMA;
    const attributes = readFormFields(schema);

    // Validation
    const errors = validateFeatureInput(attributes, schema);
    if (errors.length > 0) {
        showToast(errors.join('. '), 'error');
        return;
    }

    // Get coordinates based on geometry type
    let coordinates;
    if (state.currentDrawType === 'Point') {
        const latlng = state.currentLayer.getLatLng();
        coordinates = { lat: latlng.lat, lng: latlng.lng };
    } else if (state.currentDrawType === 'LineString') {
        coordinates = state.currentLayer.getLatLngs().map(ll => ({ lat: ll.lat, lng: ll.lng }));
    } else if (state.currentDrawType === 'Polygon') {
        const latlngs = state.currentLayer.getLatLngs()[0];
        coordinates = latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }));
    }

    // Photo
    const file = photoInput?.files?.[0];
    let photoUrl = null;
    if (file) {
        try { photoUrl = await uploadPhoto(file); } catch (err) {
            showToast('Photo upload failed: ' + err.message, 'error');
        }
    }

    const featureData = {
        layer_id: state.activeLayerId,
        geometry_type: state.currentDrawType,
        coordinates,
        attributes,
        photo_url: photoUrl,
        user_id: state.currentUser.id,
    };

    try {
        await insertFeature(featureData);
        state.map.removeLayer(state.currentLayer);
        state.currentLayer = null;
        closePanel(featureFormPanel);
        showToast('Feature saved!', 'success');
        haptic();
        await reloadData();
    } catch (err) {
        if (!navigator.onLine) {
            queueOfflineAction('feature', featureData);
            state.map.removeLayer(state.currentLayer);
            state.currentLayer = null;
            closePanel(featureFormPanel);
            updateQueueBadge();
            showToast('Saved offline — will sync later', 'warning');
        } else {
            showToast('Error saving feature: ' + err.message, 'error');
        }
    }
}

// ========================================
// Edit Feature
// ========================================
function openEditForm(featureId) {
    const item = state.allFeatures.find(f => f.feature.id === featureId);
    if (!item) return;
    const feature = item.feature;
    const layer = state.layers.find(l => l.id === feature.layer_id);

    state.editingFeatureId = featureId;
    state.map.closePopup();

    // Generate form fields with current values
    const fieldsContainer = document.getElementById('edit-form-fields');
    generateFormFields(fieldsContainer, layer?.schema || DEFAULT_SCHEMA, feature.attributes || {});

    // Coordinates display
    const coordsDisplay = document.getElementById('edit-feature-coords');
    if (coordsDisplay && feature.coordinates) {
        if (feature.geometry_type === 'Point') {
            coordsDisplay.textContent = `${parseFloat(feature.coordinates.lat).toFixed(6)}, ${parseFloat(feature.coordinates.lng).toFixed(6)}`;
        } else {
            coordsDisplay.textContent = `${feature.geometry_type} (${Array.isArray(feature.coordinates) ? feature.coordinates.length : 0} points)`;
        }
    }

    // Title
    const editTitle = document.getElementById('edit-form-title');
    if (editTitle) editTitle.textContent = `✏️ Edit ${layer?.name || 'Feature'}`;

    closeAllPanels();
    openPanel(editPanel);
}

async function saveEditFeature() {
    if (!state.editingFeatureId) return;

    const item = state.allFeatures.find(f => f.feature.id === state.editingFeatureId);
    if (!item) return;
    const layer = state.layers.find(l => l.id === item.feature.layer_id);
    const schema = layer?.schema || DEFAULT_SCHEMA;
    const attributes = readFormFields(schema);

    const errors = validateFeatureInput(attributes, schema);
    if (errors.length > 0) {
        showToast(errors.join('. '), 'error');
        return;
    }

    // Handle photo
    const editPhotoInput = document.getElementById('edit-photo');
    let photoUrl = undefined;
    if (editPhotoInput?.files?.[0]) {
        try { photoUrl = await uploadPhoto(editPhotoInput.files[0]); } catch (err) {
            showToast('Photo upload failed: ' + err.message, 'error');
        }
    }

    const updateData = { attributes };
    if (photoUrl !== undefined) updateData.photo_url = photoUrl;

    try {
        await updateFeature(state.editingFeatureId, updateData);
        closePanel(editPanel);
        state.editingFeatureId = null;
        showToast('Feature updated!', 'success');
        haptic();
        await reloadData();
    } catch (err) {
        if (!navigator.onLine) {
            queueOfflineAction('edit-feature', { id: state.editingFeatureId, ...updateData });
            closePanel(editPanel);
            state.editingFeatureId = null;
            updateQueueBadge();
            showToast('Edit saved offline — will sync later', 'warning');
        } else {
            showToast('Error updating feature: ' + err.message, 'error');
        }
    }
}

function confirmDeleteFeature(featureId) {
    showConfirm(
        'Delete Feature',
        'Are you sure you want to delete this feature? This action cannot be undone.',
        async () => {
            try {
                await deleteFeatureDB(featureId);
                const item = state.allFeatures.find(f => f.feature.id === featureId);
                if (item) {
                    const group = item.feature.geometry_type === 'Point' && state.markerClusterGroup
                        ? state.markerClusterGroup : state.drawnItems;
                    group.removeLayer(item.mapLayer);
                }
                state.allFeatures = state.allFeatures.filter(f => f.feature.id !== featureId);
                updateDashboard();
                showToast('Feature deleted!', 'success');
                haptic([10, 50, 10]);
            } catch (err) {
                if (!navigator.onLine) {
                    queueOfflineAction('delete-feature', { id: featureId });
                    updateQueueBadge();
                    showToast('Deleted offline — will sync later', 'warning');
                } else {
                    showToast('Error deleting feature: ' + err.message, 'error');
                }
            }
        }
    );
}

// ========================================
// CSV/GeoJSON Import
// ========================================
let importPreviewData = null;

function handleImportFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
        const text = ev.target.result;
        const isGeoJSON = file.name.endsWith('.geojson') || file.name.endsWith('.json');

        if (isGeoJSON) {
            const result = parseGeoJSONImport(text);
            importPreviewData = { type: 'geojson', ...result };
        } else {
            const result = parseCSVImport(text);
            importPreviewData = { type: 'csv', ...result };
        }

        const errorsDiv = document.getElementById('import-errors');
        const statsDiv = document.getElementById('import-stats');
        const confirmBtn = document.getElementById('confirm-import-btn');
        const preview = document.getElementById('import-preview');

        const itemCount = importPreviewData.type === 'geojson'
            ? importPreviewData.features?.length || 0
            : importPreviewData.rows?.length || 0;
        const errs = importPreviewData.errors || [];

        if (errs.length > 0) {
            errorsDiv.innerHTML = errs.map(e => `⚠ ${sanitize(e)}`).join('<br>');
            errorsDiv.style.display = 'block';
        } else {
            errorsDiv.style.display = 'none';
        }

        if (itemCount > 0) {
            statsDiv.innerHTML = `<span>✅ ${itemCount} valid features</span>`;
            statsDiv.style.display = 'flex';
            confirmBtn.disabled = false;
            preview.innerHTML = `<p style="color: var(--text-muted); text-align: center;">
                Ready to import ${itemCount} features into the active layer</p>`;
        } else {
            statsDiv.style.display = 'none';
            confirmBtn.disabled = true;
            preview.innerHTML = '<p style="color: var(--text-muted); text-align: center;">No valid data found</p>';
        }
    };
    reader.readAsText(file);
}

async function executeImport() {
    if (!importPreviewData || !state.activeLayerId) return;

    const confirmBtn = document.getElementById('confirm-import-btn');
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = '<span class="spinner"></span>Importing...';

    try {
        if (importPreviewData.type === 'csv') {
            const file = document.getElementById('import-file').files[0];
            const text = await readFileAsText(file);
            const result = await importFeaturesFromCSV(text, state.activeLayerId);
            closePanel(importPanel);
            showToast(`Imported ${result.imported} of ${result.total} features!`,
                result.errors.length > 0 ? 'warning' : 'success');
        } else if (importPreviewData.type === 'geojson') {
            // Import GeoJSON features one by one
            let imported = 0;
            for (const f of importPreviewData.features) {
                try {
                    await insertFeature({
                        layer_id: state.activeLayerId,
                        geometry_type: f.geometry_type,
                        coordinates: f.coordinates,
                        attributes: f.attributes,
                        photo_url: f.photo_url,
                        user_id: state.currentUser.id,
                    });
                    imported++;
                } catch (err) {
                    console.warn('Import feature error:', err);
                }
            }
            closePanel(importPanel);
            showToast(`Imported ${imported} features!`, 'success');
        }

        haptic();
        await reloadData();
    } catch (err) {
        showToast('Import failed: ' + err.message, 'error');
    } finally {
        confirmBtn.disabled = false;
        confirmBtn.textContent = 'Import Features';
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
// Search
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
                    state.searchMarker = L.circleMarker([lat, lon], {
                        radius: 10,
                        fillColor: '#FF6B6B',
                        fillOpacity: 1,
                        color: '#fff',
                        weight: 3
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
        if (featureFormPanel?.classList.contains('active')) {
            if (state.currentLayer) { state.map.removeLayer(state.currentLayer); state.currentLayer = null; }
            closePanel(featureFormPanel);
        } else if (editPanel?.classList.contains('active')) {
            state.editingFeatureId = null;
            closePanel(editPanel);
        } else if (importPanel?.classList.contains('active')) {
            closePanel(importPanel);
        } else if (exportPanel?.classList.contains('active')) {
            closePanel(exportPanel);
        }
    });
}
