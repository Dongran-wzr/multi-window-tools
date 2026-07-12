use std::collections::HashMap;
use std::io::Read;
use std::thread;

use base64::{Engine as _, engine::general_purpose};
use tauri::{AppHandle, Emitter};

use super::pty::PtyInstance;

/// Kill a process and its entire process tree on Windows.
/// On other platforms, falls back to the normal kill.
fn kill_process_tree(pid: u32) {
    #[cfg(target_os = "windows")]
    {
        // Use taskkill /F /T to forcefully terminate the process and all its children.
        // This ensures conhost.exe and any child processes are cleaned up.
        let _ = std::process::Command::new("taskkill")
            .args(["/F", "/T", "/PID", &pid.to_string()])
            .stdout(std::process::Stdio::null())
            .stderr(std::process::Stdio::null())
            .spawn();
    }
    #[cfg(not(target_os = "windows"))]
    {
        // On Unix, we rely on the child's kill() which sends SIGKILL to the
        // process group via the PTY. No separate tree-kill mechanism needed.
        let _ = pid; // suppress unused warning
    }
}

pub struct TerminalManager {
    terminals: HashMap<String, PtyInstance>,
    max_terminals: usize,
}

impl Drop for TerminalManager {
    fn drop(&mut self) {
        // Kill all remaining terminal processes when the app exits
        for (_id, mut inst) in self.terminals.drain() {
            let pid = inst.pid;
            kill_process_tree(pid);
            let _ = inst.child.kill();
            let _ = inst.child.wait();
        }
    }
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
            let pid = inst.pid;
            // First, kill the entire process tree (handles conhost.exe on Windows)
            kill_process_tree(pid);
            // Then try the normal kill as a fallback
            if let Err(e) = inst.child.kill() {
                eprintln!("Warning: failed to kill terminal {}: {}", id, e);
            }
            // Wait for the process to actually terminate
            let _ = inst.child.wait();
            Ok(())
        } else {
            Err("Terminal not found".to_string())
        }
    }

    /// Kill all remaining terminal processes (called on app shutdown)
    pub fn close_all(&mut self) {
        for (id, mut inst) in self.terminals.drain() {
            let pid = inst.pid;
            kill_process_tree(pid);
            let _ = inst.child.kill();
            let _ = inst.child.wait();
            eprintln!("Cleaned up terminal {}", id);
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
