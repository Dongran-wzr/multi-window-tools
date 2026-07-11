import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus } from "lucide-react";
import { useTerminalStore } from "../stores/terminalStore";
import { useTerminal } from "../hooks/useTerminal";

const AddButton: React.FC = () => {
  const terminals = useTerminalStore((s) => s.terminals);
  const { createTerminal } = useTerminal();
  const isFull = terminals.length >= 9;

  const handleClick = async () => {
    if (isFull) return;
    await createTerminal();
  };

  return (
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
  );
};

export default AddButton;
