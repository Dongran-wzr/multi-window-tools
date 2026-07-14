//! CPU‑side animation state machine.
//!
//! Computes per‑frame uniform values from progress [0, 1] using the easing
//! functions in [`easing`].  The resulting [`GenieUniforms`] are uploaded
//! to the GPU each frame.

use bytemuck::Zeroable;
use crate::easing;

// ---------------------------------------------------------------------------
// Public configuration
// ---------------------------------------------------------------------------

/// Describes the target position where the window should "suck into".
#[derive(Debug, Clone, Copy)]
pub struct DockTarget {
    /// Normalised X of the dock icon centre (0 = left edge of *output* texture,
    /// 1 = right edge).
    pub center_x: f32,
    /// Normalised Y of the dock icon **bottom** edge (1 = bottom of output).
    pub bottom_y: f32,
    /// Width / height of the icon in output‑texture pixel coords.
    pub icon_width: f32,
    pub icon_height: f32,
}

/// High‑level configuration knobs, exposed so callers can tweak the feel.
#[derive(Debug, Clone, Copy)]
pub struct GenieConfig {
    /// Total animation duration in milliseconds (default 250).
    pub duration_ms: f32,

    /// Dock target in output‑UV space.
    pub dock: DockTarget,

    /// Source window size in pixels.
    pub src_width: f32,
    pub src_height: f32,

    /// Output texture size (usually same as source).
    pub dst_width: f32,
    pub dst_height: f32,

    /// Perspective distance in pixels (default 800).
    pub perspective_d: f32,

    /// Maximum rotateX angle in radians (default 12° ≈ 0.209).
    pub max_rotate_x: f32,

    /// Maximum genie horizontal squeeze at the top of the window [0, 1]
    /// (default 0.85 — the top narrows to 15 % of original width).
    pub max_squeeze: f32,

    /// Target scale when fully shrunk (width ratio, default 0.08).
    pub target_scale_x: f32,

    /// Target scale when fully shrunk (height ratio, default 0.06).
    pub target_scale_y: f32,
}

impl Default for GenieConfig {
    fn default() -> Self {
        Self {
            duration_ms: 250.0,
            dock: DockTarget {
                center_x: 0.5,
                bottom_y: 1.0,
                icon_width: 150.0,
                icon_height: 36.0,
            },
            src_width: 800.0,
            src_height: 600.0,
            dst_width: 800.0,
            dst_height: 600.0,
            perspective_d: 800.0,
            max_rotate_x: 12.0_f32.to_radians(),
            max_squeeze: 0.85,
            target_scale_x: 0.08,
            target_scale_y: 0.06,
        }
    }
}

// ---------------------------------------------------------------------------
// GPU uniform layout  (must match `GenieUniforms` in shader.wgsl)
// ---------------------------------------------------------------------------

/// Layout‑compatible uniform block uploaded every frame.
///
/// **WGSL alignment rules** are enforced via explicit `_pad` fields.
/// See `src/shader.wgsl` → `struct GenieUniforms` for the WGSL definition.
#[repr(C)]
#[derive(Debug, Clone, Copy, bytemuck::Pod, bytemuck::Zeroable)]
pub struct GenieUniforms {
    // ── vec2<f32> fields (8‑byte aligned, 8 bytes each) ──────────
    pub translate: [f32; 2], // offset  0  — movement toward dock (normalised)
    pub scale: [f32; 2],     // offset  8  — overall scale (x, y)
    pub blur_dir: [f32; 2],  // offset 16  — directional blur axis (normalised)

    // ── f32 scalars (4‑byte aligned) ──────────────────────────────
    pub genie_squeeze: f32, // offset 24  — [0, max_squeeze]
    pub cos_theta: f32,     // offset 28  — cos(rotateX_angle)
    pub sin_theta: f32,     // offset 32  — sin(rotateX_angle)
    pub perspective_d: f32, // offset 36  — perspective distance
    pub opacity: f32,       // offset 40  — overall alpha multiplier
    pub blur_amount: f32,   // offset 44  — motion blur sigma in pixels

    /// Padding so the following vec2 starts at offset 56 (≡ 0 mod 8).
    pub _pad: [f32; 2], // offset 48  (48 + 8 = 56)

    pub src_size: [f32; 2], // offset 56  — input texture dimensions (px)
    pub dst_size: [f32; 2], // offset 64  — output texture dimensions (px)
}

// Safety: the struct is Pod + Zeroable via the bytemuck derive.
// Total size = 72 bytes → padded to 80 for 16‑byte buffer alignment.

// ---------------------------------------------------------------------------
// Animation state machine
// ---------------------------------------------------------------------------

/// Drives the animation forward frame by frame.
pub struct AnimationState {
    config: GenieConfig,
    elapsed_ms: f32,
    finished: bool,
    /// Cached uniforms, refreshed each `tick()`.
    pub uniforms: GenieUniforms,
}

impl AnimationState {
    /// Create a new animation with the given configuration.
    pub fn new(config: GenieConfig) -> Self {
        let mut state = Self {
            config,
            elapsed_ms: 0.0,
            finished: false,
            uniforms: GenieUniforms::zeroed(),
        };
        state.recalc();
        state
    }

    /// Reset progress to 0 so the animation can be replayed.
    pub fn reset(&mut self) {
        self.elapsed_ms = 0.0;
        self.finished = false;
        self.recalc();
    }

