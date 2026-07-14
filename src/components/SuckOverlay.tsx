/**
 * SuckOverlay — macOS-style "genie / suck into Dock" animation.
 *
 * Core technique:
 *   1. Canvas-generated displacement map encodes the "suck toward tab" vector field
 *   2. SVG feImage → feDisplacementMap applies directional non‑linear pixel warp
 *   3. CSS 3D transforms  (perspective + rotateX + scale) → 3D tilt + shrink
 *   4. CSS blur → motion blur
 *   5. Elastic easing → bouncy settle
 *
 * The displacement map is generated ONCE when the animation starts (the
 * directional pattern is static — only the intensity changes per frame).
 */

import React, { useEffect, useRef, useCallback, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useTerminalStore } from "../stores/terminalStore";
import { MinifyAnimation, MinifyDirection } from "../utils/minifyAnimation";
import {
  easeInQuad,
  easeInQuart,
  springSettle,
} from "../utils/easing";

/* ========================================================================
 * Tunables
 * ======================================================================== */

const DURATION_MS = 350;
const CURVE_EXP = 2.5;
/** Smaller = more dramatic 3D foreshortening. */
const PERSPECTIVE = 400;
/** Maximum rotateX tilt angle (degrees). The window tips forward as if
 *  being pulled down into the screen. */
const MAX_ROTATE_X = 45;
/** Maximum feDisplacementMap scale (px). */
const MAX_DISPLACEMENT = 20;
/** CSS blur for motion blur (px). */
const MAX_BLUR = 4;
/** Target horizontal scale (width fraction at full collapse). */
const TARGET_SCALE_X = 0.15;
/** Target vertical scale. */
const TARGET_SCALE_Y = 0.10;

/* ========================================================================
 * Helpers
 * ======================================================================== */

function flyDirection(
  fly: NonNullable<ReturnType<typeof useTerminalStore.getState>["flyAnimation"]>,
): MinifyDirection {
  return fly.direction ?? "in";
}

/**
 * Generate a 2D displacement map as a PNG data‑URI.
 *
 * The map encodes a vector field that squeezes every pixel toward the
 * tab's horizontal centre, with intensity proportional to `1 - y` (strongest
 * at the top, zero at the bottom).  This creates the "funnel / suck" shape.
 *
 * R channel → X displacement  (128 = no displacement)
 * G channel → Y displacement  (128 = no displacement)
 *
 * @param width             Map width (px) — should match window width.
 * @param height            Map height (px) — should match window height.
 * @param tabCenterFraction Tab centre X in [0, 1] relative to window.
 */
function createDisplacementMap(
  width: number,
  height: number,
  tabCenterFraction: number,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(width, height);
  const d = img.data;

  for (let y = 0; y < height; y++) {
    // 0 at top, 1 at bottom
    const yFrac = y / height;
    // Intensity: 1 at top, ~0 at bottom  (quadratic fall-off)
    const intensity = (1.0 - yFrac) * (1.0 - yFrac);

    for (let x = 0; x < width; x++) {
      const xFrac = x / width;
      // X: move toward tab centre.  Left-of-centre pixels get R>128 (→),
      // right-of-centre get R<128 (←).
      const xToCenter = tabCenterFraction - xFrac;
      const r = 128 + xToCenter * intensity * 128;

      // Y: slight downward push at the top to compress vertically.
      // G>128 → pushes pixel upward (counter‑intuitive but that's
      // how feDisplacementMap works: positive G → move up).
      const g = 128 + (1.0 - yFrac) * 0.0; // mostly neutral; Y squeeze
      // is handled by CSS scaleY

      const idx = (y * width + x) * 4;
      d[idx]     = Math.max(0, Math.min(255, Math.round(r))); // R
      d[idx + 1] = Math.max(0, Math.min(255, Math.round(g))); // G
      d[idx + 2] = 128; // B (unused by feDisplacementMap)
      d[idx + 3] = 255; // A
    }
  }

  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL("image/png");
}

/* ========================================================================
 * Component
 * ======================================================================== */

