import { useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTerminalStore, TerminalInfo } from "../stores/terminalStore";

export interface CreateTerminalParams {
  shell?: string;
  cwd?: string;
}

export function useTerminal() {
  const { addTerminal, removeTerminal, updateTerminalStatus, updateTerminalName, getNextAvailableSlot } = useTerminalStore();

  const createTerminal = useCallback(
    async (params?: CreateTerminalParams): Promise<TerminalInfo | null> => {
      const slot = getNextAvailableSlot();
      if (slot === -1) return null;

      try {
        const result = await invoke<{ terminal_id: string; pid: number }>(
          "create_terminal",
          {
            shell: params?.shell || null,
            cwd: params?.cwd || null,
          }
        );

        // Find the smallest unused terminal number across ALL terminals
        // (including minimized/hidden ones) to avoid name collisions.
        const existingNumbers = new Set(
          useTerminalStore.getState().terminals
            .map((t) => {
              const match = t.name.match(/^Terminal (\d+)$/);
              return match ? parseInt(match[1], 10) : null;
            })
            .filter((n): n is number => n !== null)
        );
        let terminalNum = 1;
        while (existingNumbers.has(terminalNum)) {
          terminalNum++;
        }

        const terminal: TerminalInfo = {
          id: result.terminal_id,
          name: `Terminal ${terminalNum}`,
          pid: result.pid,
          gridSlot: slot,
          status: "running",
          lastOutputTime: Date.now(),
          cols: 80,
          rows: 24,
          isMaximized: false,
        };

        addTerminal(terminal);

        return terminal;
      } catch (error) {
        console.error("Failed to create terminal:", error);
        return null;
      }
    },
    [addTerminal, getNextAvailableSlot]
  );

  const writeToTerminal = useCallback(async (id: string, data: string) => {
    try {
      await invoke("write_to_terminal", { id, data });
      const store = useTerminalStore.getState();
      store.updateTerminalStatus(id, "running");
    } catch (error) {
      console.error("Failed to write to terminal:", error);
    }
  }, []);

  const resizeTerminal = useCallback(
    async (id: string, cols: number, rows: number) => {
      try {
        await invoke("resize_terminal", { id, cols, rows });
      } catch (error) {
        console.error("Failed to resize terminal:", error);
      }
    },
    []
  );

  const closeTerminal = useCallback(
    async (id: string) => {
      try {
        await invoke("close_terminal", { id });

        removeTerminal(id);
      } catch (error) {
        console.error("Failed to close terminal:", error);
      }
    },
    [removeTerminal]
  );

  const renameTerminal = useCallback(
    (id: string, name: string) => {
      updateTerminalName(id, name);
    },
    [updateTerminalName]
  );

  const restartTerminal = useCallback(
    async (id: string) => {
      const store = useTerminalStore.getState();
      const terminal = store.terminals.find((t) => t.id === id);
      if (!terminal) return;

      // Close existing
      await closeTerminal(id);

      // Recreate in same slot
      const slot = terminal.gridSlot;
      try {
        const result = await invoke<{ terminal_id: string; pid: number }>(
          "create_terminal",
          { shell: null, cwd: null }
        );

        const newTerminal: TerminalInfo = {
          id: result.terminal_id,
          name: terminal.name,
          pid: result.pid,
          gridSlot: slot,
          status: "running",
          lastOutputTime: Date.now(),
          cols: terminal.cols,
          rows: terminal.rows,
          isMaximized: false,
        };

        addTerminal(newTerminal);
      } catch (error) {
        console.error("Failed to restart terminal:", error);
      }
    },
    [closeTerminal, addTerminal]
  );

  return {
    createTerminal,
    writeToTerminal,
    resizeTerminal,
    closeTerminal,
    renameTerminal,
    restartTerminal,
  };
}
