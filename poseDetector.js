/**
 * Pose Detector Module - MediaPipe Pose Landmarker Integration
 *
 * Responsibilities:
 * - Load MediaPipe Tasks Vision Pose Landmarker model
 * - Run pose detection at controlled frequency
 * - Extract foot-relevant landmarks
 * - Handle model load failures gracefully
 */

// ============================================================================
// MEDIAPIPE CONFIGURATION
// ============================================================================

// MediaPipe landmarks indices for foot tracking
// Reference: https://developers.google.com/mediapipe/solutions/vision/pose_landmarker/
const FOOT_LANDMARKS = {
  LEFT_ANKLE: 27,
  LEFT_HEEL: 29,
  LEFT_FOOT_INDEX: 31,

  RIGHT_ANKLE: 28,
  RIGHT_HEEL: 30,
  RIGHT_FOOT_INDEX: 32
};

/**
 * Map of all 33 MediaPipe pose landmarks
 */
const ALL_LANDMARKS = {
  0: 'NOSE',
  1: 'LEFT_EYE_INNER',
  2: 'LEFT_EYE',
  3: 'LEFT_EYE_OUTER',
  4: 'RIGHT_EYE_INNER',
  5: 'RIGHT_EYE',
  6: 'RIGHT_EYE_OUTER',
  7: 'LEFT_EAR',
  8: 'RIGHT_EAR',
  9: 'MOUTH_LEFT',
  10: 'MOUTH_RIGHT',
  11: 'LEFT_SHOULDER',
  12: 'RIGHT_SHOULDER',
  13: 'LEFT_ELBOW',
  14: 'RIGHT_ELBOW',
  15: 'LEFT_WRIST',
  16: 'RIGHT_WRIST',
  17: 'LEFT_PINKY',
  18: 'RIGHT_PINKY',
  19: 'LEFT_INDEX',
  20: 'RIGHT_INDEX',
  21: 'LEFT_THUMB',
  22: 'RIGHT_THUMB',
  23: 'LEFT_HIP',
  24: 'RIGHT_HIP',
  25: 'LEFT_KNEE',
  26: 'RIGHT_KNEE',
  27: 'LEFT_ANKLE',
  28: 'RIGHT_ANKLE',
  29: 'LEFT_HEEL',
  30: 'RIGHT_HEEL',
  31: 'LEFT_FOOT_INDEX',
  32: 'RIGHT_FOOT_INDEX'
};

// ============================================================================
// STATE
// ============================================================================

let poseDetector = null;
let isDetecting = false;
let lastDetectionResults = null;
let detectionErrors = 0;

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // MediaPipe model URL
  // MediaPipe WASM runtime (engine/interpreter)
  wasmPath: 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.2/wasm',
  modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',

  // Minimum confidence threshold for landmarks
  minLandmarkConfidence: 0.5,

  // Detection options
  detectionOptions: {
    runningMode: 'VIDEO',
    numPoses: 1, // Only detect one person (for retail kiosk use)
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5
  }
};

// ============================================================================
// MEDIAPIPE INITIALIZATION
// ============================================================================

/**
 * Initialize MediaPipe Pose Landmarker model
 *
 * Downloads the WASM model and initializes the detector.
 * This should be called once during app startup.
 *
 * @param {HTMLVideoElement} videoElement - Video element with stream
 * @returns {Promise<Object|null>} - Detector instance or null on error
 */
export async function createPoseDetector(videoElement) {
  if (!videoElement) {
    console.error('[PoseDetector] Video element required');
    return null;
  }

  try {
    console.log('[PoseDetector] Loading MediaPipe Pose Landmarker...'); console.log('[PoseDetector] WASM:', CONFIG.wasmPath); console.log('[PoseDetector] Model:', CONFIG.modelAssetPath);

    // Load MediaPipe Tasks Vision library
    // FilesetResolver is globally available from the CDN script
    if (typeof FilesetResolver === 'undefined') {
      throw new Error('FilesetResolver not loaded - check CDN script in index.html');
    }

    if (typeof PoseLandmarker === 'undefined') {
      throw new Error('PoseLandmarker not loaded - check CDN script in index.html');
    }

    // Initialize file set resolver with Vision tasks
    const vision = await FilesetResolver.forVisionTasks(CONFIG.wasmPath);

    // Create pose landmarker with options
    poseDetector = await PoseLandmarker.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: CONFIG.modelAssetPath
      },
      runningMode: CONFIG.detectionOptions.runningMode,
      numPoses: CONFIG.detectionOptions.numPoses,
      minPoseDetectionConfidence: CONFIG.detectionOptions.minPoseDetectionConfidence,
      minPosePresenceConfidence: CONFIG.detectionOptions.minPosePresenceConfidence,
      minTrackingConfidence: CONFIG.detectionOptions.minTrackingConfidence
    });

    console.log('[PoseDetector] ✓ MediaPipe Pose Landmarker loaded successfully');
    console.log(`[PoseDetector] Running mode: ${CONFIG.detectionOptions.runningMode}`);
    console.log(`[PoseDetector] Detection confidence: ${CONFIG.detectionOptions.minPoseDetectionConfidence}`);

    return poseDetector;
  } catch (error) {
    console.error('[PoseDetector] Failed to load MediaPipe model:', error);
    detectionErrors++;
    return null;
  }
}

