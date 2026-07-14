import React, { useEffect, useCallback, useRef } from "react";
import TitleBar from "./components/TitleBar";
import TerminalGrid from "./components/TerminalGrid";
import TabBar from "./components/TabBar";
import AddButton from "./components/AddButton";
import SettingsModal from "./components/SettingsModal";
import AboutModal from "./components/AboutModal";
import SuckOverlay from "./components/SuckOverlay";
import { useTerminalStore, ThemeMode } from "./stores/terminalStore";
import { useTerminal } from "./hooks/useTerminal";
import { invoke } from "@tauri-apps/api/core";
import "./styles/themes.css";
import "./App.css";

const App: React.FC = () => {
  const theme = useTerminalStore((s) => s.theme);
  const fontLanguage = useTerminalStore((s) => s.fontLanguage);
  const setResolvedTheme = useTerminalStore((s) => s.setResolvedTheme);
  const activeTerminalId = useTerminalStore((s) => s.activeTerminalId);
  const terminals = useTerminalStore((s) => s.terminals);
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);

  // Advanced settings
  const setBackgroundImage = useTerminalStore((s) => s.setBackgroundImage);
  const setBackgroundCode = useTerminalStore((s) => s.setBackgroundCode);
  const setBackgroundEnabled = useTerminalStore((s) => s.setBackgroundEnabled);
  const backgroundImage = useTerminalStore((s) => s.backgroundImage);
  const backgroundCode = useTerminalStore((s) => s.backgroundCode);
  const backgroundEnabled = useTerminalStore((s) => s.backgroundEnabled);

  const { createTerminal, closeTerminal } = useTerminal();

  // Ref for injected custom style element
  const customStyleRef = useRef<HTMLStyleElement | null>(null);

  // ---- Load advanced settings from backend on startup ----
  useEffect(() => {
    const loadAdvancedSettings = async () => {
      try {
        const settings: {
          background_image: { mime: string; base64: string } | null;
          background_code: string;
          background_enabled: boolean;
        } = await invoke("get_advanced_settings");

        if (settings.background_image) {
          setBackgroundImage({
            mime: settings.background_image.mime,
            base64: settings.background_image.base64,
          });
        }
        if (settings.background_code) {
          setBackgroundCode(settings.background_code);
        }
        if (typeof settings.background_enabled === "boolean") {
          setBackgroundEnabled(settings.background_enabled);
        }
      } catch (err) {
        console.error("Failed to load advanced settings:", err);
        // Non-fatal: app works fine without advanced settings
      }
    };

    loadAdvancedSettings();
  }, []); // only on mount

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

  // Apply font language to UI
  useEffect(() => {
    document.documentElement.setAttribute("data-font", fontLanguage);
  }, [fontLanguage]);

  // ---- Apply custom background CSS ----
  useEffect(() => {
    // Remove previous custom style if any
    if (customStyleRef.current) {
      customStyleRef.current.remove();
      customStyleRef.current = null;
    }

    if (!backgroundEnabled) return;

    // Inject custom CSS code as a style element
    if (backgroundCode && backgroundCode.trim()) {
      const styleEl = document.createElement("style");
      styleEl.setAttribute("id", "custom-background-code");
      styleEl.textContent = backgroundCode;
      document.head.appendChild(styleEl);
      customStyleRef.current = styleEl;
    }

    return () => {
      if (customStyleRef.current) {
        customStyleRef.current.remove();
        customStyleRef.current = null;
      }
    };
  }, [backgroundCode, backgroundEnabled]);

  // Update app-container background style based on state
  const appContainerStyle: React.CSSProperties = {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    width: "100vw",
    overflow: "hidden",
  };

  // Apply background image as inline style (so it takes precedence over CSS variables)
  if (backgroundEnabled && backgroundImage) {
    const dataUrl = `data:${backgroundImage.mime};base64,${backgroundImage.base64}`;
    appContainerStyle.backgroundImage = `url(${dataUrl})`;
    appContainerStyle.backgroundSize = "cover";
    appContainerStyle.backgroundPosition = "center";
    appContainerStyle.backgroundRepeat = "no-repeat";
    appContainerStyle.backgroundAttachment = "fixed";
  }

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
        const currentIdx = sorted.findIndex((t) => t.id === activeTerminalId);
        if (sorted.length > 0) {
          const nextIdx = (currentIdx + 1) % sorted.length;
          setActiveTerminal(sorted[nextIdx].id);
        }
      } else if (mod && e.shiftKey && e.key === "Tab") {
        // Ctrl+Shift+Tab: Previous terminal
        e.preventDefault();
        const sorted = [...terminals].sort((a, b) => a.gridSlot - b.gridSlot);
        const currentIdx = sorted.findIndex((t) => t.id === activeTerminalId);
        if (sorted.length > 0) {
          const prevIdx = (currentIdx - 1 + sorted.length) % sorted.length;
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
    [
      createTerminal,
      closeTerminal,
      terminals,
      activeTerminalId,
      setActiveTerminal,
    ]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return (
    <div className="app-container" style={appContainerStyle}>
      <TitleBar />
      <TerminalGrid />
      <TabBar />
      <AddButton />
      <SettingsModal />
      <AboutModal />
      <SuckOverlay />
    </div>
  );
};

export default App;
