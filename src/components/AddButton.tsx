import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, RotateCcw } from "lucide-react";
import { useTerminalStore } from "../stores/terminalStore";
import { useTerminal } from "../hooks/useTerminal";
import { useI18n } from "../i18n/translations";
import DirectoryPickerModal from "./DirectoryPickerModal";

const AddButton: React.FC = () => {
  const isFull = useTerminalStore((s) => {
    const visible = s.terminals.filter((t) => t.gridSlot !== -1);
    return visible.length >= 9;
  });
  const freeLayoutEnabled = useTerminalStore((s) => s.freeLayoutEnabled);
  const resetAllBounds = useTerminalStore((s) => s.resetAllBounds);
  const hasCustomBounds = useTerminalStore((s) =>
    s.terminals.some((t) => !!t.customBounds)
  );
  const { createTerminal } = useTerminal();
  const { t } = useI18n();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleClick = () => {
    if (isFull) return;
    setDialogOpen(true);
  };

  const handleReset = () => {
    resetAllBounds();
  };

  const handleDirSelect = useCallback(
    async (dir: string) => {
      setDialogOpen(false);
      await createTerminal({ cwd: dir });
    },
    [createTerminal]
  );

  const handleDialogClose = useCallback(() => {
    setDialogOpen(false);
  }, []);

  return (
    <>
      {/* Reset button — shown above the add button when free layout is enabled */}
      <AnimatePresence>
        {freeLayoutEnabled && hasCustomBounds && (
          <motion.button
            className="add-button"
            onClick={handleReset}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0, opacity: 0 }}
            transition={{
              type: "spring",
              stiffness: 400,
              damping: 20,
            }}
            title={t("settings.advanced.freeLayout.reset")}
            style={{
              position: "fixed",
              bottom: "116px",
              right: "18px",
              width: "40px",
              height: "40px",
              borderRadius: "50%",
              border: "none",
              background: "linear-gradient(135deg, #6b7280, #4b5563)",
              color: "#fff",
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 90,
              boxShadow: "0 3px 12px rgba(107, 114, 128, 0.35)",
            }}
          >
            <RotateCcw size={18} strokeWidth={2.5} />
          </motion.button>
        )}
      </AnimatePresence>

      <motion.button
        className="add-button"
        onClick={handleClick}
        disabled={isFull}
        whileHover={
          isFull
            ? {}
            : {
                scale: 1.1,
                boxShadow: "0 0 24px rgba(108, 140, 255, 0.5)",
              }
        }
        whileTap={isFull ? {} : { scale: 0.9 }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{
          type: "spring",
          stiffness: 400,
          damping: 20,
        }}
        style={{
          position: "fixed",
          bottom: "66px",
          right: "18px",
          width: "40px",
          height: "40px",
          borderRadius: "50%",
          border: "none",
          background: isFull
            ? "linear-gradient(135deg, #4a4a5a, #3a3a4a)"
            : "linear-gradient(135deg, #6c8cff, #8b5cf6)",
          color: isFull ? "#888" : "#fff",
          cursor: isFull ? "not-allowed" : "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 90,
          opacity: isFull ? 0.5 : 1,
          boxShadow: isFull
            ? "0 2px 8px rgba(0,0,0,0.3)"
            : "0 3px 12px rgba(108, 140, 255, 0.35)",
          transition: "background 0.3s, box-shadow 0.3s, opacity 0.3s",
        }}
      >
        <Plus size={20} strokeWidth={2.5} />
      </motion.button>

      <DirectoryPickerModal
        isOpen={dialogOpen}
        onSelect={handleDirSelect}
        onClose={handleDialogClose}
      />
    </>
  );
};

export default AddButton;
