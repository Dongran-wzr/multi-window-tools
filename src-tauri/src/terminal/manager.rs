use std::collections::HashMap;
use std::io::Read;
use std::thread;

use base64::{Engine as _, engine::general_purpose};
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

        let mut instance = PtyInstance::new(id.clone(), shell, cwd)?;
        let info = super::pty::TerminalInfo {
            id: id.clone(),
            pid: instance.pid,
            name: format!("Terminal {}", self.terminals.len() + 1),
        };

        // Take the reader before storing the instance (avoids borrow conflict)
        let mut reader = instance
            .take_reader()
            .ok_or("No PTY reader available")?;

        self.terminals.insert(id.clone(), instance);

        // Spawn a dedicated thread to read PTY output and emit events
        let tid = id.clone();
        let handle = app_handle.clone();

        thread::spawn(move || {
            let mut buf = [0u8; 4096];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => {
                        // EOF: the shell process has exited
                        let _ = handle.emit(
                            &format!("terminal-exited-{}", tid),
                            serde_json::json!({ "id": tid }),
                        );
                        break;
                    }
                    Ok(n) => {
                        let encoded = general_purpose::STANDARD.encode(&buf[..n]);
                        let _ = handle.emit(
                            &format!("terminal-output-{}", tid),
                            serde_json::json!({
                                "id": tid,
                                "data": encoded,
                            }),
                        );
                    }
                    Err(_) => {
                        // Read error: PTY closed, break the loop
                        let _ = handle.emit(
                            &format!("terminal-exited-{}", tid),
                            serde_json::json!({ "id": tid }),
                        );
                        break;
                    }
                }
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
