/**
 * Shoe Renderer Module - Three.js Scene Setup and Rendering
 *
 * Responsibilities:
 * - Initialize Three.js WebGLRenderer with alpha blending
 * - Set up orthographic camera matching video dimensions
 * - Load shoe GLB models via GLTFLoader
 * - Update shoe transforms per frame
 * - Render the 3D scene onto canvas overlay
 *
 * Critical: Orthographic camera ensures 1:1 coordinate mapping for proper
 * shoe placement on detected feet.
 */

// ============================================================================
// STATE
// ============================================================================

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

let renderer = null;
let scene = null;
let camera = null;
let shoeModels = {
  left: null,
  right: null
};
let canvas = null;
let glbLoader = null;
let isInitialized = false;

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  // Renderer settings optimized for mobile
  antiAlias: true,
  alpha: true,
  powerPreference: 'high-performance',
  precision: 'mediump',

  // Camera near/far for orthographic projection
  cameraDepthNear: 0.1,
  cameraDepthFar: 1000,

  // Material settings
  shoeOpacity: 1.0,
  shoeAlphaTest: 0.5,
  shoeSideRendering: THREE.FrontSide,

  // Clear color (transparent)
  clearColor: 0x000000,
  clearAlpha: 0
};

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize Three.js renderer
 *
 * Sets up:
 * - WebGLRenderer with transparency
 * - Orthographic camera aligned with video dimensions
 * - Scene with lighting for 3D shoes
 * - Clear color (transparent background)
 *
 * @param {HTMLCanvasElement} canvasElement - Canvas for rendering
 * @param {number} videoWidth - Video width in pixels
 * @param {number} videoHeight - Video height in pixels
 * @param {number} pixelRatio - Device pixel ratio (1.5 recommended for mobile)
 * @returns {Promise<void>}
 */
export async function initialize(canvasElement, videoWidth, videoHeight, pixelRatio = 1) {
  if (isInitialized) {
    console.warn('[ShoeRenderer] Already initialized');
    return;
  }

  canvas = canvasElement;

  try {
    // ========== RENDERER SETUP ==========
    renderer = new THREE.WebGLRenderer({
      canvas: canvas,
      alpha: CONFIG.alpha,
      antialias: CONFIG.antiAlias,
      powerPreference: CONFIG.powerPreference,
      precision: CONFIG.precision
    });

    // Set pixel ratio for mobile optimization
    renderer.setPixelRatio(pixelRatio);
    console.log(`[ShoeRenderer] Pixel ratio set to ${pixelRatio}`);

    // Set canvas size to match video
    renderer.setSize(videoWidth, videoHeight, false);
    console.log(`[ShoeRenderer] Canvas size: ${videoWidth}x${videoHeight}`);

    // Transparent background
    renderer.setClearColor(CONFIG.clearColor, CONFIG.clearAlpha);
    renderer.clear();

    // Mobile: disable features for better performance
    renderer.sortObjects = false; // Don't auto-sort objects
    renderer.shadowMap.enabled = false; // Disable shadows on mobile for performance

    // ========== CAMERA SETUP ==========
    // Orthographic camera is critical: ensures 1:1 coordinate mapping
    // Formula: camera bounds = (±videoWidth/2, ±videoHeight/2)
    const left = -videoWidth / 2;
    const right = videoWidth / 2;
    const top = videoHeight / 2;
    const bottom = -videoHeight / 2;

    camera = new THREE.OrthographicCamera(
      left, right, top, bottom,
      CONFIG.cameraDepthNear,
      CONFIG.cameraDepthFar
    );

    // Position camera looking down at the z=0 plane
    // Shoes will be rendered at various negative Z values
    camera.position.z = 5;
    camera.lookAt(0, 0, 0);
    console.log('[ShoeRenderer] Orthographic camera initialized');
    console.log(`  Bounds: X=[${left}, ${right}], Y=[${bottom}, ${top}], Z=[${CONFIG.cameraDepthNear}, ${CONFIG.cameraDepthFar}]`);

    // ========== SCENE SETUP ==========
    scene = new THREE.Scene();
    scene.background = null; // Transparent background
    scene.fog = null; // No fog for 2D overlay

    // Add lighting
    // Ambient light for general fill
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.2);
    scene.add(ambientLight);

    // Directional light for definition
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(1, 1, 5);
    scene.add(directionalLight);

    console.log('[ShoeRenderer] Scene initialized with lighting');

    // ========== GLTF LOADER SETUP ==========
    // GLTFLoader is available globally from the CDN script
    // if (typeof GLTFLoader === 'undefined') {
    //   throw new Error('GLTFLoader not available - check that Three.js examples are loaded in index.html');
    // }

    glbLoader = new GLTFLoader();
    console.log('[ShoeRenderer] GLTFLoader ready');

    isInitialized = true;
    console.log('[ShoeRenderer] ✓ Initialization complete');
  } catch (error) {
    console.error('[ShoeRenderer] Initialization failed:', error);
    throw error;
  }
}

