use std::io::{Read, Write};

use portable_pty::{CommandBuilder, PtySize, native_pty_system};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TerminalInfo {
    pub id: String,
    pub pid: u32,
    pub name: String,
}

pub struct PtyInstance {
    pub id: String,
    pub pid: u32,
    pub reader: Option<Box<dyn Read + Send>>,
    pub writer: Box<dyn Write + Send>,
    pub child: Box<dyn portable_pty::Child + Send>,
    // We keep the master handle for resize and to ensure the pty stays alive
    master: Box<dyn portable_pty::MasterPty + Send>,
}

impl PtyInstance {
    pub fn new(id: String, shell: Option<String>, cwd: Option<String>) -> Result<Self, String> {
        let pty_system = native_pty_system();

        let mut cmd = CommandBuilder::new(
            shell.unwrap_or_else(|| {
                #[cfg(target_os = "windows")]
                {
                    "powershell.exe".to_string()
                }
                #[cfg(not(target_os = "windows"))]
                {
                    std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string())
                }
            }),
        );

        if let Some(cwd_path) = cwd {
            cmd.cwd(cwd_path);
        }

        let pty_pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Failed to open PTY: {}", e))?;

        let child = pty_pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| format!("Failed to spawn command: {}", e))?;

        let pid = child.process_id();

        let writer = pty_pair.master.take_writer().map_err(|e| format!("Failed to take writer: {}", e))?;

        let reader = pty_pair
            .master
            .try_clone_reader()
            .map_err(|e| format!("Failed to clone reader: {}", e))?;

        Ok(PtyInstance {
            id,
            pid: pid.unwrap_or(0),
            reader: Some(reader),
            writer,
            child,
            master: pty_pair.master,
        })
    }

    pub fn write(&mut self, data: &[u8]) -> Result<(), String> {
        self.writer
            .write_all(data)
            .map_err(|e| format!("Write error: {}", e))
    }

    pub fn take_reader(&mut self) -> Option<Box<dyn Read + Send>> {
        self.reader.take()
    }

    pub fn resize(&mut self, cols: u16, rows: u16) -> Result<(), String> {
        self.master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| format!("Resize error: {}", e))
    }

    pub fn is_alive(&mut self) -> bool {
        // Check if the child process is still running
        match self.child.try_wait() {
            Ok(None) => true,   // Still running
            Ok(Some(_)) => false, // Exited
            Err(_) => false,    // Error checking
        }
    }
}
