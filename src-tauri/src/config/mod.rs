use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub layout: LayoutConfig,
    pub shortcuts: ShortcutConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LayoutConfig {
    pub grid_cols: u32,
    pub grid_rows: u32,
    pub terminal_positions: Vec<TerminalPosition>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalPosition {
    pub id: String,
    pub slot: u32,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ShortcutConfig {
    pub new_terminal: String,
    pub close_terminal: String,
    pub next_terminal: String,
    pub prev_terminal: String,
}

impl Default for AppConfig {
    fn default() -> Self {
        AppConfig {
            theme: "dark".to_string(),
            layout: LayoutConfig {
                grid_cols: 3,
                grid_rows: 3,
                terminal_positions: vec![],
            },
            shortcuts: ShortcutConfig {
                new_terminal: "Ctrl+Shift+T".to_string(),
                close_terminal: "Ctrl+Shift+W".to_string(),
                next_terminal: "Ctrl+Tab".to_string(),
                prev_terminal: "Ctrl+Shift+Tab".to_string(),
            },
        }
    }
}

pub struct ConfigManager {
    config: AppConfig,
    config_path: PathBuf,
}

impl ConfigManager {
    pub fn new() -> Self {
        let config_path = Self::get_config_path();
        let config = Self::load_from_file(&config_path).unwrap_or_default();

        ConfigManager {
            config,
            config_path,
        }
    }

    fn get_config_path() -> PathBuf {
        let mut path = dirs::config_dir().unwrap_or_else(|| PathBuf::from("."));
        path.push("multi-window-terminal");
        fs::create_dir_all(&path).ok();
        path.push("config.json");
        path
    }

    fn load_from_file(path: &PathBuf) -> Option<AppConfig> {
        let content = fs::read_to_string(path).ok()?;
        serde_json::from_str(&content).ok()
    }

    pub fn save(&self) -> Result<(), String> {
        let content =
            serde_json::to_string_pretty(&self.config).map_err(|e| format!("Serialization error: {}", e))?;
        fs::write(&self.config_path, content).map_err(|e| format!("Write error: {}", e))
    }

    pub fn get_config(&self) -> &AppConfig {
        &self.config
    }

    pub fn update_theme(&mut self, theme: String) -> Result<(), String> {
        self.config.theme = theme;
        self.save()
    }

    pub fn update_layout(&mut self, layout: LayoutConfig) -> Result<(), String> {
        self.config.layout = layout;
        self.save()
    }

    pub fn update_terminal_positions(
        &mut self,
        positions: Vec<TerminalPosition>,
    ) -> Result<(), String> {
        self.config.layout.terminal_positions = positions;
        self.save()
    }
}