// ============================================================================
// MODEL LOADING
// ============================================================================

/**
 * Load a shoe GLB model from file
 *
 * Creates two instances: one for left foot, one for right foot
 *
 * @param {string} modelPath - Path to GLB file (e.g. './models/shoe.glb')
 * @returns {Promise<THREE.Group|null>} - Loaded model or null on error
 */
export async function loadShoeModel(modelPath) {
  if (!isInitialized || !glbLoader) {
    console.error('[ShoeRenderer] Renderer not initialized');
    return null;
  }

  try {
    console.log('[ShoeRenderer] Loading shoe model from:', modelPath);

    // Load GLB file
    const gltf = await glbLoader.loadAsync(modelPath);
    const model = gltf.scene;

    console.log(`[ShoeRenderer] ✓ Shoe model loaded successfully`);
    console.log(`  Vertices: ${countVertices(model)}`);
    console.log(`  Materials: ${countMaterials(model)}`);

    // Create left shoe instance
    shoeModels.left = model.clone();
    shoeModels.left.name = 'shoe_left';
    setupShoeModel(shoeModels.left, 'left');
    scene.add(shoeModels.left);
    console.log('[ShoeRenderer] Left shoe instance added to scene');

    // Create right shoe instance
    shoeModels.right = model.clone();
    shoeModels.right.name = 'shoe_right';
    setupShoeModel(shoeModels.right, 'right');
    scene.add(shoeModels.right);
    console.log('[ShoeRenderer] Right shoe instance added to scene');

    return model;
  } catch (error) {
    console.error('[ShoeRenderer] Failed to load shoe model:', error);
    return null;
  }
}

/**
 * Setup shoe model material and properties
 *
 * @param {THREE.Group} shoeGroup - Loaded shoe model group
 * @param {string} side - 'left' or 'right'
 */
function setupShoeModel(shoeGroup, side) {
  shoeGroup.traverse((node) => {
    // Update all materials for proper transparency
    if (node.isMesh) {
      if (node.material) {
        // Ensure material supports transparency
        if (Array.isArray(node.material)) {
          node.material.forEach(mat => {
            configureMaterial(mat);
          });
        } else {
          configureMaterial(node.material);
        }
      }

      // Initial position: hide off-screen
      // Will be positioned by updateShoe() each frame
      node.visible = true;
    }
  });

  console.log(`[ShoeRenderer] Setup ${side} shoe model`);
}

/**
 * Configure material for proper rendering (transparency, shading, etc.)
 */
function configureMaterial(material) {
  if (!material) return;

  // Enable transparency
  material.transparent = true;
  material.opacity = CONFIG.shoeOpacity;

  // Alpha test: discard fully transparent pixels
  material.alphaTest = CONFIG.shoeAlphaTest;

  // Single-sided rendering (more efficient)
  material.side = CONFIG.shoeSideRendering;

  // Use standard material if available (better for mobile)
  if (material instanceof THREE.MeshPhongMaterial ||
      material instanceof THREE.MeshStandardMaterial) {
    // Good, keep existing material type
  }
}

// ============================================================================
// TRANSFORM APPLICATION
// ============================================================================

/**
 * Apply foot transform to shoe model
 *
 * Updates position, rotation, and scale of the shoe model
 *
 * @param {Object} footTransform - From poseSolver: {position, rotation, scale}
 * @param {string} side - 'left' or 'right'
 */
export function updateShoe(footTransform, side) {
  const shoe = side === 'left' ? shoeModels.left : shoeModels.right;

  if (!shoe || !footTransform) {
    return;
  }

  // Apply position
  if (footTransform.position) {
    shoe.position.copy(footTransform.position);
  }

  // Apply rotation
  if (footTransform.rotation) {
    shoe.quaternion.copy(footTransform.rotation);
  }

  // Apply scale (uniform scaling)
  if (typeof footTransform.scale === 'number') {
    shoe.scale.set(footTransform.scale, footTransform.scale, footTransform.scale);
  }

  // Apply tilt if available (additional rotation)
  if (footTransform.tilt && footTransform.tilt !== 0) {
    // Tilt around shoe's forward axis
    // footTransform.tilt contains the ankle tilt angle
    // This could be applied as additional rotation if desired
  }
}

/**
 * Update both shoes
 *
 * Convenience function for updating both feet at once
 *
 * @param {Object} footTransforms - {leftFoot, rightFoot} from poseSolver
 */
