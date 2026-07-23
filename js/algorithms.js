// ========================================
// OpenGIS — Forestry Algorithms
// Pure, testable functions — no UI or Supabase dependencies
// ========================================

import { haversineDistance } from './utils.js';

// ========================================
// 1. SURVEY ROUTE OPTIMIZATION
// ========================================

/**
 * Compute an optimized visiting order for a set of sample plots using a
 * nearest-neighbor heuristic.
 *
 * Algorithm:
 *   1. Start at `startPoint`.
 *   2. Find the closest unvisited plot (by haversine distance).
 *   3. Move there, mark it visited, repeat until all plots are visited.
 *
 * Time complexity: O(n²) — acceptable for typical field surveys (< 200 plots).
 *
 * NOTE: This uses straight-line (great-circle) distance between plot centroids.
 * If trail / path-graph data becomes available, replace the `distanceFn` call
 * below with a shortest-path lookup (Dijkstra on a trail adjacency graph).
 * The rest of the algorithm stays the same — only the distance oracle changes.
 *
 * @param {Array<{id: number|string, lat: number, lng: number}>} plots
 *   Array of plot objects with at least id, lat, lng (centroid coordinates).
 * @param {{lat: number, lng: number}} startPoint
 *   The surveyor's starting location (e.g., GPS position or base camp).
 * @returns {{
 *   orderedPlots: Array<{id, lat, lng, distFromPrev: number}>,
 *   totalDistanceM: number,
 *   algorithm: string
 * }}
 */
export function optimizeSurveyRoute(plots, startPoint) {
    if (!plots || plots.length === 0) {
        return { orderedPlots: [], totalDistanceM: 0, algorithm: 'nearest-neighbor' };
    }

    if (plots.length === 1) {
        const d = _distance(startPoint, plots[0]);
        return {
            orderedPlots: [{ ...plots[0], distFromPrev: d }],
            totalDistanceM: d,
            algorithm: 'nearest-neighbor',
        };
    }

    // --- Nearest-neighbor greedy traversal ---

    const visited = new Set();
    const ordered = [];
    let current = { lat: startPoint.lat, lng: startPoint.lng };
    let totalDistance = 0;

    while (visited.size < plots.length) {
        let bestIdx = -1;
        let bestDist = Infinity;

        for (let i = 0; i < plots.length; i++) {
            if (visited.has(i)) continue;

            // SWAP POINT: Replace _distance with a trail-graph shortest-path
            // lookup here when trail data is available. For example:
            //   const d = trailGraph.shortestPath(current, plots[i]);
            const d = _distance(current, plots[i]);

            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
            }
        }

        visited.add(bestIdx);
        totalDistance += bestDist;
        ordered.push({
            ...plots[bestIdx],
            distFromPrev: bestDist,
        });
        current = plots[bestIdx];
    }

    return {
        orderedPlots: ordered,
        totalDistanceM: totalDistance,
        algorithm: 'nearest-neighbor',
    };
}

/**
 * Haversine wrapper — single point of replacement for Dijkstra.
 * @private
 */
function _distance(a, b) {
    return haversineDistance(a.lat, a.lng, b.lat, b.lng);
}


// ========================================
// 2. TREE RISK RANKING
// ========================================

/**
 * Risk-score weights (sum = 1.0).
 * Adjust these to change the relative importance of each factor.
 */
const RISK_WEIGHTS = {
    diameterShrinkage: 0.35,   // Latest DBH < baseline DBH
    stuntedGrowth:     0.30,   // Annual growth < 50% of species expected rate
    healthStatus:      0.25,   // Non-healthy status flags
    measurementGap:    0.10,   // Long time since last measurement
};

/**
 * Health status penalty map.
 * Higher value = higher risk contribution (0–100 scale before weighting).
 */
const HEALTH_PENALTIES = {
    'Healthy':  0,
    'Stressed': 40,
    'Diseased': 70,
    'Dead':     100,
};

