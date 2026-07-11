use std::collections::HashMap;
use std::thread;

use tauri::{AppHandle, Emitter};

use super::pty::PtyInstance;

pub struct TerminalManager {
    terminals: HashMap<String, PtyInstance>,
    max_terminals: usize,
}

impl TerminalManager {
    pub fn new() -> Self {
        TerminalManager {
            terminals: HashMap::new(),
            max_terminals: 9,
        }
    }

    pub fn create(
        &mut self,
        id: String,
        shell: Option<String>,
        cwd: Option<String>,
        app_handle: AppHandle,
    ) -> Result<super::pty::TerminalInfo, String> {
        if self.terminals.len() >= self.max_terminals {
            return Err("Maximum number of terminals reached (9)".to_string());
        }

        let instance = PtyInstance::new(id.clone(), shell, cwd)?;
        let info = super::pty::TerminalInfo {
            id: id.clone(),
            pid: instance.pid,
            name: format!("Terminal {}", self.terminals.len() + 1),
        };

        self.terminals.insert(id.clone(), instance);

        // Spawn a thread to read output and emit events
        let tid = id.clone();
        let handle = app_handle.clone();

        thread::spawn(move || {
            // Re-create the pty reader for output streaming
            // This is a simplified approach - in production we'd use async I/O
            loop {
                // Check if the terminal still exists in manager
                // For output reading we'd need a separate reader handle
                // This is handled differently in the actual implementation
                thread::sleep(std::time::Duration::from_millis(100));

                // Emit an output event to signal activity
                let _ = handle.emit(&format!("terminal-output-{}", tid), serde_json::json!({
                    "id": tid,
                }));
            }
        });

        Ok(info)
    }

    pub fn write(&mut self, id: &str, data: &[u8]) -> Result<(), String> {
        let instance = self
            .terminals
            .get_mut(id)
            .ok_or_else(|| "Terminal not found".to_string())?;
        instance.write(data)
    }

    pub fn resize(&mut self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        let instance = self
            .terminals
            .get_mut(id)
            .ok_or_else(|| "Terminal not found".to_string())?;
        instance.resize(cols, rows)
    }

    pub fn close(&mut self, id: &str) -> Result<(), String> {
        let instance = self.terminals.remove(id);
        if let Some(mut inst) = instance {
            // Kill the child process
            let _ = inst.child.kill();
            Ok(())
        } else {
            Err("Terminal not found".to_string())
        }
    }

    pub fn list(&self) -> Vec<super::pty::TerminalInfo> {
        self.terminals
            .values()
            .map(|inst| super::pty::TerminalInfo {
                id: inst.id.clone(),
                pid: inst.pid,
                name: format!("Terminal PID:{}", inst.pid),
            })
            .collect()
    }

    pub fn get_state(&self, id: &str) -> Option<super::pty::TerminalInfo> {
        self.terminals.get(id).map(|inst| super::pty::TerminalInfo {
            id: inst.id.clone(),
            pid: inst.pid,
            name: format!("Terminal PID:{}", inst.pid),
        })
    }

    pub fn is_full(&self) -> bool {
        self.terminals.len() >= self.max_terminals
    }

    pub fn count(&self) -> usize {
        self.terminals.len()
    }
}