export function updateShoes(footTransforms) {
  if (!footTransforms) return;

  if (footTransforms.leftFoot) {
    updateShoe(footTransforms.leftFoot, 'left');
  }

  if (footTransforms.rightFoot) {
    updateShoe(footTransforms.rightFoot, 'right');
  }
}

// ============================================================================
// RENDERING
// ============================================================================

/**
 * Render the scene
 *
 * Should be called every animation frame
 */
export function render() {
  if (!renderer || !scene || !camera) {
    return;
  }

  renderer.render(scene, camera);
}

// ============================================================================
// CLEANUP
// ============================================================================

/**
 * Cleanup and dispose resources
 *
 * Call before destroying the renderer
 */
export function cleanup() {
  if (shoeModels.left) {
    disposeObject(shoeModels.left);
    shoeModels.left = null;
  }

  if (shoeModels.right) {
    disposeObject(shoeModels.right);
    shoeModels.right = null;
  }

  if (scene) {
    scene.clear();
    scene = null;
  }

  if (renderer) {
    renderer.dispose();
    renderer = null;
  }

  camera = null;
  canvas = null;
  glbLoader = null;
  isInitialized = false;

  console.log('[ShoeRenderer] ✓ Cleanup complete');
}

/**
 * Recursively dispose objects and free GPU memory
 */
function disposeObject(obj) {
  obj.traverse((node) => {
    if (node.geometry) {
      node.geometry.dispose();
    }

    if (node.material) {
      if (Array.isArray(node.material)) {
        node.material.forEach((mat) => {
          if (mat.map) mat.map.dispose();
          mat.dispose();
        });
      } else {
        if (node.material.map) node.material.map.dispose();
        node.material.dispose();
      }
    }
  });
}

// ============================================================================
// CANVAS RESIZING
// ============================================================================

/**
 * Handle canvas/window resize
 *
 * Call when window resizes or orientation changes
 *
 * @param {number} width - New width in pixels
 * @param {number} height - New height in pixels
 */
export function handleResize(width, height) {
  if (!renderer || !camera) {
    return;
  }

  // Update renderer
  renderer.setSize(width, height, false);

  // Update orthographic camera bounds
  const left = -width / 2;
  const right = width / 2;
  const top = height / 2;
  const bottom = -height / 2;

  camera.left = left;
  camera.right = right;
  camera.top = top;
  camera.bottom = bottom;
  camera.updateProjectionMatrix();

  console.log(`[ShoeRenderer] Resized to ${width}x${height}`);
}

// ============================================================================
// DEBUGGING AND ANALYSIS
// ============================================================================

/**
 * Count total vertices in model
 */
function countVertices(obj) {
  let count = 0;
  obj.traverse((node) => {
    if (node.geometry && node.geometry.attributes.position) {
      count += node.geometry.attributes.position.count;
    }
  });
  return count;
}

/**
 * Count materials in model
 */
function countMaterials(obj) {
  const materials = new Set();
  obj.traverse((node) => {
    if (node.material) {
      if (Array.isArray(node.material)) {
        node.material.forEach((mat) => materials.add(mat));
      } else {
        materials.add(node.material);
      }
    }
  });
  return materials.size;
}

/**
 * Log scene statistics
 */
export function debugLogSceneStats() {
  console.group('[ShoeRenderer] Scene Statistics:');
  console.log('Scene objects:', scene.children.length);
  console.log('Camera position:', camera.position);
  console.log('Camera bounds:',
    `X=[${camera.left}, ${camera.right}], Y=[${camera.bottom}, ${camera.top}]`
  );

  if (shoeModels.left) {
    console.log('Left shoe position:', shoeModels.left.position);
    console.log('Left shoe scale:', shoeModels.left.scale);
  }

  if (shoeModels.right) {
    console.log('Right shoe position:', shoeModels.right.position);
    console.log('Right shoe scale:', shoeModels.right.scale);
  }

  console.groupEnd();
}

/**
 * Get the Three.js camera used for rendering
 *
 * Needed by poseSolver to convert coordinates
 *
 * @returns {THREE.OrthographicCamera|null}
 */
export function getCamera() {
  return camera;
}

/**
 * Get renderer information
 */
export function getInfo() {
  if (!renderer) return null;

  return {
    initialized: isInitialized,
    renderer: {
      version: renderer.getContext().getParameter(renderer.getContext().VERSION),
      powerPreference: CONFIG.powerPreference
    },
    camera: {
      type: 'Orthographic',
      position: camera.position,
      bounds: {
        x: [camera.left, camera.right],
        y: [camera.bottom, camera.top],
        z: [CONFIG.cameraDepthNear, CONFIG.cameraDepthFar]
      }
    },
    shoesLoaded: {
      left: shoeModels.left !== null,
      right: shoeModels.right !== null
    }
  };
}

console.log('[ShoeRenderer] Module loaded - Three.js rendering ready');
