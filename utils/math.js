/**
 * Mathematics Utility Module - Coordinate Transformations
 *
 * Core responsibility: Convert MediaPipe landmarks (normalized screen coordinates)
 * to Three.js world coordinates for proper shoe placement.
 *
 * Transformation Pipeline:
 * MediaPipe (0-1 normalized) → Pixels → NDC (-1 to 1) → World Space
 */

// ============================================================================
// THREE.JS VECTOR AND QUATERNION HELPERS
// ============================================================================

/**
 * Create a Three.js Vector3
 */
function v3(x = 0, y = 0, z = 0) {
  return new THREE.Vector3(x, y, z);
}

/**
 * Create a Three.js Quaternion
 */
function quat(x = 0, y = 0, z = 0, w = 1) {
  return new THREE.Quaternion(x, y, z, w);
}

// ============================================================================
// COORDINATE TRANSFORMATION PIPELINE
// ============================================================================

/**
 * Step 1: Convert MediaPipe normalized coordinates to pixel coordinates
 *
 * MediaPipe output: {x: 0-1, y: 0-1, z: 0-1}
 * - x: 0 = left, 1 = right
 * - y: 0 = top, 1 = bottom
 * - z: relative depth (0 = far, 1 = near)
 *
 * @param {Object} normalizedPoint - Point with x, y, z in range [0, 1]
 * @param {number} videoWidth - Video frame width in pixels
 * @param {number} videoHeight - Video frame height in pixels
 * @returns {Object} Point in pixel coordinates
 */
export function denormalizeMediaPipeCoords(normalizedPoint, videoWidth, videoHeight) {
  if (!normalizedPoint) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    x: normalizedPoint.x * videoWidth,
    y: normalizedPoint.y * videoHeight,
    z: normalizedPoint.z // Keep depth as-is (will be used for scaling/distance)
  };
}

/**
 * Step 2: Convert pixel coordinates to Normalized Device Coordinates (NDC)
 *
 * NDC is the canonical Three.js coordinate system before projection:
 * - x: -1 (left) to +1 (right)
 * - y: -1 (bottom) to +1 (top)
 * - z: -1 (near) to +1 (far)
 *
 * Key: We negate Y because MediaPipe has Y=0 at top, but NDC has Y=1 at top
 *
 * @param {Object} pixelPoint - Point in pixel coordinates
 * @param {number} videoWidth - Video width in pixels
 * @param {number} videoHeight - Video height in pixels
 * @returns {Object} Point in NDC coordinates
 */
export function toNDC(pixelPoint, videoWidth, videoHeight) {
  if (!pixelPoint) {
    return { x: 0, y: 0, z: 0 };
  }

  return {
    // Standard NDC conversion: pixel → [-1, 1]
    x: (pixelPoint.x / videoWidth) * 2 - 1,

    // Negate Y: MediaPipe Y increases downward, NDC Y increases upward
    y: -((pixelPoint.y / videoHeight) * 2 - 1),

    // Depth: already in normalized space, negate to point into scene (away from camera)
    z: -pixelPoint.z
  };
}

/**
 * Step 3: Convert NDC coordinates to Three.js world space
 *
 * Assumes an orthographic camera configured as:
 * - Position: (0, 0, 5)
 * - Looking at: (0, 0, 0)
 * - Near: 0.1, Far: 1000
 * - Left: -width/2, Right: +width/2, Top: +height/2, Bottom: -height/2
 *
 * With orthographic projection, world coordinates = NDC × (camera width/2, camera height/2, ...)
 *
 * @param {Object} ndcPoint - Point in NDC coordinates
 * @param {THREE.OrthographicCamera} camera - The Three.js camera
 * @returns {THREE.Vector3} Point in world coordinates
 */
export function toWorldSpace(ndcPoint, camera) {
  if (!ndcPoint) {
    return v3(0, 0, 0);
  }

  // For orthographic camera, NDC directly maps to world space scaled by camera bounds
  const worldPoint = new THREE.Vector3();
  worldPoint.x = ndcPoint.x * (camera.right - camera.left) / 2;
  worldPoint.y = ndcPoint.y * (camera.top - camera.bottom) / 2;
  worldPoint.z = ndcPoint.z * (camera.far - camera.near) / 2 + (camera.far + camera.near) / 2;

  return worldPoint;
}

