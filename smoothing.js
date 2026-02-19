/**
 * Smoothing Module - Kalman Filter for Landmark Filtering
 *
 * Responsibilities:
 * - Implement independent Kalman filter per landmark dimension
 * - Apply to x, y, z coordinates separately
 * - Reduce MediaPipe noise while maintaining responsiveness
 *
 * Kalman Filter Theory:
 * The Kalman filter is an optimal recursive filter that estimates the state
 * of a linear dynamic system from noisy measurements.
 *
 * Two steps:
 * 1. Predict: Use motion model to estimate current state
 * 2. Update: Correct prediction using new measurement
 */

// ============================================================================
// KALMAN FILTER CLASS
// ============================================================================

class KalmanFilter1D {
  /**
   * Initialize 1D Kalman filter
   *
   * @param {number} q - Process noise covariance (how much we assume position changes)
   * @param {number} r - Measurement noise covariance (how much we trust measurements)
   * @param {number} x - Initial state estimate
   * @param {number} p - Initial estimate covariance
   * @param {number} a - State transition coefficient
   * @param {number} h - Measurement function coefficient
   */
  constructor(q, r, x = 0, p = 1, a = 1, h = 1) {
    // Filter parameters
    this.q = q; // Process noise - how much we expect the actual signal to vary
    this.r = r; // Measurement noise - how much we trust each measurement
    this.a = a; // State transition (typically 1 for constant position)
    this.h = h; // Measurement function (typically 1 for direct measurement)

    // State variables
    this.x = x; // Current state estimate
    this.p = p; // Current estimate error covariance
    this.K = 0; // Kalman gain (automatically calculated)
  }

  /**
   * Update filter with new measurement
   *
   * @param {number} z - New measurement (raw landmark coordinate)
   * @returns {number} - Filtered estimate
   */
  update(z) {
    // 1. PREDICT PHASE
    // Predict state: x = a * x + process_noise
    // We use a=1, so prediction is just: x_pred = x
    // Predict covariance
    this.p = this.a * this.a * this.p + this.q;

    // 2. UPDATE PHASE
    // Calculate Kalman gain (how much to trust new measurement vs prediction)
    this.K = this.h * this.p / (this.h * this.h * this.p + this.r);

    // Update state estimate with measurement
    this.x = this.x + this.K * (z - this.h * this.x);

    // Update covariance
    this.p = (1 - this.K * this.h) * this.p;

    return this.x;
  }

  /**
   * Reset filter to initial state
   */
  reset(x = 0) {
    this.x = x;
    this.p = 1;
    this.K = 0;
  }

  /**
   * Get current filtered estimate without updating
   */
  get() {
    return this.x;
  }
}

// ============================================================================
// STATE
// ============================================================================

