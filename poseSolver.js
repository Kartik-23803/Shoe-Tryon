/**
 * Pose Solver Module - Foot Geometry Calculation
 *
 * Responsibilities:
 * - Convert 6 landmarks per foot → transformation matrix
 * - Calculate position (heel), rotation (toe direction), scale, tilt
 * - Handle missing/low-confidence landmarks gracefully
 * - Return complete 4×4 transformation matrices
 *
 * Math Foundation:
 * - Position = heel point (world space)
 * - Forward direction = normalized(toe - heel)
 * - Rotation = quaternion pointing from default forward to foot forward
 * - Scale = distance(heel, toe) / REFERENCE_FOOT_LENGTH
 * - Tilt = ankle offset relative to foot plane
 */

import * as Math3D from './utils/math.js';
import { getDimensions } from './camera.js';

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Reference foot length in normalized screen space
  // Used to calculate scale factor for shoe sizing
  referenceFootLength: 0.23,

  // Minimum confidence threshold for landmarks
  minLandmarkConfidence: 0.5,

  // Default forward direction for shoe model
  // Assumes shoe GLB has default +X or +Z as forward
  defaultShoeForward: new THREE.Vector3(1, 0, 0),

  // Up direction (for proper rotation calculations)
  upDirection: new THREE.Vector3(0, 0, 1),

  // Foot position offsets (for visual alignment)
  // Some models may render from toe instead of heel
  heelPositionOffset: new THREE.Vector3(0, 0, 0)
};

// ============================================================================
// STATE
// ============================================================================

let camera = null;
let videoWidth = 1280;
let videoHeight = 720;

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize pose solver with camera reference
 *
 * Must be called after Three.js camera is created
 *
 * @param {THREE.OrthographicCamera} threeCamera - Camera from shoeRenderer
 */
export function initializeSolver(threeCamera) {
  camera = threeCamera;
  const { width, height } = getDimensions();
  videoWidth = width;
  videoHeight = height;
  console.log('[PoseSolver] Initialized with camera and video dimensions:', { videoWidth, videoHeight });
}

/**
 * Update camera reference (e.g., on window resize)
 */
export function updateCamera(threeCamera) {
  if (threeCamera) {
    camera = threeCamera;
  }
}

// ============================================================================
// FOOT TRANSFORM CALCULATION
// ============================================================================

/**
 * Main solver function - converts landmarks to foot transforms
 *
 * Takes smoothed landmarks from MediaPipe and calculates
 * the transformation matrices needed to position and orient shoes.
 *
 * @param {Array<Object>} landmarks - 33 MediaPipe landmarks (smoothed)
 * @returns {Object} - {leftFoot, rightFoot} each with position, rotation, scale
 */
export function solveFootTransforms(landmarks) {
  if (!landmarks || !Array.isArray(landmarks)) {
    return {
      leftFoot: null,
      rightFoot: null
    };
  }

  // Extract foot landmarks (indices 27, 28, 29, 30, 31, 32)
  const leftFootLandmarks = {
    heel: landmarks[29],
    footIndex: landmarks[31],
    ankle: landmarks[27]
  };

  const rightFootLandmarks = {
    heel: landmarks[30],
    footIndex: landmarks[32],
    ankle: landmarks[28]
  };

  // Solve transforms for each foot
  const leftFoot = solveFootTransform(leftFootLandmarks, 'left');
  const rightFoot = solveFootTransform(rightFootLandmarks, 'right');

  return {
    leftFoot,
    rightFoot
  };
}

/**
 * Calculate transformation for a single foot
 *
 * @param {Object} footLandmarks - {heel, footIndex, ankle}
 * @param {string} side - 'left' or 'right'
 * @returns {Object} - {matrix, position, rotation, scale} or null if invalid
 */