/**
 * SHORTCUT: Convert MediaPipe → World in one function
 *
 * @param {Object} normalizedPoint - MediaPipe landmark
 * @param {number} videoWidth - Video width
 * @param {number} videoHeight - Video height
 * @param {THREE.OrthographicCamera} camera - Three.js camera
 * @returns {THREE.Vector3} World space position
 */
export function mediapiePeToWorld(normalizedPoint, videoWidth, videoHeight, camera) {
  const pixels = denormalizeMediaPipeCoords(normalizedPoint, videoWidth, videoHeight);
  const ndc = toNDC(pixels, videoWidth, videoHeight);
  return toWorldSpace(ndc, camera);
}

// ============================================================================
// VECTOR OPERATIONS
// ============================================================================

/**
 * Calculate 3D distance between two points
 *
 * @param {THREE.Vector3} a - Point A
 * @param {THREE.Vector3} b - Point B
 * @returns {number} Euclidean distance
 */
export function distance(a, b) {
  if (!a || !b) return 0;
  return a.distanceTo(b);
}

/**
 * Calculate normalized (unit) vector from A to B
 *
 * @param {THREE.Vector3} a - Start point
 * @param {THREE.Vector3} b - End point
 * @returns {THREE.Vector3} Normalized direction vector
 */
export function directionVector(a, b) {
  if (!a || !b) return v3(0, 0, 1); // Default forward

  const direction = b.clone().sub(a);
  return direction.normalize();
}

/**
 * Linear interpolation between two points
 *
 * @param {THREE.Vector3} a - Start point
 * @param {THREE.Vector3} b - End point
 * @param {number} t - Interpolation factor [0, 1]
 * @returns {THREE.Vector3} Interpolated point
 */
export function lerpVector(a, b, t) {
  if (!a || !b) return a || v3(0, 0, 0);

  const result = a.clone();
  result.lerp(b, Math.max(0, Math.min(1, t)));
  return result;
}

/**
 * Scalar linear interpolation
 *
 * @param {number} a - Start value
 * @param {number} b - End value
 * @param {number} t - Interpolation factor [0, 1]
 * @returns {number} Interpolated value
 */
export function lerp(a, b, t) {
  const clampt = Math.max(0, Math.min(1, t));
  return a + (b - a) * clampt;
}

/**
 * Cross product (returns magnitude of perpendicular vector)
 * Used for calculating roll/tilt in foot orientation
 *
 * @param {THREE.Vector3} a - Vector A
 * @param {THREE.Vector3} b - Vector B
 * @returns {THREE.Vector3} Cross product A × B
 */
export function crossProduct(a, b) {
  if (!a || !b) return v3(0, 0, 0);

  return a.clone().cross(b);
}

/**
 * Dot product
 *
 * @param {THREE.Vector3} a - Vector A
 * @param {THREE.Vector3} b - Vector B
 * @returns {number} A · B
 */
export function dotProduct(a, b) {
  if (!a || !b) return 0;

  return a.dot(b);
}

/**
 * Get angle between two vectors (in radians)
 *
 * @param {THREE.Vector3} a - Vector A
 * @param {THREE.Vector3} b - Vector B
 * @returns {number} Angle in radians [0, π]
 */
export function angleBetweenVectors(a, b) {
  if (!a || !b) return 0;

  const normalized_a = a.clone().normalize();
  const normalized_b = b.clone().normalize();

  return Math.acos(
    Math.max(-1, Math.min(1, dotProduct(normalized_a, normalized_b)))
  );
}

// ============================================================================
// QUATERNION OPERATIONS (for 3D rotation)
// ============================================================================

/**
 * Create a quaternion that rotates vector FROM to vector TO
 *
 * This is the core of foot rotation calculation:
 * We want to rotate the shoe to point from heel to toe.
 *
 * @param {THREE.Vector3} from - Start direction (e.g., forward)
 * @param {THREE.Vector3} to - Target direction (e.g., toe direction)
 * @returns {THREE.Quaternion} Rotation from→to
 */
