use std::sync::Mutex;

use crate::config::ConfigManager;
use crate::terminal::manager::TerminalManager;

pub struct AppState {
    pub terminal_manager: Mutex<TerminalManager>,
    pub config_manager: Mutex<ConfigManager>,
}

impl AppState {
    pub fn new() -> Self {
        AppState {
            terminal_manager: Mutex::new(TerminalManager::new()),
            config_manager: Mutex::new(ConfigManager::new()),
        }
    }
}
