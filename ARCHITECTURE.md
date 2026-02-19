# Architecture & Data Flow Documentation

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                      MOBILE BROWSER                              │
│                   (Chrome Android/Safari iOS)                   │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    index.html                             │   │
│  │  <video id="camera-video">  ← Camera stream              │   │
│  │  <canvas id="three-canvas">  ← Three.js overlay          │   │
│  │  <div id="error-overlay">    ← Error messages            │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                 ↓                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    main.js (Orchestration)                │   │
│  │  ┌─ initialize()   ── Set up all modules                 │   │
│  │  ├─ frameLoop()   ── Main animation loop (60 FPS RAF)   │   │
│  │  └─ cleanup()     ── Teardown & resource disposal        │   │
│  └──────────────────────────────────────────────────────────┘   │
│          ↓           ↓           ↓            ↓          ↓        │
│   ┌───────────┐ ┌──────────┐ ┌───────┐ ┌──────────┐ ┌─────────┐ │
│   │  camera  │ │ pose     │ │smooth │ │pose      │ │ shoe    │ │
│   │  .js     │ │detector  │ │ing.js │ │solver.js │ │render   │ │
│   │          │ │  .js     │ │       │ │          │ │ .js     │ │
│   │          │ │          │ │       │ │          │ │         │ │
│   │ ─────────│ │ ───────  │ │─────  │ │─────────  │ │────────  │ │
│   │ camera   │ │MediaPipe │ │Kalman │ │Foot      │ │Three.js │ │
│   │permission│ │Pose Land │ │Filter │ │Geometry  │ │Renderer │ │
│   │          │ │marker    │ │(1D)   │ │Calculator│ │         │ │
│   └───────────┘ └──────────┘ └───────┘ └──────────┘ └─────────┘ │
│          │           │           │          │           │        │
│          └───────────┴───────────┴──────────┴───────────┘        │
│                          ↓                                        │
│  ┌────────────────────────────────────────────────────────────┐  │
│  │              utils/math.js (Foundation)                     │  │
│  │                                                              │  │
│  │  Key Functions:                                            │  │
│  │  • denormalizeMediaPipeCoords()  ← Normalize → Pixels     │  │
│  │  • toNDC()                       ← Pixels → NDC           │  │
│  │  • toWorldSpace()                ← NDC → World Space      │  │
│  │  • createFootTransformMatrix()   ← Combined Transform     │  │
│  │  • quaternionFromTo()            ← Rotation Calculation   │  │
│  │  • Vector/Matrix operations                               │  │
│  └────────────────────────────────────────────────────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
         ↓                              ↓