export function quaternionFromTo(from, to) {
  if (!from || !to) return quat();

  const normalized_from = from.clone().normalize();
  const normalized_to = to.clone().normalize();

  const result = quat();
  result.setFromUnitVectors(normalized_from, normalized_to);

  return result;
}

/**
 * Create a quaternion that represents "look at" matrix
 * Useful for rotating shoe to face a specific direction
 *
 * @param {THREE.Vector3} forward - Forward direction
 * @param {THREE.Vector3} up - Up direction (default: Y-axis)
 * @returns {THREE.Quaternion} Rotation quaternion
 */
export function quaternionLookAt(forward, up = v3(0, 1, 0)) {
  const matrix = new THREE.Matrix4();
  const position = v3(0, 0, 0);
  const target = position.clone().add(forward);

  matrix.lookAt(position, target, up);

  const quaternion = quat();
  quaternion.setFromRotationMatrix(matrix);

  return quaternion;
}

/**
 * Create quaternion from axis and angle
 *
 * @param {THREE.Vector3} axis - Rotation axis (should be normalized)
 * @param {number} angle - Rotation angle in radians
 * @returns {THREE.Quaternion}
 */
export function quaternionFromAxisAngle(axis, angle) {
  const quaternion = quat();
  quaternion.setFromAxisAngle(axis, angle);
  return quaternion;
}

/**
 * Slerp (spherical linear interpolation) between two quaternions
 * Creates smooth rotation transitions
 *
 * @param {THREE.Quaternion} q1 - Start quaternion
 * @param {THREE.Quaternion} q2 - End quaternion
 * @param {number} t - Interpolation factor [0, 1]
 * @returns {THREE.Quaternion} Interpolated quaternion
 */
export function slerpQuaternion(q1, q2, t) {
  if (!q1 || !q2) return quat();

  const result = q1.clone();
  result.slerp(q2, Math.max(0, Math.min(1, t)));
  return result;
}

// ============================================================================
// MATRIX OPERATIONS
// ============================================================================

/**
 * Create a 4×4 transformation matrix from position, rotation, and scale
 *
 * This is how we tell Three.js where and how to render the shoe model.
 *
 * @param {THREE.Vector3} position - Translation vector
 * @param {THREE.Quaternion} rotation - Rotation quaternion
 * @param {number} scale - Uniform scale factor
 * @returns {THREE.Matrix4} Transformation matrix
 */
export function matrix4FromTransform(position, rotation, scale = 1) {
  const matrix = new THREE.Matrix4();

  // Compose from position, quaternion, and scale
  matrix.compose(
    position || v3(0, 0, 0),
    rotation || quat(),
    v3(scale, scale, scale)
  );

  return matrix;
}

/**
 * Decompose a 4×4 matrix into position, rotation, scale
 *
 * Useful for extracting transforms from pre-computed matrices
 *
 * @param {THREE.Matrix4} matrix - Input matrix
 * @returns {Object} {position: Vector3, rotation: Quaternion, scale: number}
 */
export function decomposeMatrix4(matrix) {
  const position = v3();
  const rotation = quat();
  const scale = v3();

  matrix.decompose(position, rotation, scale);

  // Assume uniform scale (take X component)
  return {
    position,
    rotation,
    scale: scale.x
  };
}

/**
 * Multiply two 4×4 matrices
 *
 * @param {THREE.Matrix4} a - Matrix A
 * @param {THREE.Matrix4} b - Matrix B
 * @returns {THREE.Matrix4} Result of A × B
 */
export function multiplyMatrices(a, b) {
  if (!a || !b) return new THREE.Matrix4();

  const result = a.clone();
  result.multiply(b);
  return result;
}

/**
 * Invert a 4×4 matrix
 *
 * @param {THREE.Matrix4} matrix - Input matrix
 * @returns {THREE.Matrix4} Inverted matrix
 */
export function invertMatrix4(matrix) {
  if (!matrix) return new THREE.Matrix4();

  const result = matrix.clone();
  result.invert();
  return result;
}

