import React, { useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTerminalStore } from "../stores/terminalStore";
import { useGridLayout } from "../hooks/useGridLayout";
import TerminalWindow from "./TerminalWindow";
import { useI18n } from "../i18n/translations";

const GRID_CELL_CLASS = "terminal-grid-cell";

/** Remove drag-over class from all grid cells synchronously */
function clearAllDragHighlights() {
  document
    .querySelectorAll(`.${GRID_CELL_CLASS}.drag-over`)
    .forEach((el) => el.classList.remove("drag-over"));
}

/** Remove drag-source class from all grid cells synchronously */
function clearAllDragSources() {
  document
    .querySelectorAll(`.${GRID_CELL_CLASS}.drag-source`)
    .forEach((el) => el.classList.remove("drag-source"));
}

/** Build a simplified floating ghost that resembles the dragged terminal */
function createGhost(
  sourceCell: HTMLElement,
  pointerX: number,
  pointerY: number
): HTMLElement {
  const cellRect = sourceCell.getBoundingClientRect();

  // Find the titlebar text inside the source terminal
  const nameEl = sourceCell.querySelector(".terminal-titlebar span");
  const terminalName = nameEl?.textContent || "";

  // Find status dot class
  const statusDot = sourceCell.querySelector(".status-dot");
  const statusClass = statusDot?.className.replace("status-dot ", "") || "";

  const ghost = document.createElement("div");
  ghost.className = "terminal-drag-ghost";
  ghost.innerHTML = `
    <div class="ghost-inner">
      <div class="ghost-titlebar">
        <span class="status-dot ${statusClass}"></span>
        <span class="ghost-name">${terminalName}</span>
      </div>
      <div class="ghost-body">
        <div class="ghost-lines">
          <span></span><span></span><span></span>
        </div>
      </div>
    </div>
  `;

  // Size matches source cell
  ghost.style.width = `${cellRect.width}px`;
  ghost.style.height = `${cellRect.height}px`;
  ghost.style.position = "fixed";
  ghost.style.left = `${cellRect.left}px`;
  ghost.style.top = `${cellRect.top}px`;
  ghost.style.pointerEvents = "none";
  ghost.style.zIndex = "1000";
  ghost.style.transition = "none";

  document.body.appendChild(ghost);

  // Store the initial offset between pointer and ghost top-left
  (ghost as any).__offsetX = pointerX - cellRect.left;
  (ghost as any).__offsetY = pointerY - cellRect.top;

  return ghost;
}

