import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Monitor, Moon, Sun } from "lucide-react";
import { useTerminalStore, ThemeMode } from "../stores/terminalStore";

const SettingsModal: React.FC = () => {
  const settingsOpen = useTerminalStore((s) => s.settingsOpen);
  const setSettingsOpen = useTerminalStore((s) => s.setSettingsOpen);
  const theme = useTerminalStore((s) => s.theme);
  const setTheme = useTerminalStore((s) => s.setTheme);

  const themeOptions: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: "dark", label: "Dark", icon: <Moon size={18} /> },
    { value: "light", label: "Light", icon: <Sun size={18} /> },
    { value: "system", label: "System", icon: <Monitor size={18} /> },
  ];

  const handleThemeChange = (mode: ThemeMode) => {
    setTheme(mode);
    if (mode !== "system") {
      useTerminalStore.getState().setResolvedTheme(mode);
      document.documentElement.setAttribute("data-theme", mode);
    } else {
      const prefersDark = window.matchMedia(
        "(prefers-color-scheme: dark)"
      ).matches;
      const resolved = prefersDark ? "dark" : "light";
      useTerminalStore.getState().setResolvedTheme(resolved);
      document.documentElement.setAttribute("data-theme", resolved);
    }
  };

  return (
    <AnimatePresence>
      {settingsOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setSettingsOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 150,
            }}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{
              duration: 0.28,
              ease: [0.34, 1.56, 0.64, 1],
            }}
            className="glass card"
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 160,
              width: "400px",
              maxWidth: "90vw",
              padding: "24px",
              display: "flex",
              flexDirection: "column",
              gap: "20px",
            }}
          >
            {/* Header */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <h2
                style={{
                  fontSize: "16px",
                  fontWeight: 600,
                  color: "var(--text-primary)",
                }}
              >
                Settings
              </h2>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setSettingsOpen(false)}
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  padding: "4px",
                  borderRadius: "6px",
                  display: "flex",
                }}
              >
                <X size={18} />
              </motion.button>
            </div>

            {/* Theme Section */}
            <div>
              <h3
                style={{
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--text-secondary)",
                  marginBottom: "12px",
                }}
              >
                Theme
              </h3>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(3, 1fr)",
                  gap: "8px",
                }}
              >
                {themeOptions.map((option) => (
                  <motion.button
                    key={option.value}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                    onClick={() => handleThemeChange(option.value)}
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      gap: "8px",
                      padding: "14px 8px",
                      borderRadius: "10px",
                      border:
                        theme === option.value
                          ? "2px solid var(--accent)"
                          : "2px solid var(--card-border)",
                      background:
                        theme === option.value
                          ? "var(--accent-dim)"
                          : "var(--bg-tertiary)",
                      color:
                        theme === option.value
                          ? "var(--accent)"
                          : "var(--text-secondary)",
                      cursor: "pointer",
                      transition: "all var(--transition-fast)",
                    }}
                  >
                    {option.icon}
                    <span style={{ fontSize: "12px", fontWeight: 500 }}>
                      {option.label}
                    </span>
                  </motion.button>
                ))}
              </div>
            </div>

            {/* Info */}
            <div
              style={{
                padding: "12px",
                borderRadius: "8px",
                background: "var(--bg-tertiary)",
                fontSize: "11px",
                color: "var(--text-muted)",
                lineHeight: 1.6,
              }}
            >
              <p>
                <strong>Shortcuts:</strong> Ctrl+Shift+T New Terminal ·
                Ctrl+Shift+W Close · Ctrl+Tab Next · Ctrl+1~9 Jump
              </p>
              <p style={{ marginTop: "4px" }}>
                Double-click a terminal title to maximize/restore. Drag tabs to
                rearrange.
              </p>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