// ============================================================================
// POSE DETECTION
// ============================================================================

/**
 * Run pose detection on current video frame
 *
 * This should be called from the main animation loop.
 * Detection is asynchronous and can be skipped if a previous detection is still running.
 *
 * @param {MediaStream} videoStream - Active video stream
 * @returns {Array<Object>|null} - Array of 33 landmarks or null on error
 */
// export function detectPose(videoStream) {
//   if (!poseDetector) {
//     console.warn('[PoseDetector] Detector not initialized');
//     return null;
//   }

//   if (isDetecting) {
//     console.warn('[PoseDetector] Detection already in progress, skipping frame');
//     return lastDetectionResults;
//   }

//   const videoElement = document.getElementById('camera-video');
//   if (!videoElement || !videoElement.readyState) {
//     return null;
//   }

//   try {
//     isDetecting = true;

//     // Run detection synchronously
//     // MediaPipe Pose Landmarker performs detection on the current video frame
//     const results = poseDetector.detectForVideo(
//       videoElement,
//       performance.now()
//     );

//     // Extract landmarks from results
//     if (results && results.landmarks && results.landmarks.length > 0) {
//       // We only care about the first person detected
//       const landmarks = results.landmarks[0];

//       // Store for next frame in case detection is still running
//       lastDetectionResults = landmarks;

//       // Reset error counter on successful detection
//       detectionErrors = 0;

//       return landmarks;
//     } else {
//       // No pose detected in this frame
//       return null;
//     }
//   } catch (error) {
//     console.error('[PoseDetector] Detection error:', error);
//     detectionErrors++;

//     // Log if we're having persistent errors
//     if (detectionErrors > 10) {
//       console.error('[PoseDetector] Multiple consecutive detection errors detected');
//     }

//     return lastDetectionResults; // Return last valid result
//   } finally {
//     isDetecting = false;
//   }
// }

// ============================================================================
// LANDMARK EXTRACTION
// ============================================================================

let lastVideoTime = -1;
let lastResults = null;

export function detectPose() {

  if (!poseDetector) return lastResults;

  const video = document.getElementById('camera-video');
  if (!video || video.readyState < 2) return lastResults;

  // Only detect when the camera gives a NEW frame
  if (video.currentTime === lastVideoTime) {
    return lastResults;
  }

  lastVideoTime = video.currentTime;

  const results = poseDetector.detectForVideo(video, performance.now());

  if (results && results.landmarks && results.landmarks.length > 0) {
    lastResults = results.landmarks[0];
  }

  return lastResults;
}


/**
 * Extract foot-specific landmarks from full pose detection results
 *
 * Filters the 33 landmarks to just the 6 foot landmarks we care about:
 * - LEFT_HEEL, LEFT_FOOT_INDEX, LEFT_ANKLE
 * - RIGHT_HEEL, RIGHT_FOOT_INDEX, RIGHT_ANKLE
 *
 * @param {Array<Object>} landmarks - Array of 33 MediaPipe landmarks
 * @returns {Object} - Foot landmarks organized by side and part
 */
