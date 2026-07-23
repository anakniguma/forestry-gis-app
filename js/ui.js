// ========================================
// OpenGIS — UI Components
// ========================================

import { state, LAYER_COLORS, LAYER_ICONS } from './config.js';
import { sanitize, formatNumber } from './utils.js';

// --- Toast Notification System ---
let toastCounter = 0;

export function showToast(message, type = 'success', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const icons = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' };
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.id = `toast-${++toastCounter}`;
    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <span class="toast-message">${sanitize(message)}</span>
        <button class="toast-close" aria-label="Close">✕</button>
    `;

    toast.querySelector('.toast-close').addEventListener('click', () => removeToast(toast));
    toast.addEventListener('click', () => removeToast(toast));

    container.appendChild(toast);

    if (duration > 0) {
        setTimeout(() => removeToast(toast), duration);
    }
}

function removeToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add('removing');
    setTimeout(() => toast.remove(), 300);
}

// --- Loading Overlay ---
export function showLoading(message = 'Loading...') {
    const overlay = document.getElementById('loading-overlay');
    const text = overlay?.querySelector('.loading-text');
    if (overlay) {
        if (text) text.textContent = message;
        overlay.classList.add('active');
    }
}

export function hideLoading() {
    const overlay = document.getElementById('loading-overlay');
    if (overlay) overlay.classList.remove('active');
}

// --- Confirmation Modal ---
let confirmCallback = null;

export function showConfirm(title, message, onConfirm) {
    const modal = document.getElementById('confirm-modal');
    if (!modal) return;

    modal.querySelector('.confirm-card h3').textContent = title;
    modal.querySelector('.confirm-card p').textContent = message;
    confirmCallback = onConfirm;
    modal.classList.add('active');
}

export function hideConfirm() {
    const modal = document.getElementById('confirm-modal');
    if (modal) modal.classList.remove('active');
    confirmCallback = null;
}

export function initConfirmModal() {
    const modal = document.getElementById('confirm-modal');
    if (!modal) return;

    modal.querySelector('#confirm-yes').addEventListener('click', () => {
        if (confirmCallback) confirmCallback();
        hideConfirm();
    });

    modal.querySelector('#confirm-no').addEventListener('click', () => {
        hideConfirm();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) hideConfirm();
    });
}

// --- Status Indicator ---
export function showStatus(message, type) {
    const indicator = document.getElementById('status-indicator');
    const text = document.getElementById('status-text');
    if (!indicator || !text) return;

    text.textContent = message;
    indicator.className = type + ' show';

    if (type === 'online') {
        setTimeout(() => indicator.classList.remove('show'), 3000);
    }
}

// --- Offline Queue Badge ---
export function updateQueueBadge() {
    const badge = document.getElementById('queue-badge');
    const queue = JSON.parse(localStorage.getItem('offlineQueue') || '[]');
    if (badge) {
        if (queue.length > 0) {
            badge.textContent = `⏳ ${queue.length} item${queue.length > 1 ? 's' : ''} queued`;
            badge.style.display = 'block';
        } else {
            badge.style.display = 'none';
        }
    }
}

// --- Panel Management ---
export function openPanel(panel) {
    if (!panel) return;
    panel.style.display = 'block';
    panel.classList.add('active');
    document.body.classList.add('has-active-panel');
    const backdrop = document.getElementById('panel-backdrop');
    if (backdrop) backdrop.classList.add('active');
}

export function closePanel(panel) {
    if (!panel) return;
    panel.style.display = 'none';
    panel.classList.remove('active');
    document.body.classList.remove('has-active-panel');
    const backdrop = document.getElementById('panel-backdrop');
    if (backdrop) backdrop.classList.remove('active');
}

export function closeAllPanels() {
    document.querySelectorAll('.panel').forEach(p => {
        p.style.display = 'none';
        p.classList.remove('active');
    });
    document.body.classList.remove('has-active-panel');
    const backdrop = document.getElementById('panel-backdrop');
    if (backdrop) backdrop.classList.remove('active');
}

// --- Dashboard ---
export function initDashboard() {
    const toggle = document.getElementById('dashboard-toggle');
    const panel = document.getElementById('dashboard-panel');
    const close = document.getElementById('dashboard-close');

    if (toggle) toggle.addEventListener('click', () => panel?.classList.toggle('open'));
    if (close) close.addEventListener('click', () => panel?.classList.remove('open'));
}

export function updateDashboard() {
    const features = state.allFeatures.map(f => f.feature);
    const layers = state.layers;

    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    // Total features
    setVal('stat-total-features', features.length);
    setVal('stat-total-layers', layers.length);

    // Count by geometry type
    const points = features.filter(f => f.geometry_type === 'Point').length;
    const lines = features.filter(f => f.geometry_type === 'LineString').length;
    const polygons = features.filter(f => f.geometry_type === 'Polygon').length;
    setVal('stat-total-points', points);
    setVal('stat-total-lines', lines);
    setVal('stat-total-polygons', polygons);

    // Per-layer counts
    const layerCountsContainer = document.getElementById('layer-feature-counts');
    if (layerCountsContainer) {
        layerCountsContainer.innerHTML = '';
        layers.forEach(layer => {
            const count = features.filter(f => f.layer_id === layer.id).length;
            const div = document.createElement('div');
            div.className = 'stat-card';
            div.innerHTML = `
                <span class="stat-value" style="color: ${layer.color}">${count}</span>
                <span class="stat-label">${layer.icon || '📍'} ${sanitize(layer.name)}</span>
            `;
            layerCountsContainer.appendChild(div);
        });
    }

    // Layer distribution chart
    if (typeof Chart !== 'undefined' && layers.length > 0) {
        updateLayerChart(layers, features);
    }
}

function updateLayerChart(layers, features) {
    const canvas = document.getElementById('layer-chart');
    if (!canvas) return;

    if (state.chartInstance) state.chartInstance.destroy();

    const data = layers.map(l => ({
        name: l.name,
        count: features.filter(f => f.layer_id === l.id).length,
        color: l.color,
    }));

    state.chartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: data.map(d => d.name),
            datasets: [{
                data: data.map(d => d.count),
                backgroundColor: data.map(d => d.color + '99'), // semi-transparent
                borderColor: data.map(d => d.color),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // No animation — better for low-end devices
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 10 }, padding: 8 }
                }
            }
        }
    });
}

// --- PWA Install Prompt ---
export function initInstallPrompt() {
    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        state.deferredInstallPrompt = e;
        const banner = document.getElementById('install-banner');
        if (banner) banner.classList.add('show');
    });

    const installBtn = document.getElementById('install-accept');
    const dismissBtn = document.getElementById('install-dismiss');

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (state.deferredInstallPrompt) {
                state.deferredInstallPrompt.prompt();
                const result = await state.deferredInstallPrompt.userChoice;
                state.deferredInstallPrompt = null;
                const banner = document.getElementById('install-banner');
                if (banner) banner.classList.remove('show');
                if (result.outcome === 'accepted') {
                    showToast('App installed successfully!', 'success');
                }
            }
        });
    }

    if (dismissBtn) {
        dismissBtn.addEventListener('click', () => {
            const banner = document.getElementById('install-banner');
            if (banner) banner.classList.remove('show');
        });
    }
}

// --- Lightbox ---
export function initLightbox() {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox) return;

    lightbox.addEventListener('click', (e) => {
        if (e.target === lightbox || e.target.id === 'lightbox-close') {
            lightbox.classList.remove('active');
        }
    });
}

export function openLightbox(src) {
    const lightbox = document.getElementById('lightbox');
    if (!lightbox) return;
    const img = lightbox.querySelector('img');
    if (img) img.src = src;
    lightbox.classList.add('active');
}

// --- Mobile Swipe-to-Dismiss ---
export function initSwipeDismiss() {
    document.querySelectorAll('.panel').forEach(panel => {
        let startY = 0;
        let currentY = 0;
        let isDragging = false;

        const handle = panel.querySelector('.bottom-sheet-handle');
        if (!handle) return;

        handle.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
            isDragging = true;
            panel.style.transition = 'none';
        }, { passive: true });

        panel.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            currentY = e.touches[0].clientY;
            const diff = currentY - startY;
            if (diff > 0) {
                panel.style.transform = `translateY(${diff}px)`;
            }
        }, { passive: true });

        panel.addEventListener('touchend', () => {
            if (!isDragging) return;
            isDragging = false;
            panel.style.transition = '';
            const diff = currentY - startY;

            if (diff > 100) {
                closePanel(panel);
                if (state.currentLayer) {
                    state.map?.removeLayer(state.currentLayer);
                    state.currentLayer = null;
                }
            }
            panel.style.transform = '';
        });
    });
}

// --- Dynamic Form Generator ---
export function generateFormFields(container, schema, values = {}) {
    if (!container || !schema) return;
    container.innerHTML = '';

    schema.forEach(field => {
        const label = document.createElement('label');
        label.textContent = field.label;

        let input;
        if (field.type === 'select' && field.options) {
            input = document.createElement('select');
            input.id = `field-${field.key}`;
            field.options.forEach(opt => {
                const option = document.createElement('option');
                option.value = opt;
                option.textContent = opt;
                input.appendChild(option);
            });
            if (values[field.key]) input.value = values[field.key];
        } else if (field.type === 'textarea') {
            input = document.createElement('textarea');
            input.id = `field-${field.key}`;
            input.rows = 2;
            input.placeholder = `Enter ${field.label.toLowerCase()}...`;
            if (values[field.key]) input.value = values[field.key];
        } else {
            input = document.createElement('input');
            input.id = `field-${field.key}`;
            input.type = field.type === 'number' ? 'number' : 'text';
            input.placeholder = `Enter ${field.label.toLowerCase()}...`;
            if (field.type === 'number') {
                if (field.min != null) input.min = field.min;
                if (field.max != null) input.max = field.max;
                if (field.step != null) input.step = field.step;
            }
            if (field.readonly) input.readOnly = true;
            if (field.required) input.required = true;
            if (values[field.key] != null) input.value = values[field.key];
            if (field.type === 'number') {
                input.maxLength = 20;
            } else {
                input.maxLength = 200;
            }
        }

        label.appendChild(input);
        container.appendChild(label);
    });
}

export function readFormFields(schema) {
    const values = {};
    if (!schema) return values;
    schema.forEach(field => {
        const el = document.getElementById(`field-${field.key}`);
        if (!el) return;
        let val = el.value;
        if (field.type === 'number' && val !== '') {
            val = parseFloat(val);
            if (isNaN(val)) val = '';
        }
        values[field.key] = val;
    });
    return values;
}

// --- Layer Manager UI ---
export function renderLayerList(layers, onToggle, onSelect, onDelete) {
    const container = document.getElementById('layer-list');
    if (!container) return;
    container.innerHTML = '';

    if (layers.length === 0) {
        container.innerHTML = '<div class="layer-empty">No layers yet. Create one to start mapping!</div>';
        return;
    }

    layers.forEach(layer => {
        const div = document.createElement('div');
        div.className = 'layer-item' + (layer.id === state.activeLayerId ? ' active' : '');
        div.dataset.layerId = layer.id;

        const featureCount = state.allFeatures.filter(f => f.feature.layer_id === layer.id).length;

        div.innerHTML = `
            <button class="layer-visibility-btn ${layer.visible !== false ? 'visible' : ''}" 
                    data-layer-id="${layer.id}" title="Toggle visibility" type="button">
                ${layer.visible !== false ? '👁️' : '👁️‍🗨️'}
            </button>
            <div class="layer-color-dot" style="background: ${layer.color}"></div>
            <div class="layer-info">
                <span class="layer-name">${layer.icon || '📍'} ${sanitize(layer.name)}</span>
                <span class="layer-count">${featureCount} feature${featureCount !== 1 ? 's' : ''}</span>
            </div>
            <button class="layer-delete-btn" data-layer-id="${layer.id}" title="Delete layer" type="button">🗑️</button>
        `;

        // Click to select as active layer
        div.addEventListener('click', (e) => {
            if (e.target.closest('.layer-visibility-btn') || e.target.closest('.layer-delete-btn')) return;
            if (onSelect) onSelect(layer.id);
        });

        // Toggle visibility
        const visBtn = div.querySelector('.layer-visibility-btn');
        visBtn.addEventListener('click', () => {
            if (onToggle) onToggle(layer.id);
        });

        // Delete
        const delBtn = div.querySelector('.layer-delete-btn');
        delBtn.addEventListener('click', () => {
            if (onDelete) onDelete(layer.id);
        });

        container.appendChild(div);
    });
}

// --- Project Cards ---
export function renderProjectCards(projects, onOpen, onDelete) {
    const container = document.getElementById('project-list');
    if (!container) return;
    container.innerHTML = '';

    if (projects.length === 0) {
        container.innerHTML = `
            <div class="project-empty">
                <span class="project-empty-icon">🗺️</span>
                <p>No projects yet</p>
                <small>Create your first map to get started</small>
            </div>
        `;
        return;
    }

    projects.forEach(project => {
        const card = document.createElement('div');
        card.className = 'project-card';

        const date = project.updated_at
            ? new Date(project.updated_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
            : '';

        card.innerHTML = `
            <div class="project-card-header">
                <span class="project-card-icon">🗺️</span>
                <div class="project-card-info">
                    <h3>${sanitize(project.name)}</h3>
                    <small>${sanitize(project.description || 'No description')}</small>
                </div>
                ${project.is_public ? '<span class="project-public-badge" title="Shared publicly">🔗</span>' : ''}
            </div>
            <div class="project-card-footer">
                <span class="project-card-date">${date}</span>
                <div class="project-card-actions">
                    <button class="project-open-btn" data-id="${project.id}" type="button">Open</button>
                    <button class="project-delete-btn" data-id="${project.id}" type="button" title="Delete">🗑️</button>
                </div>
            </div>
        `;

        card.querySelector('.project-open-btn').addEventListener('click', () => onOpen(project));
        card.querySelector('.project-delete-btn').addEventListener('click', (e) => {
            e.stopPropagation();
            onDelete(project);
        });

        // Also open on card click
        card.addEventListener('click', (e) => {
            if (e.target.closest('.project-delete-btn')) return;
            onOpen(project);
        });

        container.appendChild(card);
    });
}


// ========================================
// Forestry — Growth Monitoring UI
// ========================================

// --- Priority Trees List ---
/**
 * Render a ranked list of at-risk trees with risk badges.
 * @param {HTMLElement} container
 * @param {Array} rankedTrees - Output from rankTreesByRisk()
 * @param {Function} onSelect - Called with featureId when a tree is clicked
 */
export function renderPriorityTreesList(container, rankedTrees, onSelect) {
    if (!container) return;
    container.innerHTML = '';

    if (!rankedTrees || rankedTrees.length === 0) {
        container.innerHTML = `
            <div class="priority-empty">
                <span>✅</span>
                <p>No at-risk trees detected</p>
                <small>All monitored trees appear healthy</small>
            </div>`;
        return;
    }

    rankedTrees.forEach((item, idx) => {
        const div = document.createElement('div');
        div.className = 'priority-tree-item';
        div.dataset.featureId = item.featureId;

        const attrs = item.feature?.attributes || {};
        const treeName = attrs.name || attrs.species || `Tree #${item.featureId}`;
        const speciesName = item.species?.name || attrs.species || '—';
        const latestHealth = item.latestMeasurement?.health_status || '—';
        const latestDbh = item.latestMeasurement?.dbh_cm
            ? `${item.latestMeasurement.dbh_cm} cm`
            : '—';

        // Risk badge color
        const badgeClass = `risk-badge risk-${item.riskLevel}`;

        div.innerHTML = `
            <div class="priority-tree-rank">${idx + 1}</div>
            <div class="priority-tree-info">
                <div class="priority-tree-name">
                    🌳 ${sanitize(treeName)}
                    <span class="${badgeClass}">${item.riskScore}</span>
                </div>
                <div class="priority-tree-details">
                    <span>${sanitize(speciesName)}</span>
                    <span>⌀ ${latestDbh}</span>
                    <span>${_healthIcon(latestHealth)} ${latestHealth}</span>
                </div>
            </div>
        `;

        div.addEventListener('click', () => {
            if (onSelect) onSelect(item.featureId, item.feature);
        });

        container.appendChild(div);
    });
}