// ============================================================================
// FOOT-SPECIFIC MATH
// ============================================================================

/**
 * Calculate foot length (heel to toe distance)
 *
 * @param {THREE.Vector3} heel - Heel position
 * @param {THREE.Vector3} toeIndex - Toe (foot index) position
 * @returns {number} Distance in world units
 */
export function calculateFootLength(heel, toeIndex) {
  return distance(heel, toeIndex);
}

/**
 * Calculate foot scale factor relative to reference length
 *
 * Use this to scale the shoe model to match the detected foot size.
 *
 * @param {number} detectedFootLength - Measured distance from heel to toe
 * @param {number} referenceFootLength - Standard foot length (default 0.23)
 * @returns {number} Scale factor to apply to shoe model
 */
export function getFootScale(detectedFootLength, referenceFootLength = 0.23) {
  if (detectedFootLength < 0.001) {
    return 1; // Default scale if no valid measurement
  }

  // Make sure scale is reasonable (between 0.5 and 1.5x)
  const scale = detectedFootLength / referenceFootLength;
  return Math.max(0.5, Math.min(1.5, scale));
}

/**
 * Calculate ankle tilt from three points
 *
 * Helps determine if the foot is tilted/leaning
 *
 * @param {THREE.Vector3} heel - Heel position
 * @param {THREE.Vector3} toeIndex - Toe position
 * @param {THREE.Vector3} ankle - Ankle position
 * @returns {number} Tilt angle in radians
 */
export function calculateAnkleTilt(heel, toeIndex, ankle) {
  if (!heel || !toeIndex || !ankle) return 0;

  // Foot vector (heel to toe)
  const footVector = directionVector(heel, toeIndex);

  // Ankle offset from heel
  const ankleVector = ankle.clone().sub(heel);

  // Angle between foot direction and ankle offset
  return angleBetweenVectors(footVector, ankleVector);
}

/**
 * Calculate foot forward direction (from heel to toe)
 *
 * @param {THREE.Vector3} heel - Heel position
 * @param {THREE.Vector3} toeIndex - Toe position
 * @returns {THREE.Vector3} Normalized forward direction
 */
export function getFootForwardDirection(heel, toeIndex) {
  return directionVector(heel, toeIndex);
}

/**
 * Calculate foot right direction (perpendicular to forward in ground plane)
 *
 * Assumes ground plane is XY and uses cross product
 *
 * @param {THREE.Vector3} forward - Forward direction
 * @returns {THREE.Vector3} Right direction
 */
export function getFootRightDirection(forward) {
  const up = v3(0, 0, 1); // Up in our coordinate system (Z-axis)
  const right = crossProduct(forward, up).normalize();
  return right;
}

/**
 * Create complete foot transformation matrix
 *
 * Combines position, rotation (forward direction), and scale into single matrix
 *
 * @param {THREE.Vector3} heelPosition - World position
 * @param {THREE.Vector3} toeDirection - Direction from heel to toe
 * @param {number} footScale - Scale factor for shoe model
 * @returns {THREE.Matrix4} Complete transformation matrix
 */
export function createFootTransformMatrix(heelPosition, toeDirection, footScale = 1) {
  // Calculate rotation from forward direction
  const defaultForward = v3(1, 0, 0); // Default shoe points in X direction
  const rotation = quaternionFromTo(defaultForward, toeDirection);

  // Compose into transformation matrix
  return matrix4FromTransform(heelPosition, rotation, footScale);
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Check if a value is valid (not NaN or infinite)
 */
export function isValidNumber(value) {
  return typeof value === 'number' && isFinite(value);
}

/**
 * Clamp a value between min and max
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Smoothly transition between two values (easing function)
 * Using Smoothstep for nice acceleration/deceleration
 */
export function smoothStep(t) {
  // Smoothstep: 3t² - 2t³
  const clamped = clamp(t, 0, 1);
  return clamped * clamped * (3 - 2 * clamped);
}

/**
 * Convert degrees to radians
 */
export function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Convert radians to degrees
 */
export function toDegrees(radians) {
  return radians * (180 / Math.PI);
}

console.log('[Math] Module loaded - Coordinate transformations ready');
