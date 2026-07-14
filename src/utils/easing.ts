/**
 * Shared easing functions used by both SuckOverlay (WebGL) and
 * the CSS fallback animation path. All functions map t ∈ [0,1] → [0,1].
 */

/** Fast start, slow end — used for X displacement */
export function easeOutCubic(t: number): number {
  const t1 = 1 - t;
  return 1 - t1 * t1 * t1;
}

/** Slow start, very fast end — used for Y displacement (arc trajectory) */
export function easeInQuart(t: number): number {
  return t * t * t * t;
}

/** Gentle acceleration — used for scale/skew blending */
export function easeInQuad(t: number): number {
  return t * t;
}

/** Gentle deceleration */
export function easeOutQuad(t: number): number {
  return 1 - (1 - t) * (1 - t);
}

/**
 * Derivative of easeOutCubic at progress t.
 * f(t) = 1 - (1-t)³  →  f'(t) = 3(1-t)²
 */
export function easeOutCubicDeriv(t: number): number {
  return 3 * (1 - t) * (1 - t);
}

/**
 * Derivative of easeInQuart at progress t.
 * f(t) = t⁴  →  f'(t) = 4t³
 */
export function easeInQuartDeriv(t: number): number {
  return 4 * t * t * t;
}

// ---------------------------------------------------------------------------
// Elastic / spring easing (for bouncy settle at the end of genie animations)
// ---------------------------------------------------------------------------

/**
 * easeOutBack — slight overshoot then settle.
 * Mimics CSS `cubic-bezier(0.34, 1.56, 0.64, 1)`.
 * The overshoot amount c1 controls how far past 1 the curve goes.
 */
export function easeOutBack(t: number, c1: number = 1.7): number {
  const c3 = c1 + 1;
  return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
}

/**
 * springSettle — exponential decay + sinusoidal oscillation.
 *
 * Simulates a damped spring bouncing to rest. At t→1, the oscillation
 * amplitude decays to near-zero. Use this for the final ~20% of an
 * animation to add a "boing" feel as the window lands in the tab.
 *
 * @param t     Normalised time [0, 1]
 * @param decay Controls how fast the oscillation dies out (higher = faster decay, default 5)
 * @param freq  Oscillation frequency multiplier (default 4, gives ~2 full bounces)
 */
export function springSettle(t: number, decay: number = 5, freq: number = 4): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const d = Math.exp(-decay * t);
  return 1 - d * Math.cos(freq * Math.PI * t);
}

/**
 * easeOutElastic — full elastic ease-out with decaying oscillation.
 *
 * The curve reaches 1 at t=1, overshooting along the way.
 * Use this when you want obvious bouncing throughout the deceleration phase.
 *
 * @param t      Normalised time [0, 1]
 * @param decay  Decay rate (default 7)
 * @param freq   Oscillation frequency (default 3)
 */
export function easeOutElastic(t: number, decay: number = 7, freq: number = 3): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  return Math.pow(2, -decay * t) * Math.sin((t - 0.075) * freq * Math.PI) + 1;
}