export function solveFootTransform(footLandmarks, side = 'left') {
  if (!footLandmarks || !footLandmarks.heel || !footLandmarks.footIndex) {
    return null;
  }

  // Validate landmarks
  if (!isValidLandmark(footLandmarks.heel) || !isValidLandmark(footLandmarks.footIndex)) {
    console.warn(`[PoseSolver] Foot landmarks invalid for ${side} foot`);
    return null;
  }

  // Convert landmarks to world space
  const heelWorld = convertLandmarkToWorld(footLandmarks.heel);
  const toeWorld = convertLandmarkToWorld(footLandmarks.footIndex);
  const ankleWorld = footLandmarks.ankle ? convertLandmarkToWorld(footLandmarks.ankle) : null;

  // Calculate foot metrics
  const footLength = calculateFootLength(heelWorld, toeWorld);
  const footScale = calculateFootScale(footLength);
  const footForward = calculateFootForward(heelWorld, toeWorld);

  // Calculate rotation
  const rotation = calculateFootRotation(footForward);

  // Calculate tilt (if ankle available)
  let tilt = null;
  if (ankleWorld) {
    tilt = calculateAnkleTilt(heelWorld, toeWorld, ankleWorld);
  }

  // Create transformation matrix
  const position = heelWorld.clone().add(CONFIG.heelPositionOffset);
  const matrix = Math3D.matrix4FromTransform(position, rotation, footScale);

  return {
    matrix,
    position,
    rotation,
    scale: footScale,
    tilt,
    side,
    debug: {
      heelWorld,
      toeWorld,
      ankleWorld,
      footLength,
      footForward
    }
  };
}

// ============================================================================
// COORDINATE CONVERSION
// ============================================================================

/**
 * Convert MediaPipe landmark to Three.js world space
 *
 * Pipeline: Normalized → Pixels → NDC → World
 *
 * @param {Object} landmark - MediaPipe landmark {x, y, z}
 * @returns {THREE.Vector3} - World coordinates
 */
function convertLandmarkToWorld(landmark) {
  if (!landmark || !camera) {
    return new THREE.Vector3(0, 0, 0);
  }

  // Step 1: Denormalize to pixels
  const pixels = Math3D.denormalizeMediaPipeCoords(landmark, videoWidth, videoHeight);

  // Step 2: Convert to NDC
  const ndc = Math3D.toNDC(pixels, videoWidth, videoHeight);

  // Step 3: Convert to world space
  const worldPoint = Math3D.toWorldSpace(ndc, camera);

  return worldPoint;
}

// ============================================================================
// FOOT METRIC CALCULATIONS
// ============================================================================

/**
 * Calculate foot length (heel to toe distance)
 *
 * @param {THREE.Vector3} heel - Heel position
 * @param {THREE.Vector3} toe - Toe position
 * @returns {number} - Distance in world units
 */
function calculateFootLength(heel, toe) {
  return Math3D.distance(heel, toe);
}

/**
 * Calculate foot scale factor
 *
 * Maps detected foot length to shoe model scale.
 * Ensures shoes are sized appropriately to the detected foot.
 *
 * @param {number} detectedFootLength - Length in world units
 * @returns {number} - Scale factor for shoe model
 */
function calculateFootScale(detectedFootLength) {
  return Math3D.getFootScale(detectedFootLength, CONFIG.referenceFootLength);
}

/**
 * Calculate foot forward direction
 *
 * The shoe must point from heel to toe
 *
 * @param {THREE.Vector3} heel - Heel position
 * @param {THREE.Vector3} toe - Toe position
 * @returns {THREE.Vector3} - Normalized forward direction
 */
function calculateFootForward(heel, toe) {
  return Math3D.getFootForwardDirection(heel, toe);
}

/**
 * Calculate foot rotation quaternion
 *
 * Rotates from default shoe forward direction to actual foot forward
 *
 * @param {THREE.Vector3} footForward - Foot forward direction
 * @returns {THREE.Quaternion} - Rotation quaternion
 */
function calculateFootRotation(footForward) {
  return Math3D.quaternionFromTo(CONFIG.defaultShoeForward, footForward);
}

/**
 * Calculate ankle tilt
 *
 * Determines if the foot is tilted/leaning, which affects shoe positioning
 *
 * @param {THREE.Vector3} heel - Heel position
 * @param {THREE.Vector3} toe - Toe position
 * @param {THREE.Vector3} ankle - Ankle position
 * @returns {number} - Tilt angle in radians
 */
function calculateAnkleTilt(heel, toe, ankle) {
  return Math3D.calculateAnkleTilt(heel, toe, ankle);
}

// ============================================================================
// LANDMARK VALIDATION
// ============================================================================

/**
 * Check if a landmark is valid for use
 *
 * Valid = has coordinates + sufficient confidence
 *
 * @param {Object} landmark - Landmark to check
 * @returns {boolean}
 */
function isValidLandmark(landmark) {
  if (!landmark) return false;

  // Check coordinates exist and are valid
  if (typeof landmark.x !== 'number' || typeof landmark.y !== 'number') {
    return false;
  }

  if (!isFinite(landmark.x) || !isFinite(landmark.y)) {
    return false;
  }

  // Check confidence (visibility or presence)
  const confidence = landmark.visibility || landmark.presence || 0;
  if (confidence < CONFIG.minLandmarkConfidence) {
    return false;
  }

  return true;
}