┌──────────────────────┐      ┌──────────────────────┐
│   Camera Hardware    │      │   GPU (WebGL 2.0)    │
│   (Rear/Env cam)     │      │   Rendering          │
└──────────────────────┘      └──────────────────────┘
```

## Data Flow: Single Frame Execution

```
Frame T (Animation Loop)
│
├─ [DETECT] (30 FPS max, ~15-25ms)
│  │
│  ├─ Check: Time since last detection ≥ 33ms?
│  │
│  ├─ YES → Run MediaPipe.detectForVideo()
│  │       ├─ Output: 33 landmarks (x, y, z, confidence)
│  │       ├─ Format: Normalized coordinates (0-1)
│  │       └─ Store in state.lastLandmarks
│  │
│  └─ Measure: If detection > 20ms → Skip next 2 frames
│
├─ [SMOOTH] (100% frames, ~1-2ms)
│  │
│  ├─ Input: state.lastLandmarks (raw MediaPipe)
│  │
│  ├─ Process: updateSmoother(landmarks)
│  │  │
│  │  ├─ For each of 33 landmarks:
│  │  │  └─ For each of 3 dimensions (x, y, z):
│  │  │     └─ Update separate Kalman filter
│  │  │        └─ Output: smoothedLandmarks
│  │  │
│  │  └─ Filter parameters:
│  │     ├─ q = 0.02 (process noise)
│  │     └─ r = 0.05 (measurement noise)
│  │
│  └─ Output: Smoothed 33 landmarks → state.lastLandmarks
│
├─ [SOLVE] (100% frames, ~2-3ms)
│  │
│  ├─ Input: state.lastLandmarks (33 smoothed landmarks)
│  │
│  ├─ Process: solveFootTransforms(landmarks)
│  │  │
│  │  ├─ Extract foot landmarks:
│  │  │
│  │  │  LEFT FOOT:  landmarks[29]=heel, [31]=toe, [27]=ankle
│  │  │  RIGHT FOOT: landmarks[30]=heel, [32]=toe, [28]=ankle
│  │  │
│  │  ├─ For each foot (left/right):
│  │  │
│  │  │  a) Convert to world space:
│  │  │     landmark (normalized 0-1)
│  │  │       ↓ denormalizeMediaPipeCoords()
│  │  │     pixels (0-videoWidth/Height)
│  │  │       ↓ toNDC()
│  │  │     NDC (-1 to 1)
│  │  │       ↓ toWorldSpace(camera)
│  │  │     World coordinates (THREE.Vector3)
│  │  │
│  │  │  b) Calculate metrics:
│  │  │     • footLength = distance(heel, toe)
│  │  │     • scale = footLength / referenceLength
│  │  │     • forward = normalize(toe - heel)
│  │  │     • rotation = quaternion(forward)
│  │  │
│  │  │  c) Create transformation matrix:
│  │  │     matrix4FromTransform(heelPos, rotation, scale)
│  │  │
│  │  └─ Return: {leftFoot, rightFoot} with {position, rotation, scale}
│  │
│  └─ Output: state.lastFootTransforms
│
├─ [UPDATE SHOES] (100% frames, ~1ms)
│  │
│  ├─ Input: state.lastFootTransforms
│  │
│  ├─ Left Shoe:
│  │  ├─ updateShoe(leftFoot, 'left')
│  │  │  ├─ shoe.position = leftFoot.position
│  │  │  ├─ shoe.quaternion = leftFoot.rotation
│  │  │  └─ shoe.scale = {x,y,z} × leftFoot.scale
│  │  └─ Right Shoe: (same process)
│  │
│  └─ GPU: Shoe geometry transform updated
│
├─ [RENDER] (60 FPS target, ~8-12ms)
│  │
│  ├─ Input: Scene with updated shoe transforms
│  │
│  ├─ Three.js render call:
│  │  ├─ Set viewport to canvas size
│  │  ├─ Clear with transparent color
│  │  ├─ Render scene with orthographic camera
│  │  │  ├─ Camera at z=5, looking at z=0
│  │  │  ├─ Bounds: ±(width/2), ±(height/2)
│  │  │  └─ Projects 3D→2D using orthographic matrix
│  │  ├─ Blend with video background (alpha=true)
│  │  └─ Write to canvas
│  │
│  └─ Output: WebGL on <canvas> (overlays video)
│
└─ [COMPOSITE & DISPLAY]
   │
   ├─ Video element shows camera feed (background)
   ├─ Canvas element shows 3D shoe render (foreground, transparent)
   ├─ Browser composites both to screen
   └─ User sees: Camera view with shoes on feet

═══════════════════════════════════════════════════════════════════

Timing Summary (per frame):
├─ Detection:    ~20ms  (every 33ms = 30 FPS)
├─ Smoothing:    ~2ms   (every frame)
├─ Solving:      ~3ms   (every frame)
├─ Update Shoes: ~1ms   (every frame)
├─ Render:      ~12ms   (every frame / 60 FPS RAF)
└─ TOTAL:       ~38ms  (30-60 FPS achieved)
```

## Coordinate System Transformation Pipeline

```
STEP 1: MediaPipe Raw Output
━━━━━━━━━━━━━━━━━━━━━━━━━━━━
{
  x: 0.5,        // 0 = left edge, 1 = right edge
  y: 0.3,        // 0 = top edge, 1 = bottom edge
  z: 0.8,        // depth (0 = far from camera, 1 = near)
  visibility: 0.95
}

STEP 2: Denormalize to Pixel Coordinates
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Input:  {x: 0.5, y: 0.3, z: 0.8}
        videoWidth: 1280, videoHeight: 720

Calculation:
  pixels_x = 0.5 × 1280 = 640
  pixels_y = 0.3 × 720 = 216

Output: {x: 640, y: 216, z: 0.8}
        (pixels from top-left)

STEP 3: Convert to NDC (Normalized Device Coordinates)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Calculation:
  ndc_x = (640 / 1280) × 2 - 1 = 0.0
  ndc_y = -((216 / 720) × 2 - 1) = 0.4  (NEGATED!)
  ndc_z = -0.8

