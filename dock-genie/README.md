# dock-genie

macOS‑style "suck into Dock" animation — Rust + wgpu fragment shader.

```
cargo run --bin dock-genie-demo
```

## Architecture

```
src/
├── lib.rs          # Public API re-exports
├── easing.rs       # Easing functions (easeInQuart, easeOutCubic, …)
├── animation.rs    # AnimationState, GenieUniforms layout
├── renderer.rs     # wgpu device, pipeline, off-screen rendering
├── shader.wgsl     # Fragment shader (all visual effects)
└── main.rs         # Interactive demo (winit window)
```

### CPU side (`animation.rs`)

- `AnimationState::new(config)` → `tick(dt_ms)` → uniform buffer each frame
- `GenieConfig` exposes every tunable knob (perspective distance, squeeze, scale, …)
- `GenieUniforms` is `#[repr(C)]` + `bytemuck::Pod` for direct GPU upload

### GPU side (`shader.wgsl`)

The fragment shader runs **inverse‑transform sampling**:

| Step | Effect |
|------|--------|
| 1 | Inverse translation (un‑move from dock) |
| 2 | Inverse scale (un‑shrink) |
| 3 | Inverse genie squeeze (horizontal un‑compress, v‑proportional) |
| 4 | Inverse 3D perspective (rotateX reversal) |
| 5 | Directional motion blur (7‑tap Gaussian along velocity) |
| 6 | Edge feather (soft alpha drop near texture border) |
| 7 | Opacity multiplier |

### Easing curves

| Parameter | Curve | Reason |
|-----------|-------|--------|
| X displacement | `easeOutCubic` | Fast horizontal move, then decelerate |
| Y displacement | `easeInQuart` | Slow start, rapid drop → arc feel |
| Scale | `easeInQuad` | Gentle acceleration |
| Perspective angle | `easeOutExpo` | Snap to max quickly, settle back |
| Opacity | step (0.9→0 at 80%) | Hold visibility then fade |
| Motion blur | exponential (last 40%) | Ramp from 0.5→5 px |

## API

```rust
use dock_genie::{AnimationState, GenieConfig, GenieRenderer, DockTarget};

let config = GenieConfig {
    duration_ms: 250.0,
    dock: DockTarget { center_x: 0.5, bottom_y: 0.95, icon_width: 120.0, icon_height: 36.0 },
    ..Default::default()
};

let mut state = AnimationState::new(config);
let mut renderer = GenieRenderer::new(800, 600).await?;
renderer.set_source_texture(&rgba_bytes, 800, 600);

while !state.is_finished() {
    let uniforms = state.tick(16);   // ~60 fps
    let frame = renderer.render_frame(uniforms);
    // display or save frame (RGBA bytes)
}
```
