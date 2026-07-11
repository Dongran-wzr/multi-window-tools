import React, { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { useTerminalStore } from "../stores/terminalStore";
import { useTerminal } from "../hooks/useTerminal";
import { useI18n } from "../i18n/translations";

// Shared ref to track the currently open context menu — ensures only one at a time
let closeCurrentContextMenu: (() => void) | null = null;

interface TabItemProps {
  terminalId: string;
  name: string;
  status: "running" | "idle" | "exited";
  isActive: boolean;
  onSelect: () => void;
  onTabDragStart: (e: React.DragEvent) => void;
  onTabDragOver: (e: React.DragEvent) => void;
  onTabDrop: (e: React.DragEvent) => void;
}

const TabItem: React.FC<TabItemProps> = ({
  terminalId,
  name,
  status,
  isActive,
  onSelect,
  onTabDragStart,
  onTabDragOver,
  onTabDrop,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const { t } = useI18n();
  const { closeTerminal, renameTerminal, restartTerminal } = useTerminal();
  const updateTerminalName = useTerminalStore((s) => s.updateTerminalName);

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    // Close any previously open context menu first
    closeCurrentContextMenu?.();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCloseContextMenu = () => {
    setContextMenu(null);
  };

  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      closeCurrentContextMenu = null;
    };
    if (contextMenu) {
      // Register this menu as the current one so other tabs can close it
      closeCurrentContextMenu = () => {
        setContextMenu(null);
        closeCurrentContextMenu = null;
      };
      document.addEventListener("click", handleClick);
      return () => {
        document.removeEventListener("click", handleClick);
        closeCurrentContextMenu = null;
      };
    }
  }, [contextMenu]);

  const handleRename = () => {
    const newName = prompt("Enter new name:", name);
    if (newName && newName.trim()) {
      renameTerminal(terminalId, newName.trim());
    }
    setContextMenu(null);
  };

  const handleClose = async () => {
    await closeTerminal(terminalId);
    setContextMenu(null);
  };

  const handleRestart = async () => {
    await restartTerminal(terminalId);
    setContextMenu(null);
  };

  const handleHorizontalSplit = () => {
    // TODO: implement horizontal split
    setContextMenu(null);
  };

  const handleVerticalSplit = () => {
    // TODO: implement vertical split
    setContextMenu(null);
  };

  return (
    <>
      <div
        draggable
        onDragStart={onTabDragStart}
        onDragOver={onTabDragOver}
        onDrop={onTabDrop}
        style={{ flexShrink: 0 }}
      >
      <motion.div
        className={`tab-item ${isActive ? "active" : ""}`}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
        whileHover={{ scale: 1.03, filter: "brightness(1.1)" }}
        whileTap={{ scale: 0.97 }}
        layout
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "0 14px",
          height: "var(--tab-height)",
          borderRadius: "10px 10px 0 0",
          cursor: "pointer",
          position: "relative",
          background: isActive ? "var(--card-bg)" : "transparent",
          border: isActive ? "1px solid var(--card-border)" : "1px solid transparent",
          borderBottom: "none",
          flexShrink: 0,
          transition: "background var(--transition-fast), border var(--transition-fast)",
        }}
      >
        {/* Status dot */}
        <span className={`status-dot ${status}`} />

        {/* Name */}
        <span
          style={{
            fontSize: "12.5px",
            fontWeight: isActive ? 600 : 400,
            color: isActive ? "var(--text-primary)" : "var(--text-secondary)",
            whiteSpace: "nowrap",
            maxWidth: "120px",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {name}
        </span>

        {/* Active indicator underline */}
        {isActive && (
          <motion.div
            layoutId="tab-active-indicator"
            style={{
              position: "absolute",
              bottom: "-1px",
              left: "8px",
              right: "8px",
              height: "3px",
              background: "var(--tab-active-indicator)",
              borderRadius: "3px 3px 0 0",
            }}
            transition={{
              type: "spring",
              stiffness: 500,
              damping: 30,
            }}
          />
        )}
      </motion.div>
      </div>

      {/* Context Menu — rendered via Portal to escape framer-motion clipping */}
      {contextMenu &&
        createPortal(
          <div
            className="context-menu glass card"
            style={{
              position: "fixed",
              left: contextMenu.x,
              bottom: `calc(100vh - ${contextMenu.y}px)`,
              zIndex: 9999,
              minWidth: "160px",
              padding: "6px",
              display: "flex",
              flexDirection: "column",
              gap: "2px",
            }}
          >
          {[
            { label: t("tab.rename"), action: handleRename },
            { label: t("tab.restart"), action: handleRestart },
            { label: t("tab.splitH"), action: handleHorizontalSplit },
            { label: t("tab.splitV"), action: handleVerticalSplit },
            { label: t("tab.close"), action: handleClose, danger: true },
          ].map((item) => (
            <button
              key={item.label}
              onClick={item.action}
              style={{
                background: "transparent",
                border: "none",
                color: item.danger ? "var(--status-red)" : "var(--text-primary)",
                padding: "8px 12px",
                borderRadius: "8px",
                cursor: "pointer",
                fontSize: "12.5px",
                textAlign: "left",
                transition: "background var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = item.danger
                  ? "rgba(248, 113, 113, 0.15)"
                  : "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {item.label}
            </button>
          ))}
        </div>,
          document.body
        )}
    </>
  );
};

export default TabItem;
