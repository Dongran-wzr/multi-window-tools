// =========================================================================
// macOS‑style Genie "suck into Dock" fragment shader
//
// All visual effects (displacement, squeeze, perspective, blur, feather)
// are computed right here.  The vertex shader simply emits a full‑screen
// triangle; this fragment shader does the heavy lifting via reverse‑UV
// sampling.
// =========================================================================

// ── Uniforms (matches `GenieUniforms` in animation.rs) ──────────────────

struct GenieUniforms {
    // vec2 fields (8‑byte aligned)
    translate: vec2<f32>,  // normalised displacement toward dock target
    scale:     vec2<f32>,  // overall scale (x, y)
    blur_dir:  vec2<f32>,  // directional blur axis (normalised)

    // scalar fields (4‑byte aligned)
    genie_squeeze: f32,   // [0, max_squeeze] — non‑uniform horizontal compression
    cos_theta:     f32,   // cos(rotateX angle)
    sin_theta:     f32,   // sin(rotateX angle)
    perspective_d: f32,   // perspective distance in pixels
    opacity:       f32,   // overall alpha multiplier [0, 1]
    blur_amount:   f32,   // motion blur sigma in pixels

    // padding to align next vec2 at 8‑byte boundary
    _pad: vec2<f32>,

    src_size: vec2<f32>,  // source texture size (px)
    dst_size: vec2<f32>,  // output texture size (px)
}

@group(0) @binding(0) var src_texture: texture_2d<f32>;
@group(0) @binding(1) var src_sampler: sampler;
@group(0) @binding(2) var<uniform> u: GenieUniforms;

// ── Vertex shader (full‑screen triangle, no vertex buffer) ──────────────

@vertex
fn vs_main(@builtin(vertex_index) vid: u32) -> @builtin(position) vec4<f32> {
    // Generate a triangle covering the entire clip space (-1..1)
    let uv = vec2<f32>(f32((vid << 1u) & 2u), f32(vid & 2u));
    return vec4<f32>(uv * 2.0 - 1.0, 0.0, 1.0);
}

// ── Fragment shader ─────────────────────────────────────────────────────

/// Sample the source texture at `uv` with a single tap (no blur).
fn sample_src(uv: vec2<f32>) -> vec4<f32> {
    return textureSample(src_texture, src_sampler, uv);
}

/// Sample the source texture with directional motion blur.
///
/// `uv`          — centre of the sampling region
/// `dir`         — normalised blur direction (points toward dock)
/// `amount_px`   — blur sigma in source‑texture pixel units
/// `v_centered`  — vertical position in centred UV space [-0.5, 0.5]
///                 (blur strength scales with distance from dock)
fn sample_blurred(uv: vec2<f32>, dir: vec2<f32>, amount_px: f32, v_centered: f32) -> vec4<f32> {
    // Blur is stronger at the top (far from dock): top → v_centered = -0.5
    //   bottom → v_centered = +0.5
    let top_dist = 0.5 - v_centered;          // 0 at bottom, 1 at top
    let local_amount = amount_px * top_dist;   // proportional to distance from dock

    // Convert pixel amount to UV‑space step
    let step_uv = dir * (local_amount / u.src_size);

    // 7‑tap directional blur with Gaussian‑like weights
    var col = vec4<f32>(0.0);
    var total_w = 0.0;
    for (var i: i32 = -3; i <= 3; i++) {
        let offset = f32(i) / 3.0;                     // [-1, 1]
        let w = exp(-offset * offset * 2.0);            // Gaussian weight
        let tap_uv = uv + step_uv * offset;
        // Clamp to avoid sampling outside the source texture
        let clamped = clamp(tap_uv, vec2<f32>(0.0), vec2<f32>(1.0));
        col += sample_src(clamped) * w;
        total_w += w;
    }
    return col / total_w;
}

