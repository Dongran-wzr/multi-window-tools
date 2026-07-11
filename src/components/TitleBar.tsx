import React, { useCallback } from "react";
import { Minus, Square, X, Settings } from "lucide-react";
import { useTerminalStore } from "../stores/terminalStore";
import { getCurrentWindow } from "@tauri-apps/api/window";

const TitleBar: React.FC = () => {
  const setSettingsOpen = useTerminalStore((s) => s.setSettingsOpen);
  const appWindow = getCurrentWindow();

  // Only the gray drag-handle area triggers window move
  const handleDragAreaMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // double-check we didn't land on a button
      const target = e.target as HTMLElement;
      if (target.closest("button")) return;
      appWindow.startDragging();
    },
    [appWindow],
  );

  // Window control buttons — plain async handlers
  const handleMinimize = useCallback(async () => {
    await appWindow.minimize();
  }, [appWindow]);

  const handleMaximize = useCallback(async () => {
    await appWindow.toggleMaximize();
  }, [appWindow]);

  const handleClose = useCallback(async () => {
    await appWindow.close();
  }, [appWindow]);

  const handleSettings = useCallback(() => {
    setSettingsOpen(true);
  }, [setSettingsOpen]);

  const btnBase: React.CSSProperties = {
    background: "transparent",
    border: "none",
    color: "var(--text-secondary)",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 6,
    transition: "background 120ms, color 120ms",
  };

  return (
    <div
      className="titlebar glass"
      style={{
        height: 44,
        minHeight: 44,
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 12px",
        flexShrink: 0,
        zIndex: 100,
        borderBottom: "1px solid var(--glass-border)",
        cursor: "default",
      }}
    >
      {/* ===== DRAG HANDLE — left side, fills remaining space ===== */}
      <div
        onMouseDown={handleDragAreaMouseDown}
        style={{
          flex: 1,
          height: "100%",
          display: "flex",
          alignItems: "center",
          gap: 12,
          cursor: "grab",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 600,
            color: "var(--text-primary)",
            letterSpacing: "0.3px",
            pointerEvents: "none",
          }}
        >
          MultiWindow Terminal
        </span>

        {/* Settings button — inside drag area but explicitly excluded via closest('button') */}
        <button
          style={{ ...btnBase, padding: "4px 6px" }}
          onClick={handleSettings}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <Settings size={16} />
        </button>
      </div>

      {/* ===== WINDOW CONTROLS — right side, NO drag ===== */}
      <div style={{ display: "flex", alignItems: "center", gap: 2, marginLeft: 8 }}>
        {/* Minimize */}
        <button
          style={{ ...btnBase, width: 34, height: 28 }}
          onClick={handleMinimize}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <Minus size={16} />
        </button>

        {/* Maximize */}
        <button
          style={{ ...btnBase, width: 34, height: 28 }}
          onClick={handleMaximize}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "var(--bg-hover)";
            e.currentTarget.style.color = "var(--text-primary)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <Square size={14} />
        </button>

        {/* Close */}
        <button
          style={{ ...btnBase, width: 34, height: 28 }}
          onClick={handleClose}
          onMouseEnter={(e) => {
            e.currentTarget.style.background = "#e81123";
            e.currentTarget.style.color = "#fff";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = "var(--text-secondary)";
          }}
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};

export default TitleBar;
