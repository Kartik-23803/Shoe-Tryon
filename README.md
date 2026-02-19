# AR Virtual Shoe Try-On Platform

A browser-based augmented reality (AR) application that overlays 3D shoe models on users' feet using MediaPipe pose detection and Three.js rendering. Designed for retail environments - runs entirely client-side on mobile browsers (iOS and Android) without installation.

## Features

- **Real-time Pose Detection**: Uses MediaPipe Tasks Vision Pose Landmarker to detect human feet
- **3D Shoe Rendering**: Three.js powered 3D rendering with proper orthographic projection
- **Kalman Filtering**: Smooths pose landmarks to reduce MediaPipe jitter
- **Mobile Optimized**: 24+ FPS target on mid-range Android phones
- **No Backend**: 100% client-side processing, deployable as static site
- **Full Transparency**: No external AR SDKs (no AR.js, no 8thWall)

## Architecture

### Module Structure

```
main.js                    # Orchestration & animation loop
├── camera.js             # Camera permission & stream management
├── poseDetector.js       # MediaPipe Pose Landmarker integration
├── smoothing.js          # Kalman filtering for noise reduction
├── poseSolver.js         # Foot geometry calculation (position, rotation, scale)
├── shoeRenderer.js       # Three.js scene setup & rendering
└── utils/
    └── math.js           # Coordinate transformations (critical path)

index.html                 # HTML structure with video/canvas elements
style.css                  # Fullscreen responsive layout
models/shoe.glb            # 3D shoe model (glTF format)
```

### Data Flow

```
Camera Input (getUserMedia)
    ↓
MediaPipe Pose Detection (33 landmarks)
    ↓
Kalman Smoothing Filter (per landmark, per dimension)
    ↓
Foot Geometry Solver (position, rotation, scale from 6 landmarks)
    ↓
Three.js Shoe Rendering (orthographic camera overlay)
    ↓
WebGL Canvas (transparent blend with video)
```

## Coordinate System

**Critical for proper shoe placement:**

1. **MediaPipe Output**: Normalized coordinates (0-1, origin at top-left)
2. **Denormalization**: Convert to pixels (0 to videoWidth/videoHeight)
3. **NDC Conversion**: Convert to normalized device coordinates (-1 to 1)
4. **World Space**: Orthographic camera maps to Three.js world coordinates

See `utils/math.js` for implementation details.

## Setup

### Prerequisites

- Modern mobile browser (Chrome Android 12+, Safari iOS 15.1+)
- HTTPS deployment (required for camera access)
- A 3D shoe model in GLB/glTF format

### Local Development

```bash
# Clone repository
git clone <repository-url>
cd ar-shoe-tryon

# Start local server (requires Node.js)
npm install -g serve
serve .

# Open in mobile browser at: http://your-local-ip:3000
```

### Shoe Model

Place your 3D shoe model at `models/shoe.glb`. The model should:
- Be in GLB format (binary glTF)
- Have its forward direction along +X or +Z axis
- Be centered at origin
- Be reasonably optimized (< 100k vertices recommended)

**Testing without model:**
The app will run but show no shoes if the model file is missing. Check browser console for loading errors.

## Deployment to Vercel

### One-Click Deploy

```bash
vercel
```

### Manual Deploy

1. **Create Vercel account** at vercel.com
2. **Connect GitHub repository** (or upload folder)
3. **Deploy**: Vercel auto-detects static site
4. **Enable HTTPS**: Automatic with Vercel

### Vercel Configuration

Default settings work out of the box. Optional `vercel.json`:

```json
{
  "buildCommand": "echo 'Static site'",
  "outputDirectory": ".",
  "headers": [
    {
      "source": "/index.html",
      "headers": [
        {
          "key": "Cache-Control",
          "value": "no-cache"
        }
      ]
    }
  ]
}
```

## Performance Optimization

### Mobile Target: 24+ FPS

