mod config;
mod state;
mod terminal;

use state::AppState;
use uuid::Uuid;

#[tauri::command]
fn create_terminal(
    state: tauri::State<'_, AppState>,
    app_handle: tauri::AppHandle,
    shell: Option<String>,
    cwd: Option<String>,
) -> Result<serde_json::Value, String> {
    let mut manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;

    if manager.is_full() {
        return Err("Maximum number of terminals reached (9)".to_string());
    }

    let id = Uuid::new_v4().to_string();

    let info = manager.create(id.clone(), shell, cwd, app_handle)?;

    Ok(serde_json::json!({
        "terminal_id": info.id,
        "pid": info.pid,
    }))
}

#[tauri::command]
fn write_to_terminal(
    state: tauri::State<'_, AppState>,
    id: String,
    data: String,
) -> Result<(), String> {
    let mut manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.write(&id, data.as_bytes())
}

#[tauri::command]
fn resize_terminal(
    state: tauri::State<'_, AppState>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    let mut manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.resize(&id, cols, rows)
}

#[tauri::command]
fn close_terminal(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<(), String> {
    let mut manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    manager.close(&id)
}

#[tauri::command]
fn list_terminals(
    state: tauri::State<'_, AppState>,
) -> Result<Vec<terminal::pty::TerminalInfo>, String> {
    let manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.list())
}

#[tauri::command]
fn get_terminal_state(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<Option<terminal::pty::TerminalInfo>, String> {
    let manager = state.terminal_manager.lock().map_err(|e| e.to_string())?;
    Ok(manager.get_state(&id))
}

#[tauri::command]
fn get_config(
    state: tauri::State<'_, AppState>,
) -> Result<config::AppConfig, String> {
    let config_manager = state.config_manager.lock().map_err(|e| e.to_string())?;
    Ok(config_manager.get_config().clone())
}

#[tauri::command]
fn save_theme(
    state: tauri::State<'_, AppState>,
    theme: String,
) -> Result<(), String> {
    let mut config_manager = state.config_manager.lock().map_err(|e| e.to_string())?;
    config_manager.update_theme(theme)
}

#[tauri::command]
fn save_layout(
    state: tauri::State<'_, AppState>,
    terminal_positions: Vec<config::TerminalPosition>,
) -> Result<(), String> {
    let mut config_manager = state.config_manager.lock().map_err(|e| e.to_string())?;
    config_manager.update_terminal_positions(terminal_positions)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .manage(AppState::new())
        .invoke_handler(tauri::generate_handler![
            create_terminal,
            write_to_terminal,
            resize_terminal,
            close_terminal,
            list_terminals,
            get_terminal_state,
            get_config,
            save_theme,
            save_layout,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