    /// Advance the animation by `dt_ms` milliseconds.
    ///
    /// Returns the newly computed uniforms so the caller can upload them
    /// without a second accessor call.
    pub fn tick(&mut self, dt_ms: f32) -> &GenieUniforms {
        if self.finished {
            return &self.uniforms;
        }
        self.elapsed_ms += dt_ms;
        if self.elapsed_ms >= self.config.duration_ms {
            self.elapsed_ms = self.config.duration_ms;
            self.finished = true;
        }
        self.recalc();
        &self.uniforms
    }

    /// Has the animation reached its end?
    pub fn is_finished(&self) -> bool {
        self.finished
    }

    /// Raw progress ∈ [0, 1].
    pub fn progress(&self) -> f32 {
        (self.elapsed_ms / self.config.duration_ms).clamp(0.0, 1.0)
    }

    // ── internal helpers ──────────────────────────────────────────

    fn recalc(&mut self) {
        let t = self.progress();
        let cfg = &self.config;

        // ---- Displacement (arc toward dock) ----
        // X uses easeOutCubic: fast horizontal move, then settle
        // Y uses easeInQuart:  slow start → rapid drop (arc feel)
        let target_x = cfg.dock.center_x - 0.5; // offset from centre
        let target_y = cfg.dock.bottom_y - 0.5; // offset from centre
        let dx = target_x * easing::ease_out_cubic(t);
        let dy = target_y * easing::ease_in_quart(t);

        // ---- Scale (easeInQuad — overall shrink) ----
        let scale_t = easing::ease_in_quad(t);
        let sx = 1.0 + (cfg.target_scale_x - 1.0) * scale_t;
        let _sy = 1.0 + (cfg.target_scale_y - 1.0) * scale_t;
        // Y compression ratio 0.6 → sy drops faster than sx
        let sy_compressed = 1.0 + ((cfg.target_scale_y * 0.6) - 1.0) * scale_t;

        // ---- Genie squeeze (non‑uniform horizontal compression) ----
        // Starts at 0, grows to max_squeeze towards the end.
        // The shader applies it with a top‑heavy profile (v‑dependent).
        let squeeze = cfg.max_squeeze * easing::ease_in_quad(t);

        // ---- 3D perspective (rotateX) ----
        // Snaps to max quickly (easeOutExpo) then eases back slightly.
        let persp_t = easing::ease_out_expo((t * 1.5).min(1.0));
        let angle = cfg.max_rotate_x * persp_t * (1.0 - 0.2 * easing::ease_in_quad(t));

        // ---- Opacity ----
        // Holds 0.9 for first 80 %, then linearly fades to 0.
        let opacity = if t < 0.8 {
            0.9
        } else {
            0.9 * (1.0 - (t - 0.8) / 0.2)
        };

        // ---- Motion blur ----
        // Tiny (< 0.5 px) for first 60 %, then exponential ramp to 5 px.
        let blur = if t < 0.6 {
            easing::ease_in_quad(t / 0.6) * 0.5
        } else {
            let ramp = (t - 0.6) / 0.4; // [0, 1]
            0.5 + 4.5 * easing::ease_in_quad(ramp)
        };

        // Blur direction: from window centre → dock target.
        let blur_dx = target_x;
        let blur_dy = target_y;
        let blur_len = (blur_dx * blur_dx + blur_dy * blur_dy).sqrt();
        let (bdx, bdy) = if blur_len > 1e-6 {
            (blur_dx / blur_len, blur_dy / blur_len)
        } else {
            (0.0, 1.0)
        };

        // ---- Assemble uniforms ----
        self.uniforms = GenieUniforms {
            translate: [dx, dy],
            scale: [sx, sy_compressed],
            blur_dir: [bdx, bdy],
            genie_squeeze: squeeze,
            cos_theta: angle.cos(),
            sin_theta: angle.sin(),
            perspective_d: cfg.perspective_d,
            opacity,
            blur_amount: blur,
            _pad: [0.0; 2],
            src_size: [cfg.src_width, cfg.src_height],
            dst_size: [cfg.dst_width, cfg.dst_height],
        };
    }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_monotonic() {
        let mut state = AnimationState::new(GenieConfig::default());
        assert!(!state.is_finished());
        assert!((state.progress() - 0.0).abs() < 1e-6);

        let mut last_p = 0.0;
        while !state.is_finished() {
            state.tick(16.0); // ~60 fps
            let p = state.progress();
            assert!(p >= last_p);
            last_p = p;
        }
        assert!((state.progress() - 1.0).abs() < 1e-6);
    }

    #[test]
    fn reset_works() {
        let mut state = AnimationState::new(GenieConfig::default());
        state.tick(250.0);
        assert!(state.is_finished());
        state.reset();
        assert!(!state.is_finished());
        assert!((state.progress() - 0.0).abs() < 1e-6);
    }

    #[test]
    fn opacity_curve() {
        let mut state = AnimationState::new(GenieConfig::default());
        // Tick to 80 %
        state.tick(200.0); // 200 / 250 = 0.8
        assert!(state.uniforms.opacity > 0.85);
        // Tick to 100 %
        state.tick(50.0);
        assert!((state.uniforms.opacity - 0.0).abs() < 1e-6);
    }
}
