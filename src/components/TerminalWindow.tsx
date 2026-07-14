import React, { useEffect, useRef, useState, useCallback } from "react";
import { motion } from "framer-motion";
import { Minus, Maximize2, X } from "lucide-react";
import { Terminal as XtermTerminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import html2canvas from "html2canvas";
import {
  useTerminalStore,
  TerminalInfo,
  FlyAnimation,
  cacheCapture,
} from "../stores/terminalStore";
import { useTerminal } from "../hooks/useTerminal";

interface TerminalWindowProps {
  terminal: TerminalInfo;
  isMaximized: boolean;
  onMaximizeToggle: () => void;
  onTitleBarDragStart?: (slot: number, e: React.PointerEvent) => void;
  /** Ref to the grid container, used for coordinate conversion when resizing */
  gridContainerRef?: React.RefObject<HTMLDivElement | null>;
}

/** Resize handle direction */
type ResizeDir = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const MIN_WIDTH = 280;
const MIN_HEIGHT = 180;

const TerminalWindow: React.FC<TerminalWindowProps> = ({
  terminal,
  isMaximized,
  onMaximizeToggle,
  onTitleBarDragStart,
  gridContainerRef,
}) => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const windowRef = useRef<HTMLDivElement>(null);
  const xtermRef = useRef<XtermTerminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [nameInput, setNameInput] = useState(terminal.name);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const { writeToTerminal, resizeTerminal, renameTerminal } = useTerminal();
  const setActiveTerminal = useTerminalStore((s) => s.setActiveTerminal);
  const setFlyAnimation = useTerminalStore((s) => s.setFlyAnimation);
  const updateTerminalBounds = useTerminalStore((s) => s.updateTerminalBounds);
  const freeLayoutEnabled = useTerminalStore((s) => s.freeLayoutEnabled);
  const connectedResizeEnabled = useTerminalStore((s) => s.connectedResizeEnabled);
  // Kept hidden while its reverse-genie re-open plays (SuckOverlay draws it instead).
  const isReopening = useTerminalStore((s) => s.reopeningId === terminal.id);

  /** Build a FlyAnimation descriptor from the window's and tab's current bounding rects.
   *  Captures the full window DOM to canvas via html2canvas for the WebGL shader path. */
  const buildFlyAnimation = useCallback(
    async (removeAfter: boolean): Promise<FlyAnimation | null> => {
      const windowEl = windowRef.current;
      if (!windowEl) return null;

      const winRect = windowEl.getBoundingClientRect();
      const tabEl = document.querySelector(
        `[data-terminal-id="${terminal.id}"]`,
      ) as HTMLElement | null;
      const fallbackRect: DOMRect = {
        left: window.innerWidth / 2 - 80,
        top: window.innerHeight - 48,
        width: 160,
        height: 36,
      } as DOMRect;
      const tabRect = tabEl ? tabEl.getBoundingClientRect() : fallbackRect;

      // ── Capture full window via html2canvas (async, window still visible) ──
      let captureCanvas: HTMLCanvasElement | undefined;
      let contentHTML: string | undefined;
      try {
        captureCanvas = await html2canvas(windowEl, {
          backgroundColor: null,
          scale: 1,
          logging: false,
        });
      } catch (err) {
        console.warn("html2canvas capture failed:", err);
      }

      // Stash the capture so a re-open can replay it as a reverse genie.
      // (A minimized window has no live DOM to re-capture.) Closing terminals
      // don't re-open, so only cache when the window is being hidden.
      if (captureCanvas && !removeAfter) {
        cacheCapture(terminal.id, captureCanvas);
      }

      // ── Capture xterm DOM clone as CSS fallback ──
      const xtermEl = terminalRef.current?.querySelector(".xterm") as HTMLElement | null;
      if (xtermEl) {
        const clone = xtermEl.cloneNode(true) as HTMLElement;
        clone.querySelectorAll("textarea, .xterm-cursor, .xterm-cursor-layer")
          .forEach((el) => el.remove());
        clone.querySelectorAll(".xterm-selection")
          .forEach((el) => ((el as HTMLElement).style.display = "none"));
        contentHTML = clone.outerHTML;
      }

      return {
        terminalId: terminal.id,
        terminalName: terminal.name,
        terminalStatus: terminal.status,
        startRect: {
          left: winRect.left,
          top: winRect.top,
          width: winRect.width,
          height: winRect.height,
        },
        endRect: {
          left: tabRect.left,
          top: tabRect.top,
          width: tabRect.width,
          height: tabRect.height,
        },
        removeAfter,
        contentHTML,
        captureCanvas,
      };
    },
    [terminal.id, terminal.name, terminal.status],
  );

  /** Adjacency threshold: windows with edges within this many px are considered connected */
  const ADJACENCY_THRESHOLD = 14;

  /** Build a horizontal chain of windows to the right of the given bounds.
   *  Each window in the chain is directly adjacent to the previous one. */
  function buildHorizontalChain(
    startRightEdge: number,
    startY: number,
    startH: number,
    candidates: Array<{ id: string; bounds: { x: number; y: number; width: number; height: number } }>,
    direction: "e" | "w",
  ): Array<{ id: string; startBounds: { x: number; y: number; width: number; height: number } }> {
    const chain: Array<{ id: string; startBounds: { x: number; y: number; width: number; height: number } }> = [];
    const used = new Set<string>();

    // Sort candidates by x (left to right for east, right to left for west)
    const sorted = [...candidates].sort((a, b) =>
      direction === "e" ? a.bounds.x - b.bounds.x : b.bounds.x - a.bounds.x,
    );

    let searchEdge = startRightEdge;
    let searchY = startY;
    let searchH = startH;

    // Keep finding the next window in the chain
    let found = true;
    while (found) {
      found = false;
      for (const c of sorted) {
        if (used.has(c.id)) continue;

        let isAdjacent = false;
        if (direction === "e") {
          // Looking for a window whose left edge is near searchEdge (to the right)
          if (Math.abs(c.bounds.x - searchEdge) < ADJACENCY_THRESHOLD) {
            // Check vertical overlap with the previous window
            const cTop = c.bounds.y;
            const cBottom = c.bounds.y + c.bounds.height;
            if (cBottom > searchY + MIN_HEIGHT / 2 && cTop < searchY + searchH - MIN_HEIGHT / 2) {
              isAdjacent = true;
            }
          }
        } else {
          // Looking for a window whose right edge is near searchEdge (to the left)
          const cRight = c.bounds.x + c.bounds.width;
          if (Math.abs(cRight - searchEdge) < ADJACENCY_THRESHOLD) {
            const cTop = c.bounds.y;
            const cBottom = c.bounds.y + c.bounds.height;
            if (cBottom > searchY + MIN_HEIGHT / 2 && cTop < searchY + searchH - MIN_HEIGHT / 2) {
              isAdjacent = true;
            }
          }
        }

        if (isAdjacent) {
          chain.push({ id: c.id, startBounds: { ...c.bounds } });
          used.add(c.id);
          // Update search edge to this window's other side
          if (direction === "e") {
            searchEdge = c.bounds.x + c.bounds.width; // continue from this window's right edge
          } else {
            searchEdge = c.bounds.x; // continue from this window's left edge
          }
          searchY = c.bounds.y;
          searchH = c.bounds.height;
          found = true;
          break;
        }
      }
    }

    return chain;
  }

  /** Build a vertical chain of windows below/above the given bounds. */
  function buildVerticalChain(
    startBottomEdge: number,
    startX: number,
    startW: number,
    candidates: Array<{ id: string; bounds: { x: number; y: number; width: number; height: number } }>,
    direction: "s" | "n",
  ): Array<{ id: string; startBounds: { x: number; y: number; width: number; height: number } }> {
    const chain: Array<{ id: string; startBounds: { x: number; y: number; width: number; height: number } }> = [];
    const used = new Set<string>();

    const sorted = [...candidates].sort((a, b) =>
      direction === "s" ? a.bounds.y - b.bounds.y : b.bounds.y - a.bounds.y,
    );

    let searchEdge = startBottomEdge;
    let searchX = startX;
    let searchW = startW;

    let found = true;
    while (found) {
      found = false;
      for (const c of sorted) {
        if (used.has(c.id)) continue;

        let isAdjacent = false;
        if (direction === "s") {
          // Looking for a window whose top edge is near searchEdge (below)
          if (Math.abs(c.bounds.y - searchEdge) < ADJACENCY_THRESHOLD) {
            const cLeft = c.bounds.x;
            const cRight = c.bounds.x + c.bounds.width;
            if (cRight > searchX + MIN_WIDTH / 2 && cLeft < searchX + searchW - MIN_WIDTH / 2) {
              isAdjacent = true;
            }
          }
        } else {
          // Looking for a window whose bottom edge is near searchEdge (above)
          const cBottom = c.bounds.y + c.bounds.height;
          if (Math.abs(cBottom - searchEdge) < ADJACENCY_THRESHOLD) {
            const cLeft = c.bounds.x;
            const cRight = c.bounds.x + c.bounds.width;
            if (cRight > searchX + MIN_WIDTH / 2 && cLeft < searchX + searchW - MIN_WIDTH / 2) {
              isAdjacent = true;
            }
          }
        }

        if (isAdjacent) {
          chain.push({ id: c.id, startBounds: { ...c.bounds } });
          used.add(c.id);
          if (direction === "s") {
            searchEdge = c.bounds.y + c.bounds.height;
          } else {
            searchEdge = c.bounds.y;
          }
          searchX = c.bounds.x;
          searchW = c.bounds.width;
          found = true;
          break;
        }
      }
    }

    return chain;
  }

  // ── Resize handling ──
  const handleResizeStart = useCallback(
    (dir: ResizeDir, e: React.PointerEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const windowEl = windowRef.current;
      const gridEl = gridContainerRef?.current;
      if (!windowEl || !gridEl) return;

      const winRect = windowEl.getBoundingClientRect();
      const gridRect = gridEl.getBoundingClientRect();

      // Convert viewport coords to grid-relative
      const startBounds = {
        x: winRect.left - gridRect.left,
        y: winRect.top - gridRect.top,
        width: winRect.width,
        height: winRect.height,
      };
      const startPointer = { x: e.clientX, y: e.clientY };

      // Switch to absolute positioning immediately
      updateTerminalBounds(terminal.id, startBounds);

      // ── Connected resize: build chains of cascading windows ──
      let hChainEast: Array<{ id: string; startBounds: { x: number; y: number; width: number; height: number } }> = [];
      let hChainWest: Array<{ id: string; startBounds: { x: number; y: number; width: number; height: number } }> = [];
      let vChainSouth: Array<{ id: string; startBounds: { x: number; y: number; width: number; height: number } }> = [];
      let vChainNorth: Array<{ id: string; startBounds: { x: number; y: number; width: number; height: number } }> = [];

      if (connectedResizeEnabled) {
        // Lock every other visible window's current position into customBounds
        const allWindowEls = gridEl.querySelectorAll<HTMLElement>("[data-window-id]");
        const otherWindows: Array<{
          id: string;
          bounds: { x: number; y: number; width: number; height: number };
        }> = [];

        allWindowEls.forEach((el) => {
          const wid = el.dataset.windowId;
          if (!wid || wid === terminal.id) return;
          const r = el.getBoundingClientRect();
          const b = {
            x: r.left - gridRect.left,
            y: r.top - gridRect.top,
            width: r.width,
            height: r.height,
          };
          otherWindows.push({ id: wid, bounds: b });
          updateTerminalBounds(wid, b);
        });

        // Build horizontal chains for east/west resize
        if (dir.includes("e")) {
          const myRight = startBounds.x + startBounds.width;
          hChainEast = buildHorizontalChain(myRight, startBounds.y, startBounds.height, otherWindows, "e");
        }
        if (dir.includes("w")) {
          const myLeft = startBounds.x;
          hChainWest = buildHorizontalChain(myLeft, startBounds.y, startBounds.height, otherWindows, "w");
        }

        // Build vertical chains for south/north resize
        if (dir.includes("s")) {
          const myBottom = startBounds.y + startBounds.height;
          vChainSouth = buildVerticalChain(myBottom, startBounds.x, startBounds.width, otherWindows, "s");
        }
        if (dir.includes("n")) {
          const myTop = startBounds.y;
          vChainNorth = buildVerticalChain(myTop, startBounds.x, startBounds.width, otherWindows, "n");
        }
      }

      const onPointerMove = (ev: PointerEvent) => {
        const dx = ev.clientX - startPointer.x;
        const dy = ev.clientY - startPointer.y;

        let { x, y, width, height } = startBounds;

        // Adjust bounds based on resize direction
        if (dir.includes("e")) {
          width = Math.max(MIN_WIDTH, startBounds.width + dx);
        }
        if (dir.includes("w")) {
          const newWidth = Math.max(MIN_WIDTH, startBounds.width - dx);
          x = startBounds.x + startBounds.width - newWidth;
          width = newWidth;
        }
        if (dir.includes("s")) {
          height = Math.max(MIN_HEIGHT, startBounds.height + dy);
        }
        if (dir.includes("n")) {
          const newHeight = Math.max(MIN_HEIGHT, startBounds.height - dy);
          y = startBounds.y + startBounds.height - newHeight;
          height = newHeight;
        }

        updateTerminalBounds(terminal.id, { x, y, width, height });

        // ── Cascading push/squeeze through horizontal chains ──
        if (hChainEast.length > 0 || hChainWest.length > 0) {
          const deltaX = dir.includes("e")
            ? width - startBounds.width
            : startBounds.x - x;

          for (const chainWindow of [...hChainEast, ...hChainWest]) {
            const sb = chainWindow.startBounds;
            if (dir.includes("e")) {
              // Shift right and shrink
              updateTerminalBounds(chainWindow.id, {
                x: sb.x + deltaX,
                y: sb.y,
                width: Math.max(MIN_WIDTH, sb.width - deltaX),
                height: sb.height,
              });
            }
            if (dir.includes("w")) {
              // Shrink from the right
              updateTerminalBounds(chainWindow.id, {
                x: sb.x,
                y: sb.y,
                width: Math.max(MIN_WIDTH, sb.width - deltaX),
                height: sb.height,
              });
            }
          }
        }

        // ── Cascading push/squeeze through vertical chains ──
        if (vChainSouth.length > 0 || vChainNorth.length > 0) {
          const deltaY = dir.includes("s")
            ? height - startBounds.height
            : startBounds.y - y;

          for (const chainWindow of [...vChainSouth, ...vChainNorth]) {
            const sb = chainWindow.startBounds;
            if (dir.includes("s")) {
              // Shift down and shrink
              updateTerminalBounds(chainWindow.id, {
                x: sb.x,
                y: sb.y + deltaY,
                width: sb.width,
                height: Math.max(MIN_HEIGHT, sb.height - deltaY),
              });
            }
            if (dir.includes("n")) {
              // Shrink from the bottom
              updateTerminalBounds(chainWindow.id, {
                x: sb.x,
                y: sb.y,
                width: sb.width,
                height: Math.max(MIN_HEIGHT, sb.height - deltaY),
              });
            }
          }
        }
      };

      const onPointerUp = () => {
        document.removeEventListener("pointermove", onPointerMove);
        document.removeEventListener("pointerup", onPointerUp);
        document.removeEventListener("pointercancel", onPointerUp);
      };

      document.addEventListener("pointermove", onPointerMove);
      document.addEventListener("pointerup", onPointerUp);
      document.addEventListener("pointercancel", onPointerUp);
    },
    [terminal.id, updateTerminalBounds, gridContainerRef, connectedResizeEnabled],
  );

  // ── Titlebar drag-to-move (when window has customBounds) ──
  const handleTitleBarMoveStart = useCallback(
    (e: React.PointerEvent) => {
      if (isMaximized) return;
      const target = e.target as HTMLElement;
      if (target.closest("button")) return;

      // If free layout is enabled and the window has custom bounds, drag to move it freely
      if (freeLayoutEnabled && terminal.customBounds) {
        e.preventDefault();
        e.stopPropagation();

        const windowEl = windowRef.current;
        const gridEl = gridContainerRef?.current;
        if (!windowEl || !gridEl) return;

        const startPointer = { x: e.clientX, y: e.clientY };
        const startBounds = { ...terminal.customBounds };

        const onPointerMove = (ev: PointerEvent) => {
          const dx = ev.clientX - startPointer.x;
          const dy = ev.clientY - startPointer.y;
          updateTerminalBounds(terminal.id, {
            x: startBounds.x + dx,
            y: startBounds.y + dy,
            width: startBounds.width,
            height: startBounds.height,
          });
        };

        const onPointerUp = () => {
          document.removeEventListener("pointermove", onPointerMove);
          document.removeEventListener("pointerup", onPointerUp);
          document.removeEventListener("pointercancel", onPointerUp);
        };

        document.addEventListener("pointermove", onPointerMove);
        document.addEventListener("pointerup", onPointerUp);
        document.addEventListener("pointercancel", onPointerUp);
        return;
      }

      // No custom bounds → use grid swap drag (handled by parent)
      onTitleBarDragStart?.(terminal.gridSlot, e);
    },
    [terminal.id, terminal.customBounds, terminal.gridSlot, isMaximized, freeLayoutEnabled, updateTerminalBounds, gridContainerRef, onTitleBarDragStart],
  );

  // Cursor style for resize handles
  const cursorFor = (dir: ResizeDir): React.CSSProperties["cursor"] => {
    switch (dir) {
      case "n": return "n-resize";
      case "s": return "s-resize";
      case "e": return "e-resize";
      case "w": return "w-resize";
      case "ne": return "ne-resize";
      case "nw": return "nw-resize";
      case "se": return "se-resize";
      case "sw": return "sw-resize";
    }
  };

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

    // Custom key handler for smart copy/paste
    // - Ctrl+C with selection → copy (VS Code / Windows Terminal behavior)
    // - Ctrl+C without selection → let terminal handle (SIGINT)
    // - Ctrl+Shift+C → force copy
    // - Ctrl+V is handled natively by xterm.js via the browser paste event
    term.attachCustomKeyEventHandler((event: KeyboardEvent) => {
      const isMod = event.ctrlKey || event.metaKey;

      // Ctrl+Shift+C: Force copy
      if (isMod && event.shiftKey && (event.key === "C" || event.key === "c")) {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(() => {});
        }
        return false;
      }

      // Ctrl+Shift+V: Force paste (fallback for non-standard paste)
      if (isMod && event.shiftKey && (event.key === "V" || event.key === "v")) {
        navigator.clipboard.readText().then((text) => {
          if (text) {
            writeToTerminal(terminal.id, text);
          }
        }).catch(() => {});
        return false;
      }

      // Ctrl+C: smart copy — copy if selected, else let terminal handle (SIGINT)
      if (isMod && !event.shiftKey && (event.key === "c" || event.key === "C")) {
        const selection = term.getSelection();
        if (selection) {
          navigator.clipboard.writeText(selection).catch(() => {});
          return false;
        }
        // No selection → pass through to terminal as SIGINT
      }

      return true;
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

    // Cleanup state for async listeners
    let unlistenOutput: (() => void) | undefined;
    let unlistenExit: (() => void) | undefined;
    let cancelled = false;

    // Listen for PTY output events and write to xterm
    listen<{ id: string; data: string }>(
      `terminal-output-${terminal.id}`,
      (event) => {
        if (cancelled || !xtermRef.current) return;
        const data = event.payload.data;
        if (!data) return;

        // Update status to running on output
        useTerminalStore.getState().updateTerminalStatus(terminal.id, "running");

        // Decode base64 -> raw bytes and write to xterm
        const binaryString = atob(data);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        xtermRef.current.write(bytes);
      }
    ).then((fn) => { unlistenOutput = fn; });

    // Listen for PTY exit events
    listen<{ id: string }>(
      `terminal-exited-${terminal.id}`,
      () => {
        if (cancelled) return;
        useTerminalStore.getState().updateTerminalStatus(terminal.id, "exited");
      }
    ).then((fn) => { unlistenExit = fn; });

    return () => {
      cancelled = true;
      unlistenOutput?.();
      unlistenExit?.();
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

  const handleMinimize = async () => {
    // Dim immediately for visual feedback during async capture
    if (windowRef.current) {
      windowRef.current.style.opacity = "0.7";
      windowRef.current.style.transition = "opacity 0.1s ease";
    }
    const anim = await buildFlyAnimation(false);
    if (anim) setFlyAnimation(anim);
    // Hide from grid → triggers AnimatePresence exit; SuckOverlay takes over visually
    useTerminalStore.getState().moveTerminalToSlot(terminal.id, -1);
  };

  const handleClose = async () => {
    // Dim immediately for visual feedback during async capture
    if (windowRef.current) {
      windowRef.current.style.opacity = "0.7";
      windowRef.current.style.transition = "opacity 0.1s ease";
    }
    const anim = await buildFlyAnimation(true);
    if (anim) setFlyAnimation(anim);
    // Hide from grid immediately (terminal stays in tab bar while animating)
    useTerminalStore.getState().moveTerminalToSlot(terminal.id, -1);
    // Kill the PTY process in the background
    invoke("close_terminal", { id: terminal.id }).catch(console.error);
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

  // Right-click context menu
  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCopy = () => {
    if (xtermRef.current) {
      const selection = xtermRef.current.getSelection();
      if (selection) {
        navigator.clipboard.writeText(selection).catch(() => {});
      }
    }
    setContextMenu(null);
  };

  const handlePaste = () => {
    navigator.clipboard.readText().then((text) => {
      if (text) {
        writeToTerminal(terminal.id, text);
      }
    }).catch(() => {});
    setContextMenu(null);
  };

  // Close context menu on any outside click
  useEffect(() => {
    if (!contextMenu) return;
    const close = () => setContextMenu(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [contextMenu]);

  return (
    <motion.div
      ref={windowRef}
      className="terminal-window card"
      data-window-id={terminal.id}
      onClick={() => setActiveTerminal(terminal.id)}
      initial={
        isReopening
          ? false
          : { scale: 0.5, opacity: 0 }
      }
      animate={{ scale: 1, opacity: 1 }}
      exit={{
        opacity: 0,
        filter: "blur(4px)",
      }}
      transition={{
        duration: 0.25,
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
        // Hidden (but laid out, so we can measure it) while the reverse genie plays.
        visibility: isReopening ? "hidden" : "visible",
      }}
    >
      {/* Title bar */}
      <div
        className="terminal-titlebar"
        onPointerDown={handleTitleBarMoveStart}
        onDoubleClick={handleDoubleClickTitle}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          height: "32px",
          padding: "0 10px",
          flexShrink: 0,
          borderBottom: "1px solid var(--card-border)",
          cursor: isMaximized ? "default" : "grab",
          touchAction: "none",
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
        onContextMenu={handleContextMenu}
        style={{
          flex: 1,
          overflow: "hidden",
        }}
      />

      {/* Resize handles — transparent edge zones for drag-to-resize */}
      {!isMaximized && freeLayoutEnabled &&
        (["n", "s", "e", "w", "ne", "nw", "se", "sw"] as ResizeDir[]).map(
          (dir) => (
            <div
              key={dir}
              className={`resize-handle resize-${dir}`}
              onPointerDown={(e) => handleResizeStart(dir, e)}
              style={{ cursor: cursorFor(dir) }}
            />
          ),
        )}

      {/* Right-click context menu */}
      {contextMenu && (
        <div
          className="context-menu"
          style={{
            position: "fixed",
            left: contextMenu.x,
            top: contextMenu.y,
            zIndex: 200,
            background: "var(--card-bg)",
            border: "1px solid var(--card-border)",
            borderRadius: "8px",
            padding: "6px",
            minWidth: "150px",
            boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
            backdropFilter: "blur(16px)",
          }}
        >
          <button
            onClick={handleCopy}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              width: "100%",
              padding: "8px 12px",
              border: "none",
              borderRadius: "6px",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: "12px",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span style={{ fontSize: "10px", color: "var(--text-muted)", width: "50px" }}>
              Ctrl+C
            </span>
            复制
          </button>
          <button
            onClick={handlePaste}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              width: "100%",
              padding: "8px 12px",
              border: "none",
              borderRadius: "6px",
              background: "transparent",
              color: "var(--text-primary)",
              fontSize: "12px",
              cursor: "pointer",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <span style={{ fontSize: "10px", color: "var(--text-muted)", width: "50px" }}>
              Ctrl+V
            </span>
            粘贴
          </button>
        </div>
      )}
    </motion.div>
  );
};

export default TerminalWindow;
