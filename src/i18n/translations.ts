import { useTerminalStore } from "../stores/terminalStore";

// ---- Translation dictionaries ----
const zh: Record<string, string> = {
  // App title
  "app.title": "MultiWindow 终端",

  // TitleBar
  "titlebar.settings": "设置",
  "titlebar.about": "关于",

  // About modal
  "about.title": "关于",

  // Settings modal
  "settings.title": "设置",
  "settings.theme": "主题",
  "settings.theme.dark": "深色",
  "settings.theme.light": "浅色",
  "settings.theme.system": "跟随系统",
  "settings.language": "语言",
  "settings.language.zh": "中文",
  "settings.language.en": "English",
  "settings.shortcuts.title": "快捷键",
  "settings.shortcuts.content":
    "Ctrl+Shift+T 新建终端 · Ctrl+Shift+W 关闭 · Ctrl+Tab 下一个 · Ctrl+1~9 跳转",
  "settings.hint":
    "双击终端标题栏可最大化/还原。拖拽标签页可重新排列。",

  // Tab context menu
  "tab.rename": "重命名",
  "tab.restart": "重启终端",
  "tab.splitH": "水平分割",
  "tab.splitV": "垂直分割",
  "tab.close": "关闭",

  // Empty states
  "empty.noTerminals": "没有打开的终端",
  "empty.hint": "点击 + 按钮或按 Ctrl+Shift+T 创建一个",
  "tabbar.empty": "没有打开的终端，点击 + 创建",
};

const en: Record<string, string> = {
  // App title
  "app.title": "MultiWindow Terminal",

  // TitleBar
  "titlebar.settings": "Settings",
  "titlebar.about": "About",

  // About modal
  "about.title": "About",

  // Settings modal
  "settings.title": "Settings",
  "settings.theme": "Theme",
  "settings.theme.dark": "Dark",
  "settings.theme.light": "Light",
  "settings.theme.system": "System",
  "settings.language": "Language",
  "settings.language.zh": "中文",
  "settings.language.en": "English",
  "settings.shortcuts.title": "Shortcuts",
  "settings.shortcuts.content":
    "Ctrl+Shift+T New Terminal · Ctrl+Shift+W Close · Ctrl+Tab Next · Ctrl+1~9 Jump",
  "settings.hint":
    "Double-click a terminal title to maximize/restore. Drag tabs to rearrange.",

  // Tab context menu
  "tab.rename": "Rename",
  "tab.restart": "Restart Terminal",
  "tab.splitH": "Split Horizontally",
  "tab.splitV": "Split Vertically",
  "tab.close": "Close",

  // Empty states
  "empty.noTerminals": "No Terminals Open",
  "empty.hint": "Click the + button or press Ctrl+Shift+T to create one",
  "tabbar.empty": "No terminals open. Click + to create one.",
};

const dicts: Record<string, Record<string, string>> = { zh, en };

/**
 * Simple i18n hook. Reads language preference from the store.
 * Usage: const { t } = useI18n();  →  t("settings.title")
 */
export function useI18n() {
  const lang = useTerminalStore((s) => s.fontLanguage);
  const dict = dicts[lang] || zh;

  const t = (key: string): string => dict[key] ?? key;

  return { t, lang };
}
