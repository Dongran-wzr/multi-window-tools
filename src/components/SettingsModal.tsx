import React, { useCallback, useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Monitor, Moon, Sun, Image, Trash2, Code, ChevronDown, ToggleLeft, ToggleRight, Layout } from "lucide-react";
import { useTerminalStore, ThemeMode, FontLanguage } from "../stores/terminalStore";
import { useI18n } from "../i18n/translations";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

const SettingsModal: React.FC = () => {
  const { t } = useI18n();
  const settingsOpen = useTerminalStore((s) => s.settingsOpen);
  const setSettingsOpen = useTerminalStore((s) => s.setSettingsOpen);
  const theme = useTerminalStore((s) => s.theme);
  const setTheme = useTerminalStore((s) => s.setTheme);

  const fontLanguage = useTerminalStore((s) => s.fontLanguage);
  const setFontLanguage = useTerminalStore((s) => s.setFontLanguage);

  // Advanced settings
  const backgroundImage = useTerminalStore((s) => s.backgroundImage);
  const setBackgroundImage = useTerminalStore((s) => s.setBackgroundImage);
  const backgroundCode = useTerminalStore((s) => s.backgroundCode);
  const setBackgroundCode = useTerminalStore((s) => s.setBackgroundCode);
  const backgroundEnabled = useTerminalStore((s) => s.backgroundEnabled);
  const setBackgroundEnabled = useTerminalStore((s) => s.setBackgroundEnabled);

  // Free layout
  const freeLayoutEnabled = useTerminalStore((s) => s.freeLayoutEnabled);
  const setFreeLayoutEnabled = useTerminalStore((s) => s.setFreeLayoutEnabled);

  // Connected resize
  const connectedResizeEnabled = useTerminalStore((s) => s.connectedResizeEnabled);
  const setConnectedResizeEnabled = useTerminalStore((s) => s.setConnectedResizeEnabled);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [imageLoading, setImageLoading] = useState(false);
  const codeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fontOptions: { value: FontLanguage; label: string }[] = [
    { value: "zh", label: t("settings.language.zh") },
    { value: "en", label: t("settings.language.en") },
  ];

  const themeOptions: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: "dark", label: t("settings.theme.dark"), icon: <Moon size={18} /> },
    { value: "light", label: t("settings.theme.light"), icon: <Sun size={18} /> },
    { value: "system", label: t("settings.theme.system"), icon: <Monitor size={18} /> },
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

  // ---- Background image handlers ----

  const handleChooseImage = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [
          {
            name: "Images",
            extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
          },
        ],
      });

      if (!selected) return; // user cancelled

      const filePath = selected;

      setImageLoading(true);

      // Invoke Rust command to copy image to config dir and save setting
      const savedPath: string = await invoke("save_background_image", {
        sourcePath: filePath,
      });

      // Read back the base64 data for preview + immediate application
      const result: { mime: string; base64: string } | null = await invoke(
        "get_background_image_base64"
      );

      if (result) {
        setBackgroundImage(result);
      }

      // Persist the enabled state
      await invoke("save_background_enabled", { enabled: true });
      setBackgroundEnabled(true);
    } catch (err) {
      console.error("Failed to set background image:", err);
    } finally {
      setImageLoading(false);
    }
  }, [setBackgroundImage, setBackgroundEnabled]);

  const handleRemoveImage = useCallback(async () => {
    try {
      await invoke("remove_background_image");
      setBackgroundImage(null);
    } catch (err) {
      console.error("Failed to remove background image:", err);
    }
  }, [setBackgroundImage]);

  // ---- Background code handler (debounced persist) ----

  const handleCodeChange = useCallback(
    (value: string) => {
      setBackgroundCode(value);

      // Debounce saving to backend
      if (codeDebounceRef.current) {
        clearTimeout(codeDebounceRef.current);
      }
      codeDebounceRef.current = setTimeout(async () => {
        try {
          await invoke("save_background_code", { code: value });
        } catch (err) {
          console.error("Failed to save background code:", err);
        }
      }, 500);
    },
    [setBackgroundCode]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (codeDebounceRef.current) {
        clearTimeout(codeDebounceRef.current);
      }
    };
  }, []);

  // ---- Enable/disable toggle ----

  const handleToggleEnabled = useCallback(async () => {
    const newVal = !backgroundEnabled;
    setBackgroundEnabled(newVal);
    try {
      await invoke("save_background_enabled", { enabled: newVal });
    } catch (err) {
      console.error("Failed to save background enabled:", err);
    }
  }, [backgroundEnabled, setBackgroundEnabled]);

  // Build data URL for preview
  const previewUrl = backgroundImage
    ? `data:${backgroundImage.mime};base64,${backgroundImage.base64}`
    : null;

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

          {/* Modal — outer div for centering, inner motion.div for animation */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 160,
              width: "440px",
              maxWidth: "90vw",
              maxHeight: "85vh",
              overflow: "auto",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              transition={{
                duration: 0.28,
                ease: [0.34, 1.56, 0.64, 1],
              }}
              className="glass card"
              style={{
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
                  {t("settings.title")}
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
                  {t("settings.theme")}
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

              {/* Font Language Section */}
              <div>
                <h3
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    marginBottom: "12px",
                  }}
                >
                  {t("settings.language")}
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "8px",
                  }}
                >
                  {fontOptions.map((option) => (
                    <motion.button
                      key={option.value}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setFontLanguage(option.value)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: "8px",
                        padding: "14px 8px",
                        borderRadius: "10px",
                        border:
                          fontLanguage === option.value
                            ? "2px solid var(--accent)"
                            : "2px solid var(--card-border)",
                        background:
                          fontLanguage === option.value
                            ? "var(--accent-dim)"
                            : "var(--bg-tertiary)",
                        color:
                          fontLanguage === option.value
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        cursor: "pointer",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      <span style={{ fontSize: "13px", fontWeight: 500 }}>
                        {option.label}
                      </span>
                    </motion.button>
                  ))}
                </div>
              </div>

              {/* Divider */}
              <div
                style={{
                  height: "1px",
                  background: "var(--card-border)",
                  margin: "0 -8px",
                }}
              />

              {/* ===== Advanced Section ===== */}
              <div>
                <motion.button
                  onClick={() => setAdvancedOpen(!advancedOpen)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                    width: "100%",
                    background: "transparent",
                    border: "none",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    padding: "4px 0",
                  }}
                >
                  <motion.span
                    animate={{ rotate: advancedOpen ? 90 : 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ display: "flex" }}
                  >
                    <ChevronDown size={16} />
                  </motion.span>
                  <span
                    style={{
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    {t("settings.advanced")}
                  </span>
                </motion.button>

                <AnimatePresence>
                  {advancedOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.25, ease: "easeInOut" }}
                      style={{ overflow: "hidden" }}
                    >
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "16px",
                          paddingTop: "16px",
                        }}
                      >
                        {/* Enable/Disable toggle */}
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "13px",
                              fontWeight: 500,
                              color: "var(--text-secondary)",
                            }}
                          >
                            {t("settings.advanced.background.enable")}
                          </span>
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={handleToggleEnabled}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: backgroundEnabled
                                ? "var(--accent)"
                                : "var(--text-muted)",
                              cursor: "pointer",
                              padding: 0,
                              display: "flex",
                            }}
                          >
                            {backgroundEnabled ? (
                              <ToggleRight size={28} />
                            ) : (
                              <ToggleLeft size={28} />
                            )}
                          </motion.button>
                        </div>

                        {/* Background image */}
                        <div>
                          <h4
                            style={{
                              fontSize: "12px",
                              fontWeight: 500,
                              color: "var(--text-secondary)",
                              marginBottom: "10px",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <Image size={14} />
                            {t("settings.advanced.background.image")}
                          </h4>

                          {/* Image preview */}
                          {previewUrl && (
                            <div
                              style={{
                                width: "100%",
                                height: "100px",
                                borderRadius: "8px",
                                overflow: "hidden",
                                marginBottom: "10px",
                                border: "1px solid var(--card-border)",
                                background:
                                  "repeating-conic-gradient(var(--bg-tertiary) 0% 25%, transparent 0% 50%) 50% / 16px 16px",
                              }}
                            >
                              <img
                                src={previewUrl}
                                alt="Background preview"
                                style={{
                                  width: "100%",
                                  height: "100%",
                                  objectFit: "cover",
                                }}
                              />
                            </div>
                          )}

                          <div
                            style={{
                              display: "flex",
                              gap: "8px",
                            }}
                          >
                            <motion.button
                              whileHover={{ scale: 1.03 }}
                              whileTap={{ scale: 0.97 }}
                              onClick={handleChooseImage}
                              disabled={imageLoading}
                              style={{
                                flex: 1,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                gap: "6px",
                                padding: "10px 12px",
                                borderRadius: "8px",
                                border: "1px solid var(--card-border)",
                                background: "var(--bg-tertiary)",
                                color: "var(--text-primary)",
                                cursor: imageLoading ? "wait" : "pointer",
                                fontSize: "12px",
                                fontWeight: 500,
                                transition: "all var(--transition-fast)",
                                opacity: imageLoading ? 0.6 : 1,
                              }}
                            >
                              <Image size={14} />
                              {imageLoading
                                ? "..."
                                : t("settings.advanced.background.image.choose")}
                            </motion.button>

                            {previewUrl && (
                              <motion.button
                                whileHover={{ scale: 1.03 }}
                                whileTap={{ scale: 0.97 }}
                                onClick={handleRemoveImage}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  justifyContent: "center",
                                  gap: "6px",
                                  padding: "10px 12px",
                                  borderRadius: "8px",
                                  border: "1px solid var(--card-border)",
                                  background: "var(--bg-tertiary)",
                                  color: "var(--status-red)",
                                  cursor: "pointer",
                                  fontSize: "12px",
                                  fontWeight: 500,
                                  transition: "all var(--transition-fast)",
                                }}
                              >
                                <Trash2 size={14} />
                                {t("settings.advanced.background.image.remove")}
                              </motion.button>
                            )}
                          </div>

                          <p
                            style={{
                              fontSize: "10px",
                              color: "var(--text-muted)",
                              marginTop: "6px",
                              lineHeight: 1.5,
                            }}
                          >
                            {t("settings.advanced.background.image.hint")}
                          </p>
                        </div>

                        {/* Custom background code */}
                        <div>
                          <h4
                            style={{
                              fontSize: "12px",
                              fontWeight: 500,
                              color: "var(--text-secondary)",
                              marginBottom: "10px",
                              display: "flex",
                              alignItems: "center",
                              gap: "6px",
                            }}
                          >
                            <Code size={14} />
                            {t("settings.advanced.background.code")}
                          </h4>

                          <textarea
                            value={backgroundCode}
                            onChange={(e) => handleCodeChange(e.target.value)}
                            placeholder={
                              '/* CSS example */\n.app-container {\n  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n}'
                            }
                            rows={6}
                            style={{
                              width: "100%",
                              padding: "12px",
                              borderRadius: "8px",
                              border: "1px solid var(--card-border)",
                              background: "var(--bg-primary)",
                              color: "var(--text-primary)",
                              fontFamily:
                                "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
                              fontSize: "12px",
                              lineHeight: 1.6,
                              resize: "vertical",
                              outline: "none",
                              transition: "border-color var(--transition-fast)",
                            }}
                            onFocus={(e) => {
                              e.currentTarget.style.borderColor =
                                "var(--accent)";
                            }}
                            onBlur={(e) => {
                              e.currentTarget.style.borderColor =
                                "var(--card-border)";
                            }}
                          />

                          <p
                            style={{
                              fontSize: "10px",
                              color: "var(--text-muted)",
                              marginTop: "6px",
                              lineHeight: 1.5,
                            }}
                          >
                            {t("settings.advanced.background.code.hint")}
                          </p>
                        </div>

                        {/* Divider */}
                        <div
                          style={{
                            height: "1px",
                            background: "var(--card-border)",
                          }}
                        />

                        {/* Free Window Layout */}
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <Layout size={15} style={{ color: "var(--text-secondary)" }} />
                              <div>
                                <span
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {t("settings.advanced.freeLayout")}
                                </span>
                              </div>
                            </div>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => {
                                const next = !freeLayoutEnabled;
                                setFreeLayoutEnabled(next);
                                // Turning off free layout also turns off connected resize
                                if (!next && connectedResizeEnabled) {
                                  setConnectedResizeEnabled(false);
                                }
                              }}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: freeLayoutEnabled
                                  ? "var(--accent)"
                                  : "var(--text-muted)",
                                cursor: "pointer",
                                padding: 0,
                                display: "flex",
                              }}
                            >
                              {freeLayoutEnabled ? (
                                <ToggleRight size={28} />
                              ) : (
                                <ToggleLeft size={28} />
                              )}
                            </motion.button>
                          </div>
                          <p
                            style={{
                              fontSize: "10px",
                              color: "var(--text-muted)",
                              marginTop: "8px",
                              lineHeight: 1.5,
                            }}
                          >
                            {t("settings.advanced.freeLayout.desc")}
                          </p>

                          {/* Preview */}
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "12px",
                              borderRadius: "8px",
                              background: "var(--bg-primary)",
                              border: "1px solid var(--card-border)",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 500,
                                color: "var(--text-muted)",
                                marginBottom: "8px",
                                display: "block",
                              }}
                            >
                              {t("settings.advanced.freeLayout.preview")}
                            </span>
                            {/* Mini grid preview */}
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(3, 1fr)",
                                gridTemplateRows: "repeat(2, 1fr)",
                                gap: "4px",
                                height: "64px",
                                position: "relative",
                              }}
                            >
                              {/* Standard grid cells */}
                              <div
                                style={{
                                  borderRadius: "3px",
                                  background: "var(--accent-dim)",
                                  border: "1px solid var(--accent)",
                                  opacity: freeLayoutEnabled ? 0.4 : 1,
                                  transition: "all 0.3s ease",
                                }}
                              />
                              <div
                                style={{
                                  borderRadius: "3px",
                                  background: "var(--accent-dim)",
                                  border: "1px solid var(--accent)",
                                  opacity: freeLayoutEnabled ? 0.4 : 1,
                                  transition: "all 0.3s ease",
                                }}
                              />
                              <div
                                style={{
                                  borderRadius: "3px",
                                  background: "var(--accent-dim)",
                                  border: "1px solid var(--accent)",
                                  opacity: freeLayoutEnabled ? 0.4 : 1,
                                  transition: "all 0.3s ease",
                                }}
                              />
                              <div
                                style={{
                                  borderRadius: "3px",
                                  background: "var(--accent-dim)",
                                  border: "1px solid var(--accent)",
                                  opacity: freeLayoutEnabled ? 0.4 : 1,
                                  transition: "all 0.3s ease",
                                }}
                              />

                              {/* Free-layout overlay window (only visible when enabled) */}
                              {freeLayoutEnabled && (
                                <motion.div
                                  initial={{ opacity: 0, scale: 0.8 }}
                                  animate={{ opacity: 1, scale: 1 }}
                                  transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
                                  style={{
                                    position: "absolute",
                                    left: "45%",
                                    top: "20%",
                                    width: "50%",
                                    height: "70%",
                                    borderRadius: "4px",
                                    background: "var(--accent)",
                                    opacity: 0.7,
                                    zIndex: 2,
                                    boxShadow: "0 2px 8px rgba(108,140,255,0.4)",
                                  }}
                                >
                                  {/* Resize handles on the preview */}
                                  <div
                                    style={{
                                      position: "absolute",
                                      right: 0,
                                      bottom: 0,
                                      width: "8px",
                                      height: "8px",
                                      background: "#fff",
                                      borderRadius: "0 0 3px 0",
                                      opacity: 0.6,
                                    }}
                                  />
                                </motion.div>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Divider */}
                        <div
                          style={{
                            height: "1px",
                            background: "var(--card-border)",
                          }}
                        />

                        {/* Connected Window Resize */}
                        <div>
                          <div
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                            }}
                          >
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                              <svg
                                width="15"
                                height="15"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                style={{ color: "var(--text-secondary)" }}
                              >
                                <rect x="2" y="3" width="9" height="8" rx="1" />
                                <rect x="13" y="3" width="9" height="8" rx="1" />
                                <rect x="2" y="13" width="9" height="9" rx="1" />
                                <rect x="13" y="13" width="9" height="9" rx="1" />
                              </svg>
                              <div>
                                <span
                                  style={{
                                    fontSize: "13px",
                                    fontWeight: 500,
                                    color: "var(--text-primary)",
                                  }}
                                >
                                  {t("settings.advanced.connectedResize")}
                                </span>
                              </div>
                            </div>
                            <motion.button
                              whileHover={{ scale: 1.05 }}
                              whileTap={{ scale: 0.95 }}
                              onClick={() => {
                                const next = !connectedResizeEnabled;
                                setConnectedResizeEnabled(next);
                                // Connected resize requires free layout to be enabled
                                if (next && !freeLayoutEnabled) {
                                  setFreeLayoutEnabled(true);
                                }
                              }}
                              style={{
                                background: "transparent",
                                border: "none",
                                color: connectedResizeEnabled
                                  ? "var(--accent)"
                                  : "var(--text-muted)",
                                cursor: "pointer",
                                padding: 0,
                                display: "flex",
                              }}
                            >
                              {connectedResizeEnabled ? (
                                <ToggleRight size={28} />
                              ) : (
                                <ToggleLeft size={28} />
                              )}
                            </motion.button>
                          </div>
                          <p
                            style={{
                              fontSize: "10px",
                              color: "var(--text-muted)",
                              marginTop: "8px",
                              lineHeight: 1.5,
                            }}
                          >
                            {t("settings.advanced.connectedResize.desc")}
                          </p>

                          {/* Preview */}
                          <div
                            style={{
                              marginTop: "12px",
                              padding: "12px",
                              borderRadius: "8px",
                              background: "var(--bg-primary)",
                              border: "1px solid var(--card-border)",
                            }}
                          >
                            <span
                              style={{
                                fontSize: "10px",
                                fontWeight: 500,
                                color: "var(--text-muted)",
                                marginBottom: "8px",
                                display: "block",
                              }}
                            >
                              {t("settings.advanced.freeLayout.preview")}
                            </span>
                            {/* Mini connected-resize preview */}
                            <div
                              style={{
                                display: "grid",
                                gridTemplateColumns: "repeat(2, 1fr)",
                                gridTemplateRows: "repeat(2, 1fr)",
                                gap: "3px",
                                height: "64px",
                                position: "relative",
                              }}
                            >
                              {[0, 1, 2, 3].map((i) => (
                                <div
                                  key={i}
                                  style={{
                                    borderRadius: "3px",
                                    background: connectedResizeEnabled
                                      ? "var(--accent-dim)"
                                      : "var(--bg-tertiary)",
                                    border: connectedResizeEnabled
                                      ? "1px solid var(--accent)"
                                      : "1px solid var(--card-border)",
                                    transition: "all 0.3s ease",
                                    position: "relative",
                                  }}
                                >
                                  {/* Show connection markers between adjacent cells */}
                                  {connectedResizeEnabled && i === 0 && (
                                    <>
                                      <div
                                        style={{
                                          position: "absolute",
                                          right: -2,
                                          top: "25%",
                                          height: "50%",
                                          width: "3px",
                                          background: "var(--accent)",
                                          borderRadius: "1px",
                                          opacity: 0.7,
                                        }}
                                      />
                                      <div
                                        style={{
                                          position: "absolute",
                                          bottom: -2,
                                          left: "25%",
                                          width: "50%",
                                          height: "3px",
                                          background: "var(--accent)",
                                          borderRadius: "1px",
                                          opacity: 0.7,
                                        }}
                                      />
                                    </>
                                  )}
                                  {connectedResizeEnabled && i === 1 && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        bottom: -2,
                                        left: "25%",
                                        width: "50%",
                                        height: "3px",
                                        background: "var(--accent)",
                                        borderRadius: "1px",
                                        opacity: 0.7,
                                      }}
                                    />
                                  )}
                                  {connectedResizeEnabled && i === 2 && (
                                    <div
                                      style={{
                                        position: "absolute",
                                        right: -2,
                                        top: "25%",
                                        height: "50%",
                                        width: "3px",
                                        background: "var(--accent)",
                                        borderRadius: "1px",
                                        opacity: 0.7,
                                      }}
                                    />
                                  )}
                                </div>
                              ))}
                              {/* Drag indicator */}
                              {connectedResizeEnabled && (
                                <motion.div
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  transition={{ duration: 0.3 }}
                                  style={{
                                    position: "absolute",
                                    left: "50%",
                                    top: 0,
                                    bottom: 0,
                                    width: "4px",
                                    background: "var(--accent)",
                                    borderRadius: "2px",
                                    opacity: 0.8,
                                    transform: "translateX(-50%)",
                                    zIndex: 2,
                                  }}
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
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
                  <strong>{t("settings.shortcuts.title")}:</strong>{" "}
                  {t("settings.shortcuts.content")}
                </p>
                <p style={{ marginTop: "4px" }}>{t("settings.hint")}</p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