**Frame Rate Analysis:**
- Animation Loop: 60 FPS (requestAnimationFrame)
- Pose Detection: 30 FPS max (MediaPipe limitation, throttled)
- Rendering: 60 FPS (WebGL target)
- Result: Smooth 30 FPS for shoe updates

### Optimizations Applied

1. **Pose Detection Throttling**
   - Limited to 30 FPS maximum
   - Frame skipping if detection takes > 20ms
   - Reuses previous frame data when skipped

2. **Renderer Optimization**
   - Pixel ratio capped at 1.5x on Android, 1.75x on iOS
   - Single shoe geometry with matrix transforms
   - Disabled shadows and object sorting
   - Orthographic camera (no perspective calculations)

3. **Memory Management**
   - Pre-allocated vectors/matrices during init
   - No object creation in animation loop
   - Proper WebGL resource disposal

4. **Kalman Filtering**
   - Smooth jitter with minimal lag
   - Tunable q/r parameters

## API Reference

### Main Lifecycle

```javascript
// Start application
await window.shoeARApp.start();

// Pause detection & rendering
window.shoeARApp.pause();

// Resume
window.shoeARApp.resume();

// Cleanup
await window.shoeARApp.cleanup();

// Get performance stats
const stats = window.shoeARApp.getPerformanceStats();
console.log(stats);
// { detectionAvg, detectionMax, renderAvg, renderMax, fps }
```

### Module Functions

**camera.js:**
- `initCamera(videoElement)` - Request camera permissions
- `getDimensions()` - Get video {width, height}
- `getVideoStream()` - Get MediaStream

**poseDetector.js:**
- `createPoseDetector(video)` - Load MediaPipe model
- `detectPose(stream)` - Run detection on current frame
- `extractFootLandmarks(landmarks)` - Get 6 foot landmarks

**smoothing.js:**
- `initializeSmoother(numLandmarks, config)` - Create Kalman filters
- `updateSmoother(rawLandmarks)` - Filter and return smoothed landmarks
- `setKalmanConfig(q, r)` - Tune smoothing parameters

**poseSolver.js:**
- `solveFootTransforms(landmarks)` - Convert to foot transforms
- `setConfig(config)` - Configure solver (reference foot length, etc.)

**shoeRenderer.js:**
- `initialize(canvas, width, height, pixelRatio)` - Setup Three.js
- `loadShoeModel(path)` - Load GLB file
- `updateShoe(transform, side)` - Apply transform to shoe
- `render()` - Render scene to canvas

**utils/math.js:**
- `mediapiePeToWorld(point, w, h, camera)` - Coordinate conversion
- `solveFootTransforms(landmarks, camera)` - Convert landmarks to matrices
- All vector/quaternion operations

## Debugging

### Browser Console

Enable debug logging:

```javascript
// Performance stats
window.shoeARApp.getPerformanceStats()

// Pose landmarks
// In main.js frameLoop(): uncomment debugLogLandmarks()

// Foot transforms
// In poseSolver.js: call debugLogFootTransforms(transforms)

// Scene info
window.shoeARApp.state
```

### Camera Issues

```javascript
// Check camera status
const stream = window.shoeARApp.state.camera;
stream.getVideoTracks()[0].getSettings()

// Common issues:
// - NotAllowedError: Permission denied
// - NotFoundError: No camera device
// - NotReadableError: Camera in use elsewhere
```

### Pose Detection

```javascript
// Check detector status
window.shoeARApp.state.poseDetector

// Verify detection is running
window.shoeARApp.state.detectionActive

// Get error count
getDetectionErrorCount()
```

## Browser Compatibility

### Fully Supported
- ✅ Chrome Android 12+
- ✅ Samsung Internet 15+
- ✅ Safari iOS 15.1+
- ✅ Firefox Android

### Requirements
- WebGL 2.0
- getUserMedia API
- ES6 Modules
- HTTPS (for camera access)

