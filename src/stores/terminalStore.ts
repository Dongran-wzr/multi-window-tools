import { create } from "zustand";
import type { MinifyDirection } from "../utils/minifyAnimation";

/** Fly-to-tab animation descriptor — stored when a window is being hidden/closed */
export interface FlyAnimation {
  terminalId: string;
  terminalName: string;
  terminalStatus: string;
  /** Window bounding rect at the moment of click (viewport coords) */
  startRect: { left: number; top: number; width: number; height: number };
  /** Target tab bounding rect at the moment of click (viewport coords) */
  endRect: { left: number; top: number; width: number; height: number };
  /** If true, fully remove the terminal from store after animation completes */
  removeAfter: boolean;
  /** Genie direction: "in" = window→tab (hide/close), "out" = tab→window (re-open). */
  direction?: MinifyDirection;
  /** Cloned xterm DOM HTML — renders the real terminal content in the ghost */
  contentHTML?: string;
  /** Canvas from html2canvas capture — enables WebGL shader animation */
  captureCanvas?: HTMLCanvasElement;
}

/**
 * Per-terminal capture cache. A window's last html2canvas texture is stashed here
 * when it minimizes, so the reverse ("out") genie can reuse it when the tab is
 * re-opened — the minimized window has no live DOM to re-capture.
 */
const captureCache = new Map<string, HTMLCanvasElement>();

/** Stash a window capture for later reverse-genie playback. */
export function cacheCapture(id: string, canvas: HTMLCanvasElement): void {
  captureCache.set(id, canvas);
}

/** Retrieve (and remove) a cached capture, or undefined if none. */
export function takeCapture(id: string): HTMLCanvasElement | undefined {
  const c = captureCache.get(id);
  captureCache.delete(id);
  return c;
}

/** Drop a cached capture without consuming it. */
export function clearCapture(id: string): void {
  captureCache.delete(id);
}

/** Custom pixel bounds for a terminal window — when set, the window escapes the grid */
export interface TerminalBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TerminalInfo {
  id: string;
  name: string;
  pid?: number;
  cwd?: string; // working directory when the terminal was created
  gridSlot: number; // 0-8 for 3x3 grid, -1 if minimized
  status: "running" | "idle" | "exited";
  lastOutputTime: number;
  cols: number;
  rows: number;
  isMaximized: boolean;
  /** When set, the window is positioned absolutely with these pixel bounds */
  customBounds?: TerminalBounds;
}

/** A frequently/recently used directory entry */
export interface RecentDirectory {
  path: string;
  count: number;
  lastUsedAt: number; // timestamp
}

const RECENT_DIRS_STORAGE_KEY = "multi-window-terminal-recent-dirs";
const MAX_RECENT_DIRS = 10;

/** Check if localStorage is available */
function hasLocalStorage(): boolean {
  try {
    return typeof localStorage !== "undefined" && localStorage !== null;
  } catch {
    return false;
  }
}

/** Load recent directories from localStorage */
function loadRecentDirs(): RecentDirectory[] {
  if (!hasLocalStorage()) return [];
  try {
    const raw = localStorage.getItem(RECENT_DIRS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(
          (d: unknown) =>
            d && typeof d === "object" &&
            typeof (d as RecentDirectory).path === "string" &&
            typeof (d as RecentDirectory).count === "number" &&
            typeof (d as RecentDirectory).lastUsedAt === "number"
        );
      }
    }
  } catch {
    // ignore corrupted data
  }
  return [];
}

/** Save recent directories to localStorage */
function saveRecentDirs(dirs: RecentDirectory[]): void {
  if (!hasLocalStorage()) return;
  try {
    localStorage.setItem(RECENT_DIRS_STORAGE_KEY, JSON.stringify(dirs));
  } catch {
    // ignore quota errors
  }
}

/** Record a directory usage: increment count & update timestamp, trim to max */
function recordDirUsage(
  dirs: RecentDirectory[],
  path: string
): RecentDirectory[] {
  const cleaned = path.trim().replace(/[/\\]+$/, "").replace(/\\/g, "/");
  if (!cleaned) return dirs;

  const existing = dirs.find(
    (d) => d.path.replace(/\\/g, "/") === cleaned
  );
  let updated: RecentDirectory[];
  if (existing) {
    updated = dirs.map((d) =>
      d.path.replace(/\\/g, "/") === cleaned
        ? { ...d, count: d.count + 1, lastUsedAt: Date.now() }
        : d
    );
  } else {
    updated = [
      ...dirs,
      { path: cleaned, count: 1, lastUsedAt: Date.now() },
    ];
  }

  // Sort by frequency desc, then recency desc, trim to max
  updated.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return b.lastUsedAt - a.lastUsedAt;
  });
  return updated.slice(0, MAX_RECENT_DIRS);
}

export type ThemeMode = "dark" | "light" | "system";
export type FontLanguage = "zh" | "en";

export interface BackgroundImageData {
  mime: string;
  base64: string;
}