/**
 * Rank trees by a composite risk score derived from their measurement history
 * and species growth expectations.
 *
 * Scoring methodology (each component normalized to 0–100, then weighted):
 *
 *   1. **Diameter shrinkage** — If latest DBH < baseline DBH, the percentage
 *      decrease maps linearly to 0–100 (capped at 50% loss = 100).
 *
 *   2. **Stunted growth** — Compare actual annual DBH growth rate to
 *      `species.expected_growth_rate`. If actual < 50% of expected, risk = 100.
 *      Linear interpolation between 50%–100% of expected.
 *
 *   3. **Health status** — Direct penalty from `HEALTH_PENALTIES` map.
 *
 *   4. **Measurement gap** — Days since last measurement. > 365 days = 100.
 *
 * Uses a max-heap to efficiently return trees sorted by descending risk.
 *
 * @param {Array<{
 *   feature: {id, coordinates, attributes, layer_id, species_id},
 *   measurements: Array<{measured_at, dbh_cm, height_m, health_status}>,
 *   species: {expected_growth_rate, name, conservation_status} | null
 * }>} treesWithMeasurements
 *   Each entry pairs a tree feature with its chronological measurements and
 *   optionally its species data.
 *
 * @returns {Array<{
 *   featureId: number,
 *   feature: object,
 *   species: object|null,
 *   riskScore: number,           // 0–100, higher = more at risk
 *   riskLevel: 'low'|'medium'|'high'|'critical',
 *   factors: {diameterShrinkage, stuntedGrowth, healthStatus, measurementGap},
 *   latestMeasurement: object|null,
 *   baselineMeasurement: object|null
 * }>}
 *   Sorted by descending risk score.
 */
export function rankTreesByRisk(treesWithMeasurements) {
    if (!treesWithMeasurements || treesWithMeasurements.length === 0) {
        return [];
    }

    const heap = new MaxHeap();

    for (const entry of treesWithMeasurements) {
        const { feature, measurements, species } = entry;

        if (!measurements || measurements.length === 0) {
            // No measurements → moderate risk due to unknown state
            heap.push({
                featureId: feature.id,
                feature,
                species: species || null,
                riskScore: 30,
                riskLevel: 'medium',
                factors: {
                    diameterShrinkage: 0,
                    stuntedGrowth: 0,
                    healthStatus: 0,
                    measurementGap: 100,
                },
                latestMeasurement: null,
                baselineMeasurement: null,
            });
            continue;
        }

        // Sort measurements chronologically (oldest first)
        const sorted = [...measurements].sort(
            (a, b) => new Date(a.measured_at) - new Date(b.measured_at)
        );

        const baseline = sorted[0];
        const latest = sorted[sorted.length - 1];

        // --- Factor 1: Diameter shrinkage ---
        let shrinkageScore = 0;
        if (baseline.dbh_cm && latest.dbh_cm && baseline.dbh_cm > 0) {
            if (latest.dbh_cm < baseline.dbh_cm) {
                const pctLoss = ((baseline.dbh_cm - latest.dbh_cm) / baseline.dbh_cm) * 100;
                shrinkageScore = Math.min(100, pctLoss * 2); // 50% loss → 100
            }
        }

        // --- Factor 2: Stunted growth ---
        let stuntedScore = 0;
        if (species?.expected_growth_rate && species.expected_growth_rate > 0
            && baseline.dbh_cm && latest.dbh_cm && sorted.length >= 2) {

            const yearsElapsed = _yearsBetween(baseline.measured_at, latest.measured_at);
            if (yearsElapsed > 0.1) { // need at least ~5 weeks between measurements
                const actualAnnualGrowth = (latest.dbh_cm - baseline.dbh_cm) / yearsElapsed;
                const ratio = actualAnnualGrowth / species.expected_growth_rate;

                if (ratio < 0) {
                    stuntedScore = 100; // Negative growth = worst case
                } else if (ratio < 0.5) {
                    stuntedScore = 100; // Below 50% of expected = max risk
                } else if (ratio < 1.0) {
                    // Linear interpolation: 50%→100 maps to 100→0
                    stuntedScore = Math.round((1.0 - ratio) * 200);
                }
                // ratio >= 1.0 → no risk
            }
        }

        // --- Factor 3: Health status ---
        const healthScore = HEALTH_PENALTIES[latest.health_status] ?? 0;

        // --- Factor 4: Measurement gap ---
        const daysSinceLast = _daysSince(latest.measured_at);
        const gapScore = Math.min(100, Math.round((daysSinceLast / 365) * 100));

        // --- Composite score ---
        const riskScore = Math.round(
            shrinkageScore * RISK_WEIGHTS.diameterShrinkage +
            stuntedScore   * RISK_WEIGHTS.stuntedGrowth +
            healthScore    * RISK_WEIGHTS.healthStatus +
            gapScore       * RISK_WEIGHTS.measurementGap
        );

        const riskLevel = riskScore >= 75 ? 'critical'
            : riskScore >= 50 ? 'high'
            : riskScore >= 25 ? 'medium'
            : 'low';

        heap.push({
            featureId: feature.id,
            feature,
            species: species || null,
            riskScore,
            riskLevel,
            factors: {
                diameterShrinkage: Math.round(shrinkageScore),
                stuntedGrowth: Math.round(stuntedScore),
                healthStatus: healthScore,
                measurementGap: gapScore,
            },
            latestMeasurement: latest,
            baselineMeasurement: baseline,
        });
    }

    // Drain the heap → sorted descending by riskScore
    const result = [];
    while (heap.size() > 0) {
        result.push(heap.pop());
    }
    return result;
}


