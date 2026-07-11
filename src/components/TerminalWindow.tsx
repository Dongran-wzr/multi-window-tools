import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Minus, Maximize2, X, GripVertical } from "lucide-react";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { useTerminalStore, TerminalInfo } from "../stores/terminalStore";
import { useTerminal } from "../hooks/useTerminal";

interface TerminalWindowProps {
  terminal: TerminalInfo;
  isMaximized: boolean;
  onMaximizeToggle: () => void;
}

const TerminalWindow: React.FC<TerminalWindowProps> = ({
  terminal,
  isMaximized,
  onMaximizeToggle,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XtermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(terminal.name);
  const { writeToTerminal, resizeTerminal, closeTerminal, renameTerminal } = useTerminal();
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);

  // Initialize xterm
  useEffect(() => {
    if (!terminalRef.current) return;

    const term = new XtermTerminal({
      cursorBlink: true,
      cursorStyle: "bar",
      fontSize: 14,
      fontFamily: '"JetBrains Mono", "Fira Code", "Cascadia Code", "Consolas", monospace',
      theme: {
        background: "#1a1d23",
        foreground: "#e4e6eb",
        cursor: "#6c8cff",
        selectionBackground: "rgba(108, 140, 255, 0.3)",
        black: "#282c34",
        red: "#e06c75",
        green: "#98c379",
        yellow: "#e5c07b",
        blue: "#61afef",
        magenta: "#c678dd",
        cyan: "#56b6c2",
        white: "#abb2bf",
        brightBlack: "#5c6370",
        brightRed: "#e06c75",
        brightGreen: "#98c379",
        brightYellow: "#e5c07b",
        brightBlue: "#61afef",
        brightMagenta: "#c678dd",
        brightCyan: "#56b6c2",
        brightWhite: "#ffffff",
      },
      allowProposedApi: true,
      allowTransparency: true,
      scrollback: 5000,
    });

    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);

    term.open(terminalRef.current);
    fitAddon.fit();

    xtermRef.current = term;
    fitAddonRef.current = fitAddon;

    // Handle terminal input
    term.onData((data) => {
      writeToTerminal(terminal.id, data);
    });

    // Handle resize
    const resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
      if (xtermRef.current) {
        resizeTerminal(
          terminal.id,
          xtermRef.current.cols,
          xtermRef.current.rows
        );
      }
    });

    resizeObserver.observe(terminalRef.current);

    return () => {
      resizeObserver.disconnect();
      term.dispose();
    };
  }, [terminal.id]);

  // Refit on maximize change
  useEffect(() => {
    if (fitAddonRef.current) {
      setTimeout(() => fitAddonRef.current!.fit(), 50);
    }
  }, [isMaximized]);

  const handleMinimize = () => {
    useTerminalStore.getState().moveTerminalToSlot(terminal.id, -1);
  };

  const handleClose = async () => {
    await closeTerminal(terminal.id);
  };

  const handleDoubleClickTitle = () => {
    onMaximizeToggle();
  };

  const handleRenameSubmit = () => {
    if (nameInput.trim()) {
      renameTerminal(terminal.id, nameInput.trim());
    } else {
      setNameInput(terminal.name);
    }
    setIsRenaming(false);
  };

  const handleRenameKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleRenameSubmit();
    } else if (e.key === "Escape") {
      setNameInput(terminal.name);
      setIsRenaming(false);
    }
  };

  return (
    <motion.div
      className="terminal-window card"
      onClick={() => setActiveTerminal(terminal.id)}
      initial={{
        scale: 0.5,
        opacity: 0,
      }}
      animate={{
        scale: 1,
        opacity: 1,
      }}
      exit={{
        scale: 0.8,
        opacity: 0,
      }}
      transition={{
        duration: 0.28,
        ease: [0.34, 1.56, 0.64, 1],
      }}
      layout
      style={{
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
        width: "100%",
        height: "100%",
        position: "relative",
      }}
    >
      {/* Title bar */}
      <div
        className="terminal-titlebar"
        onDoubleClick={handleDoubleClickTitle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "32px",
          padding: "0 10px",
          flexShrink: 0,
          borderBottom: "1px solid var(--card-border)",
          cursor: "grab",
        }}
      >
        {/* Left: status + name */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "8px",
            flex: 1,
            minWidth: 0,
          }}
        >
          <span className={`status-dot ${terminal.status}`} />
          {isRenaming ? (
            <input
              autoFocus
              value={nameInput}
              onChange={(e) => setNameInput(e.target.value)}
              onBlur={handleRenameSubmit}
              onKeyDown={handleRenameKeyDown}
              style={{
                background: "var(--bg-tertiary)",
                border: "1px solid var(--accent)",
                borderRadius: "4px",
                color: "var(--text-primary)",
                fontSize: "12px",
                padding: "2px 6px",
                outline: "none",
                width: "120px",
              }}
              onClick={(e) => e.stopPropagation()}
            />
          ) : (
            <span
              style={{
                fontSize: "12px",
                fontWeight: 500,
                color: "var(--text-secondary)",
                whiteSpace: "nowrap",
                overflow: "hidden",
                textOverflow: "ellipsis",
                cursor: "text",
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setNameInput(terminal.name);
                setIsRenaming(true);
              }}
            >
              {terminal.name}
            </span>
          )}
        </div>

        {/* Right: window controls */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
          }}
        >
          <motion.button
            whileHover={{ scale: 1.1, background: "var(--bg-hover)" }}
            whileTap={{ scale: 0.9 }}
            onClick={handleMinimize}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
            }}
          >
            <Minus size={14} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1, background: "var(--bg-hover)" }}
            whileTap={{ scale: 0.9 }}
            onClick={onMaximizeToggle}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
            }}
          >
            <Maximize2 size={13} />
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.1, background: "rgba(248,113,113,0.2)" }}
            whileTap={{ scale: 0.9 }}
            onClick={handleClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: "4px",
              borderRadius: "4px",
              display: "flex",
            }}
          >
            <X size={14} />
          </motion.button>
        </div>
      </div>

      {/* Terminal content */}
      <div
        ref={terminalRef}
        style={{
          flex: 1,
          overflow: "hidden",
        }}
      />
    </motion.div>
  );
};

export default TerminalWindow;
