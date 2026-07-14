import React, { useCallback, useState, useRef, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Monitor,
  Moon,
  Sun,
  Image,
  Trash2,
  Code,
  ChevronRight,
  ToggleLeft,
  ToggleRight,
  Layout,
  Palette,
  Globe,
  Settings2,
  Search,
} from "lucide-react";
import { useTerminalStore, ThemeMode, FontLanguage, BackgroundImageData } from "../stores/terminalStore";
import { useI18n } from "../i18n/translations";
import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TreeNode {
  key: string;
  label: string;
  icon: React.ReactNode;
  children?: TreeNode[];
}

interface SettingsSnapshot {
  theme: ThemeMode;
  resolvedTheme: "dark" | "light";
  fontLanguage: FontLanguage;
  backgroundEnabled: boolean;
  backgroundImage: BackgroundImageData | null;
  backgroundCode: string;
  freeLayoutEnabled: boolean;
  connectedResizeEnabled: boolean;
}

// ─── Tree Data ────────────────────────────────────────────────────────────────

function buildTree(t: (key: string) => string): TreeNode[] {
  return [
    {
      key: "appearance",
      label: t("settings.appearance"),
      icon: <Palette size={16} />,
      children: [
        { key: "theme", label: t("settings.theme"), icon: <Sun size={16} /> },
        { key: "language", label: t("settings.language"), icon: <Globe size={16} /> },
      ],
    },
    {
      key: "advanced",
      label: t("settings.advanced"),
      icon: <Settings2 size={16} />,
      children: [
        { key: "background", label: t("settings.advanced.background"), icon: <Image size={16} /> },
        { key: "layout", label: t("settings.advanced.layout"), icon: <Layout size={16} /> },
      ],
    },
  ];
}

// ─── Shared styles (using existing CSS variables so light/dark themes work) ───

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "var(--text-primary)",
  marginBottom: "14px",
  paddingBottom: "10px",
  borderBottom: "1px solid var(--card-border)",
};

const dividerStyle: React.CSSProperties = {
  height: "1px",
  background: "var(--card-border)",
  margin: "12px 0",
};

const subtleText: React.CSSProperties = {
  fontSize: "10px",
  color: "var(--text-muted)",
  marginTop: "6px",
  lineHeight: 1.5,
};

const hintBlock: React.CSSProperties = {
  padding: "12px",
  borderRadius: "8px",
  background: "var(--bg-tertiary)",
  fontSize: "11px",
  color: "var(--text-secondary)",
  lineHeight: 1.6,
  border: "1px solid var(--card-border)",
};

// ─── Sub-components: Settings Pages ───────────────────────────────────────────

