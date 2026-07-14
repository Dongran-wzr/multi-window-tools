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
  "about.version": "版本",

  // Settings modal
  "settings.title": "设置",
  "settings.search": "搜索设置项...",
  "settings.apply": "应用",
  "settings.ok": "确定",
  "settings.cancel": "取消",
  "settings.appearance": "外观",
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

  // Advanced settings
  "settings.advanced": "高级选项",
  "settings.advanced.background": "自定义背景",
  "settings.advanced.layout": "窗口布局",
  "settings.advanced.background.title": "自定义背景",
  "settings.advanced.background.image": "背景图片",
  "settings.advanced.background.image.choose": "选择图片",
  "settings.advanced.background.image.remove": "移除图片",
  "settings.advanced.background.image.hint": "支持 PNG / JPG / GIF / WebP / SVG，图片会自动保存。",
  "settings.advanced.background.code": "自定义背景代码",
  "settings.advanced.background.code.hint":
    "编写 CSS 代码来自定义背景样式，例如渐变、动画等。代码会自动保存并在每次打开应用时生效。",
  "settings.advanced.background.enable": "启用自定义背景",

  // Free layout
  "settings.advanced.freeLayout": "自由窗口排布设置",
  "settings.advanced.freeLayout.desc": "开启后可通过拖拽窗口边缘自由调整终端大小和位置",
  "settings.advanced.freeLayout.preview": "预览效果",
  "settings.advanced.freeLayout.reset": "复位",

  // Connected resize
  "settings.advanced.connectedResize": "窗口联动调整",
  "settings.advanced.connectedResize.desc": "开启后调整一个窗口大小时，相邻窗口会同步压缩或扩展，保持彼此相连无间隙",

  // Tab context menu
  "tab.rename": "重命名",
  "tab.restart": "重启终端",
  "tab.splitH": "水平分割",
  "tab.splitV": "垂直分割",
  "tab.close": "关闭",

  // Dialog
  "dialog.selectDir": "选择终端工作目录",
  "dialog.selectDirTitle": "选择工作目录",
  "dialog.quickSelect": "常用目录",
  "dialog.recentDirs": "最近使用",
  "dialog.home": "主目录",
  "dialog.desktop": "桌面",
  "dialog.documents": "文档",
  "dialog.downloads": "下载",
  "dialog.customPath": "自定义路径",
  "dialog.pathPlaceholder": "输入或粘贴目录路径...",
  "dialog.browse": "浏览",
  "dialog.cancel": "取消",
  "dialog.confirm": "确认",

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
  "about.version": "Version",

  // Settings modal
  "settings.title": "Settings",
  "settings.search": "Search settings...",
  "settings.apply": "Apply",
  "settings.ok": "OK",
  "settings.cancel": "Cancel",
  "settings.appearance": "Appearance",
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

  // Advanced settings
  "settings.advanced": "Advanced",
  "settings.advanced.background": "Custom Background",
  "settings.advanced.layout": "Window Layout",
  "settings.advanced.background.title": "Custom Background",
  "settings.advanced.background.image": "Background Image",
  "settings.advanced.background.image.choose": "Choose Image",
  "settings.advanced.background.image.remove": "Remove Image",
  "settings.advanced.background.image.hint": "Supports PNG / JPG / GIF / WebP / SVG. The image will be saved automatically.",
  "settings.advanced.background.code": "Custom Background Code",
  "settings.advanced.background.code.hint":
    "Write CSS code to customize the background style, such as gradients, animations, etc. The code is saved automatically and applied each time the app opens.",
  "settings.advanced.background.enable": "Enable Custom Background",

  // Free layout
  "settings.advanced.freeLayout": "Free Window Layout",
  "settings.advanced.freeLayout.desc": "When enabled, you can freely resize and reposition terminal windows by dragging their edges",
  "settings.advanced.freeLayout.preview": "Preview",
  "settings.advanced.freeLayout.reset": "Reset",

  // Connected resize
  "settings.advanced.connectedResize": "Connected Window Resize",
  "settings.advanced.connectedResize.desc": "When enabled, resizing one window will simultaneously push or squeeze adjacent windows, keeping them connected without gaps",

  // Tab context menu
  "tab.rename": "Rename",
  "tab.restart": "Restart Terminal",
  "tab.splitH": "Split Horizontally",
  "tab.splitV": "Split Vertically",
  "tab.close": "Close",

  // Dialog
  "dialog.selectDir": "Select Terminal Working Directory",
  "dialog.selectDirTitle": "Select Working Directory",
  "dialog.quickSelect": "Common Directories",
  "dialog.recentDirs": "Recently Used",
  "dialog.home": "Home",
  "dialog.desktop": "Desktop",
  "dialog.documents": "Documents",
  "dialog.downloads": "Downloads",
  "dialog.customPath": "Custom Path",
  "dialog.pathPlaceholder": "Type or paste a directory path...",
  "dialog.browse": "Browse",
  "dialog.cancel": "Cancel",
  "dialog.confirm": "Confirm",

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
