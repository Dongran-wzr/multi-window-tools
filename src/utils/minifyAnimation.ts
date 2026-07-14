/**
 * MinifyAnimation — macOS "genie" state machine.
 *
 * This is the spec's `MinifyAnimation` (the "Rust 端结构"), realized in TypeScript
 * because the effect renders in the webview (WebGL), not a native wgpu surface.
 *
 * It owns all per-frame animation state and produces, each tick, both the
 * fragment-shader uniforms and the CSS wrapper transform. The vertex shader stays
 * a pure pass-through; all warping happens in `suck.frag`.
 *
 *   const anim = new MinifyAnimation({ startRect, endRect, direction: "in" });
 *   anim.tick(dtMs);            // advance
 *   const f = anim.frame();     // read uniforms + CSS transform
 *   if (anim.isFinished()) { ... }
 */

import {
  easeOutCubic,
  easeInQuart,
  easeInQuad,
  easeOutCubicDeriv,
  easeInQuartDeriv,
} from "./easing";

export interface Rect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type MinifyDirection = "in" | "out";

export interface MinifyOptions {
  /** Window bounds at animation start (viewport px). */
  startRect: Rect;
  /** Target tab bounds (viewport px). */
  endRect: Rect;
  /** "in" = window → tab (minimize/close). "out" = tab → window (re-open). */
  direction?: MinifyDirection;
  /** Total duration in ms. Default 250. */
  durationMs?: number;
  /** Genie curve exponent — larger = steeper neck. Default 2.0. */
  curveExp?: number;
}

/** All values a renderer applies for one frame. */
export interface MinifyFrame {
  // ── Fragment-shader uniforms ──
  /** Warp progress 0→1 (0 = original image, 1 = fully collapsed to tab). */
  time: number;
  /** Tab left edge in the window's UV space [0,1]. */
  leftBound: number;
  /** Tab right edge in the window's UV space [0,1]. */
  rightBound: number;
  /** Genie curve exponent. */
  curveExp: number;
  /** Instantaneous movement direction (unit vector) for motion blur. */
  movementDir: [number, number];
  /** Motion-blur magnitude in pixels. */
  velocityPx: number;

  // ── CSS wrapper transform (position + 3D tilt + opacity) ──
  translateX: number;
  translateY: number;
  rotateX: number;
  scaleY: number;
  opacity: number;
}

const DEFAULT_DURATION_MS = 250;
const DEFAULT_CURVE_EXP = 2.0;

// Motion-blur tuning (matches previous SuckOverlay values).
const VELOCITY_SCALE = 0.005;
const MAX_BLUR = 5.0;

/** Precomputed geometry constants for the whole animation. */
interface AnimConstants {
  /** Displacement from window center to tab center (px). */
  dx: number;
  dy: number;
  /** Normalized movement direction (unit vector). */
  dirX: number;
  dirY: number;
  /** Tab left/right edges in the window's UV space [0,1]. */
  leftX: number;
  rightX: number;
}

function precompute(startRect: Rect, endRect: Rect): AnimConstants {
  const winCX = startRect.left + startRect.width / 2;
  const winCY = startRect.top + startRect.height / 2;
  const tabCX = endRect.left + endRect.width / 2;
  const tabCY = endRect.top + endRect.height / 2;

  const dx = tabCX - winCX;
  const dy = tabCY - winCY;
  const dist = Math.sqrt(dx * dx + dy * dy) || 1;

  // Tab x-bounds in the window's UV space [0, 1] (UV origin = top-left).
  const leftX = (endRect.left - startRect.left) / startRect.width;
  const rightX = leftX + endRect.width / startRect.width;

  return {
    dx,
    dy,
    dirX: dx / dist,
    dirY: dy / dist,
    leftX: Math.max(0, Math.min(1, leftX)),
    rightX: Math.max(0, Math.min(1, rightX)),
  };
}

export class MinifyAnimation {
  private readonly c: AnimConstants;
  private readonly direction: MinifyDirection;
  readonly durationMs: number;
  readonly curveExp: number;

  /** Elapsed wall-clock time in ms. */
  private elapsed = 0;

  constructor(opts: MinifyOptions) {
    this.c = precompute(opts.startRect, opts.endRect);
    this.direction = opts.direction ?? "in";
    this.durationMs = opts.durationMs ?? DEFAULT_DURATION_MS;
    this.curveExp = opts.curveExp ?? DEFAULT_CURVE_EXP;
  }

  /** Advance the clock by `deltaMs`. */
  tick(deltaMs: number): void {
    this.elapsed = Math.min(this.elapsed + deltaMs, this.durationMs);
  }

  /** Reset back to the start. */
  reset(): void {
    this.elapsed = 0;
  }

  /** Raw wall-clock progress 0→1 (independent of direction). */
  get rawProgress(): number {
    return this.durationMs > 0
      ? Math.min(this.elapsed / this.durationMs, 1)
      : 1;
  }

  isFinished(): boolean {
    return this.rawProgress >= 1;
  }

  /**
   * Effective warp progress. For "in" this is the raw progress (0 → fully
   * collapsed). For "out" it runs 1 → 0 so the window expands from the tab.
   */
  private effectiveProgress(): number {
    const p = this.rawProgress;
    return this.direction === "out" ? 1 - p : p;
  }

  /** Compute every value needed to render the current frame. */
  frame(): MinifyFrame {
    const c = this.c;
    // `raw` drives the visual warp; for "out" it counts down from 1.
    const raw = this.effectiveProgress();

    // ── CSS transform (position + 3D tilt) ──
    const tx = easeOutCubic(raw); // X: fast → decelerate
    const ty = easeInQuart(raw); // Y: slow → rapid drop (downward arc)
    const ts = easeInQuad(raw); // tilt/scale blend

    const translateX = c.dx * tx;
    const translateY = c.dy * ty;
    // rotateX: snap toward 12°, then ease back — reads as a forward tip.
    const rotateX = 12 * raw - 4 * ts;
    // Vertical squish applied outside the UV warp.
    const scaleY = 1 - 0.4 * easeInQuad(raw);

    // Opacity: hold 0.9 for the first 80%, linear → 0 in the last 20%.
    const opacity =
      raw < 0.8 ? 0.9 : Math.max(0.9 * (1 - (raw - 0.8) / 0.2), 0);

    // ── Motion blur: magnitude ∝ instantaneous velocity ──
    const derivX = easeOutCubicDeriv(raw);
    const derivY = easeInQuartDeriv(raw);
    const vx = c.dx * derivX;
    const vy = c.dy * derivY;
    const rawVelocity = Math.sqrt(vx * vx + vy * vy);

    let dirX = rawVelocity > 0.001 ? vx / rawVelocity : c.dirX;
    let dirY = rawVelocity > 0.001 ? vy / rawVelocity : c.dirY;
    // Blur trails opposite the direction of travel; for "out" motion reverses.
    if (this.direction === "out") {
      dirX = -dirX;
      dirY = -dirY;
    }
    const velocityPx = Math.min(rawVelocity * VELOCITY_SCALE, MAX_BLUR);

    return {
      time: raw,
      leftBound: c.leftX,
      rightBound: c.rightX,
      curveExp: this.curveExp,
      movementDir: [dirX, dirY],
      velocityPx,
      translateX,
      translateY,
      rotateX,
      scaleY,
      opacity,
    };
  }
}
