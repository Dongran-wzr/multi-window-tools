import React, { useEffect, useCallback } from "react";
import TitleBar from "./components/TitleBar";
import TerminalGrid from "./components/TerminalGrid";
import TabBar from "./components/TabBar";
import AddButton from "./components/AddButton";
import SettingsModal from "./components/SettingsModal";
import { useTerminalStore, ThemeMode } from "./stores/terminalStore";
import { useTerminal } from "./hooks/useTerminal";
import "./styles/themes.css";
import "./App.css";

const App: React.FC = () => {
  const theme = useTerminalStore((s) => s.theme);
  const setResolvedTheme = useTerminalStore((s) => s.setResolvedTheme);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const terminals = useTerminalStore((s) => s.terminals);
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);
  const { createTerminal, closeTerminal } = useTerminal();

  // Theme resolution
  useEffect(() => {
    const applyTheme = (mode: ThemeMode) => {
      if (mode === "system") {
        const prefersDark = window.matchMedia(
          "(prefers-color-scheme: dark)"
        ).matches;
        const resolved = prefersDark ? "dark" : "light";
        setResolvedTheme(resolved);
        document.documentElement.setAttribute("data-theme", resolved);
      } else {
        setResolvedTheme(mode);
        document.documentElement.setAttribute("data-theme", mode);
      }
    };

    applyTheme(theme);

    if (theme === "system") {
      const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyTheme("system");
      mediaQuery.addEventListener("change", handler);
      return () => mediaQuery.removeEventListener("change", handler);
    }
  }, [theme, setResolvedTheme]);

  // Keyboard shortcuts
  const handleKeyDown = useCallback(
    async (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;

      if (mod && e.shiftKey && e.key === "T") {
        // Ctrl+Shift+T: New terminal
        e.preventDefault();
        await createTerminal();
      } else if (mod && e.shiftKey && e.key === "W") {
        // Ctrl+Shift+W: Close active terminal
        e.preventDefault();
        const active = useTerminalStore.getState().getActiveTerminal();
        if (active) {
          await closeTerminal(active.id);
        }
      } else if (mod && !e.shiftKey && e.key === "Tab") {
        // Ctrl+Tab: Next terminal
        e.preventDefault();
        const sorted = [...terminals].sort((a, b) => a.gridSlot - b.gridSlot);
        const currentIdx = sorted.findIndex(
          (t) => t.id === activeTerminalId
        );
        if (sorted.length > 0) {
          const nextIdx = (currentIdx + 1) % sorted.length;
          setActiveTerminal(sorted[nextIdx].id);
        }
      } else if (mod && e.shiftKey && e.key === "Tab") {
        // Ctrl+Shift+Tab: Previous terminal
        e.preventDefault();
        const sorted = [...terminals].sort((a, b) => a.gridSlot - b.gridSlot);
        const currentIdx = sorted.findIndex(
          (t) => t.id === activeTerminalId
        );
        if (sorted.length > 0) {
          const prevIdx =
            (currentIdx - 1 + sorted.length) % sorted.length;
          setActiveTerminal(sorted[prevIdx].id);
        }
      } else if (mod && e.key >= "1" && e.key <= "9") {
        // Ctrl+1~9: Jump to terminal
        e.preventDefault();
        const slot = parseInt(e.key) - 1;
        const terminal = terminals.find((t) => t.gridSlot === slot);
        if (terminal) {
          setActiveTerminal(terminal.id);
        }
      }
    },
    [createTerminal, closeTerminal, terminals, activeTerminalId, setActiveTerminal]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div
      className="app-container"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        width: "100vw",
        overflow: "hidden",
      }}
    >
      <TitleBar />
      <TerminalGrid />
      <TabBar />
      <AddButton />
      <SettingsModal />
    </div>
  );
};

export default App;