@fragment
fn fs_main(@builtin(position) pos: vec4<f32>) -> @location(0) vec4<f32> {
    // ── Step 0: output UV (0, 0) = top‑left ─────────────────────
    let out_uv = pos.xy / u.dst_size;

    // Convert to centred coords: (-0.5, -0.5) = top‑left, (+0.5, +0.5) = bottom‑right
    var cuv = out_uv - 0.5;

    // ── Step 1: inverse translation (move back from dock position) ──
    // Uniform `translate` moves the window TOWARD the dock, so reverse it.
    cuv -= u.translate;

    // ── Step 2: inverse scale (un‑shrink) ────────────────────────
    // Guard against zero scale
    let sx = max(u.scale.x, 0.001);
    let sy = max(u.scale.y, 0.001);
    cuv /= vec2<f32>(sx, sy);

    // ── Step 3: inverse genie squeeze ─────────────────────────────
    // The forward squeeze compresses X more at the top (far from dock).
    // Distance from dock: v = +0.5 is dock‑side (bottom), v = -0.5 is far (top)
    // squeeze(v) = 1.0 - genie_squeeze * (0.5 - v)^2   for forward
    // inverse: cuv.x / squeeze(cuv.y)
    let top_dist = 0.5 - cuv.y;                          // 0 at bottom, 1 at top
    let squeeze = 1.0 - u.genie_squeeze * top_dist * top_dist;
    cuv.x /= max(squeeze, 0.01);

    // ── Step 4: inverse perspective (rotateX) ────────────────────
    // Forward perspective maps source (x, y) → output (ox, oy):
    //   denom = 1.0 + y * sin_theta / perspective_d
    //   ox = x / denom
    //   oy = y * cos_theta / denom
    //
    // Inverse (output → source):
    //   y = oy / (cos_theta - oy * sin_theta / perspective_d)
    //   x = ox * (1.0 + y * sin_theta / perspective_d)
    let oy = cuv.y;
    let ox = cuv.x;

    let denom_inv = u.cos_theta - oy * u.sin_theta / u.perspective_d;
    let denom_inv_safe = select(denom_inv, 0.001, abs(denom_inv) < 0.001);

    let src_y = oy / denom_inv_safe;
    let src_x = ox * (1.0 + src_y * u.sin_theta / u.perspective_d);

    cuv = vec2<f32>(src_x, src_y);

    // ── Step 5: back to standard UV ──────────────────────────────
    var src_uv = cuv + 0.5;

    // Early discard: completely outside source texture
    if (src_uv.x < -0.1 || src_uv.x > 1.1 || src_uv.y < -0.1 || src_uv.y > 1.1) {
        discard;
    }

    // ── Step 6: motion blur ──────────────────────────────────────
    // Blur direction points from window centre toward dock.
    // We apply blur IF the amount is non‑trivial.
    var color: vec4<f32>;
    if (u.blur_amount > 0.05) {
        // cuv.y (centred) represents distance from centre; use it for
        // per‑pixel blur scaling (more blur far from dock).
        color = sample_blurred(src_uv, u.blur_dir, u.blur_amount, cuv.y);
    } else {
        color = sample_src(src_uv);
    }

    // ── Step 7: edge feather (soft alpha fade near UV borders) ──
    // Feathered more aggressively at the top (far edge) than the bottom.
    let edge_x = smoothstep(0.0, 0.08, src_uv.x) * (1.0 - smoothstep(0.92, 1.0, src_uv.x));
    let edge_y_top = smoothstep(-0.1, 0.05, src_uv.y);        // top feather
    let edge_y_bot = 1.0 - smoothstep(0.9, 1.05, src_uv.y);   // bottom feather (gentle)
    let edge = edge_x * edge_y_top * edge_y_bot;

    // ── Step 8: opacity ─────────────────────────────────────────
    let final_alpha = color.a * u.opacity * edge;

    return vec4<f32>(color.rgb, final_alpha);
}