const SuckOverlay: React.FC = () => {
  const fly = useTerminalStore((s) => s.flyAnimation);
  const setFlyAnimation = useTerminalStore((s) => s.setFlyAnimation);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);
  const setReopeningId = useTerminalStore((s) => s.setReopeningId);

  // ── Refs ──────────────────────────────────────────────────────
  const wrapperRef   = useRef<HTMLDivElement>(null);
  const cardRef      = useRef<HTMLDivElement>(null);
  const feImageRef   = useRef<SVGFEImageElement>(null);
  const dispMapRef   = useRef<SVGFEDisplacementMapElement>(null);
  const turbRef      = useRef<SVGFETurbulenceElement>(null);
  const rafRef       = useRef<number>(0);
  const animatingRef = useRef(false);

  // Unique filter ID (per terminal so concurrent anims don't clash).
  const filterId = useRef(
    `suck-${fly?.terminalId ?? "0"}-${Math.random().toString(36).slice(2, 8)}`,
  );

  // Elastically‑bouncy impact glow
  const [glowVisible, setGlowVisible] = useState(false);
  const glowRef = useRef({ x: 0, y: 0 });

  /* ==================================================================
   * Completion (tab bounce + glow + teardown)
   * ================================================================== */
  const handleComplete = useCallback(() => {
    if (!fly) return;

    if (flyDirection(fly) === "out") {
      setFlyAnimation(null);
      setReopeningId(null);
      return;
    }

    // Multi‑step tab bounce
    const tabEl = document.querySelector(
      `[data-terminal-id="${fly.terminalId}"]`,
    ) as HTMLElement | null;
    if (tabEl) {
      const steps: [string, number][] = [
        ["scale(1.18)", 160],
        ["scale(0.93)", 100],
        ["scale(1.03)", 80],
        ["scale(1)",    100],
      ];
      let delay = 0;
      for (const [t, dur] of steps) {
        setTimeout(() => {
          tabEl.style.transition = `transform ${dur}ms cubic-bezier(0.34, 1.56, 0.64, 1)`;
          tabEl.style.transform = t;
        }, delay);
        delay += dur;
      }
      setTimeout(() => {
        tabEl.style.transition = "";
        tabEl.style.transform = "";
      }, delay + 50);
    }

    // Impact glow
    glowRef.current = {
      x: fly.endRect.left + fly.endRect.width / 2,
      y: fly.endRect.top + fly.endRect.height / 2,
    };
    setGlowVisible(true);
    setTimeout(() => setGlowVisible(false), 300);

    setTimeout(() => {
      setFlyAnimation(null);
      if (fly.removeAfter) removeTerminal(fly.terminalId);
    }, 60);
  }, [fly, setFlyAnimation, removeTerminal, setReopeningId]);

  /* ==================================================================
   * rAF animation loop
   * ================================================================== */
  const runAnim = useCallback(
    (anim: MinifyAnimation, dispMapUri: string) => {
      const wrapper = wrapperRef.current;
      const card    = cardRef.current;
      const feImg   = feImageRef.current;
      const disp    = dispMapRef.current;
      const turb    = turbRef.current;
      if (!wrapper || !card) return;

      // Inject the pre‑generated displacement map into the SVG filter
      if (feImg) {
        feImg.setAttribute("href", dispMapUri);
      }

      let last = performance.now();

      const tick = () => {
        const now = performance.now();
        anim.tick(now - last);
        last = now;

        const raw = anim.frame().time;  // 0→1 ("in") or 1→0 ("out")

        // ── Elastic phase (final 25%) ──
        const ep = raw > 0.75
          ? 0.75 + 0.25 * springSettle((raw - 0.75) / 0.25, 5.5, 3.5)
          : raw;

        // ── CSS Transform ──────────────────────────────────
        const ts = easeInQuad(raw);

        const translateX = anim.frame().translateX;
        const translateY = anim.frame().translateY;

        // rotateX: tip forward (top comes toward viewer) —
        // with transform‑origin at the bottom the top lunges forward.
        const rotateX = MAX_ROTATE_X * raw * (1.0 - 0.25 * ts);

        // Scale toward tab infinitesimal size
        const scaleX = 1.0 - (1.0 - TARGET_SCALE_X) * easeInQuad(ep);
        const scaleY = 1.0 - (1.0 - TARGET_SCALE_Y) * easeInQuad(ep);

        // Organic skew — peaks mid‑animation
        const skewX = 5.0 * Math.sin(raw * Math.PI) * (1.0 - ep);

        // Opacity
        const opacity = raw < 0.85
          ? Math.min(0.95, 0.55 + 0.4 * easeInQuad(raw / 0.85))
          : Math.max(0.95 * (1.0 - (raw - 0.85) / 0.15), 0);

        wrapper.style.transform =
          `translate(${translateX}px, ${translateY}px) ` +
          `rotateX(${rotateX}deg) ` +
          `scaleX(${scaleX}) ` +
          `scaleY(${scaleY}) ` +
          `skewX(${skewX}deg)`;
        wrapper.style.opacity = String(opacity);

        // ── Motion blur ────────────────────────────────────
        const blurPx = raw < 0.5
          ? easeInQuart(raw / 0.5) * 1.0
          : 1.0 + (MAX_BLUR - 1.0) * easeInQuad((raw - 0.5) / 0.5);
        const blurStr = `blur(${blurPx.toFixed(1)}px)`;

        // ── Displacement intensity (peaks mid‑animation) ──
        const dispScale = raw < 0.2
          ? MAX_DISPLACEMENT * (raw / 0.2)
          : raw > 0.85
            ? MAX_DISPLACEMENT * (1.0 - (raw - 0.85) / 0.15)
            : MAX_DISPLACEMENT;

        if (disp) disp.setAttribute("scale", dispScale.toFixed(1));

        // ── Animate turbulence for organic "water" wobble ──
        if (turb) {
          const bf = 0.025 + raw * 0.015;
          turb.setAttribute("baseFrequency", `0.03 ${bf.toFixed(4)}`);
        }

        // ── Final filter string (blur + SVG displacement) ──
        card.style.filter = `${blurStr} url(#${filterId.current})`;

        if (!anim.isFinished()) {
          rafRef.current = requestAnimationFrame(tick);
        } else {
          handleComplete();
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    },
    [handleComplete],
  );

  /* ==================================================================
   * Main effect
   * ================================================================== */
  useEffect(() => {
    if (!fly || animatingRef.current) return;
    animatingRef.current = true;

    glowRef.current = {
      x: fly.endRect.left + fly.endRect.width / 2,
      y: fly.endRect.top + fly.endRect.height / 2,
    };

    // ── Pre‑compute the directional displacement map ──
    const tabCenterX =
      ((fly.endRect.left - fly.startRect.left) + fly.endRect.width / 2) /
      fly.startRect.width;
    const dispMapBase64 = createDisplacementMap(
      Math.round(fly.startRect.width),
      Math.round(fly.startRect.height),
      Math.max(0, Math.min(1, tabCenterX)),
    );

    const anim = new MinifyAnimation({
      startRect: fly.startRect,
      endRect: fly.endRect,
      direction: flyDirection(fly),
      durationMs: DURATION_MS,
      curveExp: CURVE_EXP,
    });

    // Wait one frame so the DOM (svg filter elements) is mounted
    requestAnimationFrame(() => runAnim(anim, dispMapBase64));

    return () => {
      cancelAnimationFrame(rafRef.current);
      animatingRef.current = false;
    };
  }, [fly?.terminalId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!fly) return null;

  // Perspective origin biased toward the bottom (dock area)
  const perspOY =
    105 +
    (fly.endRect.top - fly.startRect.top - fly.startRect.height / 2) / 8;

  // ── Pre‑compute initial CSS transform so the first paint already sits
  //     at the correct position.  Without this there is a 1‑frame flash
  //     at full window size for the "out" (re‑open) direction. ──
  const dir = flyDirection(fly);
  const winCX = fly.startRect.left + fly.startRect.width / 2;
  const winCY = fly.startRect.top + fly.startRect.height / 2;
  const tabCX = fly.endRect.left + fly.endRect.width / 2;
  const tabCY = fly.endRect.top + fly.endRect.height / 2;
  const ddx = tabCX - winCX;
  const ddy = tabCY - winCY;

  let initialTransform: string;
  let initialOpacity: number;
  if (dir === "out") {
    // Effective progress = 1.0 → fully collapsed to tab
    const raw = 1.0;
    const ts = raw * raw;                         // easeInQuad(1) = 1
    const rotX = MAX_ROTATE_X * raw * (1.0 - 0.25 * ts);   // 45 × 0.75 = 33.75
    const sx = 1.0 - (1.0 - TARGET_SCALE_X) * ts;           // 0.15
    const sy = 1.0 - (1.0 - TARGET_SCALE_Y) * ts;           // 0.10
    const op =
      raw < 0.85
        ? Math.min(0.95, 0.55 + 0.4 * ts)
        : Math.max(0.95 * (1.0 - (raw - 0.85) / 0.15), 0);  // 0
    initialTransform = `translate(${ddx}px, ${ddy}px) rotateX(${rotX}deg) scaleX(${sx}) scaleY(${sy}) skewX(0deg)`;
    initialOpacity = op;
  } else {
    // "in": effective progress = 0 → at window position, identity transform
    initialTransform =
      "translate(0px, 0px) rotateX(0deg) scaleX(1) scaleY(1) skewX(0deg)";
    initialOpacity = 0.55; // min(0.95, 0.55 + 0.4×0)
  }

  return createPortal(
    <>
      {/* ================================================================
       *  SVG Filter Pipeline
       *
       *  Stage 1  feImage             → directional displacement map (pre‑computed)
       *  Stage 2  feTurbulence        → animated noise for "water" wobble
       *  Stage 3  feColorMatrix       → tint the noise into R/G channels
       *  Stage 4  feDisplacementMap   → apply directional warp (in2 = noise + image combined)
       *  Stage 5  feGaussianBlur      → soften
       *  Stage 6  feComposite         → keep original alpha
       * ================================================================ */}
      <svg
        style={{ position: "absolute", width: 0, height: 0 }}
        aria-hidden="true"
      >
        <defs>
          <filter
            id={filterId.current}
            x="-40%"
            y="-40%"
            width="180%"
            height="180%"
            colorInterpolationFilters="sRGB"
          >
            {/* ── Directional displacement map (static, injected via JS) ── */}
            <feImage
              ref={feImageRef}
              crossOrigin="anonymous"
              result="dirMap"
            />

            {/* ── Organic noise for "water" wobble ── */}
            <feTurbulence
              ref={turbRef}
              type="fractalNoise"
              baseFrequency="0.03 0.025"
              numOctaves="4"
              seed={fly.terminalId.charCodeAt(0) || 42}
              result="noise"
            />

            {/* ── Merge directional map + noise into one displacement source ── */}
            <feComposite
              in="dirMap"
              in2="noise"
              operator="arithmetic"
              k1="0.8"
              k2="0"
              k3="0.2"
              k4="0"
              result="combinedDisp"
            />

            {/* ── Apply displacement to SourceGraphic ── */}
            <feDisplacementMap
              ref={dispMapRef}
              in="SourceGraphic"
              in2="combinedDisp"
              scale="0"
              xChannelSelector="R"
              yChannelSelector="G"
              result="warped"
            />

            {/* ── Soften edges ── */}
            <feGaussianBlur
              in="warped"
              stdDeviation="0.5"
              result="soft"
            />

            {/* ── Restore original alpha channel ── */}
            <feComposite
              in="soft"
              in2="SourceGraphic"
              operator="in"
            />
          </filter>
        </defs>
      </svg>

      {/* ================================================================
       *  Wrapper — transform-origin at BOTTOM so the top tips forward
       * ================================================================ */}
      <div
        ref={wrapperRef}
        style={{
          position: "fixed",
          left: fly.startRect.left,
          top: fly.startRect.top,
          width: fly.startRect.width,
          height: fly.startRect.height,
          zIndex: 9999,
          pointerEvents: "none",
          perspective: PERSPECTIVE,
          perspectiveOrigin: `50% ${perspOY}%`,
          transformStyle: "preserve-3d",
          transformOrigin: "center bottom",
          willChange: "transform, opacity",
          transform: initialTransform,
          opacity: initialOpacity,
        }}
      >
        {/* Ghost card */}
        <div
          ref={cardRef}
          style={{
            width: "100%",
            height: "100%",
            background: "var(--card-bg, #1a1d23)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: `
              0 30px 90px rgba(0,0,0,0.6),
              0 0 0 1px rgba(255,255,255,0.05) inset
            `,
            transformOrigin: "center center",
            willChange: "filter",
          }}
        >
          {/* Titlebar */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              height: 32,
              padding: "0 10px",
              flexShrink: 0,
              borderBottom:
                "1px solid var(--card-border, rgba(255,255,255,0.1))",
              background: "rgba(0,0,0,0.18)",
            }}
          >
            <span
              className={`status-dot ${fly.terminalStatus}`}
              style={{ marginRight: 8 }}
            />
            <span
              style={{
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-secondary, #999)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
              }}
            >
              {fly.terminalName}
            </span>
          </div>

          {/* Content */}
          <div
            style={{
              flex: 1,
              overflow: "hidden",
              position: "relative",
              background: "#1a1d23",
              height: "calc(100% - 32px)",
            }}
          >
            {fly.contentHTML ? (
              <div
                dangerouslySetInnerHTML={{ __html: fly.contentHTML }}
                style={{ height: "100%", overflow: "hidden" }}
              />
            ) : (
              <div
                style={{
                  height: "100%",
                  background:
                    "repeating-linear-gradient(0deg, transparent, transparent 18px, rgba(255,255,255,0.03) 18px, rgba(255,255,255,0.03) 19px)",
                }}
              />
            )}
          </div>
        </div>
      </div>

      {/* ================================================================
       *  Impact glow
       * ================================================================ */}
      {glowVisible && (
        <motion.div
          initial={{ opacity: 0.9, scale: 0.15 }}
          animate={{ opacity: 0, scale: 3.0 }}
          transition={{ duration: 0.3, ease: [0.4, 0, 0.6, 1] }}
          style={{
            position: "fixed",
            left: glowRef.current.x,
            top: glowRef.current.y,
            width: 1,
            height: 1,
            borderRadius: "50%",
            background:
              "radial-gradient(circle, rgba(108,140,255,0.5) 0%, rgba(108,140,255,0) 70%)",
            transform: "translate(-50%, -50%)",
            pointerEvents: "none",
            zIndex: 10000,
          }}
        />
      )}
    </>,
    document.body,
  );
};

export default SuckOverlay;
