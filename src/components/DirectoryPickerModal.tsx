import React, { useState, useEffect, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Folder, FolderOpen, Home, Monitor, FileText, Download, FolderSearch, Clock } from "lucide-react";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n/translations";
import { useTerminalStore } from "../stores/terminalStore";

interface CommonDirs {
  home: string;
  desktop: string;
  documents: string;
  downloads: string;
}

interface DirectoryPickerModalProps {
  isOpen: boolean;
  onSelect: (dir: string) => void;
  onClose: () => void;
}

const DirectoryPickerModal: React.FC<DirectoryPickerModalProps> = ({
  isOpen,
  onSelect,
  onClose,
}) => {
  const { t } = useI18n();
  const [commonDirs, setCommonDirs] = useState<CommonDirs | null>(null);
  const [selectedPath, setSelectedPath] = useState("");
  const [inputPath, setInputPath] = useState("");

  // Load common directories from Rust backend
  useEffect(() => {
    if (isOpen) {
      invoke<CommonDirs>("get_common_dirs")
        .then((dirs) => {
          setCommonDirs(dirs);
          if (!selectedPath && dirs.home) {
            setSelectedPath(dirs.home);
            setInputPath(dirs.home);
          }
        })
        .catch(console.error);
    }
  }, [isOpen]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen && commonDirs?.home) {
      setSelectedPath(commonDirs.home);
      setInputPath(commonDirs.home);
    }
  }, [isOpen, commonDirs?.home]);

  const handleQuickSelect = useCallback((path: string) => {
    setSelectedPath(path);
    setInputPath(path);
  }, []);

  const handleBrowse = useCallback(async () => {
    const dir = await open({
      directory: true,
      multiple: false,
      title: t("dialog.selectDir"),
    });
    if (dir) {
      setSelectedPath(dir as string);
      setInputPath(dir as string);
    }
  }, [t]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const value = e.target.value;
      setInputPath(value);
      setSelectedPath(value);
    },
    []
  );

  const handleConfirm = useCallback(() => {
    if (selectedPath.trim()) {
      onSelect(selectedPath.trim());
      onClose();
    }
  }, [selectedPath, onSelect, onClose]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") {
        handleConfirm();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [handleConfirm, onClose]
  );

  const quickDirs = commonDirs
    ? [
        { path: commonDirs.home, label: t("dialog.home"), icon: <Home size={16} /> },
        { path: commonDirs.desktop, label: t("dialog.desktop"), icon: <Monitor size={16} /> },
        { path: commonDirs.documents, label: t("dialog.documents"), icon: <FileText size={16} /> },
        { path: commonDirs.downloads, label: t("dialog.downloads"), icon: <Download size={16} /> },
      ]
    : [];

  // Recent directories (exclude the 4 common dirs to avoid duplicates)
  const recentDirectories = useTerminalStore((s) => s.recentDirectories);
  const recentDirs = useMemo(() => {
    if (!commonDirs || recentDirectories.length === 0) return [];
    const excludeSet = new Set(
      [commonDirs.home, commonDirs.desktop, commonDirs.documents, commonDirs.downloads]
        .map((p) => p.trim().replace(/\\/g, "/").replace(/[/\\]+$/, ""))
    );
    return recentDirectories
      .filter((d) => !excludeSet.has(d.path.replace(/\\/g, "/")))
      .slice(0, 4);
  }, [recentDirectories, commonDirs]);

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 150,
            }}
          />

          {/* Modal */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 160,
              width: "440px",
              maxWidth: "90vw",
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
                <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                  <FolderOpen size={20} style={{ color: "var(--accent)" }} />
                  <h2
                    style={{
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {t("dialog.selectDirTitle")}
                  </h2>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
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

              {/* Recent directories */}
              {recentDirs.length > 0 && (
                <div>
                  <h3
                    style={{
                      fontSize: "13px",
                      fontWeight: 500,
                      color: "var(--text-secondary)",
                      marginBottom: "12px",
                      display: "flex",
                      alignItems: "center",
                      gap: "6px",
                    }}
                  >
                    <Clock size={14} />
                    {t("dialog.recentDirs")}
                  </h3>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "repeat(2, 1fr)",
                      gap: "8px",
                    }}
                  >
                    {recentDirs.map((dir) => (
                      <motion.button
                        key={dir.path}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                        onClick={() => handleQuickSelect(dir.path)}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          padding: "14px 12px",
                          borderRadius: "10px",
                          border:
                            selectedPath === dir.path
                              ? "2px solid var(--accent)"
                              : "2px solid var(--card-border)",
                          background:
                            selectedPath === dir.path
                              ? "var(--accent-dim)"
                              : "var(--bg-tertiary)",
                          color:
                            selectedPath === dir.path
                              ? "var(--accent)"
                              : "var(--text-secondary)",
                          cursor: "pointer",
                          transition: "all var(--transition-fast)",
                        }}
                      >
                        <Folder size={16} />
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "flex-start",
                            gap: "2px",
                            overflow: "hidden",
                          }}
                        >
                          <span
                            style={{
                              fontSize: "11px",
                              fontWeight: 500,
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "140px",
                            }}
                          >
                            {dir.path.split("/").pop() || dir.path.split("\\").pop() || dir.path}
                          </span>
                          <span
                            style={{
                              fontSize: "10px",
                              color: "var(--text-muted)",
                              whiteSpace: "nowrap",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              maxWidth: "140px",
                              direction: "rtl",
                              textAlign: "left",
                            }}
                          >
                            {dir.path}
                          </span>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </div>
              )}

              {/* Quick select directories */}
              <div>
                <h3
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    marginBottom: "12px",
                  }}
                >
                  {t("dialog.quickSelect")}
                </h3>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(2, 1fr)",
                    gap: "8px",
                  }}
                >
                  {quickDirs.map((dir) => (
                    <motion.button
                      key={dir.path}
                      whileHover={{ scale: 1.03 }}
                      whileTap={{ scale: 0.97 }}
                      onClick={() => handleQuickSelect(dir.path)}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        padding: "14px 12px",
                        borderRadius: "10px",
                        border:
                          selectedPath === dir.path
                            ? "2px solid var(--accent)"
                            : "2px solid var(--card-border)",
                        background:
                          selectedPath === dir.path
                            ? "var(--accent-dim)"
                            : "var(--bg-tertiary)",
                        color:
                          selectedPath === dir.path
                            ? "var(--accent)"
                            : "var(--text-secondary)",
                        cursor: "pointer",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      {dir.icon}
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "flex-start",
                          gap: "2px",
                          overflow: "hidden",
                        }}
                      >
                        <span style={{ fontSize: "12px", fontWeight: 500 }}>
                          {dir.label}
                        </span>
                        <span
                          style={{
                            fontSize: "10px",
                            color: "var(--text-muted)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            maxWidth: "140px",
                            direction: "rtl",
                            textAlign: "left",
                          }}
                        >
                          {dir.path}
                        </span>
                      </div>
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

              {/* Custom path input */}
              <div>
                <h3
                  style={{
                    fontSize: "13px",
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    marginBottom: "10px",
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  }}
                >
                  <Folder size={14} />
                  {t("dialog.customPath")}
                </h3>
                <div style={{ display: "flex", gap: "8px" }}>
                  <input
                    type="text"
                    value={inputPath}
                    onChange={handleInputChange}
                    onKeyDown={handleKeyDown}
                    placeholder={t("dialog.pathPlaceholder")}
                    autoFocus
                    style={{
                      flex: 1,
                      padding: "10px 12px",
                      borderRadius: "8px",
                      border:
                        selectedPath === inputPath
                          ? "2px solid var(--accent)"
                          : "1px solid var(--card-border)",
                      background: "var(--bg-primary)",
                      color: "var(--text-primary)",
                      fontSize: "13px",
                      fontFamily: "inherit",
                      outline: "none",
                      transition: "border-color var(--transition-fast)",
                    }}
                    onFocus={(e) => {
                      e.currentTarget.style.borderColor = "var(--accent)";
                    }}
                    onBlur={(e) => {
                      e.currentTarget.style.borderColor =
                        "var(--card-border)";
                    }}
                  />
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={handleBrowse}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      padding: "10px 14px",
                      borderRadius: "8px",
                      border: "1px solid var(--card-border)",
                      background: "var(--bg-tertiary)",
                      color: "var(--text-primary)",
                      cursor: "pointer",
                      fontSize: "12px",
                      fontWeight: 500,
                      whiteSpace: "nowrap",
                    }}
                  >
                    <FolderSearch size={14} />
                    {t("dialog.browse")}
                  </motion.button>
                </div>
              </div>

              {/* Actions */}
              <div
                style={{
                  display: "flex",
                  gap: "8px",
                  justifyContent: "flex-end",
                }}
              >
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={onClose}
                  style={{
                    padding: "10px 20px",
                    borderRadius: "8px",
                    border: "1px solid var(--card-border)",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-secondary)",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                  }}
                >
                  {t("dialog.cancel")}
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={handleConfirm}
                  disabled={!selectedPath.trim()}
                  style={{
                    padding: "10px 24px",
                    borderRadius: "8px",
                    border: "none",
                    background: selectedPath.trim()
                      ? "linear-gradient(135deg, #6c8cff, #8b5cf6)"
                      : "var(--bg-tertiary)",
                    color: selectedPath.trim() ? "#fff" : "var(--text-muted)",
                    cursor: selectedPath.trim() ? "pointer" : "not-allowed",
                    fontSize: "13px",
                    fontWeight: 600,
                    transition: "all var(--transition-fast)",
                    boxShadow: selectedPath.trim()
                      ? "0 2px 8px rgba(108, 140, 255, 0.3)"
                      : "none",
                  }}
                >
                  {t("dialog.confirm")}
                </motion.button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default DirectoryPickerModal;