function _healthIcon(status) {
    const map = { 'Healthy': '💚', 'Stressed': '💛', 'Diseased': '🧡', 'Dead': '💀' };
    return map[status] || '❓';
}


// --- Growth History Chart ---
/**
 * Render a line chart showing DBH and height measurements over time.
 * Requires Chart.js to be loaded.
 * @param {string} canvasId - ID of the canvas element
 * @param {Array} measurements - Chronologically ordered measurements
 * @returns {Chart|null} The Chart.js instance
 */
export function renderGrowthChart(canvasId, measurements) {
    const canvas = document.getElementById(canvasId);
    if (!canvas || typeof Chart === 'undefined') return null;

    if (!measurements || measurements.length === 0) {
        const ctx = canvas.getContext('2d');
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#64748b';
        ctx.font = '13px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('No measurements yet', canvas.width / 2, canvas.height / 2);
        return null;
    }

    const labels = measurements.map(m =>
        new Date(m.measured_at).toLocaleDateString('en-US', {
            month: 'short', year: '2-digit'
        })
    );

    return new Chart(canvas, {
        type: 'line',
        data: {
            labels,
            datasets: [
                {
                    label: 'DBH (cm)',
                    data: measurements.map(m => m.dbh_cm),
                    borderColor: '#51CF66',
                    backgroundColor: 'rgba(81, 207, 102, 0.1)',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#51CF66',
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y',
                },
                {
                    label: 'Height (m)',
                    data: measurements.map(m => m.height_m),
                    borderColor: '#4C9AFF',
                    backgroundColor: 'rgba(76, 154, 255, 0.1)',
                    borderWidth: 2,
                    pointRadius: 4,
                    pointBackgroundColor: '#4C9AFF',
                    fill: true,
                    tension: 0.3,
                    yAxisID: 'y1',
                },
            ],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
                legend: {
                    position: 'top',
                    labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 }, padding: 8 },
                },
            },
            scales: {
                x: {
                    ticks: { color: '#64748b', font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                },
                y: {
                    type: 'linear',
                    position: 'left',
                    title: { display: true, text: 'DBH (cm)', color: '#51CF66', font: { size: 11 } },
                    ticks: { color: '#51CF66', font: { size: 10 } },
                    grid: { color: 'rgba(255,255,255,0.05)' },
                },
                y1: {
                    type: 'linear',
                    position: 'right',
                    title: { display: true, text: 'Height (m)', color: '#4C9AFF', font: { size: 11 } },
                    ticks: { color: '#4C9AFF', font: { size: 10 } },
                    grid: { drawOnChartArea: false },
                },
            },
        },
    });
}