// ========================================
// Helpers
// ========================================

/** Fractional years between two date strings. */
function _yearsBetween(dateA, dateB) {
    const msA = new Date(dateA).getTime();
    const msB = new Date(dateB).getTime();
    return Math.abs(msB - msA) / (365.25 * 24 * 60 * 60 * 1000);
}

/** Days since a given date string until now. */
function _daysSince(dateStr) {
    const then = new Date(dateStr).getTime();
    const now = Date.now();
    return Math.max(0, (now - then) / (24 * 60 * 60 * 1000));
}


// ========================================
// MaxHeap — priority queue for risk ranking
// ========================================

/**
 * Binary max-heap keyed on `riskScore`.
 * Used to efficiently produce a descending-sorted ranking.
 */
class MaxHeap {
    constructor() {
        this._data = [];
    }

    size() {
        return this._data.length;
    }

    push(item) {
        this._data.push(item);
        this._bubbleUp(this._data.length - 1);
    }

    pop() {
        if (this._data.length === 0) return null;
        const top = this._data[0];
        const last = this._data.pop();
        if (this._data.length > 0) {
            this._data[0] = last;
            this._sinkDown(0);
        }
        return top;
    }

    peek() {
        return this._data[0] || null;
    }

    _bubbleUp(i) {
        while (i > 0) {
            const parent = (i - 1) >> 1;
            if (this._data[i].riskScore > this._data[parent].riskScore) {
                [this._data[i], this._data[parent]] = [this._data[parent], this._data[i]];
                i = parent;
            } else break;
        }
    }

    _sinkDown(i) {
        const n = this._data.length;
        while (true) {
            let largest = i;
            const left = 2 * i + 1;
            const right = 2 * i + 2;
            if (left < n && this._data[left].riskScore > this._data[largest].riskScore) largest = left;
            if (right < n && this._data[right].riskScore > this._data[largest].riskScore) largest = right;
            if (largest !== i) {
                [this._data[i], this._data[largest]] = [this._data[largest], this._data[i]];
                i = largest;
            } else break;
        }
    }
}
