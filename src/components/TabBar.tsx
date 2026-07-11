import React, { useRef, useEffect } from "react";
import { motion } from "framer-motion";
import { useTerminalStore } from "../stores/terminalStore";
import TabItem from "./TabItem";

const TabBar: React.FC = () => {
  const terminals = useTerminalStore((s) => s.terminals);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);
  const swapTerminals = useTerminalStore((s) => s.swapTerminals);
  const setTerminalMaximized = useTerminalStore((s) => s.setTerminalMaximized);
  const scrollRef = useRef<HTMLDivElement>(null);
  const dragSlotRef = useRef<number | null>(null);

  const handleSelect = (id: string) => {
    const terminal = terminals.find((t) => t.id === id);
    if (terminal?.gridSlot === -1) {
      // If minimized, restore to first available slot
      const occupiedSlots = new Set(
        terminals.filter((t) => t.gridSlot !== -1).map((t) => t.gridSlot)
      );
      let slot = -1;
      for (let i = 0; i < 9; i++) {
        if (!occupiedSlots.has(i)) {
          slot = i;
          break;
        }
      }
      if (slot !== -1) {
        useTerminalStore.getState().moveTerminalToSlot(id, slot);
      }
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
    (targetSlot: number) => (e: React.DragEvent) => {
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

  // Sort terminals by grid slot for tab order
  const sortedTerminals = [...terminals].sort((a, b) => a.gridSlot - b.gridSlot);

  return (
    <div
      className="tab-bar glass"
      style={{
        height: "var(--tab-height)",
        display: "flex",
        alignItems: "flex-end",
        flexShrink: 0,
        borderTop: "1px solid var(--glass-border)",
        padding: "0 8px",
        gap: "2px",
        overflowX: "auto",
        overflowY: "hidden",
        zIndex: 80,
      }}
      ref={scrollRef}
    >
      {sortedTerminals.map((terminal) => (
        <TabItem
          key={terminal.id}
          terminalId={terminal.id}
          name={terminal.name}
          status={terminal.status}
          isActive={terminal.id === activeTerminalId}
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
          No terminals open. Click + to create one.
        </div>
      )}
    </div>
  );
};

export default TabBar;
