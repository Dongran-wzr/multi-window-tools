import React, { useRef } from "react";
import { useTerminalStore, takeCapture } from "../stores/terminalStore";
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

    // Already visible → toggle back to minimized (no genie needed here).
    if (terminal.gridSlot !== -1) {
      useTerminalStore.getState().moveTerminalToSlot(id, -1);
      setActiveTerminal(id);
      return;
    }

    // Re-opening a minimized terminal: find its target slot.
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
    if (slot === -1) return; // grid full — nothing to do

    const store = useTerminalStore.getState();

    // Reverse genie needs the window's last capture + the tab's rect.
    const capture = takeCapture(id);
    const tabEl = document.querySelector(
      `[data-terminal-id="${id}"]`
    ) as HTMLElement | null;

    if (!capture || !tabEl) {
      // No texture to replay — restore instantly (existing behavior).
      store.moveTerminalToSlot(id, slot);
      setActiveTerminal(id);
      return;
    }

    const tabRect = tabEl.getBoundingClientRect();

    // Render the window hidden, then measure it and play tab → window.
    store.setReopeningId(id);
    store.moveTerminalToSlot(id, slot);
    setActiveTerminal(id);

    // Wait two frames so the restored window is laid out, then measure + animate.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        const winEl = document.querySelector(
          `[data-window-id="${id}"]`
        ) as HTMLElement | null;

        if (!winEl) {
          store.setReopeningId(null); // give up → reveal window
          return;
        }
        const winRect = winEl.getBoundingClientRect();

        store.setFlyAnimation({
          terminalId: id,
          terminalName: terminal.name,
          terminalStatus: terminal.status,
          startRect: {
            left: winRect.left,
            top: winRect.top,
            width: winRect.width,
            height: winRect.height,
          },
          endRect: {
            left: tabRect.left,
            top: tabRect.top,
            width: tabRect.width,
            height: tabRect.height,
          },
          removeAfter: false,
          direction: "out",
          captureCanvas: capture,
        });
      });
    });
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
