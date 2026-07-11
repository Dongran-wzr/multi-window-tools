import { useMemo } from "react";
import { useTerminalStore } from "../stores/terminalStore";

export interface GridCell {
  slot: number;
  row: number;
  col: number;
  terminalId: string | null;
}

export function useGridLayout() {
  const terminals = useTerminalStore((s) => s.terminals);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);

  const grid = useMemo(() => {
    const cells: GridCell[] = [];

    // Check if any terminal is maximized
    const maximizedTerminal = terminals.find((t) => t.isMaximized);

    for (let slot = 0; slot < 9; slot++) {
      const terminal = terminals.find((t) => t.gridSlot === slot);
      cells.push({
        slot,
        row: Math.floor(slot / 3),
        col: slot % 3,
        terminalId: terminal ? terminal.id : null,
      });
    }

    // If a terminal is maximized, only show that one
    const visibleCells = maximizedTerminal
      ? cells.filter((c) => c.terminalId === maximizedTerminal.id)
      : cells.filter((c) => c.terminalId !== null);

    // Calculate grid dimensions
    const occupiedSlots = new Set(terminals.map((t) => t.gridSlot));
    let maxRow = 0;
    let maxCol = 0;

    terminals.forEach((t) => {
      if (!t.isMaximized || t.id === maximizedTerminal?.id) {
        const row = Math.floor(t.gridSlot / 3);
        const col = t.gridSlot % 3;
        if (row > maxRow) maxRow = row;
        if (col > maxCol) maxCol = col;
      }
    });

    return {
      cells: visibleCells,
      allCells: cells,
      gridCols: maximizedTerminal ? 1 : Math.max(1, maxCol + 1),
      gridRows: maximizedTerminal ? 1 : Math.max(1, maxRow + 1),
      isMaximized: !!maximizedTerminal,
      maximizedTerminalId: maximizedTerminal?.id || null,
    };
  }, [terminals]);

  return grid;
}

export function getSlotPosition(slot: number): { row: number; col: number } {
  return {
    row: Math.floor(slot / 3),
    col: slot % 3,
  };
}
