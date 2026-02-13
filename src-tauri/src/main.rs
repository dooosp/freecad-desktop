// Prevents additional console window on Windows in release
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::process::{Command, Child};
use std::sync::Mutex;
use tauri::Manager;

struct BackendProcess(Mutex<Option<Child>>);

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Start the Node.js backend server as a sidecar process
            let backend_dir = app.path().resource_dir()
                .unwrap_or_else(|_| std::env::current_dir().unwrap())
                .join("backend");

            // Fallback to project directory structure for development
            let server_path = if backend_dir.join("server.js").exists() {
                backend_dir.join("server.js")
            } else {
                std::env::current_dir().unwrap().join("backend").join("server.js")
            };

            let child = Command::new("node")
                .arg(&server_path)
                .spawn()
                .expect("Failed to start backend server");

            app.manage(BackendProcess(Mutex::new(Some(child))));
            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::Destroyed = event {
                // Kill backend process when window closes
                if let Some(state) = window.try_state::<BackendProcess>() {
                    if let Ok(mut guard) = state.0.lock() {
                        if let Some(mut child) = guard.take() {
                            let _ = child.kill();
                        }
                    }
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