### Known Issues
- Background tabs may pause camera on some browsers
- iPhone X+ notch may partially overlap UI (safe-area-inset handling included)
- Very low-end devices (<2GB RAM) may drop frames

## Monitoring Performance

### Profiling on Mobile

**Chrome DevTools Remote Debugging:**
```bash
# Android device connected via USB
chrome://inspect
# Then enable performance profiling
```

**Key metrics to monitor:**
- Animation frame time (target: < 16.67ms for 60 FPS)
- Detection time (target: < 33ms for 30 FPS)
- Memory usage (target: < 100MB)
- GPU memory (mobile GPUs: 128-512MB shared)

### Performance Targets

| Metric | Target | Success Threshold |
|--------|--------|-------------------|
| Frame Rate | 30 FPS | > 24 FPS |
| Detection Latency | < 33ms | < 40ms |
| Smoothing Lag | < 50ms | < 80ms |
| Model Load Time | < 5s | < 10s |
| Total Memory | < 100MB | < 150MB |

## Known Limitations

1. **Single Person**: Only detects one person per frame (MediaPipe limitation)
2. **Pose Quality**: Detection quality depends on lighting, foot visibility, and pose clarity
3. **Mobile Variable**: Performance varies significantly between devices
4. **Model Size**: Large GLB files (> 50MB) may cause loading delays

## Future Enhancements

- [ ] Multiple person pose detection
- [ ] Hand try-on (gloves, rings)
- [ ] Clothing virtual try-on
- [ ] Photo/video capture
- [ ] Analytics tracking (heatmaps, engagement)
- [ ] WebXR integration for VR headsets
- [ ] Offline mode with cached models

## Troubleshooting

### App won't start
1. Check browser console for errors
2. Verify HTTPS (required for camera)
3. Check that all CDN scripts loaded (Three.js, MediaPipe)
4. Ensure models/shoe.glb exists

### Shoes not appearing
1. Check that shoe model loaded (browser DevTools → Network)
2. Verify Three.js renderer initialized
3. Try model in different viewer first
4. Check WebGL support: `webglcheck.com`

### Shoes in wrong position
1. Check pose detection working: Enable pose landmark visualization
2. Verify camera module initialized properly
3. Check coordinate transformation in math.js
4. Run `debugLogFootTransforms()` and verify values

### Performance is poor
1. Use Performance profiler (Chrome DevTools)
2. Check if detection is overrunning (> 33ms)
3. Reduce pixel ratio: edit shoeRenderer.js CONFIG
4. Simplify shoe model (reduce vertices)

## Technical Details

### Pose Landmarks Used (MediaPipe indices)

```
Left Foot:  27=Ankle, 29=Heel, 31=Foot Index (toe)
Right Foot: 28=Ankle, 30=Heel, 32=Foot Index (toe)
```

### Kalman Filter Parameters

```
q: 0.02  # Process noise (detection responsiveness)
r: 0.05  # Measurement noise (smoothness/lag)
```

Lower q = more responsive, Higher r = more smooth

### Coordinate Systems

- **MediaPipe**: (0-1, 0-1) with origin at top-left, Y increases downward
- **Pixels**: (0-width, 0-height) with origin at top-left
- **NDC**: (-1 to 1, -1 to 1) with origin at center
- **World**: Three.js coordinates with origin at camera center

Transformation happens in `utils/math.js` with full pipeline documented.

## License

[MIT or your chosen license]

## Support

For issues and questions:
1. Check browser console for error messages
2. Verify HTTPS and camera permissions
3. Test on a different device/browser
4. Check GitHub Issues
5. Review Performance Profiler output

## Contributing

Pull requests welcome! Please:
1. Test on both Chrome Android and Safari iOS
2. Verify 24+ FPS on mid-range devices
3. Update documentation for public API changes
4. Include performance analysis if modifying hot paths