// --- Survey Route Result ---
/**
 * Render the computed survey route summary.
 * @param {HTMLElement} container
 * @param {{orderedPlots, totalDistanceM, algorithm}} route
 */
export function renderSurveyRouteResult(container, route) {
    if (!container || !route) return;

    const totalStr = route.totalDistanceM > 1000
        ? (route.totalDistanceM / 1000).toFixed(2) + ' km'
        : Math.round(route.totalDistanceM) + ' m';

    let stopsHtml = route.orderedPlots.map((p, i) => {
        const distStr = p.distFromPrev > 1000
            ? (p.distFromPrev / 1000).toFixed(1) + ' km'
            : Math.round(p.distFromPrev) + ' m';
        return `
            <div class="route-stop">
                <span class="route-stop-badge">${i + 1}</span>
                <span class="route-stop-name">${sanitize(p.name || 'Plot')}</span>
                <span class="route-stop-dist">📏 ${distStr}</span>
            </div>`;
    }).join('');

    container.innerHTML = `
        <div class="route-summary">
            <div class="route-summary-stat">
                <span class="route-stat-value">${route.orderedPlots.length}</span>
                <span class="route-stat-label">Stops</span>
            </div>
            <div class="route-summary-stat">
                <span class="route-stat-value">${totalStr}</span>
                <span class="route-stat-label">Total Distance</span>
            </div>
            <div class="route-summary-stat">
                <span class="route-stat-value">${route.algorithm}</span>
                <span class="route-stat-label">Algorithm</span>
            </div>
        </div>
        <div class="route-stops-list">
            ${stopsHtml}
        </div>
    `;
}


