import React, { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "framer-motion";
import { useTerminalStore } from "../stores/terminalStore";
import { useTerminal } from "../hooks/useTerminal";
import { useI18n } from "../i18n/translations";

let closeCurrentContextMenu: (() => void) | null = null;

interface TabItemProps {
  terminalId: string;
  name: string;
  status: "running" | "idle" | "exited";
  isActive: boolean;
  isVisible: boolean;
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
  isVisible,
  onSelect,
  onTabDragStart,
  onTabDragOver,
  onTabDrop,
}) => {
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
  } | null>(null);
  const [isHovered, setIsHovered] = useState(false);
  const { t } = useI18n();
  const { closeTerminal, renameTerminal, restartTerminal } = useTerminal();

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    closeCurrentContextMenu?.();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      closeCurrentContextMenu = null;
    };
    if (contextMenu) {
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
    setContextMenu(null);
  };

  const handleVerticalSplit = () => {
    setContextMenu(null);
  };

  /* ---- computed styles ---- */
  const bg = isActive
    ? "linear-gradient(180deg, rgba(108,140,255,0.12) 0%, rgba(108,140,255,0.04) 100%)"
    : isVisible
      ? "linear-gradient(180deg, rgba(255,255,255,0.03) 0%, transparent 100%)"
      : "transparent";

  const borderColor = isActive
    ? "rgba(108,140,255,0.3)"
    : isVisible
      ? "var(--card-border)"
      : "transparent";

  const textColor = isActive
    ? "#c8d6ff"
    : isVisible
      ? "var(--text-primary)"
      : "var(--text-muted)";

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
          className="tab-item"
          onClick={onSelect}
          onContextMenu={handleContextMenu}
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
          whileHover={{ y: -1 }}
          whileTap={{ y: 0, scale: 0.98 }}
          layout
          style={{
            display: "flex",
            alignItems: "center",
            gap: "7px",
            padding: "0 16px",
            height: 36,
            borderRadius: "8px 8px 0 0",
            cursor: "pointer",
            position: "relative",
            flexShrink: 0,
            background: bg,
            border: `1px solid ${borderColor}`,
            borderBottom: "none",
            boxShadow: isActive
              ? "inset 0 1px 0 rgba(108,140,255,0.15), 0 -1px 8px rgba(108,140,255,0.06)"
              : isVisible
                ? "inset 0 1px 0 rgba(255,255,255,0.03)"
                : "none",
            opacity: isVisible || isHovered ? 1 : 0.55,
            transition:
              "background 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease, opacity 0.2s ease",
          }}
        >
          {/* Status dot with glow */}
          <span
            className={`status-dot ${status}`}
            style={{
              width: 8,
              height: 8,
              flexShrink: 0,
              opacity: isVisible ? 1 : 0.5,
              transition: "opacity 0.2s ease",
            }}
          />

          {/* Tab name */}
          <span
            style={{
              fontSize: "12.5px",
              fontWeight: isActive ? 600 : isVisible ? 500 : 400,
              color: textColor,
              whiteSpace: "nowrap",
              maxWidth: 130,
              overflow: "hidden",
              textOverflow: "ellipsis",
              letterSpacing: "0.01em",
              transition: "color 0.2s ease",
            }}
          >
            {name}
          </span>

          {/* Active indicator — glowing bar under active tab */}
          {isActive && (
            <motion.div
              layoutId="tab-active-indicator"
              style={{
                position: "absolute",
                bottom: 0,
                left: 6,
                right: 6,
                height: 3,
                borderRadius: "3px 3px 0 0",
                background:
                  "linear-gradient(90deg, rgba(108,140,255,0.5), #6c8cff, rgba(108,140,255,0.5))",
                boxShadow: "0 0 10px rgba(108,140,255,0.5), 0 0 2px rgba(108,140,255,0.8)",
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

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu &&
          createPortal(
            <motion.div
              initial={{ opacity: 0, scale: 0.92, y: 4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.92, y: 4 }}
              transition={{ duration: 0.15, ease: [0.34, 1.56, 0.64, 1] }}
              style={{
                position: "fixed",
                left: contextMenu.x,
                bottom: `calc(100vh - ${contextMenu.y}px)`,
                zIndex: 9999,
                minWidth: 170,
                padding: 8,
                display: "flex",
                flexDirection: "column",
                gap: 2,
                background: "var(--card-bg)",
                border: "1px solid var(--card-border)",
                borderRadius: 12,
                boxShadow:
                  "0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.04) inset",
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
                    color: item.danger
                      ? "var(--status-red)"
                      : "var(--text-primary)",
                    padding: "8px 14px",
                    borderRadius: 8,
                    cursor: "pointer",
                    fontSize: 13,
                    textAlign: "left",
                    fontWeight: item.danger ? 500 : 400,
                    transition: "background 0.12s ease, color 0.12s ease",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = item.danger
                      ? "rgba(248, 113, 113, 0.12)"
                      : "var(--bg-hover)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                  }}
                >
                  {item.label}
                </button>
              ))}
            </motion.div>,
            document.body
          )}
      </AnimatePresence>
    </>
  );
};

export default TabItem;
