/**
 * Camera Module - Media Stream Management
 *
 * Responsibilities:
 * - Request camera permissions (environment-facing/rear)
 * - Manage video stream lifecycle
 * - Handle device orientation changes
 * - Provide video dimensions and stream access
 */

// ============================================================================
// STATE
// ============================================================================

let videoStream = null;
let videoElement = null;
let videoDimensions = {
  width: 0,
  height: 0
};

// ============================================================================
// CONFIGURATION
// ============================================================================

const CAMERA_CONSTRAINTS = {
  video: {
    // Request environment-facing (rear) camera
    facingMode: {
      exact: 'environment' // Will throw error if not available
    },
    // Request ideal resolution for good balance on mobile
    width: {
      ideal: 1280
    },
    height: {
      ideal: 720
    },
    // Request 30fps
    frameRate: {
      ideal: 30
    }
  },
  audio: false // We don't need audio
};

// Fallback constraints if environment camera unavailable
const FALLBACK_CONSTRAINTS = {
  video: {
    facingMode: 'environment',
    width: {
      ideal: 1280
    },
    height: {
      ideal: 720
    },
    frameRate: {
      ideal: 30
    }
  },
  audio: false
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Check if getUserMedia is supported
 */
function isUserMediaSupported() {
  return !!(
    navigator.mediaDevices &&
    navigator.mediaDevices.getUserMedia
  );
}

/**
 * Handle getUserMedia errors gracefully
 */
function handleMediaError(error) {
  console.error('[Camera] getUserMedia error:', error);

  switch (error.name) {
    case 'NotAllowedError':
      return 'Camera permission was denied. Please enable camera access in your browser settings.';
    case 'NotFoundError':
      return 'No camera device found. Does this device have a camera?';
    case 'NotReadableError':
      return 'The camera is already in use by another application.';
    case 'SecurityError':
      return 'Camera access requires a secure HTTPS connection.';
    case 'NotSupportedError':
      return 'Camera API is not supported in this browser.';
    case 'OverconstrainedError':
      return 'The current device cannot meet the requested camera constraints.';
    default:
      return `Camera error: ${error.message}`;
  }
}

/**
 * Update video element tracking attributes after stream starts
 */
function updateVideoTracking() {
  return new Promise((resolve) => {
    if (!videoElement) {
      resolve();
      return;
    }

    // Wait for video to have metadata (width/height)
    const onLoadedMetadata = () => {
      videoDimensions.width = videoElement.videoWidth;
      videoDimensions.height = videoElement.videoHeight;

      console.log(
        `[Camera] Video dimensions: ${videoDimensions.width}x${videoDimensions.height}`
      );

      videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
      resolve();
    };

    videoElement.addEventListener('loadedmetadata', onLoadedMetadata);

    // Fallback timeout
    setTimeout(() => {
      videoElement.removeEventListener('loadedmetadata', onLoadedMetadata);
      if (videoDimensions.width === 0) {
        videoDimensions.width = 1280;
        videoDimensions.height = 720;
      }
      resolve();
    }, 2000);
  });
}

/**
 * Handle orientation changes (portrait/landscape)
 */
function setupOrientationHandler() {
  window.addEventListener('orientationchange', () => {
    console.log(`[Camera] Orientation changed: ${window.orientation || 'unknown'}`);
    // Canvas will be resized by the renderer when needed
  });
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Initialize camera and request permissions
 * @param {HTMLVideoElement} videoElementRef - Video element to attach stream to
 * @returns {Promise<MediaStream|null>} - Returns stream on success, null on error
 */
export async function initCamera(videoElementRef) {
  if (!isUserMediaSupported()) {
    console.error('[Camera] getUserMedia not supported');
    return null;
  }

  videoElement = videoElementRef;

  try {
    console.log('[Camera] Requesting camera access with constraints:', CAMERA_CONSTRAINTS);

    // Try exact environment camera first
    videoStream = await navigator.mediaDevices.getUserMedia(CAMERA_CONSTRAINTS);

    console.log('[Camera] ✓ Camera access granted (environment camera)');
  } catch (error1) {
    // Fallback to non-exact environment camera request
    console.warn('[Camera] Exact environment camera not available, trying fallback:', error1.message);

    try {
      videoStream = await navigator.mediaDevices.getUserMedia(FALLBACK_CONSTRAINTS);
      console.log('[Camera] ✓ Camera access granted (fallback constraints)');
    } catch (error2) {
      // All attempts failed
      const errorMessage = handleMediaError(error2);
      console.error('[Camera] Fatal error:', errorMessage);
      return null;
    }
  }

  // Attach stream to video element
  videoElement.srcObject = videoStream;

  // Configure video element for proper iOS playback
  videoElement.setAttribute('playsinline', 'true');
  videoElement.setAttribute('muted', 'true');
  videoElement.setAttribute('autoplay', 'true');

  // Start playback
  try {
    await videoElement.play();
    console.log('[Camera] ✓ Video playback started');
  } catch (error) {
    console.error('[Camera] Video play error:', error);
    return null;
  }

  // Wait for video dimensions
  await updateVideoTracking();

  // Setup orientation handling
  setupOrientationHandler();

  return videoStream;
}

/**
 * Get the current video stream
 * @returns {MediaStream|null}
 */
export function getVideoStream() {
  return videoStream;
}

/**
 * Get video dimensions (width and height)
 * @returns {{width: number, height: number}}
 */
export function getDimensions() {
  return {
    width: videoDimensions.width || 1280,
    height: videoDimensions.height || 720
  };
}

/**
 * Get the video element
 * @returns {HTMLVideoElement|null}
 */
export function getVideoElement() {
  return videoElement;
}

/**
 * Stop camera stream and cleanup
 */
export function stopCamera() {
  if (videoStream) {
    // Stop all tracks
    videoStream.getTracks().forEach(track => {
      track.stop();
      console.log(`[Camera] ✓ Stopped ${track.kind} track`);
    });

    videoStream = null;
  }

  if (videoElement) {
    videoElement.srcObject = null;
  }

  console.log('[Camera] ✓ Camera stopped');
}

/**
 * Check if camera is currently active
 * @returns {boolean}
 */
export function isActive() {
  return !!videoStream;
}

/**
 * Get camera capabilities (for advanced use)
 * @returns {Promise<Object>}
 */
export async function getCameraCapabilities() {
  if (!videoStream) {
    return null;
  }

  const videoTrack = videoStream.getVideoTracks()[0];
  if (!videoTrack || !videoTrack.getCapabilities) {
    return null;
  }

  return videoTrack.getCapabilities();
}

/**
 * Get current camera settings
 * @returns {Promise<Object>}
 */
export async function getCameraSettings() {
  if (!videoStream) {
    return null;
  }

  const videoTrack = videoStream.getVideoTracks()[0];
  if (!videoTrack) {
    return null;
  }

  return videoTrack.getSettings();
}

console.log('[Camera] Module loaded');
