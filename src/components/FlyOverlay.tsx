import React, { useEffect, useRef } from "react";
import { motion, useMotionValue } from "framer-motion";
import { createPortal } from "react-dom";
import { useTerminalStore } from "../stores/terminalStore";

/* ========================================================================
 * Easing functions
 * ======================================================================== */

function easeOutCubic(t: number) {
  const t1 = 1 - t;
  return 1 - t1 * t1 * t1;
}
function easeInQuart(t: number) {
  return t * t * t * t;
}
function easeInQuad(t: number) {
  return t * t;
}

/* ========================================================================
 * Constants
 * ======================================================================== */

const FLY_DURATION_MS = 250;
const PERSPECTIVE = 800;
const FILTER_ID_PREFIX = "genie-warp-";

/* ========================================================================
 * Component
 * ======================================================================== */

const FlyOverlay: React.FC = () => {
  const fly = useTerminalStore((s) => s.flyAnimation);
  const setFlyAnimation = useTerminalStore((s) => s.setFlyAnimation);
  const removeTerminal = useTerminalStore((s) => s.removeTerminal);

  // ── motion values ──────────────────────────────────────────
  const mvX = useMotionValue(0);
  const mvY = useMotionValue(0);
  const mvScaleX = useMotionValue(1);
  const mvScaleY = useMotionValue(1);
  const mvRotateX = useMotionValue(0);
  const mvSkewY = useMotionValue(0);
  const mvOpacity = useMotionValue(1);
  // Combined CSS filter (blur + SVG displacement), updated each frame
  const mvFilter = useMotionValue("blur(0px)");

  const [glowVisible, setGlowVisible] = React.useState(false);
  const glowRef = useRef({ x: 0, y: 0 });
  const animatingRef = useRef(false);
  const filterId = useRef(`${FILTER_ID_PREFIX}${fly?.terminalId ?? "0"}`);

  // ── Animation loop ──────────────────────────────────────────
  useEffect(() => {
    if (!fly || animatingRef.current) return;
    animatingRef.current = true;

    const winCX = fly.startRect.left + fly.startRect.width / 2;
    const winCY = fly.startRect.top + fly.startRect.height / 2;
    const tabCX = fly.endRect.left + fly.endRect.width / 2;
    const tabCY = fly.endRect.top + fly.endRect.height / 2;
    const dx = tabCX - winCX;
    const dy = tabCY - winCY;
    const tSX = fly.endRect.width / fly.startRect.width;
    const tSY = fly.endRect.height / fly.startRect.height;

    glowRef.current = { x: tabCX, y: tabCY };

    const start = performance.now();
    const tick = () => {
      const elapsed = performance.now() - start;
      const raw = Math.min(elapsed / FLY_DURATION_MS, 1);

      const tx = easeOutCubic(raw); // X: fast → decelerate
      const ty = easeInQuart(raw); // Y: slow → rapid drop (arc)
      const ts = easeInQuad(raw); // scale / skew: gentle acceleration

      mvX.set(dx * tx);
      mvY.set(dy * ty);

      // Scale: Y compresses ~25 % more than X for vertical squish
      const baseScale = 1 + (tSX - 1) * ts;
      mvScaleX.set(baseScale);
      mvScaleY.set(baseScale * (1 - 0.25 * ts));

      // 3D tilt: snap to 8°, ease back to ~2°
      mvRotateX.set(8 * raw - 2 * ts);

      // Skew: mid‑animation forward lean
      mvSkewY.set(2.5 * Math.sin(raw * Math.PI));

      // Opacity: hold 0.92 until 70 %, then fade via easeInQuad
      const op =
        raw < 0.7 ? 0.92 : 0.92 * (1 - easeInQuad((raw - 0.7) / 0.3));
      mvOpacity.set(op);

      // Motion blur: < 0.3 px first 65 %, then exponential → 3.5 px
      let bp: number;
      if (raw < 0.65) {
        bp = easeInQuad(raw / 0.65) * 0.3;
      } else {
        const r = (raw - 0.65) / 0.35;
        bp = 0.3 + 3.2 * easeInQuad(r);
      }
      // Combined filter: CSS blur + SVG organic displacement
      const dispScale = 12 * Math.sin(raw * Math.PI); // 0 → 12 → 0
      mvFilter.set(`blur(${bp.toFixed(1)}px) url(#${filterId.current})`);

      // Drive the SVG displacement scale directly (no SMIL)
      const dispMap = document.getElementById(
        `${filterId.current}-disp`,
      ) as SVGFEDisplacementMapElement | null;
      if (dispMap) {
        dispMap.setAttribute("scale", dispScale.toFixed(1));
      }

      if (raw < 1) {
        requestAnimationFrame(tick);
      } else {
        handleComplete();
      }
    };
    requestAnimationFrame(tick);

    return () => {
      animatingRef.current = false;
    };
  }, [fly?.terminalId]);

  // ── Complete ─────────────────────────────────────────────────
  const handleComplete = () => {
    // Dock bounce
    const tabEl = document.querySelector(
      `[data-terminal-id="${fly!.terminalId}"]`,
    ) as HTMLElement | null;
    if (tabEl) {
      tabEl.style.transition =
        "transform 0.15s cubic-bezier(0.34, 1.56, 0.64, 1)";
      tabEl.style.transform = "scale(1.12)";
      setTimeout(() => {
        tabEl.style.transform = "scale(1)";
        setTimeout(() => {
          tabEl.style.transition = "";
          tabEl.style.transform = "";
        }, 160);
      }, 160);
    }

    // Impact glow
    setGlowVisible(true);
    setTimeout(() => setGlowVisible(false), 200);

    // Cleanup store
    setTimeout(() => {
      setFlyAnimation(null);
      if (fly?.removeAfter) removeTerminal(fly.terminalId);
    }, 30);
  };

  if (!fly) return null;

  // Perspective origin shifts toward the dock
  const perspOY =
    100 +
    (fly.endRect.top -
      fly.startRect.top -
      fly.startRect.height / 2) /
      8;

  return createPortal(
    <>
      {/* ================================================================
       *  SVG filter definition — organic warp via displacement map
       * ================================================================ */}
      <svg
        style={{ position: "absolute", width: 0, height: 0 }}
        aria-hidden="true"
      >
        <defs>
          <filter
            id={filterId.current}
            x="-30%"
            y="-30%"
            width="160%"
            height="160%"
          >
            {/* Fractal noise — organic grain texture */}
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.04"
              numOctaves="3"
              seed={fly.terminalId.charCodeAt(0) || 42}
              result="noise"
            />

            {/* Displacement map (scale driven by rAF) */}
            <feDisplacementMap
              id={`${filterId.current}-disp`}
              in="SourceGraphic"
              in2="noise"
              scale="0"
              xChannelSelector="R"
              yChannelSelector="G"
              result="displaced"
            />

            {/* Subtle post‑displacement smoothing */}
            <feGaussianBlur
              in="displaced"
              stdDeviation="0.3"
              result="soft"
            />

            {/* 85 % displaced + 15 % original = stable but organic */}
            <feBlend in="SourceGraphic" in2="soft" mode="normal" />
          </filter>
        </defs>
      </svg>

      {/* ================================================================
       *  Ghost card
       * ================================================================ */}
      <div
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
        }}
      >
        <motion.div
          style={{
            width: "100%",
            height: "100%",
            x: mvX,
            y: mvY,
            scaleX: mvScaleX,
            scaleY: mvScaleY,
            rotateX: mvRotateX,
            skewY: mvSkewY,
            opacity: mvOpacity,
            filter: mvFilter,
            background: "var(--card-bg, #1a1d23)",
            borderRadius: 12,
            overflow: "hidden",
            boxShadow: "0 20px 60px rgba(0,0,0,0.5)",
            transformOrigin: "center center",
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
              background: "rgba(0,0,0,0.15)",
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

          {/* Content – real xterm clone or fallback */}
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
        </motion.div>
      </div>

      {/* ================================================================
       *  Impact glow
       * ================================================================ */}
      {glowVisible && (
        <motion.div
          initial={{ opacity: 0.9, scale: 0.3 }}
          animate={{ opacity: 0, scale: 2.0 }}
          transition={{ duration: 0.22, ease: [0.4, 0, 0.6, 1] }}
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

export default FlyOverlay;