export function extractFootLandmarks(landmarks) {
  if (!landmarks || !Array.isArray(landmarks)) {
    return null;
  }

  const footLandmarks = {
    leftFoot: {
      heel: null,
      footIndex: null,
      ankle: null
    },
    rightFoot: {
      heel: null,
      footIndex: null,
      ankle: null
    }
  };

  // Extract left foot landmarks
  const leftHeel = landmarks[FOOT_LANDMARKS.LEFT_HEEL];
  const leftFootIndex = landmarks[FOOT_LANDMARKS.LEFT_FOOT_INDEX];
  const leftAnkle = landmarks[FOOT_LANDMARKS.LEFT_ANKLE];

  // Validate and store left foot
  if (isValidLandmark(leftHeel)) footLandmarks.leftFoot.heel = leftHeel;
  if (isValidLandmark(leftFootIndex)) footLandmarks.leftFoot.footIndex = leftFootIndex;
  if (isValidLandmark(leftAnkle)) footLandmarks.leftFoot.ankle = leftAnkle;

  // Extract right foot landmarks
  const rightHeel = landmarks[FOOT_LANDMARKS.RIGHT_HEEL];
  const rightFootIndex = landmarks[FOOT_LANDMARKS.RIGHT_FOOT_INDEX];
  const rightAnkle = landmarks[FOOT_LANDMARKS.RIGHT_ANKLE];

  // Validate and store right foot
  if (isValidLandmark(rightHeel)) footLandmarks.rightFoot.heel = rightHeel;
  if (isValidLandmark(rightFootIndex)) footLandmarks.rightFoot.footIndex = rightFootIndex;
  if (isValidLandmark(rightAnkle)) footLandmarks.rightFoot.ankle = rightAnkle;

  return footLandmarks;
}

/**
 * Check if a landmark has sufficient confidence and valid coordinates
 *
 * @param {Object} landmark - Landmark object with x, y, z, visibility, presence
 * @returns {boolean} - True if landmark is usable
 */
function isValidLandmark(landmark) {
  if (!landmark) return false;

  // Check for required properties
  if (typeof landmark.x !== 'number' || typeof landmark.y !== 'number') {
    return false;
  }

  // Check confidence threshold
  const confidence = landmark.visibility || landmark.presence || 0;
  if (confidence < CONFIG.detectionOptions.minPoseDetectionConfidence) {
    return false;
  }

  // Check for NaN or infinity
  if (!isFinite(landmark.x) || !isFinite(landmark.y)) {
    return false;
  }

  return true;
}

// ============================================================================
// LANDMARK ACCESS AND ANALYSIS
// ============================================================================

/**
 * Get 2D screen position of a landmark (normalized 0-1)
 *
 * @param {Object} landmark - landmark from MediaPipe
 * @returns {{x: number, y: number, z: number}} - Normalized coordinates
 */
export function getLandmarkPosition(landmark) {
  if (!landmark) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: landmark.x || 0,
    y: landmark.y || 0,
    z: landmark.z || 0
  };
}

/**
 * Get confidence score of a landmark
 *
 * @param {Object} landmark - Landmark from MediaPipe
 * @returns {number} - Confidence score 0-1
 */
export function getLandmarkConfidence(landmark) {
  if (!landmark) return 0;

  // Try different confidence properties depending on running mode
  return landmark.visibility || landmark.presence || 0;
}

/**
 * Get human-readable name of a landmark by index
 *
 * @param {number} index - Landmark index 0-32
 * @returns {string} - Landmark name
 */
export function getLandmarkName(index) {
  return ALL_LANDMARKS[index] || `UNKNOWN_${index}`;
}

/**
 * Log all landmarks for debugging
 *
 * @param {Array<Object>} landmarks - Array of 33 landmarks
 */
export function debugLogLandmarks(landmarks) {
  if (!landmarks) {
    console.log('[PoseDetector] No landmarks to log');
    return;
  }

  console.group('[PoseDetector] Pose Landmarks:');

  landmarks.forEach((landmark, index) => {
    const name = getLandmarkName(index);
    const confidence = getLandmarkConfidence(landmark);
    const position = getLandmarkPosition(landmark);

    if (confidence > 0) {
      console.log(
        `  ${name.padEnd(20)} (${index}): ` +
        `pos=(${position.x.toFixed(3)}, ${position.y.toFixed(3)}, ${position.z.toFixed(3)}) ` +
        `conf=${confidence.toFixed(3)}`
      );
    }
  });

  console.groupEnd();
}

// ============================================================================
// STATE INSPECTION
// ============================================================================

/**
 * Check if detector is loaded and ready
 */
export function isDetectorReady() {
  return poseDetector !== null;
}

/**
 * Check if detection is currently running
 */
export function isDetectionInProgress() {
  return isDetecting;
}

/**
 * Get detection error count
 */
export function getDetectionErrorCount() {
  return detectionErrors;
}

/**
 * Reset detector state
 */
export function resetDetector() {
  isDetecting = false;
  lastDetectionResults = null;
  detectionErrors = 0;
  console.log('[PoseDetector] Detector state reset');
}

/**
 * Get configuration
 */
export function getConfig() {
  return { ...CONFIG };
}

console.log('[PoseDetector] Module loaded');