/** Theme selection cards */
const ThemePage: React.FC<{
  draftTheme: ThemeMode;
  onThemeChange: (mode: ThemeMode) => void;
  t: (key: string) => string;
}> = ({ draftTheme, onThemeChange, t }) => {
  const options: { value: ThemeMode; label: string; icon: React.ReactNode }[] = [
    { value: "dark", label: t("settings.theme.dark"), icon: <Moon size={20} /> },
    { value: "light", label: t("settings.theme.light"), icon: <Sun size={20} /> },
    { value: "system", label: t("settings.theme.system"), icon: <Monitor size={20} /> },
  ];

  return (
    <div>
      <h3 style={sectionTitleStyle}>{t("settings.theme")}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "8px" }}>
        {options.map((opt) => {
          const active = draftTheme === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onThemeChange(opt.value)}
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "8px",
                padding: "16px 8px",
                borderRadius: "10px",
                border: active ? "2px solid var(--accent)" : "2px solid var(--card-border)",
                background: active ? "var(--accent-dim)" : "var(--bg-tertiary)",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "12px",
                fontWeight: 500,
                transition: "all var(--transition-fast)",
              }}
            >
              {opt.icon}
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Language selection cards */
const LanguagePage: React.FC<{
  draftLang: FontLanguage;
  onLangChange: (lang: FontLanguage) => void;
  t: (key: string) => string;
}> = ({ draftLang, onLangChange, t }) => {
  const options: { value: FontLanguage; label: string }[] = [
    { value: "zh", label: t("settings.language.zh") },
    { value: "en", label: t("settings.language.en") },
  ];

  return (
    <div>
      <h3 style={sectionTitleStyle}>{t("settings.language")}</h3>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "8px" }}>
        {options.map((opt) => {
          const active = draftLang === opt.value;
          return (
            <button
              key={opt.value}
              onClick={() => onLangChange(opt.value)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                padding: "14px 8px",
                borderRadius: "10px",
                border: active ? "2px solid var(--accent)" : "2px solid var(--card-border)",
                background: active ? "var(--accent-dim)" : "var(--bg-tertiary)",
                color: active ? "var(--accent)" : "var(--text-secondary)",
                cursor: "pointer",
                fontSize: "13px",
                fontWeight: 500,
                transition: "all var(--transition-fast)",
              }}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

/** Toggle row: label on left, toggle switch on right */
const ToggleRow: React.FC<{
  icon: React.ReactNode;
  label: string;
  enabled: boolean;
  onChange: () => void;
}> = ({ icon, label, enabled, onChange }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      padding: "8px 0",
    }}
  >
    <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
      <span style={{ color: "var(--text-secondary)", display: "flex" }}>{icon}</span>
      <span style={{ fontSize: "13px", color: "var(--text-primary)", fontWeight: 500 }}>
        {label}
      </span>
    </div>
    <button
      onClick={onChange}
      style={{
        background: "transparent",
        border: "none",
        color: enabled ? "var(--accent)" : "var(--text-muted)",
        cursor: "pointer",
        padding: 0,
        display: "flex",
        transition: "color 0.15s",
      }}
    >
      {enabled ? <ToggleRight size={28} /> : <ToggleLeft size={28} />}
    </button>
  </div>
);

/** Background settings page — image operations are immediate (file system), code is debounced */
const BackgroundPage: React.FC<{
  bgEnabled: boolean;
  bgImage: BackgroundImageData | null;
  bgCode: string;
  onToggleEnabled: () => void;
  onImageChange: (img: BackgroundImageData | null) => void;
  onCodeChange: (code: string) => void;
  t: (key: string) => string;
}> = ({ bgEnabled, bgImage, bgCode, onToggleEnabled, onImageChange, onCodeChange, t }) => {
  const [imageLoading, setImageLoading] = useState(false);
  const codeDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (codeDebounceRef.current) clearTimeout(codeDebounceRef.current);
    };
  }, []);

  const handleChooseImage = useCallback(async () => {
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"] }],
      });
      if (!selected) return;
      setImageLoading(true);

      await invoke("save_background_image", { sourcePath: selected as string });
      const result: { mime: string; base64: string } | null = await invoke(
        "get_background_image_base64"
      );

      if (result) {
        onImageChange(result);
      }
    } catch (err) {
      console.error("Failed to set background image:", err);
    } finally {
      setImageLoading(false);
    }
  }, [onImageChange]);

  const handleRemoveImage = useCallback(async () => {
    try {
      await invoke("remove_background_image");
      onImageChange(null);
    } catch (err) {
      console.error("Failed to remove background image:", err);
    }
  }, [onImageChange]);

  const handleCodeChange = useCallback(
    (value: string) => {
      onCodeChange(value);
      if (codeDebounceRef.current) clearTimeout(codeDebounceRef.current);
      codeDebounceRef.current = setTimeout(() => {
        invoke("save_background_code", { code: value }).catch(console.error);
      }, 500);
    },
    [onCodeChange]
  );

  const previewUrl = bgImage
    ? `data:${bgImage.mime};base64,${bgImage.base64}`
    : null;

  const subLabel: React.CSSProperties = {
    fontSize: "12px",
    fontWeight: 500,
    color: "var(--text-secondary)",
    marginBottom: "10px",
    display: "flex",
    alignItems: "center",
    gap: "6px",
  };

  const actionBtn: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "6px",
    padding: "8px 12px",
    borderRadius: "8px",
    border: "1px solid var(--card-border)",
    background: "var(--bg-tertiary)",
    color: "var(--text-primary)",
    cursor: "pointer",
    fontSize: "12px",
    fontWeight: 500,
  };

  const textareaStyle: React.CSSProperties = {
    width: "100%",
    padding: "12px",
    borderRadius: "8px",
    border: "1px solid var(--card-border)",
    background: "var(--bg-primary)",
    color: "var(--text-primary)",
    fontFamily: "'Cascadia Code', 'Fira Code', 'JetBrains Mono', 'Consolas', monospace",
    fontSize: "12px",
    lineHeight: 1.6,
    resize: "vertical",
    outline: "none",
    transition: "border-color var(--transition-fast)",
  };

  return (
    <div>
      <h3 style={sectionTitleStyle}>{t("settings.advanced.background")}</h3>

      <ToggleRow
        icon={<Image size={15} />}
        label={t("settings.advanced.background.enable")}
        enabled={bgEnabled}
        onChange={onToggleEnabled}
      />

      <div style={dividerStyle} />

      {/* Background image */}
      <h4 style={subLabel}>
        <Image size={14} />
        {t("settings.advanced.background.image")}
      </h4>

      {previewUrl && (
        <div
          style={{
            width: "100%",
            height: "100px",
            borderRadius: "8px",
            overflow: "hidden",
            marginBottom: "10px",
            border: "1px solid var(--card-border)",
            background:
              "repeating-conic-gradient(var(--bg-tertiary) 0% 25%, transparent 0% 50%) 50% / 16px 16px",
          }}
        >
          <img
            src={previewUrl}
            alt="Background preview"
            style={{ width: "100%", height: "100%", objectFit: "cover" }}
          />
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <button
          onClick={handleChooseImage}
          disabled={imageLoading}
          style={{ ...actionBtn, flex: 1, opacity: imageLoading ? 0.6 : 1, cursor: imageLoading ? "wait" : "pointer" }}
        >
          <Image size={14} />
          {imageLoading ? "..." : t("settings.advanced.background.image.choose")}
        </button>
        {previewUrl && (
          <button
            onClick={handleRemoveImage}
            style={{ ...actionBtn, color: "var(--status-red)" }}
          >
            <Trash2 size={14} />
            {t("settings.advanced.background.image.remove")}
          </button>
        )}
      </div>
      <p style={subtleText}>{t("settings.advanced.background.image.hint")}</p>

      <div style={{ ...dividerStyle, margin: "16px 0" }} />

      {/* Custom background code */}
      <h4 style={subLabel}>
        <Code size={14} />
        {t("settings.advanced.background.code")}
      </h4>
      <textarea
        value={bgCode}
        onChange={(e) => handleCodeChange(e.target.value)}
        placeholder={
          '/* CSS example */\n.app-container {\n  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);\n}'
        }
        rows={6}
        style={textareaStyle}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--accent)";
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--card-border)";
        }}
      />
      <p style={subtleText}>{t("settings.advanced.background.code.hint")}</p>
    </div>
  );
};

