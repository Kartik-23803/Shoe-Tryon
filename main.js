/**
 * AR Shoe Try-On Platform - Main Orchestration Module
 *
 * Responsibilities:
 * - Initialize all modules in correct dependency order
 * - Manage frame-by-frame animation loop with frame skipping
 * - Handle lifecycle (start, pause, resume, cleanup)
 * - Error recovery and graceful degradation
 */

// Import all modules
import { initCamera, getVideoStream, getDimensions, stopCamera, getVideoElement } from './camera.js';
import { createPoseDetector, detectPose } from './poseDetector.js';
import { initializeSmoother, updateSmoother } from './smoothing.js';
import { solveFootTransforms, initializeSolver as initPoseSolver } from './poseSolver.js';
import {
  initialize as initShoeRenderer,
  loadShoeModel,
  updateShoe as updateShoeTransform,
  render as renderScene,
  cleanup as cleanupRenderer,
  getInfo as getRendererInfo,
  getCamera as getShoeRendererCamera
} from './shoeRenderer.js';

// ============================================================================
// STATE MANAGEMENT
// ============================================================================

const state = {
  initialized: false,
  running: false,
  detectionActive: false,
  lastDetectionTime: 0,
  frameSkipCount: 0,
  lastLandmarks: null,
  animationFrameId: null,
  videoFrameCallbackId: null,

  // Module references
  camera: null,
  poseDetector: null,
  shoeModel: null,

  // Performance tracking
  detectionTimes: [],
  renderTimes: [],

  // Error handling
  hasError: false,
  errorMessage: ''
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  maxDetectionFrequency: 30, // Hz (33ms between detections)
  minFramesBetweenDetections: Math.ceil(60 / 30), // Assuming 60fps RAF
  detectionTimeThreshold: 20, // ms (skip frames if detection takes longer)
  frameSkipOnOverrun: 2, // Skip N frames after detection overrun
  referenceFootLength: 0.23, // Normalized foot length (heel to toe)
  kalmanConfig: {
    q: 0.02, // Process noise (responsiveness)
    r: 0.05  // Measurement noise (smoothness)
  }
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Helper to show error message both in console and UI overlay
 */
function showError(message) {
  console.error(`[AR Shoe Try-On] ${message}`);

  const errorOverlay = document.getElementById('error-overlay');
  const errorMessage = document.getElementById('error-message');
  const closeBtn = document.getElementById('error-close-btn');

  errorMessage.textContent = message;
  errorOverlay.classList.remove('hidden');

  state.hasError = true;
  state.errorMessage = message;

  // Allow user to dismiss error
  closeBtn.onclick = () => {
    errorOverlay.classList.add('hidden');
  };
}

/**
 * Helper to hide loading screen
 */
function hideLoadingScreen() {
  const loadingOverlay = document.getElementById('loading-overlay');
  loadingOverlay.classList.add('hidden');
}

/**
 * Get optimal pixel ratio for mobile devices
 */
function getOptimalPixelRatio() {
  const isAndroid = /Android/.test(navigator.userAgent);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

  let ratio = window.devicePixelRatio || 1;

  if (isAndroid) {
    ratio = Math.min(ratio, 1.5); // Cap Android at 1.5x for performance
  } else if (isIOS) {
    ratio = Math.min(ratio, 1.75); // Cap iOS at 1.75x
  }

  return ratio;
}

/**
 * Detect if browser supports requestVideoFrameCallback
 */
function hasVideoFrameCallback() {
  return 'requestVideoFrameCallback' in HTMLVideoElement.prototype;
}

/**
 * Measure performance of a function
 */
function measurePerformance(fn) {
  const start = performance.now();
  const result = fn();
  const duration = performance.now() - start;
  return { result, duration };
}

// ============================================================================
// INITIALIZATION PHASE
// ============================================================================

/**
 * Phase 1: Initialize all modules in correct dependency order
 * Returns a Promise that resolves when all modules are ready
 */
async function initialize() {
  try {
    console.log('[AR Shoe Try-On] Starting initialization...');

    // Get DOM elements
    const videoElement = document.getElementById('camera-video');
    const canvasElement = document.getElementById('three-canvas');

    if (!videoElement || !canvasElement) {
      throw new Error('Required DOM elements not found (video or canvas)');
    }

    // PHASE 1: Request camera permissions and start stream
    console.log('[AR Shoe Try-On] Requesting camera access...');
    const stream = await initCamera(videoElement);
    if (!stream) {
      throw new Error('Failed to initialize camera - permission denied or device unavailable');
    }
    state.camera = stream;

    // Get video dimensions
    const { width: videoWidth, height: videoHeight } = getDimensions();
    console.log(`[AR Shoe Try-On] Camera initialized: ${videoWidth}x${videoHeight}`);

    // PHASE 2: Create pose detector (async, downloads model)
    console.log('[AR Shoe Try-On] Loading MediaPipe Pose Landmarker model...');
    state.poseDetector = await createPoseDetector(videoElement);
    if (!state.poseDetector) {
      throw new Error('Failed to load MediaPipe Pose Landmarker model');
    }
    console.log('[AR Shoe Try-On] Pose Landmarker loaded successfully');

    // PHASE 3: Initialize Three.js renderer
    console.log('[AR Shoe Try-On] Initializing Three.js renderer...');
    const pixelRatio = getOptimalPixelRatio();
    await initShoeRenderer(canvasElement, videoWidth, videoHeight, pixelRatio);
    console.log('[AR Shoe Try-On] Three.js renderer initialized');

    // PHASE 3B: Initialize pose solver with Three.js camera
    // Critical: Must be done after renderer is initialized to get camera reference
    console.log('[AR Shoe Try-On] Initializing pose solver...');
    const threeCamera = getShoeRendererCamera();
    if (threeCamera) {
      initPoseSolver(threeCamera);
      console.log('[AR Shoe Try-On] Pose solver initialized with camera reference');
    } else {
      console.warn('[AR Shoe Try-On] Could not get camera reference for pose solver');
    }

    // PHASE 4: Load shoe GLB model
    console.log('[AR Shoe Try-On] Loading shoe model...');
    state.shoeModel = await loadShoeModel('./models/shoe.glb');
    if (!state.shoeModel) {
      throw new Error('Failed to load shoe model');
    }
    console.log('[AR Shoe Try-On] Shoe model loaded successfully');

    // PHASE 5: Initialize smoothing filters
    console.log('[AR Shoe Try-On] Initializing Kalman smoothing filters...');
    initializeSmoother(33, CONFIG.kalmanConfig); // 33 landmarks in MediaPipe pose
    console.log('[AR Shoe Try-On] Smoothing filters ready');

    state.initialized = true;
    console.log('[AR Shoe Try-On] ✓ Initialization complete');

    return true;
  } catch (error) {
    console.error('[AR Shoe Try-On] Initialization failed:', error);
    showError(`Initialization failed: ${error.message}`);
    return false;
  }
}

// ============================================================================
// MAIN ANIMATION LOOP
// ============================================================================

/**
 * Main animation frame callback
 * Handles: detection throttling, frame skipping, smoothing, solving, rendering
 */
async function frameLoop(timestamp) {
  try {
    // Handle frame skipping when detection overruns
    if (state.frameSkipCount > 0) {
      state.frameSkipCount--;
      // Continue rendering with last known landmarks
      if (state.lastLandmarks) {
        renderShoes();
      }
    } else {
      // Check if we should run detection this frame
      const timeSinceLastDetection = timestamp - state.lastDetectionTime;
      const detectionInterval = 1000 / CONFIG.maxDetectionFrequency;

      if (timeSinceLastDetection >= detectionInterval) {
        // Run pose detection
        state.detectionActive = true;
        const { result: landmarks, duration: detectionTime } = measurePerformance(() => {
          return detectPose(getVideoStream());
        });
        state.detectionTimes.push(detectionTime);
        state.lastDetectionTime = timestamp;

        // Track performance and skip next frames if overrun
        if (detectionTime > CONFIG.detectionTimeThreshold) {
          console.warn(
            `[Performance] Detection took ${detectionTime.toFixed(2)}ms (threshold: ${CONFIG.detectionTimeThreshold}ms)`
          );
          state.frameSkipCount = CONFIG.frameSkipOnOverrun;
        }

        // Process landmarks if detection succeeded
        if (landmarks) {
          // Apply Kalman smoothing to reduce jitter
          const smoothedLandmarks = updateSmoother(landmarks);

          // Solve foot transforms (position, rotation, scale, tilt)
          const footTransforms = solveFootTransforms(smoothedLandmarks);

          // Store for rendering
          state.lastLandmarks = smoothedLandmarks;
          state.lastFootTransforms = footTransforms;
        }

        state.detectionActive = false;
      }

      // Render shoes using latest foot transforms
      if (state.lastFootTransforms) {
        renderShoes();
      }
    }

    // Continue animation loop
    scheduleNextFrame();
  } catch (error) {
    console.error('[AR Shoe Try-On] Frame loop error:', error);
    // Continue despite errors to avoid breaking the loop
    scheduleNextFrame();
  }
}

/**
 * Schedule next frame using best available method
 */
// function scheduleNextFrame() {
//   if (state.running) {
//     if (hasVideoFrameCallback() && getVideoStream()) {
//       // Prefer requestVideoFrameCallback for true video synchronization
//       state.videoFrameCallbackId = getVideoStream().requestVideoFrameCallback(frameLoop);
//     } else {
//       // Fallback to requestAnimationFrame
//       state.animationFrameId = requestAnimationFrame(frameLoop);
//     }
//   }
// }

function scheduleNextFrame() {
  if (!state.running) return;

  const video = getVideoElement();

  // Modern browsers (Chrome Android etc.)
  if (video && typeof video.requestVideoFrameCallback === 'function') {
    state.videoFrameCallbackId = video.requestVideoFrameCallback(() => {
      frameLoop(performance.now());
    });
  }
  // Fallback (works everywhere)
  else {
    state.animationFrameId = requestAnimationFrame(frameLoop);
  }
}


/**
 * Render shoes with current foot transforms
 */
function renderShoes() {
  if (!state.lastFootTransforms) return;

  const { leftFoot, rightFoot } = state.lastFootTransforms;

  // Update left shoe transform
  if (leftFoot) {
    updateShoeTransform(leftFoot, 'left');
  }

  // Update right shoe transform
  if (rightFoot) {
    updateShoeTransform(rightFoot, 'right');
  }

  // Render Three.js scene
  const { duration: renderTime } = measurePerformance(() => {
    renderScene();
  });
  state.renderTimes.push(renderTime);
}

// ============================================================================
// LIFECYCLE MANAGEMENT
// ============================================================================

/**
 * Start the AR application
 */
async function start() {
  if (!state.initialized) {
    const success = await initialize();
    if (!success) {
      showError('Failed to initialize AR camera');
      return;
    }
  }

  state.running = true;
  hideLoadingScreen();
  console.log('[AR Shoe Try-On] ✓ Started');

  // Begin animation loop
  scheduleNextFrame();
}

/**
 * Pause the AR application
 */
function pause() {
  state.running = false;
  if (state.animationFrameId) {
    cancelAnimationFrame(state.animationFrameId);
  }
  // if (state.videoFrameCallbackId && getVideoStream()) {
  //   getVideoStream().cancelVideoFrameCallback(state.videoFrameCallbackId);
  // }
  const video = getVideoElement();
  if (state.videoFrameCallbackId && video && video.cancelVideoFrameCallback) {
    video.cancelVideoFrameCallback(state.videoFrameCallbackId);
  }

  console.log('[AR Shoe Try-On] ✓ Paused');
}

/**
 * Resume the AR application
 */
function resume() {
  state.running = true;
  console.log('[AR Shoe Try-On] ✓ Resumed');
  scheduleNextFrame();
}

/**
 * Cleanup and shutdown
 */
async function cleanup() {
  pause();
  stopCamera();
  cleanupRenderer();
  state.initialized = false;
  console.log('[AR Shoe Try-On] ✓ Cleanup complete');
}

// ============================================================================
// PERFORMANCE MONITORING
// ============================================================================

/**
 * Get performance statistics
 */
function getPerformanceStats() {
  const avg = (arr) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
  const max = (arr) => arr.length ? Math.max(...arr) : 0;

  return {
    detectionAvg: avg(state.detectionTimes).toFixed(2),
    detectionMax: max(state.detectionTimes).toFixed(2),
    renderAvg: avg(state.renderTimes).toFixed(2),
    renderMax: max(state.renderTimes).toFixed(2),
    fps: (1000 / avg(state.renderTimes)).toFixed(1)
  };
}

// ============================================================================
// STARTUP
// ============================================================================

// Start application when page loads
window.addEventListener('load', () => {
  console.log('[AR Shoe Try-On] Window loaded, starting application...');
  start().catch(error => {
    console.error('[AR Shoe Try-On] Startup error:', error);
    showError('Failed to start AR application');
  });
});

// Cleanup on page unload
window.addEventListener('beforeunload', cleanup);

// Expose for debugging
window.shoeARApp = {
  start,
  pause,
  resume,
  cleanup,
  getPerformanceStats,
  state
};

console.log('[AR Shoe Try-On] Module loaded. Call window.shoeARApp.start() to begin.');