// Create 33 landmarks × 3 dimensions (x, y, z) = 99 Kalman filters
const filters = [];
let kalmanConfig = {
  q: 0.02,  // Process noise
  r: 0.05   // Measurement noise
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize all Kalman filters
 *
 * Creates independent filters for each landmark dimension:
 * - 33 MediaPipe landmarks (0-32)
 * - 3 dimensions per landmark (x, y, z)
 * = 99 total filters
 *
 * @param {number} numLandmarks - Number of landmarks (default 33 for MediaPipe)
 * @param {Object} config - Kalman filter configuration {q, r}
 */
export function initializeSmoother(numLandmarks = 33, config = null) {
  // Update config if provided
  if (config && typeof config === 'object') {
    if (typeof config.q === 'number') kalmanConfig.q = config.q;
    if (typeof config.r === 'number') kalmanConfig.r = config.r;
  }

  // Clear existing filters
  filters.length = 0;

  // Create filters for each landmark
  for (let i = 0; i < numLandmarks; i++) {
    // Create 3 filters per landmark (x, y, z)
    filters.push([
      new KalmanFilter1D(kalmanConfig.q, kalmanConfig.r, 0, 1),
      new KalmanFilter1D(kalmanConfig.q, kalmanConfig.r, 0, 1),
      new KalmanFilter1D(kalmanConfig.q, kalmanConfig.r, 0, 1)
    ]);
  }

  console.log(
    `[Smoothing] Initialized ${filters.length} landmarks × 3 dimensions = ${filters.length * 3} Kalman filters`
  );
  console.log(`[Smoothing] Kalman config: q=${kalmanConfig.q}, r=${kalmanConfig.r}`);
}

// ============================================================================
// SMOOTHING OPERATIONS
// ============================================================================

/**
 * Update smoother with new landmarks and return filtered landmarks
 *
 * This should be called once per frame with raw MediaPipe landmarks.
 * Returns smoothed landmarks with reduced jitter.
 *
 * @param {Array<Object>} rawLandmarks - Raw MediaPipe landmarks (33 landmarks)
 * @returns {Array<Object>} - Smoothed landmarks
 */
export function updateSmoother(rawLandmarks) {
  if (!rawLandmarks || !Array.isArray(rawLandmarks) || filters.length === 0) {
    return rawLandmarks;
  }

  // Create array for smoothed landmarks
  const smoothedLandmarks = [];

  // Process each landmark
  for (let i = 0; i < rawLandmarks.length && i < filters.length; i++) {
    const rawLandmark = rawLandmarks[i];

    if (!rawLandmark) {
      smoothedLandmarks.push(rawLandmark);
      continue;
    }

    const landmarkFilters = filters[i];
    const [filterX, filterY, filterZ] = landmarkFilters;

    // Smooth x, y, z coordinates independently
    const smoothedX = filterX.update(rawLandmark.x || 0);
    const smoothedY = filterY.update(rawLandmark.y || 0);
    const smoothedZ = filterZ.update(rawLandmark.z || 0);

    // Create smoothed landmark, preserving other properties (visibility, presence)
    const smoothedLandmark = {
      x: smoothedX,
      y: smoothedY,
      z: smoothedZ,
      visibility: rawLandmark.visibility,
      presence: rawLandmark.presence
    };

    smoothedLandmarks.push(smoothedLandmark);
  }

  return smoothedLandmarks;
}

/**
 * Get smoothed value of a single landmark
 *
 * Useful for getting the filtered value without providing a new measurement.
 *
 * @param {number} landmarkIndex - Index of landmark (0-32)
 * @returns {{x: number, y: number, z: number}} - Current smoothed position
 */
export function getSmoothedLandmark(landmarkIndex) {
  if (!filters[landmarkIndex]) {
    return { x: 0, y: 0, z: 0 };
  }

  const [filterX, filterY, filterZ] = filters[landmarkIndex];

  return {
    x: filterX.get(),
    y: filterY.get(),
    z: filterZ.get()
  };
}

/**
 * Update a single landmark without full array
 *
 * Useful for individual landmark updates or debugging
 *
 * @param {number} landmarkIndex - Index of landmark
 * @param {Object} landmark - Landmark with x, y, z
 * @returns {{x: number, y: number, z: number}} - Smoothed position
 */
export function updateSingleLandmark(landmarkIndex, landmark) {
  if (!landmark || !filters[landmarkIndex]) {
    return { x: 0, y: 0, z: 0 };
  }

  const [filterX, filterY, filterZ] = filters[landmarkIndex];

  const x = filterX.update(landmark.x || 0);
  const y = filterY.update(landmark.y || 0);
  const z = filterZ.update(landmark.z || 0);

  return { x, y, z };
}

// ============================================================================
// FILTER MANIPULATION
// ============================================================================

/**
 * Reset all filters to initial state
 *
 * Useful when detection is lost or when starting a new session
 */
export function resetFilters() {
  filters.forEach(landmarkFilters => {
    landmarkFilters.forEach(filter => {
      filter.reset(0);
    });
  });

  console.log('[Smoothing] All filters reset to initial state');
}

/**
 * Reset a single landmark's filters
 *
 * @param {number} landmarkIndex - Index of landmark to reset
 */
export function resetLandmarkFilters(landmarkIndex) {
  if (filters[landmarkIndex]) {
    filters[landmarkIndex].forEach(filter => {
      filter.reset(0);
    });
  }
}

/**
 * Initialize filters with known values
 *
 * Useful when starting with a known position
 *
 * @param {Array<Object>} initialLandmarks - Initial landmark positions
 */
export function initializeWithLandmarks(initialLandmarks) {
  if (!initialLandmarks || !Array.isArray(initialLandmarks)) {
    return;
  }

  for (let i = 0; i < initialLandmarks.length && i < filters.length; i++) {
    const landmark = initialLandmarks[i];

    if (!landmark) {
      continue;
    }

    const [filterX, filterY, filterZ] = filters[i];

    // Set initial values
    filterX.reset(landmark.x || 0);
    filterY.reset(landmark.y || 0);
    filterZ.reset(landmark.z || 0);
  }

  console.log('[Smoothing] Filters initialized with landmark values');
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Update Kalman filter parameters
 *
 * Adjust these to change smoothing behavior:
 * - q: Higher = more responsive, more jitter (0.02 is reasonable)
 * - r: Higher = more smooth, more lag (0.05 is reasonable)
 *
 * @param {number} q - Process noise covariance [0.001, 0.1]
 * @param {number} r - Measurement noise covariance [0.01, 0.2]
 */
export function setKalmanConfig(q, r) {
  if (typeof q === 'number' && q > 0) {
    kalmanConfig.q = q;
  }
  if (typeof r === 'number' && r > 0) {
    kalmanConfig.r = r;
  }

  // Update all existing filters with new config
  filters.forEach(landmarkFilters => {
    landmarkFilters.forEach(filter => {
      filter.q = kalmanConfig.q;
      filter.r = kalmanConfig.r;
    });
  });

  console.log(`[Smoothing] Kalman config updated: q=${kalmanConfig.q}, r=${kalmanConfig.r}`);
}

/**
 * Get current Kalman filter configuration
 */
export function getKalmanConfig() {
  return { ...kalmanConfig };
}

// ============================================================================
// ANALYSIS AND DEBUGGING
// ============================================================================

/**
 * Calculate smoothing lag (difference between raw and smoothed)
 *
 * Useful for performance analysis
 *
 * @param {Array<Object>} rawLandmarks - Raw landmarks
 * @param {Array<Object>} smoothedLandmarks - Smoothed landmarks
 * @returns {number} - Average lag in pixels
 */
export function calculateSmoothingLag(rawLandmarks, smoothedLandmarks) {
  if (!rawLandmarks || !smoothedLandmarks) {
    return 0;
  }

  let totalDelta = 0;
  let count = 0;

  for (let i = 0; i < Math.min(rawLandmarks.length, smoothedLandmarks.length); i++) {
    const raw = rawLandmarks[i];
    const smoothed = smoothedLandmarks[i];

    if (!raw || !smoothed) continue;

    const dx = (raw.x - smoothed.x) || 0;
    const dy = (raw.y - smoothed.y) || 0;

    // Distance in normalized space (0-1)
    totalDelta += Math.sqrt(dx * dx + dy * dy);
    count++;
  }

  return count > 0 ? (totalDelta / count) : 0;
}

/**
 * Log filter statistics
 */
export function debugLogFilterState() {
  console.group('[Smoothing] Kalman Filter State:');
  console.log(`Total filters: ${filters.length}`);
  console.log(`Config:`, kalmanConfig);

  // Sample a few filters
  if (filters.length > 0) {
    console.log('Sample landmark 0 (nose):');
    const [filterX, filterY, filterZ] = filters[0];
    console.log(`  X: estimate=${filterX.x.toFixed(4)}, covariance=${filterX.p.toFixed(4)}`);
    console.log(`  Y: estimate=${filterY.x.toFixed(4)}, covariance=${filterY.p.toFixed(4)}`);
    console.log(`  Z: estimate=${filterZ.x.toFixed(4)}, covariance=${filterZ.p.toFixed(4)}`);
  }

  console.groupEnd();
}

console.log('[Smoothing] Module loaded - 1D Kalman filter ready');