interface TerminalStore {
  // Terminal instances
  terminals: TerminalInfo[];
  activeTerminalId: string | null;
  nextSlot: number;

  // Theme
  theme: ThemeMode;
  resolvedTheme: "dark" | "light";

  // Layout
  gridCols: number;
  gridRows: number;

  // Settings
  settingsOpen: boolean;
  aboutOpen: boolean;
  fontLanguage: FontLanguage;

  // Advanced settings - background
  backgroundImage: BackgroundImageData | null;
  backgroundCode: string;
  backgroundEnabled: boolean;

  // Free window layout
  freeLayoutEnabled: boolean;

  // Connected window resize — adjacent windows push/squeeze each other
  connectedResizeEnabled: boolean;

  // Fly-to-tab animation (portal overlay)
  flyAnimation: FlyAnimation | null;
  /** Terminal id currently mid reverse-genie re-open — kept hidden until it finishes. */
  reopeningId: string | null;

  // Actions
  addTerminal: (terminal: TerminalInfo) => void;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (id: string) => void;
  updateTerminalStatus: (id: string, status: TerminalInfo["status"]) => void;
  updateTerminalName: (id: string, name: string) => void;
  setTerminalMaximized: (id: string, maximized: boolean) => void;
  updateTerminalBounds: (id: string, bounds: TerminalBounds | null) => void;
  moveTerminalToSlot: (id: string, slot: number) => void;
  swapTerminals: (slotA: number, slotB: number) => void;
  setTheme: (theme: ThemeMode) => void;
  setResolvedTheme: (theme: "dark" | "light") => void;
  setSettingsOpen: (open: boolean) => void;
  setAboutOpen: (open: boolean) => void;
  setFontLanguage: (lang: FontLanguage) => void;
  // Advanced settings actions
  setBackgroundImage: (image: BackgroundImageData | null) => void;
  setBackgroundCode: (code: string) => void;
  setBackgroundEnabled: (enabled: boolean) => void;
  setFreeLayoutEnabled: (enabled: boolean) => void;
  setConnectedResizeEnabled: (enabled: boolean) => void;
  resetAllBounds: () => void;
  setFlyAnimation: (anim: FlyAnimation | null) => void;
  setReopeningId: (id: string | null) => void;
  getTerminalBySlot: (slot: number) => TerminalInfo | undefined;
  getNextAvailableSlot: () => number;
  getActiveTerminal: () => TerminalInfo | undefined;

  // Recent directories
  recentDirectories: RecentDirectory[];
  recordDirectoryUsage: (path: string) => void;
  getRecentDirectories: (excludePaths?: string[]) => RecentDirectory[];
}

const MAX_TERMINALS = 9;
const DEFAULT_NAME_PATTERN = /^Terminal \d+$/;

/** Renumber terminals whose names still use the default "Terminal {N}" pattern */
function renumberDefaultNames(terminals: TerminalInfo[]): TerminalInfo[] {
  return terminals.map((t) => {
    if (t.gridSlot === -1) return t;
    if (DEFAULT_NAME_PATTERN.test(t.name)) {
      return { ...t, name: `Terminal ${t.gridSlot + 1}` };
    }
    return t;
  });
}

/** Compact visible terminal slots to 0,1,2... without renaming */
function compactSlots(terminals: TerminalInfo[]): TerminalInfo[] {
  const visible = terminals
    .filter((t) => t.gridSlot !== -1)
    .sort((a, b) => a.gridSlot - b.gridSlot);
  return terminals.map((t) => {
    if (t.gridSlot === -1) return t;
    const newSlot = visible.findIndex((vt) => vt.id === t.id);
    return { ...t, gridSlot: newSlot };
  });
}

/** Compact slots AND renumber default-named terminals */
function compactAndRenumber(terminals: TerminalInfo[]): TerminalInfo[] {
  return renumberDefaultNames(compactSlots(terminals));
}

