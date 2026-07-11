import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useTerminalStore } from "../stores/terminalStore";
import { useGridLayout } from "../hooks/useGridLayout";
import TerminalWindow from "./TerminalWindow";

const TerminalGrid: React.FC = () => {
  const terminals = useTerminalStore((s) => s.terminals);
  const setTerminalMaximized = useTerminalStore((s) => s.setTerminalMaximized);
  const { cells, gridCols, gridRows, isMaximized, maximizedTerminalId } =
    useGridLayout();

  const handleMaximizeToggle = (id: string) => {
    const terminal = terminals.find((t) => t.id === id);
    if (terminal) {
      setTerminalMaximized(id, !terminal.isMaximized);
    }
  };

  return (
    <div
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
          const terminal = terminals.find(
            (t) => t.id === cell.terminalId
          );
          if (!terminal) return null;

          return (
            <motion.div
              key={terminal.id}
              layout
              layoutId={terminal.id}
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.8 }}
              transition={{
                opacity: { duration: 0.2 },
                scale: { duration: 0.28, ease: [0.34, 1.56, 0.64, 1] },
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
            No Terminals Open
          </span>
          <span style={{ fontSize: "12px" }}>
            Click the + button or press Ctrl+Shift+T to create one
          </span>
        </div>
      )}
    </div>
  );
};

export default TerminalGrid;
