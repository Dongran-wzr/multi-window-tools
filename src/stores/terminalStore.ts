import { create } from "zustand";

export interface TerminalInfo {
  id: string;
  name: string;
  pid?: number;
  gridSlot: number; // 0-8 for 3x3 grid, -1 if minimized
  status: "running" | "idle" | "exited";
  lastOutputTime: number;
  cols: number;
  rows: number;
  isMaximized: boolean;
}

export type ThemeMode = "dark" | "light" | "system";
export type FontLanguage = "zh" | "en";

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

  // Actions
  addTerminal: (terminal: TerminalInfo) => void;
  removeTerminal: (id: string) => void;
  setActiveTerminal: (id: string) => void;
  updateTerminalStatus: (id: string, status: TerminalInfo["status"]) => void;
  updateTerminalName: (id: string, name: string) => void;
  setTerminalMaximized: (id: string, maximized: boolean) => void;
  moveTerminalToSlot: (id: string, slot: number) => void;
  swapTerminals: (slotA: number, slotB: number) => void;
  setTheme: (theme: ThemeMode) => void;
  setResolvedTheme: (theme: "dark" | "light") => void;
  setSettingsOpen: (open: boolean) => void;
  setAboutOpen: (open: boolean) => void;
  setFontLanguage: (lang: FontLanguage) => void;
  getTerminalBySlot: (slot: number) => TerminalInfo | undefined;
  getNextAvailableSlot: () => number;
  getActiveTerminal: () => TerminalInfo | undefined;
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

  addTerminal: (terminal) =>
    set((state) => ({
      terminals: [...state.terminals, terminal],
      activeTerminalId: terminal.id,
      nextSlot: state.nextSlot + 1,
    })),

  removeTerminal: (id) =>
    set((state) => {
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
    set({
      activeTerminalId: id,
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
        t.id === id ? { ...t, isMaximized: maximized } : t
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