Key insight: Y-axis negated because:
  • MediaPipe: Y=0 at top, increases downward
  • NDC/Three.js: Y=1 at top, -1 at bottom

Output: {x: 0.0, y: 0.4, z: -0.8}
        (normalized device coordinates)

STEP 4: Unproject to World Space
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Camera Setup (Orthographic):
  Left: -640   Right: 640
  Top: 360     Bottom: -360
  Near: 0.1    Far: 1000
  Position: (0, 0, 5)  ← Looking at z=0 plane

Calculation (Orthographic):
  world_x = ndc_x × (right - left) / 2
          = 0.0 × 1280 / 2
          = 0

  world_y = ndc_y × (top - bottom) / 2
          = 0.4 × 720 / 2
          = 144

  world_z = ndc_z × (far - near) / 2
          = -0.8 × (1000 - 0.1) / 2
          = -400 (approximately)

Output: THREE.Vector3(0, 144, -400)
        (Three.js world coordinates)

═════════════════════════════════════════════════════════════════

COMPLETE PIPELINE VISUALIZATION:

Input: MediaPipe (0-1, 0-1)             Output: Three.js World (-640 to 640, -360 to 360)

┌─(0,0)──┐                            ┌──(0,360)──┐
│ origin │                            │  origin   │
└──────┐ │                            │ ┌────────┘
       │ │  Video Space (pixels)      │ │  World Space
       │ │                            │ │
       └─────────┐                    └─────────┐
               (0,720)                      (-640,-360)

Note: X and Z are directly comparable in world space
      but we need to remember the depth component (Z)
      affects shoe placement if using perspective camera.

Since we use orthographic camera:
  • Shoes at z=0 appear at full size
  • Shoes at z=-5 also appear at full size (no perspective)
  • This ensures accurate foot positioning without distortion
```

## Module Responsibility Matrix

```
Module              │ Input              │ Output             │ Props            │ CPU %
────────────────────┼────────────────────┼────────────────────┼──────────────────┼─────
camera.js           │ Browser request    │ MediaStream        │ Video dimensions │ <1%
                    │                    │ Video element      │ Camera settings  │
────────────────────┼────────────────────┼────────────────────┼──────────────────┼─────
poseDetector.js     │ Video element      │ 33 landmarks       │ Confidence ≥0.5  │ 50-70%
                    │                    │ (x, y, z, conf)    │ Throttled 30 FPS │
────────────────────┼────────────────────┼────────────────────┼──────────────────┼─────
smoothing.js        │ 33 raw landmarks   │ 33 filtered        │ 99 Kalman filters│ 15-20%
                    │                    │ landmarks          │ q=0.02, r=0.05  │
────────────────────┼────────────────────┼────────────────────┼──────────────────┼─────
poseSolver.js       │ 33 smoothed        │ Left/Right foot    │ Position, Rotation│ 10-15%
                    │ landmarks          │ transforms         │ Scale, Tilt     │
                    │                    │ {pos, rot, scale}  │                  │
────────────────────┼────────────────────┼────────────────────┼──────────────────┼─────
shoeRenderer.js     │ Foot transforms    │ WebGL rendered     │ Orthographic cam │ 10-15%
                    │ (pos, rot, scale)  │ canvas image       │ Shoe geometry    │
                    │                    │ (transparent)      │ Blending setup   │
────────────────────┼────────────────────┼────────────────────┼──────────────────┼─────
utils/math.js       │ Coordinates        │ World-space coords │ Vector/Quaternion│ 5-10%
                    │ various formats    │ Matrices           │ Transformations  │
                    │                    │ Quaternions        │                  │
────────────────────┼────────────────────┼────────────────────┼──────────────────┼─────
main.js             │ Frame timestamp    │ Animation loop     │ State management │ 5-10%
                    │                    │ Module coordination│ Error handling   │
