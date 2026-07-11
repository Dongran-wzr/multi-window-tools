import React, { useRef } from "react";
import { useTerminalStore } from "../stores/terminalStore";
import TabItem from "./TabItem";
import { useI18n } from "../i18n/translations";

const TabBar: React.FC = () => {
  const terminals = useTerminalStore((s) => s.terminals);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);
  const swapTerminals = useTerminalStore((s) => s.swapTerminals);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragSlotRef = useRef<number | null>(null);

  const handleSelect = (id: string) => {
    const terminal = terminals.find((t) => t.id === id);
    if (!terminal) return;

    if (terminal.gridSlot === -1) {
      const occupiedSlots = new Set(
        terminals.filter((t) => t.gridSlot !== -1).map((t) => t.gridSlot)
      );
      for (let i = 0; i < 9; i++) {
        if (!occupiedSlots.has(i)) {
          useTerminalStore.getState().moveTerminalToSlot(id, i);
          break;
        }
      }
    } else {
      useTerminalStore.getState().moveTerminalToSlot(id, -1);
    }

    setActiveTerminal(id);
  };

  const handleDragStart =
    (slot: number) => (e: React.DragEvent) => {
      dragSlotRef.current = slot;
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", String(slot));
    };

  const handleDragOver =
    (_targetSlot: number) => (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    };

  const handleDrop =
    (targetSlot: number) => (e: React.DragEvent) => {
      e.preventDefault();
      const sourceSlot = dragSlotRef.current;
      if (sourceSlot !== null && sourceSlot !== targetSlot) {
        swapTerminals(sourceSlot, targetSlot);
      }
      dragSlotRef.current = null;
    };

  const { t } = useI18n();

  const sortedTerminals = [...terminals].sort(
    (a, b) => a.gridSlot - b.gridSlot
  );

  return (
    <div
      className="tab-bar"
      ref={scrollRef}
      style={{
        height: "var(--tab-height)",
        display: "flex",
        alignItems: "flex-end",
        flexShrink: 0,
        padding: "0 10px",
        gap: "3px",
        overflowX: "auto",
        overflowY: "hidden",
        zIndex: 80,
        background: "var(--glass-bg)",
        backdropFilter: "blur(20px)",
        WebkitBackdropFilter: "blur(20px)",
        borderTop: "1px solid var(--glass-border)",
        boxShadow: "inset 0 1px 0 rgba(108, 140, 255, 0.06)",
      }}
    >
      {sortedTerminals.map((terminal) => (
        <TabItem
          key={terminal.id}
          terminalId={terminal.id}
          name={terminal.name}
          status={terminal.status}
          isActive={terminal.id === activeTerminalId}
          isVisible={terminal.gridSlot !== -1}
          onSelect={() => handleSelect(terminal.id)}
          onTabDragStart={handleDragStart(terminal.gridSlot)}
          onTabDragOver={handleDragOver(terminal.gridSlot)}
          onTabDrop={handleDrop(terminal.gridSlot)}
        />
      ))}

      {terminals.length === 0 && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            width: "100%",
            height: "100%",
            color: "var(--text-muted)",
            fontSize: "12px",
          }}
        >
          {t("tabbar.empty")}
        </div>
      )}
    </div>
  );
};

export default TabBar;