/** Window Layout settings page */
const LayoutPage: React.FC<{
  draftFreeLayout: boolean;
  draftConnectedResize: boolean;
  onFreeLayoutChange: () => void;
  onConnectedResizeChange: () => void;
  t: (key: string) => string;
}> = ({ draftFreeLayout, draftConnectedResize, onFreeLayoutChange, onConnectedResizeChange, t }) => {
  const previewBox: React.CSSProperties = {
    margin: "8px 0 16px 26px",
    padding: "12px",
    borderRadius: "8px",
    background: "var(--bg-primary)",
    border: "1px solid var(--card-border)",
  };

  const previewLabel: React.CSSProperties = {
    fontSize: "10px",
    fontWeight: 500,
    color: "var(--text-muted)",
    marginBottom: "8px",
    display: "block",
  };

  // standard grid cell
  const cellBase: React.CSSProperties = {
    borderRadius: "3px",
    transition: "all 0.3s ease",
  };

  return (
    <div>
      <h3 style={sectionTitleStyle}>{t("settings.advanced.layout")}</h3>

      {/* Free layout toggle */}
      <ToggleRow
        icon={<Layout size={15} />}
        label={t("settings.advanced.freeLayout")}
        enabled={draftFreeLayout}
        onChange={onFreeLayoutChange}
      />
      <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "4px 0 12px 26px", lineHeight: 1.5 }}>
        {t("settings.advanced.freeLayout.desc")}
      </p>

      {/* Free layout preview */}
      <div style={previewBox}>
        <span style={previewLabel}>{t("settings.advanced.freeLayout.preview")}</span>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gridTemplateRows: "repeat(2, 1fr)",
            gap: "4px",
            height: "56px",
            position: "relative",
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                ...cellBase,
                background: draftFreeLayout ? "var(--accent-dim)" : "var(--bg-tertiary)",
                border: draftFreeLayout ? "1px solid var(--accent)" : "1px solid var(--card-border)",
                opacity: draftFreeLayout ? 0.4 : 1,
              }}
            />
          ))}
          {draftFreeLayout && (
            <motion.div
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.3, ease: [0.34, 1.56, 0.64, 1] }}
              style={{
                position: "absolute",
                left: "45%",
                top: "20%",
                width: "50%",
                height: "70%",
                borderRadius: "4px",
                background: "var(--accent)",
                opacity: 0.7,
                zIndex: 2,
                boxShadow: "0 2px 8px rgba(108,140,255,0.4)",
              }}
            >
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  bottom: 0,
                  width: "8px",
                  height: "8px",
                  background: "#fff",
                  borderRadius: "0 0 3px 0",
                  opacity: 0.6,
                }}
              />
            </motion.div>
          )}
        </div>
      </div>

      <div style={{ ...dividerStyle, margin: "8px 0" }} />

      {/* Connected resize toggle */}
      <ToggleRow
        icon={
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="2" y="3" width="9" height="8" rx="1" />
            <rect x="13" y="3" width="9" height="8" rx="1" />
            <rect x="2" y="13" width="9" height="9" rx="1" />
            <rect x="13" y="13" width="9" height="9" rx="1" />
          </svg>
        }
        label={t("settings.advanced.connectedResize")}
        enabled={draftConnectedResize}
        onChange={onConnectedResizeChange}
      />
      <p style={{ fontSize: "11px", color: "var(--text-muted)", margin: "4px 0 12px 26px", lineHeight: 1.5 }}>
        {t("settings.advanced.connectedResize.desc")}
      </p>

      {/* Connected resize preview */}
      <div style={{ ...previewBox, margin: "8px 0 0 26px" }}>
        <span style={previewLabel}>{t("settings.advanced.freeLayout.preview")}</span>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(2, 1fr)",
            gridTemplateRows: "repeat(2, 1fr)",
            gap: "3px",
            height: "56px",
            position: "relative",
          }}
        >
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              style={{
                ...cellBase,
                borderRadius: "3px",
                background: draftConnectedResize ? "var(--accent-dim)" : "var(--bg-tertiary)",
                border: draftConnectedResize ? "1px solid var(--accent)" : "1px solid var(--card-border)",
                position: "relative",
              }}
            >
              {draftConnectedResize && i === 0 && (
                <>
                  <div style={{ position: "absolute", right: -2, top: "25%", height: "50%", width: "3px", background: "var(--accent)", borderRadius: "1px", opacity: 0.7 }} />
                  <div style={{ position: "absolute", bottom: -2, left: "25%", width: "50%", height: "3px", background: "var(--accent)", borderRadius: "1px", opacity: 0.7 }} />
                </>
              )}
              {draftConnectedResize && i === 1 && (
                <div style={{ position: "absolute", bottom: -2, left: "25%", width: "50%", height: "3px", background: "var(--accent)", borderRadius: "1px", opacity: 0.7 }} />
              )}
              {draftConnectedResize && i === 2 && (
                <div style={{ position: "absolute", right: -2, top: "25%", height: "50%", width: "3px", background: "var(--accent)", borderRadius: "1px", opacity: 0.7 }} />
              )}
            </div>
          ))}
          {draftConnectedResize && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3 }}
              style={{
                position: "absolute",
                left: "50%",
                top: 0,
                bottom: 0,
                width: "4px",
                background: "var(--accent)",
                borderRadius: "2px",
                opacity: 0.8,
                transform: "translateX(-50%)",
                zIndex: 2,
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ─── Main Component ───────────────────────────────────────────────────────────

const SettingsModal: React.FC = () => {
  const { t } = useI18n();
  const settingsOpen = useTerminalStore((s) => s.settingsOpen);
  const setSettingsOpen = useTerminalStore((s) => s.setSettingsOpen);

  // ── snapshot for Cancel ──
  const snapshotRef = useRef<SettingsSnapshot | null>(null);

  // ── draft state (all simple settings) ──
  const [draftTheme, setDraftTheme] = useState<ThemeMode>("dark");
  const [draftLang, setDraftLang] = useState<FontLanguage>("zh");
  const [draftBgEnabled, setDraftBgEnabled] = useState(true);
  const [draftBgImage, setDraftBgImage] = useState<BackgroundImageData | null>(null);
  const [draftBgCode, setDraftBgCode] = useState("");
  const [draftFreeLayout, setDraftFreeLayout] = useState(false);
  const [draftConnectedResize, setDraftConnectedResize] = useState(false);

  // ── tree state ──
  const tree = useMemo(() => buildTree(t), [t]);
  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(new Set(["appearance"]));
  const [selectedKey, setSelectedKey] = useState("theme");
  const [searchQuery, setSearchQuery] = useState("");

  // ── initialize drafts when modal opens ──
  useEffect(() => {
    if (settingsOpen) {
      const s = useTerminalStore.getState();
      snapshotRef.current = {
        theme: s.theme,
        resolvedTheme: s.resolvedTheme,
        fontLanguage: s.fontLanguage,
        backgroundEnabled: s.backgroundEnabled,
        backgroundImage: s.backgroundImage,
        backgroundCode: s.backgroundCode,
        freeLayoutEnabled: s.freeLayoutEnabled,
        connectedResizeEnabled: s.connectedResizeEnabled,
      };
      setDraftTheme(s.theme);
      setDraftLang(s.fontLanguage);
      setDraftBgEnabled(s.backgroundEnabled);
      setDraftBgImage(s.backgroundImage);
      setDraftBgCode(s.backgroundCode);
      setDraftFreeLayout(s.freeLayoutEnabled);
      setDraftConnectedResize(s.connectedResizeEnabled);
    }
  }, [settingsOpen]);

  // ── apply helper: push drafts to store + persist to backend ──
  const applyDrafts = useCallback(async () => {
    const store = useTerminalStore.getState();

    // Theme
    store.setTheme(draftTheme);
    if (draftTheme !== "system") {
      store.setResolvedTheme(draftTheme);
      document.documentElement.setAttribute("data-theme", draftTheme);
    } else {
      const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
      const resolved = prefersDark ? "dark" : "light";
      store.setResolvedTheme(resolved);
      document.documentElement.setAttribute("data-theme", resolved);
    }
    invoke("save_theme", { theme: draftTheme }).catch(console.error);

    // Language
    store.setFontLanguage(draftLang);

    // Background enabled
    store.setBackgroundEnabled(draftBgEnabled);
    invoke("save_background_enabled", { enabled: draftBgEnabled }).catch(console.error);

    // Background code
    store.setBackgroundCode(draftBgCode);
    invoke("save_background_code", { code: draftBgCode }).catch(console.error);

    // Background image — store reference already up to date from immediate ops
    if (draftBgImage !== store.backgroundImage) {
      store.setBackgroundImage(draftBgImage);
    }

    // Free layout
    store.setFreeLayoutEnabled(draftFreeLayout);
    if (!draftFreeLayout && draftConnectedResize) {
      setDraftConnectedResize(false);
      store.setConnectedResizeEnabled(false);
    }

    // Connected resize
    store.setConnectedResizeEnabled(draftConnectedResize);
    if (draftConnectedResize && !draftFreeLayout) {
      setDraftFreeLayout(true);
      store.setFreeLayoutEnabled(true);
    }

    // Update snapshot so subsequent Cancels revert to this applied state
    const s = useTerminalStore.getState();
    snapshotRef.current = {
      theme: s.theme,
      resolvedTheme: s.resolvedTheme,
      fontLanguage: s.fontLanguage,
      backgroundEnabled: s.backgroundEnabled,
      backgroundImage: s.backgroundImage,
      backgroundCode: s.backgroundCode,
      freeLayoutEnabled: s.freeLayoutEnabled,
      connectedResizeEnabled: s.connectedResizeEnabled,
    };
  }, [
    draftTheme, draftLang, draftBgEnabled, draftBgImage, draftBgCode,
    draftFreeLayout, draftConnectedResize,
  ]);

  // ── button handlers ──
  const handleApply = useCallback(async () => {
    await applyDrafts();
  }, [applyDrafts]);

  const handleOk = useCallback(async () => {
    await applyDrafts();
    setSettingsOpen(false);
  }, [applyDrafts, setSettingsOpen]);

  const handleCancel = useCallback(() => {
    const snap = snapshotRef.current;
    if (snap) {
      const store = useTerminalStore.getState();
      store.setTheme(snap.theme);
      store.setResolvedTheme(snap.resolvedTheme);
      store.setFontLanguage(snap.fontLanguage);
      store.setBackgroundEnabled(snap.backgroundEnabled);
      store.setBackgroundImage(snap.backgroundImage);
      store.setBackgroundCode(snap.backgroundCode);
      store.setFreeLayoutEnabled(snap.freeLayoutEnabled);
      store.setConnectedResizeEnabled(snap.connectedResizeEnabled);
      document.documentElement.setAttribute("data-theme", snap.resolvedTheme);
    }
    setSettingsOpen(false);
  }, [setSettingsOpen]);

  // ── tree interaction ──
  const toggleExpand = useCallback((key: string) => {
    setExpandedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const selectNode = useCallback((key: string, node: TreeNode) => {
    setSelectedKey(key);
    if (node.children && node.children.length > 0) {
      setExpandedKeys((prev) => {
        const next = new Set(prev);
        if (next.has(key)) next.delete(key);
        else next.add(key);
        return next;
      });
    }
  }, []);

  // ── search filtering ──
  const filteredTree = useMemo(() => {
    if (!searchQuery.trim()) return tree;
    const q = searchQuery.toLowerCase();
    const filterNode = (nodes: TreeNode[]): TreeNode[] => {
      const result: TreeNode[] = [];
      for (const node of nodes) {
        const labelMatch = node.label.toLowerCase().includes(q);
        const filteredChildren = node.children ? filterNode(node.children) : [];
        if (labelMatch || filteredChildren.length > 0) {
          result.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children });
        }
      }
      return result;
    };
    return filterNode(tree);
  }, [tree, searchQuery]);

  // Auto-expand all parent nodes when searching
  const effectiveExpanded = useMemo(() => {
    if (searchQuery.trim()) {
      const allKeys = new Set<string>();
      const collectKeys = (nodes: TreeNode[]) => {
        for (const node of nodes) {
          if (node.children) {
            allKeys.add(node.key);
            collectKeys(node.children);
          }
        }
      };
      collectKeys(filteredTree);
      return allKeys;
    }
    return expandedKeys;
  }, [searchQuery, expandedKeys, filteredTree]);

  // ── highlight search matches ──
  const highlightMatch = (text: string, query: string): React.ReactNode => {
    if (!query.trim()) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span style={{ background: "var(--status-yellow)", color: "#1a1d23", borderRadius: "2px", padding: "0 1px" }}>
          {text.slice(idx, idx + query.length)}
        </span>
        {text.slice(idx + query.length)}
      </>
    );
  };

  // ── render right panel content ──
  const renderContent = () => {
    const heading: React.CSSProperties = {
      fontSize: "16px", fontWeight: 600, color: "var(--text-primary)", margin: 0,
    };

    switch (selectedKey) {
      case "appearance":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <h2 style={heading}>{t("settings.appearance")}</h2>
            <ThemePage draftTheme={draftTheme} onThemeChange={setDraftTheme} t={t} />
            <LanguagePage draftLang={draftLang} onLangChange={setDraftLang} t={t} />
            <div style={hintBlock}>
              <p>
                <strong style={{ color: "var(--text-primary)" }}>{t("settings.shortcuts.title")}:</strong>{" "}
                {t("settings.shortcuts.content")}
              </p>
              <p style={{ marginTop: "4px" }}>{t("settings.hint")}</p>
            </div>
          </div>
        );
      case "theme":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <h2 style={heading}>{t("settings.theme")}</h2>
            <ThemePage draftTheme={draftTheme} onThemeChange={setDraftTheme} t={t} />
          </div>
        );
      case "language":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <h2 style={heading}>{t("settings.language")}</h2>
            <LanguagePage draftLang={draftLang} onLangChange={setDraftLang} t={t} />
          </div>
        );
      case "advanced":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <h2 style={heading}>{t("settings.advanced")}</h2>
            <BackgroundPage
              bgEnabled={draftBgEnabled} bgImage={draftBgImage} bgCode={draftBgCode}
              onToggleEnabled={() => setDraftBgEnabled(!draftBgEnabled)}
              onImageChange={setDraftBgImage} onCodeChange={setDraftBgCode} t={t}
            />
            <LayoutPage
              draftFreeLayout={draftFreeLayout} draftConnectedResize={draftConnectedResize}
              onFreeLayoutChange={() => {
                const next = !draftFreeLayout;
                setDraftFreeLayout(next);
                if (!next && draftConnectedResize) setDraftConnectedResize(false);
              }}
              onConnectedResizeChange={() => {
                const next = !draftConnectedResize;
                setDraftConnectedResize(next);
                if (next && !draftFreeLayout) setDraftFreeLayout(true);
              }}
              t={t}
            />
          </div>
        );
      case "background":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <h2 style={heading}>{t("settings.advanced.background")}</h2>
            <BackgroundPage
              bgEnabled={draftBgEnabled} bgImage={draftBgImage} bgCode={draftBgCode}
              onToggleEnabled={() => setDraftBgEnabled(!draftBgEnabled)}
              onImageChange={setDraftBgImage} onCodeChange={setDraftBgCode} t={t}
            />
          </div>
        );
      case "layout":
        return (
          <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
            <h2 style={heading}>{t("settings.advanced.layout")}</h2>
            <LayoutPage
              draftFreeLayout={draftFreeLayout} draftConnectedResize={draftConnectedResize}
              onFreeLayoutChange={() => {
                const next = !draftFreeLayout;
                setDraftFreeLayout(next);
                if (!next && draftConnectedResize) setDraftConnectedResize(false);
              }}
              onConnectedResizeChange={() => {
                const next = !draftConnectedResize;
                setDraftConnectedResize(next);
                if (next && !draftFreeLayout) setDraftFreeLayout(true);
              }}
              t={t}
            />
          </div>
        );
      default:
        return null;
    }
  };

  // ── flatten filtered tree for rendering, respecting expand/collapse ──
  const flatTreeNodes = useMemo(() => {
    const result: { node: TreeNode; depth: number }[] = [];
    const walk = (nodes: TreeNode[], depth: number) => {
      for (const node of nodes) {
        result.push({ node, depth });
        if (node.children && effectiveExpanded.has(node.key)) {
          walk(node.children, depth + 1);
        }
      }
    };
    walk(filteredTree, 0);
    return result;
  }, [filteredTree, effectiveExpanded]);

  // ── tree node style generators ──
  const treeNodeStyle = (isSelected: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "6px",
    padding: "5px 12px",
    cursor: "pointer",
    color: isSelected ? "var(--text-primary)" : "var(--text-secondary)",
    background: isSelected ? "var(--accent-dim)" : "transparent",
    borderLeft: isSelected ? "3px solid var(--accent)" : "3px solid transparent",
    fontSize: "13px",
    fontWeight: isSelected ? 500 : 400,
    minHeight: "30px",
    transition: "background 0.1s, border-color 0.1s",
    userSelect: "none",
  });

  // ── modal ──
  return (
    <AnimatePresence>
      {settingsOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            onClick={handleCancel}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.5)",
              zIndex: 150,
            }}
          />

          {/* Dialog container */}
          <div
            style={{
              position: "fixed",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 160,
              width: "840px",
              maxWidth: "92vw",
              height: "580px",
              maxHeight: "85vh",
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{
                type: "spring",
                stiffness: 350,
                damping: 20,
                mass: 0.8,
              }}
              className="glass card"
              style={{
                width: "100%",
                height: "100%",
                display: "flex",
                flexDirection: "column",
                overflow: "hidden",
              }}
            >
              {/* ── Header with search ── */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  padding: "12px 16px",
                  borderBottom: "1px solid var(--card-border)",
                  gap: "12px",
                  flexShrink: 0,
                }}
              >
                <span style={{ fontSize: "15px", fontWeight: 600, color: "var(--text-primary)", whiteSpace: "nowrap" }}>
                  {t("settings.title")}
                </span>
                <div
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    background: "var(--bg-tertiary)",
                    borderRadius: "8px",
                    border: "1px solid var(--card-border)",
                    padding: "4px 10px",
                    gap: "8px",
                    maxWidth: "360px",
                    marginLeft: "auto",
                  }}
                >
                  <Search size={14} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={t("settings.search")}
                    style={{
                      background: "transparent",
                      border: "none",
                      outline: "none",
                      color: "var(--text-primary)",
                      fontSize: "13px",
                      width: "100%",
                      fontFamily: "inherit",
                    }}
                  />
                  {searchQuery && (
                    <button
                      onClick={() => setSearchQuery("")}
                      style={{
                        background: "transparent",
                        border: "none",
                        color: "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        padding: 0,
                      }}
                    >
                      <X size={14} />
                    </button>
                  )}
                </div>
              </div>

              {/* ── Body: tree + content ── */}
              <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
                {/* Left tree panel */}
                <div
                  style={{
                    width: "220px",
                    flexShrink: 0,
                    borderRight: "1px solid var(--card-border)",
                    overflowY: "auto",
                    padding: "8px 0",
                  }}
                >
                  {flatTreeNodes.map(({ node, depth }) => {
                    const isExpanded = effectiveExpanded.has(node.key);
                    const isSelected = selectedKey === node.key;
                    const hasChildren = node.children && node.children.length > 0;
                    const isSearching = searchQuery.trim().length > 0;

                    return (
                      <div
                        key={node.key}
                        onClick={() => selectNode(node.key, node)}
                        style={{
                          ...treeNodeStyle(isSelected),
                          paddingLeft: `${12 + depth * 18}px`,
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) {
                            (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)";
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) {
                            (e.currentTarget as HTMLElement).style.background = "transparent";
                          }
                        }}
                      >
                        {/* Expand/collapse arrow */}
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleExpand(node.key);
                          }}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            width: "16px",
                            height: "16px",
                            flexShrink: 0,
                            transition: "transform 0.15s",
                            transform: isExpanded ? "rotate(90deg)" : "rotate(0deg)",
                            opacity: hasChildren ? 0.6 : 0,
                          }}
                        >
                          <ChevronRight size={12} />
                        </span>
                        {/* Icon */}
                        <span style={{ display: "flex", alignItems: "center", opacity: 0.7, flexShrink: 0 }}>
                          {node.icon}
                        </span>
                        {/* Label */}
                        <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {isSearching ? highlightMatch(node.label, searchQuery) : node.label}
                        </span>
                      </div>
                    );
                  })}
                </div>

                {/* Right content panel */}
                <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
                  {renderContent()}
                </div>
              </div>

              {/* ── Footer buttons ── */}
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "flex-end",
                  gap: "8px",
                  padding: "12px 16px",
                  borderTop: "1px solid var(--card-border)",
                  flexShrink: 0,
                }}
              >
                <button
                  onClick={handleApply}
                  style={{
                    padding: "7px 20px",
                    borderRadius: "8px",
                    border: "1px solid var(--card-border)",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                    transition: "background var(--transition-fast)",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-tertiary)"; }}
                >
                  {t("settings.apply")}
                </button>
                <button
                  onClick={handleOk}
                  style={{
                    padding: "7px 20px",
                    borderRadius: "8px",
                    border: "1px solid var(--accent)",
                    background: "var(--accent)",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                    transition: "background var(--transition-fast)",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--accent-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--accent)"; }}
                >
                  {t("settings.ok")}
                </button>
                <button
                  onClick={handleCancel}
                  style={{
                    padding: "7px 20px",
                    borderRadius: "8px",
                    border: "1px solid var(--card-border)",
                    background: "var(--bg-tertiary)",
                    color: "var(--text-primary)",
                    cursor: "pointer",
                    fontSize: "13px",
                    fontWeight: 500,
                    transition: "background var(--transition-fast)",
                    fontFamily: "inherit",
                  }}
                  onMouseEnter={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-hover)"; }}
                  onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.background = "var(--bg-tertiary)"; }}
                >
                  {t("settings.cancel")}
                </button>
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
};

export default SettingsModal;