```

## Performance Profiling Points

```
Animation Loop (requestAnimationFrame @ 60 FPS)
│
├─ T0: Frame starts
│
├─ T1: Detect pose (if 33ms elapsed)
│   └─ Time: ~20ms on mid-range Android
│   └─ Bottleneck: MediaPipe model inference
│
├─ T2: Smooth landmarks
│   └─ Time: ~2ms
│   └─ Cost: 33 landmarks × 3 dimensions × Kalman math
│
├─ T3: Solve foot transforms
│   └─ Time: ~3ms
│   └─ Cost: Vector math, quaternion operations
│
├─ T4: Update shoe positions
│   └─ Time: ~1ms
│   └─ Cost: Matrix copying to GPU
│
├─ T5: Render scene
│   └─ Time: ~12ms
│   └─ Bottleneck: GPU rendering, WebGL state changes
│   └─ Budget: < 16.67ms for 60 FPS
│
└─ T6: Next frame requested
    └─ Frame rate: 60 FPS minimum
    └─ Shoe updates: 30 FPS (limited by detection)
```

## Error Handling Flow

```
Initialization Phase
│
├─ [Camera] initCamera()
│  ├─ Success → get stream
│  └─ Failure → NotAllowedError | NotFoundError | NotReadableError
│              → showError("Camera permission denied...")
│              → return null
│
├─ [Detection] createPoseDetector()
│  ├─ Success → load MediaPipe model
│  └─ Failure → Network error | Model load timeout
│              → showError("Pose detection model failed...")
│              → return null
│
├─ [Renderer] initShoeRenderer()
│  ├─ Success → create Three.js scene
│  └─ Failure → WebGL unsupported | Shader error
│              → showError("3D rendering not supported...")
│              → return null
│
└─ [Model] loadShoeModel()
   ├─ Success → load shoe.glb
   └─ Failure → File not found | Parse error | Network error
               → showError("Shoe model failed to load...")
               → return null

Running Phase (frameLoop)
│
├─ Detection attempt
│  ├─ Success → Process landmarks
│  └─ Error → Log warning, use previous frame data
│
├─ Smoothing attempt
│  ├─ Success → Return filtered landmarks
│  └─ Error → (Rare) fallback to unsmoothed
│
├─ Solve attempt
│  ├─ Success → Calculate transforms
│  └─ Error → Warn, use last valid transform
│
└─ Render attempt
   ├─ Success → Update canvas
   └─ Error → (Very rare) skip frame, continue loop

Error UI
│
└─ Error Overlay
   ├─ Visible: opacity 1
   ├─ Message: User-friendly error text
   ├─ Dismissible: User clicks button
   └─ Console: Full error logged
```

## Memory Architecture

```
Browser Memory Pool (Target: < 100MB on mobile)
│
├─ Static Allocations (Init Phase)
│  ├─ Three.js Scene & Objects
│  │  ├─ Scene graph: ~1MB
│  │  ├─ Shoe model (2 instances): ~10-50MB (depends on GLB)
│  │  ├─ Renderer & context: ~5MB
│  │  └─ Textures & materials: ~5-20MB
│  │
│  ├─ MediaPipe Model
│  │  └─ Tflite model (downloaded): ~5-10MB
│  │
│  ├─ Kalman Filters
│  │  └─ 33 landmarks × 3 dims × filter state: ~50KB
│  │
│  └─ Video Stream
│      └─ Video element + buffers: ~10MB
│
├─ Per-Frame Allocations (Reused)
│  ├─ Landmarks array: ~2KB per frame (33 landmarks × 64 bytes)
│  ├─ Transform calculations: ~4KB
│  ├─ Camera projection matrix: ~256 bytes
│  └─ Temporary vectors: ~1KB
│
└─ GC (Garbage Collection)
   ├─ No object creation in animation loop
   ├─ Pre-allocated vector pool
   └─ No memory leaks expected
```

---

## Summary

The AR Shoe Try-On platform is architected as a **pipeline of coordinated modules**:

1. **camera.js** captures video stream
2. **poseDetector.js** runs MediaPipe (bottleneck @ 30 FPS)
3. **smoothing.js** filters noise with Kalman
4. **poseSolver.js** converts landmarks to transforms
5. **shoeRenderer.js** applies transforms and renders
6. **utils/math.js** handles all coordinate conversions
7. **main.js** orchestrates and schedules

The **critical path** is the coordinate transformation system in `utils/math.js`, which must correctly convert from MediaPipe's normalized (0-1) screen space to Three.js world space using an orthographic camera for accurate shoe placement.

Performance is optimized through:
- Detection throttling (30 FPS max)
- Frame skipping on overrun
- Kalman smoothing
- Pixel ratio reduction on mobile
- Pre-allocated objects
- Proper WebGL resource management