export const useTerminalStore = create<TerminalStore>((set, get) => ({
  terminals: [],
  activeTerminalId: null,
  nextSlot: 0,
  theme: "dark",
  resolvedTheme: "dark",
  gridCols: 3,
  gridRows: 3,
  settingsOpen: false,
  aboutOpen: false,
  fontLanguage: "zh",
  backgroundImage: null,
  backgroundCode: "",
  backgroundEnabled: true,
  freeLayoutEnabled: false,
  connectedResizeEnabled: false,
  flyAnimation: null,
  reopeningId: null,
  recentDirectories: loadRecentDirs(),

  addTerminal: (terminal) =>
    set((state) => ({
      terminals: [...state.terminals, terminal],
      activeTerminalId: terminal.id,
      nextSlot: state.nextSlot + 1,
    })),

  removeTerminal: (id) =>
    set((state) => {
      clearCapture(id);
      const filtered = compactAndRenumber(
        state.terminals.filter((t) => t.id !== id)
      );

      const newActive =
        state.activeTerminalId === id
          ? filtered.length > 0
            ? filtered[filtered.length - 1].id
            : null
          : state.activeTerminalId;
      return {
        terminals: filtered,
        activeTerminalId: newActive,
      };
    }),

  setActiveTerminal: (id) =>
    set((state) => {
      // If switching to a different terminal while one is maximized, unmaximize it
      const maximizedTerminal = state.terminals.find((t) => t.isMaximized);
      const shouldUnmaximize = maximizedTerminal && maximizedTerminal.id !== id;
      return {
        activeTerminalId: id,
        terminals: shouldUnmaximize
          ? state.terminals.map((t) => ({ ...t, isMaximized: false }))
          : state.terminals,
      };
    }),

  updateTerminalStatus: (id, status) =>
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id
          ? {
              ...t,
              status,
              lastOutputTime:
                status === "running" ? Date.now() : t.lastOutputTime,
            }
          : t
      ),
    })),

  updateTerminalName: (id, name) =>
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, name } : t
      ),
    })),

  setTerminalMaximized: (id, maximized) =>
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id
          ? { ...t, isMaximized: maximized, customBounds: maximized ? undefined : t.customBounds }
          : t
      ),
    })),

  updateTerminalBounds: (id, bounds) =>
    set((state) => ({
      terminals: state.terminals.map((t) =>
        t.id === id ? { ...t, customBounds: bounds ?? undefined } : t
      ),
    })),

  moveTerminalToSlot: (id, slot) =>
    set((state) => {
      // Move terminal to target slot; unmaximize if minimizing
      let terminals = state.terminals.map((t) =>
        t.id === id
          ? { ...t, gridSlot: slot, isMaximized: slot === -1 ? false : t.isMaximized }
          : t
      );

      // Compact slots only when minimizing (names stay)
      if (slot === -1) {
        terminals = compactSlots(terminals);
      }

      return { terminals };
    }),

  swapTerminals: (slotA, slotB) =>
    set((state) => {
      const terminalA = state.terminals.find((t) => t.gridSlot === slotA);
      const terminalB = state.terminals.find((t) => t.gridSlot === slotB);
      if (!terminalA && !terminalB) return state;

      const updated = state.terminals.map((t) => {
        if (t.gridSlot === slotA) return { ...t, gridSlot: slotB };
        if (t.gridSlot === slotB) return { ...t, gridSlot: slotA };
        return t;
      });
      return { terminals: updated };
    }),

  setTheme: (theme) => set({ theme }),

  setResolvedTheme: (theme) =>
    set({
      resolvedTheme: theme,
    }),

  setSettingsOpen: (open) => set({ settingsOpen: open }),

  setAboutOpen: (open) => set({ aboutOpen: open }),

  setFontLanguage: (lang) => set({ fontLanguage: lang }),

  setBackgroundImage: (image) => set({ backgroundImage: image }),

  setBackgroundCode: (code) => set({ backgroundCode: code }),

  setBackgroundEnabled: (enabled) => set({ backgroundEnabled: enabled }),

  setFreeLayoutEnabled: (enabled) =>
    set((state) => ({
      freeLayoutEnabled: enabled,
      // When disabling free layout, clear all custom bounds
      terminals: enabled
        ? state.terminals
        : state.terminals.map((t) => ({ ...t, customBounds: undefined })),
    })),

  setConnectedResizeEnabled: (enabled) => set({ connectedResizeEnabled: enabled }),

  resetAllBounds: () =>
    set((state) => ({
      terminals: state.terminals.map((t) => ({ ...t, customBounds: undefined })),
    })),

  setFlyAnimation: (anim) => set({ flyAnimation: anim }),

  setReopeningId: (id) => set({ reopeningId: id }),

  recordDirectoryUsage: (path) =>
    set((state) => {
      const updated = recordDirUsage(state.recentDirectories, path);
      saveRecentDirs(updated);
      return { recentDirectories: updated };
    }),

  getRecentDirectories: (excludePaths) => {
    const { recentDirectories } = get();
    if (!excludePaths || excludePaths.length === 0) return recentDirectories;
    const excludeSet = new Set(
      excludePaths.map((p) => p.trim().replace(/\\/g, "/").replace(/[/\\]+$/, ""))
    );
    return recentDirectories.filter(
      (d) => !excludeSet.has(d.path.replace(/\\/g, "/"))
    );
  },

  getTerminalBySlot: (slot) => {
    return get().terminals.find((t) => t.gridSlot === slot);
  },

  getNextAvailableSlot: () => {
    const { terminals } = get();
    const visible = terminals.filter((t) => t.gridSlot !== -1);
    if (visible.length >= MAX_TERMINALS) return -1;
    const occupiedSlots = new Set(visible.map((t) => t.gridSlot));
    for (let i = 0; i < MAX_TERMINALS; i++) {
      if (!occupiedSlots.has(i)) return i;
    }
    return -1;
  },

  getActiveTerminal: () => {
    const { terminals, activeTerminalId } = get();
    return terminals.find((t) => t.id === activeTerminalId);
  },
}));
