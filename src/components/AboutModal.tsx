import React, { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Info } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { useTerminalStore } from "../stores/terminalStore";
import { useI18n } from "../i18n/translations";

const AboutModal: React.FC = () => {
  const { t } = useI18n();
  const aboutOpen = useTerminalStore((s) => s.aboutOpen);
  const setAboutOpen = useTerminalStore((s) => s.setAboutOpen);
  const [version, setVersion] = useState<string>("");
  const [versionError, setVersionError] = useState(false);

  useEffect(() => {
    if (aboutOpen) {
      invoke<string>("get_app_version")
        .then((v) => {
          setVersion(v);
          setVersionError(false);
        })
        .catch(() => {
          setVersionError(true);
        });
    }
  }, [aboutOpen]);

  return (
    <AnimatePresence>
      {aboutOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setAboutOpen(false)}
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
              width: "380px",
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
                  <Info size={20} style={{ color: "var(--accent)" }} />
                  <h2
                    style={{
                      fontSize: "16px",
                      fontWeight: 600,
                      color: "var(--text-primary)",
                    }}
                  >
                    {t("about.title")}
                  </h2>
                </div>
                <motion.button
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setAboutOpen(false)}
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

              {/* Content */}
              <div
                style={{
                  padding: "20px",
                  borderRadius: "8px",
                  background: "var(--bg-tertiary)",
                  textAlign: "center",
                  fontSize: "14px",
                  color: "var(--text-primary)",
                  lineHeight: 1.8,
                  fontWeight: 500,
                  letterSpacing: "0.02em",
                }}
              >
                <p style={{ marginBottom: "8px" }}>
                  <span style={{ color: "var(--text-muted)", fontSize: "13px" }}>
                    {t("about.version")}
                  </span>
                  {" "}
                  <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                    {versionError
                      ? "--"
                      : version || "..."}
                  </span>
                </p>
                <p>
                  <a
                    href="https://github.com/Dongran-wzr"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--accent)",
                      textDecoration: "none",
                      fontSize: "13px",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.textDecoration = "underline";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.textDecoration = "none";
                    }}
                  >
                    https://github.com/Dongran-wzr
                  </a>
                </p>
                <p>Created By Dongran</p>
                <p style={{ color: "var(--accent)", marginTop: "4px" }}>
                  -- Three Mouse S・J・W Team --
                </p>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default AboutModal;
