precision mediump float;

varying vec2 v_texCoord;
uniform sampler2D u_texture;
uniform float u_time;
uniform vec2 u_left;        // Tab left-edge in window texture UV space
uniform vec2 u_right;       // Tab right-edge in window texture UV space
uniform vec2 u_movementDir; // Instantaneous velocity direction (motion blur)
uniform float u_velocityPx; // Velocity magnitude in pixels (motion blur)
uniform vec2 u_texSize;     // Texture dimensions in pixels
uniform float u_curveExp;   // Genie curve exponent (larger = steeper neck)

/* ========================================================================
 * Lerp: linear interpolation between a (t=0) and b (t=1)
 * ======================================================================== */
float lerp(float a, float b, float t) {
    return a + (b - a) * t;
}

void main() {
    // ── 1. X-axis: toward tab's x-range ──
    // Map original x-coord to normalized position within the tab's range
    float rangeX = u_right.x - u_left.x;
    float targetX;
    if (rangeX > 0.001) {
        targetX = (v_texCoord.x - u_left.x) / rangeX;
    } else {
        targetX = 0.5; // fallback: collapse to center-point
    }

    // Interpolation weight: pow(1-y, exp) * time → top contracts more
    // At v=0 (top): weight = time (max contraction)
    // At v=1 (bottom): weight = 0 (no contraction)
    float weight = pow(1.0 - v_texCoord.y, u_curveExp) * u_time;
    float u_mapped = lerp(v_texCoord.x, targetX, weight);

    // ── 2. Y-axis compression (activates after 50% progress) ──
    // Compresses the window vertically toward the bottom in the later half
    float yCompress = max(2.0 * u_time - 1.0, 0.0); // 0 at t≤0.5, linear to 1 at t=1
    yCompress = yCompress * yCompress;               // quadratic ease
    float v_mapped = v_texCoord.y / max(1.0 - yCompress * 0.95, 0.02);

    // ── 3. Discard out-of-range fragments ──
    if (u_mapped < -0.05 || u_mapped > 1.05 ||
        v_mapped < -0.05 || v_mapped > 1.05) {
        discard;
    }

    // ── 4. Edge feathering ──
    // Feather width proportional to contraction at this Y
    float boundaryDist = 0.5 * weight + 0.005;
    float leftDist  = u_mapped;
    float rightDist = 1.0 - u_mapped;
    float feather = smoothstep(0.0, boundaryDist, leftDist) *
                    smoothstep(0.0, boundaryDist, rightDist);

    // Top/bottom feather (from Y compression)
    float topDist    = v_mapped;
    float bottomDist = 1.0 - v_mapped;
    float yBoundary  = 0.5 * yCompress + 0.005;
    feather *= smoothstep(0.0, yBoundary, topDist) *
               smoothstep(0.0, yBoundary, bottomDist);

    // ── 5. Directional motion blur ──
    vec2 velUV = (u_movementDir * u_velocityPx) / u_texSize;

    vec4 color = vec4(0.0);
    float totalWeight = 0.0;

    for (int i = -2; i <= 2; i++) {
        float t = float(i);
        float w = 1.0 - abs(t) * 0.28;               // triangular kernel
        vec2 sampleUV = vec2(u_mapped, v_mapped) + velUV * t * 0.4;

        sampleUV.x = clamp(sampleUV.x, 0.0, 1.0);
        sampleUV.y = clamp(sampleUV.y, 0.0, 1.0);

        color += texture2D(u_texture, sampleUV) * w;
        totalWeight += w;
    }
    color /= totalWeight;

    // ── 6. Final output ──
    gl_FragColor = vec4(color.rgb, color.a * feather);
}