/**
 * Get confidence of a landmark
 */
function getLandmarkConfidence(landmark) {
  if (!landmark) return 0;
  return landmark.visibility || landmark.presence || 0;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

/**
 * Set configuration parameters
 *
 * Allows tuning of the solver behavior
 *
 * @param {Object} config - Configuration object
 */
export function setConfig(config) {
  if (!config || typeof config !== 'object') return;

  if (typeof config.referenceFootLength === 'number') {
    CONFIG.referenceFootLength = config.referenceFootLength;
  }

  if (typeof config.minLandmarkConfidence === 'number') {
    CONFIG.minLandmarkConfidence = config.minLandmarkConfidence;
  }

  if (config.defaultShoeForward instanceof THREE.Vector3) {
    CONFIG.defaultShoeForward = config.defaultShoeForward.clone();
  }

  console.log('[PoseSolver] Configuration updated:', config);
}

/**
 * Get current configuration
 */
export function getConfig() {
  return {
    referenceFootLength: CONFIG.referenceFootLength,
    minLandmarkConfidence: CONFIG.minLandmarkConfidence,
    defaultShoeForward: CONFIG.defaultShoeForward.clone(),
    upDirection: CONFIG.upDirection.clone()
  };
}

// ============================================================================
// DEBUGGING AND ANALYSIS
// ============================================================================

/**
 * Log detailed information about foot transforms
 *
 * Useful for debugging positioning issues
 */
export function debugLogFootTransforms(transforms) {
  if (!transforms) {
    console.log('[PoseSolver] No transforms to log');
    return;
  }

  console.group('[PoseSolver] Foot Transforms:');

  if (transforms.leftFoot) {
    console.group('Left Foot:');
    const left = transforms.leftFoot;
    console.log(`  Position: (${left.position.x.toFixed(3)}, ${left.position.y.toFixed(3)}, ${left.position.z.toFixed(3)})`);
    console.log(`  Rotation: (${left.rotation.x.toFixed(3)}, ${left.rotation.y.toFixed(3)}, ${left.rotation.z.toFixed(3)}, ${left.rotation.w.toFixed(3)})`);
    console.log(`  Scale: ${left.scale.toFixed(3)}`);
    if (left.tilt) {
      console.log(`  Tilt: ${(left.tilt * 180 / Math.PI).toFixed(1)}°`);
    }
    if (left.debug) {
      console.log(`  Foot Length: ${left.debug.footLength.toFixed(3)}`);
    }
    console.groupEnd();
  }

  if (transforms.rightFoot) {
    console.group('Right Foot:');
    const right = transforms.rightFoot;
    console.log(`  Position: (${right.position.x.toFixed(3)}, ${right.position.y.toFixed(3)}, ${right.position.z.toFixed(3)})`);
    console.log(`  Rotation: (${right.rotation.x.toFixed(3)}, ${right.rotation.y.toFixed(3)}, ${right.rotation.z.toFixed(3)}, ${right.rotation.w.toFixed(3)})`);
    console.log(`  Scale: ${right.scale.toFixed(3)}`);
    if (right.tilt) {
      console.log(`  Tilt: ${(right.tilt * 180 / Math.PI).toFixed(1)}°`);
    }
    if (right.debug) {
      console.log(`  Foot Length: ${right.debug.footLength.toFixed(3)}`);
    }
    console.groupEnd();
  }

  console.groupEnd();
}

/**
 * Validate foot transform quality
 *
 * Checks if transforms are reasonable (not NaN, scale is realistic, etc.)
 */
export function validateFootTransforms(transforms) {
  const issues = [];

  if (!transforms) {
    issues.push('Transforms is null');
    return issues;
  }

  // Check left foot
  if (transforms.leftFoot) {
    const left = transforms.leftFoot;
    if (!left.position || !isFinite(left.position.x)) issues.push('Left foot position invalid');
    if (!left.rotation) issues.push('Left foot rotation invalid');
    if (left.scale < 0.3 || left.scale > 2) issues.push(`Left foot scale unrealistic: ${left.scale}`);
  }

  // Check right foot
  if (transforms.rightFoot) {
    const right = transforms.rightFoot;
    if (!right.position || !isFinite(right.position.x)) issues.push('Right foot position invalid');
    if (!right.rotation) issues.push('Right foot rotation invalid');
    if (right.scale < 0.3 || right.scale > 2) issues.push(`Right foot scale unrealistic: ${right.scale}`);
  }

  return issues;
}

console.log('[PoseSolver] Module loaded - Foot geometry solver ready');
