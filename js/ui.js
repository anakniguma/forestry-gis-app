// ========================================
// Forestry Tree Mapper — UI Components
// ========================================

import { state } from './config.js';
import { sanitize, calculateBasalArea, calculateVolume, formatNumber, countTreesInPolygon } from './utils.js';

// --- Toast Notification System (#3) ---
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

// --- Loading Overlay (#9) ---
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

// --- Confirmation Modal (#11) ---
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

// --- Status Indicator (enhanced) ---
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

// --- Panel Management (#4) ---
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

// --- Dashboard (#5) ---
export function initDashboard() {
    const toggle = document.getElementById('dashboard-toggle');
    const panel = document.getElementById('dashboard-panel');
    const close = document.getElementById('dashboard-close');

    if (toggle) toggle.addEventListener('click', () => panel?.classList.toggle('open'));
    if (close) close.addEventListener('click', () => panel?.classList.remove('open'));
}

export function updateDashboard() {
    const trees = state.allTreeMarkers.map(m => m.tree);
    const plots = state.allPlotPolygons;

    // Stats cards
    const setVal = (id, val) => {
        const el = document.getElementById(id);
        if (el) el.textContent = val;
    };

    setVal('stat-total-trees', trees.length);
    setVal('stat-total-species', state.allSpecies.size);
    setVal('stat-total-plots', plots.length);

    // Total basal area
    const totalBA = trees.reduce((sum, t) => sum + calculateBasalArea(t.dbh), 0);
    setVal('stat-total-ba', formatNumber(totalBA, 2) + ' m²');

    // Health counts
    const healthCounts = { Healthy: 0, Diseased: 0, Dead: 0 };
    trees.forEach(t => {
        if (healthCounts[t.health] !== undefined) healthCounts[t.health]++;
    });

    // Species chart
    const speciesCounts = {};
    trees.forEach(t => {
        const sp = t.species || 'Unknown';
        speciesCounts[sp] = (speciesCounts[sp] || 0) + 1;
    });

    const sortedSpecies = Object.entries(speciesCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 8);

    // Update charts if Chart.js is available
    if (typeof Chart !== 'undefined') {
        updateSpeciesChart(sortedSpecies);
        updateHealthChart(healthCounts);
    }

    // Trees in plots (#32)
    const plotInfoContainer = document.getElementById('plot-tree-counts');
    if (plotInfoContainer) {
        plotInfoContainer.innerHTML = '';
        plots.forEach(polygon => {
            const plotData = polygon.plotData;
            if (!plotData) return;
            const coords = plotData.coordinates;
            const treesInPlot = countTreesInPolygon(trees, coords);
            const div = document.createElement('div');
            div.className = 'stat-card';
            div.innerHTML = `<span class="stat-value">${treesInPlot.length}</span>
                <span class="stat-label">${sanitize(plotData.name || 'Unnamed Plot')}</span>`;
            plotInfoContainer.appendChild(div);
        });
    }
}

function updateSpeciesChart(speciesData) {
    const canvas = document.getElementById('species-chart');
    if (!canvas) return;

    if (state.speciesChartInstance) state.speciesChartInstance.destroy();

    const colors = ['#7ddf7e', '#5cb85c', '#3d8a3e', '#2d6a2e', '#ffcc66', '#ff9966', '#6cb4ee', '#c090e0'];

    state.speciesChartInstance = new Chart(canvas, {
        type: 'doughnut',
        data: {
            labels: speciesData.map(s => s[0]),
            datasets: [{
                data: speciesData.map(s => s[1]),
                backgroundColor: colors.slice(0, speciesData.length),
                borderColor: 'rgba(15, 26, 15, 0.8)',
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    position: 'bottom',
                    labels: { color: '#a0b8a0', font: { family: 'Inter', size: 10 }, padding: 8 }
                }
            }
        }
    });
}

function updateHealthChart(healthCounts) {
    const canvas = document.getElementById('health-chart');
    if (!canvas) return;

    if (state.healthChartInstance) state.healthChartInstance.destroy();

    state.healthChartInstance = new Chart(canvas, {
        type: 'bar',
        data: {
            labels: ['Healthy', 'Diseased', 'Dead'],
            datasets: [{
                data: [healthCounts.Healthy, healthCounts.Diseased, healthCounts.Dead],
                backgroundColor: ['rgba(45, 106, 46, 0.6)', 'rgba(180, 130, 40, 0.6)', 'rgba(220, 80, 60, 0.6)'],
                borderColor: ['#7ddf7e', '#ffcc66', '#ff8a7a'],
                borderWidth: 1,
                borderRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: {
                x: {
                    ticks: { color: '#a0b8a0', font: { family: 'Inter', size: 11 } },
                    grid: { display: false }
                },
                y: {
                    beginAtZero: true,
                    ticks: { color: '#7a9a7a', font: { family: 'Inter', size: 10 }, stepSize: 1 },
                    grid: { color: 'rgba(45, 106, 46, 0.1)' }
                }
            }
        }
    });
}

// --- PWA Install Prompt (#24) ---
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

// --- Species Auto-Suggest (#35) ---
export function initAutoSuggest(inputId, getSpecies) {
    const input = document.getElementById(inputId);
    if (!input) return;

    const wrapper = input.parentElement;
    wrapper.classList.add('auto-suggest-wrapper');

    const list = document.createElement('div');
    list.className = 'auto-suggest-list';
    list.id = inputId + '-suggest';
    wrapper.appendChild(list);

    let highlightIdx = -1;

    input.addEventListener('input', () => {
        const val = input.value.trim().toLowerCase();
        if (!val) { list.classList.remove('visible'); return; }

        const species = Array.from(getSpecies());
        const matches = species.filter(s => s.toLowerCase().includes(val)).slice(0, 8);

        if (matches.length === 0) { list.classList.remove('visible'); return; }

        list.innerHTML = '';
        highlightIdx = -1;
        matches.forEach((s, idx) => {
            const item = document.createElement('div');
            item.className = 'auto-suggest-item';
            item.textContent = s;
            item.addEventListener('click', () => {
                input.value = s;
                list.classList.remove('visible');
            });
            list.appendChild(item);
        });
        list.classList.add('visible');
    });

    input.addEventListener('keydown', (e) => {
        const items = list.querySelectorAll('.auto-suggest-item');
        if (!items.length || !list.classList.contains('visible')) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            highlightIdx = Math.min(highlightIdx + 1, items.length - 1);
            items.forEach((it, i) => it.classList.toggle('highlighted', i === highlightIdx));
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            highlightIdx = Math.max(highlightIdx - 1, 0);
            items.forEach((it, i) => it.classList.toggle('highlighted', i === highlightIdx));
        } else if (e.key === 'Enter' && highlightIdx >= 0) {
            e.preventDefault();
            input.value = items[highlightIdx].textContent;
            list.classList.remove('visible');
        } else if (e.key === 'Escape') {
            list.classList.remove('visible');
        }
    });

    document.addEventListener('click', (e) => {
        if (!wrapper.contains(e.target)) list.classList.remove('visible');
    });
}

// --- Lightbox (#17) ---
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

// --- Mobile Swipe-to-Dismiss (#21) ---
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
                // Dismiss
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

// --- Haptic wrapper ---
export { haptic } from './utils.js';
