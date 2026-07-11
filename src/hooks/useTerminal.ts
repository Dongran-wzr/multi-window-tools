import { useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useTerminalStore, TerminalInfo } from "../stores/terminalStore";

export interface CreateTerminalParams {
  shell?: string;
  cwd?: string;
}

export function useTerminal() {
  const { addTerminal, removeTerminal, updateTerminalStatus, updateTerminalName, getNextAvailableSlot } = useTerminalStore();
  const eventListenersRef = useRef<Map<string, () => void>>(new Map());

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

        const terminal: TerminalInfo = {
          id: result.terminal_id,
          name: `Terminal ${slot + 1}`,
          pid: result.pid,
          gridSlot: slot,
          status: "running",
          lastOutputTime: Date.now(),
          cols: 80,
          rows: 24,
          isMaximized: false,
        };

        addTerminal(terminal);

        // Listen for output events to update status
        setupOutputListener(result.terminal_id);

        return terminal;
      } catch (error) {
        console.error("Failed to create terminal:", error);
        return null;
      }
    },
    [addTerminal, getNextAvailableSlot]
  );

  const setupOutputListener = useCallback(
    (terminalId: string) => {
      // Listen for terminal output via Tauri events
      const unlistenPromise = import("@tauri-apps/api/event").then(
        ({ listen }) => {
          return listen<{ id: string }>(`terminal-output-${terminalId}`, () => {
            const store = useTerminalStore.getState();
            store.updateTerminalStatus(terminalId, "running");

            // Set up idle detection
            const timer = setTimeout(() => {
              const current = useTerminalStore.getState();
              const term = current.terminals.find((t) => t.id === terminalId);
              if (term && term.status === "running") {
                const elapsed = Date.now() - term.lastOutputTime;
                if (elapsed > 5000) {
                  current.updateTerminalStatus(terminalId, "idle");
                }
              }
            }, 5000);

            return () => clearTimeout(timer);
          });
        }
      );

      unlistenPromise.then((unlisten) => {
        eventListenersRef.current.set(terminalId, unlisten);
      });
    },
    []
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

        // Clean up event listener
        const unlisten = eventListenersRef.current.get(id);
        if (unlisten) {
          unlisten();
          eventListenersRef.current.delete(id);
        }

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
        setupOutputListener(result.terminal_id);
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