// --- Plot Checklist ---
/**
 * Render checkboxes for selecting sample plots for route planning.
 * @param {HTMLElement} container
 * @param {Array<{id, name, lat, lng}>} plots - Available plots with centroids
 * @param {Set} selectedIds - Currently selected plot IDs
 * @param {Function} onToggle - Called with (plotId, isChecked)
 */
export function renderPlotChecklist(container, plots, selectedIds, onToggle) {
    if (!container) return;
    container.innerHTML = '';

    if (!plots || plots.length === 0) {
        container.innerHTML = `
            <div class="priority-empty">
                <span>📐</span>
                <p>No sample plots found</p>
                <small>Create polygon features in a "Sample Plots" layer first</small>
            </div>`;
        return;
    }

    plots.forEach(plot => {
        const div = document.createElement('label');
        div.className = 'plot-check-item';

        const checked = selectedIds?.has(plot.id) ? 'checked' : '';
        div.innerHTML = `
            <input type="checkbox" value="${plot.id}" ${checked} />
            <span class="plot-check-name">📐 ${sanitize(plot.name)}</span>
            <span class="plot-check-coords">${plot.lat.toFixed(4)}, ${plot.lng.toFixed(4)}</span>
        `;

        const checkbox = div.querySelector('input');
        checkbox.addEventListener('change', () => {
            if (onToggle) onToggle(plot.id, checkbox.checked);
        });

        container.appendChild(div);
    });
}


// --- Haptic wrapper ---
export { haptic } from './utils.js';
