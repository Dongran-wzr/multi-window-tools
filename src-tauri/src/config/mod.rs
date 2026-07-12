use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub theme: String,
    pub layout: LayoutConfig,
    pub shortcuts: ShortcutConfig,
    #[serde(default)]
    pub advanced: AdvancedConfig,
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

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AdvancedConfig {
    /// Relative path to background image inside the config directory (e.g. "background/image.png")
    #[serde(default)]
    pub background_image_path: Option<String>,
    /// Custom CSS code injected as background
    #[serde(default)]
    pub background_code: String,
    /// Whether the custom background is enabled
    #[serde(default = "default_background_enabled")]
    pub background_enabled: bool,
}

fn default_background_enabled() -> bool {
    true
}

impl Default for AdvancedConfig {
    fn default() -> Self {
        AdvancedConfig {
            background_image_path: None,
            background_code: String::new(),
            background_enabled: true,
        }
    }
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
            advanced: AdvancedConfig::default(),
        }
    }
}

pub struct ConfigManager {
    config: AppConfig,
    config_path: PathBuf,
    config_dir: PathBuf,
}

impl ConfigManager {
    pub fn new() -> Self {
        let config_path = Self::get_config_path();
        let config_dir = config_path.parent().unwrap_or_else(|| std::path::Path::new(".")).to_path_buf();
        let config = Self::load_from_file(&config_path).unwrap_or_default();

        ConfigManager {
            config,
            config_path,
            config_dir,
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

    // ---- Advanced settings ----

    /// Get the background sub-directory inside the config directory
    pub fn get_background_dir(&self) -> PathBuf {
        let mut dir = self.config_dir.clone();
        dir.push("background");
        dir
    }

    /// Copy an image file from source_path into the config/background directory.
    /// Returns the absolute path of the copied file.
    pub fn save_background_image(&mut self, source_path: &str) -> Result<String, String> {
        let source = PathBuf::from(source_path);
        if !source.exists() {
            return Err(format!("Source file does not exist: {}", source_path));
        }

        // Determine extension from source file
        let ext = source
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("png");

        let bg_dir = self.get_background_dir();
        fs::create_dir_all(&bg_dir).map_err(|e| format!("Failed to create background dir: {}", e))?;

        let dest_filename = format!("image.{}", ext);
        let dest_path = bg_dir.join(&dest_filename);

        // Remove old background images with different extensions
        if let Ok(entries) = fs::read_dir(&bg_dir) {
            for entry in entries.flatten() {
                let name = entry.file_name();
                let name_str = name.to_string_lossy();
                if name_str.starts_with("image.") && name_str != dest_filename {
                    fs::remove_file(entry.path()).ok();
                }
            }
        }

        fs::copy(&source, &dest_path).map_err(|e| format!("Failed to copy image: {}", e))?;

        // Store relative path: "background/image.{ext}"
        let relative_path = format!("background/{}", dest_filename);
        self.config.advanced.background_image_path = Some(relative_path.clone());
        self.config.advanced.background_enabled = true;
        self.save()?;

        // Return absolute path for frontend use with convertFileSrc
        Ok(dest_path.to_string_lossy().to_string())
    }

    /// Remove the background image and clear the setting.
    pub fn remove_background_image(&mut self) -> Result<(), String> {
        let bg_dir = self.get_background_dir();
        if bg_dir.exists() {
            // Remove all image.* files
            if let Ok(entries) = fs::read_dir(&bg_dir) {
                for entry in entries.flatten() {
                    let name = entry.file_name();
                    let name_str = name.to_string_lossy();
                    if name_str.starts_with("image.") {
                        fs::remove_file(entry.path()).ok();
                    }
                }
            }
        }

        self.config.advanced.background_image_path = None;
        self.save()
    }

    /// Get the absolute path to the background image file, if it exists.
    pub fn get_background_image_abs_path(&self) -> Option<String> {
        if let Some(ref relative) = self.config.advanced.background_image_path {
            let abs = self.config_dir.join(relative);
            if abs.exists() {
                return Some(abs.to_string_lossy().to_string());
            }
        }
        None
    }

    /// Read the background image file and return its content as base64-encoded data URL.
    /// Returns (mime_type, base64_data).
    pub fn read_background_image_base64(&self) -> Option<(String, String)> {
        let abs_path = self.get_background_image_abs_path()?;
        let data = fs::read(&abs_path).ok()?;

        // Determine MIME type from extension
        let mime = {
            let path = PathBuf::from(&abs_path);
            match path.extension().and_then(|e| e.to_str()) {
                Some("jpg") | Some("jpeg") => "image/jpeg",
                Some("png") => "image/png",
                Some("gif") => "image/gif",
                Some("webp") => "image/webp",
                Some("bmp") => "image/bmp",
                Some("svg") => "image/svg+xml",
                _ => "image/png",
            }
        };

        let base64 = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data);
        Some((mime.to_string(), base64))
    }

    pub fn update_background_code(&mut self, code: String) -> Result<(), String> {
        self.config.advanced.background_code = code;
        self.save()
    }

    pub fn update_background_enabled(&mut self, enabled: bool) -> Result<(), String> {
        self.config.advanced.background_enabled = enabled;
        self.save()
    }

    pub fn get_advanced_config(&self) -> &AdvancedConfig {
        &self.config.advanced
    }
}