const TerminalGrid: React.FC = () => {
  const terminals = useTerminalStore((s) => s.terminals);
  const reopeningId = useTerminalStore((s) => s.reopeningId);
  const setTerminalMaximized = useTerminalStore((s) => s.setTerminalMaximized);
  const { t } = useI18n();
  const { cells, gridCols, gridRows, isMaximized, maximizedTerminalId } =
    useGridLayout();

  const dragSourceRef = useRef<number | null>(null);
  const dragTargetRef = useRef<number | null>(null);
  const ghostRef = useRef<HTMLElement | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  const handleMaximizeToggle = (id: string) => {
    const terminal = terminals.find((t) => t.id === id);
    if (terminal) {
      setTerminalMaximized(id, !terminal.isMaximized);
    }
  };

  // Called by TerminalWindow when titlebar pointerdown fires
  const handleTitleBarPointerDown = useCallback(
    (sourceSlot: number, e: React.PointerEvent) => {
      const source = sourceSlot;
      dragSourceRef.current = source;
      dragTargetRef.current = null;

      // Find the source grid cell
      const sourceCell = document.querySelector(
        `[data-grid-slot="${source}"]`
      ) as HTMLElement | null;

      // ① Dim the source window
      if (sourceCell) {
        sourceCell.classList.add("drag-source");
      }

      // ② Create floating ghost
      if (sourceCell) {
        const ghost = createGhost(sourceCell, e.clientX, e.clientY);
        ghostRef.current = ghost;
      }

      const onPointerMove = (ev: PointerEvent) => {
        // Move ghost
        const ghost = ghostRef.current;
        if (ghost) {
          const ox = (ghost as any).__offsetX as number;
          const oy = (ghost as any).__offsetY as number;
          ghost.style.left = `${ev.clientX - ox}px`;
          ghost.style.top = `${ev.clientY - oy}px`;
        }

        // Find target cell under cursor
        const els = document.elementsFromPoint(ev.clientX, ev.clientY);
        let foundEl: HTMLElement | null = null;
        let foundSlot: number | null = null;
        for (const el of els) {
          if (
            el instanceof HTMLElement &&
            el.dataset.gridSlot !== undefined &&
            !el.classList.contains("drag-source") // skip self
          ) {
            foundEl = el;
            foundSlot = parseInt(el.dataset.gridSlot);
            break;
          }
        }

        if (dragTargetRef.current !== foundSlot) {
          clearAllDragHighlights();
          if (foundEl && foundSlot !== null) {
            foundEl.classList.add("drag-over");
          }
          dragTargetRef.current = foundSlot;
        }
      };

      const cleanup = () => {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", cleanup);
        document.removeEventListener("pointercancel", cleanup);

        // ③ Remove ghost
        const ghost = ghostRef.current;
        if (ghost) {
          // Fade-out then remove
          ghost.style.transition = "opacity 0.15s ease, transform 0.15s ease";
          ghost.style.opacity = "0";
          ghost.style.transform = "scale(0.8)";
          setTimeout(() => ghost.remove(), 160);
          ghostRef.current = null;
        }

        // ④ Restore source window
        clearAllDragSources();

        // ⑤ Remove target highlight
        clearAllDragHighlights();

        // ⑥ Swap
        const target = dragTargetRef.current;
        dragSourceRef.current = null;
        dragTargetRef.current = null;
        if (source !== null && target !== null && source !== target) {
          useTerminalStore.getState().swapTerminals(source, target);
        }
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", cleanup);
      document.addEventListener("pointercancel", cleanup);
    },
    []
  );

  return (
    <div
      ref={gridRef}
      className="terminal-grid"
      style={{
        flex: 1,
        display: "grid",
        gridTemplateColumns: `repeat(${gridCols}, 1fr)`,
        gridTemplateRows: `repeat(${gridRows}, 1fr)`,
        gap: "var(--grid-gap)",
        padding: "var(--grid-gap)",
        overflow: "hidden",
        position: "relative",
      }}
    >
      <AnimatePresence mode="popLayout">
        {cells.map((cell) => {
          const terminal = terminals.find((t) => t.id === cell.terminalId);
          if (!terminal) return null;

          return (
            <motion.div
              key={terminal.id}
              className={GRID_CELL_CLASS}
              data-grid-slot={cell.slot}
              layout
              layoutId={terminal.id}
              initial={
                terminal.id === reopeningId
                  ? false
                  : { opacity: 0, scale: 0.5 }
              }
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.85 }}
              transition={{
                opacity: { duration: 0.12 },
                scale: { duration: 0.2, ease: [0.4, 0, 0.6, 1] },
                layout: {
                  type: "spring",
                  stiffness: 300,
                  damping: 30,
                },
              }}
              style={{
                gridRow: isMaximized ? "1 / -1" : `${cell.row + 1}`,
                gridColumn: isMaximized ? "1 / -1" : `${cell.col + 1}`,
                minHeight: 0,
                minWidth: 0,
              }}
            >
              <TerminalWindow
                terminal={terminal}
                isMaximized={
                  isMaximized && terminal.id === maximizedTerminalId
                }
                onMaximizeToggle={() => handleMaximizeToggle(terminal.id)}
                onTitleBarDragStart={handleTitleBarPointerDown}
              />
            </motion.div>
          );
        })}
      </AnimatePresence>

      {/* Empty state */}
      {cells.length === 0 && (
        <div
          style={{
            gridRow: "1 / -1",
            gridColumn: "1 / -1",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "16px",
            color: "var(--text-muted)",
          }}
        >
          <svg
            width="64"
            height="64"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ opacity: 0.3 }}
          >
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
            <line x1="8" y1="21" x2="16" y2="21" />
            <line x1="12" y1="17" x2="12" y2="21" />
          </svg>
          <span style={{ fontSize: "14px", fontWeight: 500 }}>
            {t("empty.noTerminals")}
          </span>
          <span style={{ fontSize: "12px" }}>{t("empty.hint")}</span>
        </div>
      )}
    </div>
  );
};

export default TerminalGrid;
